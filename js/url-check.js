// js/url-check.js — локальная проверка ссылок (без сетевых запросов)
(function(){
  function $(id){ return document.getElementById(id); }

  function analyze(input){
    input = (input||'').trim();
    if (!input) return { ok:false, msg:'Введите ссылку', items:[] };

    // Добавим схему, если нет
    var raw = input;
    if (!/^[a-z]+:\/\//i.test(raw)) raw = 'http://' + raw;

    var u;
    try { u = new URL(raw); }
    catch (e) { return { ok:false, msg:'Некорректный URL', items:[{type:'bad', text:'Не удалось распарсить ссылку'}] }; }

    var hostname = u.hostname || '';
    var domain = hostname.replace(/^www\./i,'');
    var path = u.pathname + (u.search || '') + (u.hash || '');
    var flags = [];
    var risk = 0; // 0 — ок, 1 — предупреждение, 2 — высокий

    // IDN/punycode
    var isIDN = /(^|\.)xn--/i.test(hostname);
    if (isIDN){ risk = Math.max(risk, 1); flags.push({type:'warn', text:'IDN-домен (xn--) — возможен спуфинг'}); }

    // Смешение кириллицы и латиницы в домене
    var hasCyr = /[а-яё]/i.test(hostname);
    var hasLat = /[a-z]/i.test(hostname);
    if (hasCyr && hasLat){ risk = Math.max(risk, 2); flags.push({type:'bad', text:'Смешаны кириллические и латинские символы в домене'}); }

    // Много поддоменов
    var parts = domain.split('.').filter(Boolean);
    if (parts.length >= 4){ risk = Math.max(risk, 1); flags.push({type:'warn', text:'Много поддоменов'}); }

    // Много дефисов
    if ((domain.match(/-/g)||[]).length >= 3){ risk = Math.max(risk, 1); flags.push({type:'warn', text:'Много дефисов в домене'}); }

    // Пользовательская часть или "@" внутри — часто маскировка
    if (u.username || u.password || /@/.test(u.href.split('/')[2])){
      risk = Math.max(risk, 2); flags.push({type:'bad', text:'Наличие @/логина в ссылке — маскировка'}); 
    }

    // Подозрительные параметры
    var suspiciousParams = ['redirect','token','login','pass','password','confirm','update','bank','secure','verify'];
    for (var [k,v] of u.searchParams.entries()){
      if (suspiciousParams.indexOf(k.toLowerCase()) !== -1){
        risk = Math.max(risk, 1);
        flags.push({type:'warn', text:'Подозрительный параметр: ' + k});
      }
      if (/https?:\/\//i.test(v)){
        risk = Math.max(risk, 1);
        flags.push({type:'warn', text:'Перенаправление в параметре: ' + k});
      }
    }

    // Подмена брендов простейшая эвристика
    var brands = ['sber','tinkoff','alfa','vtb','gazprombank','paypal','google','apple','yandex','vk','telegram','microsoft'];
    var tld = parts[parts.length-1] || '';
    var core = parts.slice(-2).join('.'); // пример: brand.com
    for (var i=0;i<brands.length;i++){
      var b = brands[i];
      if (domain.indexOf(b) !== -1 && core.indexOf(b) === -1){
        risk = Math.max(risk, 2);
        flags.push({type:'bad', text:'Возможная маскировка бренда: '+b});
        break;
      }
    }

    if (!flags.length) flags.push({type:'ok', text:'Явных признаков маскировки не найдено'});

    return {
      ok:true,
      domain: domain,
      url: u.href,
      path: path,
      items: flags,
      risk: risk
    };
  }

  function render(res){
    var box = $('url-result');
    if (!box) return;
    box.innerHTML = '';

    if (!res || !res.ok){
      box.innerHTML = '<div class="text-secondary">'+(res && res.msg ? res.msg : 'Ошибка анализа')+'</div>';
      return;
    }

    var riskLabel = res.risk >= 2 ? '<span class="tag tag-bad">Высокий риск</span>' :
                     res.risk === 1 ? '<span class="tag tag-warn">Есть риски</span>' :
                     '<span class="tag tag-ok">Низкий риск</span>';

    var top = document.createElement('div');
    top.className = 'mb-2';
    top.innerHTML = 'Домен: <span class="tag tag-domain">'+res.domain+'</span> · '+riskLabel;
    box.appendChild(top);

    var ul = document.createElement('ul');
    ul.className = 'list-disc list-inside text-sm';
    res.items.forEach(function(it){
      var li = document.createElement('li');
      var cls = it.type === 'bad' ? 'tag tag-bad' : it.type === 'warn' ? 'tag tag-warn' : 'tag tag-ok';
      li.innerHTML = '<span class="'+cls+'">'+it.text+'</span>';
      ul.appendChild(li);
    });
    box.appendChild(ul);

    var small = document.createElement('div');
    small.className = 'text-xs text-muted mt-2';
    small.textContent = 'Проверка выполняется локально, без отправки ссылки в сеть.';
    box.appendChild(small);
  }

  document.addEventListener('DOMContentLoaded', function(){
    var btn = $('url-check'), inp = $('url-input');
    if (!btn || !inp) return;
    btn.addEventListener('click', function(){
      render(analyze(inp.value));
    });
    inp.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); render(analyze(inp.value)); }
    });
  });
})();