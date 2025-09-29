// assets/app.js
function validateForm(form){
  const RX = { name:/^[A-Za-zĀ-žÀ-ÿЁёА-Яа-я\-'\s]{2,80}$/, phone:/^\+?[0-9\s\-()]{7,20}$/ };
  const name = (form.name?.value||'').trim();
  const email= (form.email?.value||'').trim();
  const phone= (form.phone?.value||'').trim();
  if(!name || !RX.name.test(name)) return {ok:false, msg:'Неверно указано имя.'};
  if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, msg:'Проверьте e-mail.'};
  if(phone && !RX.phone.test(phone)) return {ok:false, msg:'Проверьте телефон.'};
  return {ok:true};
}

async function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='__cb_'+Math.random().toString(36).slice(2);
    window[cb]=(data)=>{ resolve(data); cleanup(); };
    function cleanup(){ try{ delete window[cb]; s.remove(); }catch(e){} }
    const s=document.createElement('script');
    s.src = url + (url.includes('?')?'&':'?') + 'callback='+cb;
    s.onerror=()=>{ cleanup(); reject(new Error('JSONP failed')); };
    document.head.appendChild(s);
  });
}

async function checkSlot(date, time, kind){
  const url = `${APP_CONFIG.ENDPOINT}?action=check&date=${date}&time=${time}&dur=${APP_CONFIG.SLOT_MINUTES||30}&kind=${kind}`;
  const data = await (window.jsonp? window.jsonp(url) : jsonp(url));
  // backend: ok = true если окно существует в календаре доступности
  return !!(data && data.ok);
}

async function submitBooking(e){
  e.preventDefault();
  const form = e.target;
  const btn  = form.querySelector('button[type=submit]');
  const out  = document.getElementById('booking-out');
  const initial = btn.textContent;

  if (form.website && form.website.value.trim()!==''){ return; } // honeypot

  if(!form.date.value || !form.time.value){
    out.innerHTML = `<div class="notice err">${(window.I18N?I18N.t('form.pick'):'Выберите дату и время.')}</div>`;
    return;
  }

  // тип из select (он отключен, но значение обновляет календарь)
  const kind = (form.mode?.value === 'in_person') ? 'office' : 'online';

  // мгновенная обратная связь
  btn.classList.add('loading'); btn.disabled = true;
  btn.textContent = (window.I18N? I18N.t('form.checking') : 'Проверяем…');

  const ok = await checkSlot(form.date.value, form.time.value, kind);
  if(!ok){
    out.innerHTML = `<div class="notice err">Увы, слот уже занят. Обновляю список…</div>`;
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent = initial;
    return;
  }

  const v = validateForm(form);
  if(!v.ok){
    out.innerHTML = `<div class="notice err">${v.msg}</div>`;
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent=initial;
    return;
  }

  // второй этап — бронирование
  btn.textContent = (window.I18N? I18N.t('form.booking') : 'Бронируем…');
  out.textContent='';

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    notes: (form.notes?.value||'').trim(),
    date: form.date.value, time: form.time.value,
    kind, durationMin: APP_CONFIG.SLOT_MINUTES || 30,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    source: 'web'
  };

  try{
    await fetch(APP_CONFIG.ENDPOINT, {
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });

    if(typeof window.locallyRemoveSlot==='function') window.locallyRemoveSlot(payload.date, payload.time, kind);
    out.innerHTML = `<div class="notice ok">${(window.I18N?I18N.t('form.ok'):'Бронирование прошло успешно. Мы отправили письмо на ваш e-mail.')}</div>`;
    form.reset?.();
    const chosen=document.getElementById('chosen'); if(chosen) chosen.textContent='';
  }catch(err){
    console.error(err);
    out.innerHTML = `<div class="notice err">${(window.I18N?I18N.t('form.err'):'Не получилось забронировать. Попробуйте ещё раз.')}</div>`;
  }finally{
    btn.classList.remove('loading'); btn.disabled=false; btn.textContent=initial;
  }
}
