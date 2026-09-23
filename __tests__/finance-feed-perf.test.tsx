/**
 * __tests__/finance-feed-perf.test.tsx — стрічка операцій не перебудовується
 * на кожну натиснуту клавішу (PERF-4).
 *
 * Форма додавання операції живе в тому самому компоненті, що й стрічка, тож
 * кожен символ у полі суми прокочує рендер усього екрана Фінансів. Саме по
 * собі це не біда — TransactionGroup оптимізований компілятором і повернув би
 * закешований результат. Але лише при СТАБІЛЬНИХ пропсах, а екран передавав у
 * кожну групу дві щойно створені функції (`fmt`, `getCatIcon`), щоразу нову
 * шапку списку й новий `renderItem`. Мемоізація зносилась на кожному символі.
 *
 * Тут перевіряється рівно ідентичність цих пропсів до й після введення —
 * єдине, що вирішує, спрацює мемоізація чи ні. Скільки разів React насправді
 * покличе рендер у релізній збірці, тест не міряє.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
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
  useLocalSearchParams: () => ({ create: '1', tab: 'transactions' }),
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

// Підміна групи: нас цікавлять не її нутрощі, а пропси, з якими її кличуть.
const groupProps: any[] = [];
jest.mock('@/components/finance/TransactionGroup', () => ({
  TransactionGroup: (props: any) => { groupProps.push(props); return null; },
}));

import React from 'react';
import { FlatList } from 'react-native';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const ISO = new Date().toISOString();

function seed() {
  mockStore.clear();
  mockStore.set('accounts', JSON.stringify([
    { id: 'a1', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: ISO },
  ]));
  mockStore.set('transactions', JSON.stringify([
    { id: 't1', type: 'expense', category: 'Їжа', amount: 10, note: '', date: ISO, accountId: 'a1', currency: 'UAH' },
  ]));
}

function amountInput(tree: any): any {
  return tree.root.findAll(
    (n: any) => n.props?.placeholder === '0'
      && n.props?.keyboardType === 'decimal-pad'
      && typeof n.props?.onChangeText === 'function',
  )[0];
}

function feed(tree: any): any {
  return tree.root.findAllByType(FlatList)[0];
}

describe('PERF-4: пропси стрічки переживають введення в полі суми', () => {
  it('fmt, getCatIcon, шапка і renderItem не перестворюються', async () => {
    seed();
    groupProps.length = 0;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FinanceScreen = require('@/app/(tabs)/explore').default;

    let tree: any;
    await act(async () => { tree = create(<FinanceScreen />); });
    await act(async () => {});

    const before = groupProps[groupProps.length - 1];
    expect(before).toBeTruthy();
    const feedBefore = feed(tree).props;

    const input = amountInput(tree);
    expect(input).toBeTruthy();
    await act(async () => { input.props.onChangeText('1'); });
    await act(async () => { input.props.onChangeText('12'); });
    await act(async () => { input.props.onChangeText('123'); });

    const after = groupProps[groupProps.length - 1];
    const feedAfter = feed(tree).props;

    // Порівнюємо саме ідентичність (===), а не значення: React-елемент шапки
    // при розбіжності змусив би jest друкувати дерево на десятки тисяч рядків.
    const same = (a: unknown, b: unknown) => a === b;
    // Дві функції з формулювання знахідки.
    expect(same(after.fmt, before.fmt)).toBe(true);
    expect(same(after.getCatIcon, before.getCatIcon)).toBe(true);
    // І решта того самого списку.
    expect(same(after.c, before.c)).toBe(true);
    expect(same(feedAfter.renderItem, feedBefore.renderItem)).toBe(true);
    expect(same(feedAfter.ListHeaderComponent, feedBefore.ListHeaderComponent)).toBe(true);

    await act(async () => { tree.unmount(); });
  });
});
