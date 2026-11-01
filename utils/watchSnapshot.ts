/**
 * utils/watchSnapshot.ts — знімок дня для Apple Watch (WatchTodaySnapshot v1).
 *
 * Годинник не має AsyncStorage і не має синку: усе, що він показує, —
 * готовий знімок. Телефон рахує його тут і віддає через WatchConnectivity
 * (store/watch-link.ts); сервер рахує ТУ САМУ схему в `watch/snapshot.py`
 * для випадку, коли телефон недосяжний. Годинник бере знімок із найновішим
 * `generatedAt`, тож правила тут і там мусять казати те саме
 * (docs/specs/watch-lockscreen-v1.md §4).
 *
 * Чиста функція: вхід — сирі значення зі сховища (будь-якої форми), вихід —
 * JSON-сумісний об'єкт. Правила взяті з модулів, якими живуть екрани:
 *   • «мої завдання на сьогодні» — isTodayTask ∧ isMyTask (як «Сьогодні»);
 *   • звички — ті самі doneToday/streak, що й habitDoneToday/habitStreak;
 *   • рахунок за замовчуванням — defaultAccountId форми нової операції;
 *   • зустрічі — розгортання повторів utils/meetings.ts.
 */
import { defaultAccountId, type Account } from './accounts';
import { sortTimers, type ActiveTimer } from './activeTimers';
import { localDateKey } from './dateUtils';
import { DEFAULT_CATEGORIES_EN, DEFAULT_CATEGORIES_UK, defaultCategories } from './financeCategories';
import { BUILTIN_CURRENCIES, type Currency, type Transaction } from './financeUtils';
import { expandMeetings, type Meeting } from './meetings';
import type { Habit } from './preventionUtils';
import type { TaskStatusColumn } from './taskStatuses';
import { isDeadlinePast, isTimedDeadline } from './taskDeadline';
import { isTodayTask } from './taskToday';
import { completedEventAt, isMyTask, type Task } from './taskUtils';

export const WATCH_SNAPSHOT_VERSION = 1;
export const WATCH_MAX_TASKS = 40;
export const WATCH_MAX_MEETINGS = 20;
export const WATCH_MAX_CATEGORIES = 6;
export const WATCH_MAX_RECENT_LABELS = 3;
const CATEGORY_WINDOW_MS = 90 * 24 * 3600_000;
const FALLBACK_CATEGORY_ICON = 'ellipsis.circle.fill';
const DEFAULT_MEETING_MINUTES = 60;

export interface WatchTask {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  deadline: string | null;
  hasTime: boolean;
  overdue: boolean;
  done: boolean;
  canComplete: boolean;
  timerId: string | null;
  recurring: boolean;
}

export interface WatchHabit {
  id: string; title: string; icon: string; color: string; doneToday: boolean; streak: number;
}

export interface WatchTimer {
  id: string; label: string; startedAt: string;
  taskId: string | null; meetingId: string | null; projectName: string | null;
}

export interface WatchAccount {
  id: string; name: string; currency: string; symbol: string; decimals: number; kind: string;
}

export interface WatchMeeting {
  key: string; meetingId: string; title: string; date: string; time: string;
  durationMinutes: number; startsAt: string; location: string | null;
}

export interface WatchTodaySnapshot {
  v: 1;
  source: 'phone' | 'server';
  generatedAt: string;
  day: string;
  tz: string;
  lang: 'uk' | 'en' | null;
  user: { id: string; name: string };
  tasks: WatchTask[];
  taskCounts: { done: number; total: number };
  habits: WatchHabit[];
  timers: { active: WatchTimer[]; trackedTodaySec: number; recentLabels: string[] };
  finance: {
    categories: { name: string; icon: string }[];
    accounts: WatchAccount[];
    defaultAccountId: string | null;
  };
  meetings: WatchMeeting[];
}

/** Мінімум проєкту для підписів: кеш `workspace_projects` або локальні `projects`. */
interface ProjectLike { id?: unknown; name?: unknown; color?: unknown }

export interface WatchSnapshotInput {
  now: Date;
  /** IANA-пояс пристрою; лише підпис у знімку — дні рахуються в поясі пристрою. */
  tz: string;
  lang?: unknown;
  user: { id: string; name: string };
  /** `auth_user.id`; `undefined` — користувач невідомий (фільтр «моє» не діє). */
  myUserId?: string | null;
  projectRoles?: Readonly<Record<string, string>>;
  projects?: unknown;
  tasks?: unknown;
  taskStatuses?: unknown;
  activeTimers?: unknown;
  timeEntries?: unknown;
  transactions?: unknown;
  accounts?: unknown;
  categories?: unknown;
  currencies?: unknown;
  habits?: unknown;
  meetings?: unknown;
}

/** Сховище й синк інколи приносять не масив — знімок мусить пережити це мовчки. */
function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(item => item && typeof item === 'object') as T[]) : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function parseMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Локальна доба значення — `YYYY-MM-DD` лишається собою, ISO → доба пристрою. */
function dayOf(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? localDateKey(new Date(ms)) : null;
}

export function projectNameMap(...sources: unknown[]): Map<string, { name: string; color: string | null }> {
  const map = new Map<string, { name: string; color: string | null }>();
  for (const source of sources) {
    for (const p of arr<ProjectLike>(source)) {
      if (typeof p.id !== 'string' || map.has(p.id)) continue;
      if (typeof p.name !== 'string' || !p.name.trim()) continue;
      map.set(p.id, { name: p.name.trim(), color: typeof p.color === 'string' && p.color ? p.color : null });
    }
  }
  return map;
}

// ─── Завдання ────────────────────────────────────────────────────────────────

type SnapshotTask = Task & { recurrence?: unknown };

/** Мої завдання на сьогодні — та сама вибірка, що й кільце «Завдання» віджета. */
export function myTodayTasks(
  tasks: unknown,
  taskStatuses: unknown,
  now: Date,
  myUserId: string | null | undefined,
  roles?: Readonly<Record<string, string>>,
): SnapshotTask[] {
  const columns = arr<TaskStatusColumn>(taskStatuses);
  const seen = new Set<string>();
  const out: SnapshotTask[] = [];
  for (const task of arr<SnapshotTask>(tasks)) {
    if (typeof task.id !== 'string' || seen.has(task.id)) continue;
    if (task.integrationArchived) continue;
    if (myUserId !== undefined && !isMyTask(task, myUserId, roles)) continue;
    if (myUserId === undefined && (task.backlogKind || (task as { archivedAt?: unknown }).archivedAt
      || (task as { deleted?: unknown }).deleted)) continue;
    if (!isTodayTask(task, columns, now)) continue;
    seen.add(task.id);
    out.push(task);
  }
  return out;
}

/**
 * Прострочена незавершена задача (контракт C2): точний дедлайн
 * (isTimedDeadline: прапорець + `deadlineTimeAt === deadline`) — з моменту,
 * добовий — з наступної локальної доби. Те саме правило, що в
 * utils/taskUtils.ts isOverdue, у вебі й у серверному знімку годинника.
 */
export function snapshotTaskOverdue(
  task: { deadline?: unknown; deadlineHasTime?: unknown; deadlineTimeAt?: unknown; status?: unknown },
  now: Date,
): boolean {
  if (task.status === 'done' || typeof task.deadline !== 'string' || !task.deadline) return false;
  return isDeadlinePast(task as { deadline: string; deadlineHasTime?: unknown; deadlineTimeAt?: unknown }, now);
}

/** Чи має задача точний час дедлайну — поле `hasTime` знімків (C1). */
export function snapshotTaskHasTime(task: { deadline?: unknown; deadlineHasTime?: unknown; deadlineTimeAt?: unknown }): boolean {
  return isTimedDeadline(task as { deadline?: string; deadlineHasTime?: unknown; deadlineTimeAt?: unknown });
}

/**
 * Момент дедлайну для сортування: повний ISO — як є; голий `YYYY-MM-DD` —
 * ЛОКАЛЬНИЙ полудень цієї доби (як серверний deadline_moment), а не UTC-північ.
 */
function deadlineSortMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (bare) return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]), 12).getTime();
  return parseMs(value);
}

/** Тай-брейк C4: назва в нижньому регістрі звичайним порівнянням кодових одиниць, далі id. */
function cmpPlain(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Порядок §4: незавершені (прострочені від найстаріших → з часом сьогодні за
 * часом → решта за дедлайном і назвою), потім завершені (свіжіші першими).
 */
export function orderTodayTasks<T extends SnapshotTask>(tasks: T[], now: Date): T[] {
  const today = localDateKey(now);
  const FAR = Number.MAX_SAFE_INTEGER;
  const keyed = tasks.map(task => {
    const done = task.status === 'done';
    const deadlineDay = dayOf(task.deadline);
    const moment = deadlineSortMs(task.deadline) ?? FAR;
    let group: number;
    let primary: number;
    if (done) {
      group = 3;
      primary = -(completedEventAt(task)?.getTime() ?? 0);
    } else if (snapshotTaskOverdue(task, now)) {
      group = 0; primary = moment;
    } else if (snapshotTaskHasTime(task) && deadlineDay === today) {
      group = 1; primary = moment;
    } else {
      group = 2; primary = moment;
    }
    const title = (typeof task.title === 'string' ? task.title : '').toLowerCase();
    return { task, group, primary, title, id: String(task.id) };
  });
  // C4: не localeCompare (залежить від ICU/локалі пристрою й не має
  // відповідника в Python) — `toLowerCase()` + `<`, далі id; так само в
  // серверному watch/snapshot.py (`title.lower()`), тож годинник не
  // переставляє список, коли знімок приходить з іншого джерела.
  keyed.sort((a, b) =>
    a.group - b.group
    || a.primary - b.primary
    || cmpPlain(a.title, b.title)
    || cmpPlain(a.id, b.id));
  return keyed.map(k => k.task);
}

function buildTasks(
  input: WatchSnapshotInput,
  timers: ActiveTimer[],
  projects: Map<string, { name: string; color: string | null }>,
): { tasks: WatchTask[]; counts: { done: number; total: number } } {
  const roles = input.projectRoles ?? {};
  const ordered = orderTodayTasks(
    myTodayTasks(input.tasks, input.taskStatuses, input.now, input.myUserId, input.projectRoles),
    input.now,
  );
  const timerByTask = new Map<string, string>();
  for (const timer of timers) if (timer.taskId) timerByTask.set(timer.taskId, timer.id);
  const items: WatchTask[] = ordered.map(task => {
    const done = task.status === 'done';
    const projectId = str(task.projectId);
    const deadline = str(task.deadline);
    return {
      id: task.id,
      title: typeof task.title === 'string' ? task.title : '',
      projectId,
      projectName: projectId ? projects.get(projectId)?.name ?? null : null,
      deadline,
      hasTime: snapshotTaskHasTime(task),
      overdue: snapshotTaskOverdue(task, input.now),
      done,
      canComplete: !done && task.reviewRequired !== true && !(task.resultRequirements?.length)
        && !(projectId && roles[projectId] === 'viewer'),
      timerId: timerByTask.get(task.id) ?? null,
      recurring: !!task.recurrence && typeof task.recurrence === 'object',
    };
  });
  return {
    tasks: items.slice(0, WATCH_MAX_TASKS),
    counts: { done: items.filter(t => t.done).length, total: items.length },
  };
}

// ─── Звички ──────────────────────────────────────────────────────────────────

/** Доба запису журналу звички — як `dayKey` у utils/preventionUtils.ts. */
function habitDay(entry: string): string | null {
  // Голий `YYYY-MM-DD` — саме ця доба (як серверний local_day), не UTC-північ.
  return dayOf(entry);
}

function buildHabits(input: WatchSnapshotInput): WatchHabit[] {
  return arr<Habit & { deleted?: unknown }>(input.habits)
    .filter(h => typeof h.id === 'string' && !h.deleted)
    .map(habit => {
      const days = new Set<string>();
      for (const entry of Array.isArray(habit.log) ? habit.log : []) {
        if (typeof entry !== 'string') continue;
        const day = habitDay(entry);
        if (day) days.add(day);
      }
      const cursor = new Date(input.now.getFullYear(), input.now.getMonth(), input.now.getDate(), 12);
      const doneToday = days.has(localDateKey(cursor));
      if (!doneToday) cursor.setDate(cursor.getDate() - 1);
      let streak = 0;
      while (days.has(localDateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
      return {
        id: habit.id,
        title: typeof habit.title === 'string' ? habit.title : '',
        icon: typeof habit.icon === 'string' ? habit.icon : '',
        color: typeof habit.color === 'string' ? habit.color : '',
        doneToday,
        streak,
      };
    });
}

// ─── Таймери ─────────────────────────────────────────────────────────────────

interface TimeEntryLike { id?: unknown; task?: unknown; taskId?: unknown; duration?: unknown; date?: unknown }

export function usableTimers(value: unknown): ActiveTimer[] {
  return sortTimers(arr<ActiveTimer>(value).filter(t =>
    typeof t.id === 'string' && typeof t.startedAt === 'string' && Number.isFinite(Date.parse(t.startedAt))));
}

/** Проєкт таймера: власний → задачі → наради (як дзеркало time_entries). */
export function timerProjectId(timer: ActiveTimer, tasks: unknown, meetings: unknown): string | null {
  if (timer.projectId) return timer.projectId;
  if (timer.taskId) {
    const task = arr<Task>(tasks).find(t => t.id === timer.taskId);
    if (task?.projectId) return task.projectId;
  }
  if (timer.meetingId) {
    const meeting = arr<Meeting>(meetings).find(m => m.id === timer.meetingId);
    if (meeting?.projectId) return meeting.projectId;
  }
  return null;
}

function buildTimers(
  input: WatchSnapshotInput,
  timers: ActiveTimer[],
  projects: Map<string, { name: string; color: string | null }>,
): WatchTodaySnapshot['timers'] {
  const today = localDateKey(input.now);
  const active: WatchTimer[] = timers.map(timer => {
    const projectId = timerProjectId(timer, input.tasks, input.meetings);
    return {
      id: timer.id,
      label: typeof timer.label === 'string' ? timer.label : '',
      startedAt: timer.startedAt,
      taskId: timer.taskId ?? null,
      meetingId: timer.meetingId ?? null,
      projectName: projectId ? projects.get(projectId)?.name ?? null : null,
    };
  });
  const entries = arr<TimeEntryLike>(input.timeEntries);
  let tracked = 0;
  for (const entry of entries) {
    if (dayOf(entry.date) !== today) continue;
    const sec = typeof entry.duration === 'number' ? entry.duration : Number(entry.duration);
    if (Number.isFinite(sec) && sec > 0) tracked += sec;
  }
  const labels: string[] = [];
  const push = (raw: unknown) => {
    const label = typeof raw === 'string' ? raw.trim() : '';
    if (label && !labels.includes(label) && labels.length < WATCH_MAX_RECENT_LABELS) labels.push(label);
  };
  for (const timer of [...timers].reverse()) {
    if (!timer.taskId && !timer.meetingId) push(timer.label);
  }
  const adhocEntries = entries
    .filter(e => !e.taskId)
    .map(e => ({ e, ms: parseMs(e.date) ?? 0 }))
    .sort((a, b) => b.ms - a.ms);
  for (const { e } of adhocEntries) push(e.task);
  return { active, trackedTodaySec: Math.round(tracked), recentLabels: labels };
}

// ─── Фінанси ─────────────────────────────────────────────────────────────────

interface CategoryRow { type?: unknown; name?: unknown; icon?: unknown }

export function currencyInfo(code: string, currencies: unknown): { symbol: string; decimals: number } {
  const found = [...BUILTIN_CURRENCIES, ...arr<Currency>(currencies)].find(c => c.code === code);
  if (!found) return { symbol: code, decimals: 2 };
  const decimals = Number.isFinite(Number(found.decimals)) ? Math.max(0, Math.min(8, Math.floor(Number(found.decimals)))) : 2;
  return { symbol: found.symbol || code, decimals };
}

function buildFinance(input: WatchSnapshotInput, lang: 'uk' | 'en' | null): WatchTodaySnapshot['finance'] {
  const expenses = arr<Transaction>(input.transactions).filter(t => t.type === 'expense' && !t.projectId);
  const cutoff = input.now.getTime() - CATEGORY_WINDOW_MS;
  const counts = new Map<string, number>();
  const lastUse = new Map<string, number>();
  for (const tx of expenses) {
    const name = typeof tx.category === 'string' ? tx.category.trim() : '';
    const when = parseMs(tx.date);
    if (!name || when === null || when < cutoff) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (when > (lastUse.get(name) ?? -Infinity)) lastUse.set(name, when);
  }
  const icons = new Map<string, string>();
  const stored: string[] = [];
  for (const row of arr<CategoryRow>(input.categories)) {
    if (row.type !== 'expense' || typeof row.name !== 'string') continue;
    const name = row.name.trim();
    if (!name || icons.has(name)) continue;
    icons.set(name, typeof row.icon === 'string' && row.icon ? row.icon : FALLBACK_CATEGORY_ICON);
    stored.push(name);
  }
  const ranked = [...counts.keys()].sort((a, b) =>
    (counts.get(b)! - counts.get(a)!) || (lastUse.get(b)! - lastUse.get(a)!));
  const defaults = defaultCategories(lang ?? 'uk').expense.map(c => c.name);
  const names: string[] = [];
  for (const name of [...ranked, ...stored, ...defaults]) {
    if (names.length >= WATCH_MAX_CATEGORIES) break;
    if (!names.includes(name)) names.push(name);
  }
  const defaultIcons = new Map<string, string>(
    [...DEFAULT_CATEGORIES_UK.expense, ...DEFAULT_CATEGORIES_EN.expense].map(c => [c.name, c.icon]),
  );
  const categories = names.map(name => ({
    name,
    icon: icons.get(name) ?? defaultIcons.get(name) ?? FALLBACK_CATEGORY_ICON,
  }));

  const all = arr<Account>(input.accounts).filter(a => typeof a.id === 'string');
  const active = all.filter(a => a.archived !== true);
  let latest: { ms: number; accountId: string } | null = null;
  for (const tx of expenses) {
    const ms = parseMs(tx.date);
    if (ms === null || typeof tx.accountId !== 'string' || !tx.accountId) continue;
    if (!latest || ms > latest.ms) latest = { ms, accountId: tx.accountId };
  }
  const defaultId = latest && active.some(a => a.id === latest!.accountId)
    ? latest.accountId
    : defaultAccountId(all);
  const ordered = [...active].sort((a, b) => (a.id === defaultId ? 0 : 1) - (b.id === defaultId ? 0 : 1));
  const accounts = ordered.map(account => {
    const code = account.currency || 'UAH';
    const { symbol, decimals } = currencyInfo(code, input.currencies);
    return {
      id: account.id,
      name: typeof account.name === 'string' ? account.name : '',
      currency: code,
      symbol,
      decimals,
      kind: account.kind || 'card',
    };
  });
  return { categories, accounts, defaultAccountId: defaultId };
}

// ─── Зустрічі ────────────────────────────────────────────────────────────────

export interface MeetingOccurrence {
  key: string;
  meetingId: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  startsAtMs: number;
  location: string | null;
}

/**
 * Екземпляри зустрічей (особисті + проєктні, з розгорнутими повторами) на
 * сьогодні й завтра, за часом початку. Скасовані й видалені — ні.
 */
export function meetingOccurrences(meetings: unknown, now: Date): MeetingOccurrence[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const tomorrowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
  const days = new Set([localDateKey(today), localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12))]);
  const source = arr<Meeting & { cancelled?: unknown; deleted?: unknown; archivedAt?: unknown; deletedAt?: unknown }>(meetings)
    .filter(m => typeof m.id === 'string' && !m.integrationCancelled && !m.cancelled && !m.deleted
      && !m.archivedAt && !m.deletedAt);
  const seen = new Set<string>();
  const out: MeetingOccurrence[] = [];
  for (const instance of expandMeetings(source, today, tomorrowEnd)) {
    if (!days.has(instance.date)) continue;
    const match = typeof instance.time === 'string' ? /^(\d{1,2}):(\d{2})/.exec(instance.time.trim()) : null;
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) continue;
    const meetingId = instance._origId ?? instance.id;
    const key = `${meetingId}@${instance.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [y, mo, d] = instance.date.split('-').map(Number);
    const starts = new Date(y, mo - 1, d, hour, minute, 0, 0);
    const minutes = Number(instance.durationMinutes);
    const location = typeof instance.location === 'string' && instance.location.trim() ? instance.location.trim() : null;
    out.push({
      key,
      meetingId,
      title: typeof instance.title === 'string' ? instance.title : '',
      date: instance.date,
      time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      durationMinutes: Number.isFinite(minutes) && minutes >= 0 ? Math.floor(minutes) : DEFAULT_MEETING_MINUTES,
      startsAtMs: starts.getTime(),
      location,
    });
  }
  out.sort((a, b) => a.startsAtMs - b.startsAtMs || a.key.localeCompare(b.key));
  return out;
}

// ─── Знімок ──────────────────────────────────────────────────────────────────

export function snapshotLang(value: unknown): 'uk' | 'en' | null {
  return value === 'uk' || value === 'en' ? value : null;
}

/** IANA-пояс пристрою (Hermes має Intl); без нього — UTC. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function buildWatchSnapshot(input: WatchSnapshotInput): WatchTodaySnapshot {
  const lang = snapshotLang(input.lang);
  const projects = projectNameMap(input.projects);
  const timers = usableTimers(input.activeTimers);
  const { tasks, counts } = buildTasks(input, timers, projects);
  return {
    v: WATCH_SNAPSHOT_VERSION,
    source: 'phone',
    generatedAt: input.now.toISOString(),
    day: localDateKey(input.now),
    tz: input.tz,
    lang,
    user: { id: String(input.user.id), name: input.user.name },
    tasks,
    taskCounts: counts,
    habits: buildHabits(input),
    timers: buildTimers(input, timers, projects),
    finance: buildFinance(input, lang),
    meetings: meetingOccurrences(input.meetings, input.now)
      .slice(0, WATCH_MAX_MEETINGS)
      .map(({ startsAtMs, ...rest }) => ({ ...rest, startsAt: new Date(startsAtMs).toISOString() })),
  };
}
