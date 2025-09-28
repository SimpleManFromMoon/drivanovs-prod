// assets/calendar.js
(function(){
  const ENDPOINT = (window.APP_CONFIG||{}).ENDPOINT;
  const SLOT_MINUTES = 25; // у тебя фиксировано
  const ONE_DAY = 86400000;

  // элементы
  const titleEl   = () => document.getElementById('calTitle');
  const gridEl    = () => document.getElementById('calGrid');
  const weekEl    = () => document.getElementById('calWeek');
  const slotsEl   = () => document.getElementById('timeSlots');
  const dateInput = () => document.querySelector('input[name="date"]');
  const timeInput = () => document.querySelector('input[name="time"]');

  const state = {
    monthDate: stripToFirst(new Date()), // текущий показанный месяц (1-е число)
    daysMap: new Map(), // 'YYYY-MM-DD' -> ['15:00','15:30',...]
    nearest: null,      // {date:'YYYY-MM-DD', time:'HH:mm'}
    selectedDate: null, // 'YYYY-MM-DD'
    selectedTime: null
  };

  function stripToFirst(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
  function ymd(d){ return d.toISOString().slice(0,10); }
  function addDays(d, n){ return new Date(d.getTime()+n*ONE_DAY); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function fmtDate(d, lang){
    return d.toLocaleDateString(lang||'ru-RU',{month:'long', year:'numeric'});
  }

  // загрузка данных месяц/месяц+1 для точек
  async function ensureMonthLoaded(d){
    if(!ENDPOINT){ console.warn('No ENDPOINT'); return; }
    const from = new Date(d.getFullYear(), d.getMonth(), 1);
    const to   = new Date(d.getFullYear(), d.getMonth()+1, 0);
    const key  = ymd(from)+'__'+ymd(to);
    if(state.daysMap.has(key)) return;

    const url = `${ENDPOINT}?action=slots&from=${ymd(from)}&to=${ymd(to)}&callback=__onSlots_${Date.now()}`;
    state.daysMap.set(key, 'loading');

    const data = await jsonp(url);
    // заполняем дни
    (data.days||[]).forEach(day=>{
      state.daysMap.set(day.date, day.slots||[]);
    });

    // nearest
    if(!state.nearest){
      const now = new Date();
      let best = null;
      (data.days||[]).forEach(day=>{
        day.slots.forEach(t=>{
          const dt = new Date(day.date+'T'+t+':00');
          if(dt>now && (!best || dt<best.dt)) best={date:day.date, time:t, dt};
        });
      });
      if(best){ state.nearest={date:best.date, time:best.time}; }
    }
  }

  function buildWeekHeader(){
    const days = ['cal.mon','cal.tue','cal.wed','cal.thu','cal.fri','cal.sat','cal.sun'];
    weekEl().innerHTML = days.map(k=>`<div class="small" data-i18n="${k}">${window.I18N?I18N.t(k):k}</div>`).join('');
    if(window.I18N) I18N.apply();
  }

  function buildGrid(){
    const root = gridEl(); root.innerHTML='';
    const m0 = state.monthDate;
    const firstDay = new Date(m0);
    const shift = (firstDay.getDay()+6)%7; // понедельник = 0
    const start = addDays(m0, -shift);

    for(let i=0;i<42;i++){
      const d = addDays(start,i);
      const id = ymd(d);
      const inMonth = d.getMonth()===m0.getMonth();
      const has = state.daysMap.get(id); // массив слотов
      const hasSlots = Array.isArray(has) && has.length>0;

      const btn = document.createElement('button');
      btn.className = 'cal-day'+(inMonth?'':' muted');
      btn.innerHTML = `${d.getDate()}${hasSlots?'<span class="cal-dot"></span>':''}`;
      if(sameDate(d,new Date())) btn.classList.add('today');

      btn.addEventListener('click', ()=>selectDate(id));
      if(state.selectedDate===id) btn.classList.add('selected');
      root.appendChild(btn);
    }
  }
  function sameDate(a,b){return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();}

  function showMonth(d){
    state.monthDate = stripToFirst(d);
    titleEl().textContent = fmtDate(state.monthDate, I18N?I18N.lang:'ru-RU');
    ensureMonthLoaded(state.monthDate).then(()=>{
      buildWeekHeader();
      buildGrid();
    });
  }

  function selectDate(id){
    state.selectedDate=id;
    dateInput().value = id;
    state.selectedTime=null;
    timeInput().value='';
    // render slots
    const arr = state.daysMap.get(id)||[];
    slotsEl().innerHTML = arr.map(t=>`<button class="slot" data-t="${t}">${t}</button>`).join('');
  }

  function attachSlotsClick(){
    slotsEl().addEventListener('click', (e)=>{
      const b = e.target.closest('.slot'); if(!b) return;
      state.selectedTime = b.dataset.t;
      timeInput().value = state.selectedTime;
      slotsEl().querySelectorAll('.slot').forEach(x=>x.classList.toggle('selected', x===b));
    });
  }

  // JSONP helper
  function jsonp(url){
    return new Promise((resolve,reject)=>{
      const cb = url.match(/callback=([^&]+)/)[1];
      window[cb] = (data)=>{ resolve(data); cleanup(); };
      const s = document.createElement('script');
      s.src = url; s.onerror = ()=>{ reject(new Error('JSONP error')); cleanup(); };
      document.body.appendChild(s);
      function cleanup(){ delete window[cb]; s.remove(); }
      setTimeout(()=>reject(new Error('timeout')), 15000);
    });
  }

  function goPrev(){ showMonth(new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()-1, 1)); }
  function goNext(){ showMonth(new Date(state.monthDate.getFullYear(), state.monthDate.getMonth()+1, 1)); }
  function goToday(){ showMonth(new Date()); }

  function wireUI(){
    document.getElementById('btnPrev').addEventListener('click', goPrev);
    document.getElementById('btnNext').addEventListener('click', goNext);
    document.getElementById('btnToday').addEventListener('click', goToday);
    attachSlotsClick();
  }

  // helper: пройти вперёд по месяцам и найти nearest
async function findNearestWithin(monthStart, maxMonths=6){
  let cursor = new Date(monthStart);
  for(let i=0;i<maxMonths;i++){
    await ensureMonthLoaded(cursor);
    // пробуем найти ближайший в уже загруженных днях этого месяца
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const to   = new Date(cursor.getFullYear(), cursor.getMonth()+1, 0);
    const now  = new Date();
    let best = null;
    for(let d=new Date(from); d<=to; d.setDate(d.getDate()+1)){
      const id = ymd(d);
      const slots = state.daysMap.get(id);
      if(Array.isArray(slots)){
        for(const t of slots){
          const dt = new Date(id+'T'+t+':00');
          if(dt>now && (!best || dt<best.dt)) best = {date:id, time:t, dt};
        }
      }
    }
    if(best) return {date:best.date, time:best.time};
    // иначе следующий месяц
    cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, 1);
  }
  return null;
}

// показать/скрыть сообщение "нет мест"
function setNoSlotsMsg(show){
  const el = document.getElementById('noSlotsMsg');
  if(!el) return;
  el.style.display = show ? 'block' : 'none';
}

// старт
document.addEventListener('DOMContentLoaded', async ()=>{
  wireUI();

  // ищем ближайший в горизонте до 6 мес
  const nearest = await findNearestWithin(state.monthDate, 6);

  if(nearest){
    state.nearest = nearest;
    const d = new Date(nearest.date+'T00:00:00');
    showMonth(d);
    selectDate(nearest.date);
    setNoSlotsMsg(false);
  }else{
    // ничего не нашли — показываем текущий месяц и сообщение
    await ensureMonthLoaded(state.monthDate);
    showMonth(state.monthDate);
    setNoSlotsMsg(true);
    // очищаем слоты визуально
    slotsEl().innerHTML = '';
  }
  });
})();
