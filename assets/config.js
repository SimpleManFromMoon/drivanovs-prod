
// assets/config.js
(function(){
  const params = new URLSearchParams(location.search);
  const ENV = params.get('env') || 'local';
  const CONFIG_MAP = {
    local: {
      ORIGIN: 'http://localhost:8080',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbzcz32El2mxZ_74-l10ZIkLgXUo1tNboxKa7WFKxH1aXzhEMunt7CWIk8FGD11Jchjv3g/exec'
    },
    prod: {
      ORIGIN: 'https://simplemanfrommoon.github.io/drivanovs-prod/',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbzcz32El2mxZ_74-l10ZIkLgXUo1tNboxKa7WFKxH1aXzhEMunt7CWIk8FGD11Jchjv3g/exec'
    }
  };
  window.APP_CONFIG = CONFIG_MAP[ENV];
  console.log('APP_CONFIG ENV:', ENV, window.APP_CONFIG);
})();
