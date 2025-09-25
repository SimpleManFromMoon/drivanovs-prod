
// assets/config.js
(function(){
  const params = new URLSearchParams(location.search);
  const ENV = params.get('env') || 'local';
  const CONFIG_MAP = {
    local: {
      ORIGIN: 'http://localhost:8080',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbyoyMIdCrycgTxtXMYQAhBsNelw_UB17LJvU7bTVrnLADFAFrqMA_sXYleqMYEHRKM8AQ/exec'
    },
    prod: {
      ORIGIN: 'https://drivanovs.lv',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbyoyMIdCrycgTxtXMYQAhBsNelw_UB17LJvU7bTVrnLADFAFrqMA_sXYleqMYEHRKM8AQ/exec'
    }
  };
  window.APP_CONFIG = CONFIG_MAP[ENV];
  console.log('APP_CONFIG ENV:', ENV, window.APP_CONFIG);
})();
