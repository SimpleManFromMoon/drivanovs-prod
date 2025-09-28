// Универсальный календарь для booking.html
(function () {
  // Подстраховка: запускаем только на странице, где есть сетка календаря
  document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('#cal-grid');
    if (!grid) return; // не booking.html

    const cfg = window.APP_CONFIG || {};
    if (!cfg.ENDPOINT) {
      console.warn('APP_CONFIG.ENDPOINT not provided');
      return;
    }

    // ====== helpers ======
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const ym  = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const fromMonthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
    const toMonthEnd     = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);

    // jsonp
    function jsonp(url) {
      return new Promise((resolve, reject) => {
        const cb = '__onSlots_' + Date.now();
        const scr = document.createElement('script');
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('JSONP timeout'));
        }, 15000);

        window[cb] = data => {
          cleanup();
          resolve(data);
        };

        function cleanup() {
          clearTimeout(timer);
          delete window[cb];
          scr.remove();
        }

        scr.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
        scr.onerror = () => { cleanup(); reject(new Error('JSONP error')); };
        document.head.appendChild(scr);
      });
    }

    // ====== state ======
    const state = {
      month: fromMonthStart(new Date()),
      cache: new Map(),             // 'YYYY-MM' -> [{date:'YYYY-MM-DD', slots:['15:00',...]}]
      selectedDate: null
    };

    // ====== elements ======
    const elMonth = document.querySelector('#cal-month');
    const elPrev  = document.querySelector('#cal-prev');
    const elNext  = document.querySelector('#cal-next');
    const elTimes = document.querySelector('#slot-times');

    const elNextDate = document.querySelector('#next-slot-date');
    const elNextTime = document.querySelector('#next-slot-time');
    const elNextBtn  = document.querySelector('#next-slot-btn');

    const formDate = document.querySelector('#form-date');
    const formTime = document.querySelector('#form-time');

    // ====== month navigation ======
    elPrev.addEventListener('click', () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
      render();
    });
    elNext.addEventListener('click', () => {
      state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
      render();
    });

    // ====== data loading ======
    async function ensureMonthLoaded(d) {
      const key = ym(d);
      if (state.cache.has(key)) return;

      const from = `${key}-01`;
      const end  = toMonthEnd(d);
      const to   = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

      const url = `${cfg.ENDPOINT}?action=slots&from=${from}&to=${to}`;
      const payload = await jsonp(url);
      // payload = {days:[{date:'YYYY-MM-DD', slots:['15:00',...]}]}
      state.cache.set(key, (payload && payload.days) ? payload.days : []);
    }

    function getSlotsMapForMonth(d) {
      const list = state.cache.get(ym(d)) || [];
      const map = new Map();
      for (const day of list) map.set(day.date, day.slots || []);
      return map;
    }

    // ====== render ======
    async function render() {
      await ensureMonthLoaded(state.month);

      const monthName = state.month.toLocaleString(I18N?.lang || 'ru', {month:'long', year:'numeric'});
      elMonth.textContent = monthName;

      grid.innerHTML = '';
      elTimes.innerHTML = '';

      const first = fromMonthStart(state.month);
      const last  = toMonthEnd(state.month);
      const startWeekDay = (first.getDay() + 6) % 7; // Пн=0

      const map = getSlotsMapForMonth(state.month);
      const todayStr = ymd(new Date());

      // пустые клетки до 1-го числа
      for (let i=0; i<startWeekDay; i++){
        const stub = document.createElement('div');
        stub.className = 'day is-disabled';
        stub.setAttribute('aria-hidden','true');
        grid.appendChild(stub);
      }

      for (let d=1; d<=last.getDate(); d++){
        const date = new Date(state.month.getFullYear(), state.month.getMonth(), d);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'day';
        cell.textContent = d;

        const dateStr = ymd(date);
        if (dateStr === todayStr) cell.classList.add('is-today');

        const slots = map.get(dateStr);
        if (slots && slots.length){
          const dot = document.createElement('span');
          dot.className = 'dot';
          cell.appendChild(dot);
          cell.addEventListener('click', () => selectDate(dateStr, slots, cell));
        } else {
          cell.classList.add('is-disabled');
        }

        if (state.selectedDate === dateStr) cell.classList.add('is-selected');

        grid.appendChild(cell);
      }
    }

    function selectDate(dateStr, slots, cellEl){
      state.selectedDate = dateStr;

      // подсветка клетки
      document.querySelectorAll('.day').forEach(el => el.classList.remove('is-selected'));
      cellEl?.classList.add('is-selected');

      // заполняем время
      elTimes.innerHTML = '';
      slots.forEach(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'time';
        b.textContent = t;
        b.addEventListener('click', () => {
          formDate.value = dateStr;
          formTime.value = t;
        });
        elTimes.appendChild(b);
      });

      // и в форму дату
      formDate.value = dateStr;
      formTime.value = '';
    }

    // ====== nearest slot ======
    async function updateNearest() {
      // ищем максимум в пределах горизонта 6 месяцев
      const probe = new Date();
      for (let i=0; i<6; i++){
        const dt = new Date(probe.getFullYear(), probe.getMonth() + i, 1);
        await ensureMonthLoaded(dt);
        const list = state.cache.get(ym(dt)) || [];
        for (const d of list){
          if (d.slots && d.slots.length){
            const when = new Date(d.date + 'T' + d.slots[0] + ':00');
            elNextDate.textContent = when.toLocaleDateString(I18N?.lang || 'ru', {day:'2-digit', month:'long'});
            elNextTime.textContent = d.slots[0];

            elNextBtn.onclick = () => {
              state.month = fromMonthStart(new Date(d.date));
              render().then(()=> {
                // кликнуть на саму дату
                const idx = Number(d.date.slice(-2));
                const cells = [...document.querySelectorAll('.day')].filter(x => !x.classList.contains('is-disabled'));
                // более надёжно: вручную выделим по exact date
                const all = document.querySelectorAll('.day');
                for (const c of all){
                  if (c.textContent === String(idx) && !c.classList.contains('is-disabled')){
                    selectDate(d.date, d.slots, c);
                    c.scrollIntoView({block:'center', behavior:'smooth'});
                    break;
                  }
                }
              });
            };
            return;
          }
        }
      }
      // если нет свободных слотов
      elNextDate.textContent = '';
      elNextTime.textContent = '';
      elNextBtn.disabled = true;
    }

    // стартовая отрисовка
    render().then(updateNearest);

    // ====== отправка формы (минимальная заглушка) ======
    document.querySelector('#book-form')?.addEventListener('submit', (e)=>{
      e.preventDefault();
      // Здесь остаётся ваша логика отправки в Apps Script (у вас уже реализовано)
      alert('Заявка отправлена: ' + (formDate.value || '—') + ' ' + (formTime.value || '—'));
    });
  });
})();
