/**
 * __tests__/registration-push.test.ts — rc1: поллінг стану заявки оновлює
 * push-прив'язку (`push_kind`/`push_token`) — дозвіл могли дати вже після
 * подання заявки (спільний контракт реєстраційного пушу).
 */
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'req-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock('@/store/storage', () => ({ loadData: jest.fn(async (_k: string, f: unknown) => f), saveData: jest.fn(async () => {}) }));
const mockApiFetch = jest.fn(async (_path: string, _opts?: unknown): Promise<unknown> => ({ status: 'pending' }));
jest.mock('@/store/api', () => ({ apiFetch: (path: string, opts?: unknown) => mockApiFetch(path, opts) }));
const mockGetRegToken = jest.fn(async (): Promise<unknown> => null);
jest.mock('@/store/push', () => ({ getRegistrationPushToken: () => mockGetRegToken() }));

import { pollRegistrationStatus } from '@/store/registration';

beforeEach(() => mockApiFetch.mockClear());

test('нативний токен є — у тілі push_kind/push_token/push_platform', async () => {
  mockGetRegToken.mockImplementationOnce(async () => ({ kind: 'fcm', token: 'f-1', platform: 'android' }));
  await pollRegistrationStatus('r-1');
  expect(mockApiFetch).toHaveBeenCalledWith('/auth/register/status/', expect.objectContaining({
    body: { request_id: 'r-1', request_token: 'req-token', push_kind: 'fcm', push_token: 'f-1', push_platform: 'android' },
  }));
});

test('токена нема чи його читання впало — звичайний поллінг без push-полів', async () => {
  await pollRegistrationStatus('r-1');
  mockGetRegToken.mockImplementationOnce(async () => { throw new Error('boom'); });
  await pollRegistrationStatus('r-1');
  for (const [, opts] of mockApiFetch.mock.calls) {
    expect((opts as { body: object }).body).toEqual({ request_id: 'r-1', request_token: 'req-token' });
  }
});
