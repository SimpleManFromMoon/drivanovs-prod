/** Google Apps Script backend: два типа (office / online) */

var CONFIG = {
  TIMEZONE: 'Europe/Riga',

  // КАЛЕНДАРИ ДОСТУПНОСТИ (туда ставишь «окна»)
  AVAILABILITY: {
    office: '8f298ae2bfa306face1f60401a44aa4f5f593d88638d01b2475cb24955840520@group.calendar.google.com',
    online: '642fb49d8ceac4297e3ca13e0309b47213099748ee44fedbf0681d882ae6ca35@group.calendar.google.com'
  },

  // КАЛЕНДАРЬ ДЛЯ РЕАЛЬНЫХ ВСТРЕЧ (можно 'primary')
  APPOINTMENTS_CAL: 'primary',

  SLOT_MINUTES: 30
};

/*** === LIMITS / NONCE === ***/
const LIMITS = {
  MAX_PER_30D: 2,
  BURST_PER_MIN: 5,
  BURST_PER_10MIN: 20,
  NONCE_TTL_MIN: 10
};
function _now(){ return Date.now(); }
function _ip_(e){ try{ return (e && e.context && e.context.clientIp) || (e && e.parameter && e.parameter.ip) || '0.0.0.0'; }catch(err){ return '0.0.0.0'; } }
function _param(e,name,def){ const v=(e.parameter&&e.parameter[name])||def||''; return String(v||'').trim(); }
const CACHE = CacheService.getScriptCache();
const PROPS = PropertiesService.getScriptProperties();
function _getJSON(key, def){ try{ const v=PROPS.getProperty(key); return v?JSON.parse(v):(def||null); }catch(e){ return def||null; } }
function _setJSON(key, obj){ PROPS.setProperty(key, JSON.stringify(obj)); }

// nonce
function nonceCreate_(e){
  const ip  = _ip_(e);
  const cid = _param(e,'cid','nocid');
  const nonce = Utilities.getUuid();
  const rec = { ip, cid, at:_now(), used:false };
  CACHE.put('nonce:'+nonce, JSON.stringify(rec), LIMITS.NONCE_TTL_MIN*60);
  return nonce;
}

function nonceUse_(e, nonce){
  if(!nonce) return false;
  const k = 'nonce:'+nonce;
  const raw = CACHE.get(k);
  if(!raw) return false;
  const rec = JSON.parse(raw);
  if(rec.used) return false;

  // сверяем IP, если он был сохранён
  const currIp = _ip_(e);
  if(rec.ip && rec.ip !== '0.0.0.0' && rec.ip !== currIp) return false;

  // сверяем cid, если он был сохранён «по-настоящему»
  const currCid = _param(e,'cid','nocid');
  if(rec.cid && rec.cid !== 'nocid' && rec.cid !== currCid) return false;

  // TTL
  if((_now() - rec.at) > LIMITS.NONCE_TTL_MIN*60*1000) return false;

  rec.used = true;
  CACHE.put(k, JSON.stringify(rec), 60); // добиваем быстрое истечение
  return true;
}

// rate-limit
function _key_(email, phone, ip, cid){
  const normEmail = String(email||'').trim().toLowerCase();
  const normPhone = String(phone||'').replace(/[^\d+]/g,'');
  return [normEmail||'-', normPhone||'-', ip||'-', cid||'-'].join('|');
}
function _allow_(key){
  const now = _now();
  const minute = 60*1000, ten = 10*60*1000, d30 = 30*24*60*60*1000;
  const obj = _getJSON('rate:'+key, { last:[] , month:[] }) || { last:[], month:[] };
  obj.last = (obj.last||[]).filter(ts => (now-ts)<=ten);
  obj.month= (obj.month||[]).filter(ts => (now-ts)<=d30);
  const perMin = obj.last.filter(ts => (now-ts)<=minute).length;
  const per10m = obj.last.length;
  const per30d = obj.month.length;
  if(perMin >= LIMITS.BURST_PER_MIN)  return { ok:false, code:'rate' };
  if(per10m >= LIMITS.BURST_PER_10MIN)return { ok:false, code:'rate' };
  if(per30d >= LIMITS.MAX_PER_30D)    return { ok:false, code:'limit' };
  obj.last.push(now); obj.month.push(now);
  _setJSON('rate:'+key, obj);
  return { ok:true };
}

/*** === UTIL === ***/
function reply_(e, obj) {
  var body = JSON.stringify(obj || {});
  var cb = (e && e.parameter && e.parameter.callback) ? String(e.parameter.callback) : '';
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
function fmt_(d, pat){ return Utilities.formatDate(d, CONFIG.TIMEZONE || 'Europe/Riga', pat); }
function _startOfDay_(s){ var p=String(s||'').split('-'); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]), 0,0,0,0); }
function _endOfDay_(s){ var p=String(s||'').split('-'); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]), 23,59,59,999); }
function _hhmm_(d){ var h=d.getHours(), m=d.getMinutes(); return (h<10?'0':'')+h+':' + (m<10?'0':'')+m; }

/*** === SLOTS === ***/
// ЧИТАЕМ e.parameter.from / e.parameter.to и возвращаем {days:[{date,office[],online[]}]}
function getSlots_(e){
  var fromISO = (e && e.parameter && e.parameter.from) || '';
  var toISO   = (e && e.parameter && e.parameter.to)   || '';
  if(!fromISO || !toISO) return { days: [] };

  var from = _startOfDay_(fromISO);
  var to   = _endOfDay_(toISO);
  var DUR  = Number(CONFIG.SLOT_MINUTES || 30);
  var map = {}; // date -> {office:[], online:[]}

  function collect(kind){
    var calId = CONFIG.AVAILABILITY[kind];
    if(!calId) return;
    var cal = CalendarApp.getCalendarById(calId);
    if(!cal) return;

    var evs = cal.getEvents(from, to);
    for (var i=0;i<evs.length;i++){
      var ev = evs[i];
      if (ev.isAllDayEvent && ev.isAllDayEvent()) continue;
      var st = ev.getStartTime();
      var en = ev.getEndTime();

      // режем на интервалы длительностью слота
      for (var t = new Date(st); (t.getTime()+DUR*60000) <= en.getTime(); t = new Date(t.getTime()+DUR*60000)){
        var ds = fmt_(t, 'yyyy-MM-dd');
        var tm = fmt_(t, 'HH:mm');
        if(!map[ds]) map[ds] = { office:[], online:[] };
        var arr = map[ds][kind];
        if(arr.indexOf(tm) === -1) arr.push(tm);
      }
    }
  }

  collect('office');
  collect('online');

  var days = Object.keys(map).sort().map(function(ds){
    var o = map[ds]; o.office.sort(); o.online.sort();
    return { date: ds, office: o.office, online: o.online };
  });
  return { days: days };
}

// ПРОСТАЯ ПРОВЕРКА СЛОТА
function checkSlot_(e){
  var d = String((e.parameter && e.parameter.date) || '');
  var t = String((e.parameter && e.parameter.time) || '');
  var k = String((e.parameter && e.parameter.kind) || 'office').toLowerCase();
  // запрет на прошлое
  var y=+d.slice(0,4), m=+d.slice(5,7), dd=+d.slice(8,10);
  var hh=+t.slice(0,2), mm=+t.slice(3,5);
  var now = new Date();
  var when = new Date(y, m-1, dd, hh, mm, 0, 0);
  if (when <= now) return { ok:false };

  if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return { ok:false };

  var data = getSlots_({ parameter:{ from:d, to:d } });
  var ok = false;
  for (var i=0;i<data.days.length;i++){
    if (data.days[i].date === d){
      var arr = (k==='online') ? data.days[i].online : data.days[i].office;
      if (arr.indexOf(t) > -1) ok = true;
    }
  }
  return { ok: ok };
}

/*** === ROUTER === ***/
function doGet(e){
  var action = (e.parameter && e.parameter.action) || '';

  if (action === 'nonce') {
    return reply_(e, { nonce: nonceCreate_(e) });
  }
  if (action === 'slots') {
    return reply_(e, getSlots_(e));
  }
  if (action === 'check') {
    return reply_(e, checkSlot_(e));
  }

  return reply_(e, { ok:false, error:'unknown' });
}

/*** === BOOK === ***/
function doPost(e){
  const ip   = _ip_(e);
  const cid  = _param(e,'cid','nocid');
  const name = _param(e,'name');
  const email= _param(e,'email');
  const phone= _param(e,'phone');
  const notes= _param(e,'notes');
  const date = _param(e,'date');          // YYYY-MM-DD
  const time = _param(e,'time');          // HH:MM
  const kind = _param(e,'kind','office').toLowerCase();
  const dur  = Number(_param(e,'dur', String(CONFIG.SLOT_MINUTES||30)));
  const nonce= _param(e,'nonce','');

  if(_param(e,'website','')) return ContentService.createTextOutput(JSON.stringify({ok:false,error:'input'})).setMimeType(ContentService.MimeType.JSON);
  if(!name || !email || !date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'input'})).setMimeType(ContentService.MimeType.JSON);
  }
  if(!nonceUse_(e, nonce)){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'nonce'})).setMimeType(ContentService.MimeType.JSON);
  }

  const r = _allow_(_key_(email, phone, ip, cid));
  if(!r.ok){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:r.code})).setMimeType(ContentService.MimeType.JSON);
  }

  // Собираем локальную дату/время без UTC-сдвигов
  var y = Number(date.slice(0,4));
  var m = Number(date.slice(5,7));
  var d = Number(date.slice(8,10));
  var hh= Number(time.slice(0,2));
  var mm= Number(time.slice(3,5));
  const startDt = new Date(y, m-1, d, hh, mm, 0, 0);
  const endDt   = new Date(startDt.getTime() + dur*60000);

  if (startDt <= new Date()) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'past'}))
      .setMimeType(ContentService.MimeType.JSON);
  }


  // Проверяем окно доступности
  const avCalId = CONFIG.AVAILABILITY[kind] || CONFIG.AVAILABILITY.office;
  const av = CalendarApp.getCalendarById(avCalId);
  const existing = av.getEvents(startDt, endDt);
  if(existing.length === 0){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'slot'})).setMimeType(ContentService.MimeType.JSON);
  }

  // Создаём встречу
  const main = CalendarApp.getCalendarById(CONFIG.APPOINTMENTS_CAL);
  const title = (kind==='online' ? 'Online' : 'Office') + ' consultation';
  main.createEvent(title, startDt, endDt, {
    description: 'Пациент: '+name+'\nEmail: '+email+'\nТел: '+phone+'\nТип: '+kind+'\n\n'+(notes||''),
    guests: email || null,
    sendInvites: !!email
  });

  // Удаляем исходное окно
  existing.forEach(function(ev){ ev.deleteEvent(); });

  return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
}
