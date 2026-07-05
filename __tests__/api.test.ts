/**
 * __tests__/api.test.ts
 *
 * Перевіряє:
 *  1. Офлайн-гейт: isOnlineMode()===false → apiFetch кидає OfflineError і
 *     global.fetch НЕ викликається.
 */

import { apiFetch, OfflineError } from '@/store/api';

// ─── Моки ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(async () => null),
  setItemAsync:    jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

// Мокаємо app-mode так, щоб isOnlineMode() завжди повертала false.
jest.mock('@/store/app-mode', () => ({
  isOnlineMode: jest.fn(() => false),
}));

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('apiFetch — офлайн-гейт', () => {
  const mockFetch = jest.fn();

  beforeAll(() => {
    global.fetch = mockFetch;
  });

  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('кидає OfflineError коли isOnlineMode()===false', async () => {
    await expect(apiFetch('/some/path/')).rejects.toBeInstanceOf(OfflineError);
  });

  it('НЕ викликає fetch коли isOnlineMode()===false', async () => {
    await apiFetch('/some/path/').catch(() => {});
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
