import { Transaction, calcTotals, filterByMonth } from '@/utils/financeUtils';
import { PRIORITY_ORDER, Task, getProgress, isOverdue, sortTasks } from '@/utils/taskUtils';

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
});
