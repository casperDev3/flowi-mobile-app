/**
 * __tests__/task-list-view.test.ts — ліміт 15 у групі й екран «Всі (N)».
 *
 * Головне, що тут зафіксовано: екран групи будує РІВНО той самий набір, що й
 * список, з якого прийшли, — фільтри переживають дорогу через параметри
 * маршруту, а число на кнопці «Всі (N)» збігається з довжиною повного списку.
 */
import {
  buildProjectCalendarDays,
  buildProjectListGroups,
  buildTaskListView,
  filterTasksForList,
  findTaskListGroup,
  limitGroupTasks,
  projectDetailTasks,
  projectGroupTasks,
  sortTasksForList,
  taskListQueryFromParams,
  taskListQueryToParams,
  OVERDUE_GROUP_KEY,
  TASK_GROUP_LIMIT,
  type GroupLabels,
  type ProjectListGroupLabels,
  type TaskListQuery,
} from '@/utils/taskListView';
import { BACKLOG_GROUP_KEY, type Sprint } from '@/utils/sprintUtils';
import { ACTIVE_COLUMN_ID, DONE_COLUMN_ID, mergeTaskStatusColumns } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';

const COLUMNS = mergeTaskStatusColumns([]);
const TODAY = new Date(2026, 8, 3, 12, 0, 0);
const TODAY_ISO = new Date(2026, 8, 3, 12, 0, 0).toISOString();
const LABELS: GroupLabels = {
  today: 'Сьогодні', yesterday: 'Вчора', tomorrow: 'Завтра', withoutDeadline: 'Без дедлайну', overdue: 'Прострочені',
};

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: `Задача ${over.id}`,
    status: 'active',
    subtasks: [],
    createdAt: TODAY_ISO,
    ...over,
  };
}

const BASE: TaskListQuery = {
  filter: 'active',
  sort: 'status',
  scope: 'all',
  search: '',
  projectId: null,
  priorities: [],
  dateFilter: null,
  month: new Date(2026, 8, 1),
};

describe('limitGroupTasks', () => {
  test('до ліміту включно — усе видно, кнопки немає', () => {
    const items = Array.from({ length: TASK_GROUP_LIMIT }, (_, i) => i);
    expect(limitGroupTasks(items)).toEqual({ visible: items, total: 15, hasMore: false });
  });

  test('понад ліміт — перші 15 і загальна кількість', () => {
    const items = Array.from({ length: 18 }, (_, i) => i);
    const result = limitGroupTasks(items);
    expect(result.visible).toEqual(items.slice(0, 15));
    expect(result.total).toBe(18);
    expect(result.hasMore).toBe(true);
  });
});

describe('параметри маршруту', () => {
  test('фільтри переживають дорогу туди й назад', () => {
    const q: TaskListQuery = {
      filter: 'all',
      sort: 'deadline',
      scope: 'today',
      search: 'звіт',
      projectId: 'p1',
      priorities: [0, 2],
      dateFilter: new Date(2026, 8, 3).toDateString(),
      month: new Date(2026, 8, 1),
    };
    expect(taskListQueryFromParams(taskListQueryToParams(q))).toEqual(q);
  });

  test('зіпсовані значення падають у типові екрана', () => {
    const q = taskListQueryFromParams({ filter: 'bogus', sort: 'x', scope: 'y', priorities: '9,a,1', month: 'nope' }, new Date(2026, 4, 17));
    expect(q.filter).toBe('active');
    expect(q.sort).toBe('status');
    expect(q.scope).toBe('today');
    expect(q.priorities).toEqual([1]);
    expect(q.month).toEqual(new Date(2026, 4, 1));
    expect(q.projectId).toBeNull();
    expect(q.dateFilter).toBeNull();
  });
});

describe('filterTasksForList — §3.7 «Особисте агрегує» (мінор з ревʼю: Tasks-таб не застосовував це правило)', () => {
  const sorted = (tasks: Task[], q: TaskListQuery) => sortTasksForList(tasks, q.sort);

  test('myUserId не заданий (undefined) — фільтр пропускає все, як і до цього поля', () => {
    const tasks = [
      task({ id: 'personal' }),
      task({ id: 'assigned-other', projectId: 'p1', assigneeId: 'u2' }),
      task({ id: 'created-other', projectId: 'p1', createdBy: 'u2' }),
    ];
    const result = filterTasksForList(sorted(tasks, BASE), BASE);
    expect(result.map(t => t.id).sort()).toEqual(['assigned-other', 'created-other', 'personal']);
  });

  test('особистий потік (без projectId) лишається завжди, незалежно від myUserId', () => {
    const tasks = [task({ id: 'personal' })];
    const q = { ...BASE, myUserId: 'u1' };
    expect(filterTasksForList(sorted(tasks, q), q).map(t => t.id)).toEqual(['personal']);
  });

  test('проєктне завдання, призначене іншому, ховається від мене', () => {
    const tasks = [
      task({ id: 'mine', projectId: 'p1', assigneeId: 'u1' }),
      task({ id: 'theirs', projectId: 'p1', assigneeId: 'u2' }),
    ];
    const q = { ...BASE, myUserId: 'u1' };
    expect(filterTasksForList(sorted(tasks, q), q).map(t => t.id)).toEqual(['mine']);
  });

  test('без призначеного виконавця — моє, лише якщо я автор; без автора — нічиє (регресія з ревʼю)', () => {
    // review finding (minor): раніше `isMyTask` рахував запис без `createdBy`
    // "моїм" для КОЖНОГО учасника — легасі/мігрована непризначена задача
    // з'являлась би в списку "Моє" у всіх одразу. Контракт §3.7 вимагає
    // дослівну рівність `createdBy == me`, без фолбеку на відсутність поля.
    const tasks = [
      task({ id: 'created-by-me', projectId: 'p1', createdBy: 'u1' }),
      task({ id: 'created-by-other', projectId: 'p1', createdBy: 'u2' }),
      task({ id: 'no-author', projectId: 'p1' }),
    ];
    const q = { ...BASE, myUserId: 'u1' };
    expect(filterTasksForList(sorted(tasks, q), q).map(t => t.id).sort()).toEqual(['created-by-me']);
  });
});

describe('buildTaskListView + findTaskListGroup', () => {
  test('повна група на екрані «Всі» збігається з числом на кнопці і шанує пошук', () => {
    const tasks = [
      ...Array.from({ length: 20 }, (_, i) => task({ id: `m${i}`, title: `Звіт ${i}`, kanbanColumnId: ACTIVE_COLUMN_ID })),
      ...Array.from({ length: 5 }, (_, i) => task({ id: `x${i}`, title: `Інше ${i}` })),
    ];
    const q = { ...BASE, search: 'звіт' };
    const view = buildTaskListView(tasks, q, COLUMNS, TODAY, LABELS, 'uk-UA');
    const group = view.groups.find(g => g.key === ACTIVE_COLUMN_ID)!;
    expect(group.tasks).toHaveLength(20);
    expect(limitGroupTasks(group.tasks).visible).toHaveLength(15);

    // Екран групи: ті самі фільтри через маршрут, те саме сховище.
    const restored = taskListQueryFromParams(taskListQueryToParams(q));
    const again = buildTaskListView(tasks, restored, COLUMNS, TODAY, LABELS, 'uk-UA');
    const full = findTaskListGroup(again, ACTIVE_COLUMN_ID, LABELS)!;
    expect(full.tasks.map(t => t.id)).toEqual(group.tasks.map(t => t.id));
  });

  test('«Прострочені» адресуються окремим ключем', () => {
    const past = new Date(2026, 8, 1, 12).toISOString();
    const tasks = [task({ id: 'o1', deadline: past }), task({ id: 'a1' })];
    const view = buildTaskListView(tasks, BASE, COLUMNS, TODAY, LABELS, 'uk-UA');
    expect(view.overdue.map(t => t.id)).toEqual(['o1']);
    const overdue = findTaskListGroup(view, OVERDUE_GROUP_KEY, LABELS)!;
    expect(overdue.label).toBe('Прострочені');
    expect(overdue.tasks.map(t => t.id)).toEqual(['o1']);
    // Прострочене не дублюється у своїй статусній групі.
    expect(view.groups.flatMap(g => g.tasks).map(t => t.id)).toEqual(['a1']);
  });

  test('групи, якої вже немає, немає і на екрані «Всі»', () => {
    const view = buildTaskListView([task({ id: 'a' })], BASE, COLUMNS, TODAY, LABELS, 'uk-UA');
    expect(findTaskListGroup(view, 'status-missing', LABELS)).toBeNull();
    expect(findTaskListGroup(view, OVERDUE_GROUP_KEY, LABELS)).toBeNull();
  });
});

describe('групи проєкту', () => {
  const sprint: Sprint = { id: 's1', projectId: 'p1', name: 'Спринт 1', createdAt: TODAY_ISO } as Sprint;

  test('спринт і беклог адресуються ключем групи', () => {
    const tasks = [
      task({ id: 't1', projectId: 'p1', sprintId: 's1' }),
      task({ id: 't2', projectId: 'p1' }),
      task({ id: 't3', projectId: 'p2' }),
      // Чужий projectId, але спринт наш — показується в спринті (див. projects.tsx).
      task({ id: 't4', projectId: 'p2', sprintId: 's1' }),
    ];
    expect(projectGroupTasks(tasks, [sprint], 'p1', 's1')?.tasks.map(t => t.id)).toEqual(['t1', 't4']);
    expect(projectGroupTasks(tasks, [sprint], 'p1', BACKLOG_GROUP_KEY)?.tasks.map(t => t.id)).toEqual(['t2']);
    expect(projectGroupTasks(tasks, [sprint], 'p1', 'gone')).toBeNull();
  });

  test('порядок: незавершені зверху, далі за дедлайном', () => {
    const tasks = [
      task({ id: 'done', projectId: 'p1', status: 'done' }),
      task({ id: 'late', projectId: 'p1', deadline: '2026-09-20' }),
      task({ id: 'none', projectId: 'p1' }),
      task({ id: 'soon', projectId: 'p1', deadline: '2026-09-05' }),
    ];
    expect(projectDetailTasks(tasks, [], 'p1').map(t => t.id)).toEqual(['soon', 'late', 'none', 'done']);
  });
});

describe('buildProjectCalendarDays', () => {
  const CAL_LABELS: Pick<GroupLabels, 'today' | 'yesterday' | 'tomorrow'> = LABELS;

  test('задача без дедлайну не має дня — і в календарі її немає', () => {
    const tasks = [task({ id: 'no-deadline' }), task({ id: 'with', deadline: '2026-09-05T00:00:00.000Z' })];
    const days = buildProjectCalendarDays(tasks, [], TODAY, CAL_LABELS, 'uk-UA');
    expect(days).toHaveLength(1);
    expect(days[0].tasks.map(t => t.id)).toEqual(['with']);
  });

  test('день лише з нарадою (без жодної задачі) теж потрапляє в календар', () => {
    const days = buildProjectCalendarDays([], [{ date: '2026-09-10', id: 'm1' }], TODAY, CAL_LABELS, 'uk-UA');
    expect(days).toHaveLength(1);
    expect(days[0].tasks).toEqual([]);
    expect(days[0].meetings.map(m => m.id)).toEqual(['m1']);
  });

  test('той самий день зводить задачу й нараду в одну групу, дні йдуть за зростанням дати', () => {
    const tasks = [
      task({ id: 'late', deadline: '2026-09-20T00:00:00.000Z' }),
      task({ id: 'early', deadline: '2026-09-05T00:00:00.000Z' }),
    ];
    const meetings = [{ date: '2026-09-05', id: 'sync' }];
    const days = buildProjectCalendarDays(tasks, meetings, TODAY, CAL_LABELS, 'uk-UA');
    expect(days.map(d => d.tasks.map(t => t.id).concat(d.meetings.map(m => m.id)))).toEqual([
      ['early', 'sync'],
      ['late'],
    ]);
  });
});

describe('buildProjectListGroups (WORKSPACE_PROJECTS_PLAN.md §3: Список — групування)', () => {
  const GROUP_LABELS: ProjectListGroupLabels = { priorityNone: 'Без пріоритету', sprintBacklog: 'Беклог' };
  const sprint1: Sprint = { id: 's1', projectId: 'p1', name: 'Спринт 1', createdAt: TODAY_ISO } as Sprint;
  const sprint2: Sprint = { id: 's2', projectId: 'p1', name: 'Спринт 2', createdAt: TODAY_ISO } as Sprint;

  test("'none' не групує — порожній масив, екран лишає плаский список", () => {
    const tasks = [task({ id: 't1', projectId: 'p1' })];
    expect(buildProjectListGroups(tasks, 'none', COLUMNS, [], 'p1', GROUP_LABELS)).toEqual([]);
  });

  test("'status': лише КОЛОНКИ, у яких є задача — порожніх серед груп немає", () => {
    const tasks = [
      task({ id: 'a', projectId: 'p1', status: 'active' }),
      task({ id: 'b', projectId: 'p1', status: 'active' }),
      task({ id: 'c', projectId: 'p1', status: 'done' }),
    ];
    const groups = buildProjectListGroups(tasks, 'status', COLUMNS, [], 'p1', GROUP_LABELS);
    expect(groups.map(g => g.key)).toEqual([ACTIVE_COLUMN_ID, DONE_COLUMN_ID]);
    expect(groups.find(g => g.key === ACTIVE_COLUMN_ID)?.tasks.map(t => t.id)).toEqual(['a', 'b']);
    expect(groups.find(g => g.key === DONE_COLUMN_ID)?.tasks.map(t => t.id)).toEqual(['c']);
  });

  test("'priority': P0…P5 за зростанням рівня, «Без пріоритету» останньою, порожні рівні пропущені", () => {
    const tasks = [
      task({ id: 'p5', projectId: 'p1', priorityLevel: 5 }),
      task({ id: 'p0', projectId: 'p1', priorityLevel: 0 }),
      task({ id: 'none', projectId: 'p1' }),
      task({ id: 'p0b', projectId: 'p1', priorityLevel: 0 }),
    ];
    const groups = buildProjectListGroups(tasks, 'priority', COLUMNS, [], 'p1', GROUP_LABELS);
    expect(groups.map(g => g.key)).toEqual(['p0', 'p5', 'none']);
    expect(groups.map(g => g.label)).toEqual(['P0', 'P5', 'Без пріоритету']);
    expect(groups.find(g => g.key === 'p0')?.tasks.map(t => t.id)).toEqual(['p0', 'p0b']);
  });

  test("'sprint': кожен спринт — окрема група (за назвою), беклог — задачі проєкту без спринта", () => {
    const tasks = [
      task({ id: 't1', projectId: 'p1', sprintId: 's1' }),
      task({ id: 't2', projectId: 'p1', sprintId: 's1' }),
      task({ id: 't3', projectId: 'p1' }),
    ];
    // s2 без жодної задачі — порожня група прибирається.
    const groups = buildProjectListGroups(tasks, 'sprint', COLUMNS, [sprint1, sprint2], 'p1', GROUP_LABELS);
    expect(groups.map(g => g.key)).toEqual(['s1', BACKLOG_GROUP_KEY]);
    expect(groups.find(g => g.key === 's1')?.label).toBe('Спринт 1');
    expect(groups.find(g => g.key === BACKLOG_GROUP_KEY)?.label).toBe('Беклог');
    expect(groups.find(g => g.key === BACKLOG_GROUP_KEY)?.tasks.map(t => t.id)).toEqual(['t3']);
  });

  test("'sprint': проєкт без жодної задачі — усі групи (включно з беклогом) прибираються", () => {
    expect(buildProjectListGroups([], 'sprint', COLUMNS, [sprint1], 'p1', GROUP_LABELS)).toEqual([]);
  });
});
