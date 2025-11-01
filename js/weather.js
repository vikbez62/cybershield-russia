// Виджет погоды: независимая загрузка current и forecast + вежливые ошибки
const Weather = (() => {
  function iconFor(code) {
    if (code >= 200 && code < 300) return '⛈️';
    if (code >= 300 && code < 600) return '🌧️';
    if (code >= 600 && code < 700) return '❄️';
    if (code >= 700 && code < 800) return '🌫️';
    if (code === 800) return '☀️';
    if (code > 800) return '⛅';
    return '🌡️';
  }

  async function fetchJson(url) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      console.warn('weather fetch failed:', url, e.message);
      return null;
    }
  }

  async function getWeather(lat, lon) {
    const lang = (localStorage.getItem('lang') || '"ru"').replace(/"/g,'') || 'ru';
    const params = `lat=${lat}&lon=${lon}&lang=${lang}&units=metric`;
    const [curP, foreP] = await Promise.allSettled([
      fetchJson(`/api/weather/current?${params}`),
      fetchJson(`/api/weather/forecast?${params}`)
    ]);
    return {
      current: curP.status === 'fulfilled' ? curP.value : null,
      forecast: foreP.status === 'fulfilled' ? foreP.value : null
    };
  }

  function renderCurrent(data) {
    const wrap = document.getElementById('weather-current');
    if (!wrap) return;
    if (!data || !data.weather || !data.main) {
      wrap.innerHTML = '<div class="text-sm text-gray-400">Текущая погода недоступна</div>';
      return;
    }
    const w = data.weather[0];
    wrap.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="text-3xl">${iconFor(w.id)}</div>
        <div>
          <div class="text-xl font-display">${Math.round(data.main.temp)}°C • ${w.description}</div>
          <div class="text-sm text-gray-300">${data.name || '—'}</div>
        </div>
      </div>
    `;
  }

  function renderForecast(data) {
    const box = document.getElementById('weather-forecast');
    if (!box) return;
    box.innerHTML = '';
    if (!data || !Array.isArray(data.list)) {
      box.innerHTML = '<div class="text-xs text-gray-400">Прогноз недоступен</div>';
      return;
    }

    // Группируем по дню (берём ближайший к полудню)
    const byDay = {};
    for (const it of data.list) {
      const d = new Date(it.dt * 1000);
      const k = d.toISOString().slice(0,10);
      if (!byDay[k] || Math.abs(d.getHours() - 12) < Math.abs(new Date(byDay[k].dt*1000).getHours() - 12)) {
        byDay[k] = it;
      }
    }
    const days = Object.keys(byDay).slice(0,5);
    for (const day of days) {
      const it = byDay[day];
      const w = it.weather[0];
      const temp = Math.round(it.main.temp);
      const d = new Date(it.dt * 1000);
      const label = d.toLocaleDateString((localStorage.getItem('lang')||'"ru"').replace(/"/g,'')||'ru', { weekday:'short', day:'2-digit', month:'2-digit' });
      const card = document.createElement('div');
      card.className = 'glass rounded-xl p-3 text-center';
      card.innerHTML = `
        <div class="text-sm text-gray-300">${label}</div>
        <div class="text-2xl">${iconFor(w.id)}</div>
        <div class="text-lg">${temp}°C</div>
      `;
      box.appendChild(card);
    }
  }

  function init() {
    function load(lat, lon) {
      getWeather(lat, lon).then(({current, forecast}) => {
        renderCurrent(current);
        renderForecast(forecast);
      }).catch(() => {
        const wrap = document.getElementById('weather-current');
        if (wrap) wrap.textContent = 'Ошибка загрузки погоды';
      });
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => load(pos.coords.latitude, pos.coords.longitude),
        () => load(55.7558, 37.6173),
        { enableHighAccuracy: false, timeout: 4000 }
      );
    } else {
      load(55.7558, 37.6173);
    }

    // Обновлять каждые 30 минут (по умолчанию Москва)
    setInterval(() => load(55.7558, 37.6173), 30 * 60 * 1000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Weather.init());