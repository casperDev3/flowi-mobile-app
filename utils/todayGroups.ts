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
  IN_PROGRESS_COLUMN_ID,
  orderColumnsForList,
  taskColumnId,
  type TaskStatusColumn,
} from './taskStatuses';
import { isTodayTask } from './taskToday';
import { comparePriority, type Task } from './taskUtils';

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
): TodayGroups {
  // Кого взагалі беремо — питає спільне правило: те саме, що вирішує склад
  // статусних груп у списку завдань. Копія цієї умови жила тут і одного разу
  // вже розійшлася з копією в taskListSections.ts.
  const relevant = tasks.filter(task => isTodayTask(task, columns, today));

  const buckets = new Map<string, Task[]>();
  for (const task of relevant) {
    const id = taskColumnId(task, columns);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(task);
    else buckets.set(id, [task]);
  }

  // Порядок груп — спільне правило списків: «У процесі» попереду решти.
  const ordered = orderColumnsForList(columns).filter(column => buckets.has(column.id));

  let budget = limit;
  const groups: TodayGroup[] = [];
  let shown = 0;

  for (const column of ordered) {
    const all = (buckets.get(column.id) ?? []).sort(byPriority);
    const take = column.id === IN_PROGRESS_COLUMN_ID ? all.length : Math.max(0, budget);
    const visible = all.slice(0, take);
    if (column.id !== IN_PROGRESS_COLUMN_ID) budget -= visible.length;
    if (visible.length === 0) continue;
    groups.push({ id: column.id, name: column.name, color: column.color, tasks: visible });
    shown += visible.length;
  }

  return { groups, total: relevant.length, hidden: relevant.length - shown };
}
