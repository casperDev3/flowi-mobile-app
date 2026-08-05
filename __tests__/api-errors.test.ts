import { apiFetch, ApiError } from '@/store/api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'access-token'),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: jest.fn(() => true),
}));

describe('apiFetch error details', () => {
  test('preserves Django error and invalid fields', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid collection', invalid: 'legacy_collection' }),
    })) as jest.Mock;

    try {
      await apiFetch('/sync/user/v2/', { method: 'POST', body: {} });
      throw new Error('Expected apiFetch to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 400,
        code: 'invalid collection',
        message: 'invalid collection',
        details: { error: 'invalid collection', invalid: 'legacy_collection' },
      });
    }
  });
});
