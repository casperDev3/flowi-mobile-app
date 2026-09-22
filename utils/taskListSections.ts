/**
 * utils/taskListSections.ts — розбиття списку завдань у режимі «за статусом».
 *
 * Історія цього файлу — історія одного й того самого промаху, повтореного
 * тричі. Спершу статусні групи збирали ВСЕ підряд: ключем групи був просто
 * стовпчик завдання, без жодної перевірки дати, тож завдання з дедлайном у
 * листопаді сідало в «До роботи» поруч із сьогоднішнім. Потім майбутнє винесли
 * в денні секції — але власна копія правила «сьогодні» лишила в статусах ВСЕ
 * без дедлайну. Потім і беклог, і майбутні дні склали в ЗГОРНУТІ секції-шухляди
 * під статусними групами — і це теж читалось як «ось твої завдання за інші
 * дні», просто дрібнішим шрифтом: заголовки з лічильниками однаково стояли на
 * екрані й однаково тягли на себе увагу.
 *
 * Тому тепер межа різка: у scope 'today' несьогоднішнє в результат НЕ
 * потрапляє взагалі. Дістати його можна одним способом — перемикачем
 * «Сьогодні / Усі» на екрані, і це свідома дія, а не побічний ефект прокрутки.
 *
 * Правило «сьогодні» тут не живе. Воно одне на застосунок — utils/taskToday.ts
 * — і його ж питає екран дня.
 *
 * Що будує цей файл:
 *
 *   scope 'today' (за замовчуванням) — статусні групи з САМОЇ денної роботи.
 *   scope 'all' — усе в статусних групах. Це «дошка цілком», той самий погляд,
 *   що на канбані у вебі.
 *
 * Секцію «Прострочено» ця функція НЕ будує: її окремо збирає екран у шапці
 * списку, і прострочені приходять сюди вже відсіяними. Якщо шапки немає,
 * прострочене просто лишається у своїй статусній групі — воно «сьогоднішнє».
 */
import { orderColumnsForList, personalDisplayColumn, scopedTaskStatusColumn, type TaskStatusColumn } from './taskStatuses';
import { isTodayTask, type TaskScopeMode, type TodayScopeTask } from './taskToday';

/** Мінімум полів, потрібних для розбиття: екрани мають власні типи завдання. */
export type ListTask = TodayScopeTask;

/** Що показуємо: денну роботу, тиждень чи весь список (utils/taskToday.ts inTaskScope). */
export type TaskListScope = TaskScopeMode;

export interface TaskListSection<T> {
  key: string;
  label: string;
  color?: string;
  tasks: T[];
}

export function buildStatusListSections<T extends ListTask>(
  tasks: readonly T[],
  columns: TaskStatusColumn[],
  today: Date,
  scope: TaskListScope = 'today',
  /**
   * Особистий список («Завдання») зводить колонки проєктів до особистих —
   * інакше кожен проєкт давав би власну групу «До роботи». Список ВСЕРЕДИНІ
   * проєкту передає false: там колонки проєкту і є робочим процесом.
   */
  mergeIntoPersonal = false,
): TaskListSection<T>[] {
  const statusBuckets = new Map<string, T[]>();
  const bucketColumns = new Map<string, TaskStatusColumn>();

  for (const task of tasks) {
    // Завершене лишається в статусах ЗАВЖДИ — це підсумок дня, а не робота на
    // майбутнє: відсіяти закрите завдання з дедлайном 12 вересня означало б
    // спорожнити «Готово» і зробити зроблене невидимим. Скільки завершеного
    // сюди взагалі доходить, вирішує фільтр видимості вище по потоку
    // (taskVisibleInList): у режимі «сьогодні» він лишає тільки закрите сьогодні.
    // Відбір за 'week'/'all' (+ «Без дедлайну») уже зробив applyTaskScope
    // вище по потоку; тут повторно перевіряється лише 'today' — щоб друга
    // копія правил тижня/дедлайну не завелась і не розійшлась із першою.
    if (scope !== 'today' || task.status === 'done' || isTodayTask(task, columns, today)) {
      // Скоуп за ВЛАСНИМ projectId завдання (§3.7 «Особисте агрегує»):
      // плоский `columns` містить усі потоки, і без цього задача проєкту зі
      // своєю (`st-<uuid4>`) колонкою не знаходила б її серед особистих.
      const column = mergeIntoPersonal
        ? personalDisplayColumn(task, columns)
        : scopedTaskStatusColumn(task, columns);
      push(statusBuckets, column.id, task);
      if (!bucketColumns.has(column.id)) bucketColumns.set(column.id, column);
    }
  }

  // Порядок статусних груп задає дошка, а не порядок появи завдань у списку.
  // Порядок завдань усередині секцій навмисно не чіпаємо: вхід уже
  // відсортований за пріоритетом, і пересортувати його тут означало б тихо
  // перебити вибір користувача.
  return orderColumnsForList([...bucketColumns.values()])
    .map(column => ({
      key: column.id,
      label: column.name,
      color: column.color,
      tasks: statusBuckets.get(column.id) ?? [],
    }));
}

function push<T>(buckets: Map<string, T[]>, key: string, value: T): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.push(value);
  else buckets.set(key, [value]);
}
