/* AI чат через OpenRouter (законопослушный консультант по кибербезопасности) */
const express = require('express');
const axios = require('axios');
const router = express.Router();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

router.post('/chat', async (req, res) => {
  try {
    if (!OPENROUTER_API_KEY) {
      return res.status(503).json({ error: 'AI не настроен: добавьте OPENROUTER_API_KEY в .env' });
    }
    const { message, locale = 'ru' } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Отсутствует текст сообщения' });
    }

    const systemRu = 'Ты законопослушный помощник по кибербезопасности. Помогай гражданам РФ защищаться от мошенников, фишинга и спама. Не давай инструкции по взлому или незаконным действиям.';
    const systemEn = 'You are a lawful cybersecurity assistant. Help users avoid scams and phishing. Never provide hacking instructions or unlawful guidance.';
    const system = locale.startsWith('ru') ? systemRu : systemEn;

    const { data } = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openrouter/auto',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message }
      ],
      temperature: 0.2,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'CyberShield Russia'
      },
      timeout: 20000
    });

    const text = data?.choices?.[0]?.message?.content?.trim() || 'Нет ответа.';
    res.json({ reply: text });
  } catch (e) {
    console.error('ai/chat error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Ошибка общения с AI' });
  }
});

module.exports = router;