/**
 * __tests__/budget-screen.test.tsx — екран бюджету мусить ВІДКРИТИСЬ.
 *
 * Єдиний тест у репозиторії, що монтує екран цілком, і поставлений він не
 * заради покриття. Бюджет падав просто на відкритті — «Invalid attempt to
 * spread non-iterable instance», — і жоден із 589 тестів цього не бачив: усі
 * вони били по чистих утилітах, куди биті дані не доходять.
 *
 * Ламала його ФОРМА даних у сховищі, а не логіка: `budget_limits` чи
 * `transactions` у вигляді обʼєкта замість масиву або з null-рядком. Такий стан
 * дають стара форма ключа, недоїхала міграція й підмінений бекап — тобто
 * реальні дані реальних людей, а не вигаданий крайовий випадок.
 *
 * Тому перевіряється тут рівно одне: що б не лежало у сховищі, екран
 * відкривається. Порожній список — поганий стан, але видимий; виняток на
 * монтуванні — чорний екран без жодного натяку на причину.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: 'StackScreen' },
  router: { back: jest.fn(), push: jest.fn() },
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

import BudgetScreen from '@/app/budget';

async function mount() {
  let tree: any; let err: unknown = null;
  try {
    await act(async () => { tree = create(<BudgetScreen />); });
  } catch (e) { err = e; }
  return { tree, err };
}

test.each([
  ['budget_limits — обʼєкт, не масив', { budget_limits: { 'Їжа': 500 } }],
  ['transactions — обʼєкт', { transactions: { a: 1 } }],
  ['categories — обʼєкт (стара форма)', { categories: { expense: ['Їжа'] } }],
  ['accounts — null', { accounts: null }],
  ['finance_currencies — рядок', { finance_currencies: 'UAH' }],
  ['budget_limits із null-елементом', { budget_limits: [null] }],
  ['транзакція без category', { transactions: [{ id: '1', type: 'expense', amount: 5, date: new Date().toISOString() }] }],
  ['транзакція з category=__proto__', { transactions: [{ id: '1', type: 'expense', category: '__proto__', amount: 5, date: new Date().toISOString(), currency: 'USD' }] }],
])('%s', async (_name, data) => {
  mockStore.clear();
  for (const [k, v] of Object.entries(data)) mockStore.set(k, JSON.stringify(v));
  const { err } = await mount();
  if (err) throw err;
});

test('екран бюджету монтується', async () => {
  mockStore.set('transactions', JSON.stringify([
    { id: '1', type: 'expense', category: 'Їжа', amount: 500, note: '', date: new Date().toISOString(), accountId: 'a1' },
  ]));
  mockStore.set('accounts', JSON.stringify([
    { id: 'a1', name: 'Готівка', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: new Date().toISOString() },
  ]));
  let tree: any;
  await act(async () => { tree = create(<BudgetScreen />); });
  expect(tree.toJSON()).toBeTruthy();
});
