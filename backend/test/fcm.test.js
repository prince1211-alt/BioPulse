import { beforeEach, it, expect, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ getApps: vi.fn(), initializeApp: vi.fn(), applicationDefault: vi.fn(), cert: vi.fn(), send: vi.fn() }));
vi.mock('firebase-admin/app', () => ({ getApps: sdk.getApps, initializeApp: sdk.initializeApp, applicationDefault: sdk.applicationDefault, cert: sdk.cert }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: sdk.send }) }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sdk.getApps.mockReturnValue([]);
  sdk.send.mockResolvedValue('message-id');
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'PROJECT_ID', 'CLIENT_EMAIL', 'PRIVATE_KEY']) vi.stubEnv(name, '');
});
it('initializes using the modular Firebase Admin SDK and normalizes escaped keys', async () => {
  vi.stubEnv('FIREBASE_PROJECT_ID', 'project');
  vi.stubEnv('FIREBASE_CLIENT_EMAIL', 'service@test.com');
  vi.stubEnv('FIREBASE_PRIVATE_KEY', 'line1\\nline2');
  const { sendPushNotification } = await import('../src/utils/fcm.js');
  expect(sdk.cert).toHaveBeenCalledWith({ projectId: 'project', clientEmail: 'service@test.com', privateKey: 'line1\nline2' });
  expect(sdk.initializeApp).toHaveBeenCalledOnce();
  await sendPushNotification('device', 'Title', 'Body', { count: 3 });
  expect(sdk.send).toHaveBeenCalledWith(expect.objectContaining({ token: 'device', data: { count: '3' } }));
});
it('uses an existing Firebase application without initializing it twice', async () => {
  sdk.getApps.mockReturnValue([{}]);
  const { sendPushNotification } = await import('../src/utils/fcm.js');
  await sendPushNotification('device', 'Title', 'Body');
  expect(sdk.initializeApp).not.toHaveBeenCalled();
  expect(sdk.send).toHaveBeenCalledOnce();
});
it('disables push cleanly without credentials', async () => {
  const { sendPushNotification } = await import('../src/utils/fcm.js');
  await sendPushNotification('device', 'Title', 'Body');
  expect(sdk.initializeApp).not.toHaveBeenCalled();
  expect(sdk.send).not.toHaveBeenCalled();
});
