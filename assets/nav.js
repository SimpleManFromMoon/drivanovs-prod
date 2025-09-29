// assets/nav.js
(function(){
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="navbar" id="navbar">
      <div class="brand">Dr. Ivanovs</div>
      <nav class="nav-links" id="navLinks">
        <a href="index.html"  data-page="index"   data-i18n="nav.home">Главная</a>
        <a href="about.html"  data-page="about"   data-i18n="nav.about">Обо мне</a>
        <a href="rules.html"  data-page="rules"   data-i18n="nav.rules">Правила</a>
        <a href="booking.html" data-page="booking" class="btn blue" data-i18n="nav.booking">Запись</a>
      </nav>
      <div class="nav-spacer"></div>
      <div class="lang-wrap">
        <button class="lang-btn" id="langBtn" aria-haspopup="menu" aria-expanded="false">
          🌐 <span data-i18n="nav.lang">Язык</span>
        </button>
        <div class="lang-list" id="langList">
          <button data-lang="ru">RU</button>
          <button data-lang="lv">LV</button>
          <button data-lang="en">EN</button>
        </div>
      </div>
      <button class="burger" id="burger" aria-label="Меню">☰</button>
    </div>
  `;
  document.body.prepend(header);

  // i18n — применим сразу, если подключен
  if (window.I18N && typeof I18N.apply === 'function') I18N.apply();

  // активный пункт
  const page = (document.body.getAttribute('data-page')||'').toLowerCase();
  document.querySelectorAll('#navLinks a').forEach(a=>{
    a.classList.toggle('active', a.dataset.page === page);
  });

  // бургер
  const navbar = document.getElementById('navbar');
  document.getElementById('burger').addEventListener('click',()=>navbar.classList.toggle('open'));

  // языки
  const list = document.getElementById('langList');
  const btn  = document.getElementById('langBtn');
  btn.addEventListener('click', ()=>{
    const open = list.style.display==='block';
    list.style.display = open ? 'none' : 'block';
    btn.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.lang-wrap')) list.style.display='none';
  });
  list.addEventListener('click', (e)=>{
    const lang = e.target.getAttribute('data-lang');
    if(!lang) return;
    if(window.I18N) { I18N.setLang(lang); I18N.apply(); }
    list.style.display='none';
    markActive();
  });

  function markActive(){
    if(!window.I18N || !I18N.lang) return;
    list.querySelectorAll('button').forEach(b=>{
      b.classList.toggle('active', b.getAttribute('data-lang')===I18N.lang);
    });
  }
  document.addEventListener('i18n:applied', markActive);
  setTimeout(markActive, 300);
})();
