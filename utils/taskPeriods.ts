/**
 * utils/taskPeriods.ts — період списку «Завдань» на планшеті:
 * Сьогодні / Завтра / Тиждень / Місяць / Всі / Без дедлайну.
 *
 * Дзеркало вебового `lib/task-filters.ts` (TaskPeriod, inTaskPeriod,
 * periodToKeepVisible). Надбудова над перемикачем `scope` + `noDeadline`
 * (utils/taskToday.ts inTaskScope), а не його заміна: «Сьогодні», «Тиждень»,
 * «Всі» й «Без дедлайну» — ті самі значення з тими самими правилами, лише
 * «Завтра» й «Місяць» нові. Телефон далі живе на старих чипах і цього файлу
 * не торкається — тому `taskToday.ts` тут свідомо не змінено.
 */
import type { TaskStatusColumn } from './taskStatuses';
import { inTaskScope, isTodayTask, isWeekTask, type TaskScopeMode, type TodayScopeTask } from './taskToday';
import type { PriorityLevel } from './taskUtils';

export type TaskPeriod = 'today' | 'tomorrow' | 'week' | 'month' | 'all' | 'undated';

/** Періоди, яких немає в старому перемикачі (`scope`). */
export type ExtraTaskPeriod = Extract<TaskPeriod, 'tomorrow' | 'month'>;

/** Порядок пунктів випадного списку — від вужчого до ширшого. */
export const TASK_PERIOD_ORDER: readonly TaskPeriod[] = ['today', 'tomorrow', 'week', 'month', 'all', 'undated'];

export const DEFAULT_TASK_PERIOD: TaskPeriod = 'today';

/** «Термінові» — збережений фільтр пріоритетів P0 + P1 (як на вебі). */
export const URGENT_PRIORITIES: readonly PriorityLevel[] = [0, 1];

/** Фільтр пріоритетів — це рівно «Термінові» (P0 + P1, нічого більше). */
export function isUrgentFilter(priorities: readonly PriorityLevel[]): boolean {
  return priorities.length === URGENT_PRIORITIES.length
    && URGENT_PRIORITIES.every(level => priorities.includes(level));
}

export function isExtraTaskPeriod(value: unknown): value is ExtraTaskPeriod {
  return value === 'tomorrow' || value === 'month';
}

/**
 * Період → стан старого перемикача (`scope` + `noDeadline`) і додатковий
 * період, який звужує «Всі» до «Завтра» / «Місяць».
 */
export function periodToScope(period: TaskPeriod): { scope: TaskScopeMode; noDeadline: boolean; extra: ExtraTaskPeriod | null } {
  switch (period) {
    case 'today': return { scope: 'today', noDeadline: false, extra: null };
    case 'week': return { scope: 'week', noDeadline: false, extra: null };
    case 'undated': return { scope: 'all', noDeadline: true, extra: null };
    case 'tomorrow':
    case 'month': return { scope: 'all', noDeadline: false, extra: period };
    default: return { scope: 'all', noDeadline: false, extra: null };
  }
}

/** Стан перемикача → період (зворотне до periodToScope). */
export function scopeToPeriod(scope: TaskScopeMode, noDeadline: boolean, extra: ExtraTaskPeriod | null = null): TaskPeriod {
  if (scope === 'today') return 'today';
  if (scope === 'week') return 'week';
  if (noDeadline) return 'undated';
  return extra ?? 'all';
}

/** Дедлайн як локальна доба (або null, якщо його немає чи він зіпсований). */
function deadlineDay(task: Pick<TodayScopeTask, 'deadline'>): number | null {
  if (!task.deadline) return null;
  const d = new Date(task.deadline);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * «Завтра»: дедлайн саме на завтрашню календарну добу. Без «у процесі» й
 * простроченого — це погляд на наступний день, а не на поточну роботу.
 */
export function isTomorrowTask(task: TodayScopeTask, now: Date): boolean {
  if (task.status === 'done') return false;
  const day = deadlineDay(task);
  if (day === null) return false;
  return day === dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
}

/**
 * «Місяць»: усе, що показує «Тиждень», плюс дедлайн до кінця ПОТОЧНОГО
 * календарного місяця. Тиждень входить цілком: наприкінці місяця найближчі
 * сім днів заходять у наступний, і «Місяць» не мусить показувати менше.
 */
export function isMonthTask(task: TodayScopeTask, columns: TaskStatusColumn[], now: Date): boolean {
  if (task.status === 'done') return false;
  if (isWeekTask(task, columns, now)) return true;
  const day = deadlineDay(task);
  if (day === null) return false;
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return day >= dayStart(now) && day < endOfMonth;
}

/**
 * ОДНЕ правило періоду для НЕзавершених задач. Завершені проходять завжди —
 * скільки їх видно, вирішує вікно свіжості вище по потоку (applyTaskScope).
 */
export function inTaskPeriod(task: TodayScopeTask, columns: TaskStatusColumn[], period: TaskPeriod, now: Date): boolean {
  if (period === 'today') return isTodayTask(task, columns, now);
  if (task.status === 'done') return true;
  if (period === 'tomorrow') return isTomorrowTask(task, now);
  if (period === 'month') return isMonthTask(task, columns, now);
  const { scope, noDeadline } = periodToScope(period);
  return inTaskScope(task, columns, scope, { noDeadline }, now);
}

/**
 * Найвужчий період, у якому задача видна, — щоб щойно створене не зникало:
 * поточний лишається, якщо задача в ньому; інакше — найближчий ширший.
 */
export function periodToKeepVisible(
  task: TodayScopeTask,
  columns: TaskStatusColumn[],
  current: TaskPeriod,
  now: Date,
): TaskPeriod {
  if (inTaskPeriod(task, columns, current, now)) return current;
  const from = Math.max(0, TASK_PERIOD_ORDER.indexOf(current));
  const wider = TASK_PERIOD_ORDER.slice(from + 1).find(period => inTaskPeriod(task, columns, period, now));
  return wider ?? TASK_PERIOD_ORDER.find(period => inTaskPeriod(task, columns, period, now)) ?? 'all';
}
