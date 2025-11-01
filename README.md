CyberShield Russia (КиберЩит)

Портал кибербезопасности: новости, погода, AI-ассистент. Легальный, образовательный и безопасный.
Быстрый старт (Windows 10)

    Установите Node.js LTS
    Клонируйте/создайте структуру папок, вставьте файлы из инструкции
    В папке api создайте .env:

NEWS_API_KEY=your_new_newsapi_key
GNEWS_API_KEY=your_new_gnews_key
OPENWEATHER_API_KEY=your_new_openweather_key
OPENROUTER_API_KEY=your_new_openrouter_key
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000

    Установите зависимости и запустите сервер:

cd api
npm install
npm run dev

    Откройте сайт:
    http://localhost:3000

Стек

    Frontend: HTML5, Tailwind (CDN), JS (ES6)
    Backend: Node.js + Express, Axios, Helmet, Rate limit
    Интеграции: NewsAPI, GNews (опционально), OpenWeatherMap, OpenRouter (AI)

Структура

    /api — backend
    /js — фронтенд скрипты (новости, погода, AI)
    /css — стили и конфиг Tailwind (для будущей сборки)
    /assets — картинки/шрифты

Безопасность

    Ключи только в .env (не хранить на фронтенде)
    Helmet, CORS, rate limiting
    Сервер-прокси скрывает секреты

SEO

    Семантический HTML
    Open Graph
    robots.txt, sitemap.xml
    Lazy loading картинок

Многоязычность

    RU/EN/中文 — переключатель
    Простая i18n-таблица в main.js (можно расширять)

Ограничения

    Без Dark Web и нелегальных материалов
    Только образовательный контент
