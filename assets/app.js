
// assets/app.js
function validateForm(form){
  const RX = {
    name: /^[A-Za-zĀ-žÀ-ÿЁёА-Яа-я\-'\s]{2,80}$/,
    phone: /^\+?[0-9\s\-()]{7,20}$/
  };
  const name = (form.name?.value||'').trim();
  const email = (form.email?.value||'').trim();
  const phone = (form.phone?.value||'').trim();

  if(!name || !RX.name.test(name)) return {ok:false, msg:'Неверно указано имя.'};
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, msg:'Проверьте e-mail.'};
  if(phone && !RX.phone.test(phone)) return {ok:false, msg:'Проверьте телефон.'};
  return {ok:true};
}

function checkSlot(dateStr, timeStr){
  return new Promise((resolve)=>{
    const cb = '__check_cb_' + Date.now();
    window[cb] = (data)=>{ try{ delete window[cb]; }catch(_){}
      document.getElementById('jsonp-check')?.remove();
      resolve(!!(data && data.ok));
    };
    const s = document.createElement('script');
    s.id = 'jsonp-check';
    s.src = `${APP_CONFIG.ENDPOINT}?action=check&date=${encodeURIComponent(dateStr)}&time=${encodeURIComponent(timeStr)}&callback=${cb}&v=${Date.now()}`;
    document.body.appendChild(s);
  });
}

async function submitBooking(e){
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type=submit]');
  const out  = document.getElementById('booking-out');
  const initial = btn.textContent;

  // honeypot
  if (form.website && form.website.value.trim()!==''){ return; }

  if(!form.date.value || !form.time.value){
    out.innerHTML = `<div class="notice err">${I18N.t('form.pick')}</div>`; return;
  }

  // ⚡ живой чек перед отправкой
  const stillOk = await checkSlot(form.date.value, form.time.value);
  if (!stillOk){
    out.innerHTML = `<div class="notice err">Увы, слот уже занят. Обновляю список…</div>`;
    if (typeof loadDaySlots==='function') loadDaySlots(form.date.value);
    if (typeof loadMonth==='function') loadMonth(true);
    return;
  }

  const v = validateForm(form);
  if(!v.ok){ out.innerHTML = `<div class="notice err">${v.msg}</div>`; return; }

  const bookedDate = form.date.value;
  const bookedTime = form.time.value;

  btn.disabled = true; btn.textContent = 'Бронируем…';
  out.textContent='';

  const payload = {
    name: (form.name?.value||'').trim(),
    email:(form.email?.value||'').trim(),
    phone:(form.phone?.value||'').trim(),
    date: bookedDate, time: bookedTime,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    mode: form.mode.value,
    notes:(form.notes?.value||'').trim(),
    durationMin: 25
  };

  try{
    await fetch(APP_CONFIG.ENDPOINT, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });

    // локально скрыть слот и обновить
    if(typeof locallyRemoveSlot==='function') locallyRemoveSlot(bookedDate, bookedTime);
    out.innerHTML = `<div class="notice ok">${I18N.t('form.ok')}</div>`;
    form.reset?.(); if(window.state) state.selected=null;
    const chosen=document.getElementById('chosen'); if(chosen) chosen.textContent='';

    if(window.SLOTS_CACHE && typeof monthKeyOf==='function'){
      delete SLOTS_CACHE[monthKeyOf(new Date(bookedDate))];
    }
    if(typeof loadMonth==='function') loadMonth(true);
    if(typeof loadDaySlots==='function') loadDaySlots(bookedDate);

  }catch(err){
    out.innerHTML = `<div class="notice err">${I18N.t('form.err')}</div>`;
  }finally{
    btn.disabled=false; btn.textContent=initial;
  }
}
