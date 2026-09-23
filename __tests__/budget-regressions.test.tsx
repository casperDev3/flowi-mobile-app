/**
 * __tests__/budget-regressions.test.tsx — чому вкладка «Бюджет» не відкривалась.
 *
 * Кожен тест тут стоїть за конкретним симптомом, а не за покриттям:
 *
 *  • колекція лімітів не спарсилась — раніше екран цілком замінявся плашкою
 *    «Дані не прочитались» із кнопкою «Повторити», яка перечитує ТІ САМІ
 *    байти, тобто не може допомогти ніколи;
 *  • один битий рядок (без category, з limit: null, з давнім UUID-id) валив
 *    рендер усього списку;
 *  • пресети осідали в 'budget_limits' і, разом із мовозалежним ключем,
 *    давали поруч «Їжа» та «Food»;
 *  • «ВИТРАЧЕНО» і «БЮДЖЕТ» рахувались із різних наборів категорій.
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
const { create, act } = require('react-test-renderer') as any;
import BudgetScreen from '@/app/budget';
import {
  sanitizeBudgetLimits, buildBudgetRows, budgetPresets, budgetTotals, isUsableBudgetId,
} from '@/utils/budgetUtils';
import { filterByMoneyScope } from '@/utils/budgetScope';

function texts(node: any, out: string[] = []): string[] {
  if (node == null) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach(n => texts(n, out)); return out; }
  if (node.children) texts(node.children, out);
  return out;
}

const today = new Date().toISOString();

test('битий JSON лімітів не гасить екран — витрати видно', async () => {
  mockStore.clear();
  mockStore.set('budget_limits', '[{"category":"Їжа",');
  mockStore.set('transactions', JSON.stringify([
    { id: '1', type: 'expense', category: 'Кава', amount: 250, date: today },
  ]));
  let tree: any;
  await act(async () => { tree = create(<BudgetScreen />); });
  const all = texts(tree.toJSON()).join('|');
  expect(all).toContain('Кава');
  expect(all).toContain('Дані не прочитались');
});

test('битий рядок пропускаємо, решту показуємо', () => {
  const rows = sanitizeBudgetLimits([
    null, 'x', { limit: 5 }, { category: 'Їжа', limit: 'nope' },
    { category: 'Авто', limit: 1000, id: 'old-uuid-9f2' },
    { category: 'Авто', limit: 7 },
  ]);
  expect(rows.map(r => r.category)).toEqual(['Їжа', 'Авто']);
  expect(rows[0].limit).toBe(0);
  expect(rows.every(r => r.id === r.category)).toBe(true); // міграція id
});

test('пресет не дублюється іншою мовою', () => {
  const spent = { Food: 300 };
  const rows = buildBudgetRows([], budgetPresets([], 'en'), spent, {});
  const names = rows.map(r => r.category);
  expect(names).toContain('Food');
  expect(names).not.toContain('Їжа');
  // ключ пресета не залежить від мови
  expect(budgetPresets([], 'en').map(p => p.key))
    .toEqual(budgetPresets([], 'uk').map(p => p.key));
  expect(budgetPresets([], 'en')[0].label).toBe('Food');
});

test('підсумки з одного набору', () => {
  const rows = buildBudgetRows(
    [{ id: 'Їжа', category: 'Їжа', icon: 'fork.knife' as any, limit: 1000 }],
    [],
    { 'Їжа': 400, 'Таксі': 900 },
    {},
  );
  expect(budgetTotals(rows)).toEqual({ totalBudget: 1000, totalSpent: 400, unbudgetedSpent: 900 });
});

test('межа id', () => {
  expect(isUsableBudgetId('a'.repeat(64))).toBe(true);
  expect(isUsableBudgetId('a'.repeat(65))).toBe(false);
});

test('фільтр ракурсу', () => {
  const txs = [{ projectId: 'p1' }, {}, { projectId: '' }];
  expect(filterByMoneyScope(txs, 'personal')).toHaveLength(2);
  expect(filterByMoneyScope(txs, 'project')).toHaveLength(1);
  expect(filterByMoneyScope(txs, 'all')).toBe(txs);
});

test('пресети не осідають у сховищі', async () => {
  mockStore.clear();
  mockStore.set('budget_limits', JSON.stringify([]));
  let tree: any;
  await act(async () => { tree = create(<BudgetScreen />); });
  // жодного запису не було
  expect(mockStore.get('budget_limits')).toBe('[]');
  expect(texts(tree.toJSON()).join('|')).toContain('Їжа');
});
