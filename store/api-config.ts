const ENV = __DEV__ ? 'local' : 'production';

const config = {
  local: {
    API_BASE: 'http://localhost:8000/api',
    WS_BASE: 'ws://localhost:8000/ws',
  },
  production: {
    API_BASE: 'https://api.flowi.casperdev.site/api',
    WS_BASE: 'wss://api.flowi.casperdev.site/ws',
  },
};

export const API_BASE = config[ENV].API_BASE;
export const WS_BASE = config[ENV].WS_BASE;
