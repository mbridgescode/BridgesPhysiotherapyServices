import axios from 'axios';

const resolveBaseUrl = () => {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';

    // CRA dev server typically runs on 3001 while the API runs on 3000.
    if (isLocalhost && port === '3001') {
      return 'http://localhost:3000';
    }

    // When served from the same origin (e.g. Vercel), route through /api.
    return `${origin}/api`;
  }

  return 'http://localhost:3000';
};

const apiClient = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = window.localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      delete config.headers.Authorization;
    }
  }
  return config;
});

export default apiClient;
