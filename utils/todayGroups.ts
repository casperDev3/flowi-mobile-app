/**
 * utils/todayGroups.ts — що і в якому порядку показує екран «Сьогодні».
 *
 * До групування список був пласким: тільки завдання з дедлайном сьогодні або
 * простроченим, відсортовані за пріоритетом. Через це завдання, над яким прямо
 * зараз іде таймер, могло не потрапити на екран дня взагалі — якщо його
 * дедлайн ще попереду. Найважливіше на сьогодні — те, що робиться просто
 * зараз, тож воно потрапляє в список за самим фактом роботи й стоїть першим.
 *
 * Логіка тут, а не в екрані, бо вона має три межі, які легко зсунути тихо:
 * кого взагалі беремо, в якому порядку йдуть групи і що ховаємо під «показати
 * всі». Кожна перевірена тестом.
 */
import {
  orderColumnsForList,
  resolvedStatusType,
  scopedTaskStatusColumn,
  type TaskStatusColumn,
} from './taskStatuses';
import { isTodayTask } from './taskToday';
import { comparePriority, isMyTask, type Task } from './taskUtils';

export { completedAt } from './taskUtils';

export interface TodayGroup {
  id: string;
  name: string;
  color: string;
  tasks: Task[];
}

export interface TodayGroups {
  groups: TodayGroup[];
  /** Скільки завдань відібрано всього — до обрізання під превʼю. */
  total: number;
  /** Скільки сховано під «показати всі». */
  hidden: number;
}

/** P0→P5, без пріоритету — в кінці (CONTRACT §B.4). */
function byPriority(a: Task, b: Task): number {
  return comparePriority(a, b);
}

/**
 * Групи завдань для екрана дня.
 *
 * @param limit скільки показати ПОЗА групою «У процесі». Сама вона не
 *   обрізається ніколи: ховати те, над чим людина працює просто зараз, під
 *   «показати всі» означало б викинути єдину причину, з якої воно тут.
 */
export function groupTodayTasks(
  tasks: Task[],
  columns: TaskStatusColumn[],
  today: Date,
  limit: number,
  /**
   * §3.7 «моє» (contract) — `undefined`, доки викликач не знає користувача
   * (тести, ранній рендер до `useAuth()`): тоді фільтр пропускає все, як і
   * до цього поля. У соло-фазі це й так завжди `true` — див. `isMyTask`.
   */
  myUserId?: string | null,
  /** Ролі в проєктах — для задач без автора (див. isMyTask). */
  projectRoles?: Readonly<Record<string, string>>,
): TodayGroups {
  // Кого взагалі беремо — питає спільне правило: те саме, що вирішує склад
  // статусних груп у списку завдань. Копія цієї умови жила тут і одного разу
  // вже розійшлася з копією в taskListSections.ts.
  const relevant = tasks.filter(task =>
    isTodayTask(task, columns, today) && (myUserId === undefined || isMyTask(task, myUserId, projectRoles)));

  // `columns` — увесь `task_statuses` (усі проєкти разом); колонка кожного
  // завдання шукається у ВЛАСНОМУ скоупі (§3.7 «Особисте агрегує» — інакше
  // задача проєкту з kanbanColumnId='st-…' не знаходилась у плоскому
  // особистому списку й завжди падала на дефолтну «До роботи»/«Готово»).
  const buckets = new Map<string, Task[]>();
  const bucketColumns = new Map<string, TaskStatusColumn>();
  for (const task of relevant) {
    const column = scopedTaskStatusColumn(task, columns);
    const bucket = buckets.get(column.id);
    if (bucket) bucket.push(task);
    else buckets.set(column.id, [task]);
    if (!bucketColumns.has(column.id)) bucketColumns.set(column.id, column);
  }

  // Порядок груп — спільне правило списків: «У процесі» попереду решти.
  const ordered = orderColumnsForList([...bucketColumns.values()]);

  let budget = limit;
  const groups: TodayGroup[] = [];
  let shown = 0;

  for (const column of ordered) {
    const inProgress = resolvedStatusType(column) === 'in_progress';
    const all = (buckets.get(column.id) ?? []).sort(byPriority);
    const take = inProgress ? all.length : Math.max(0, budget);
    const visible = all.slice(0, take);
    if (!inProgress) budget -= visible.length;
    if (visible.length === 0) continue;
    groups.push({ id: column.id, name: column.name, color: column.color, tasks: visible });
    shown += visible.length;
  }

  return { groups, total: relevant.length, hidden: relevant.length - shown };
}
