/**
 * «Пристрої й сесії»: `session_not_found` при «Завершити» — паритет із вебом
 * (sessions-card.tsx → sessionErrorMessage): показуємо «Цю сесію вже
 * завершено.» і перечитуємо список, а не мовчки прибираємо рядок.
 */
import React from 'react';
import { Alert, Platform } from 'react-native';

import DevicesScreen from '@/app/devices';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/hooks/use-content-width', () => ({ useContentWidth: () => ({}) }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/components/shared/ScreenHeader', () => ({ ScreenHeader: () => null }));
// DS-примітиви тягнуть тему зі сховища; тут перевіряємо логіку сесій, не вигляд.
jest.mock('@/components/ds', () => ({
  BentoCard: ({ children }: { children?: React.ReactNode }) => children ?? null,
  MeshBackground: () => null,
}));
jest.mock('@/utils/haptics', () => ({ haptic: { success: jest.fn(), error: jest.fn(), light: jest.fn() } }));
let mockLang: 'uk' | 'en' = 'uk';
jest.mock('@/store/i18n', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useI18n: () => ({ tr: require('@/store/translations').allTranslations[mockLang], lang: mockLang, setLang: () => {} }),
}));
jest.mock('@/store/api', () => {
  class ApiError extends Error {
    status: number; code: string;
    constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
  }
  return { ApiError, apiFetch: jest.fn() };
});
const mockList = jest.fn();
const mockRevoke = jest.fn();
jest.mock('@/store/sessions-api', () => ({
  listSessions: (...a: unknown[]) => mockList(...a),
  revokeSession: (...a: unknown[]) => mockRevoke(...a),
}));
jest.mock('@/store/watch-link', () => ({
  markWatchRevoked: jest.fn(async () => {}),
  useWatchLinkState: () => ({ watch: null, link: null, busy: false, error: false, connect: jest.fn() }),
}));

const session = (id: string, current = false) => ({
  id, kind: 'web', platform: 'web', name: `Browser ${id}`, app_version: '', created_at: '', last_seen_at: '', current,
});

const text = (tree: any): string => tree.root
  .findAll((n: any) => typeof n.type === 'string' && (typeof n.props.children === 'string' || Array.isArray(n.props.children)))
  .map((n: any) => [].concat(n.props.children).filter((c: unknown) => typeof c === 'string').join(''))
  .join('|');

beforeEach(() => {
  mockList.mockReset();
  mockRevoke.mockReset();
  Platform.OS = 'android';
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _b, buttons) => {
    const destructive = (buttons ?? []).find(b => b.style === 'destructive');
    void destructive?.onPress?.();
  });
});
afterEach(() => jest.restoreAllMocks());

it.each(['uk', 'en'] as const)('session_not_found → «session already ended» notice + reload (%s)', async lang => {
  mockLang = lang;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ApiError } = require('@/store/api');
  mockList.mockResolvedValueOnce([session('me', true), session('other')]).mockResolvedValue([session('me', true)]);
  mockRevoke.mockRejectedValue(new ApiError(404, 'session_not_found', 'Not found.'));
  let tree: any;
  await act(async () => { tree = create(<DevicesScreen />); });
  const tr = allTranslations[lang];
  const button = tree.root.findByProps({ accessibilityLabel: `${tr.devicesRevoke}: Browser other` });
  await act(async () => { button.props.onPress(); });
  await act(async () => {});
  expect(mockRevoke).toHaveBeenCalledWith('other');
  expect(text(tree)).toContain(tr.devicesSessionGone);
  expect(mockList).toHaveBeenCalledTimes(2);
  expect(text(tree)).not.toContain('Browser other');
  expect(Alert.alert).toHaveBeenCalledTimes(1); // лише підтвердження — не помилка
  await act(async () => tree.unmount());
});

it('uses the same Ukrainian text as the web', () => {
  expect(allTranslations.uk.devicesSessionGone).toBe('Цю сесію вже завершено.');
});
