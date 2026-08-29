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
}

export interface ProjectTaskLike {
  id: string;
  projectId?: string;
  status: string;
  deadline?: string;
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
  for (const task of own) {
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
