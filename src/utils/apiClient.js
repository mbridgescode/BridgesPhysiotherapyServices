import axios from 'axios';
import { emitAuthTokenChanged } from './authEvents';

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

let isRefreshing = false;
let pendingRequests = [];

const queueRequest = () =>
  new Promise((resolve, reject) => {
    pendingRequests.push({ resolve, reject });
  });

const resolveQueue = (token) => {
  pendingRequests.forEach(({ resolve }) => resolve(token));
  pendingRequests = [];
};

const rejectQueue = (error) => {
  pendingRequests.forEach(({ reject }) => reject(error));
  pendingRequests = [];
};

const persistAccessToken = (token, user) => {
  if (typeof window !== 'undefined') {
    if (token) {
      window.localStorage.setItem('token', token);
      if (user) {
        window.localStorage.setItem('user', JSON.stringify(user));
      }
    } else {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('user');
    }
  }
};

const refreshAccessToken = async () => {
  const response = await apiClient.post(
    '/auth/refresh',
    undefined,
    { skipAuthRefresh: true },
  );
  const nextToken = response.data?.accessToken;
  if (!nextToken) {
    throw new Error('Refresh succeeded without token');
  }
  const nextUser = response.data?.user;
  persistAccessToken(nextToken, nextUser);
  emitAuthTokenChanged();
  return { token: nextToken, user: nextUser };
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (
      !response
      || response.status !== 401
      || !config
      || config.skipAuthRefresh
      || config._retry
      || (typeof config.url === 'string' && config.url.startsWith('/auth/'))
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      try {
        const token = await queueRequest();
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return apiClient(config);
      } catch (queueError) {
        return Promise.reject(queueError);
      }
    }

    config._retry = true;
    isRefreshing = true;

    try {
      const { token } = await refreshAccessToken();
      if (config.headers && token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      resolveQueue(token);
      return apiClient(config);
    } catch (refreshError) {
      rejectQueue(refreshError);
      persistAccessToken(null);
      emitAuthTokenChanged();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
