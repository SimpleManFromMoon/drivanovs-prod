// assets/calendar.js
(function () {
  // ────────────────────────────────────────────────────────────────────────────
  // State & small utils
  const state = { current: new Date(), slotsByDate: {}, selected: null };
  const CACHE = {};
  const INFLIGHT = {};
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const startOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; };
  const endOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() + (6 - wd)); x.setHours(23, 59, 59, 999); return x; };

  // DOM helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Человекочитаемая дата "23 сентября" на языке браузера
  function humanDateYMD(ds, locale = (navigator.language || 'ru')) {
    const [y, m, d] = ds.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { day: '2-digit', month: 'long' });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Рендер календаря
  function buildGrid() {
    const tbody = document.querySelector('#calendar tbody');
    tbody.innerHTML = '';
    const first = new Date(state.current.getFullYear(), state.current.getMonth(), 1);
    const last = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 0);
    let cur = new Date(startOfWeek(first));
    const end = endOfWeek(last);

    while (cur <= end) {
      const tr = document.createElement('tr');
      for (let i = 0; i < 7; i++) {
        const td = document.createElement('td');
        const ds = ymd(cur);
        td.dataset.date = ds;
        td.textContent = cur.getDate();
        if (cur.getMonth() !== state.current.getMonth()) td.classList.add('other-month');
        if (ds === ymd(new Date())) td.classList.add('today');
        tr.appendChild(td);
        cur.setDate(cur.getDate() + 1);
      }
      tbody.appendChild(tr);
    }

    $('#month-label').textContent = state.current
      .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    paintDots();
  }

  // Обновить «точки» наличия слотов
  function paintDots() {
    $$('#calendar td').forEach(td => {
      const ds = td.dataset.date;
      td.classList.toggle('has-slots', Array.isArray(state.slotsByDate[ds]) && state.slotsByDate[ds].length > 0);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Обработчики
  function attachHandlers() {
    $('#prev').onclick = () => {
      state.current = new Date(state.current.getFullYear(), state.current.getMonth() - 1, 1);
      buildGrid(); loadMonth(true);
    };
    $('#next').onclick = () => {
      state.current = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 1);
      buildGrid(); loadMonth(true);
    };
    $('#calendar').addEventListener('click', (e) => {
      const td = e.target.closest('td[data-date]'); if (!td) return;
      $$('#calendar td').forEach(x => x.classList.remove('active'));
      td.classList.add('active');
      loadDaySlots(td.dataset.date);
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Загрузка слотов за месяц (JSONP)
  function loadMonth(force = false) {
    const key = monthKeyOf(state.current);
    if (!force && CACHE[key]) { state.slotsByDate = CACHE[key]; paintDots(); updateNextSlotBanner(); return; }

    const first = new Date(state.current.getFullYear(), state.current.getMonth(), 1);
    const last = new Date(state.current.getFullYear(), state.current.getMonth() + 1, 0);
    const from = ymd(startOfWeek(first)), to = ymd(endOfWeek(last));
    loadSlotsJSONP(from, to, key);
  }

  function loadSlotsJSONP(from, to, key) {
    if (INFLIGHT[key]) return;
    const cb = `__onSlots_${Date.now()}`;
    const s = document.createElement('script');
    s.src = `${APP_CONFIG.ENDPOINT}?action=slots&from=${from}&to=${to}&callback=${cb}&v=${Date.now()}`;

    window[cb] = (payload) => {
      const map = {};
      (payload?.days || []).forEach(d => map[d.date] = d.slots || []);
      CACHE[key] = map; state.slotsByDate = map;
      paintDots();
      if (state.selected?.date) renderDaySlots(state.selected.date);
      updateNextSlotBanner();
      cleanup();
    };
    const cleanup = () => { delete window[cb]; s.remove(); delete INFLIGHT[key]; };
    s.onerror = cleanup;
    INFLIGHT[key] = { script: s };
    document.head.appendChild(s);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Слоты конкретного дня
  function loadDaySlots(ds) {
    state.selected = { date: ds, time: null };
    renderDaySlots(ds);
    updateNextSlotBanner(); // чтобы кнопка «Перейти» знала актуальный месяц/день
  }

  function renderDaySlots(ds) {
    const box = $('#day-slots'); box.innerHTML = '';
    const list = state.slotsByDate[ds] || [];
    if (list.length === 0) { box.innerHTML = '<p class="muted">—</p>'; return; }

    list.forEach(t => {
      const b = document.createElement('button');
      b.className = 'chip slot-btn'; b.type = 'button'; b.dataset.time = t; b.textContent = t;
      b.onclick = () => {
        state.selected = { date: ds, time: t };
        $$('#day-slots .chip').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        $('#chosen').textContent = `${ds} ${t}`;
        const f = $('#booking-form'); if (f) { f.date.value = ds; f.time.value = t; }
      };
      box.appendChild(b);
    });
  }

  // Локально убрать слот после брони (чтобы кнопка исчезла мгновенно)
  window.locallyRemoveSlot = function (ds, t) {
    if (state.slotsByDate[ds]) state.slotsByDate[ds] = state.slotsByDate[ds].filter(x => x !== t);
    renderDaySlots(ds); paintDots(); updateNextSlotBanner();
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Поиск ближайшего слота (объект {date, slots})
  async function findNext() {
    const from = ymd(new Date());
    const to = ymd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)); // 90 дней вперёд
    const cb = `__next_${Date.now()}`;

    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = `${APP_CONFIG.ENDPOINT}?action=slots&from=${from}&to=${to}&callback=${cb}&v=${Date.now()}`;

      window[cb] = (payload) => {
        const days = payload?.days || [];
        const first = days.find(d => Array.isArray(d.slots) && d.slots.length > 0);
        resolve(first ? { date: first.date, slots: first.slots } : null);
        s.remove(); delete window[cb];
      };

      s.onerror = () => { resolve(null); s.remove(); delete window[cb]; };
      document.head.appendChild(s);
    });
  }

  // Перейти к нужной дате и выделить её
  function jumpTo(ds, t) {
    const [y, m] = ds.split('-').map(Number);
    state.current = new Date(y, m - 1, 1);
    buildGrid(); loadMonth(true);

    // Немного подождать, пока проставятся точки/данные
    setTimeout(() => {
      const td = $(`#calendar td[data-date="${ds}"]`);
      if (td) {
        td.click();
        if (t) {
          setTimeout(() => {
            const btn = $(`#day-slots .slot-btn[data-time="${t}"]`);
            if (btn) btn.click();
          }, 150);
        }
      }
    }, 200);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Баннер «Ближайшая запись»
  async function updateNextSlotBanner() {
    const box = $('#next-slot-banner');
    if (!box) return; // баннера нет на странице — тихо выходим

    const dEl = $('#next-slot-date');
    const tEl = $('#next-slot-time');

    let next;
    try {
      next = await findNext();
    } catch (_) {
      next = null;
    }

    if (!next || !next.date || !Array.isArray(next.slots) || next.slots.length === 0) {
      box.classList.add('hidden');
      return;
    }

    if (dEl) dEl.textContent = humanDateYMD(next.date);
    if (tEl) tEl.textContent = next.slots[0];
    box.classList.remove('hidden');

    box.onclick = () => jumpTo(next.date, next.slots[0]);
  }

  // ────────────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    buildGrid();
    attachHandlers();
    loadMonth();
    updateNextSlotBanner();
  });
})();
