/* RSS-агрегатор: легальные источники по кибербезопасности с кэшированием и форс-обновлением */
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const Parser = require('rss-parser');

const router = express.Router();

// RSS Parser с явным User-Agent
const parser = new Parser({
  requestOptions: {
    timeout: 15000,
    headers: { 'User-Agent': 'CyberShield-RSS/1.0 (+http://localhost:3000)' }
  }
});

// Источники
const FEEDS = {
  global: [
    { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News' },
    { url: 'https://krebsonsecurity.com/feed/', source: 'KrebsOnSecurity' },
    { url: 'https://www.bleepingcomputer.com/feed/', source: 'BleepingComputer' },
    { url: 'https://securelist.com/feed/', source: 'Kaspersky Securelist' },
    { url: 'https://msrc-blog.microsoft.com/feed/', source: 'MSRC Blog' },
    { url: 'https://www.darkreading.com/rss.xml', source: 'Dark Reading' }
  ],
  ru: [
    { url: 'https://securelist.com/feed/', source: 'Kaspersky Securelist' },
    { url: 'https://habr.com/ru/rss/hub/infosecurity/?fl=ru', source: 'Habr/Информационная безопасность' }
  ],
  cn: [
    { url: 'https://www.freebuf.com/feed', source: 'FreeBuf' }
  ],
  by: [
    { url: 'https://habr.com/ru/rss/hub/infosecurity/?fl=ru', source: 'Habr/Информационная безопасность' }
  ],
  kp: [
    { url: 'https://feeds.feedburner.com/TheHackersNews', source: 'The Hacker News' }
  ]
};

// Кэш: память + диск
const memoryCache = new Map(); // key -> { data, ts }
const TTL = 30 * 60 * 1000; // 30 минут
const CACHE_DIR = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getMem(key) {
  const v = memoryCache.get(key);
  if (v && (Date.now() - v.ts) < TTL) return v.data;
  return null;
}
function setMem(key, data) { memoryCache.set(key, { data, ts: Date.now() }); }

function filePath(key) { return path.join(CACHE_DIR, `${key}.rss.json`); }
async function getDisk(key) { try { return JSON.parse(await fsp.readFile(filePath(key), 'utf8')); } catch { return null; } }
async function setDisk(key, data) { try { await fsp.writeFile(filePath(key), JSON.stringify(data), 'utf8'); } catch {} }

function stripHtml(s) { return (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
function extractFirstImage(html) {
  const m = (html || '').match(/<img[^>]+src=["']?([^"'>\s]+)["']?/i);
  return m ? m[1] : '';
}
function normalize(feedTitle, items) {
  return (items || []).map(item => {
    const image = item.enclosure?.url || extractFirstImage(item['content:encoded'] || item.content || item.contentSnippet);
    const desc = stripHtml(item.contentSnippet || item['content:encoded'] || item.content || '');
    return {
      title: item.title || 'Без названия',
      description: desc.slice(0, 400),
      url: item.link,
      imageUrl: image || '',
      source: item.creator || item.author || feedTitle || 'Источник',
      publishedAt: item.isoDate || item.pubDate || new Date().toISOString()
    };
  });
}
async function fetchFeed(feed) {
  try {
    const data = await parser.parseURL(feed.url);
    const title = feed.source || data.title || 'Источник';
    return normalize(title, data.items || []);
  } catch (e) {
    console.warn('RSS fetch failed:', feed.url, e.message);
    return [];
  }
}
function dedupe(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = (a.url || '') + (a.title || '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function aggregate(key, list, limit = 40, force = false) {
  if (!force) {
    const mem = getMem(key);
    if (mem) return mem;
    const disk = await getDisk(key);
    if (disk) return disk;
  }

  // Форс-обновление или отсутствие кэша — тянем из сети
  const results = await Promise.allSettled(list.map(fetchFeed));
  let merged = [];
  for (const r of results) if (r.status === 'fulfilled') merged = merged.concat(r.value);

  if (merged.length === 0) {
    // При фейле вернём диск даже при force, чтобы не пустить ленту
    const disk = await getDisk(key);
    return disk || [];
  }

  merged = dedupe(merged)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, limit);

  setMem(key, merged);
  await setDisk(key, merged);
  return merged;
}

// Маршруты
router.get('/global', async (req, res) => {
  const force = String(req.query.force || '') === '1';
  const data = await aggregate('rss_global', FEEDS.global, 40, force);
  res.json(data);
});

router.get('/country/:code', async (req, res) => {
  const code = (req.params.code || '').toLowerCase();
  const force = String(req.query.force || '') === '1';
  const feeds = FEEDS[code] || FEEDS.global;
  const data = await aggregate(`rss_${code}`, feeds, 30, force);
  res.json(data);
});

// Разовый парсинг произвольной ленты
router.get('/custom', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Укажите ?url=' });
  const list = await fetchFeed({ url, source: 'Custom' });
  res.json(list);
});

module.exports = router;