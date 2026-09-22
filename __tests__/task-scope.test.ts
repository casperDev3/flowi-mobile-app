/**
 * __tests__/task-scope.test.ts — перемикач «Сьогодні / Тиждень / Всі» і
 * кнопка «Без дедлайну» на вкладці «Завдання» (запит 2026-09-22).
 *
 *   • «Сьогодні» — за замовчуванням, як і було;
 *   • «Тиждень» — сьогоднішнє + дедлайн у найближчі 7 днів;
 *   • «Всі» — мої активні З дедлайном; «Без дедлайну» — мої БЕЗ дедлайну.
 */
import { inTaskScope, isWeekTask } from '@/utils/taskToday';
import { applyTaskScope, buildTaskListView, taskScopeCounts, type TaskListQuery } from '@/utils/taskListView';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
const NOW = new Date(2026, 8, 22, 10, 0, 0);
const day = (offset: number) => new Date(2026, 8, 22 + offset, 12, 0, 0).toISOString();

function task(over: Partial<Task> & { id: string }): Task {
  return { title: over.id, status: 'active', subtasks: [], createdAt: day(-3), ...over };
}

const TASKS: Task[] = [
  task({ id: 'today', deadline: day(0) }),
  task({ id: 'overdue', deadline: day(-2) }),
  task({ id: 'in3', deadline: day(3) }),
  task({ id: 'in7', deadline: day(7) }),
  task({ id: 'in8', deadline: day(8) }),
  task({ id: 'undated' }),
  task({ id: 'undated-2' }),
];

const Q: TaskListQuery = {
  filter: 'active', sort: 'status', scope: 'today', search: '', projectId: null,
  priorities: [], dateFilter: null, month: new Date(2026, 8, 1),
};

const ids = (list: readonly Task[]) => list.map(t => t.id).sort();

describe('isWeekTask / inTaskScope', () => {
  test('тиждень = сьогоднішнє + дедлайн у межах 7 днів', () => {
    expect(ids(TASKS.filter(t => isWeekTask(t, COLUMNS, NOW)))).toEqual(['in3', 'in7', 'overdue', 'today']);
  });

  test('«Всі» — лише з дедлайном; «Без дедлайну» — лише без', () => {
    expect(ids(TASKS.filter(t => inTaskScope(t, COLUMNS, 'all', {}, NOW)))).toEqual(['in3', 'in7', 'in8', 'overdue', 'today']);
    expect(ids(TASKS.filter(t => inTaskScope(t, COLUMNS, 'all', { noDeadline: true }, NOW)))).toEqual(['undated', 'undated-2']);
  });

  test('завершене в «Всі» не відсіюється за дедлайном (вікно свіжості вирішує вище)', () => {
    expect(inTaskScope(task({ id: 'd', status: 'done' }), COLUMNS, 'all', {}, NOW)).toBe(true);
  });
});

describe('applyTaskScope + лічильники перемикача', () => {
  test('кожен режим дає свій набір', () => {
    expect(ids(applyTaskScope(TASKS, { ...Q, scope: 'today' }, COLUMNS, NOW, NOW))).toEqual(['overdue', 'today']);
    expect(ids(applyTaskScope(TASKS, { ...Q, scope: 'week' }, COLUMNS, NOW, NOW))).toEqual(['in3', 'in7', 'overdue', 'today']);
    expect(ids(applyTaskScope(TASKS, { ...Q, scope: 'all' }, COLUMNS, NOW, NOW))).toEqual(['in3', 'in7', 'in8', 'overdue', 'today']);
    expect(ids(applyTaskScope(TASKS, { ...Q, scope: 'all', noDeadline: true }, COLUMNS, NOW, NOW))).toEqual(['undated', 'undated-2']);
  });

  test('числа на кнопках дорівнюють довжині списку в кожному режимі', () => {
    expect(taskScopeCounts(TASKS, Q, COLUMNS, NOW, NOW)).toEqual({ today: 2, week: 4, all: 5, noDeadline: 2 });
  });

  test('статусні групи в режимі «Тиждень» не відсіюють тижневе повторно (друга копія правила)', () => {
    const labels = { today: 'С', yesterday: 'В', tomorrow: 'З', withoutDeadline: 'Б', overdue: 'П' };
    const view = buildTaskListView(TASKS, { ...Q, scope: 'week' }, COLUMNS, NOW, labels, 'uk-UA', true, NOW);
    const listed = [...view.overdue, ...view.groups.flatMap(g => g.tasks)];
    expect(ids(listed)).toEqual(['in3', 'in7', 'overdue', 'today']);
  });
});
