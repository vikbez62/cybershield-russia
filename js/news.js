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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // таймаут 15 секунд
      
      const res = await fetch(url, { 
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        console.warn('fetch failed:', url, 'HTTP', res.status);
        return [];
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn('fetch returned non-array:', url, typeof data);
        return [];
      }
      return data.length > 0 ? data : [];
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('fetch error:', url, e.message);
      }
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
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'text-secondary text-sm';
      emptyMsg.textContent = 'Пока нет новостей. Попробуйте позже.';
      box.appendChild(emptyMsg);
      return;
    }
    for (const a of list) {
      const imgSrc = (a.imageUrl || PLACEHOLDER).replace(/"/g, '&quot;');
      const dmn = getDomain(a.url || '') || '';
      const item = document.createElement('article');
      item.className = 'card';
      
      const img = document.createElement('img');
      img.className = 'card-img';
      img.src = imgSrc;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function() { this.onerror = null; this.src = PLACEHOLDER; };
      
      const cardBody = document.createElement('div');
      cardBody.className = 'card-body';
      
      const link = document.createElement('a');
      link.href = (a.url || '#').replace(/"/g, '&quot;');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'card-title hover:underline';
      link.textContent = a.title || 'Без названия';
      
      const desc = document.createElement('div');
      desc.className = 'card-desc text-secondary mt-1';
      desc.textContent = (a.description || '').slice(0, 180) + '...';
      
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const metaText = document.createTextNode((a.source || '') + (dmn ? ' • ' : ''));
      meta.appendChild(metaText);
      if (dmn) {
        const domainSpan = document.createElement('span');
        domainSpan.className = 'tag tag-domain';
        domainSpan.textContent = dmn;
        meta.appendChild(domainSpan);
        meta.appendChild(document.createTextNode(' • '));
      }
      meta.appendChild(document.createTextNode(safeFormatDate(a.publishedAt || new Date().toISOString())));
      
      cardBody.appendChild(link);
      cardBody.appendChild(desc);
      cardBody.appendChild(meta);
      
      item.appendChild(img);
      item.appendChild(cardBody);
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
      if (cached && !force && cached.length > 0) {
        render(cached, containerId);
        loaded.add(key);
        // Фоновое обновление если кэш есть
        setTimeout(async () => {
          try {
            const urlsWithForce = urls.map(u => applyForce(u, u.startsWith('/api/rss')));
            const fresh = await fetchWithFallback(urlsWithForce);
            if (fresh.length > 0) {
              setCache(key, fresh);
              render(fresh, containerId);
            }
          } catch (e) {
            console.warn('Background refresh failed:', key, e.message);
          }
        }, 500);
        return;
      }
      
      // Показываем скелетон при первой загрузке или принудительном обновлении
      if (!cached || force) {
        renderSkeleton(containerId, 6);
      }
      
      const urlsWithForce = urls.map(u => applyForce(u, force && u.startsWith('/api/rss')));
      const fresh = await fetchWithFallback(urlsWithForce);
      
      if (fresh.length > 0) {
        setCache(key, fresh);
        render(fresh, containerId);
      } else if (!cached || cached.length === 0) {
        render([], containerId);
      }
      
      loaded.add(key);
    } catch (e) {
      console.error('load error:', key, e);
      // Показываем кэш даже при ошибке, если есть
      const cached = getCache(key);
      if (cached && cached.length > 0) {
        render(cached, containerId);
      } else {
        render([], containerId);
      }
      loaded.add(key);
    }
  }

  function setBtnBusy(btn, busy) {
    if (!btn) return;
    btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  function init() {
    // Первичная загрузка - все секции сразу
    load('global', ['/api/rss/global', '/api/news/global'], 'news-global');
    // Загружаем все страны: ru, by, kp, cn
    ['ru', 'by', 'kp', 'cn'].forEach(c => load(c, [`/api/rss/country/${c}`, `/api/news/country/${c}`], `news-${c}`));

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