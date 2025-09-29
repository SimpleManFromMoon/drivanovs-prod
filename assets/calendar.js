// assets/calendar.js
(function(){
  const CFG = window.APP_CONFIG || {};
  const ENDPOINT = CFG.ENDPOINT;

  // --- utils ---
  const atStartOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  function addDays(d, n){ const out = new Date(d.getFullYear(), d.getMonth(), d.getDate()+n); out.setHours(0,0,0,0); return out; }
  const ymd = d => (typeof d === 'string') ? d : d.toISOString().slice(0,10);

  // --- DOM ---
  const titleEl   = () => document.getElementById('calTitle');
  const gridEl    = () => document.getElementById('calGrid');
  const weekEl    = () => document.getElementById('calWeek');
  const slotsEl   = () => document.getElementById('timeSlots');
  const dateInput = () => document.querySelector('input[name="date"]');
  const timeInput = () => document.querySelector('input[name="time"]');
  const modeSelect= () => document.getElementById('modeSelect');
  const kindInput = () => document.getElementById('kindInput');
  const chosenEl  = () => document.getElementById('chosen');
  const filterOffice = () => document.getElementById('filterOffice');
  const filterOnline = () => document.getElementById('filterOnline');

  // --- state ---
  const state = {
    monthDate: atStartOfDay(new Date()),
    selectedDate: null,
    selectedTime: null,
    selectedKind: null,
    filters: { office:true, online:true },
    daysMap: new Map(), // dateStr -> {office:[], online:[]}
    cache: {} // month span -> loaded
  };

  // --- i18n tiny ---
  function t(key, fb){ try{ return (window.I18N && I18N.t(key)) || fb; }catch(e){ return fb; } }
  const TYPE_NAME = { office: t('type.office','очно'), online: t('type.online','онлайн') };

  // --- skeleton ---
  function renderCalendarSkeleton(container, showHeaders = true) {
    container.innerHTML = '';
    const sk = document.createElement('div');
    sk.className = 'cal-skeleton';
    if (showHeaders) for (let i=0;i<7;i++){ const h=document.createElement('div'); h.className='cal-skel-header'; sk.appendChild(h); }
    for (let i=0;i<42;i++){ const c=document.createElement('div'); c.className='cal-skel-cell'; sk.appendChild(c); }
    container.appendChild(sk);
  }
  function setCalendarLoading(isLoading, container) {
    const live = document.getElementById('cal-live');
    if (isLoading) { renderCalendarSkeleton(container, true); if (live) live.textContent = t('cal.loading','загрузка календаря…'); }
    else { if (live) live.textContent = t('cal.loaded','календарь загружен'); }
  }

  // --- jsonp ---
  async function jsonp(url){
    return new Promise((resolve,reject)=>{
      const cb = '__cb_'+Math.random().toString(36).slice(2);
      window[cb] = (data)=>{ resolve(data); cleanup(); };
      function cleanup(){ try{ delete window[cb]; s.remove(); }catch(e){} }
      const s = document.createElement('script');
      s.src = url + (url.includes('?')?'&':'?') + 'callback=' + cb;
      s.onerror = ()=>{ cleanup(); reject(new Error('JSONP failed')); };
      document.head.appendChild(s);
    });
  }
  if(!window.jsonp) window.jsonp = jsonp;

  // --- week header ---
  function buildWeekHeader(){
    const names = [t('cal.mon','Пн'),t('cal.tue','Вт'),t('cal.wed','Ср'),t('cal.thu','Чт'),t('cal.fri','Пт'),t('cal.sat','Сб'),t('cal.sun','Вс')];
    weekEl().innerHTML = names.map(n=>`<div class="cal-w">${n}</div>`).join('');
  }

  function dotsHtml(dateStr){
    const o = state.daysMap.get(dateStr);
    if(!o) return '';
    let h = '';
    if(state.filters.office && (o.office||[]).length){
      h += `<span class="cal-dot cal-dot--office" title="${TYPE_NAME.office}"></span>`;
    }
    if(state.filters.online && (o.online||[]).length){
      h += `<span class="cal-dot cal-dot--online" title="${TYPE_NAME.online}"></span>`;
    }
    return h;
  }

  function buildGrid(){
    const d0 = state.monthDate;
    const firstDow = (new Date(d0.getFullYear(), d0.getMonth(), 1)).getDay() || 7; // 1..7 (Mon..Sun)
    const gridStart = addDays(new Date(d0.getFullYear(), d0.getMonth(), 1), -(firstDow-1));
    const total = 42;

    const today = ymd(atStartOfDay(new Date()));
    let html = '';
    for(let i=0;i<total;i++){
      const d = addDays(gridStart, i);
      const ds = ymd(d);
      const inMonth = d.getMonth() === d0.getMonth();
      const isToday = ds === today;
      const isSel = state.selectedDate === ds;
      html += `<button class="cal-day${inMonth?'':' dim'}${isToday?' today':''}${isSel?' selected':''}" data-id="${ds}">
        <div class="cal-num">${d.getDate()}</div>
        <div class="cal-dots">${dotsHtml(ds)}</div>
      </button>`;
    }
    gridEl().innerHTML = html;
    gridEl().querySelectorAll('.cal-day').forEach(b=> b.addEventListener('click', ()=> selectDate(b.dataset.id)));

    const monthName = d0.toLocaleString(undefined,{month:'long'});
    titleEl().innerHTML = `${monthName} <b>${d0.getFullYear()}</b>`;
  }

  function priceFor(kind, dateStr){
    const cfg = (CFG.PRICING||{})[kind] || {};
    if (cfg.overrides && cfg.overrides[dateStr]!=null) return cfg.overrides[dateStr];
    const d = new Date(dateStr+'T00:00');
    let wd = d.getDay(); wd = wd===0 ? 7 : wd; // 1..7
    if (cfg.byWeekday && cfg.byWeekday[wd]!=null) return cfg.byWeekday[wd];
    return cfg.default ?? null;
  }

  function setNoSlotsMsg(show){
    const holder = slotsEl(), empty = holder.querySelector('.no-slots');
    if(show){ if(!empty) holder.insertAdjacentHTML('beforeend', `<div class="no-slots small">${t('booking.no_slots','на данный момент нет свободных мест')}</div>`); }
    else { if(empty) empty.remove(); }
  }

  function renderSlotsList(dateStr){
    const obj = state.daysMap.get(dateStr) || {office:[], online:[]};
    let items = [];
    if(state.filters.office) (obj.office||[]).forEach(t=> items.push({kind:'office', t}));
    if(state.filters.online) (obj.online||[]).forEach(t=> items.push({kind:'online', t}));
    items.sort((a,b)=> a.t.localeCompare(b.t));

    const el = slotsEl();
    el.innerHTML = '';
    const legend = `<div class="slot-legend">
      <span><i style="background:${CFG.COLORS.office}"></i> ${TYPE_NAME.office}</span>
      <span><i style="background:${CFG.COLORS.online}"></i> ${TYPE_NAME.online}</span>
    </div>`;
    el.insertAdjacentHTML('beforeend', legend);

    if(items.length===0){ setNoSlotsMsg(true); return; } else { setNoSlotsMsg(false); }

    items.forEach(({kind,t})=>{
      const price = priceFor(kind,dateStr);
      const b = document.createElement('button');
      b.className = `slot slot--${kind}`;
      b.dataset.t = t; b.dataset.kind = kind;
      b.textContent = price ? `${t} · ${TYPE_NAME[kind]} · ${price}€` : `${t} · ${TYPE_NAME[kind]}`;
      b.addEventListener('click', ()=>{
        timeInput().value = t;
        (kindInput()||{}).value = kind;
        if(modeSelect()){ modeSelect().value = (kind==='office'?'in_person':'online'); modeSelect().setAttribute('disabled','disabled'); }
        state.selectedTime = t; state.selectedKind = kind; state.selectedDate = dateStr;
        dateInput().value = dateStr;
        el.querySelectorAll('.slot').forEach(x=>x.classList.remove('selected'));
        b.classList.add('selected');
        if(chosenEl()){
          const priceTxt = price ? ` · ${price}€` : '';
          chosenEl().textContent = `${TYPE_NAME[kind]} · ${t}${priceTxt}`;
        }
      });
      el.appendChild(b);
    });
  }

  function selectDate(ds){
    state.selectedDate = ds;
    dateInput().value = ds;
    gridEl().querySelectorAll('.cal-day').forEach(x=> x.classList.toggle('selected', x.dataset.id===ds));
    renderSlotsList(ds);
  }

  async function ensureMonthLoaded(d){
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth()+1, 0);
    const key  = ymd(from)+'__'+ymd(to);
    if(state.cache[key]) return;
    setCalendarLoading(true, gridEl());
    try{
      const url = `${ENDPOINT}?action=slots&from=${ymd(from)}&to=${ymd(to)}`;
      const data = await jsonp(url);
      (data.days||[]).forEach(day=>{
        state.daysMap.set(day.date, {office: day.office||[], online: day.online||[]});
      });
      state.cache[key] = true;
    }finally{ setCalendarLoading(false, gridEl()); }
  }

  function showMonth(d){
    state.monthDate = atStartOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
    buildWeekHeader(); buildGrid();
  }

  async function init(){
    document.getElementById('btnPrev')?.addEventListener('click', async ()=>{
      const d=new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()-1, 1);
      await ensureMonthLoaded(d); showMonth(d);
    });
    document.getElementById('btnNext')?.addEventListener('click', async ()=>{
      const d=new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()+1, 1);
      await ensureMonthLoaded(d); showMonth(d);
    });
    document.getElementById('btnToday')?.addEventListener('click', async ()=>{
      const d=atStartOfDay(new Date());
      const m=new Date(d.getFullYear(), d.getMonth(), 1);
      await ensureMonthLoaded(m); showMonth(d);
    });

    
    if(filterOffice()) filterOffice().addEventListener('change', e=>{
      state.filters.office = e.target.checked;
      buildGrid();                              // ← ОБНОВИТЬ ТОЧКИ
      if(state.selectedDate) renderSlotsList(state.selectedDate);
    });
    if(filterOnline()) filterOnline().addEventListener('change', e=>{
      state.filters.online = e.target.checked;
      buildGrid();
      if(state.selectedDate) renderSlotsList(state.selectedDate);
    });

    await ensureMonthLoaded(state.monthDate); showMonth(state.monthDate);

    // прыжок к ближайшему слоту
    let nearest=null, now=new Date();
    [...state.daysMap.keys()].sort().forEach(ds=>{
      const o=state.daysMap.get(ds);
      ['office','online'].forEach(k=> (o[k]||[]).forEach(t=>{
        const dt=new Date(ds+'T'+t+':00');
        if(dt>now && (!nearest || dt<nearest.dt)) nearest={date:ds,time:t,kind:k,dt};
      }));
    });
    if(nearest){ showMonth(new Date(nearest.date+'T00:00:00')); selectDate(nearest.date); }
    else { setNoSlotsMsg(true); slotsEl().innerHTML=''; }
  }

  // локальное удаление после брони
  function locallyRemoveSlot(dateStr, timeStr, kind){
    const obj = state.daysMap.get(dateStr); if(!obj) return;
    const arr = obj[kind]||[]; const i = arr.indexOf(timeStr);
    if(i>-1) arr.splice(i,1); obj[kind]=arr; state.daysMap.set(dateStr,obj);

    if(state.selectedDate===dateStr){
      const btn = slotsEl().querySelector(`.slot[data-t="${timeStr}"][data-kind="${kind}"]`);
      if(btn) btn.remove();
      if(chosenEl() && state.selectedTime===timeStr) chosenEl().textContent='';
      if((obj.office.length+obj.online.length)===0){ slotsEl().innerHTML=''; setNoSlotsMsg(true); }
    }
    const cell = gridEl().querySelector(`.cal-day[data-id="${dateStr}"]`);
    if(cell){
      if(obj.office.length===0) cell.querySelector('.cal-dot--office')?.remove();
      if(obj.online.length===0) cell.querySelector('.cal-dot--online')?.remove();
    }
  }
  window.locallyRemoveSlot = locallyRemoveSlot;

  // навигация
  window.calPrev  = async ()=>{ const d=new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()-1,1); await ensureMonthLoaded(d); showMonth(d); };
  window.calNext  = async ()=>{ const d=new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()+1,1); await ensureMonthLoaded(d); showMonth(d); };
  window.calToday = async ()=>{ const d=atStartOfDay(new Date()); await ensureMonthLoaded(new Date(d.getFullYear(), d.getMonth(),1)); showMonth(d); };

  document.addEventListener('DOMContentLoaded', init);
})();
