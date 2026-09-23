/**
 * utils/projectStats.ts — метрики проєкту.
 *
 * ДЗЕРКАЛО веб-логіки (flowi-web-app/lib/project-stats.ts), а не друга
 * реалізація. Правило, скопійоване в два клієнти, у цьому проєкті вже тричі
 * мовчки розходилося з оригіналом — тому формули тут навмисно повторюють
 * веб дослівно, включно з дрібницями на кшталт «0 із 0 — це 0%, а не 100%».
 *
 * Мобільне доповнення одне: відпрацьований час. Веб його не показує, бо сесії
 * живуть у task.timeEntries і в реєстрі активних таймерів — сутностях, якими
 * керує саме мобільний.
 */

export interface ProjectLike {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /** Момент архівації. Явний стан, а не похідний із задач. */
  archivedAt?: string;
  /**
   * Власний термін проєкту.
   *
   * Це НЕ найближчий дедлайн його задач: здати сайт треба першого жовтня,
   * навіть якщо жодна задача дати не має. Тому поля два, а не одне.
   */
  deadline?: string;
  description?: string;
  /** Штамп сховища (synced-storage stampUpdatedAt) — для «Оновлено». */
  updatedAt?: string;
}

export interface ProjectTaskLike {
  id: string;
  projectId?: string;
  status: string;
  deadline?: string;
  createdAt?: string;
  updatedAt?: string;
  timeEntries?: { startedAt: string; endedAt?: string; duration: number }[];
}

/** Активна сесія з реєстру таймерів — рівно те, що потрібно для «зараз». */
export interface ActiveSessionLike {
  taskId?: string;
  startedAt: string;
}

export interface ProjectStats {
  project: ProjectLike;
  total: number;
  done: number;
  active: number;
  /** Незавершені задачі, дедлайн яких уже минув. */
  overdue: number;
  /** Відсоток виконаних. Для порожнього проєкту — 0, а не 100. */
  pct: number;
  /** Найближчий дедлайн серед НЕЗАВЕРШЕНИХ задач; null, якщо таких немає. */
  nearestDeadline: string | null;
  /**
   * Той самий дедлайн, але лише якщо він ПОПЕРЕДУ. Картка анонсує саме його:
   * «найближчий 8 днів тому» і звучить дивно, і дублює лічильник прострочених.
   */
  upcomingDeadline: string | null;
  /** Власний термін проєкту минув, а роботу не завершено. */
  projectOverdue: boolean;
  archived: boolean;
  empty: boolean;
  /** Секунди: завершені сесії задач проєкту плюс та, що триває просто зараз. */
  trackedSeconds: number;
  /**
   * Остання активність — max(project.updatedAt, updatedAt його задач), ISO.
   * Рахується в тому самому проході по задачах, що й лічильники вище; без
   * жодної позначки часу — createdAt. Сортування «Оновлено» дивиться сюди.
   */
  lastActivityAt: string | null;
}

/** Найпізніший із моментів; нерозбірливі рядки пропускаються. */
function laterIso(current: { iso: string; at: number } | null, iso: string | undefined) {
  if (!iso) return current;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return current;
  return !current || at > current.at ? { iso, at } : current;
}

export function isArchived(project: Pick<ProjectLike, 'archivedAt'>): boolean {
  return Boolean(project.archivedAt);
}

/** Локальна календарна доба як YYYYMMDD — порівнюється як ціле. */
function dayNumber(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function deadlineTime(task: Pick<ProjectTaskLike, 'deadline'>): number | null {
  if (!task.deadline) return null;
  const parsed = new Date(task.deadline);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

/** Завершені сесії задачі. Незавершені тривалості не мають — див. taskTimer. */
function completedSeconds(task: ProjectTaskLike): number {
  return (task.timeEntries ?? []).reduce(
    (acc, entry) => acc + (entry.endedAt ? entry.duration : 0),
    0,
  );
}

export function projectStats(
  project: ProjectLike,
  tasks: ProjectTaskLike[],
  now: Date = new Date(),
  activeSessions: ActiveSessionLike[] = [],
): ProjectStats {
  const own = tasks.filter(task => task.projectId === project.id);
  const done = own.filter(task => task.status === 'done').length;
  const today = dayNumber(now);

  let overdue = 0;
  let nearest: { iso: string; at: number } | null = null;
  let activity = laterIso(null, project.updatedAt ?? project.createdAt);
  for (const task of own) {
    activity = laterIso(activity, task.updatedAt ?? task.createdAt);
    if (task.status === 'done') continue;
    const at = deadlineTime(task);
    if (at === null) continue;
    if (dayNumber(new Date(at)) < today) overdue += 1;
    if (!nearest || at < nearest.at) nearest = { iso: task.deadline as string, at };
  }

  // Час рахуємо лише по задачах ЦЬОГО проєкту. Вільний таймер (без taskId)
  // ні до якого проєкту не належить — приписувати його було б вигадкою.
  const ownIds = new Set(own.map(task => task.id));
  let trackedSeconds = own.reduce((acc, task) => acc + completedSeconds(task), 0);
  for (const session of activeSessions) {
    if (!session.taskId || !ownIds.has(session.taskId)) continue;
    const startedAt = new Date(session.startedAt).getTime();
    if (Number.isNaN(startedAt)) continue;
    // Ніколи не відʼємне: годинник пристрою міг зʼїхати назад.
    trackedSeconds += Math.max(0, Math.floor((now.getTime() - startedAt) / 1000));
  }

  const ownDeadlineAt = deadlineTime(project);

  return {
    project,
    total: own.length,
    done,
    active: own.length - done,
    overdue,
    // 0 із 0 — це не «все зроблено», а «нічого немає».
    pct: own.length ? Math.round((done / own.length) * 100) : 0,
    nearestDeadline: nearest?.iso ?? null,
    upcomingDeadline:
      nearest && dayNumber(new Date(nearest.at)) >= today ? nearest.iso : null,
    // Проєкт, у якому все закрито, простроченим не вважаємо, навіть якщо
    // термін минув: робота зроблена, і червона позначка тут була б докором ні за що.
    projectOverdue:
      ownDeadlineAt !== null
      && dayNumber(new Date(ownDeadlineAt)) < today
      && own.length > done,
    archived: isArchived(project),
    empty: own.length === 0,
    trackedSeconds,
    lastActivityAt: activity?.iso ?? null,
  };
}

/**
 * Порядок карток.
 *
 * Живі: спершу ті, де є прострочене, далі за найближчим дедлайном; проєкти
 * без жодного дедлайну — в кінці. Архівні: найсвіжіше заархівоване зверху.
 *
 * Власний термін проєкту в порядку враховується нарівні з дедлайнами задач:
 * проєкт із простроченим ВЛАСНИМ терміном мусить стояти зверху так само, як
 * той, у якого горить задача.
 */
export function compareLive(a: ProjectStats, b: ProjectStats): number {
  const aHot = a.overdue > 0 || a.projectOverdue;
  const bHot = b.overdue > 0 || b.projectOverdue;
  if (aHot !== bHot) return aHot ? -1 : 1;

  const aDate = a.project.deadline ?? a.nearestDeadline;
  const bDate = b.project.deadline ?? b.nearestDeadline;
  if (aDate && bDate) return aDate.localeCompare(bDate);
  if (aDate) return -1;
  if (bDate) return 1;
  return a.project.name.localeCompare(b.project.name, 'uk-UA');
}

export function compareArchived(a: ProjectStats, b: ProjectStats): number {
  return (b.project.archivedAt ?? '').localeCompare(a.project.archivedAt ?? '');
}

// ─── Сортування й фільтр списку проєктів ──────────────────────────────────────
//
// ДЗЕРКАЛО веб-блоку lib/project-stats.ts — ті самі назви й правила; паритет
// тримає спільна фікстура __tests__/fixtures/project-list-parity-web.json
// (побайтова копія flowi-web-app/lib/__fixtures__/project-list-parity.json).

export type ProjectSortKey = 'smart' | 'status' | 'progress' | 'updated' | 'name';
export const PROJECT_SORT_KEYS: readonly ProjectSortKey[] = ['smart', 'status', 'progress', 'updated', 'name'];

/**
 * Похідний статус проєкту — БЕЗ нового поля в даних. Архів — окремий явний
 * стан (archivedAt) і окремий перемикач, тут його немає.
 *  - overdue — є прострочена незавершена задача або минув власний термін;
 *  - empty   — жодної задачі;
 *  - done    — усі задачі виконані (100%);
 *  - active  — решта: робота йде.
 */
export type ProjectListStatus = 'overdue' | 'active' | 'empty' | 'done';
export const PROJECT_LIST_STATUSES: readonly ProjectListStatus[] = ['overdue', 'active', 'empty', 'done'];

type SortableStats = Pick<
  ProjectStats,
  'overdue' | 'projectOverdue' | 'total' | 'done' | 'pct' | 'empty' | 'archived' | 'nearestDeadline' | 'lastActivityAt'
> & { project: Pick<ProjectLike, 'id' | 'name' | 'deadline' | 'archivedAt'> };

export function projectStatusOf(
  stats: Pick<ProjectStats, 'overdue' | 'projectOverdue' | 'total' | 'done'>,
): ProjectListStatus {
  if (stats.overdue > 0 || stats.projectOverdue) return 'overdue';
  if (stats.total === 0) return 'empty';
  if (stats.done >= stats.total) return 'done';
  return 'active';
}

/** Порядок груп у сортуванні «Статус»: що горить — зверху, закрите — внизу. */
const STATUS_RANK: Record<ProjectListStatus, number> = { overdue: 0, active: 1, empty: 2, done: 3 };

function byName(a: SortableStats, b: SortableStats): number {
  return a.project.name.localeCompare(b.project.name, 'uk') || byId(a, b);
}

/** Останній тай-брейк: однакові назви не міняються місцями між рендерами. */
function byId(a: SortableStats, b: SortableStats): number {
  return a.project.id < b.project.id ? -1 : a.project.id > b.project.id ? 1 : 0;
}

function activityTime(stats: SortableStats): number {
  if (!stats.lastActivityAt) return Number.NEGATIVE_INFINITY;
  const at = new Date(stats.lastActivityAt).getTime();
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

/** «Розумне» — нинішній порядок: живі за compareLive, архівні — за compareArchived. */
function smart(a: SortableStats, b: SortableStats): number {
  const order = a.archived && b.archived
    ? compareArchived(a as ProjectStats, b as ProjectStats)
    : compareLive(a as ProjectStats, b as ProjectStats);
  return order || byId(a, b);
}

const COMPARATORS: Record<ProjectSortKey, (a: SortableStats, b: SortableStats) => number> = {
  smart,
  status: (a, b) =>
    STATUS_RANK[projectStatusOf(a)] - STATUS_RANK[projectStatusOf(b)] || smart(a, b),
  // Найближчі до фінішу — зверху; порожні (0 із 0) — під усіма непорожніми,
  // бо їхні 0% — «нічого немає», а не «нічого не зроблено».
  progress: (a, b) =>
    Number(a.empty) - Number(b.empty) || b.pct - a.pct || byName(a, b),
  // Найсвіжіша активність — зверху; без жодної позначки часу — у кінці.
  updated: (a, b) => {
    const ta = activityTime(a);
    const tb = activityTime(b);
    if (ta !== tb) return tb > ta ? 1 : -1;
    return byName(a, b);
  },
  name: byName,
};

/** Новий відсортований масив; вхід не мутується. Невідомий ключ — «Розумне». */
export function sortProjects<T extends SortableStats>(stats: readonly T[], key: ProjectSortKey): T[] {
  const compare = COMPARATORS[key] ?? COMPARATORS.smart;
  return [...stats].sort(compare);
}

/** Порожній набір статусів — фільтра немає, видно все. */
export function filterProjects<T extends SortableStats>(
  stats: readonly T[],
  statuses: readonly ProjectListStatus[],
): T[] {
  if (!statuses.length) return [...stats];
  const allowed = new Set(statuses);
  return stats.filter(item => allowed.has(projectStatusOf(item)));
}

/** Скільки проєктів у кожному статусі — лічильники на чипах фільтра. */
export function projectStatusCounts(
  stats: readonly Pick<ProjectStats, 'overdue' | 'projectOverdue' | 'total' | 'done'>[],
): Record<ProjectListStatus, number> {
  const counts: Record<ProjectListStatus, number> = { overdue: 0, active: 0, empty: 0, done: 0 };
  for (const item of stats) counts[projectStatusOf(item)] += 1;
  return counts;
}

export interface ProjectListPrefs {
  sort: ProjectSortKey;
  statuses: ProjectListStatus[];
}

export const DEFAULT_PROJECT_LIST_PREFS: ProjectListPrefs = { sort: 'smart', statuses: [] };

/**
 * Збережений на пристрої вибір → валідний стан. Сміття, старі ключі чи чужий
 * формат не ламають екран, а дають типовий вибір; дублікати й невідомі
 * статуси відкидаються, порядок — канонічний.
 */
export function parseProjectListPrefs(raw: unknown): ProjectListPrefs {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PROJECT_LIST_PREFS, statuses: [] };
  const value = raw as { sort?: unknown; statuses?: unknown };
  const sort = PROJECT_SORT_KEYS.includes(value.sort as ProjectSortKey)
    ? (value.sort as ProjectSortKey)
    : DEFAULT_PROJECT_LIST_PREFS.sort;
  const picked: unknown[] = Array.isArray(value.statuses) ? value.statuses : [];
  const statuses = PROJECT_LIST_STATUSES.filter(status => picked.includes(status));
  return { sort, statuses };
}

// ─── Міні-шкала ───────────────────────────────────────────────────────────────

export const TIMELINE_BUCKETS = 12;

export interface TimelineBucket {
  /** Початок відрізка, ISO. */
  start: string;
  /** Скільки дедлайнів потрапило у відрізок. */
  count: number;
  /** З них уже виконаних. */
  done: number;
  /** Чи містить відрізок сьогоднішній день. */
  current: boolean;
}

/**
 * Шкала будується на ДЕДЛАЙНАХ, а не на датах початку.
 *
 * Причина фактична: дата початку не заповнена в жодної задачі, тож діаграма
 * Ганта малювала смуги в один день у 100% випадків. Дедлайн натомість є майже
 * скрізь — на ньому шкала показує реальний розкид робіт у часі.
 *
 * Відрізків завжди рівно TIMELINE_BUCKETS, незалежно від довжини проєкту: так
 * усі картки мають однакову шкалу й порівнюються поглядом.
 *
 * ДЗЕРКАЛО веб-функції з тим самим імʼям — розбіжність означала б, що той
 * самий проєкт виглядає по-різному в телефоні й у браузері.
 */
export function projectTimeline(
  project: ProjectLike,
  tasks: ProjectTaskLike[],
  now: Date = new Date(),
): TimelineBucket[] {
  const own = tasks.filter(task => task.projectId === project.id);
  const stamped = own.flatMap(task => {
    const at = deadlineTime(task);
    return at === null ? [] : [{ at, done: task.status === 'done' }];
  });

  const nowAt = now.getTime();
  const week = 7 * 86_400_000;

  // Без жодного дедлайну шкала все одно малюється — порожньою, навколо
  // сьогодні. Порожня шкала чесніша за відсутню: видно, що даних немає.
  let from = stamped.length ? Math.min(...stamped.map(item => item.at)) : nowAt - 6 * week;
  let to = stamped.length ? Math.max(...stamped.map(item => item.at)) : nowAt + 6 * week;

  // Усі дедлайни в один день — розтягуємо вікно, інакше ділити нема чого.
  if (to - from < week) {
    const middle = (from + to) / 2;
    from = middle - 6 * week;
    to = middle + 6 * week;
  }

  const size = (to - from) / TIMELINE_BUCKETS;
  const buckets: TimelineBucket[] = Array.from({ length: TIMELINE_BUCKETS }, (_, index) => ({
    start: new Date(from + index * size).toISOString(),
    count: 0,
    done: 0,
    current: nowAt >= from + index * size && nowAt < from + (index + 1) * size,
  }));

  for (const item of stamped) {
    // Останній дедлайн потрапляє рівно на межу — його треба лишити в межах.
    const index = Math.min(TIMELINE_BUCKETS - 1, Math.floor((item.at - from) / size));
    buckets[index].count += 1;
    if (item.done) buckets[index].done += 1;
  }
  return buckets;
}
