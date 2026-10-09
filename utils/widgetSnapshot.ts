/**
 * utils/widgetSnapshot.ts — знімок даних для iOS-віджета головного екрана.
 *
 * Віджет (targets/widget, WidgetKit) живе в окремому процесі й AsyncStorage
 * не бачить. Тому застосунок сам рахує ВСЕ, що віджет показує, і кладе готовий
 * JSON у спільну App Group (store/widget-sync.ts). Тут — лише чиста функція
 * «сховище → знімок», без жодного нативного виклику: її покривають тести.
 *
 * Правила взяті з тих самих модулів, що й екрани, — віджет не має права
 * казати інші числа, ніж «Сьогодні»:
 *   • фінанси — доходи й витрати СЬОГОДНІ в основній валюті (як «Сальдо
 *     місяця» у financeOverview, лише за добу; перекази не рахуються);
 *   • завдання — мої сьогоднішні (isTodayTask + isMyTask, як groupTodayTasks);
 *   • час — сума `time_entries` за сьогодні (як плитка на «Сьогодні») і
 *     таймер, що йде просто зараз (найсвіжіший з `active_timers`);
 *   • кроки — запасне значення з записів здоровʼя; сам віджет читає кроки
 *     напряму з HealthKit і бере більше з двох.
 */
import { resolveTxCurrency, txAmount, type Account } from './accounts';
import type { ActiveTimer } from './activeTimers';
import { isSameDay, localDateKey } from './dateUtils';
import { BUILTIN_CURRENCIES, type Currency, type Transaction } from './financeUtils';
import { STEPS_GOAL, sumForDay, type HealthEntry } from './healthUtils';
import type { TaskStatusColumn } from './taskStatuses';
import { isTodayTask } from './taskToday';
import { isMyTask, type Task } from './taskUtils';

/** App Group, спільна для застосунку й віджета (app.json → ios.entitlements). */
export const WIDGET_APP_GROUP = 'group.com.casper3.f-tracking-app';
/** Ключ у UserDefaults(suiteName: WIDGET_APP_GROUP). Swift читає той самий. */
export const WIDGET_SNAPSHOT_KEY = 'flowi_widget_snapshot_v1';
export const WIDGET_SNAPSHOT_VERSION = 1;

export interface WidgetSnapshot {
  v: number;
  /** Коли знімок пораховано (ISO). */
  generatedAt: string;
  /** Локальна доба, для якої пораховано числа (`YYYY-MM-DD`). Віджет не
   *  показує вчорашні числа після півночі — лише нулі до наступного запису. */
  day: string;
  /** Мова інтерфейсу застосунку — віджет говорить нею, а не мовою пристрою. */
  lang: 'uk' | 'en';
  /** false — людина вийшла з акаунта: віджет лишає тільки кнопки дій. */
  authed: boolean;
  finance: {
    currency: string;
    symbol: string;
    decimals: number;
    income: number;
    expense: number;
  };
  steps: { value: number; goal: number };
  tasks: { done: number; total: number };
  time: {
    /** Секунди, записані сьогодні (завершені сесії). */
    trackedSec: number;
    /** Таймер, що йде зараз (найсвіжіший), або null. */
    running: { label: string; startedAt: string; count: number } | null;
  };
}

export interface WidgetSnapshotInput {
  now: Date;
  lang?: unknown;
  authed: boolean;
  /** `auth_user.id`; `undefined` — користувач ще невідомий (фільтр «моє» не діє). */
  myUserId?: string | null;
  projectRoles?: Readonly<Record<string, string>>;
  tasks?: unknown;
  taskStatuses?: unknown;
  transactions?: unknown;
  accounts?: unknown;
  currencies?: unknown;
  primaryCurrency?: unknown;
  timeEntries?: unknown;
  activeTimers?: unknown;
  healthEntries?: unknown;
}

/** Сховище й синк інколи приносять не масив — знімок мусить пережити це мовчки. */
function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value.filter(item => item && typeof item === 'object') as T[]) : [];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function financeToday(input: WidgetSnapshotInput): WidgetSnapshot['finance'] {
  const primary = typeof input.primaryCurrency === 'string' && input.primaryCurrency
    ? input.primaryCurrency : 'UAH';
  const currency: Currency = [...BUILTIN_CURRENCIES, ...arr<Currency>(input.currencies)]
    .find(cur => cur.code === primary) ?? { code: primary, symbol: primary, kind: 'fiat', decimals: 2 };
  const accounts = arr<Account>(input.accounts);
  let income = 0;
  let expense = 0;
  for (const tx of arr<Transaction>(input.transactions)) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const date = new Date(tx.date);
    if (!Number.isFinite(date.getTime()) || !isSameDay(date, input.now)) continue;
    if (resolveTxCurrency(tx, accounts) !== primary) continue;
    if (tx.type === 'income') income += txAmount(tx.amount);
    else expense += txAmount(tx.amount);
  }
  return {
    currency: currency.code,
    symbol: currency.symbol || currency.code,
    decimals: Number.isFinite(currency.decimals) ? currency.decimals : 2,
    income: round2(income),
    expense: round2(expense),
  };
}

function tasksToday(input: WidgetSnapshotInput): WidgetSnapshot['tasks'] {
  const columns = arr<TaskStatusColumn>(input.taskStatuses);
  let done = 0;
  let total = 0;
  for (const task of arr<Task>(input.tasks)) {
    if (input.myUserId !== undefined && !isMyTask(task, input.myUserId, input.projectRoles)) continue;
    if (!isTodayTask(task, columns, input.now)) continue;
    total += 1;
    if (task.status === 'done') done += 1;
  }
  return { done, total };
}

interface TimeEntryLike { duration?: unknown; date?: unknown }

function timeToday(input: WidgetSnapshotInput): WidgetSnapshot['time'] {
  let trackedSec = 0;
  for (const entry of arr<TimeEntryLike>(input.timeEntries)) {
    if (typeof entry.date !== 'string') continue;
    const date = new Date(entry.date);
    if (!Number.isFinite(date.getTime()) || !isSameDay(date, input.now)) continue;
    const sec = typeof entry.duration === 'number' ? entry.duration : Number(entry.duration);
    if (Number.isFinite(sec) && sec > 0) trackedSec += sec;
  }
  const timers = arr<ActiveTimer>(input.activeTimers)
    .filter(t => typeof t.startedAt === 'string' && Number.isFinite(new Date(t.startedAt).getTime()))
    .filter(t => new Date(t.startedAt).getTime() <= input.now.getTime() + 60_000);
  // Найсвіжіший — той, з яким людина зараз працює; решта — лічильником.
  const latest = timers.reduce<ActiveTimer | null>((best, t) =>
    !best || new Date(t.startedAt).getTime() > new Date(best.startedAt).getTime() ? t : best, null);
  return {
    trackedSec: Math.round(trackedSec),
    running: latest
      ? {
          label: typeof latest.label === 'string' ? latest.label.trim().slice(0, 60) : '',
          startedAt: new Date(latest.startedAt).toISOString(),
          count: timers.length,
        }
      : null,
  };
}

/**
 * Ролі в проєктах для isMyTask — та сама зводка, що й useProjectRoles:
 * `project_sync_state_v1` точніше за кеш `workspace_projects`.
 */
export function widgetRoleMap(syncState: unknown, summaries: unknown): Record<string, string> {
  const roles: Record<string, string> = {};
  const valid = (r: unknown): r is string => r === 'owner' || r === 'manager' || r === 'member' || r === 'viewer';
  for (const s of arr<{ id?: unknown; role?: unknown }>(summaries)) {
    if (typeof s.id === 'string' && valid(s.role)) roles[s.id] = s.role;
  }
  if (syncState && typeof syncState === 'object' && !Array.isArray(syncState)) {
    for (const [id, entry] of Object.entries(syncState as Record<string, { role?: unknown } | null>)) {
      if (entry && valid(entry.role)) roles[id] = entry.role;
    }
  }
  return roles;
}

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const lang = input.lang === 'en' ? 'en' : 'uk';
  const base = {
    v: WIDGET_SNAPSHOT_VERSION,
    generatedAt: input.now.toISOString(),
    day: localDateKey(input.now),
    lang,
  } as const;
  if (!input.authed) {
    // Після виходу в спільному сховищі не лишається жодної цифри з акаунта.
    return {
      ...base,
      authed: false,
      finance: { currency: 'UAH', symbol: '₴', decimals: 2, income: 0, expense: 0 },
      steps: { value: 0, goal: STEPS_GOAL },
      tasks: { done: 0, total: 0 },
      time: { trackedSec: 0, running: null },
    };
  }
  return {
    ...base,
    authed: true,
    finance: financeToday(input),
    steps: {
      value: Math.round(sumForDay(arr<HealthEntry>(input.healthEntries), 'steps', input.now)),
      goal: STEPS_GOAL,
    },
    tasks: tasksToday(input),
    time: timeToday(input),
  };
}

/** Порівняння без `generatedAt` — щоб не перезавантажувати віджет даремно. */
export function widgetSnapshotSignature(snapshot: WidgetSnapshot): string {
  const { generatedAt: _ignored, ...rest } = snapshot;
  return JSON.stringify(rest);
}
