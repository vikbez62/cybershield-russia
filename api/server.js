/* Backend сервер: API-прокси + сжатие + долгий кэш для статики + SPA fallback */
const path = require('path');
const fs = require('fs');
const express = require('express');
const dotenv = require('dotenv');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');

// Безопасность
app.disable('x-powered-by');
app.set('etag', 'weak'); // ETag по умолчанию (можно 'strong' по желанию)

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://www.google.com", "https://js.hcaptcha.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https://openrouter.ai", "https://api.openweathermap.org", "https://newsapi.org", "https://gnews.io"],
      frameSrc: ["https://www.google.com", "https://js.hcaptcha.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Логи
app.use(morgan('dev'));

// Принудительный HTTPS redirect на Render
app.use((req, res, next) => {
  // Проверяем, что мы на production (Render) и запрос пришёл по HTTP
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  
  if (isProduction && proto !== 'https') {
    return res.redirect(301, `https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

// CORS
const origins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: function (origin, cb) {
    if (!origin || origins.length === 0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  }
}));

// Сжатие (gzip/deflate/br при поддержке клиента)
app.use(compression({
  threshold: 1024, // >1KB
  filter: (req, res) => {
    // Не сжимаем ответы, если клиент явно не хочет
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Парсинг тела
app.use(express.json({ limit: '1mb' }));

// Лимиты на /api
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false
});
app.use('/api', apiLimiter);

// Маршруты API
const newsRouter = require('./routes/news');
const weatherRouter = require('./routes/weather');
const aiRouter = require('./routes/ai');
const rssRouter = require('./routes/rss');
const reportsRouter = require('./routes/reports');
const captchaRouter = require('./routes/captcha');

app.use('/api/news', newsRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/ai', aiRouter);
app.use('/api/rss', rssRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/captcha', captchaRouter);

// (Необязательно) «чистим» корень от случайных GET c query (?type=sms&...)
// Если вы используете поиск на сайте через ?q= — эту часть не включайте.
/*
app.get('/', (req, res, next) => {
  if (Object.keys(req.query || {}).length) return res.redirect(302, '/');
  next();
});
*/

// Раздача статики с «долгим» кэшем
// ВНИМАНИЕ: index.html всегда без кэша (ниже).
const setCache = (res, maxAgeSec, immutable = false) => {
  const val = `public, max-age=${maxAgeSec}${immutable ? ', immutable' : ''}`;
  res.setHeader('Cache-Control', val);
};

// Precompress middleware: отдача предварительно сжатых .br/.gz файлов
function precompressMiddleware(rootDir) {
  // Простое определение MIME-типа по расширению
  const mimeTypes = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
  };

  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    
    const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();
    if (!acceptEncoding || (!acceptEncoding.includes('br') && !acceptEncoding.includes('gzip'))) {
      return next();
    }

    const filePath = path.join(rootDir, req.path);
    
    // Проверяем существование исходного файла
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return next();
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // Приоритет: br > gzip
    if (acceptEncoding.includes('br')) {
      const brPath = filePath + '.br';
      if (fs.existsSync(brPath)) {
        res.setHeader('Content-Encoding', 'br');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Type', contentType);
        return res.sendFile(brPath);
      }
    }

    if (acceptEncoding.includes('gzip')) {
      const gzPath = filePath + '.gz';
      if (fs.existsSync(gzPath)) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Type', contentType);
        return res.sendFile(gzPath);
      }
    }

    next();
  };
}

// /assets — обычно картинки/шрифты: 30 дней + immutable
app.use('/assets', precompressMiddleware(path.join(ROOT, 'assets')));
app.use('/assets', express.static(path.join(ROOT, 'assets'), {
  fallthrough: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => setCache(res, 60 * 60 * 24 * 30, true) // 30d
}));

// /css — tw.css/style.css: 7 дней (без immutable, т.к. имя файла не содержит хэша)
app.use('/css', precompressMiddleware(path.join(ROOT, 'css')));
app.use('/css', express.static(path.join(ROOT, 'css'), {
  fallthrough: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => setCache(res, 60 * 60 * 24 * 7) // 7d
}));

// /js — скрипты: 1 день (чтобы изменения быстрее подтягивались)
app.use('/js', precompressMiddleware(path.join(ROOT, 'js')));
app.use('/js', express.static(path.join(ROOT, 'js'), {
  fallthrough: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => setCache(res, 60 * 60 * 24) // 1d
}));

// Корень (robots.txt, sitemap.xml, admin.html и др.) — стандартная статика
app.use(express.static(ROOT, {
  fallthrough: true,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Для HTML — без кэша, для остального — мягкий кэш
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    } else {
      setCache(res, 60 * 60 * 24 * 3); // 3d по умолчанию
    }
  }
}));

// SPA fallback: только GET, не /api/*, без расширения — отдаём index.html (без кэша)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return next();
  if (path.extname(req.path)) return next(); // есть расширение => это файл

  res.setHeader('Cache-Control', 'no-store, max-age=0'); // чтобы апдейты были видны сразу
  return res.sendFile(path.join(ROOT, 'index.html'));
});

// Health-check (по желанию)
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`CyberShield Russia running on http://localhost:${PORT}`);
});