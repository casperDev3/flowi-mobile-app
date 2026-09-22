/**
 * utils/taskListView.ts — що саме показує список завдань за даних фільтрів.
 *
 * Раніше весь конвеєр (сортування → місяць → фільтри → денний скоуп →
 * прострочене → групи) жив у useMemo екрана завдань. Тепер той самий набір
 * мусить відтворити й екран «Всі (N)» (app/task-group.tsx), який відкриває
 * ПОВНИЙ список однієї групи. Друга копія правил розійшлася б із першою на
 * першій же правці — і «Всі (18)» відкривав би 17 чи 19 завдань. Тому правила
 * тут, а обидва екрани лише викликають їх.
 *
 * Тут же ліміт групи (15) і перетворення фільтрів у параметри маршруту й
 * назад: екран групи перечитує завдання зі сховища сам, а не бере знімок.
 */
import { taskVisibleInList, type TaskStatusColumn } from './taskStatuses';
import { buildStatusListSections, type TaskListScope } from './taskListSections';
import { inTaskScope, isTodayTask } from './taskToday';
import {
  comparePriority,
  filterTasksByMonth,
  isMyTask,
  isOverdue,
  isPriorityLevel,
  matchesPriorityFilter,
  normalizePriority,
  priorityLabel,
  taskMatchesSearch,
  PRIORITY_LEVELS,
  type Filter,
  type PriorityLevel,
  type SortBy,
  type Task,
} from './taskUtils';
import { projectTaskGroups, sprintsForProject, BACKLOG_GROUP_KEY, type Sprint, type SprintTaskLike } from './sprintUtils';

/** Скільки завдань показує група до кнопки «Всі (N)». */
export const TASK_GROUP_LIMIT = 15;
/** Ключ секції «Прострочені» — її будує шапка списку, а не групування. */
export const OVERDUE_GROUP_KEY = '__overdue__';
export const NO_DEADLINE_GROUP_KEY = '__no_deadline__';

/** Усе, що звужує список на екрані завдань. */
export interface TaskListQuery {
  filter: Filter;
  sort: SortBy;
  scope: TaskListScope;
  search: string;
  projectId: string | null;
  priorities: PriorityLevel[];
  /** Day.toDateString() обраного дня календаря-фільтра (як на екрані). */
  dateFilter: string | null;
  /** Перше число активного місяця. */
  month: Date;
  /**
   * §3.7 «моє» (contract) — `user.id` з `useAuth()`. `undefined`, доки
   * викликач не знає користувача (тести, ранній рендер до `useAuth()`): тоді
   * фільтр пропускає все, як і до цього поля — той самий бай-пас, що й у
   * `groupTodayTasks` (`utils/todayGroups.ts`), яка вже застосовує це
   * правило на екрані «Сьогодні». У соло-фазі це й так завжди `true` — див.
   * `isMyTask`.
   */
  myUserId?: string | null;
  /** Ролі в проєктах — див. isMyTask. */
  projectRoles?: Readonly<Record<string, string>>;
  /**
   * Лише в режимі «Всі»: true — показати мої активні БЕЗ дедлайну, інакше
   * (за замовчуванням) — лише з дедлайном. Див. inTaskScope.
   */
  noDeadline?: boolean;
}

export interface TaskListGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

export interface GroupLabels {
  today: string;
  yesterday: string;
  tomorrow: string;
  withoutDeadline: string;
  overdue: string;
}

/** Мінімум полів, потрібних конвеєру. */
export type ListViewTask = Pick<
  Task,
  'id' | 'title' | 'description' | 'status' | 'kanbanColumnId' | 'createdAt' | 'deadline'
  | 'projectId' | 'priority' | 'priorityLevel' | 'history' | 'updatedAt' | 'subtasks'
  | 'assigneeId' | 'createdBy'
>;

/**
 * `today` приходить параметром, а не з модульної константи: та фіксувалась у
 * момент імпорту, і в застосунку, не закритому через північ, вчорашній день
 * ще підписувався «Сьогодні». Джерело свіжого значення — useToday().
 */
export function groupLabel(date: Date, today: Date, labels: Pick<GroupLabels, 'today' | 'yesterday' | 'tomorrow'>, locale: string): string {
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return labels.today;
  if (date.toDateString() === yesterday.toDateString()) return labels.yesterday;
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return labels.tomorrow;
  if (diff > 1 && diff <= 7) return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

export function sortTasksForList<T extends ListViewTask>(tasks: readonly T[], sort: SortBy): T[] {
  return [...tasks].sort((a, b) => {
    switch (sort) {
      case 'deadline': {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      // Усередині статусної групи порядок задає пріоритет: сам статус уже
      // винесений у заголовок групи.
      case 'status':
      case 'priority': return comparePriority(a, b); // P0→P5, без пріоритету — в кінці
      case 'newest':   return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':   return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name':     return a.title.localeCompare(b.title, 'uk');
      default:         return 0;
    }
  });
}

/**
 * Набір без урахування денного скоупу — тобто те, що людина побачила б,
 * перемкнувши тумблер на «Усі». Вхід уже відсортований.
 */
export function filterTasksForList<T extends ListViewTask>(sorted: readonly T[], q: TaskListQuery): T[] {
  return filterTasksByMonth(sorted, q.month).filter(t => {
    // §3.7 «Особисте агрегує»: «Сьогодні» і «Завдання» показують МОЄ з усіх
    // проєктів, а не все, до чого клієнт має доступ (мінор із ревʼю —
    // «Завдання», на відміну від «Сьогодні», цього правила не застосовували).
    // Немає значення нема — той самий бай-пас, що й у `groupTodayTasks`.
    if (q.myUserId !== undefined && !isMyTask(t, q.myUserId, q.projectRoles)) return false;
    // Правило видимості — в утиліті: у режимі групування за статусом
    // завершені лишаються, щоб група «Готово» взагалі мала з чого зʼявитись.
    if (!taskVisibleInList(t, q.filter, q.sort)) return false;
    if (q.dateFilter) {
      const d = new Date(t.createdAt);
      if (d.toDateString() !== q.dateFilter) return false;
    }
    if (!taskMatchesSearch(t, q.search)) return false;
    if (q.projectId && t.projectId !== q.projectId) return false;
    if (!matchesPriorityFilter(t, q.priorities)) return false;
    return true;
  });
}

/** Денний скоуп поверх filterTasksForList. */
export function applyTaskScope<T extends ListViewTask>(
  filteredAll: readonly T[],
  q: Pick<TaskListQuery, 'scope' | 'filter' | 'sort' | 'noDeadline'>,
  columns: TaskStatusColumn[],
  today: Date,
  now: Date = new Date(),
): T[] {
  return filteredAll.filter(t => {
    // У денному режимі «Готово» — це закрите СЬОГОДНІ, а не за вікном у два
    // дні: вчорашня закрита справа серед сьогоднішніх вдає незавершену роботу.
    if (q.scope === 'today' && !taskVisibleInList(t, q.filter, q.sort, now, 'today')) return false;
    // Скоуп відсіює тут, а не в побудові секцій, і для ВСІХ сортувань
    // однаково — інакше порожній режим лишався б без порожнього стану.
    if (q.scope === 'today') return isTodayTask(t, columns, today);
    return inTaskScope(t, columns, q.scope, { noDeadline: q.noDeadline }, today);
  });
}

/** Скільки завдань у кожному режимі перемикача — лічильники на кнопках. */
export function taskScopeCounts<T extends ListViewTask>(
  filteredAll: readonly T[],
  q: Pick<TaskListQuery, 'filter' | 'sort'>,
  columns: TaskStatusColumn[],
  today: Date,
  now: Date = new Date(),
): { today: number; week: number; all: number; noDeadline: number } {
  // Лише НЕзавершене — як лічильники вебу (activeScopeVisible у
  // app/app/tasks/page.tsx): свіжо закриті домішуються в список заради групи
  // «Готово», але роботою на кнопці перемикача не є.
  const active = filteredAll.filter(t => t.status !== 'done');
  const count = (scope: TaskListScope, noDeadline = false) =>
    applyTaskScope(active, { ...q, scope, noDeadline }, columns, today, now).length;
  return { today: count('today'), week: count('week'), all: count('all'), noDeadline: count('all', true) };
}

/** Прострочене окремою секцією — лише у списку і не для фільтра «Виконані». */
export function overdueForList<T extends ListViewTask>(filtered: readonly T[], filter: Filter, listMode: boolean): T[] {
  return filter !== 'done' && listMode ? filtered.filter(t => isOverdue(t)) : [];
}

export function buildTaskGroups<T extends ListViewTask>(
  groupsSource: readonly T[],
  q: Pick<TaskListQuery, 'sort' | 'scope'>,
  columns: TaskStatusColumn[],
  today: Date,
  labels: GroupLabels,
  locale: string,
): TaskListGroup<T>[] {
  // Статусні групи — це погляд на СЬОГОДНІ: правило, кого туди пускати,
  // живе в утиліті поруч із правилом екрана дня, щоб копії не розходились.
  if (q.sort === 'status') {
    return buildStatusListSections(groupsSource, columns, today, q.scope, true)
      .map(section => ({ key: section.key, label: section.label, tasks: section.tasks }));
  }
  const map: Record<string, { label: string; tasks: T[] }> = {};
  const order: string[] = [];
  groupsSource.forEach(t => {
    let key: string;
    let label: string;
    if (q.sort === 'deadline' && !t.deadline) {
      key = NO_DEADLINE_GROUP_KEY;
      label = labels.withoutDeadline;
    } else {
      const d = new Date(q.sort === 'deadline' ? t.deadline! : t.createdAt);
      key = d.toDateString();
      label = groupLabel(d, today, labels, locale);
    }
    if (!map[key]) { map[key] = { label, tasks: [] }; order.push(key); }
    map[key].tasks.push(t);
  });
  const noDeadlineIdx = order.indexOf(NO_DEADLINE_GROUP_KEY);
  if (noDeadlineIdx > 0) {
    order.splice(noDeadlineIdx, 1);
    order.push(NO_DEADLINE_GROUP_KEY);
  }
  return order.map(k => ({ key: k, ...map[k] }));
}

/** Один день календаря розділу «Завдання» проєкту: задачі з дедлайном + наради того дня. */
export interface ProjectCalendarDay<T, M> {
  key: string;
  label: string;
  tasks: T[];
  meetings: M[];
}

/**
 * Календар розділу «Завдання» проєкту (WORKSPACE_PROJECTS_PLAN.md §3:
 * «Календар — задачі за дедлайном + наради проєкту за датою, вигляд місяця»).
 *
 * На відміну від buildTaskGroups тут НЕМАЄ групи «Без дедлайну» — це
 * календар днів, а в задачі без дедлайну дня немає (вона й так лишається
 * видимою у Списку). Наради приходять УЖЕ розгорнутими по повторах
 * (`expandMeetings`) і відфільтрованими за проєктом — це знає екран, а не ця
 * утиліта, аби чиста функція тут не тягла за собою тип Meeting.
 */
export function buildProjectCalendarDays<T extends ListViewTask, M extends { date: string }>(
  tasksInMonth: readonly T[],
  meetingsInMonth: readonly M[],
  today: Date,
  labels: Pick<GroupLabels, 'today' | 'yesterday' | 'tomorrow'>,
  locale: string,
): ProjectCalendarDay<T, M>[] {
  const days = new Map<string, { date: Date; tasks: T[]; meetings: M[] }>();
  const ensure = (date: Date) => {
    const key = date.toDateString();
    let entry = days.get(key);
    if (!entry) { entry = { date, tasks: [], meetings: [] }; days.set(key, entry); }
    return entry;
  };
  tasksInMonth.forEach(t => {
    if (!t.deadline) return;
    const date = new Date(t.deadline);
    if (Number.isNaN(date.getTime())) return;
    ensure(date).tasks.push(t);
  });
  meetingsInMonth.forEach(m => {
    // 'YYYY-MM-DD' + локальна північ — як в усіх утилітах нарад.
    const date = new Date(`${m.date}T00:00`);
    if (Number.isNaN(date.getTime())) return;
    ensure(date).meetings.push(m);
  });
  return [...days.values()]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(entry => ({
      key: entry.date.toDateString(),
      label: groupLabel(entry.date, today, labels, locale),
      tasks: entry.tasks,
      meetings: entry.meetings,
    }));
}

export interface TaskListView<T> {
  filteredAll: T[];
  filtered: T[];
  overdue: T[];
  groups: TaskListGroup<T>[];
}

/** Увесь конвеєр одним викликом — те саме, що будує екран завдань. */
export function buildTaskListView<T extends ListViewTask>(
  tasks: readonly T[],
  q: TaskListQuery,
  columns: TaskStatusColumn[],
  today: Date,
  labels: GroupLabels,
  locale: string,
  listMode = true,
  now: Date = new Date(),
): TaskListView<T> {
  const filteredAll = filterTasksForList(sortTasksForList(tasks, q.sort), q);
  const filtered = applyTaskScope(filteredAll, q, columns, today, now);
  const overdue = overdueForList(filtered, q.filter, listMode);
  const groupsSource = overdue.length > 0 ? filtered.filter(t => !isOverdue(t)) : filtered;
  const groups = buildTaskGroups(groupsSource, q, columns, today, labels, locale);
  return { filteredAll, filtered, overdue, groups };
}

/** Одна група списку (або «Прострочені») за ключем; null — групи вже немає. */
export function findTaskListGroup<T>(view: Pick<TaskListView<T>, 'overdue' | 'groups'>, key: string, labels: Pick<GroupLabels, 'overdue'>): TaskListGroup<T> | null {
  if (key === OVERDUE_GROUP_KEY) {
    return view.overdue.length > 0 ? { key, label: labels.overdue, tasks: view.overdue } : null;
  }
  return view.groups.find(group => group.key === key) ?? null;
}

/** Перші `limit` завдань групи і скільки всього — для кнопки «Всі (N)». */
export function limitGroupTasks<T>(tasks: readonly T[], limit: number = TASK_GROUP_LIMIT): { visible: T[]; total: number; hasMore: boolean } {
  const hasMore = tasks.length > limit;
  return { visible: hasMore ? tasks.slice(0, limit) : [...tasks], total: tasks.length, hasMore };
}

// ─── Параметри маршруту ──────────────────────────────────────────────────────

const FILTERS: readonly Filter[] = ['all', 'active', 'done'];
const SORTS: readonly SortBy[] = ['status', 'priority', 'newest', 'oldest', 'name', 'deadline'];

export type TaskListRouteParams = Record<string, string>;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function taskListQueryToParams(q: TaskListQuery): TaskListRouteParams {
  const params: TaskListRouteParams = {
    filter: q.filter,
    sort: q.sort,
    scope: q.scope,
    month: monthKey(q.month),
  };
  if (q.search.trim()) params.search = q.search;
  if (q.projectId) params.project = q.projectId;
  if (q.priorities.length) params.priorities = q.priorities.join(',');
  if (q.dateFilter) params.date = q.dateFilter;
  if (q.scope === 'all' && q.noDeadline) params.noDeadline = '1';
  return params;
}

/** Некоректні значення падають у типові екрана: зламаний лінк не має валити екран. */
export function taskListQueryFromParams(params: Partial<Record<string, string | string[]>>, fallbackMonth: Date = new Date()): TaskListQuery {
  const one = (key: string): string => {
    const v = params[key];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const filter = FILTERS.find(f => f === one('filter')) ?? 'active';
  const sort = SORTS.find(s => s === one('sort')) ?? 'status';
  const rawScope = one('scope');
  const scope: TaskListScope = rawScope === 'all' || rawScope === 'week' ? rawScope : 'today';
  const m = /^(\d{4})-(\d{2})$/.exec(one('month'));
  const month = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, 1)
    : new Date(fallbackMonth.getFullYear(), fallbackMonth.getMonth(), 1);
  const priorities = one('priorities')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(isPriorityLevel);
  return {
    filter,
    sort,
    scope,
    month,
    search: one('search'),
    projectId: one('project') || null,
    priorities,
    dateFilter: one('date') || null,
    noDeadline: scope === 'all' && one('noDeadline') === '1',
  };
}

// ─── Групи в деталі проєкту ──────────────────────────────────────────────────

/**
 * Задачі деталі проєкту: власні задачі проєкту ПЛЮС ті, що лежать у його
 * спринтах, навіть якщо їхній projectId указує на інший проєкт (див. коментар
 * у app/projects.tsx). Порядок: незавершені зверху, далі за дедлайном.
 */
export function projectDetailTasks<T extends SprintTaskLike & { deadline?: string }>(
  tasks: readonly T[],
  sprints: readonly Sprint[],
  projectId: string,
): T[] {
  const ownSprintIds = new Set(sprintsForProject(sprints, projectId).map(sprint => sprint.id));
  return tasks
    .filter(t => t.projectId === projectId || (!!t.sprintId && ownSprintIds.has(t.sprintId)))
    .sort((a, b) => {
      const aDone = a.status === 'done';
      const bDone = b.status === 'done';
      if (aDone !== bDone) return aDone ? 1 : -1;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return 0;
    });
}

/** Задачі однієї групи проєкту: id спринта або BACKLOG_GROUP_KEY. */
export function projectGroupTasks<T extends SprintTaskLike & { deadline?: string }>(
  tasks: readonly T[],
  sprints: readonly Sprint[],
  projectId: string,
  groupKey: string,
): { sprint: Sprint | null; tasks: T[] } | null {
  const groups = projectTaskGroups(projectDetailTasks(tasks, sprints, projectId), sprints, projectId);
  const group = groups.find(g => (g.sprint?.id ?? BACKLOG_GROUP_KEY) === groupKey);
  return group ? { sprint: group.sprint, tasks: group.tasks } : null;
}

/** Групування Списку розділу «Завдання» проєкту (WORKSPACE_PROJECTS_PLAN.md §3). */
export type ProjectListGroupBy = 'none' | 'status' | 'priority' | 'sprint';

export interface ProjectListGroupLabels {
  priorityNone: string;
  sprintBacklog: string;
}

/**
 * `buildTaskGroups` вище рахує групи екрана «Завдання» — денний скоуп,
 * секції «сьогодні/учора/завтра». Список проєкту такого режиму не має:
 * тут завжди повний беклог проєкту, тож для «за статусом» скоуп ЗАВЖДИ
 * 'all' (buildStatusListSections уже сама виключає порожні колонки).
 *
 * «за пріоритетом» і «за спринтом» — нові розрізи, яких у buildTaskGroups
 * немає взагалі (там лише «за дедлайном/датою створення», бо це вже задає
 * сортування SortBy). Порожні групи прибираються скрізь однаково — порожня
 * секція «P5» чи закритий спринт без задач лише плутають список.
 */
export function buildProjectListGroups<T extends ListViewTask & SprintTaskLike>(
  tasks: readonly T[],
  groupBy: ProjectListGroupBy,
  columns: TaskStatusColumn[],
  sprints: readonly Sprint[],
  projectId: string,
  labels: ProjectListGroupLabels,
): TaskListGroup<T>[] {
  if (groupBy === 'none') return [];

  if (groupBy === 'status') {
    return buildStatusListSections(tasks, columns, new Date(), 'all')
      .map(section => ({ key: section.key, label: section.label, tasks: section.tasks }));
  }

  if (groupBy === 'priority') {
    const buckets = new Map<PriorityLevel | 'none', T[]>();
    tasks.forEach(t => {
      const level = normalizePriority(t) ?? 'none';
      const bucket = buckets.get(level);
      if (bucket) bucket.push(t); else buckets.set(level, [t]);
    });
    const groups: TaskListGroup<T>[] = PRIORITY_LEVELS
      .filter(level => buckets.has(level))
      .map(level => ({ key: `p${level}`, label: priorityLabel(level), tasks: buckets.get(level)! }));
    const none = buckets.get('none');
    if (none?.length) groups.push({ key: 'none', label: labels.priorityNone, tasks: none });
    return groups;
  }

  // 'sprint' — та сама розкладка, що й на екрані «Всі (N)» (mode=project),
  // лише без обмеження TASK_GROUP_LIMIT: список проєкту вже й так короткий.
  return projectTaskGroups(tasks, sprints, projectId)
    .map(g => ({ key: g.sprint?.id ?? BACKLOG_GROUP_KEY, label: g.sprint?.name ?? labels.sprintBacklog, tasks: g.tasks }))
    .filter(g => g.tasks.length > 0);
}
