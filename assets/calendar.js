// assets/calendar.js
(function(){
  window.state = window.state || { current: new Date(), slotsByDate:{}, selected:null };
  window.SLOTS_CACHE = window.SLOTS_CACHE || {};
  const INFLIGHT = {};        // { monthKey: {script, cbName, timer} }
  const RETRY_MS = 5000;      // повтор через 5 c при ошибке
  const TIMEOUT_MS = 10000;   // таймаут JSONP 10 c
  const $ = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));
  const pad = (n)=>String(n).padStart(2,'0');
  const ymd = (d)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const startOfMonth=(d)=>new Date(d.getFullYear(), d.getMonth(),1);
  const endOfMonth=(d)=>new Date(d.getFullYear(), d.getMonth()+1,0);
  function monthKeyOf(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
  window.monthKeyOf = monthKeyOf;

  function buildGrid(){
    const table = $('#calendar table tbody');
    if(!table) return;
    table.innerHTML='';
    const first = startOfMonth(state.current);
    const startWeekday = (first.getDay()+6)%7; // Mon=0
    let cur = new Date(first); cur.setDate(cur.getDate()-startWeekday);
    for(let r=0;r<6;r++){
      const tr=document.createElement('tr');
      for(let c=0;c<7;c++){
        const td=document.createElement('td');
        td.setAttribute('data-date', ymd(cur));
        td.textContent = cur.getDate();
        const today = new Date(); const ymdToday = ymd(today);
        if (ymd(cur) === ymdToday) td.classList.add('today');
        if (cur.getMonth() !== state.current.getMonth()) td.classList.add('other-month');
        tr.appendChild(td);
        cur.setDate(cur.getDate()+1);
      }
      table.appendChild(tr);
    }
    $('#month-label').textContent = state.current.toLocaleDateString(undefined,{month:'long', year:'numeric'});
    paintDots();
  }

  function paintDots(){
    $$('#calendar td[data-date]').forEach(td=>{
      const date = td.getAttribute('data-date');
      const has = state.slotsByDate[date];
      td.classList.toggle('has-slots', Array.isArray(has) && has.length>0);
    });
  }

  function attachHandlers(){
    $('#prev')?.addEventListener('click',()=>{
      state.current = new Date(state.current.getFullYear(), state.current.getMonth()-1, 1);
      buildGrid(); loadMonth(true);
    });
    $('#next')?.addEventListener('click',()=>{
      state.current = new Date(state.current.getFullYear(), state.current.getMonth()+1, 1);
      buildGrid(); loadMonth(true);
    });
    document.addEventListener('click',(e)=>{
      const td = e.target.closest('#calendar td[data-date]'); if(!td) return;
      $$('#calendar td').forEach(x=>x.classList.remove('active'));
      td.classList.add('active');
      loadDaySlots(td.getAttribute('data-date'));
    });
  }

  function loadSlotsJSONP(from, to, monthKey){
    if (INFLIGHT[monthKey]) return;

    // <-- вот эти две строки новые
    const safeKey = String(monthKey).replace(/[^0-9A-Za-z_]/g, '_'); // '2025-09' -> '2025_09'
    const cbName  = `__onSlots_${safeKey}_${Date.now()}`;

    const s = document.createElement('script');
    s.id = `jsonp-slots-${safeKey}`;
    s.src = `${APP_CONFIG.ENDPOINT}?action=slots&from=${from}&to=${to}`
          + `&callback=${cbName}&v=${Date.now()}`;

    const cleanup = () => {
      if (INFLIGHT[monthKey]?.timer) clearTimeout(INFLIGHT[monthKey].timer);
      try { delete window[cbName]; } catch(_) {}
      s.remove();
      delete INFLIGHT[monthKey];
    };

    window[cbName] = function(payload){
      if (monthKeyOf(state.current) === monthKey) {
        const map = {};
        (payload?.days || []).forEach(d => map[d.date] = d.slots || []);
        SLOTS_CACHE[monthKey] = map;
        state.slotsByDate = map;
        paintDots();
        if (state.selected?.date) renderDaySlots(state.selected.date);
      }
      cleanup();
    };

    s.onerror = () => {
      console.warn('[slots] JSONP error for', monthKey);
      cleanup();
      if (monthKeyOf(state.current) === monthKey) {
        setTimeout(() => loadSlotsJSONP(from, to, monthKey), RETRY_MS);
      }
    };

    INFLIGHT[monthKey] = {
      script: s,
      timer: setTimeout(() => {
        console.warn('[slots] JSONP timeout for', monthKey);
        s.dispatchEvent(new Event('error'));
      }, TIMEOUT_MS)
    };

    document.body.appendChild(s);
  }

  window.loadMonth = function(force=false){
    const key = monthKeyOf(state.current);
    if(!force && SLOTS_CACHE[key]){
      state.slotsByDate = SLOTS_CACHE[key];
      paintDots(); return;
    }
    const from = ymd(startOfMonth(state.current));
    const to   = ymd(endOfMonth(state.current));
    loadSlotsJSONP(from,to,key);
  };

  window.loadDaySlots = function(dateStr){
    state.selected = {date:dateStr, time:null};
    renderDaySlots(dateStr);
  };

  function renderDaySlots(dateStr){
    const box = $('#day-slots'); if(!box) return;
    box.innerHTML='';
    const list = state.slotsByDate[dateStr] || [];
    if(list.length===0){ box.innerHTML = `<p class="muted">—</p>`; return; }
    list.forEach(t=>{
      const b=document.createElement('button');
      b.className='chip'; b.type='button'; b.textContent=t;
      b.addEventListener('click',()=>{
        state.selected={date:dateStr, time:t};
        $$('#day-slots .chip').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        const chosen=$('#chosen'); if(chosen) chosen.textContent = `${dateStr} ${t}`;
        const form=$('#booking-form'); if(form){ form.date.value=dateStr; form.time.value=t; }
      });
      box.appendChild(b);
    });
  }

  // локально удалить слот после брони (чтобы сразу пропал)
  window.locallyRemoveSlot = function(dateStr, timeStr){
    if(state.slotsByDate[dateStr]){
      state.slotsByDate[dateStr] = state.slotsByDate[dateStr].filter(x=>x!==timeStr);
    }
    const key = monthKeyOf(new Date(dateStr));
    if(SLOTS_CACHE[key] && SLOTS_CACHE[key][dateStr]){
      SLOTS_CACHE[key][dateStr] = SLOTS_CACHE[key][dateStr].filter(x=>x!==timeStr);
    }
    renderDaySlots(dateStr); paintDots();
  };

  document.addEventListener('DOMContentLoaded',()=>{
    buildGrid(); attachHandlers(); loadMonth(false);
  });

  // обновляем только при возвращении на вкладку И только если нет запроса
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible'){
      const key = monthKeyOf(state.current);
      if (!INFLIGHT[key]) loadMonth(true);
      if (state.selected?.date) renderDaySlots(state.selected.date);
    }
  });

  // лёгкий авторефреш выбранного дня (не трогая месяц)
  setInterval(()=>{
    if (state.selected?.date) renderDaySlots(state.selected.date);
  }, 30000);

})();
