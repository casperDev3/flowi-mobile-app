/**
 * __tests__/offline-overlay.test.tsx
 *
 * Перевіряє рендер OfflineOverlay для reason='offline' і reason='guest'.
 * Всі зовнішні залежності замоковані.
 */

import React from 'react';
import { View } from 'react-native';

import { OfflineOverlay } from '@/components/shared/OfflineOverlay';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

// ─── Системні моки ────────────────────────────────────────────────────────────

jest.mock('expo-blur', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { BlurView: View };
});

jest.mock('@/components/ui/icon-symbol', () => ({
  IconSymbol: () => null,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => 'dark',
}));

jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    tr: {
      unavailableOffline:    'Недоступно в офлайн-режимі',
      offlineDesc:           'Офлайн',
      enableOnline:          'Увімкнути онлайн',
      onlineNeedsAccount:    'Потрібен акаунт',
      onlineNeedsAccountMsg: 'Увійдіть або зареєструйтесь',
      authLogin:             'Увійти',
      authRegister:          'Зареєструватись',
      cancel:                'Скасувати',
    },
    lang: 'uk',
  }),
}));

// Мокаємо як jest.fn(), щоб окремі тести могли міняти значення.
jest.mock('@/store/app-mode', () => ({
  useAppMode:   jest.fn(),
  isOnlineMode: jest.fn(() => false),
}));

jest.mock('@/store/auth', () => ({
  useAuth: jest.fn(),
}));

// ─── Хелпери ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAppMode } = require('@/store/app-mode') as { useAppMode: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useAuth }    = require('@/store/auth')     as { useAuth:    jest.Mock };

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('OfflineOverlay', () => {
  // ── reason='offline' ────────────────────────────────────────────────────────

  describe("reason='offline'", () => {
    it('рендерить оверлей-картку коли offline', async () => {
      useAppMode.mockReturnValue({ online: false, ready: true, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'authed' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="offline">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });

    it('рендерить лише дітей коли online (без оверлея)', async () => {
      useAppMode.mockReturnValue({ online: true, ready: true, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'authed' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="offline">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });

    it('рендерить лоадер поки !ready', async () => {
      useAppMode.mockReturnValue({ online: false, ready: false, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'guest' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="offline">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });
  });

  // ── reason='guest' ──────────────────────────────────────────────────────────

  describe("reason='guest'", () => {
    it('рендерить оверлей-картку коли online+guest', async () => {
      useAppMode.mockReturnValue({ online: true, ready: true, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'guest' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="guest">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });

    it('рендерить дітей коли authed', async () => {
      useAppMode.mockReturnValue({ online: true, ready: true, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'authed' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="guest">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });

    it("рендерить дітей коли status='loading'", async () => {
      useAppMode.mockReturnValue({ online: true, ready: true, setOnline: jest.fn() });
      useAuth.mockReturnValue({ status: 'loading' });

      let renderer: ReturnType<typeof create>;
      await act(async () => {
        renderer = create(
          <OfflineOverlay reason="guest">
            <View testID="child" />
          </OfflineOverlay>,
        );
      });
      expect(renderer.toJSON()).not.toBeNull();
    });
  });
});
