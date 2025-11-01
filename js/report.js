// js/report.js — модалка + honeypot + (опц.) reCAPTCHA/hCaptcha + надёжный перехват submit
(function () {
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function setHint(msg, ok) { var el = $('#reportHint'); if (el){ el.textContent = msg||''; el.style.color = ok ? '#10B981' : 'var(--cs-text)'; } }
function getField(obj, names) { for (var i=0;i<names.length;i++){ var k=names[i]; if (obj && typeof obj.get === 'function') { var v = obj.get(k); if (v != null && String(v).length) return String(v); } } return ''; }

var Captcha = { enabled:false, provider:'', siteKey:'' };
async function fetchCaptchaConfig(){ try{ var r=await fetch('/api/captcha/config',{cache:'no-store'}); if(r.ok){ var d=await r.json(); if(d&&d.enabled&&d.provider&&d.siteKey){ Captcha={enabled:true,provider:String(d.provider).toLowerCase(),siteKey:d.siteKey}; } } }catch(e){} }
function loadScript(src){ return new Promise(function(res,rej){ if(document.querySelector('script[src="'+src+'"]')) return res(); var s=document.createElement('script'); s.src=src; s.async=true; s.defer=true; s.onload=res; s.onerror=function(){rej(new Error('script failed: '+src));}; document.head.appendChild(s); }); }
async function getCaptchaToken(){ if(!Captcha.enabled||!Captcha.siteKey) return ''; try{ if(Captcha.provider==='recaptcha'){ await loadScript('https://www.google.com/recaptcha/api.js?render='+encodeURIComponent(Captcha.siteKey)); if(typeof grecaptcha==='undefined') return ''; await new Promise(function(r){ try{grecaptcha.ready(r);}catch(e){r();} }); return await grecaptcha.execute(Captcha.siteKey,{action:'report'}); } if(Captcha.provider==='hcaptcha'){ await loadScript('https://js.hcaptcha.com/1/api.js?render='+encodeURIComponent(Captcha.siteKey)); if(typeof hcaptcha==='undefined') return ''; return await hcaptcha.execute(Captcha.siteKey,{action:'report'}); } return ''; }catch(e){ console.warn('captcha token error:', e.message); return ''; } }

function validate(p){ var allowed=['call','sms','site','social','other']; if(allowed.indexOf(p.type)===-1) return 'Некорректный тип'; if(!p.target||p.target.trim().length<3) return 'Укажите номер/ссылку/аккаунт'; if(!p.description||p.description.trim().length<10) return 'Опишите подробнее (минимум 10 символов)'; return null; }

var activeModal=null;
function openModal(sel){ var m=$(sel||'#reportModal'); if(!m) return; if(!m.classList.contains('open')){ m.classList.remove('hidden'); requestAnimationFrame(function(){ m.classList.add('open'); }); document.documentElement.classList.add('modal-open'); document.body.classList.add('modal-open'); activeModal=m; var ts = $('#reportForm input[name="_ts"]', m) || ('#reportForm input[name="hp_time"]', m); if(ts) ts.value=String(Date.now()); var first=('#reportForm [name="type"]', m) || $('#reportForm input, #reportForm textarea', m); if(first&&first.focus) setTimeout(function(){ first.focus(); },40); } }
function closeModal(){ var m=activeModal; if(!m) return; m.classList.remove('open'); setTimeout(function(){ m.classList.add('hidden'); },200); document.documentElement.classList.remove('modal-open'); document.body.classList.remove('modal-open'); activeModal=null; }

async function submitReport(ev){
ev.preventDefault(); ev.stopPropagation();
var form = ev.target;
// Собираем поля
var fd = new FormData(form);
var hpVal = getField(fd, ['website','hp_field']);
var tsVal = getField(fd, ['_ts','hp_time']); var tookMs=0; try{tookMs=Date.now()-parseInt(tsVal||'0',10);}catch(e){}
var payload = {
type: (fd.get('type')||'').trim(),
target: (fd.get('target')||'').trim(),
description: (fd.get('description')||'').trim(),
contact: (fd.get('contact')||'').trim(),
_hp: hpVal,
_ts: tookMs
};
var v = validate(payload); if(v){ setHint(v,false); return; }
var token = await getCaptchaToken(); if(token) payload._captcha = token;

var btn = form.querySelector('button[type="submit"]'); if(btn) btn.disabled = true;
setHint('Отправка...', false);
try{
  var res = await fetch('/api/reports',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  var data = await res.json();
  if(!res.ok) throw new Error(data.error||'Ошибка отправки');
  setHint('Спасибо! Сообщение отправлено. ID: '+(data.id||''), true);
  form.reset();
  var ts = form.querySelector('input[name="_ts"], input[name="hp_time"]'); if(ts) ts.value=String(Date.now());
  setTimeout(closeModal, 1200);
}catch(e){ setHint('Не удалось отправить: '+e.message, false); }
finally{ if(btn) btn.disabled=false; }

}

document.addEventListener('DOMContentLoaded', function(){
fetchCaptchaConfig();

// Перехват submit через делегирование (надёжно)
document.addEventListener('submit', function(e){
  var t = e.target;
  if(!t || t.tagName!=='FORM') return;
  var isReport = (t.id==='reportForm') || t.hasAttribute('data-report-form');
  if(isReport) submitReport(e);
}, true);

// Открытие/закрытие модалки
$all('[data-modal-open]').forEach(function(btn){ btn.addEventListener('click', function(){ openModal(btn.getAttribute('data-modal-open')||'#reportModal'); }); });
$all('[data-modal-close]').forEach(function(el){ el.addEventListener('click', closeModal); });
document.addEventListener('keydown', function(e){ if(e.key==='Escape' && activeModal) { e.preventDefault(); closeModal(); } });

// Если скрытых полей нет — добавим (совместимость)
var form = document.getElementById('reportForm') || document.querySelector('[data-report-form]');
if(form){
  if(!form.querySelector('input[name="website"]') && !form.querySelector('input[name="hp_field"]')){
    var hp = document.createElement('input'); hp.type='text'; hp.name='website'; hp.autocomplete='off'; hp.className='hp-field'; form.appendChild(hp);
  }
  if(!form.querySelector('input[name="_ts"]') && !form.querySelector('input[name="hp_time"]')){
    var ts = document.createElement('input'); ts.type='hidden'; ts.name='_ts'; ts.value=String(Date.now()); form.appendChild(ts);
  }
}

});
})();