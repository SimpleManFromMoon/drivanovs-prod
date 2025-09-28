// assets/i18n.js
(function () {
  const ALLOWED = ['ru','lv','en'];
  const STORAGE_KEY = 'lang';
  const FALLBACK = 'ru';

  const I18N = {
    data:null,
    lang:FALLBACK,

    async init(){
      // порядок определения языка: ?lang -> LS -> язык браузера
      const urlLang = new URL(location.href).searchParams.get('lang');
      const lsLang  = localStorage.getItem(STORAGE_KEY);
      const brLang  = (navigator.language||'ru').slice(0,2).toLowerCase();
      this.lang = (urlLang||lsLang||brLang);
      if(!ALLOWED.includes(this.lang)) this.lang=FALLBACK;
      localStorage.setItem(STORAGE_KEY, this.lang);

      // грузим словарь
      const res = await fetch('assets/i18n/content.json?v=' + Date.now());
      this.data = await res.json();
      this.apply();
    },

    setLang(lang){
      if(!ALLOWED.includes(lang)) return;
      this.lang=lang; localStorage.setItem(STORAGE_KEY, lang);
      this.apply();
    },

    t(key){
      const row = this.data && this.data[key];
      return row ? (row[this.lang] || row[FALLBACK] || key) : key;
    },

    apply(){
      document.querySelectorAll('[data-i18n]').forEach(el=>{
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      document.querySelectorAll('[data-i18n-html]').forEach(el=>{
        el.innerHTML = this.t(el.getAttribute('data-i18n-html'));
      });
      document.querySelectorAll('[data-i18n-attr]').forEach(el=>{
        const attr = el.getAttribute('data-i18n-attr');
        const key  = el.getAttribute('data-i18n-key');
        el.setAttribute(attr, this.t(key));
      });
      document.dispatchEvent(new CustomEvent('i18n:applied'));
    }
  };

  window.I18N = I18N;
  document.addEventListener('DOMContentLoaded', ()=>I18N.init());
})();
