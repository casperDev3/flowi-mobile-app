/**
 * __tests__/budget-tab-live.test.tsx — вкладка «Бюджет» у «Фінансах» (пункт 1).
 *
 * Скарга: «Бюджет не працює на телефоні й планшеті». Причини, які тут
 * закріплені тестами:
 *  - панель читала сховище лише на фокусі — ліміт, що прилетів синком/з
 *    вебу, лишався невидимим, поки вкладка відкрита;
 *  - у кварталі/році/довільному періоді рядків, «+» і порожнього стану не
 *    було взагалі, лише таблиця — натиснути нема на що;
 *  - провалений запис ковтався мовчки, і людина бачила ліміт, якого немає;
 *  - при збої читання рядки були мертвими дотиками без пояснення;
 *  - валюту фільтра бюджет ігнорував мовчки (веб попереджає).
 * Кожен сценарій проганяється на телефоні (390) і планшеті (1024).
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
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
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
let mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));
// Запис лімітів можна «зламати» точково — решта сховища працює.
const mockFailBudgetWrite = { on: false };
jest.mock('@/store/synced-storage', () => {
  const actual = jest.requireActual('@/store/synced-storage');
  return {
    ...actual,
    saveSynced: jest.fn(async (key: string, items: unknown[]) => {
      if (key === 'budget_limits' && mockFailBudgetWrite.on) throw new Error('disk full');
      return actual.saveSynced(key, items);
    }),
  };
});

import React from 'react';

import { retryStorageRead, saveData } from '@/store/storage';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const trees: any[] = [];

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 1024, height: 768 };

function seed() {
  const now = new Date();
  const iso = (d: number) => new Date(now.getFullYear(), now.getMonth(), d, 10).toISOString();
  mockStore.set('accounts', JSON.stringify([
    { id: 'card', name: 'Картка', kind: 'card', currency: 'UAH', openingBalance: 1000, createdAt: '2026-01-01' },
  ]));
  mockStore.set('transactions', JSON.stringify([
    { id: 'b', type: 'expense', category: 'Оренда', amount: 2000, note: '', date: iso(1), accountId: 'card' },
  ]));
  mockStore.set('budget_limits', JSON.stringify([{ id: 'Оренда', category: 'Оренда', icon: 'house.fill', limit: 3000 }]));
}

async function flush() {
  await act(async () => { await new Promise(r => setTimeout(r, 20)); });
}

async function mount() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FinanceScreen = require('@/app/(tabs)/explore').default;
  let tree: any;
  await act(async () => { tree = create(<FinanceScreen />); });
  await flush();
  await flush();
  trees.push(tree);
  return tree;
}

function texts(tree: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  return tree.root.findAllByType(Text).map((t: any) => ([] as unknown[]).concat(t.props.children).join('').replace(/[\u00A0\u202F]/g, ' '));
}

function hasText(tree: any, needle: string): boolean {
  return texts(tree).some(t => t.includes(needle));
}

function pressable(tree: any, label: string) {
  return tree.root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function')[0];
}

describe.each([['телефон', PHONE], ['планшет', TABLET]])('«Бюджет» у Фінансах — %s', (_name, size) => {
  beforeEach(async () => {
    mockStore.clear();
    // Збій читання — стан модуля сховища: не даємо йому перетекти між тестами.
    await retryStorageRead('budget_limits', []);
    mockParams.tab = 'budget';
    mockWindow = size;
    mockFailBudgetWrite.on = false;
  });
  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('зміна budget_limits у сховищі при відкритій вкладці оновлює рядок', async () => {
    seed();
    const tree = await mount();
    expect(hasText(tree, '3 000')).toBe(true);
    // Так пише рушій синку: saveData + сигнал сховища, повз екран.
    await act(async () => {
      await saveData('budget_limits', [{ id: 'Оренда', category: 'Оренда', icon: 'house.fill', limit: 4500 }]);
    });
    await flush();
    expect(hasText(tree, '4 500')).toBe(true);
    expect(hasText(tree, '3 000')).toBe(false);
  });

  it('у періоді «рік» є «Показати місяць», що перемикає фільтр на поточний місяць', async () => {
    seed();
    mockStore.set('finance_period', JSON.stringify('year'));
    const tree = await mount();
    expect(hasText(tree, tr.finBudgetByMonth)).toBe(true);
    const btn = pressable(tree, tr.budgetShowMonth);
    expect(btn).toBeTruthy();
    await act(async () => { btn.props.onPress(); });
    await flush();
    // Тепер один місяць: таблиці немає, рядок категорії й «+» є.
    expect(hasText(tree, tr.finBudgetByMonth)).toBe(false);
    expect(hasText(tree, tr.budgetAddManually)).toBe(true);
    expect(hasText(tree, 'Оренда')).toBe(true);
    const stored = JSON.parse(mockStore.get('finance_period') ?? 'null');
    expect(String(stored)).toMatch(/^month/);
  });

  it('reject збереження → повідомлення і відкат ліміту', async () => {
    seed();
    const tree = await mount();
    const row = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && n.props?.activeOpacity === 0.75)[0];
    await act(async () => { row.props.onPress(); });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { TextInput } = require('react-native');
    const input = tree.root.findAllByType(TextInput).find((i: any) => i.props.value === '3000');
    await act(async () => { input.props.onChangeText('7777'); });
    mockFailBudgetWrite.on = true;
    await act(async () => { input.props.onSubmitEditing(); });
    await flush();
    expect(hasText(tree, tr.budgetSaveFailed)).toBe(true);
    expect(hasText(tree, '7 777')).toBe(false);
    expect(hasText(tree, '3 000')).toBe(true);
  });

  it('валюта фільтра ≠ основна → попередження, як у вебі', async () => {
    seed();
    mockStore.set('finance_currency', JSON.stringify('USD'));
    const tree = await mount();
    expect(hasText(tree, tr.budgetPrimaryCurrencyNote.replace('{primary}', 'UAH'))).toBe(true);
  });

  it('збій читання лімітів: дотик до рядка пояснює, чому редагування вимкнене', async () => {
    seed();
    mockStore.set('budget_limits', '{broken json');
    const tree = await mount();
    expect(hasText(tree, tr.budgetReadOnlyBody)).toBe(true);
  });
});
