/**
 * utils/projectStatsMetrics.ts — лічильники картки проєкту, портфельні KPI,
 * велосіті й burndown спринтів.
 *
 * Специфікація: flowi-server-app/docs/specs/projects-analytics.md (§5, §6, §9).
 * Канонічне джерело формул — веб `lib/project-metrics.ts`; цей файл — його
 * мобільне ДЗЕРКАЛО з тими самими іменами функцій і полів (projectCounters,
 * currentSprintCard, isSprintOverdue, sprintDays, sprintVelocity,
 * velocityWindow, sprintBurndown, portfolioKpi). Специфікація називає
 * мобільний файл `utils/projectMetrics.ts`; тут він лежить поруч із
 * `projectStats.ts`, бо читає ту саму модель і доповнює ту саму картку.
 *
 * Модуль ЧИСТИЙ: ані React, ані AsyncStorage, ані Intl, ані локалізованих
 * рядків. `now` завжди приходить параметром — дві картки на межі доби мусять
 * рахувати одне «сьогодні» (§9.2 п.5).
 *
 * Усі порівняння дат — у ЛОКАЛЬНИХ календарних добах (§2 п.8), без
 * `toDateString()` і без сирої різниці мілісекунд: перехід на літній час
 * зробив би з доби 23 чи 25 годин.
 */
import { doneByWeek, CHART_WEEKS, type DoneByWeek } from './projectCharts';
import { isSprintClosed, openSprintsForProject, type Sprint } from './sprintUtils';
import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  mergeTaskStatusColumns,
  resolvedStatusType,
  type StatusType,
  type TaskStatusColumn,
} from './taskStatuses';

// ─── Типи входу ──────────────────────────────────────────────────────────────

/**
 * Структурний зріз задачі — як у projectStats/projectCharts: екрани тримають
 * власні інтерфейси задачі, і вимагати повний Task тут означало б касти.
 */
export interface MetricsTaskLike {
  id: string;
  status: string;
  projectId?: string;
  sprintId?: string;
  kanbanColumnId?: string;
  deadline?: string;
  /** `null`, `undefined` і `''` — одне й те саме: «без виконавця» (§2 п.6). */
  assigneeId?: string | null;
  history?: { at: string; type: string }[];
}

export interface MetricsProjectLike {
  id: string;
  archivedAt?: string;
}

// ─── Дати ────────────────────────────────────────────────────────────────────

/** Локальна календарна доба як YYYYMMDD — порівнюється як ціле. */
export function dayNumber(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function parseDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Порядковий номер локальної доби. Через Date.UTC від ЛОКАЛЬНИХ компонентів,
 * а не різницею getTime(): тоді доба завжди рівно 86 400 000 мс, і перехід
 * на літній час не з'їдає й не додає день.
 */
function dayOrdinal(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Скільки локальних діб від `from` до `to` (може бути відʼємним). */
export function dayDiff(to: Date, from: Date): number {
  return dayOrdinal(to) - dayOrdinal(from);
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Коли задачу закрили — ОСТАННЯ подія 'done' журналу, без відкату на
 * updatedAt. Та сама приватна функція, що в projectCharts.doneByWeek: розбіжність
 * дала б на одному екрані два різні «виконано цього тижня».
 */
function doneAt(task: Pick<MetricsTaskLike, 'history'>): Date | null {
  const events = task.history ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type !== 'done') continue;
    const at = parseDate(events[index].at);
    if (at) return at;
  }
  return null;
}

// ─── Тип колонки задачі (§5.1) ───────────────────────────────────────────────

/**
 * Індекс колонок ОДНОГО проєкту для typeOf().
 *
 * columns(P) = власні колонки проєкту, а якщо проєкт їх ще не має —
 * особисті (mergeTaskStatusColumns). Задачі проєкту з вебу чи старих збірок
 * можуть нести ОСОБИСТИЙ id колонки (`status-in-progress`) — тоді беремо тип
 * особистої колонки, або копії з тим самим sourceStatusId.
 */
interface ColumnIndex {
  byId: Map<string, TaskStatusColumn>;
  bySource: Map<string, TaskStatusColumn>;
  personal: Map<string, TaskStatusColumn>;
}

function buildColumnIndex(all: readonly TaskStatusColumn[], projectId: string): ColumnIndex {
  const personalList = mergeTaskStatusColumns([...all]);
  const own = mergeTaskStatusColumns([...all], projectId);
  const scoped = own.length ? own : personalList;
  const byId = new Map(scoped.map(column => [column.id, column]));
  const bySource = new Map<string, TaskStatusColumn>();
  for (const column of scoped) {
    if (column.sourceStatusId && !bySource.has(column.sourceStatusId)) bySource.set(column.sourceStatusId, column);
  }
  return { byId, bySource, personal: new Map(personalList.map(column => [column.id, column])) };
}

/**
 * Етап задачі за КОЛОНКОЮ — правило taskColumnId (колонка береться, лише коли
 * її isDone збігається зі статусом задачі), далі тип колонки resolvedStatusType.
 * Колонку не знайдено — етап за статусом: `done` → done, легасі
 * `in_progress` → in_progress (як у вебі), решта → todo.
 */
function typeOf(task: MetricsTaskLike, index: ColumnIndex): StatusType {
  const isDone = task.status === 'done';
  if (task.kanbanColumnId) {
    const column = index.byId.get(task.kanbanColumnId)
      ?? index.bySource.get(task.kanbanColumnId)
      ?? index.personal.get(task.kanbanColumnId);
    if (column && column.isDone === isDone) return resolvedStatusType(column);
  }
  const fallbackId = isDone ? DONE_COLUMN_ID : task.status === 'in_progress' ? IN_PROGRESS_COLUMN_ID : ACTIVE_COLUMN_ID;
  return resolvedStatusType({ id: fallbackId, isDone });
}

/** Той самий тип для однієї задачі — для тестів і точкових викликів. */
export function taskStageType(
  task: MetricsTaskLike,
  columns: readonly TaskStatusColumn[],
  projectId: string = task.projectId ?? '',
): StatusType {
  return typeOf(task, buildColumnIndex(columns, projectId));
}

// ─── Лічильники картки (§5.2, §5.3) ──────────────────────────────────────────

export interface ProjectCounters {
  /** Воронка: done + inProgress + todo === total. */
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  /** Незавершені — база для всіх ознак нижче. */
  open: number;
  /** Ознаки відкритих задач; перетинаються, крім пари assigned + unassigned === open. */
  assigned: number;
  unassigned: number;
  backlog: number;
  overdue: number;
}

const EMPTY_COUNTERS: ProjectCounters = Object.freeze({
  total: 0, done: 0, inProgress: 0, todo: 0, open: 0, assigned: 0, unassigned: 0, backlog: 0, overdue: 0,
}) as ProjectCounters;

/**
 * Один прохід по задачах (§9.2 п.1): Map<projectId, задачі>. Задачі без
 * проєкту сюди не потрапляють — вони в картку не рахуються (§5.5).
 */
export function groupTasksByProject<T extends MetricsTaskLike>(tasks: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    const bucket = groups.get(task.projectId);
    if (bucket) bucket.push(task);
    else groups.set(task.projectId, [task]);
  }
  return groups;
}

function countersFor(
  projectId: string,
  own: readonly MetricsTaskLike[],
  knownSprints: ReadonlySet<string>,
  columns: ColumnIndex,
  today: number,
): ProjectCounters {
  const result: ProjectCounters = { ...EMPTY_COUNTERS };
  // Один for на групу (§9.2 п.2) замість шести .filter().length.
  for (const task of own) {
    if (task.projectId !== projectId) continue;
    result.total += 1;
    if (task.status === 'done') {
      result.done += 1;
      continue;
    }
    result.open += 1;
    // `done` рахується за СТАТУСОМ, етап — лише серед відкритих: разом це
    // замикає воронку навіть для задачі done у колонці з isDone:false (§5.2).
    if (typeOf(task, columns) === 'in_progress') result.inProgress += 1;
    else result.todo += 1;
    if (typeof task.assigneeId === 'string' && task.assigneeId !== '') result.assigned += 1;
    else result.unassigned += 1;
    // Беклог — правило projectBacklogTasks: без спринту АБО невідомий спринт.
    if (!task.sprintId || !knownSprints.has(task.sprintId)) result.backlog += 1;
    const deadline = parseDate(task.deadline);
    if (deadline && dayNumber(deadline) < today) result.overdue += 1;
  }
  return result;
}

/**
 * Лічильники картки одного проєкту. `tasks` може бути і повним масивом, і вже
 * згрупованою часткою — чужі задачі відсіюються в тому самому проході.
 * `columns` — УСІ збережені колонки (`task_statuses`), як вони лежать у сховищі.
 */
export function projectCounters(
  project: MetricsProjectLike,
  tasks: readonly MetricsTaskLike[],
  sprints: readonly Sprint[],
  columns: readonly TaskStatusColumn[],
  now: Date,
): ProjectCounters {
  return countersFor(
    project.id,
    tasks,
    new Set(sprints.map(sprint => sprint.id)),
    buildColumnIndex(columns, project.id),
    dayNumber(now),
  );
}

/**
 * Лічильники всіх проєктів панелі за O(задач + проєктів): одне групування,
 * один Set спринтів, один прохід по кожній групі (§9.2).
 */
export function projectCountersMap(
  projects: readonly MetricsProjectLike[],
  tasks: readonly MetricsTaskLike[],
  sprints: readonly Sprint[],
  columns: readonly TaskStatusColumn[],
  now: Date,
): Map<string, ProjectCounters> {
  const groups = groupTasksByProject(tasks);
  const known = new Set(sprints.map(sprint => sprint.id));
  const today = dayNumber(now);
  const result = new Map<string, ProjectCounters>();
  for (const project of projects) {
    const own = groups.get(project.id);
    result.set(
      project.id,
      own ? countersFor(project.id, own, known, buildColumnIndex(columns, project.id), today) : { ...EMPTY_COUNTERS },
    );
  }
  return result;
}

// ─── Спринти: дати й прострочення (§4, §5.4) ────────────────────────────────

/** Датований — обидві межі є й парсяться. Половинчастий = недатований (§3.1). */
function sprintBounds(sprint: Pick<Sprint, 'startDate' | 'endDate'>): { start: Date; end: Date } | null {
  const start = parseDate(sprint.startDate);
  const end = parseDate(sprint.endDate);
  if (!start || !end) return null;
  return { start, end };
}

/**
 * Протермінований спринт — endDate минув, а спринт не закрито. Чиста похідна:
 * нічого не пише й нічого не закриває (автозакриття немає, §4).
 */
export function isSprintOverdue(sprint: Sprint, now: Date): boolean {
  const end = parseDate(sprint.endDate);
  return !!end && !isSprintClosed(sprint) && dayNumber(end) < dayNumber(now);
}

/**
 * Тривалість у добах, обидва кінці включно; ≥ 1 для датованого спринта
 * (одноденні з міграції не діляться на нуль). Недатований — 0: у нього
 * тривалості немає, і він не входить ані у велосіті, ані в burndown.
 */
export function sprintDays(sprint: Pick<Sprint, 'startDate' | 'endDate'>): number {
  const bounds = sprintBounds(sprint);
  if (!bounds) return 0;
  return Math.max(1, dayDiff(bounds.end, bounds.start) + 1);
}

export interface SprintCard {
  sprint: Sprint;
  name: string;
  done: number;
  total: number;
  /** 0 із 0 — це 0%, як у projectStats.pct. */
  pct: number;
  /** 0 — останній день; null — дат немає АБО термін уже минув (тоді overdue). */
  daysLeft: number | null;
  overdue: boolean;
  /** Скільки діб тому минув термін; 0, якщо не протерміновано. */
  overdueDays: number;
  dated: boolean;
}

/**
 * Поточний спринт картки — НАЙСТАРІШИЙ відкритий (openSprintsForProject[0]),
 * те саме правило, що в utils/projectOverview.ts currentSprint (§5.4).
 */
export function currentSprintCard(
  project: MetricsProjectLike,
  sprints: readonly Sprint[],
  tasks: readonly MetricsTaskLike[],
  now: Date,
): SprintCard | null {
  const sprint = openSprintsForProject(sprints, project.id)[0];
  if (!sprint) return null;
  let total = 0;
  let done = 0;
  for (const task of tasks) {
    if (task.sprintId !== sprint.id) continue;
    total += 1;
    if (task.status === 'done') done += 1;
  }
  const end = parseDate(sprint.endDate);
  const dated = sprintBounds(sprint) !== null;
  const overdue = isSprintOverdue(sprint, now);
  const diff = end ? dayDiff(end, now) : null;
  return {
    sprint,
    name: sprint.name,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    daysLeft: dated && diff !== null && diff >= 0 ? diff : null,
    overdue,
    overdueDays: overdue && diff !== null ? -diff : 0,
    dated,
  };
}

// ─── Велосіті (§6.1) ─────────────────────────────────────────────────────────

export const VELOCITY_WINDOW = 3;
export const VELOCITY_MIN_SPRINTS = 2;

/** Завершений для велосіті — закритий І датований обома межами. */
export function isCompletedSprint(sprint: Sprint): boolean {
  return isSprintClosed(sprint) && sprintBounds(sprint) !== null;
}

/**
 * Велосіті спринта — його задачі в статусі done. Рівно sprintProgress().done,
 * число з рядка спринта; НЕ через журнал (§6.1).
 */
export function sprintVelocity(sprint: Pick<Sprint, 'id'>, tasks: readonly MetricsTaskLike[]): number {
  let done = 0;
  for (const task of tasks) if (task.sprintId === sprint.id && task.status === 'done') done += 1;
  return done;
}

export interface VelocityRow {
  sprint: Sprint;
  velocity: number;
  days: number;
  /** Задач на тиждень: velocity * 7 / days. Не округлене. */
  weeklyVelocity: number;
}

export interface VelocityWindow {
  /** Вікно — останні N завершених датованих, у ХРОНОЛОГІЧНОМУ порядку (старший зверху). */
  rows: VelocityRow[];
  /** Скільки спринтів у вибірці — показується поруч із прогнозом завжди. */
  sampleSize: number;
  avgVelocity: number;
  avgWeeklyVelocity: number;
  /** Закриті без дат — у велосіті не враховані, показуються окремим числом. */
  undatedClosed: number;
  remainingWork: number;
  /** null — замало даних (< minSprints) або середня тижнева 0. */
  forecastWeeks: number | null;
}

export interface VelocityOptions {
  /** Обмежити спринти (і відкриті задачі для прогнозу) одним проєктом. */
  projectId?: string;
  window?: number;
  minSprints?: number;
  /** Явний обсяг роботи; без нього — відкриті задачі проєкту з `tasks`. */
  remainingWork?: number;
}

function endTime(sprint: Sprint): number {
  const at = parseDate(sprint.endDate);
  return at ? at.getTime() : Number.NEGATIVE_INFINITY;
}

function closedTime(sprint: Sprint): number {
  const at = parseDate(sprint.closedAt);
  return at ? at.getTime() : Number.NEGATIVE_INFINITY;
}

export function velocityWindow(
  sprints: readonly Sprint[],
  tasks: readonly MetricsTaskLike[],
  options: VelocityOptions = {},
): VelocityWindow {
  const size = Math.max(1, Math.floor(options.window ?? VELOCITY_WINDOW));
  const minSprints = Math.max(1, Math.floor(options.minSprints ?? VELOCITY_MIN_SPRINTS));
  const scoped = options.projectId
    ? sprints.filter(sprint => sprint.projectId === options.projectId)
    : [...sprints];

  let undatedClosed = 0;
  const completed: Sprint[] = [];
  for (const sprint of scoped) {
    if (!isSprintClosed(sprint)) continue;
    if (sprintBounds(sprint)) completed.push(sprint);
    else undatedClosed += 1;
  }
  // endDate ↓, далі closedAt ↓, далі id ↑ — стабільно на однакових датах.
  completed.sort((left, right) =>
    endTime(right) - endTime(left)
    || closedTime(right) - closedTime(left)
    || left.id.localeCompare(right.id));

  const picked = completed.slice(0, size);
  const wanted = new Set(picked.map(sprint => sprint.id));
  const doneBySprint = new Map<string, number>();
  let openInProject = 0;
  for (const task of tasks) {
    if (task.sprintId && wanted.has(task.sprintId) && task.status === 'done') {
      doneBySprint.set(task.sprintId, (doneBySprint.get(task.sprintId) ?? 0) + 1);
    }
    if (options.projectId && task.projectId === options.projectId && task.status !== 'done') openInProject += 1;
  }

  const rows: VelocityRow[] = picked.map(sprint => {
    const days = sprintDays(sprint);
    const velocity = doneBySprint.get(sprint.id) ?? 0;
    return { sprint, velocity, days, weeklyVelocity: (velocity * 7) / days };
  }).reverse();

  const sampleSize = rows.length;
  const avgVelocity = sampleSize ? rows.reduce((acc, row) => acc + row.velocity, 0) / sampleSize : 0;
  const avgWeeklyVelocity = sampleSize ? rows.reduce((acc, row) => acc + row.weeklyVelocity, 0) / sampleSize : 0;
  const remainingWork = options.remainingWork ?? openInProject;
  const forecastWeeks = sampleSize >= minSprints && avgWeeklyVelocity > 0
    ? Math.ceil(remainingWork / avgWeeklyVelocity)
    : null;

  return { rows, sampleSize, avgVelocity, avgWeeklyVelocity, undatedClosed, remainingWork, forecastWeeks };
}

// ─── Burndown (§6.2) ─────────────────────────────────────────────────────────

export interface Burndown {
  /** Кількість діб D (≥ 1). Точок у рядах — D + 1. */
  days: number;
  /** Локальні доби спринта YYYY-MM-DD, довжина D (підписи осі). */
  dayKeys: string[];
  /** Поточний обсяг спринта. */
  scope: number;
  /** ideal[0] = scope … ideal[D] = 0. */
  ideal: number[];
  /** actual[i] — лишилось на кінець доби i; null після todayIndex (майбутнє). */
  actual: (number | null)[];
  /** Остання точка з фактом (0…D). */
  todayIndex: number;
  /** done без події 'done' у журналі — у лінію не потрапили. */
  undated: number;
  /** Закриті ще ДО startDate — зараховані в точку 1. */
  carriedIn: number;
  /** undated > scope/2: графік не малюється, лише пояснення (§6.2 п.3). */
  insufficient: boolean;
}

/**
 * Burndown датованого спринта; недатований — null. Один прохід по задачах
 * спринта з накопиченням у D кошиків, без вкладеного циклу по днях (§9.2 п.6).
 */
export function sprintBurndown(
  sprint: Sprint,
  tasks: readonly MetricsTaskLike[],
  now: Date,
): Burndown | null {
  const bounds = sprintBounds(sprint);
  if (!bounds) return null;
  const days = sprintDays(sprint);
  const bins = new Array<number>(days).fill(0);
  let scope = 0;
  let undated = 0;
  let carriedIn = 0;

  for (const task of tasks) {
    if (task.sprintId !== sprint.id) continue;
    scope += 1;
    if (task.status !== 'done') continue;
    const at = doneAt(task);
    if (!at) {
      undated += 1;
      continue;
    }
    const offset = dayDiff(at, bounds.start);
    if (offset < 0) {
      carriedIn += 1;
      bins[0] += 1;
    } else if (offset < days) {
      bins[offset] += 1;
    }
    // Закрито ПІСЛЯ endDate — у жодну точку вікна не потрапляє.
  }

  const ideal: number[] = [];
  for (let index = 0; index <= days; index += 1) ideal.push(scope * (1 - index / days));
  ideal[days] = 0;

  const todayIndex = Math.min(days, Math.max(0, dayDiff(now, bounds.start) + 1));
  const actual: (number | null)[] = [scope];
  let doneSoFar = 0;
  for (let index = 1; index <= days; index += 1) {
    doneSoFar += bins[index - 1];
    actual.push(index <= todayIndex ? scope - doneSoFar : null);
  }

  const dayKeys: string[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate() + index);
    dayKeys.push(dayKey(day));
  }

  return {
    days, dayKeys, scope, ideal, actual, todayIndex, undated, carriedIn,
    insufficient: undated > scope / 2,
  };
}

// ─── Портфель (§6.3, §8.3) ───────────────────────────────────────────────────

export interface PortfolioKpi {
  projects: number;
  total: number;
  done: number;
  /** Частка виконаних; 0 для порожнього портфеля. */
  pct: number;
  inProgress: number;
  overdue: number;
  unassigned: number;
  /** Наявний doneByWeek по видимих проєктах, CHART_WEEKS тижнів. */
  weekly: DoneByWeek;
  /** weekly.total / CHART_WEEKS — «в середньому за календарними тижнями». */
  avgWeekly: number;
}

/**
 * KPI по ВИДИМОМУ набору проєктів — тому самому, що в списку (§8.3). Лічильники
 * — сума projectCounters, тож число на плитці збігається з сумою карток.
 */
export function portfolioKpi(
  projects: readonly MetricsProjectLike[],
  tasks: readonly MetricsTaskLike[],
  sprints: readonly Sprint[],
  columns: readonly TaskStatusColumn[],
  now: Date,
  counters: Map<string, ProjectCounters> = projectCountersMap(projects, tasks, sprints, columns, now),
): PortfolioKpi {
  let total = 0;
  let done = 0;
  let inProgress = 0;
  let overdue = 0;
  let unassigned = 0;
  const ids = new Set<string>();
  for (const project of projects) {
    ids.add(project.id);
    const own = counters.get(project.id);
    if (!own) continue;
    total += own.total;
    done += own.done;
    inProgress += own.inProgress;
    overdue += own.overdue;
    unassigned += own.unassigned;
  }
  const visibleTasks = tasks.filter(task => task.projectId !== undefined && ids.has(task.projectId));
  const weekly = doneByWeek(
    visibleTasks.map(task => ({ id: task.id, title: '', status: task.status, history: task.history })),
    CHART_WEEKS,
    now,
  );
  return {
    projects: projects.length,
    total,
    done,
    pct: total ? Math.round((done / total) * 100) : 0,
    inProgress,
    overdue,
    unassigned,
    weekly,
    avgWeekly: weekly.total / CHART_WEEKS,
  };
}
