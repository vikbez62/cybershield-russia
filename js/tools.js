// js/tools.js — проверка силы пароля + генератор + офлайн/онлайн время + CapsLock + сохранение настроек
(function(){
  var el = {
    input:null,toggle:null,meter:null,label:null,tips:null,entropy:null,
    timeOff:null,timeOn:null,
    len:null,gen:null,copy:null,hint:null,
    setL:null,setU:null,setD:null,setS:null,setNoAmb:null,caps:null
  };
  var DICT = ['password','qwerty','letmein','welcome','dragon','monkey','abc123','admin','iloveyou','sunshine','пароль','qwertyuiop','pass','secret','login','123456','111111','000000'];

  function $(id){ return document.getElementById(id); }
  function initEls(){
    el.input=$('pw-input'); el.toggle=$('pw-toggle'); el.meter=$('pw-meter-fill');
    el.label=$('pw-score-label'); el.tips=$('pw-tips'); el.entropy=$('pw-entropy');
    el.timeOff=$('pw-time-off'); el.timeOn=$('pw-time-on');
    el.len=$('pw-len'); el.gen=$('pw-gen'); el.copy=$('pw-copy'); el.hint=$('pw-hint');
    el.setL=$('set-l'); el.setU=$('set-u'); el.setD=$('set-d'); el.setS=$('set-s'); el.setNoAmb=$('set-no-amb');
    el.caps=$('pw-caps');
  }

  function hasLower(s){ return /[a-zа-я]/.test(s); }
  function hasUpper(s){ return /[A-ZА-Я]/.test(s); }
  function hasDigit(s){ return /\d/.test(s); }
  function hasSymbol(s){ return /[^0-9A-Za-zА-Яа-я]/.test(s); }
  function hasRepeatRun(s){ return /(.)\1\1/.test(s); }
  function hasSequence(s){
    var low=s.toLowerCase();
    var kb=['qwerty','asdf','zxcv','йцу','фыв','ячс'];
    var seqs=['abcdefghijklmnopqrstuvwxyz','0123456789','йцукенгшщзхъфывапролджэйёячсмитьбю'];
    for (var i=0;i<seqs.length;i++){
      for (var j=0;j<seqs[i].length-2;j++){
        var f=seqs[i].slice(j,j+3), r=f.split('').reverse().join('');
        if (low.indexOf(f)!==-1 || low.indexOf(r)!==-1) return true;
      }
    }
    for (i=0;i<kb.length;i++) if (low.indexOf(kb[i])!==-1) return true;
    return false;
  }
  function hasDictWord(s){ var low=s.toLowerCase(); for (var i=0;i<DICT.length;i++){ var w=DICT[i]; if (w.length>=4 && low.indexOf(w)!==-1) return true; } return false; }
  function hasDateLike(s){ return /\b(\d{2}[-./]\d{2}([-.\/]\d{2,4})?)\b/.test(s) || /\b(19|20)\d{2}\b/.test(s); }

  function entropyBits(pw){
    if (!pw) return 0;
    var charset=0; if (hasLower(pw)) charset+=26; if (hasUpper(pw)) charset+=26; if (hasDigit(pw)) charset+=10; if (hasSymbol(pw)) charset+=33;
    if (!charset) charset=1;
    return Math.round(pw.length * Math.log2(charset));
  }

  // Плюрализация по-русски
  function pluralRu(n, one, few, many){
    n = Math.abs(n);
    var i = Math.floor(n);
    var mod10 = i % 10, mod100 = i % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }
  // Патч 1: грамотные формы + защита от переполнения
  function crackTimeLabel(entropy, gps){
    if (!entropy) return '—';
    var guesses = Math.pow(2, Math.min(entropy, 128));
    var rate = gps || 1e10; // попыток/сек
    var sec = guesses / rate;

    var steps = [
      { one:'секунда', few:'секунды', many:'секунд', k:60 },
      { one:'минута',  few:'минуты',  many:'минут',  k:60 },
      { one:'час',     few:'часа',    many:'часов',  k:24 },
      { one:'день',    few:'дня',     many:'дней',   k:365 },
      { one:'год',     few:'года',    many:'лет',    k:100 },
      { one:'век',     few:'века',    many:'веков',  k:10 }
    ];
    var idx = 0;
    while (idx < steps.length-1 && sec >= steps[idx].k){
      sec /= steps[idx].k; idx++;
    }
    if (sec < 1) return '< 1 ' + steps[idx].many;
    var val = Math.round(sec*10)/10;
    var unit = (val % 1 === 0) ? pluralRu(val, steps[idx].one, steps[idx].few, steps[idx].many) : steps[idx].many;
    return val + ' ' + unit;
  }

  function scorePassword(pw){
    var tips=[]; if (!pw) return {score:0,label:'—',tips:[], level:0, entropy:0};
    var len=pw.length, score=Math.min(len,20)*4;
    var cat=0; if (hasLower(pw)) cat++; if (hasUpper(pw)) cat++; if (hasDigit(pw)) cat++; if (hasSymbol(pw)) cat++;
    if (cat>=2) score+=(cat-1)*10;
    if (len<8){ score-=20; tips.push('Увеличьте длину до 12+ символов'); }
    else if (len<12){ score-=10; tips.push('Сделайте пароль длинее (12+)'); }
    if (cat<3){ tips.push('Добавьте разнообразие: прописные/строчные, цифры, символы'); }
    if (cat===1) score-=15;
    if (hasRepeatRun(pw)){ score-=15; tips.push('Избегайте повторов (ааа, !!!)'); }
    if (hasSequence(pw)){ score-=20; tips.push('Не используйте последовательности (abc, 123, qwerty)'); }
    if (hasDictWord(pw)){ score-=30; tips.push('Избегайте популярных слов/фраз'); }
    if (hasDateLike(pw)){ score-=10; tips.push('Не используйте даты/шаблоны'); }
    score=Math.max(0, Math.min(100, score));
    var level=0,label='Очень слабый';
    if (score>=80){ level=4; label='Отличный'; }
    else if (score>=65){ level=3; label='Хороший'; }
    else if (score>=45){ level=2; label='Средний'; }
    else if (score>=25){ level=1; label='Слабый'; }
    var ent=entropyBits(pw);
    return {score:score,label:label,tips:tips,level:level,entropy:ent};
  }

  function updateUI(pw){
    var res=scorePassword(pw);
    if (el.meter){ el.meter.style.width=res.score+'%'; el.meter.className='pw-meter-fill meter-'+res.level; }
    if (el.label) el.label.textContent=res.label;
    if (el.entropy) el.entropy.textContent=String(res.entropy);
    // Патч 2: две оценки — офлайн и онлайн
    if (el.timeOff) el.timeOff.textContent = crackTimeLabel(res.entropy, 1e10); // 10 млрд/сек
    if (el.timeOn)  el.timeOn.textContent  = crackTimeLabel(res.entropy, 100);  // 100/сек

    if (el.tips){
      el.tips.innerHTML='';
      var base=['Не используйте персональные данные','Разные пароли для разных сервисов'];
      var all=res.tips.concat(base);
      for (var i=0;i<Math.min(all.length,5);i++){ var li=document.createElement('li'); li.textContent=all[i]; el.tips.appendChild(li); }
    }
  }

  function rng(max){ if (window.crypto && crypto.getRandomValues){ var a=new Uint32Array(1); crypto.getRandomValues(a); return a[0]%max; } return Math.floor(Math.random()*max); }
  function shuffle(a){ for (var i=a.length-1;i>0;i--){ var j=rng(i+1); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }

  function saveSettings(){
    var s={ len:parseInt(el.len.value||'16',10)||16, l:el.setL.checked, u:el.setU.checked, d:el.setD.checked, s:el.setS.checked, na:el.setNoAmb.checked };
    try{ localStorage.setItem('pw_settings', JSON.stringify(s)); }catch(e){}
  }
  function loadSettings(){
    try{
      var s=JSON.parse(localStorage.getItem('pw_settings')||'{}');
      if (s && typeof s==='object'){
        if (s.len) el.len.value=String(s.len);
        var map={l:'set-l',u:'set-u',d:'set-d',s:'set-s',na:'set-no-amb'};
        Object.keys(map).forEach(function(k){
          if (typeof s[k]==='boolean'){ var box=$(map[k]); if (box) box.checked=s[k]; }
        });
      }
    }catch(e){}
  }

  function generate(){
    var len=Math.max(8, Math.min(64, parseInt(el.len.value||'16',10)||16));
    var lower='abcdefghijklmnopqrstuvwxyz', upper='ABCDEFGHIJKLMNOPQRSTUVWXYZ', digits='0123456789', symbols='!@#$%^&*()-_=+[]{};:,.<>?/\\|~', amb='lI1O0';
    var pools=[]; if (el.setL.checked) pools.push(lower); if (el.setU.checked) pools.push(upper); if (el.setD.checked) pools.push(digits); if (el.setS.checked) pools.push(symbols);
    if (pools.length===0) pools.push(lower+digits);
    if (el.setNoAmb.checked){
      var filt=function(s){ return s.split('').filter(function(ch){ return amb.indexOf(ch)===-1; }).join(''); };
      pools=pools.map(filt);
    }
    var all=pools.join('');
    var out=[];
    for (var i=0;i<pools.length;i++){ var p=pools[i]; if (p.length) out.push(p[rng(p.length)]); }
    for (var k=out.length; k<len; k++){ out.push(all[rng(all.length)]); }
    shuffle(out);
    el.input.value=out.join('');
    updateUI(el.input.value);
    el.hint.textContent='Сгенерировано'; setTimeout(function(){ el.hint.textContent=''; }, 1200);
    saveSettings();
  }
  function copy(){
    var pw=el.input.value||''; if(!pw) return;
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(pw).then(function(){ el.hint.textContent='Скопировано'; setTimeout(function(){ el.hint.textContent=''; },1200); })
      .catch(function(){ fallbackCopy(); });
    } else fallbackCopy();
  }
  function fallbackCopy(){ try{ el.input.select(); document.execCommand('copy'); el.hint.textContent='Скопировано'; setTimeout(function(){ el.hint.textContent=''; },1200); }catch(e){} }

  document.addEventListener('DOMContentLoaded', function(){
    initEls(); if (!el.input) return;
    loadSettings(); updateUI(el.input.value||'');

    el.input.addEventListener('input', function(){ updateUI(el.input.value); });
    function updCaps(e){ if (!el.caps) return; var on = e.getModifierState && e.getModifierState('CapsLock'); el.caps.classList.toggle('hide', !on); }
    el.input.addEventListener('keydown', updCaps);
    el.input.addEventListener('keyup',   updCaps);

    el.toggle.addEventListener('click', function(){
      var t=el.input.getAttribute('type')==='password' ? 'text' : 'password';
      el.input.setAttribute('type',t);
      el.toggle.textContent=(t==='password')?'Показать':'Скрыть';
    });

    el.gen.addEventListener('click', generate);
    el.copy.addEventListener('click', copy);
    ['change','input'].forEach(function(ev){
      el.len.addEventListener(ev, saveSettings);
      [el.setL,el.setU,el.setD,el.setS,el.setNoAmb].forEach(function(c){ c.addEventListener(ev, saveSettings); });
    });
  });
})();