/* RSS-агрегатор: легальные источники по кибербезопасности с кэшированием и форс-обновлением */
const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const Parser = require('rss-parser');

const router = express.Router();

const parser = new Parser({
  requestOptions: {
    timeout: 15000,
    headers: { 'User-Agent': 'CyberShield-RSS/1.0 (+https://cybershield-russia.onrender.com)' }
  }
});

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

const memoryCache = new Map();
const TTL = 30 * 60 * 1000;
const CACHE_DIR = path.join(__dirname, '..', 'cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getMem(key) {
  const v = memoryCache.get(key);
  return (v && (Date.now() - v.ts) < TTL) ? v.data : null;
}
function setMem(key, data) { memoryCache.set(key, { data, ts: Date.now() }); }

function filePath(key) { return path.join(CACHE_DIR, `${key}.rss.json`); }
async function getDisk(key) { try { return JSON.parse(await fsp.readFile(filePath(key), 'utf8')); } catch { return null; } }
async function setDisk(key, data) { try { await fsp.writeFile(filePath(key), JSON.stringify(data), 'utf8'); } catch {} }

// Улучшенный извлекатель изображений
function fromMedia(item) {
  // media:content может быть объектом или массивом
  const mc = item['media:content'];
  if (mc) {
    if (Array.isArray(mc) && mc.length) return mc[0].url || mc[0]['@_url'] || '';
    if (typeof mc === 'object') return mc.url || mc['@_url'] || '';
  }
  const mt = item['media:thumbnail'];
  if (mt) {
    if (Array.isArray(mt) && mt.length) return mt[0].url || mt[0]['@_url'] || '';
    if (typeof mt === 'object') return mt.url || mt['@_url'] || '';
  }
  // enclosure также бывает массивом
  const enc = item.enclosure || item.enclosures;
  if (enc) {
    if (Array.isArray(enc) && enc.length) return enc[0].url || '';
    if (typeof enc === 'object') return enc.url || '';
  }
  return '';
}

function extractFirstImage(html) {
  if (!html) return '';
  // Пытаемся забрать srcset/data-src/data-lazy-src/src
  const srcset = html.match(/(?:srcset|data-srcset)=["']([^"']+)["']/i);
  if (srcset && srcset[1]) {
    // берем первый URL до пробела/запятой
    const first = srcset[1].split(',')[0].trim().split(' ')[0].trim();
    if (first) return first;
  }
  const dataLazy = html.match(/data-lazy-src=["']([^"']+)["']/i);
  if (dataLazy) return dataLazy[1];
  const dataSrc = html.match(/data-src=["']([^"']+)["']/i);
  if (dataSrc) return dataSrc[1];
  const src = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (src) return src[1];
  return '';
}

function stripHtml(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }

function normalize(feedTitle, items) {
  return (items || []).map(item => {
    const mediaUrl = fromMedia(item);
    const html = item['content:encoded'] || item.content || '';
    const firstImg = extractFirstImage(html);
    const image = mediaUrl || firstImg || '';

    const desc = stripHtml(item.contentSnippet || html || item.summary || '');
    return {
      title: item.title || 'Без названия',
      description: desc.slice(0, 400),
      url: item.link,
      imageUrl: image,
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
  const results = await Promise.allSettled(list.map(fetchFeed));
  let merged = [];
  for (const r of results) if (r.status === 'fulfilled') merged = merged.concat(r.value);
  if (!merged.length) {
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

router.get('/custom', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Укажите ?url=' });
  const data = await fetchFeed({ url, source: 'Custom' });
  res.json(data);
});

module.exports = router;
