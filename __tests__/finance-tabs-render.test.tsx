/**
 * __tests__/finance-tabs-render.test.tsx — «Фінанси» як розділ із вкладками
 * (finance-revamp.md §2): типова вкладка «Огляд», `?tab=` відкриває потрібну,
 * вимкнений підмодуль ховає вкладку, а не розділ; «Огляд» і «Звіти»
 * малюють цифри з тих самих чистих функцій, що й тести формул.
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
const mockParams: { tab?: string } = {};
const mockSetParams = jest.fn();
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn(), setParams: (p: unknown) => mockSetParams(p) },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const trees: any[] = [];

function seed() {
  const now = new Date();
  const iso = (d: number) => new Date(now.getFullYear(), now.getMonth(), d, 10).toISOString();
  mockStore.set('accounts', JSON.stringify([
    { id: 'card', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 1000, createdAt: '2026-01-01' },
  ]));
  mockStore.set('transactions', JSON.stringify([
    { id: 'a', type: 'income', category: 'Зарплата', amount: 5000, note: '', date: iso(1), accountId: 'card' },
    { id: 'b', type: 'expense', category: 'Оренда', amount: 2000, note: '', date: iso(1), accountId: 'card' },
  ]));
}

async function mount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FinanceScreen = require('@/app/(tabs)/explore').default;
  let tree: any;
  await act(async () => { tree = create(<FinanceScreen />); });
  await act(async () => {});
  await act(async () => {});
  trees.push(tree);
  return tree;
}

function tabLabels(tree: any): string[] {
  return [...new Set<string>(tree.root
    .findAll((n: any) => n.props?.accessibilityRole === 'tab' && typeof n.props?.onPress === 'function')
    .map((n: any) => n.props.accessibilityLabel))];
}

function selectedTab(tree: any): string[] {
  return [...new Set<string>(tree.root
    .findAll((n: any) => n.props?.accessibilityRole === 'tab' && n.props?.accessibilityState?.selected)
    .map((n: any) => n.props.accessibilityLabel))];
}

function hasText(tree: any, needle: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return tree.root.findAllByType(Text).some((t: any) => {
    const flat = ([] as unknown[]).concat(t.props.children).join('');
    return flat.includes(needle);
  });
}

describe('Фінанси: вкладки розділу', () => {
  beforeEach(() => {
    mockStore.clear();
    delete mockParams.tab;
    mockSetParams.mockClear();
  });
  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('шість вкладок у фіксованому порядку, типова — «Огляд»', async () => {
    seed();
    const tree = await mount();
    expect(tabLabels(tree)).toEqual([
      tr.finTabOverview, tr.finTabTransactions, tr.finTabReports,
      tr.finTabBudget, tr.finTabSubscriptions, tr.finTabAccounts,
    ]);
    expect(selectedTab(tree)).toEqual([tr.finTabOverview]);
    // «Огляд»: баланси й прогноз.
    expect(hasText(tree, tr.finOnAccounts.replace('{currency}', 'UAH'))).toBe(true);
    expect(hasText(tree, tr.finForecastTitle)).toBe(true);
  });

  it('?tab=reports відкриває «Звіти» з P&L', async () => {
    seed();
    mockParams.tab = 'reports';
    const tree = await mount();
    expect(selectedTab(tree)).toEqual([tr.finTabReports]);
    expect(hasText(tree, tr.finSavingsRate)).toBe(true);
    // Оренда — фіксована за посівною таблицею.
    expect(hasText(tree, tr.finFixed)).toBe(true);
  });

  it('перемикання вкладки пише її в адресу', async () => {
    seed();
    const tree = await mount();
    const reports = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'tab'
      && n.props?.accessibilityLabel === tr.finTabAccounts && typeof n.props?.onPress === 'function');
    await act(async () => { reports[0].props.onPress(); });
    expect(mockSetParams).toHaveBeenCalledWith({ tab: 'accounts' });
    expect(selectedTab(tree)).toEqual([tr.finTabAccounts]);
  });

  it('«Бюджет» на квартал — таблиця по місяцях, а не сума лімітів', async () => {
    seed();
    mockStore.set('finance_period', JSON.stringify('quarter'));
    mockStore.set('budget_limits', JSON.stringify([{ id: 'Оренда', category: 'Оренда', icon: 'house.fill', limit: 3000 }]));
    mockParams.tab = 'budget';
    const tree = await mount();
    expect(selectedTab(tree)).toEqual([tr.finTabBudget]);
    expect(hasText(tree, tr.finBudgetByMonth)).toBe(true);
  });

  it('«Підписки» — два списки: платежі й регулярні доходи', async () => {
    seed();
    mockParams.tab = 'subscriptions';
    const tree = await mount();
    expect(hasText(tree, tr.finRecurringPayments)).toBe(true);
    expect(hasText(tree, tr.finRecurringIncomes)).toBe(true);
  });

  it('запис категорій зберігає group/cost, розставлені на іншому клієнті (§4.1)', async () => {
    seed();
    mockStore.set('categories', JSON.stringify([
      { id: 'expense:Оренда', type: 'expense', name: 'Оренда', icon: 'house.fill', group: 'housing', cost: 'fixed' },
      { id: 'expense:Кава', type: 'expense', name: 'Кава', icon: 'cup.and.saucer.fill' },
      { id: 'income:Зарплата', type: 'income', name: 'Зарплата', icon: 'briefcase.fill', group: 'salary' },
    ]));
    await mount();
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    const rows = JSON.parse(mockStore.get('categories') ?? '[]') as Record<string, unknown>[];
    expect(rows.find(r => r.id === 'expense:Оренда')).toMatchObject({ group: 'housing', cost: 'fixed' });
    expect(rows.find(r => r.id === 'income:Зарплата')).toMatchObject({ group: 'salary' });
    // Похідні значення в запис не потрапляють — лише явні (міграція — окремо).
    expect(rows.find(r => r.id === 'expense:Кава')).not.toHaveProperty('cost');
  });

  it('вимкнений підмодуль ховає вкладку; прихована вкладка з адреси → «Огляд»', async () => {
    seed();
    mockStore.set('ui_preferences', JSON.stringify({ version: 1, disabledModules: ['budget', 'banks'] }));
    mockParams.tab = 'budget';
    const tree = await mount();
    const labels = tabLabels(tree);
    expect(labels).not.toContain(tr.finTabBudget);
    expect(labels).not.toContain(tr.finTabAccounts);
    expect(labels).toContain(tr.finTabSubscriptions);
    expect(selectedTab(tree)).toEqual([tr.finTabOverview]);
  });
});
