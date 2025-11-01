// js/news.js — RSS → fallback на /api/news, кэш, скелетон и форс‑обновление по кнопке + подсветка домена
const News = (() => {
  const TTL = 10 * 60 * 1000; // 10 минут
  const INITIAL_COUNTRIES = ['ru'];
  const loaded = new Set();
  const PLACEHOLDER = '/assets/images/placeholder.svg';

  function safeFormatDate(iso) {
    try { if (typeof formatDate === 'function') return formatDate(iso); } catch (e) {}
    const d = new Date(iso);
    try { return d.toLocaleString((localStorage.getItem('lang')||'"ru"').replace(/"/g,'')); }
    catch { return d.toLocaleString(); }
  }
  function getDomain(u){ try { return new URL(u).hostname.replace(/^www\./,''); } catch(e){ return ''; } }

  async function fetchJson(url) {
    try {
      const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn('fetch failed:', url, e.message);
      return [];
    }
  }
  async function fetchWithFallback(urls) {
    for (const u of urls) {
      const data = await fetchJson(u);
      if (data && data.length > 0) return data;
    }
    return [];
  }

  function cacheKey(key) { return `news_${key}`; }
  function getCache(key) {
    try {
      const v = JSON.parse(localStorage.getItem(cacheKey(key)) || 'null');
      if (v && (Date.now() - v.ts) < TTL) return v.data;
      return null;
    } catch { return null; }
  }
  function setCache(key, data) {
    try { localStorage.setItem(cacheKey(key), JSON.stringify({ data, ts: Date.now() })); } catch {}
  }

  // Скелетон
  function renderSkeleton(containerId, count = 6) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const item = document.createElement('article');
      item.className = 'card';
      item.innerHTML = `
        <div class="skeleton-thumb"></div>
        <div class="card-body">
          <div class="skeleton-line" style="width: 80%;"></div>
          <div class="skeleton-line" style="width: 100%;"></div>
          <div class="skeleton-line" style="width: 50%;"></div>
        </div>
      `;
      box.appendChild(item);
    }
  }

  function render(list, containerId) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = '';
    if (!list || list.length === 0) {
      box.innerHTML = '<div class="text-secondary text-sm">Пока нет новостей. Попробуйте позже.</div>';
      return;
    }
    for (const a of list) {
      const imgSrc = a.imageUrl || PLACEHOLDER;
      const dmn = getDomain(a.url || '') || '';
      const item = document.createElement('article');
      item.className = 'card';
      item.innerHTML = `
        <img class="card-img" src="${imgSrc}" alt="" loading="lazy"
             onerror="this.onerror=null; this.src='${PLACEHOLDER}';">
        <div class="card-body">
          <a href="${a.url}" target="_blank" rel="noopener" class="card-title hover:underline">${a.title}</a>
          <div class="card-desc text-secondary mt-1">${(a.description || '').slice(0, 180)}...</div>
          <div class="card-meta">
            ${a.source || ''} ${dmn ? '• <span class="tag tag-domain">'+dmn+'</span>' : ''} • ${safeFormatDate(a.publishedAt || new Date().toISOString())}
          </div>
        </div>
      `;
      box.appendChild(item);
    }
  }

  function applyForce(url, force) {
    if (!force) return url;
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + 'force=1';
  }

  async function load(key, urls, containerId, force = false) {
    try {
      const cached = getCache(key);
      if (cached && !force) {
        render(cached, containerId);
      } else {
        renderSkeleton(containerId, 6);
      }
      const urlsWithForce = urls.map(u => applyForce(u, force && u.startsWith('/api/rss')));
      const fresh = await fetchWithFallback(urlsWithForce);
      if (fresh.length > 0) {
        setCache(key, fresh);
        render(fresh, containerId);
      } else if (!cached) {
        render([], containerId);
      }
      loaded.add(key);
    } catch (e) {
      console.error('load error:', e);
    }
  }

  function setBtnBusy(btn, busy) {
    if (!btn) return;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function init() {
    // Первичная загрузка
    load('global', ['/api/rss/global', '/api/news/global'], 'news-global');
    ['ru'].forEach(c => load(c, [`/api/rss/country/${c}`, `/api/news/country/${c}`], `news-${c}`));

    // Обновить глобальные
    const refreshBtn = document.getElementById('refreshGlobal');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        setBtnBusy(refreshBtn, true);
        renderSkeleton('news-global', 6);
        await load('global', ['/api/rss/global', '/api/news/global'], 'news-global', true);
        setBtnBusy(refreshBtn, false);
      });
    }

    // Обновить страны
    document.querySelectorAll('.btn-mini[data-country]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const c = btn.getAttribute('data-country');
        setBtnBusy(btn, true);
        renderSkeleton(`news-${c}`, 4);
        await load(c, [`/api/rss/country/${c}`, `/api/news/country/${c}`], `news-${c}`, true);
        setBtnBusy(btn, false);
      });
    });

    // Автообновление каждые 30 минут — только загруженные
    setInterval(() => {
      if (loaded.has('global')) load('global', ['/api/rss/global', '/api/news/global'], 'news-global');
      ['ru','cn','by','kp'].forEach(c => {
        if (loaded.has(c)) load(c, [`/api/rss/country/${c}`, `/api/news/country/${c}`], `news-${c}`);
      });
    }, 30 * 60 * 1000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => News.init());