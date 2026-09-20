/**
 * __tests__/finance-load-failure.test.tsx — збій читання сховища НЕ дорівнює
 * порожнім Фінансам (ERR-01).
 *
 * До правки екран читав `loadData('transactions', [])`, який на будь-якій
 * помилці мовчки віддавав порожній масив. Далі вмикався `initialized`, і
 * ефект-дзеркало записувало цю порожнечу назад у сховище: операції й рахунки
 * зникали не від збою читання, а від автозапису одразу після нього.
 *
 * Перевіряємо обидві половини контракту:
 *   1) при збої екран НЕ пише в зіпсований ключ;
 *   2) показує плашку «дані не прочитались» замість звичайного порожнього
 *      стану, а «Повторити» повертає екран до життя.
 */

const mockStore = new Map<string, string>();
const mockFailing = new Set<string>();
const mockSetCalls: string[] = [];
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (mockFailing.has(k)) throw new Error('SQLITE_FULL');
    return mockStore.get(k) ?? null;
  }),
  setItem: jest.fn(async (k: string, v: string) => { mockSetCalls.push(k); mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/explore',
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {}, selection: () => {} },
}));

import React from 'react';
import { Text } from 'react-native';

import { loadErrorText } from '@/components/finance/LoadErrorNotice';
import { clearStorageReadFailure } from '@/store/storage';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const t = loadErrorText('uk');
const ISO = new Date().toISOString();

function texts(tree: any): string[] {
  const out: string[] = [];
  tree.root.findAllByType(Text).forEach((n: any) => {
    if (typeof n.props.children === 'string') out.push(n.props.children);
  });
  return out;
}

function pressableWithLabel(tree: any, label: string): any {
  return tree.root.findAll(
    (n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  )[0];
}

describe('ERR-01 на екрані Фінансів', () => {
  const trees: any[] = [];

  beforeEach(() => {
    mockStore.clear();
    mockFailing.clear();
    mockSetCalls.length = 0;
    clearStorageReadFailure('transactions');
    clearStorageReadFailure('accounts');
    mockStore.set('transactions', JSON.stringify([
      { id: 't1', type: 'expense', category: 'Їжа', amount: 10, note: '', date: ISO, accountId: 'a1', currency: 'UAH' },
    ]));
    mockStore.set('accounts', JSON.stringify([
      { id: 'a1', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: ISO },
    ]));
  });

  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t2 => t2.unmount()); });
  });

  it('провалене читання не затирає ключ і показує плашку з «Повторити»', async () => {
    mockFailing.add('transactions');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FinanceScreen = require('@/app/(tabs)/explore').default;
    let tree: any;
    await act(async () => { tree = create(<FinanceScreen />); });
    await act(async () => {});
    trees.push(tree);

    // Головне: жодного запису в ключ, який не прочитався.
    expect(mockSetCalls).not.toContain('transactions');
    // І сховище лишилось тим самим, а не порожнім масивом.
    expect(JSON.parse(mockStore.get('transactions')!)).toHaveLength(1);

    // Користувач бачить причину, а не «Немає транзакцій».
    expect(texts(tree)).toContain(t.title);

    // «Повторити» після того, як сховище ожило, повертає дані.
    mockFailing.clear();
    await act(async () => { pressableWithLabel(tree, t.retry).props.onPress(); });
    await act(async () => {});
    expect(texts(tree)).not.toContain(t.title);
  });

  it('справне читання лишає екран у звичайному режимі', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FinanceScreen = require('@/app/(tabs)/explore').default;
    let tree: any;
    await act(async () => { tree = create(<FinanceScreen />); });
    await act(async () => {});
    trees.push(tree);

    expect(texts(tree)).not.toContain(t.title);
  });
});
