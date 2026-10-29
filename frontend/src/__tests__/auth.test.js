import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';

let api, store;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  const data = new Map();
  vi.stubGlobal('localStorage', { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) });
  store = (await import('../stores/authStore.js')).useAuthStore;
  api = (await import('../api/axios.js')).api;
  store.getState().setAuth({ _id: 'patient', name: 'Patient' }, 'old');
});
const expired = config => new AxiosError('Expired', 'ERR_BAD_REQUEST', config, null, { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } }, config });
const freshAdapter = async config => {
  if (config.headers.Authorization === 'Bearer old') throw expired(config);
  return { data: 'ok', status: 200, headers: {}, config };
};

describe('session refresh', () => {
  it('shares one refresh between concurrent expired requests and updates the auth store', async () => {
    let finish;
    const refresh = vi.spyOn(axios, 'post').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    api.defaults.adapter = freshAdapter;
    const requests = Promise.all([api.get('/one'), api.get('/two')]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    finish({ data: { data: { accessToken: 'new' } } });
    await expect(requests).resolves.toHaveLength(2);
    expect(localStorage.getItem('accessToken')).toBe('new');
    expect(store.getState().accessToken).toBe('new');
  });
  it('clears persisted authentication on invalid-token responses', async () => {
    api.defaults.adapter = async config => { throw new AxiosError('Invalid', '', config, null, { status: 401, data: { error: { code: 'INVALID_TOKEN' } } }); };
    await expect(api.get('/one')).rejects.toBeInstanceOf(Error);
    expect(store.getState().isLoggedIn).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
  it('does not log the user out on a temporary refresh service failure', async () => {
    api.defaults.adapter = freshAdapter;
    vi.spyOn(axios, 'post').mockRejectedValue({ response: { status: 503 } });
    await expect(api.get('/one')).rejects.toBeDefined();
    expect(store.getState().isLoggedIn).toBe(true);
  });
  it('does not restore a session if logout happens during refresh', async () => {
    let finish;
    const refresh = vi.spyOn(axios, 'post').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    api.defaults.adapter = freshAdapter;
    const result = api.get('/one').catch(err => err);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    store.getState().clearAuth();
    finish({ data: { data: { accessToken: 'new' } } });
    await result;
    expect(store.getState().isLoggedIn).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });
  it('removes stale authorization headers after logout', async () => {
    store.getState().clearAuth();
    api.defaults.adapter = async config => ({ data: config.headers.Authorization, status: 200, headers: {}, config });
    expect((await api.get('/one')).data).toBeUndefined();
  });
});
