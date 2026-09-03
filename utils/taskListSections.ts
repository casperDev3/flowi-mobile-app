/**
 * utils/taskListSections.ts — розбиття списку завдань у режимі «за статусом».
 *
 * До цього правила статусні групи збирали ВСЕ підряд: ключем групи був просто
 * стовпчик завдання, без жодної перевірки дати. Через це завдання з дедлайном
 * завтра, наступного тижня чи в листопаді сідало в «До роботи» поруч із
 * сьогоднішнім, і список переставав відповідати на питання «що робити зараз».
 * Тепер статусні групи — це погляд на СЬОГОДНІ, а майбутнє йде окремими
 * денними секціями під ними.
 *
 * Логіка тут, а не в екрані, з тієї ж причини, про яку попереджають коментарі
 * в taskStatuses.ts і todayGroups.ts: копії умови відбору завдань уже одного
 * разу мовчки розійшлися, і група приходила заповненою, а рендерилась
 * порожньою.
 *
 * Правило нижче СПОРІДНЕНЕ з `relevant` у todayGroups.ts, але навмисно ШИРШЕ,
 * і синхронізувати їх дослівно НЕ можна. Екран дня відбирає те, що варте
 * уваги сьогодні; список завдань показує всю роботу й лише вирішує, у якій
 * секції вона стоїть. Звідси дві розбіжності: завершене тут лишається в
 * статусах незалежно від дати закриття (межу ставить DONE_VISIBLE_DAYS вище
 * по потоку, у taskVisibleInList), а завдання без дедлайну тут лишається в
 * статусах, тоді як на екран дня воно взагалі не потрапляє. Звести їх в одне
 * означало б або спорожнити групу «Готово» в списку, або затягнути весь
 * беклог на екран дня.
 *
 * Секцію «Прострочено» ця функція НЕ будує: її окремо збирає екран у шапці
 * списку, і прострочені приходять сюди вже відсіяними. Правило 4 нижче — на
 * випадок, коли шапки немає.
 */
import { isSameDay, localDateKey } from './dateUtils';
import {
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  orderColumnsForList,
  taskColumnId,
  type TaskStatusColumn,
} from './taskStatuses';
import { isOverdue, type Task } from './taskUtils';

/** Мінімум полів, потрібних для розбиття: екрани мають власні типи завдання. */
export type ListTask = Pick<Task, 'status' | 'kanbanColumnId' | 'deadline'>;

export interface TaskListSection<T> {
  key: string;
  label: string;
  color?: string;
  tasks: T[];
}

/** Префікс ключа денної секції — щоб дата не зіткнулась з id кастомної колонки. */
const DAY_KEY_PREFIX = 'day:';

/**
 * Чи лишається завдання серед статусних груп (тобто «сьогодні»), чи їде в
 * денну секцію свого дедлайну.
 *
 * Порядок перевірок значущий — вирішує перша, що спрацювала.
 */
export function belongsInStatusGroups(
  task: ListTask,
  columns: TaskStatusColumn[],
  today: Date,
): boolean {
  const id = taskColumnId(task, columns);
  const column = columns.find(item => item.id === id);

  // 1. Завершене — підсумок, а не майбутній день. Виняток у taskVisibleInList
  // існує саме для того, щоб група «Готово» взагалі зʼявилась; відправити
  // закрите завдання з дедлайном 3 вересня в секцію «3 вересня» означало б
  // спорожнити «Готово» і показати зроблене серед майбутнього.
  if (column?.isDone) return true;

  // 2. Робота йде або результат чекає на приймання — дедлайн не має значення.
  // Обидві колонки, а не лише «У процесі»: рівно та пара, що в todayGroups.ts.
  if (id === IN_PROGRESS_COLUMN_ID || id === REVIEW_COLUMN_ID) return true;

  // 3. Беклог — це не «майбутній день», а робота без дати. Секція «Без
  // дедлайну» внизу лишила б базовий екран порожнім у того, хто дедлайни
  // взагалі не ставить.
  if (!task.deadline) return true;

  // 4. Прострочене, яке не винесли у власну секцію (її немає у фільтрі 'done'
  // і в календарі), мусить лишитись у статусах — а не утворити секцію
  // ВЧОРАШНЬОГО дня нижче за сьогоднішні статуси.
  if (isOverdue(task)) return true;

  // 5. Зіпсований рядок дати (буває в даних із синхронізації) не має права
  // створити власну секцію: усі порівняння з Invalid Date дають false, тож
  // без цієї перевірки завдання йшло б у бакет із ключем «day:NaN-NaN-NaN» і
  // підписом «Invalid Date». Місце такому — там, де воно й лежало: у статусах.
  const deadline = new Date(task.deadline);
  if (Number.isNaN(deadline.getTime())) return true;

  return isSameDay(deadline, today);
}

/**
 * Секції списку: спершу статусні групи «на сьогодні», далі майбутнє по днях.
 *
 * @param labelForDate підпис денної секції. Передається ззовні, щоб утиліта
 *   нічого не знала про i18n — так само, як todayGroups бере назви з колонок.
 */
export function buildStatusListSections<T extends ListTask>(
  tasks: readonly T[],
  columns: TaskStatusColumn[],
  today: Date,
  labelForDate: (date: Date) => string,
): TaskListSection<T>[] {
  const statusBuckets = new Map<string, T[]>();
  const dayBuckets = new Map<string, T[]>();

  for (const task of tasks) {
    if (belongsInStatusGroups(task, columns, today)) {
      push(statusBuckets, taskColumnId(task, columns), task);
    } else {
      push(dayBuckets, localDateKey(new Date(task.deadline!)), task);
    }
  }

  // Порядок статусних груп задає дошка, а не порядок появи завдань у списку.
  const sections: TaskListSection<T>[] = orderColumnsForList(columns)
    .filter(column => statusBuckets.has(column.id))
    .map(column => ({
      key: column.id,
      label: column.name,
      color: column.color,
      tasks: statusBuckets.get(column.id) ?? [],
    }));

  // Ключ дня ISO-подібний, тож лексикографічне сортування = хронологічне.
  for (const key of [...dayBuckets.keys()].sort()) {
    const tasksOfDay = dayBuckets.get(key) ?? [];
    sections.push({
      key: DAY_KEY_PREFIX + key,
      label: labelForDate(new Date(tasksOfDay[0].deadline!)),
      tasks: tasksOfDay,
    });
  }

  // Порядок завдань усередині секцій навмисно не чіпаємо: вхід уже
  // відсортований за пріоритетом, і пересортувати його тут означало б тихо
  // перебити вибір користувача.
  return sections;
}

function push<T>(buckets: Map<string, T[]>, key: string, value: T): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(value);
  else buckets.set(key, [value]);
}
