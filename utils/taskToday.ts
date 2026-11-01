/**
 * utils/taskToday.ts — ОДНЕ правило «чи належить завдання сьогоднішньому дню».
 *
 * До цього файлу правило існувало двома копіями: `relevant` в todayGroups.ts
 * (екран дня) і `belongsInStatusGroups` у taskListSections.ts (список завдань).
 * Копії вже й розходились: список пускав у «сьогодні» ВСЕ без дедлайну і все
 * завершене за вікном DONE_VISIBLE_DAYS, тож вкладка завдань за замовчуванням
 * показувала весь беклог, а екран дня — тільки денну роботу. Коментарі в обох
 * файлах прямо попереджали, що так буде; тепер розходитись нема чому.
 *
 * Що таке «сьогодні» (порядок перевірок значущий — вирішує перша, що спрацювала):
 *
 *   1. Завершене — лише якщо завершене САМЕ СЬОГОДНІ. Інакше екран дня і
 *      статусна група «Готово» повільно перетворюються на архів.
 *   2. «У процесі» / «На перевірці» — незалежно від дедлайну. Ці два стани
 *      описують «зараз» краще за дату: дедлайн може бути через тиждень, а
 *      робота йде сьогодні.
 *   3. Прострочене — це найгостріше «сьогодні», а не вчорашній день.
 *   4. Дедлайн саме сьогодні.
 *   5. Решта — ні. Зокрема завдання БЕЗ дедлайну: беклог не є денною роботою.
 *      Саме цей пункт і був головною розбіжністю зі списком завдань.
 */
import { isSameDay, localDateKey } from './dateUtils';
import { deadlineDayKey } from './taskDeadline';
import {
  REVIEW_COLUMN_ID,
  personalDisplayColumn,
  resolvedStatusType,
  scopedTaskStatusColumn,
  type TaskStatusColumn,
} from './taskStatuses';
import { completedEventAt, isOverdue, type Task } from './taskUtils';

/**
 * Мінімум полів, потрібних для рішення: екрани мають власні звужені типи
 * завдання, і вимагати від них повний Task означало б тягнути сюди підзадачі,
 * записи таймера й нагадування, до яких правило не має жодного стосунку.
 *
 * `projectId` — щоб «У процесі» рахувалось і для задачі ПРОЄКТУ: її власна
 * in_progress-колонка має інший (`st-<uuid4>`) id, і без скоупу за
 * projectId її взагалі не було б серед `columns` (плоский особистий список
 * відфільтровує все з чужим projectId).
 */
export type TodayScopeTask = Pick<
  Task,
  'status' | 'kanbanColumnId' | 'deadline' | 'deadlineHasTime' | 'deadlineTimeAt' | 'history' | 'updatedAt' | 'projectId'
>;

export function isTodayTask(
  task: TodayScopeTask,
  columns: TaskStatusColumn[],
  now: Date,
): boolean {
  if (task.status === 'done') {
    // Строго за подією 'done' — див. completedEventAt: updatedAt зсувається
    // від будь-якого перезапису і тягнув у «Готово» дня старі задачі.
    const at = completedEventAt(task);
    return at !== null && isSameDay(at, now);
  }

  // Скоуп за ВЛАСНИМ projectId завдання (§3.7) — інакше проєктна копія «У
  // процесі» (свій id, не IN_PROGRESS_COLUMN_ID) ніколи не впізнавалась би
  // нижче, і задача проєкту в роботі показувала б «сьогодні» лише за
  // дедлайном, як звичайний беклог.
  const column = scopedTaskStatusColumn(task, columns);
  // «На перевірці» проєкту — його копія (sourceStatusId) з власним st-id або
  // колонка, яку людина пов'язала з особистою «На перевірці» (як веб, що
  // зводить колонку проєкту до особистої через taskColumnId).
  if (resolvedStatusType(column) === 'in_progress' || column.id === REVIEW_COLUMN_ID
    || column.sourceStatusId === REVIEW_COLUMN_ID
    || (!!column.projectId && personalDisplayColumn(task, columns).id === REVIEW_COLUMN_ID)) return true;

  if (isOverdue(task, now)) return true;

  if (!task.deadline) return false;

  // Доба дедлайну (контракт C2): ISO → локальна доба, голий `YYYY-MM-DD`
  // (імпорти) — саме ця доба. `new Date('2026-10-20')` — UTC-північ, і на
  // захід від Гринвіча задача «на сьогодні» потрапляла б на вчора. Зіпсований
  // рядок дає null і «сьогоднішнім» не вважається.
  const day = deadlineDayKey(task.deadline);
  return day !== null && day === localDateKey(now);
}

/**
 * «Тиждень»: усе «сьогоднішнє» (у роботі, прострочене, на сьогодні) ПЛЮС
 * дедлайн у найближчі 7 календарних днів. Дзеркалить веб `taskUrgency 'week'`.
 */
export function isWeekTask(task: TodayScopeTask, columns: TaskStatusColumn[], now: Date): boolean {
  if (isTodayTask(task, columns, now)) return true;
  if (task.status === 'done' || !task.deadline) return false;
  const day = deadlineDayKey(task.deadline);
  if (!day) return false;
  const [y, m, d] = day.split('-').map(Number);
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((new Date(y, m - 1, d).getTime() - dayStart(now)) / 86400000);
  return diffDays > 0 && diffDays <= 7;
}

/** Режими перемикача вкладки «Завдання». */
export type TaskScopeMode = 'today' | 'week' | 'all';

/**
 * ЄДИНЕ правило перемикача «Сьогодні / Тиждень / Всі» (+ «Без дедлайну» у
 * режимі «Всі»):
 *
 *   today — isTodayTask;
 *   week  — isWeekTask;
 *   all   — активні лише З дедлайном; з `noDeadline` — лише БЕЗ дедлайну.
 *           Особиста дошка показує завдання з дедлайном, а беклог без дати
 *           відкривається окремою кнопкою (запит користувача 2026-09-22).
 *
 * Завершені в 'week' і 'all' лишаються незалежно від дедлайну: скільки їх видно,
 * вирішує вікно свіжості (taskVisibleInList) вище по потоку.
 */
export function inTaskScope(
  task: TodayScopeTask,
  columns: TaskStatusColumn[],
  scope: TaskScopeMode,
  options: { noDeadline?: boolean } = {},
  now: Date = new Date(),
): boolean {
  if (scope === 'today') return isTodayTask(task, columns, now);
  // Завершені в «Тиждень»/«Всі» — як inTaskScope вебу: лишаються, а скільки їх
  // видно, вирішує вікно свіжості (DONE_VISIBLE_DAYS) вище по потоку.
  if (task.status === 'done') return true;
  if (scope === 'week') return isWeekTask(task, columns, now);
  const hasDeadline = !!task.deadline && !Number.isNaN(new Date(task.deadline).getTime());
  return options.noDeadline ? !hasDeadline : hasDeadline;
}
