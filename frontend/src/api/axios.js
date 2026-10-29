import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
export const api = axios.create({ baseURL: BASE_URL, withCredentials: true, timeout: 60000, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  else delete config.headers.Authorization;
  config.headers['x-timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return config;
});

let refreshPromise;
const clearSession = () => useAuthStore.getState().clearAuth();
api.interceptors.response.use(res => res, async error => {
  const original = error.config;
  const code = error.response?.data?.error?.code;
  if (original && error.response?.status === 401 && code === 'TOKEN_EXPIRED' && !original._retry) {
    original._retry = true;
    const previousToken = localStorage.getItem('accessToken');
    try {
      if (!refreshPromise) {
        refreshPromise = axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true, timeout: 15000 })
          .then(({ data }) => {
            const token = data.data?.accessToken;
            if (!token) throw new Error('Refresh response did not contain an access token');
            // An old request cannot restore a session after logout or account switching.
            if (localStorage.getItem('accessToken') !== previousToken) throw new Error('Session changed during refresh');
            useAuthStore.getState().setAccessToken(token);
            return token;
          }).finally(() => { refreshPromise = null; });
      }
      const token = await refreshPromise;
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    } catch (refreshError) {
      if (localStorage.getItem('accessToken') === previousToken && [401, 403].includes(refreshError.response?.status)) clearSession();
      throw refreshError;
    }
  }
  if ([401, 403].includes(error.response?.status) && ['INVALID_TOKEN', 'NO_TOKEN', 'TOKEN_REUSE', 'ACCOUNT_BANNED', 'TOKEN_EXPIRED'].includes(code)) clearSession();
  const normalized = new Error(error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Something went wrong');
  normalized.code = code || 'UNKNOWN_ERROR';
  normalized.status = error.response?.status;
  throw normalized;
});
