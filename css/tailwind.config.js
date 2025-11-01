module.exports = {
darkMode: 'class',
content: ['./index.html', './js/**/*.js'],
theme: {
extend: {
colors: {
base: '#0F172A',
accent: '#3B82F6',
success: '#10B981',
warn: '#F59E0B',
danger: '#EF4444'
},
fontFamily: {
sans: ['Inter', 'ui-sans-serif', 'system-ui'],
display: ['Montserrat', 'Inter', 'ui-sans-serif'],
mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular']
}
}
},
plugins: []
};

4.4 js/main.js

// Тема, i18n и утилиты
const Store = {
get(k, def = null) {
try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
},
set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

function setTheme(mode) {
const root = document.documentElement;
if (mode === 'dark') root.classList.add('dark'); else root.classList.remove('dark');
Store.set('theme', mode);
}
function toggleTheme() { setTheme(Store.get('theme', 'dark') === 'dark' ? 'light' : 'dark'); }

const i18n = {
ru: {
nav_news: 'Новости', nav_learn: 'Обучение', nav_tools: 'Инструменты', nav_about: 'О нас',
hero_sub: 'Следите за новостями кибербезопасности, получайте советы и общайтесь с AI-ассистентом.'
},
en: {
nav_news: 'News', nav_learn: 'Learn', nav_tools: 'Tools', nav_about: 'About',
hero_sub: 'Follow cybersecurity news, get tips, and chat with the AI assistant.'
},
zh: {
nav_news: '新闻', nav_learn: '学习', nav_tools: '工具', nav_about: '关于',
hero_sub: '关注网络安全新闻，获取建议，并与AI助手聊天。'
}
};

function applyI18n(lang) {
const dict = i18n[lang] || i18n.ru;
document.querySelectorAll('[data-i18n]').forEach(el => {
const key = el.getAttribute('data-i18n');
if (dict[key]) el.textContent = dict[key];
});
Store.set('lang', lang);
}

function formatDate(iso) {
const d = new Date(iso);
return d.toLocaleString(Store.get('lang', 'ru'));
}

document.addEventListener('DOMContentLoaded', () => {
// Тема
setTheme(Store.get('theme', 'dark'));
document.getElementById('themeToggle').addEventListener('click', toggleTheme);

// Язык
const langSel = document.getElementById('langSelect');
langSel.value = Store.get('lang', 'ru');
applyI18n(langSel.value);
langSel.addEventListener('change', e => applyI18n(e.target.value));
});