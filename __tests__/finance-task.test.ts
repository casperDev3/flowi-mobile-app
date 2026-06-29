import { Transaction, calcTotals, filterByMonth, groupTransactions, txCurrency } from '@/utils/financeUtils';
import { PRIORITY_ORDER, Task, applyTaskFilters, deadlineDiff, getProgress, isOverdue, sortTasks } from '@/utils/taskUtils';

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't', type: 'expense', category: 'food', amount: 100, note: '', date: '2026-06-15', ...over,
});

const task = (over: Partial<Task> = {}): Task => ({
  id: 't', title: 'Task', description: '', priority: 'medium', status: 'active',
  subtasks: [], createdAt: '2026-06-01', ...over,
});

describe('financeUtils.filterByMonth', () => {
  test('лишає лише транзакції цього місяця', () => {
    const txs = [tx({ date: '2026-06-10' }), tx({ date: '2026-05-30' }), tx({ date: '2026-06-28' })];
    const res = filterByMonth(txs, new Date(2026, 5, 1));
    expect(res).toHaveLength(2);
  });
});

describe('financeUtils.calcTotals', () => {
  test('баланс і % заощаджень', () => {
    const r = calcTotals([
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'expense', amount: 400 }),
      tx({ type: 'expense', amount: 100 }),
    ]);
    expect(r.income).toBe(1000);
    expect(r.expense).toBe(500);
    expect(r.balance).toBe(500);
    expect(r.savingsPct).toBe(50);
  });

  test('без доходу savingsPct = 0; від’ємний баланс не валить', () => {
    const r = calcTotals([tx({ type: 'expense', amount: 200 })]);
    expect(r.balance).toBe(-200);
    expect(r.savingsPct).toBe(0);
  });
});

describe('financeUtils — валюта та групування', () => {
  test('txCurrency дефолтиться на UAH', () => {
    expect(txCurrency(tx())).toBe('UAH');
    expect(txCurrency(tx({ currency: 'USD' }))).toBe('USD');
  });

  test('groupTransactions групує за днем і сумує по валюті', () => {
    const txs = [
      tx({ date: '2026-06-15', type: 'expense', amount: 100 }),
      tx({ date: '2026-06-15', type: 'income', amount: 500 }),
      tx({ date: '2026-06-14', type: 'expense', amount: 30 }),
    ];
    const groups = groupTransactions(txs, 'X', 'Y', 'uk-UA');
    expect(groups).toHaveLength(2);
    const day15 = groups.find(g => g.items.length === 2)!;
    expect(day15.dayExpenseByCur.UAH).toBe(100);
    expect(day15.dayIncomeByCur.UAH).toBe(500);
  });
});

describe('taskUtils', () => {
  test('PRIORITY_ORDER', () => {
    expect(PRIORITY_ORDER.high).toBeLessThan(PRIORITY_ORDER.medium);
    expect(PRIORITY_ORDER.medium).toBeLessThan(PRIORITY_ORDER.low);
  });

  test('sortTasks за пріоритетом', () => {
    const sorted = sortTasks([task({ priority: 'low' }), task({ priority: 'high' }), task({ priority: 'medium' })], 'priority');
    expect(sorted.map(t => t.priority)).toEqual(['high', 'medium', 'low']);
  });

  test('isOverdue', () => {
    expect(isOverdue(task({ deadline: '2000-01-01' }))).toBe(true);
    expect(isOverdue(task({ deadline: '2999-01-01' }))).toBe(false);
    expect(isOverdue(task({ deadline: '2000-01-01', status: 'done' }))).toBe(false);
    expect(isOverdue(task({}))).toBe(false); // без дедлайну
  });

  test('getProgress за підзадачами (відсоток 0–100)', () => {
    expect(getProgress(task({ subtasks: [] }))).toBe(0);
    expect(getProgress(task({
      subtasks: [
        { id: 'a', title: 'a', done: true },
        { id: 'b', title: 'b', done: false },
      ],
    }))).toBe(50);
    expect(getProgress(task({ status: 'done', subtasks: [] }))).toBe(100);
  });

  test('sortTasks за назвою / newest / oldest', () => {
    const a = task({ title: 'Banana', createdAt: '2026-06-01' });
    const b = task({ title: 'Apple', createdAt: '2026-06-03' });
    expect(sortTasks([a, b], 'name').map(t => t.title)).toEqual(['Apple', 'Banana']);
    expect(sortTasks([a, b], 'newest').map(t => t.createdAt)).toEqual(['2026-06-03', '2026-06-01']);
    expect(sortTasks([a, b], 'oldest').map(t => t.createdAt)).toEqual(['2026-06-01', '2026-06-03']);
  });

  test('applyTaskFilters: статус, пошук, пріоритет, проєкт', () => {
    const tasks = [
      task({ id: '1', title: 'Buy milk', status: 'active', priority: 'high', projectId: 'p1' }),
      task({ id: '2', title: 'Pay bill', status: 'done', priority: 'low', projectId: 'p2' }),
    ];
    const base = { filter: 'all' as const, search: '' };
    expect(applyTaskFilters(tasks, { ...base, filter: 'done' })).toHaveLength(1);
    expect(applyTaskFilters(tasks, { ...base, search: 'milk' })).toHaveLength(1);
    expect(applyTaskFilters(tasks, { ...base, priority: 'high' })).toHaveLength(1);
    expect(applyTaskFilters(tasks, { ...base, projectId: 'p2' }).map(t => t.id)).toEqual(['2']);
    expect(applyTaskFilters(tasks, base)).toHaveLength(2);
  });

  test('deadlineDiff знак', () => {
    expect(deadlineDiff('2999-01-01')).toBeGreaterThan(0);
    expect(deadlineDiff('2000-01-01')).toBeLessThan(0);
  });
});
