/* /api/captcha/config — отдаём публичный site key и провайдера (для клиентской загрузки) */
const express = require('express');
const router = express.Router();

router.get('/config', (req, res) => {
  const provider = (process.env.CAPTCHA_PROVIDER || '').toLowerCase(); // 'recaptcha' | 'hcaptcha'
  const siteKey = process.env.CAPTCHA_SITE_KEY || '';
  const enabled = !!(provider && siteKey);
  res.json({ enabled, provider, siteKey });
});

module.exports = router;