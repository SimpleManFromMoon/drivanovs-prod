// assets/config.js
(function(){
  const params = new URLSearchParams(location.search);
  const ENV = params.get('env') || 'local';

  const CONFIG_MAP = {
    local: {
      ORIGIN: 'http://localhost:8080',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbytXlQA7WxAQXBrydjRfGqZrg1mt8WII7FsGJYwCYlt3QMAs0qEudR8VgAThycGPhfplQ/exec'
    },
    prod: {
      ORIGIN: 'https://simplemanfrommoon.github.io/drivanovs-prod/',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbytXlQA7WxAQXBrydjRfGqZrg1mt8WII7FsGJYwCYlt3QMAs0qEudR8VgAThycGPhfplQ/exec'
    }
  };

  const cfg = CONFIG_MAP[ENV];

  // ID календарей ДОСТУПНОСТИ (ставишь «окна» тут)
  cfg.CALENDARS = {
    office: 'office-cal-id@group.calendar.google.com',
    online: 'online-cal-id@group.calendar.google.com'
  };

  // Цвета (точки и обводки слотов)
  cfg.COLORS = {
    office: '#10b981',  // зелёный — очно
    online: '#3b82f6'   // синий — онлайн
  };

  // Длительность слота
  cfg.SLOT_MINUTES = 30;

  // Прайсинг (по умолчанию / по дням недели / точечные даты)
  cfg.PRICING = {
    office: { default: 80, byWeekday: {1:70,5:90}, overrides:{} },
    online: { default: 60, byWeekday: {2:55,4:65}, overrides:{} }
  };

  window.APP_CONFIG = cfg;
  console.log('APP_CONFIG ENV:', ENV, window.APP_CONFIG);
})();
