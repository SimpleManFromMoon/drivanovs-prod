// assets/app.js
(function(){
  // --- утилиты ---
  function $(sel, root=document){ return root.querySelector(sel); }
  function qsAll(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function validateForm(form){
    const RX = {
      name:/^[A-Za-zĀ-žÀ-ÿЁёА-Яа-я\-'\s]{2,80}$/,
      phone:/^\+?[0-9\s\-()]{7,20}$/,
      email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/
    };
    const name = (form.name?.value||'').trim();
    const email= (form.email?.value||'').trim();
    const phone= (form.phone?.value||'').trim();

    if(!name || !RX.name.test(name))  return {ok:false, msg:'Неверно указано имя.'};
    if(!email || !RX.email.test(email))return {ok:false, msg:'Проверьте e-mail.'};
    if(phone && !RX.phone.test(phone)) return {ok:false, msg:'Проверьте телефон.'};
    return {ok:true};
  }

  function getCID(){
    try{
      const key='cid_v1';
      let cid = localStorage.getItem(key);
      if(!cid){ cid = Math.random().toString(36).slice(2)+Date.now().toString(36); localStorage.setItem(key,cid); }
      return cid;
    }catch(e){ return 'nocid'; }
  }

  async function getJSON(url){
    const r = await fetch(url, { method:'GET', credentials:'omit' });
    if(!r.ok) throw new Error('network');
    return await r.json();
  }

  async function postForm(url, data){ // data: plain object
    const body = new URLSearchParams();
    Object.entries(data).forEach(([k,v])=> body.append(k, v==null?'':String(v)));
    const r = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8' },
      body
    });
    // Ответ делаем текстом "ok" или JSON с {ok:false,error:'...',msg:'...'}
    const text = await r.text();
    try { return JSON.parse(text); } catch { return { ok: text.trim()==='ok' }; }
  }

  // --- i18n удобства ---
  function t(key, fb){ try{ return (window.I18N && I18N.t(key)) || fb; }catch(e){ return fb; } }

  // --- состояние ---
  const CFG = window.APP_CONFIG || {};
  const ENDPOINT = CFG.ENDPOINT;
  let NONCE = null;

  async function fetchNonce(){
    try{
      const url = `${ENDPOINT}?action=nonce&cid=${encodeURIComponent(getCID())}`;
      const data = await getJSON(url);
      if(!data || !data.nonce) throw 0;
      NONCE = data.nonce;
    }catch(e){
      console.error('nonce failed', e);
      NONCE = null;
    }
  }

  // --- отправка формы ---
  async function submitBooking(ev){
    ev.preventDefault();
    const form = ev.currentTarget;
    const out  = $('#booking-out') || form.querySelector('.form-out') || form;

    // anti-bot honeypot
    if(form.website && form.website.value){
      out.innerHTML = `<div class="notice err">${t('err.trylater','Ошибка. Попробуйте позже.')}</div>`;
      return;
    }

    // фронт-валидация
    const v = validateForm(form);
    if(!v.ok){ out.innerHTML = `<div class="notice err">${v.msg}</div>`; return; }

    // дата/время/тип
    const date = (form.date?.value||'').trim();
    const time = (form.time?.value||'').trim();
    const kind = (form.kind?.value||'').trim() || 'office';
    if(!date || !time){
      out.innerHTML = `<div class="notice err">${t('err.pick','Выберите дату и время в календаре.')}</div>`;
      return;
    }

    // UI
    const btn = form.querySelector('button[type="submit"]') || form.querySelector('button');
    const initText = btn ? btn.textContent : '';
    if(btn){ btn.disabled = true; btn.classList.add('loading'); btn.textContent = t('form.processing','Обработка...'); }

    try{
      // гарантируем nonce
      if(!NONCE) await fetchNonce();

      // payload
      const payload = {
        action: 'book',
        name: (form.name?.value||'').trim(),
        email:(form.email?.value||'').trim(),
        phone:(form.phone?.value||'').trim(),
        notes:(form.notes?.value||'').trim(),
        date, time, kind,
        dur: String(CFG.SLOT_MINUTES || 30),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Riga',
        ua: navigator.userAgent.slice(0,180),
        cid: getCID(),
        nonce: NONCE || ''
      };

      const res = await postForm(ENDPOINT, payload);

      if(res && (res.ok === true || res==='ok')){
        out.innerHTML = `<div class="notice ok">${t('form.success','Бронирование прошло успешно. Мы отправили письмо на ваш e-mail.')}</div>`;
        form.reset?.();
        const chosen = document.getElementById('chosen'); if(chosen) chosen.textContent = '';
        // локально убираем слот, если есть такая функция в календаре
        if(typeof window.locallyRemoveSlot === 'function'){
          window.locallyRemoveSlot(date, time, kind);
        }
        // новый nonce на следующий раз
        NONCE = null;
        return;
      }

      const code = (res && (res.error || res.code)) || 'unknown';
      const msgMap = {
        nonce:  t('err.nonce','Форма устарела. Обновите страницу и попробуйте снова.'),
        limit:  t('err.limit','Лимит бронирований исчерпан. Попробуйте позже.'),
        rate:   t('err.rate','Слишком много запросов. Попробуйте через минуту.'),
        slot:   t('err.slot','Увы, слот уже занят. Выберите другое время.'),
        input:  t('err.input','Неверные данные формы. Исправьте и попробуйте снова.'),
        past:  t('err.past','Нельзя бронировать прошедшее время. Выберите другую дату.')
      };
      out.innerHTML = `<div class="notice err">${msgMap[code] || t('err.generic','Не получилось забронировать. Попробуйте ещё раз.')}</div>`;
      // если проблема с nonce — сразу запросим новый
      if(code==='nonce') NONCE = null;

    }catch(err){
      console.error(err);
      out.innerHTML = `<div class="notice err">${t('err.generic','Не получилось забронировать. Попробуйте ещё раз.')}</div>`;
    }finally{
      if(btn){ btn.disabled = false; btn.classList.remove('loading'); btn.textContent = initText; }
    }
  }

  function init(){
    // навешиваем обработчик
    const form = document.getElementById('bookingForm') || $('form[data-booking]');
    if(form) form.addEventListener('submit', submitBooking, { passive:false });

    // заранее берём nonce (не критично, но быстрее UX)
    fetchNonce().catch(()=>{ /* тихо */ });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
