/* Reports (без БД): приём сообщений + honeypot/тайминг + (опц.) reCAPTCHA/hCaptcha
   Надёжное сохранение: JSON → fallback в NDJSON при ошибке.
   Действия админа: hide/unhide (PATCH), delete (DELETE). */
const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const axios = require('axios');

const router = express.Router();

const DATA_DIR = path.resolve(path.join(__dirname, '..', 'data'));
const FILE_JSON = path.join(DATA_DIR, 'reports.json');    // основной JSON-массив
const FILE_NDJSON = path.join(DATA_DIR, 'reports.ndjson'); // резервная лента

(async () => {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    if (!fs.existsSync(FILE_JSON)) await fsp.writeFile(FILE_JSON, '[]', 'utf8');
    if (!fs.existsSync(FILE_NDJSON)) await fsp.writeFile(FILE_NDJSON, '', 'utf8');
  } catch (e) {
    console.error('[reports:init] FS prepare error:', e.message);
  }
})();

const ADMIN_KEY = process.env.ADMIN_REPORTS_KEY || '';

const CAPTCHA_PROVIDER = (process.env.CAPTCHA_PROVIDER || '').toLowerCase(); // 'recaptcha' | 'hcaptcha'
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || '';
const CAPTCHA_MIN_SCORE = Number(process.env.CAPTCHA_MIN_SCORE || '0.5');

function isAdmin(req) {
  const k = (req.query.key || req.headers['x-admin-key'] || '').toString();
  return !!ADMIN_KEY && k === ADMIN_KEY;
}

function sanitize(s) { return typeof s === 'string' ? s.replace(/[<>]/g, '').trim().slice(0, 2000) : ''; }
function validatePayload(b) {
  const allowed = ['call','sms','site','social','other'];
  if (!allowed.includes(b.type)) return 'Некорректный тип';
  if (!b.target || b.target.trim().length < 3) return 'Укажите номер/ссылку/аккаунт';
  if (!b.description || b.description.trim().length < 10) return 'Добавьте подробности (минимум 10 символов)';
  return null;
}
function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

async function readAll() {
  try {
    const raw = await fsp.readFile(FILE_JSON, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[reports] readAll JSON error:', e.message);
    return [];
  }
}
async function writeAll(list) {
  const body = JSON.stringify(list, null, 2);
  await fsp.writeFile(FILE_JSON, body, 'utf8');
}
async function appendNdjson(doc) {
  try { await fsp.appendFile(FILE_NDJSON, JSON.stringify(doc) + '\n', 'utf8'); }
  catch (e) { console.error('[reports] appendNdjson error:', e.message); }
}

async function verifyCaptcha(token, ip) {
  if (!CAPTCHA_PROVIDER || !CAPTCHA_SECRET) return { ok: true, reason: 'disabled' };
  if (!token) return { ok: false, reason: 'missing_token' };
  try {
    if (CAPTCHA_PROVIDER === 'recaptcha') {
      const params = new URLSearchParams();
      params.append('secret', CAPTCHA_SECRET);
      params.append('response', token);
      if (ip) params.append('remoteip', ip);
      const { data } = await axios.post('https://www.google.com/recaptcha/api/siteverify', params, {
        timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      const ok = !!data.success && (typeof data.score === 'number' ? data.score >= CAPTCHA_MIN_SCORE : true);
      return { ok, score: data.score || 0 };
    }
    if (CAPTCHA_PROVIDER === 'hcaptcha') {
      const params = new URLSearchParams();
      params.append('secret', CAPTCHA_SECRET);
      params.append('response', token);
      const { data } = await axios.post('https://hcaptcha.com/siteverify', params, {
        timeout: 10000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      return { ok: !!data.success };
    }
    return { ok: true };
  } catch (e) {
    console.warn('[reports] captcha verify error:', e.message);
    return { ok: true, reason: 'verify_error' };
  }
}

// Парсеры тела
router.use(express.urlencoded({ extended: false, limit: '32kb' }));
router.use(express.json({ limit: '32kb' }));

// Создать отчёт
router.post('/', async (req, res) => {
  try {
    const b = req.body || {};
    const pick = (names) => { for (const k of names) if (b[k] !== undefined && b[k] !== null && String(b[k]).length) return String(b[k]); return ''; };

    // Honeypot + тайминг
    const hp = pick(['_hp','hp_field','website']);
    const took = Number(pick(['_ts','hp_time']) || 0);
    if (hp && hp.length > 0) return res.json({ ok: true, id: 'ok' });
    if (!Number.isFinite(took) || took < 1200) return res.json({ ok: true, id: 'ok' });

    // Капча (если включена)
    const captchaToken = pick(['_captcha','recaptchaToken','g-recaptcha-response','h-captcha-response']);
    const cap = await verifyCaptcha(captchaToken, req.ip);
    if (!cap.ok) return res.status(400).json({ error: 'captcha_failed' });

    const payload = {
      id: makeId(),
      createdAt: new Date().toISOString(),
      ip: req.ip,
      type: sanitize(b.type),
      target: sanitize(b.target),
      description: sanitize(b.description),
      contact: sanitize(b.contact || ''),
      hidden: false
    };
    const vr = validatePayload(payload);
    if (vr) return res.status(400).json({ error: vr });

    // Пишем в JSON, при ошибке — в NDJSON
    let stored = 'json';
    try {
      const list = await readAll();
      list.unshift(payload);
      const final = list.slice(0, 5000);
      await writeAll(final);
    } catch (e) {
      stored = 'ndjson';
      console.error('[reports] writeAll error:', e.message);
      await appendNdjson(payload);
    }
    return res.status(201).json({ ok: true, id: payload.id, stored });
  } catch (e) {
    console.error('reports POST error (fatal):', e);
    res.status(500).json({ error: 'Не удалось сохранить отчёт' });
  }
});

// Список (админ)
router.get('/', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0 || limit > 500) limit = 200;
    const list = await readAll();
    res.json(list.slice(0, limit));
  } catch (e) {
    console.error('reports GET error:', e.message);
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

// Один (админ)
router.get('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const id = String(req.params.id || '');
    const list = await readAll();
    const item = list.find(x => x.id === id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    console.error('reports GET/:id error:', e.message);
    res.status(500).json({ error: 'Ошибка чтения' });
  }
});

// Скрыть/показать (админ)
router.patch('/:id/hide', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const id = String(req.params.id || '');
    const hidden = (req.body && (req.body.hidden === true || req.body.hidden === 'true' || req.body.hidden === '1'));
    const list = await readAll();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    list[idx].hidden = hidden;
    await writeAll(list);
    res.json({ ok: true, id, hidden });
  } catch (e) {
    console.error('reports PATCH hide error:', e.message);
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// Удалить (админ)
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const id = String(req.params.id || '');
    const list = await readAll();
    const idx = list.findIndex(x => x.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not found' });
    const removed = list.splice(idx, 1)[0];
    await writeAll(list);
    res.json({ ok: true, id, removed: !!removed });
  } catch (e) {
    console.error('reports DELETE error:', e.message);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

module.exports = router;