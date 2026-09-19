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
import { isSameDay } from './dateUtils';
import {
  REVIEW_COLUMN_ID,
  resolvedStatusType,
  scopedTaskStatusColumn,
  type TaskStatusColumn,
} from './taskStatuses';
import { completedAt, isOverdue, type Task } from './taskUtils';

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
  'status' | 'kanbanColumnId' | 'deadline' | 'history' | 'updatedAt' | 'projectId'
>;

export function isTodayTask(
  task: TodayScopeTask,
  columns: TaskStatusColumn[],
  now: Date,
): boolean {
  if (task.status === 'done') {
    const at = completedAt(task as Task);
    return at !== null && isSameDay(at, now);
  }

  // Скоуп за ВЛАСНИМ projectId завдання (§3.7) — інакше проєктна копія «У
  // процесі» (свій id, не IN_PROGRESS_COLUMN_ID) ніколи не впізнавалась би
  // нижче, і задача проєкту в роботі показувала б «сьогодні» лише за
  // дедлайном, як звичайний беклог.
  const column = scopedTaskStatusColumn(task, columns);
  if (resolvedStatusType(column) === 'in_progress' || column.id === REVIEW_COLUMN_ID) return true;

  if (isOverdue(task)) return true;

  if (!task.deadline) return false;

  // Зіпсований рядок дати (трапляється в даних із синхронізації) не має права
  // вважатись сьогоднішнім: усі порівняння з Invalid Date дають false, тож без
  // цієї перевірки нижче спрацював би isSameDay і повернув false — але вже
  // після NaN-арифметики. Перевіряємо явно, щоб намір читався.
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return false;

  return isSameDay(deadline, now);
}
