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
import { isSameDay } from './dateUtils';
import {
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  orderColumnsForList,
  taskColumnId,
  type TaskStatusColumn,
} from './taskStatuses';
import { isOverdue, type Task } from './taskUtils';

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

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Коли завдання завершили.
 *
 * Окремого поля під це немає, тож ідемо ланцюжком від найточнішого до
 * найгрубішого: остання подія 'done' в історії → updatedAt → нічого. Остання
 * ланка важлива: у завдання, закритого до появи історії, дати завершення
 * просто не існує, і вигадувати її (наприклад, беручи createdAt) означало б
 * витягувати на екран дня випадкові старі завдання.
 */
export function completedAt(task: Task): Date | null {
  const events = (task.history ?? []).filter(event => event.type === 'done');
  const last = events[events.length - 1];
  if (last?.at) return new Date(last.at);
  if (task.updatedAt) return new Date(task.updatedAt);
  return null;
}

function byPriority(a: Task, b: Task): number {
  return (PRIORITY_ORDER[a.priority] ?? 1) - (PRIORITY_ORDER[b.priority] ?? 1);
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
  const relevant = tasks.filter(task => {
    // Завершене лишається в дні, але тільки якщо завершене САМЕ СЬОГОДНІ.
    // Інакше екран дня поступово перетворився б на архів: усе, що колись
    // закрили, назавжди осідало б унизу.
    if (task.status === 'done') {
      const at = completedAt(task);
      return at !== null && isSameDay(at, today);
    }
    const column = taskColumnId(task, columns);
    // Робота йде або результат чекає на приймання — завдання належить дню
    // незалежно від дедлайну. Саме ці два стани описують «сьогодні» краще за
    // дату: дедлайн може бути через тиждень, а робиться воно зараз.
    if (column === IN_PROGRESS_COLUMN_ID || column === REVIEW_COLUMN_ID) return true;
    return (task.deadline && isSameDay(new Date(task.deadline), today)) || isOverdue(task);
  });

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
