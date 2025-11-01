/* Погода: текущая + прогноз 5 дней через OpenWeatherMap */
const express = require('express');
const axios = require('axios');
const router = express.Router();

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';

function ensureCoords(query) {
  const lat = parseFloat(query.lat);
  const lon = parseFloat(query.lon);
  if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  // Москва по умолчанию
  return { lat: 55.7558, lon: 37.6173 };
}

router.get('/current', async (req, res) => {
  try {
    const { lat, lon } = ensureCoords(req.query);
    const lang = (req.query.lang || 'ru').toLowerCase();
    const units = (req.query.units || 'metric');

    const { data } = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { lat, lon, appid: OPENWEATHER_API_KEY, units, lang }
    });

    res.json(data);
  } catch (e) {
    console.error('weather/current error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Ошибка получения текущей погоды' });
  }
});

router.get('/forecast', async (req, res) => {
  try {
    const { lat, lon } = ensureCoords(req.query);
    const lang = (req.query.lang || 'ru').toLowerCase();
    const units = (req.query.units || 'metric');

    const { data } = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params: { lat, lon, appid: OPENWEATHER_API_KEY, units, lang, cnt: 40 }
    });
    res.json(data);
  } catch (e) {
    console.error('weather/forecast error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Ошибка получения прогноза погоды' });
  }
});

module.exports = router;