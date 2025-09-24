// assets/i18n.js — единый и аккуратный i18n без конфликтов
(function () {
  const ALLOWED = ['ru','lv','en'];
  const STORAGE_KEY = 'lang';
  const FALLBACK = 'ru';
  const BTN_SEL = '.lang-switch [data-lang], .lang-switch [data-switch-lang]';

  const I18N = {
    data: null,
    lang: FALLBACK,

    async init() {
      // 1) определить язык: ?lang -> localStorage -> язык браузера
      const url = new URL(location.href);
      const ql = url.searchParams.get('lang');
      const ls = localStorage.getItem(STORAGE_KEY);
      const br = (navigator.language || FALLBACK).slice(0, 2).toLowerCase();
      this.lang = (ql || ls || br);
      if (!ALLOWED.includes(this.lang)) this.lang = FALLBACK;
      localStorage.setItem(STORAGE_KEY, this.lang);

      // 2) загрузить общий словарь
      const res = await fetch('assets/i18n/content.json?v=' + Date.now());
      this.data = await res.json();

      // 3) применить переводы и подсветить активную кнопку
      this.apply();
      updateActiveButtons(this.lang);
    },

    setLang(lang) {
      if (!ALLOWED.includes(lang)) return;
      this.lang = lang;
      localStorage.setItem(STORAGE_KEY, lang);
      this.apply();
      updateActiveButtons(lang);
    },

    t(key) {
      const row = this.data ? this.data[key] : null;
      return row ? (row[this.lang] || row[FALLBACK] || key) : key;
    },

    md2html(md) {
      let html = (md || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      // простенькая поддержка **bold** и *italic*
      html = html
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/^- (.+)$/gm,'<li>$1</li>')
        .replace(/(\n){2,}/g,'\n\n');
      html = html.replace(/(<li>[\s\S]*?<\/li>)/g,'<ul>$1</ul>');
      html = html.replace(/\n/g,'<br>');
      return html;
    },

    apply() {
      // textContent
      document.querySelectorAll('[data-i18n]').forEach(el=>{
        el.textContent = this.t(el.getAttribute('data-i18n'));
      });
      // innerHTML (чистый html)
      document.querySelectorAll('[data-i18n-html]').forEach(el=>{
        el.innerHTML = this.t(el.getAttribute('data-i18n-html'));
      });
      // markdown-like
      document.querySelectorAll('[data-i18n-md]').forEach(el=>{
        el.innerHTML = this.md2html(this.t(el.getAttribute('data-i18n-md')));
      });
      // атрибуты
      document.querySelectorAll('[data-i18n-attr]').forEach(el=>{
        const attr = el.getAttribute('data-i18n-attr');
        const key  = el.getAttribute('data-i18n-key');
        el.setAttribute(attr, this.t(key));
      });
    }
  };

  function updateActiveButtons(lang) {
    document.querySelectorAll(BTN_SEL).forEach(btn => {
      const val = btn.getAttribute('data-lang') || btn.getAttribute('data-switch-lang');
      btn.classList.toggle('active', val === lang);
    });
  }

  // Делегирование кликов по кнопкам языка
  document.addEventListener('click', (e) => {
    const btn = e.target.closest(BTN_SEL);
    if (!btn) return;
    const next = btn.getAttribute('data-lang') || btn.getAttribute('data-switch-lang');
    I18N.setLang(next);
  });

  // Старт
  window.I18N = I18N;
  document.addEventListener('DOMContentLoaded', () => I18N.init());
})();
