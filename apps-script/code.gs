
/** Apps Script backend (LOCAL-READY, with locking and checks) */
var CONFIG = {
  CALENDAR_ID_BOOKING: 'primary',               // замените на нужный календарь брони
  CALENDAR_ID_SCHEDULE: 'primary',              // календарь с рабочими окнами
  TIMEZONE: 'Europe/Riga',
  SLOT_DURATION_MINUTES: 25,
  SLOT_GAP_MINUTES: 5,
  LEAD_HOURS: 24,
  HORIZON_DAYS: 60,
  SCHEDULE_TITLE_CONTAINS: ''                   // пусто = любые окна
};

function formatYMD(d){ return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'); }
function _toLocalDate(ymd, hm){
  var p = ymd.split('-'), t = hm.split(':');
  return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]), Number(t[0]), Number(t[1]), 0);
}

function doGet(e){
  try{
    if(e && e.parameter && e.parameter.action==='slots'){
      var from = e.parameter.from, to = e.parameter.to;
      var now = new Date();
      var horizonTo = new Date(now.getTime() + (CONFIG.HORIZON_DAYS||30)*24*3600*1000);
      var toMax = (to ? new Date(to+'T23:59:59') : horizonTo);
      if (toMax > horizonTo) to = formatYMD(horizonTo);
      var cb = e.parameter.callback || '__onSlots';

      var cacheKey = 'slots:'+from+':'+to+':'+(CONFIG.SLOT_DURATION_MINUTES||60)+':'+(CONFIG.SLOT_GAP_MINUTES||0);
      var cache = CacheService.getScriptCache();
      var cached = cache.get(cacheKey);
      if (cached){
        return ContentService.createTextOutput(cb+'('+cached+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
      }

      var days = computeSlotsFromSchedule(from, to);
      var payload = JSON.stringify({days:days});
      cache.put(cacheKey, payload, 600);
      return ContentService.createTextOutput(cb+'('+payload+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    if (e && e.parameter && e.parameter.action==='check' && e.parameter.date && e.parameter.time){
      var start = _toLocalDate(e.parameter.date, e.parameter.time);
      var end = new Date(start.getTime() + (CONFIG.SLOT_DURATION_MINUTES||60)*60000);
      var ok = !hasConflict(start,end) && isInsideSchedule(start,end);
      var cb2 = e.parameter.callback || '__check';
      return ContentService.createTextOutput(cb2+'('+JSON.stringify({ok:ok})+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return ContentService.createTextOutput(JSON.stringify({status:'ok'})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({status:'error', message:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e){
  var lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try{
    var body = JSON.parse(e.postData.contents||'{}');
    var name  = sanitize(body.name);
    var email = sanitize(body.email);
    var phone = sanitize(body.phone);
    var notes = sanitize(body.notes).slice(0,600);
    var mode  = String(body.mode||'in_person');
    var date  = String(body.date||''); var time = String(body.time||'');
    var durationMin = CONFIG.SLOT_DURATION_MINUTES;

    if (!isValidName(name))  return _json({status:'error', message:'bad_name'});
    if (!isEmail(email))     return _json({status:'error', message:'bad_email'});
    if (phone && !isPhone(phone)) return _json({status:'error', message:'bad_phone'});

    var start = _toLocalDate(date,time);
    var end   = new Date(start.getTime() + durationMin*60000);

    var soon = new Date(new Date().getTime() + (CONFIG.LEAD_HOURS||0)*3600*1000);
    if(start < soon) return _json({status:'error', message:'too_soon'});
    if(!isInsideSchedule(start,end)) return _json({status:'error', message:'outside'});
    if(hasConflict(start,end)) return _json({status:'busy'});

    var cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID_BOOKING);
    var ev = cal.createEvent('Консультация — '+name, start, end, {
      description: 'Имя: '+name+'\nE-mail: '+email+'\nФормат: '+(mode==='online'?'Онлайн':'Очный')+'\nКомментарий: '+notes,
      guests: email ? email : null,
      sendInvites: email ? true : false,
      location: (mode==='online' ? 'Google Meet' : 'Кабинет')
    });
    if(mode==='online') ev.addConference('hangoutsMeet');

    return _json({status:'ok', id: ev.getId()});
  }catch(err){
    return _json({status:'error', message:String(err)});
  }finally{
    try{ lock.releaseLock(); }catch(_){}
  }
}

function _json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// --- helpers & validation ---
function sanitize(s){ return (s||'').toString().trim(); }
function isValidName(s){ return /^[A-Za-zĀ-žÀ-ÿЁёА-Яа-я\-'\s]{2,80}$/.test(s||''); }
function isEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s||''); }
function isPhone(s){ return /^\+?[0-9\s\-()]{7,20}$/.test(s||''); }

// schedule -> slots
function computeSlotsFromSchedule(fromYMD,toYMD){
  var tz = CONFIG.TIMEZONE;
  var from = new Date(fromYMD+'T00:00:00');
  var to   = new Date(toYMD+'T23:59:59');
  var calSched = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID_SCHEDULE);
  var calBook  = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID_BOOKING);
  var windows = calSched.getEvents(from,to);
  var busy    = calBook.getEvents(from,to);
  var byDate = {}; // 'YYYY-MM-DD' -> [HH:mm]
  var stepMin = (CONFIG.SLOT_DURATION_MINUTES||60) + (CONFIG.SLOT_GAP_MINUTES||0);
  var stepMs  = stepMin*60000;
  var durMs   = (CONFIG.SLOT_DURATION_MINUTES||60)*60000;
  var gapMs   = (CONFIG.SLOT_GAP_MINUTES||0)*60000;
  var soon = new Date(new Date().getTime() + (CONFIG.LEAD_HOURS||0)*3600*1000);

  function push(dateStr, hhmm){ (byDate[dateStr]=byDate[dateStr]||[]).push(hhmm); }

  windows.forEach(function(ev){
    if(CONFIG.SCHEDULE_TITLE_CONTAINS && !String(ev.getTitle()).includes(CONFIG.SCHEDULE_TITLE_CONTAINS)) return;
    var ws = ev.getStartTime(), we = ev.getEndTime();
    for(var t=new Date(ws); new Date(t.getTime()+durMs)<=we; t=new Date(t.getTime()+stepMs)){
      var tEnd = new Date(t.getTime()+durMs);
      if(t<soon) continue;
      if(!overlapsAny(t, new Date(tEnd.getTime()+gapMs), busy)){
        push(Utilities.formatDate(t, tz, 'yyyy-MM-dd'), Utilities.formatDate(t, tz, 'HH:mm'));
      }
    }
  });
  Object.keys(byDate).forEach(function(k){ byDate[k].sort(); });
  return Object.keys(byDate).sort().map(function(date){ return {date:date, slots:byDate[date]}; });
}

function overlapsAny(s,e,events){
  for(var i=0;i<events.length;i++){
    var a=events[i].getStartTime().getTime(), b=events[i].getEndTime().getTime();
    if(Math.max(s.getTime(), a) < Math.min(e.getTime(), b)) return true;
  }
  return false;
}

function hasConflict(s,e){
  var g=(CONFIG.SLOT_GAP_MINUTES||0)*60000;
  var cal=CalendarApp.getCalendarById(CONFIG.CALENDAR_ID_BOOKING);
  var es=cal.getEvents(new Date(s.getTime()-g), new Date(e.getTime()+g));
  for(var i=0;i<es.length;i++){
    var a=es[i].getStartTime().getTime(), b=es[i].getEndTime().getTime();
    if(Math.max(s.getTime(), a-g) < Math.min(e.getTime()+g, b+g)) return true;
  }
  return false;
}

function isInsideSchedule(s,e){
  var cal=CalendarApp.getCalendarById(CONFIG.CALENDAR_ID_SCHEDULE);
  var es=cal.getEvents(new Date(s.getTime()-1), new Date(e.getTime()+1));
  for(var i=0;i<es.length;i++){
    var a=es[i].getStartTime().getTime(), b=es[i].getEndTime().getTime();
    if(a<=s.getTime() && b>=e.getTime()) return true;
  }
  return false;
}
