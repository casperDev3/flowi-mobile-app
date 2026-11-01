/**
 * __tests__/task-periods.test.ts — випадний список періоду «Завдань» на
 * планшеті (utils/taskPeriods.ts) і його місце в конвеєрі списку
 * (utils/taskListView.ts): Сьогодні / Завтра / Тиждень / Місяць / Всі /
 * Без дедлайну + «Термінові» (P0 + P1). Телефон period не ставить — його
 * конвеєр перевіряє task-scope.test.ts і він не змінився.
 */
import {
  inTaskPeriod,
  isMonthTask,
  isTomorrowTask,
  isUrgentFilter,
  periodToKeepVisible,
  periodToScope,
  scopeToPeriod,
  TASK_PERIOD_ORDER,
  URGENT_PRIORITIES,
} from '@/utils/taskPeriods';
import {
  applyTaskScope,
  taskListQueryFromParams,
  taskListQueryToParams,
  taskPeriodCounts,
  type TaskListQuery,
} from '@/utils/taskListView';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
// Вівторок, 22 вересня 2026 — до кінця місяця 8 днів (тиждень заходить у жовтень лише на 29-те).
const NOW = new Date(2026, 8, 22, 10, 0, 0);
const day = (offset: number) => new Date(2026, 8, 22 + offset, 12, 0, 0).toISOString();

function task(over: Partial<Task> & { id: string }): Task {
  return { title: over.id, status: 'active', subtasks: [], createdAt: day(-3), ...over };
}

const TASKS: Task[] = [
  task({ id: 'today', deadline: day(0) }),
  task({ id: 'overdue', deadline: day(-2) }),
  task({ id: 'tomorrow', deadline: day(1) }),
  task({ id: 'in3', deadline: day(3) }),
  task({ id: 'in8', deadline: day(8) }), // 30 вересня — ще цей місяць, але поза тижнем
  task({ id: 'next-month', deadline: day(12) }), // 4 жовтня
  task({ id: 'undated' }),
];

const Q: TaskListQuery = {
  filter: 'active', sort: 'status', scope: 'all', search: '', projectId: null,
  priorities: [], dateFilter: null, month: new Date(2026, 8, 1),
};

const ids = (list: readonly { id: string }[]) => list.map(t => t.id).sort();

describe('правила періодів', () => {
  test('«Завтра» — лише дедлайн саме завтра, без простроченого й «у процесі»', () => {
    expect(ids(TASKS.filter(t => isTomorrowTask(t, NOW)))).toEqual(['tomorrow']);
    expect(isTomorrowTask(task({ id: 'd', status: 'done', deadline: day(1) }), NOW)).toBe(false);
    expect(isTomorrowTask(task({ id: 'bad', deadline: 'nope' }), NOW)).toBe(false);
  });

  test('«Місяць» — тиждень + дедлайн до кінця поточного місяця', () => {
    expect(ids(TASKS.filter(t => isMonthTask(t, COLUMNS, NOW)))).toEqual(['in3', 'in8', 'overdue', 'today', 'tomorrow']);
  });

  test('«Місяць» не вужчий за «Тиждень» наприкінці місяця', () => {
    const late = new Date(2026, 8, 28, 10);
    const crossing = task({ id: 'oct-2', deadline: new Date(2026, 9, 2, 12).toISOString() });
    expect(isMonthTask(crossing, COLUMNS, late)).toBe(true);
  });

  test('завершене проходить усі періоди, крім «Сьогодні» (там — лише закрите сьогодні)', () => {
    const done = task({ id: 'done', status: 'done', deadline: day(5) });
    expect(inTaskPeriod(done, COLUMNS, 'tomorrow', NOW)).toBe(true);
    expect(inTaskPeriod(done, COLUMNS, 'month', NOW)).toBe(true);
    expect(inTaskPeriod(done, COLUMNS, 'today', NOW)).toBe(false);
  });
});

describe('період ↔ перемикач scope / noDeadline', () => {
  test.each(TASK_PERIOD_ORDER.map(p => [p]))('%s переживає round-trip', period => {
    const { scope, noDeadline, extra } = periodToScope(period);
    expect(scopeToPeriod(scope, noDeadline, extra)).toBe(period);
  });

  test('старі значення — ті самі: «Без дедлайну» = «Всі» + noDeadline', () => {
    expect(periodToScope('undated')).toEqual({ scope: 'all', noDeadline: true, extra: null });
    expect(periodToScope('tomorrow')).toEqual({ scope: 'all', noDeadline: false, extra: 'tomorrow' });
    expect(scopeToPeriod('all', false)).toBe('all');
  });
});

describe('конвеєр списку з періодом', () => {
  test('«Завтра» і «Місяць» звужують «Всі»; без period — «Всі» як раніше', () => {
    expect(ids(applyTaskScope(TASKS, { ...Q, period: 'tomorrow' }, COLUMNS, NOW, NOW))).toEqual(['tomorrow']);
    expect(ids(applyTaskScope(TASKS, { ...Q, period: 'month' }, COLUMNS, NOW, NOW)))
      .toEqual(['in3', 'in8', 'overdue', 'today', 'tomorrow']);
    expect(ids(applyTaskScope(TASKS, Q, COLUMNS, NOW, NOW)))
      .toEqual(['in3', 'in8', 'next-month', 'overdue', 'today', 'tomorrow']);
  });

  test('period ігнорується поза «Всі» з дедлайном', () => {
    expect(ids(applyTaskScope(TASKS, { ...Q, scope: 'today', period: 'month' }, COLUMNS, NOW, NOW))).toEqual(['overdue', 'today']);
    expect(ids(applyTaskScope(TASKS, { ...Q, noDeadline: true, period: 'tomorrow' }, COLUMNS, NOW, NOW))).toEqual(['undated']);
  });

  test('«Завтра»: свіже завершене — лише закрите сьогодні', () => {
    const closedToday = task({ id: 'closed-today', status: 'done', history: [{ type: 'done', at: new Date(2026, 8, 22, 9).toISOString() }] as Task['history'] });
    const closedYesterday = task({ id: 'closed-yesterday', status: 'done', history: [{ type: 'done', at: new Date(2026, 8, 21, 9).toISOString() }] as Task['history'] });
    const list = applyTaskScope([closedToday, closedYesterday], { ...Q, period: 'tomorrow' }, COLUMNS, NOW, NOW);
    expect(ids(list)).toEqual(['closed-today']);
  });

  test('лічильники меню — по кожному періоду, лише незавершене', () => {
    const counts = taskPeriodCounts([...TASKS, task({ id: 'done', status: 'done', deadline: day(1) })], Q, COLUMNS, NOW, NOW);
    expect(counts).toEqual({ today: 2, tomorrow: 1, week: 4, month: 5, all: 6, undated: 1 });
  });

  test('параметри маршруту «Всі (N)» несуть period', () => {
    const q: TaskListQuery = { ...Q, period: 'month' };
    const params = taskListQueryToParams(q);
    expect(params.period).toBe('month');
    expect(taskListQueryFromParams(params).period).toBe('month');
    // Без «Всі» чи з «Без дедлайну» period не має сенсу і не з'являється.
    expect(taskListQueryToParams({ ...Q, scope: 'week', period: 'month' }).period).toBeUndefined();
    expect(taskListQueryFromParams({ scope: 'all', noDeadline: '1', period: 'tomorrow' }).period).toBeUndefined();
    expect(taskListQueryFromParams({ scope: 'all', period: 'bogus' }).period).toBeUndefined();
  });
});

describe('щойно створене не зникає', () => {
  test('лишається в поточному періоді, якщо вміщається', () => {
    expect(periodToKeepVisible(task({ id: 'x', deadline: day(1) }), COLUMNS, 'tomorrow', NOW)).toBe('tomorrow');
  });

  test('інакше — найближчий ширший', () => {
    expect(periodToKeepVisible(task({ id: 'x', deadline: day(1) }), COLUMNS, 'today', NOW)).toBe('tomorrow');
    expect(periodToKeepVisible(task({ id: 'x', deadline: day(8) }), COLUMNS, 'week', NOW)).toBe('month');
    expect(periodToKeepVisible(task({ id: 'x' }), COLUMNS, 'tomorrow', NOW)).toBe('undated');
  });
});

describe('«Термінові»', () => {
  test('рівно P0 + P1, у будь-якому порядку', () => {
    expect(isUrgentFilter([...URGENT_PRIORITIES])).toBe(true);
    expect(isUrgentFilter([1, 0])).toBe(true);
    expect(isUrgentFilter([0])).toBe(false);
    expect(isUrgentFilter([0, 1, 2])).toBe(false);
    expect(isUrgentFilter([])).toBe(false);
  });
});
