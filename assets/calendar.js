/* Календарь + «ближайшая запись».
   Работает с CONFIG.{ENDPOINT, SLOT_MINUTES, LEAD_HOURS, HORIZON_DAYS} */

(function () {
  const $  = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));

  // DOM
  const tbody      = $('#calendar tbody');
  const monthLabel = $('#month-label');
  const daySlots   = $('#day-slots');

  const nextDateEl = $('#next-slot-date');
  const nextTimeEl = $('#next-slot-time');
  const nextJump   = $('#next-slot-jump');

  // состояние
  const state = {
    current: new Date(),
    busy: false,
    map: new Map(),          // 'yyyy-mm' -> [{date:'yyyy-mm-dd', slots:[..]}]
    selected: null,          // 'yyyy-mm-dd'
    nextSlot: null           // {date, time}
  };

  // формататоры
  const ruMonth = new Intl.DateTimeFormat('ru-RU',{month:'long'});
  const dmFmt   = new Intl.DateTimeFormat('ru-RU',{day:'2-digit', month:'long'});
  const timeFmt = new Intl.DateTimeFormat('ru-RU',{hour:'2-digit', minute:'2-digit'});

  const pad2 = n => String(n).padStart(2,'0');

  /* ---------- Рисуем сетку месяца ---------- */
  function buildGrid(date = state.current) {
    const y = date.getFullYear(), m = date.getMonth(); // 0..11
    monthLabel.textContent =
      `${ruMonth.format(new Date(y,m,1))} ${y} г.`.replace(/^[а-я]/, s=>s.toUpperCase());

    // начало недели: понедельник
    const first = new Date(y, m, 1);
    let startIdx = (first.getDay() + 6) % 7;                 // 0..6, Пн = 0
    const daysInMonth = new Date(y, m+1, 0).getDate();

    tbody.innerHTML = '';
    let tr = document.createElement('tr');

    // ячейки до 1-го числа
    for (let i=0;i<startIdx;i++) tr.appendChild(document.createElement('td'));

    for (let d=1; d<=daysInMonth; d++){
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type='button'; btn.className='day';
      btn.innerHTML = `<span class="num">${d}</span>`;

      const dateStr = `${y}-${pad2(m+1)}-${pad2(d)}`;
      btn.dataset.date = dateStr;

      // «сегодня»
      const today = new Date();
      if (today.getFullYear()===y && today.getMonth()===m && today.getDate()===d){
        btn.classList.add('is-today');
      }

      // точка, если есть слоты; иначе дизейблим
      const monthKey = `${y}-${pad2(m+1)}`;
      const dayData = (state.map.get(monthKey)||[]).find(x=>x.date===dateStr);
      if (dayData && dayData.slots && dayData.slots.length){
        const dot = document.createElement('i'); dot.className='dot'; btn.appendChild(dot);
      } else {
        btn.disabled = true;
      }

      btn.addEventListener('click', ()=>selectDay(dateStr));
      td.appendChild(btn); tr.appendChild(td);

      if ((startIdx + d) % 7 === 0 || d===daysInMonth){
        tbody.appendChild(tr); tr=document.createElement('tr');
      }
    }

    // выделение ранее выбранной даты
    $$('button.day').forEach(b=>b.classList.remove('is-selected'));
    if (state.selected){
      const b = document.querySelector(`button.day[data-date="${state.selected}"]`);
      if (b) b.classList.add('is-selected');
    }
  }

  /* ---------- Список слотов дня ---------- */
  function renderDaySlots(dateStr){
    daySlots.innerHTML = '';
    $('#booking-form [name="date"]').value = '';
    $('#booking-form [name="time"]').value = '';

    const [y,m,d] = dateStr.split('-').map(Number);
    const monthKey = `${y}-${pad2(m)}`;
    const dayData = (state.map.get(monthKey)||[]).find(x=>x.date===dateStr);
    if (!dayData || !dayData.slots.length) return;

    dayData.slots.forEach(t=>{
      const btn=document.createElement('button');
      btn.type='button'; btn.textContent=t;
      btn.addEventListener('click', ()=>{
        $$('#day-slots button').forEach(b=>b.classList.remove('is-active'));
        btn.classList.add('is-active');
        $('#booking-form [name="date"]').value = dateStr;
        $('#booking-form [name="time"]').value = t;
        $('#chosen').textContent = `${dmFmt.format(new Date(y,m-1,d))}, ${t}`;
      });
      daySlots.appendChild(btn);
    });
  }

  /* ---------- Выбор дня ---------- */
  function selectDay(dateStr){
    state.selected = dateStr;
    $$('#calendar .day').forEach(b=>b.classList.toggle('is-selected', b.dataset.date===dateStr));
    renderDaySlots(dateStr);
  }

  /* ---------- Навигация по месяцам ---------- */
  $('#prev').addEventListener('click', ()=>{
    state.current = new Date(state.current.getFullYear(), state.current.getMonth()-1, 1);
    ensureMonthLoaded(buildGrid);
  });
  $('#next').addEventListener('click', ()=>{
    state.current = new Date(state.current.getFullYear(), state.current.getMonth()+1, 1);
    ensureMonthLoaded(buildGrid);
  });

  /* ---------- JSONP загрузка слотов месяца ---------- */
  function ensureMonthLoaded(cb){
    const y = state.current.getFullYear(), m = state.current.getMonth()+1;
    const key = `${y}-${pad2(m)}`;
    if (state.map.has(key)){ cb && cb(); return; }

    if (state.busy) return;
    state.busy = true;

    // диапазон на месяц
    const from = `${y}-${pad2(m)}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to   = `${y}-${pad2(m)}-${pad2(lastDay)}`;

    const cbName = `__onSlots_${Date.now()}`;
    window[cbName] = payload=>{
      try{
        // payload: {days:[{date:'yyyy-mm-dd', slots:[..]}]}
        const grouped = new Map();
        payload.days.forEach(d=>{
          const mk = d.date.slice(0,7);
          if (!grouped.has(mk)) grouped.set(mk, []);
          grouped.get(mk).push(d);
        });
        grouped.forEach((v,k)=>state.map.set(k, v));
      }finally{
        cleanup();
      }
      cb && cb();
      updateNextSlotBanner();
    };

    const s = document.createElement('script');
    s.src = `${CONFIG.ENDPOINT}?action=slots&from=${from}&to=${to}&callback=${cbName}&v=${Date.now()}`;
    s.onerror = ()=>{ cleanup(); cb && cb(); };
    document.body.appendChild(s);

    function cleanup(){
      state.busy=false; delete window[cbName]; s.remove();
    }
  }

  /* ---------- Ближайшая запись + «Перейти» ---------- */
  function updateNextSlotBanner(){
    // ищем ближайший слот среди уже загруженных месяцев
    let next = null;
    [...state.map.values()].flat().forEach(d=>{
      d.slots.forEach(t=>{
        const dt = new Date(`${d.date}T${t}:00`);
        if (dt > new Date()){
          if (!next || dt < next.dt) next = {date:d.date, time:t, dt};
        }
      });
    });

    if (!next){
      nextDateEl.textContent = '';
      nextTimeEl.textContent = '';
      nextJump.disabled = true;
      return;
    }

    state.nextSlot = next;
    const [y,m,dd] = next.date.split('-').map(Number);
    nextDateEl.textContent = dmFmt.format(new Date(y,m-1,dd));
    nextTimeEl.textContent = timeFmt.format(new Date(y,m-1,dd, ...next.time.split(':').map(Number)));
    nextJump.disabled = false;
  }

  nextJump.addEventListener('click', ()=>{
    if (!state.nextSlot) return;
    const [y,m] = state.nextSlot.date.split('-').map(Number);

    const needMonth = new Date(y, m-1, 1);
    const sameMonth = state.current.getFullYear()===needMonth.getFullYear()
                   && state.current.getMonth()===needMonth.getMonth();

    const go = ()=>{
      buildGrid(needMonth);
      selectDay(state.nextSlot.date);
      $('#calendar').scrollIntoView({behavior:'smooth', block:'start'});
    };

    if (!sameMonth){
      state.current = needMonth;
      ensureMonthLoaded(go);
    }else{
      go();
    }
  });

  /* ---------- Инициализация ---------- */
  ensureMonthLoaded(()=>{ buildGrid(); updateNextSlotBanner(); });

  // Отправка формы
  window.submitBooking = async function (e){
    e.preventDefault();
    const form = e.currentTarget;
    const out  = $('#booking-out');
    const fd   = new FormData(form);

    if (!fd.get('date') || !fd.get('time')){
      out.textContent = 'Пожалуйста, выберите дату и время.'; return;
    }
    out.textContent = 'Запрос отправлен. Проверьте почту и календарь.';

    try{
      const resp = await fetch(CONFIG.ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'book', payload:Object.fromEntries(fd)})
      });
      if (!resp.ok) throw new Error('Network');
    }catch(_){
      out.textContent = 'Сбой соединения. Проверьте endpoint.';
    }
  };
})();
