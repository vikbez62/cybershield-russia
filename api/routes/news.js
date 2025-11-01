/* Новости: прокси к NewsAPI (и опционально GNews) с кэшированием и устойчивым фолбэком */
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const router = express.Router();

const NEWS_API_KEY = process.env.NEWS_API_KEY || '';
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || '';

const memoryCache = new Map(); // key -> { data, ts }
const TTL = 45 * 60 * 1000; // 45 минут — меньше шансов упереться в лимиты
let BACKOFF_UNTIL = 0; // при 429 включаем «глухую оборону» на 1 час

const CACHE_DIR = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getMem(key) {
  const v = memoryCache.get(key);
  if (v && (Date.now() - v.ts) < TTL) return v.data;
  return null;
}
function setMem(key, data) { memoryCache.set(key, { data, ts: Date.now() }); }

function filePath(key) { return path.join(CACHE_DIR, `${key}.json`); }
async function getDisk(key) {
  try { return JSON.parse(await fsp.readFile(filePath(key), 'utf8')); } catch { return null; }
}
async function setDisk(key, data) {
  try { await fsp.writeFile(filePath(key), JSON.stringify(data), 'utf8'); } catch (e) { console.warn('disk cache write fail:', e.message); }
}

function normalizeArticles(items = []) {
  return items
    .filter(Boolean)
    .map(a => ({
      title: a.title || a.name || 'Без названия',
      description: a.description || a.content || '',
      url: a.url,
      imageUrl: a.urlToImage || a.image || '',
      source: (a.source && (a.source.name || a.source.title)) || a.publisher || 'Источник',
      publishedAt: a.publishedAt || a.published || new Date().toISOString()
    }));
}

async function newsEverything(params) {
  if (!NEWS_API_KEY) return [];
  const { data } = await axios.get('https://newsapi.org/v2/everything', {
    params: { apiKey: NEWS_API_KEY, pageSize: 30, sortBy: 'publishedAt', ...params },
    timeout: 15000
  });
  return normalizeArticles(data.articles || []);
}

async function gnewsSearch(params) {
  if (!GNEWS_API_KEY) return [];
  const { data } = await axios.get('https://gnews.io/api/v4/search', {
    params: { token: GNEWS_API_KEY, max: 20, lang: params.lang || 'ru', ...params },
    timeout: 15000
  });
  return normalizeArticles(data.articles || []);
}

function dedupe(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = (a.title || '') + (a.url || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function underBackoff() {
  return Date.now() < BACKOFF_UNTIL;
}

async function safeNewsEverything(q) {
  try {
    return await newsEverything(q);
  } catch (e) {
    if (e?.response?.status === 429) {
      BACKOFF_UNTIL = Date.now() + 60 * 60 * 1000; // час
      console.warn('NewsAPI rate limit, backoff 1h');
    }
    console.error('newsEverything error:', e?.response?.data || e.message);
    return [];
  }
}

async function safeGnews(q) {
  try {
    return await gnewsSearch(q);
  } catch (e) {
    console.error('gnews error:', e?.response?.data || e.message);
    return [];
  }
}

// Глобальные новости по кибербезопасности (несколько языков)
router.get('/global', async (req, res) => {
  const key = 'global';

  // Память
  const mem = getMem(key);
  if (mem) return res.json(mem);

  // Бэкоф после 429 — сразу отдаём диск, чтобы не молотить API
  if (underBackoff()) {
    const disk = await getDisk(key);
    return res.json(disk || []);
  }

  try {
    const queries = [
      { q: '(cybersecurity OR "cyber attack" OR phishing OR ransomware)', language: 'en' },
      { q: '(кибербезопасность OR кибератака OR фишинг OR мошенники)', language: 'ru' },
      { q: '(网络安全 OR 网络攻击 OR 钓鱼 OR 勒索软件)', language: 'zh' },
    ];

    const newsResults = await Promise.all(queries.map(safeNewsEverything));
    const gRes = await safeGnews({ q: 'кибербезопасность OR кибератака', lang: 'ru' });

    const merged = dedupe([].concat(...newsResults, gRes)).slice(0, 40);

    if (merged.length > 0) {
      setMem(key, merged);
      await setDisk(key, merged);
      return res.json(merged);
    }

    // если пусто — пробуем диск
    const disk = await getDisk(key);
    return res.json(disk || []);
  } catch (e) {
    console.error('news/global fatal:', e?.response?.data || e.message);
    const disk = await getDisk(key);
    return res.json(disk || []); // не 500, а пустой/кэш
  }
});

// Новости по странам: ru | cn | by | kp
router.get('/country/:code', async (req, res) => {
  const { code } = req.params;
  const key = `country_${code}`;

  const mem = getMem(key);
  if (mem) return res.json(mem);

  if (underBackoff()) {
    const disk = await getDisk(key);
    return res.json(disk || []);
  }

  const map = {
    ru: { q: '(кибербезопасность OR мошенники OR фишинг OR "колл-центр")', language: 'ru' },
    by: { q: '(Беларусь AND (кибербезопасность OR мошенники))', language: 'ru' },
    cn: { q: '(中国 OR 中国网) AND (网络安全 OR 诈骗)', language: 'zh' },
    kp: { q: '(North Korea OR DPRK) AND (cybersecurity OR hacking OR phishing)', language: 'en' }
  };

  try {
    const params = map[code] || { q: 'cybersecurity', language: 'en' };
    const articles = await safeNewsEverything(params);
    let merged = articles;

    // подмешиваем GNews для ru/by как фолбэк
    if ((code === 'ru' || code === 'by') && (!articles || articles.length < 10)) {
      const g = await safeGnews({ q: params.q, lang: 'ru' });
      merged = dedupe([...(articles || []), ...g]).slice(0, 30);
    }

    if (merged.length > 0) {
      setMem(key, merged);
      await setDisk(key, merged);
      return res.json(merged);
    }

    const disk = await getDisk(key);
    return res.json(disk || []);
  } catch (e) {
    console.error(`news/country/${code} fatal:`, e?.response?.data || e.message);
    const disk = await getDisk(key);
    return res.json(disk || []);
  }
});

module.exports = router;