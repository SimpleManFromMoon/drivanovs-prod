
// assets/config.js
(function(){
  const params = new URLSearchParams(location.search);
  const ENV = params.get('env') || 'local';
  const CONFIG_MAP = {
    local: {
      ORIGIN: 'http://localhost:8080',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbwtrFTBOOS28Ih8TGzde9O8xK2Z51PDo8WMieGDlzwDFcnxQcJ8h7DrVU2zccsDKr3eZQ/exec'
    },
    prod: {
      ORIGIN: 'https://drivanovs.lv',
      ENDPOINT: 'https://script.google.com/macros/s/DEPLOY_ID_PROD/exec'
    }
  };
  window.APP_CONFIG = CONFIG_MAP[ENV];
  console.log('APP_CONFIG ENV:', ENV, window.APP_CONFIG);
})();
