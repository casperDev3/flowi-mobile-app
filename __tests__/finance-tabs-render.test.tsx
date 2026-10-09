/**
 * __tests__/finance-tabs-render.test.tsx — «Фінанси» як розділ із вкладками
 * (finance-revamp.md §2): типова вкладка «Операції» (рішення власника 2026-10),
 * вкладки в ОДИН ряд скрізь — «Операції · Рахунки · Звіти · Ще», Бюджет і
 * Підписки в меню «Ще»; `?tab=` відкриває потрібну (старе `overview` →
 * «Звіти»), вимкнений підмодуль ховає вкладку, а не розділ; «Звіти»
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
let mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));
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

/** Підписи вкладок розділу (на «Операціях» є ще role=tab сегмента стрічки). */
const SECTION_TABS = new Set<string>([
  tr.finTabTransactions, tr.finTabAccounts, tr.finTabReports,
  tr.finTabBudget, tr.finTabSubscriptions, tr.finTabMore,
]);

/** Відкриває меню «Ще» і повертає підписи його пунктів. */
async function moreItems(tree: any): Promise<string[]> {
  const btn = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'tab'
    && n.props?.accessibilityHint === tr.finMoreSections && typeof n.props?.onPress === 'function')[0];
  if (!btn) return [];
  await act(async () => { btn.props.onPress(); });
  await act(async () => {});
  return [...new Set<string>(tree.root
    .findAll((n: any) => n.props?.accessibilityRole === 'menuitem' && typeof n.props?.onPress === 'function')
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
    mockWindow = { width: 390, height: 844 };
  });
  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('один ряд вкладок: три основні + «Ще»; типова — «Операції» із залишками', async () => {
    seed();
    const tree = await mount();
    expect(tabLabels(tree).filter(l => SECTION_TABS.has(l))).toEqual([
      tr.finTabTransactions, tr.finTabAccounts, tr.finTabReports, tr.finTabMore,
    ]);
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabTransactions]);
    // «Операції»: одразу залишки й стрічка — без стрічки карток рахунків і
    // без обороту місяця (вони у «Рахунках»).
    expect(hasText(tree, tr.finBalances)).toBe(true);
    expect(hasText(tree, 'Зарплата')).toBe(true);
    expect(hasText(tree, tr.finPeriodFlow)).toBe(false);
    // Рідші розділи — у меню «Ще».
    expect(await moreItems(tree)).toEqual([tr.finTabBudget, tr.finTabSubscriptions]);
  });

  it('«Операції» не показують підписок, крім оплат на сьогодні', async () => {
    seed();
    const today = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const inThree = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    const ago = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
    mockStore.set('subscriptions', JSON.stringify([
      { id: 's1', name: 'Netflix', amount: 300, currency: 'UAH', period: 'monthly', nextPaymentDate: key(today), category: 'Розваги', createdAt: '2026-01-01' },
      { id: 's2', name: 'Spotify', amount: 200, currency: 'UAH', period: 'monthly', nextPaymentDate: key(inThree), category: 'Розваги', createdAt: '2026-01-01' },
      { id: 's3', name: 'iCloud', amount: 50, currency: 'UAH', period: 'monthly', nextPaymentDate: key(ago), category: 'Сервіси', createdAt: '2026-01-01' },
    ]));
    const tree = await mount();
    expect(hasText(tree, tr.finTodayDue)).toBe(true);
    expect(hasText(tree, 'Netflix')).toBe(true);
    expect(hasText(tree, 'Spotify')).toBe(false);
    expect(hasText(tree, 'iCloud')).toBe(false);
    expect(hasText(tree, tr.subUpcoming)).toBe(false);
  });

  it('«Рахунки» показують оборот періоду', async () => {
    seed();
    mockParams.tab = 'accounts';
    const tree = await mount();
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabAccounts]);
    expect(hasText(tree, tr.finPeriodFlow)).toBe(true);
    expect(hasText(tree, tr.finOnAccounts.replace('{currency}', 'UAH'))).toBe(true);
  });

  it('?tab=reports: одна стрічка — P&L, структура, рух коштів, прогноз; без балансів', async () => {
    seed();
    mockParams.tab = 'reports';
    const tree = await mount();
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabReports]);
    expect(hasText(tree, tr.finSavingsRate)).toBe(true);
    // Оренда — фіксована за посівною таблицею.
    expect(hasText(tree, tr.finFixed)).toBe(true);
    expect(hasText(tree, tr.finStructure)).toBe(true);
    expect(hasText(tree, tr.finFactTitle)).toBe(true);
    expect(hasText(tree, tr.finForecastTitle)).toBe(true);
    // Баланси рахунків — лише на «Рахунках».
    expect(hasText(tree, tr.finOnAccounts.replace('{currency}', 'UAH'))).toBe(false);
  });

  it('старе посилання ?tab=overview відкриває «Звіти»', async () => {
    seed();
    mockParams.tab = 'overview';
    const tree = await mount();
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabReports]);
    expect(hasText(tree, tr.finForecastTitle)).toBe(true);
  });

  it('перемикання вкладки пише її в адресу', async () => {
    seed();
    const tree = await mount();
    const reports = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'tab'
      && n.props?.accessibilityLabel === tr.finTabAccounts && typeof n.props?.onPress === 'function');
    await act(async () => { reports[0].props.onPress(); });
    expect(mockSetParams).toHaveBeenCalledWith({ tab: 'accounts' });
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabAccounts]);
  });

  it('«Бюджет» на квартал — таблиця по місяцях, а не сума лімітів', async () => {
    seed();
    mockStore.set('finance_period', JSON.stringify('quarter'));
    mockStore.set('budget_limits', JSON.stringify([{ id: 'Оренда', category: 'Оренда', icon: 'house.fill', limit: 3000 }]));
    mockParams.tab = 'budget';
    const tree = await mount();
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabBudget]);
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

  it('вимкнений підмодуль ховає вкладку; прихована вкладка з адреси → «Операції»', async () => {
    seed();
    mockStore.set('ui_preferences', JSON.stringify({ version: 1, disabledModules: ['budget', 'banks'] }));
    mockParams.tab = 'budget';
    const tree = await mount();
    const labels = tabLabels(tree);
    expect(labels).not.toContain(tr.finTabBudget);
    expect(labels).not.toContain(tr.finTabAccounts);
    // У «Ще» лишилися б самі Підписки — один пункт стоїть просто вкладкою.
    expect(await moreItems(tree)).toEqual([]);
    expect(labels).toEqual(expect.arrayContaining([tr.finTabReports, tr.finTabSubscriptions]));
    expect(selectedTab(tree).filter(l => SECTION_TABS.has(l))).toEqual([tr.finTabTransactions]);
  });

  it('планшет-ландшафт: ті самі вкладки + «Ще», один чип «Фільтри», залишки — у бічній колонці', async () => {
    seed();
    mockWindow = { width: 1194, height: 834 };
    const tree = await mount();
    expect(tabLabels(tree).filter(l => SECTION_TABS.has(l))).toEqual([
      tr.finTabTransactions, tr.finTabAccounts, tr.finTabReports, tr.finTabMore,
    ]);
    // Валюта, ракурс і тип — за одним чипом, а не радіо в ряду навігації.
    expect(hasText(tree, tr.filters)).toBe(true);
    const inlineScope = tree.root.findAll((n: any) => n.props?.accessibilityRole === 'radiogroup'
      && n.props?.accessibilityLabel === tr.budgetScopeLabel);
    expect(inlineScope).toHaveLength(0);
    expect(hasText(tree, tr.finBalances)).toBe(true);
    expect(hasText(tree, tr.txEmptyTitle)).toBe(true);
  });

  it('планшет-портрет: три вкладки + «Ще», залишки над стрічкою', async () => {
    seed();
    mockWindow = { width: 744, height: 1133 };
    const tree = await mount();
    expect(tabLabels(tree).filter(l => SECTION_TABS.has(l))).toEqual([
      tr.finTabTransactions, tr.finTabAccounts, tr.finTabReports, tr.finTabMore,
    ]);
    expect(hasText(tree, tr.finBalances)).toBe(true);
  });
});
