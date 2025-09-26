
// assets/config.js
(function(){
  const params = new URLSearchParams(location.search);
  const ENV = params.get('env') || 'local';
  const CONFIG_MAP = {
    local: {
      ORIGIN: 'http://localhost:8080',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbz69WCd7lRu4gj4kemHyS3FbfpuZFZkj_kJ51e4PzrvQ9s2xvRw0ZSDVNq_KHWPeBsnuA/exec'
    },
    prod: {
      ORIGIN: 'https://simplemanfrommoon.github.io/drivanovs-prod/',
      ENDPOINT: 'https://script.google.com/macros/s/AKfycbz69WCd7lRu4gj4kemHyS3FbfpuZFZkj_kJ51e4PzrvQ9s2xvRw0ZSDVNq_KHWPeBsnuA/exec'
    }
  };
  window.APP_CONFIG = CONFIG_MAP[ENV];
  console.log('APP_CONFIG ENV:', ENV, window.APP_CONFIG);
})();
