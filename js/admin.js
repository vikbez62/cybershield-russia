// js/admin.js — просмотр отчётов + фильтры + hide/unhide + delete + CSV
(function(){
  function $(s){ return document.querySelector(s); }
  function $on(el, ev, fn){ el && el.addEventListener(ev, fn); }
  function setHint(m){ var el=$('#hint'); if(el) el.textContent=m||''; }
  function fmtDate(iso){ try{ return new Date(iso).toLocaleString('ru-RU'); }catch(e){ return iso; } }
  function getKey(){ const u=new URL(location.href); const k1=u.searchParams.get('key'); if(k1){ sessionStorage.setItem('admKey',k1); return k1; } return sessionStorage.getItem('admKey')||''; }
  function setKey(k){ sessionStorage.setItem('admKey', k||''); }

  function filterRows(rows, type, q, showHidden) {
    q = (q||'').trim().toLowerCase();
    return rows.filter(r => {
      if (!showHidden && r.hidden) return false;
      if (type && r.type !== type) return false;
      if (!q) return true;
      const hay = [r.target||'', r.description||'', r.id||''].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function actionButtons(r){
    const toggleText = r.hidden ? 'Показать' : 'Скрыть';
    return `
      <div class="actions">
        <button class="btn-plain" data-action="toggle-hide" data-id="${r.id}" data-hidden="${r.hidden ? 'true' : 'false'}">${toggleText}</button>
        <button class="btn-danger" data-action="delete" data-id="${r.id}">Удалить</button>
      </div>
    `;
  }

  function render(rows) {
    const tb = $('#tblBody'); tb.innerHTML='';
    if (!rows || rows.length===0) {
      tb.innerHTML='<tr><td colspan="7" class="text-secondary p-4">Ничего не найдено</td></tr>';
      return;
    }
    for (const r of rows) {
      const tr = document.createElement('tr');
      if (r.hidden) tr.classList.add('row-hidden');
      tr.innerHTML = `
        <td class="nowrap mono">${fmtDate(r.createdAt)}</td>
        <td class="nowrap">${r.type||''}</td>
        <td class="nowrap mono">${(r.target||'').replace(/</g,'&lt;')}</td>
        <td>${(r.description||'').replace(/</g,'&lt;')}</td>
        <td class="nowrap mono">${(r.ip||'').replace(/^::ffff:/,'')}</td>
        <td class="nowrap mono">${r.id||''}</td>
        <td class="nowrap">${actionButtons(r)}</td>`;
      tb.appendChild(tr);
    }
  }

  function toCSV(rows){
    const esc = (s)=>('"'+String(s||'').replace(/"/g,'""')+'"');
    const out = [['createdAt','type','target','description','ip','id','hidden']].concat(
      rows.map(r=>[r.createdAt,r.type,r.target,r.description,r.ip,r.id, r.hidden?'1':'0'])
    ).map(a=>a.map(esc).join(',')).join('\r\n');
    return new Blob([out], {type:'text/csv;charset=utf-8;'});
  }

  let LAST_DATA = [];

  async function load() {
    try{
      const key = ($('#admKey').value.trim() || getKey());
      if (!key) { setHint('Введите ключ админа'); return []; }
      setKey(key);
      setHint('Загрузка...');
      const res = await fetch('/api/reports?key=' + encodeURIComponent(key) + '&limit=500', { cache:'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||('HTTP '+res.status));
      LAST_DATA = Array.isArray(data) ? data : [];
      applyFilters();
      setHint('Всего: ' + LAST_DATA.length);
      return LAST_DATA;
    }catch(e){
      setHint('Ошибка: ' + e.message);
      render([]);
      return [];
    }
  }

  function applyFilters() {
    const type = $('#fltType').value;
    const q = $('#fltQuery').value;
    const showHidden = $('#fltHidden').checked;
    const filtered = filterRows(LAST_DATA, type, q, showHidden);
    render(filtered);
  }

  async function apiToggleHide(id, hidden) {
    const key = getKey();
    const url = '/api/reports/' + encodeURIComponent(id) + '/hide?key=' + encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hidden: !!hidden })
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data.error||('HTTP '+res.status));
    return data;
  }

  async function apiDelete(id) {
    const key = getKey();
    const url = '/api/reports/' + encodeURIComponent(id) + '?key=' + encodeURIComponent(key);
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data.error||('HTTP '+res.status));
    return data;
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    const key = getKey(); if (key) $('#admKey').value = key;

    $on($('#btnLoad'), 'click', load);
    $on($('#fltType'), 'change', applyFilters);
    $on($('#fltHidden'), 'change', applyFilters);
    $on($('#fltQuery'), 'input', function(){ clearTimeout(this._t); this._t = setTimeout(applyFilters, 300); });

    $on($('#btnExport'), 'click', async ()=>{
      const rows = filterRows(LAST_DATA, $('#fltType').value, $('#fltQuery').value, $('#fltHidden').checked);
      if (!rows.length) { setHint('Нет данных для экспорта'); return; }
      const blob = toCSV(rows);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'reports.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    });

    // Делегирование кликов по кнопкам действий
    $on($('#tblBody'), 'click', async (e)=>{
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      try {
        if (action === 'toggle-hide') {
          const cur = btn.dataset.hidden === 'true';
          btn.disabled = true;
          await apiToggleHide(id, !cur);
          await load();
        } else if (action === 'delete') {
          if (!confirm('Удалить отчёт навсегда?')) return;
          const confirmId = prompt('Для подтверждения введите ID отчёта:', id);
          if (confirmId !== id) return;
          btn.disabled = true;
          await apiDelete(id);
          await load();
        }
      } catch (err) {
        setHint('Ошибка: ' + (err.message || err));
      } finally {
        btn.disabled = false;
      }
    });

    // авто-загрузка
    load();
  });
})();