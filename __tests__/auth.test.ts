/**
 * __tests__/auth.test.ts
 *
 * Перевіряє:
 *  1. Після logout() → setOnlineImperative(false) викликається → app_mode офлайн.
 */

import React, { act } from 'react';

import { AuthProvider, useAuth } from '@/store/auth';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer: any = require('react-test-renderer');

// ─── Моки ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(async () => null),
  setItemAsync:    jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem:   jest.fn(async () => null),
  setItem:   jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
  multiGet:  jest.fn(async () => []),
  multiSet:  jest.fn(async () => {}),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode:        jest.fn(() => false),
  setOnlineImperative: jest.fn(),
  useAppMode: () => ({ ready: true, online: false, setOnline: jest.fn() }),
}));

// Отримуємо посилання після того, як jest.mock() зареєстровано.
const { setOnlineImperative: mockSetOnlineImperative } =
  jest.requireMock('@/store/app-mode') as { setOnlineImperative: jest.Mock };

jest.mock('@/store/api', () => ({
  apiFetch:           jest.fn(async () => {}),
  clearTokens:        jest.fn(async () => {}),
  onSessionExpired:   jest.fn(() => () => {}),
  REFRESH_SECURE_KEY: 'flowi_refresh',
  OfflineError:       class OfflineError extends Error {},
  ApiError:           class ApiError extends Error {},
  setTokens:          jest.fn(async () => {}),
}));

jest.mock('@/store/sync-engine', () => ({
  setIsAuthed:      jest.fn(),
  triggerFullSync:  jest.fn(async () => {}),
}));

// ─── Probe ────────────────────────────────────────────────────────────────────

let authApi!: ReturnType<typeof useAuth>;

function Probe() {
  authApi = useAuth();
  return null;
}

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('auth — logout → offline mode', () => {
  beforeEach(() => {
    mockSetOnlineImperative.mockClear();
  });

  it('logout викликає setOnlineImperative(false)', async () => {
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });

    await act(async () => {
      await authApi.logout();
    });

    expect(mockSetOnlineImperative).toHaveBeenCalledWith(false);
  });
});
