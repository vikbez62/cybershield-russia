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

  function escapeHtml(text) {
    if (typeof text !== 'string') text = String(text);
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
  }

  function render(res){
    var box = $('url-result');
    if (!box) return;
    box.innerHTML = '';

    if (!res || !res.ok){
      var errDiv = document.createElement('div');
      errDiv.className = 'text-secondary';
      errDiv.textContent = (res && res.msg ? res.msg : 'Ошибка анализа');
      box.appendChild(errDiv);
      return;
    }

    var top = document.createElement('div');
    top.className = 'mb-2';
    
    var domainText = document.createTextNode('Домен: ');
    top.appendChild(domainText);
    
    var domainSpan = document.createElement('span');
    domainSpan.className = 'tag tag-domain';
    domainSpan.textContent = res.domain || '';
    top.appendChild(domainSpan);
    
    top.appendChild(document.createTextNode(' · '));
    
    var riskSpan = document.createElement('span');
    riskSpan.className = res.risk >= 2 ? 'tag tag-bad' : res.risk === 1 ? 'tag tag-warn' : 'tag tag-ok';
    riskSpan.textContent = res.risk >= 2 ? 'Высокий риск' : res.risk === 1 ? 'Есть риски' : 'Низкий риск';
    top.appendChild(riskSpan);
    
    box.appendChild(top);

    var ul = document.createElement('ul');
    ul.className = 'list-disc list-inside text-sm';
    res.items.forEach(function(it){
      var li = document.createElement('li');
      var cls = it.type === 'bad' ? 'tag tag-bad' : it.type === 'warn' ? 'tag tag-warn' : 'tag tag-ok';
      var tagSpan = document.createElement('span');
      tagSpan.className = cls;
      tagSpan.textContent = it.text || '';
      li.appendChild(tagSpan);
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