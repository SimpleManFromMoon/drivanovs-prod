/**
 * Apps Script backend с двумя календарями доступности (office/online)
 */
const CONFIG = {
  TIMEZONE: 'Europe/Riga',

  // календари ДОСТУПНОСТИ (в них стоят «окна»)
  AVAILABILITY: {
    office: 'office-cal-id@group.calendar.google.com',
    online: 'online-cal-id@group.calendar.google.com'
  },

  // календарь, куда создаём реальные встречи
  APPOINTMENTS_CAL: 'primary',

  SLOT_MINUTES: 30
};

function fmt(d, pat){ return Utilities.formatDate(d, CONFIG.TIMEZONE, pat); }
function parseIsoDateTime(s){ return new Date(s); }

function jsonp_(cb, obj){
  const out = ContentService.createTextOutput(`${cb}(${JSON.stringify(obj)})`);
  out.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return out;
}

function doGet(e){
  const { action, callback } = e.parameter;
  if(action === 'slots'){
    return jsonp_(callback, getSlots_(e.parameter.from, e.parameter.to));
  }
  if(action === 'check'){
    const { date, time, kind } = e.parameter;
    const dur = Number(e.parameter.dur||CONFIG.SLOT_MINUTES);
    const start = parseIsoDateTime(`${date}T${time}:00`);
    const end   = new Date(start.getTime() + dur*60000);
    const cal   = CalendarApp.getCalendarById(CONFIG.AVAILABILITY[kind] || CONFIG.AVAILABILITY.office);
    const exists = cal.getEvents(start, end).length > 0; // окно существует => ок
    return jsonp_(callback, { ok: exists });
  }
  return jsonp_(callback, { err:'unknown action' });
}

function getSlots_(fromISO, toISO){
  const from = parseIsoDateTime(`${fromISO}T00:00:00`);
  const to   = parseIsoDateTime(`${toISO}T23:59:59`);
  const bucket = {}; // date -> {office:[], online:[]}

  Object.keys(CONFIG.AVAILABILITY).forEach(kind=>{
    const cal = CalendarApp.getCalendarById(CONFIG.AVAILABILITY[kind]);
    if(!cal) return;
    const evs = cal.getEvents(from, to);
    evs.forEach(ev=>{
      if (ev.isAllDayEvent()) return;
      const st = ev.getStartTime();
      const dateStr = fmt(st,'yyyy-MM-dd');
      const timeStr = fmt(st,'HH:mm');
      (bucket[dateStr] ||= { office:[], online:[] })[kind].push(timeStr);
    });
  });

  const days = Object.keys(bucket).sort().map(date=>{
    const o=bucket[date]; o.office.sort(); o.online.sort();
    return { date, office:o.office, online:o.online };
  });

  return { days };
}

function doPost(e){
  const p = JSON.parse(e.postData.contents || '{}');
  const { name, email, phone, notes, date, time, kind } = p;
  const dur = Number(p.durationMin || CONFIG.SLOT_MINUTES);
  const start = parseIsoDateTime(`${date}T${time}:00`);
  const end   = new Date(start.getTime() + dur*60000);

  // 1) создаём встречу в рабочем календаре
  const main = CalendarApp.getCalendarById(CONFIG.APPOINTMENTS_CAL);
  const title = (kind==='online' ? 'Online' : 'Office') + ' consultation';
  main.createEvent(title, start, end, {
    description: `Пациент: ${name}\nEmail: ${email}\nТел: ${phone}\nТип: ${kind}\n\n${notes||''}`,
    guests: email || null,
    sendInvites: !!email
  });

  // 2) удаляем исходное окно из соответствующего календаря доступности
  const av = CalendarApp.getCalendarById(CONFIG.AVAILABILITY[kind] || CONFIG.AVAILABILITY.office);
  av.getEvents(start, end).forEach(ev => ev.deleteEvent());

  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}
