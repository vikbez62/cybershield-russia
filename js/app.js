// js/app.js — тема, i18n, формат даты
var Store = {
  get: function (k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : (def === undefined ? null : def); }
    catch (e) { return (def === undefined ? null : def); }
  },
  set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

function setTheme(mode) {
  var root = document.documentElement;
  if (mode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
  try { localStorage.setItem('theme', JSON.stringify(mode)); } catch(e) {}
  var btn = document.getElementById('themeToggle');
  if (btn) {
    btn.textContent = mode === 'dark' ? '🌙' : '☀️';
    btn.setAttribute('aria-label', mode === 'dark' ? 'Тёмная тема' : 'Светлая тема');
  }
}
function toggleTheme() { var cur = Store.get('theme', 'dark'); setTheme(cur === 'dark' ? 'light' : 'dark'); }

var i18n = {
  ru: { nav_news: 'Новости', nav_learn: 'Обучение', nav_tools: 'Инструменты', nav_about: 'О нас',
        hero_sub: 'Следите за новостями кибербезопасности, получайте советы и общайтесь с AI‑ассистентом.' },
  en: { nav_news: 'News', nav_learn: 'Learn', nav_tools: 'Tools', nav_about: 'About',
        hero_sub: 'Follow cybersecurity news, get tips, and chat with the AI assistant.' },
  zh: { nav_news: '新闻', nav_learn: '学习', nav_tools: '工具', nav_about: '关于',
        hero_sub: '关注网络安全新闻，获取建议，并与AI助手聊天。' }
};

function applyI18n(lang) {
  var dict = i18n[lang] || i18n.ru;
  var nodes = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i], key = el.getAttribute('data-i18n');
    if (dict[key]) el.textContent = dict[key];
  }
  Store.set('lang', lang);
}

// Глобально для news.js
function formatDate(iso) {
  var d = new Date(iso);
  var lang = Store.get('lang', 'ru') || 'ru';
  try { return d.toLocaleString(lang); } catch (e) { return d.toLocaleString(); }
}

document.addEventListener('DOMContentLoaded', function () {
  setTheme(Store.get('theme', 'dark'));
  var themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  var langSel = document.getElementById('langSelect');
  var lang = Store.get('lang', 'ru');
  if (langSel) {
    langSel.value = lang; applyI18n(langSel.value);
    langSel.addEventListener('change', function (e) { applyI18n(e.target.value); });
  } else {
    applyI18n(lang);
  }
});