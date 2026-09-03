/**
 * utils/projectCharts.ts — агрегації для аналітики проєктів.
 *
 * ДЗЕРКАЛО веб-модуля flowi-web-app/lib/project-charts.ts, а не друга
 * реалізація. Будь-яка правка формули потрібна В ОБОХ місцях — так само, як у
 * парі utils/taskToday.ts ↔ lib/task-today.ts і utils/projectStats.ts ↔
 * lib/project-stats.ts. Ціна розходження тут вища за звичайну: якщо телефон і
 * браузер покажуть різні цифри по одному проєкту, обидва графіки стають
 * непридатними — не видно, котрий бреше.
 *
 * Тут лежить УСЯ арифметика графіків панелі проєктів: компоненти отримують
 * готові числа й лише малюють. Правило «що саме вважається зробленим на цьому
 * тижні» треба мати змогу перевірити тестом без рендеру, а не вигрібати його
 * з JSX.
 *
 * Наскрізне правило модуля: у графік потрапляє лише те, для чого в даних Є
 * дата. Усе, що дати не має, не домальовується й не вгадується — воно
 * повертається окремим лічильником (`undated`, `earlier`, `beyond`), щоб
 * екран міг сказати про нього словами. Графік, який мовчки викидає третину
 * записів, гірший за графік із приміткою.
 *
 * Два місця, де мобільний навмисно відходить від веба, — і обидва про подання,
 * а не про числа:
 *   • підписи місяців приходять параметром зі словника (див. `months`), бо
 *     інтерфейс двомовний, а веб україномовний і тримає їх вшитими;
 *   • запасний колір смуги Гантта — справжній HEX, а не `var(--primary)`:
 *     CSS-змінних у RN не існує, і рядок із них дійшов би до стилю як «немає
 *     кольору».
 */

import { taskColumnId, type TaskStatusColumn } from './taskStatuses';
import type { Status } from './taskUtils';

/**
 * Типи навмисно структурні, а не імпортовані з екрана: панель проєктів,
 * список завдань і архів оголошують власні звужені інтерфейси задачі, і
 * вимагати від них повний Task означало б тягнути сюди підзавдання й
 * нагадування, до яких графіки не мають стосунку. Так само зроблено в
 * projectStats.ts.
 */
export interface ChartTaskLike {
  id: string;
  title: string;
  status: string;
  kanbanColumnId?: string;
  projectId?: string;
  createdAt?: string;
  startDate?: string;
  deadline?: string;
  timeEntries?: { duration: number }[];
  history?: { at: string; type: string }[];
}

export interface ChartProjectLike {
  id: string;
  name: string;
  color: string;
}

/**
 * Стандартні короткі місяці — рівно ті, що вшиті у веб-модулі.
 *
 * Вони лишаються значенням за замовчуванням, щоб дзеркальні тести могли
 * звіряти підписи з вебом дослівно. Живий екран передає сюди `tr.monthsShort`
 * і отримує підписи мовою інтерфейсу.
 */
export const MONTHS_SHORT: readonly string[] = [
  'січ', 'лют', 'бер', 'кві', 'тра', 'чер',
  'лип', 'сер', 'вер', 'жов', 'лис', 'гру',
];

const DAY_MS = 86_400_000;

/** Локальна доба як YYYY-MM-DD. Ключ, що сортується рядковим порівнянням. */
function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Локальна календарна доба як YYYYMMDD — порівнюється як ціле. */
function dayNumber(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Початок локальної доби. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Понеділок тижня, до якого належить дата.
 *
 * Тиждень починається з понеділка, а не з неділі: так рахує і календар нарад,
 * і групування «цього тижня» в задачах, і зсув на день зробив би підписи двох
 * екранів несумісними.
 */
function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  // getDay(): 0 — неділя, тож зсув рахується від понеділка окремо.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/**
 * Підпис тижня для осі: «12 сер». Дата — понеділок цього тижня.
 *
 * Розбір іде по рядку, а не через `new Date(weekStart)`: ISO-дата без часу
 * читається як UTC, і в поясі за Гринвічем підпис зʼїхав би на день назад.
 */
export function weekLabel(weekStart: string, months: readonly string[] = MONTHS_SHORT): string {
  const [, month, day] = weekStart.split('-').map(Number);
  return `${day} ${months[(month || 1) - 1]}`;
}

/** Скільки тижнів показують графіки за замовчуванням. */
export const CHART_WEEKS = 8;

export interface WeekPoint {
  /** Понеділок тижня як локальна доба YYYY-MM-DD. */
  weekStart: string;
  /** Скільки задач припало на цей тиждень. */
  count: number;
  /** Тиждень, у якому лежить «зараз». Рівно один у кожному ряді. */
  current: boolean;
}

/**
 * Ряд із рівно `weeks` порожніх тижнів, останній з яких містить `now`
 * (напрямок 'back') або перший (напрямок 'forward').
 *
 * Тижні без записів НЕ пропускаються, на відміну від рядів здоровʼя: там
 * порожній день означає «не записали», а тут — «нічого не закрили», і це
 * повноцінна відповідь, яку видно як провал у ряді.
 */
function emptyWeeks(weeks: number, now: Date, direction: 'back' | 'forward'): WeekPoint[] {
  const anchor = startOfWeek(now);
  const count = Math.max(1, Math.floor(weeks));
  return Array.from({ length: count }, (_, index) => {
    const start = new Date(anchor);
    const shift = direction === 'back' ? index - (count - 1) : index;
    start.setDate(start.getDate() + shift * 7);
    return { weekStart: dayKey(start), count: 0, current: shift === 0 };
  });
}

/** Задачі перелічених проєктів. Задачі без проєкту сюди не потрапляють. */
export function tasksForProjects<T extends ChartTaskLike>(
  tasks: T[],
  projectIds: Iterable<string>,
): T[] {
  const wanted = new Set(projectIds);
  return tasks.filter(task => task.projectId !== undefined && wanted.has(task.projectId));
}

// ─── 1. Розподіл задач за колонками дошки ────────────────────────────────────

export interface ColumnSlice {
  /** id колонки. */
  key: string;
  label: string;
  /** Скільки задач стоїть у колонці. */
  value: number;
  /** Частка від усіх задач, 0..1. */
  share: number;
  /** Колір колонки з дошки — той самий, що на канбані. */
  color: string;
}

/**
 * Скільки задач стоїть у кожній колонці дошки.
 *
 * Порядок — БОЙОВИЙ порядок дошки, а не за спаданням величини, як у витратах.
 * Причина: колонки — це етапи потоку, і ряд «До роботи → У процесі → На
 * перевірці → Готово» читається як воронка. Пересортувавши його за розміром,
 * ми зекономили б погляду півсекунди й забрали єдине, заради чого цей графік
 * узагалі є.
 *
 * Порожні колонки лишаються в ряді з тієї ж причини: «на перевірці нуль» — це
 * відповідь, а діра в потоці — ні.
 *
 * Колонку задачі визначає taskColumnId, а не поле kanbanColumnId напряму: воно
 * буває або порожнім, або таким, що суперечить статусу, і друга копія цього
 * правила розійшлася б із дошкою.
 */
export function columnDistribution(
  tasks: ChartTaskLike[],
  columns: TaskStatusColumn[],
): ColumnSlice[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    // Каст, а не зведення до 'active' | 'done': status тут рядок, бо екрани
    // тримають власні звужені типи задачі, а віддати taskColumnId уже
    // «випрямлене» значення означало б вирішити за нього. Веб на цьому місці
    // має третій статус ('in_progress'), і якщо він колись дійде сюди —
    // правило мусить побачити його як є, а не як 'active'.
    const id = taskColumnId(
      { status: task.status as Status, kanbanColumnId: task.kanbanColumnId },
      columns,
    );
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const total = tasks.length;
  return columns.map(column => {
    const value = counts.get(column.id) ?? 0;
    return {
      key: column.id,
      label: column.name,
      value,
      share: total ? value / total : 0,
      color: column.color,
    };
  });
}

// ─── 2. Виконано по тижнях ───────────────────────────────────────────────────

export interface DoneByWeek {
  weeks: WeekPoint[];
  /** Разом за вікно. */
  total: number;
  /** Завершені раніше за вікно — у стовпчики не потрапили. */
  earlier: number;
  /**
   * Завершені задачі, у журналі яких немає події 'done'. Дати завершення в них
   * не існує взагалі, тож у графіку їх немає — але сказати про них треба.
   */
  undated: number;
}

/**
 * Коли задачу закрили — САМЕ за журналом, без запасного варіанта.
 *
 * utils/taskUtils.ts має completedAt із відкатом на updatedAt, і там це
 * правильно: питання «чи ще показувати задачу в «Готово» кілька днів» терпить
 * похибку. Графік стверджує інше — «цього тижня закрито сім задач». updatedAt
 * зсувається від БУДЬ-ЯКОЇ правки, тож задача, закрита в липні й перейменована
 * вчора, стала б учорашнім досягненням. Краще чесно винести її в `undated`,
 * ніж підмалювати стовпчик.
 *
 * Береться ОСТАННЯ подія 'done': задачу могли закрити, відкрити назад і
 * закрити знову — актуальне завершення саме останнє.
 */
function doneAt(task: ChartTaskLike): Date | null {
  const events = (task.history ?? []).filter(event => event.type === 'done');
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const at = parseDate(events[index].at);
    if (at) return at;
  }
  return null;
}

/**
 * Скільки задач закрито по тижнях.
 *
 * Рахуються лише задачі, які зараз у статусі done. Відкриту назад задачу з
 * подією 'done' у журналі ми НЕ рахуємо: інакше сума стовпчиків перестала б
 * збігатися з лічильником «done» на картці проєкту, і два числа на одному
 * екрані суперечили б одне одному.
 */
export function doneByWeek(
  tasks: ChartTaskLike[],
  weeks: number = CHART_WEEKS,
  now: Date = new Date(),
): DoneByWeek {
  const points = emptyWeeks(weeks, now, 'back');
  const index = new Map(points.map((point, position) => [point.weekStart, position]));
  const first = points[0].weekStart;

  let total = 0;
  let earlier = 0;
  let undated = 0;

  for (const task of tasks) {
    if (task.status !== 'done') continue;
    const at = doneAt(task);
    if (!at) {
      undated += 1;
      continue;
    }
    const key = dayKey(startOfWeek(at));
    const position = index.get(key);
    if (position === undefined) {
      // Пізніше за останній тиждень бути не може — хіба що годинник пристрою
      // збився вперед. Такий запис теж не наш, і в «раніше» йому не місце.
      if (key < first) earlier += 1;
      continue;
    }
    points[position].count += 1;
    total += 1;
  }

  return { weeks: points, total, earlier, undated };
}

// ─── 3. Витрачений час за проєктами ──────────────────────────────────────────

/**
 * Сума завершених сесій задачі, у секундах.
 *
 * Довжина береться з поля `duration`, а не рахується з startedAt/endedAt: саме
 * duration пише таймер на стопі, і саме воно враховує паузи. Биті значення
 * трактуються як нуль — один зіпсований запис не має перетворювати весь
 * стовпчик на NaN.
 */
export function trackedSeconds(task: Pick<ChartTaskLike, 'timeEntries'>): number {
  return (task.timeEntries ?? []).reduce((sum, entry) => {
    const value = Number(entry?.duration);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

export interface ProjectTimeSlice {
  /** id проєкту. */
  key: string;
  label: string;
  /** Відпрацьовані секунди. */
  value: number;
  share: number;
  /** Колір проєкту — той самий, що на картці. */
  color: string;
}

/**
 * Куди йшов час: сума сесій задач кожного проєкту, за спаданням.
 *
 * Проєкти з нулем НЕ показуються — на відміну від колонок дошки. Різниця
 * змістовна: порожня колонка — це стан потоку, а проєкт без жодної сесії
 * просто нічого не каже про те, куди йшов час, і лише розтягує список.
 *
 * Час, витрачений на задачі БЕЗ проєкту, сюди не входить: у цього графіка
 * вісь — проєкт, і рядок «без проєкту» відповідав би на інше питання.
 */
export function timeByProject(
  projects: ChartProjectLike[],
  tasks: ChartTaskLike[],
): ProjectTimeSlice[] {
  const seconds = new Map<string, number>();
  for (const task of tasks) {
    if (!task.projectId) continue;
    const value = trackedSeconds(task);
    if (!value) continue;
    seconds.set(task.projectId, (seconds.get(task.projectId) ?? 0) + value);
  }

  const total = [...seconds.values()].reduce((sum, value) => sum + value, 0);
  return projects
    .flatMap(project => {
      const value = seconds.get(project.id) ?? 0;
      return value
        ? [{
            key: project.id,
            label: project.name,
            value,
            share: total ? value / total : 0,
            color: project.color,
          }]
        : [];
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'uk-UA'));
}

// ─── 4. Дедлайни попереду ────────────────────────────────────────────────────

export interface DeadlineLoad {
  /** Поточний тиждень і далі вперед. */
  weeks: WeekPoint[];
  /** Разом у вікні. */
  total: number;
  /** Незавершені з дедлайном раніше за поточний тиждень. */
  overdue: number;
  /** Незавершені з дедлайном далі за горизонт. */
  beyond: number;
  /** Незавершені без дедлайну взагалі. */
  undated: number;
}

/**
 * Скільки незавершених задач припадає на найближчі тижні.
 *
 * Прострочене НЕ додається до першого стовпчика. Спокуса є — стовпчик «цього
 * тижня» став би виглядати чесно завантаженим, — але це різні речі:
 * прострочене вже треба було зробити, і зливши його з планом, ми сховали б
 * борг усередині навантаження. Тому воно окремим числом поруч.
 *
 * «Прострочене» рахується по КАЛЕНДАРНІЙ добі, а не по тижню: рівно так його
 * рахують projectStats і isOverdue, і вчорашній дедлайн, який на картці горить
 * червоним, а тут спокійно лежав би в стовпчику «цього тижня», виглядав би як
 * розбіжність двох екранів про ту саму задачу.
 *
 * Окремо йде і те, що за горизонтом: підпихнувши його в останній стовпчик, ми
 * намалювали б неіснуючий сплеск на восьмому тижні.
 */
export function deadlineLoad(
  tasks: ChartTaskLike[],
  weeks: number = CHART_WEEKS,
  now: Date = new Date(),
): DeadlineLoad {
  const points = emptyWeeks(weeks, now, 'forward');
  const index = new Map(points.map((point, position) => [point.weekStart, position]));
  const today = dayNumber(now);

  let total = 0;
  let overdue = 0;
  let beyond = 0;
  let undated = 0;

  for (const task of tasks) {
    if (task.status === 'done') continue;
    const at = parseDate(task.deadline);
    if (!at) {
      undated += 1;
      continue;
    }
    if (dayNumber(at) < today) {
      overdue += 1;
      continue;
    }
    const position = index.get(dayKey(startOfWeek(at)));
    // Після відсіву простроченого лишитись поза рядом можна тільки праворуч:
    // дедлайн сьогодні або пізніше завжди падає в поточний тиждень або далі.
    if (position === undefined) {
      beyond += 1;
      continue;
    }
    points[position].count += 1;
    total += 1;
  }

  return { weeks: points, total, overdue, beyond, undated };
}

// ─── 5. Гантт ────────────────────────────────────────────────────────────────

/**
 * Звідки взявся ПОЧАТОК смуги.
 *
 * `createdAt` — це вигадка, і вона мусить дійти до екрана як окреме значення,
 * а не розчинитися в даті. Гантт саме через це колись і прибрали: startDate не
 * заповнена майже ніде, тож смуга, побудована на даті створення, показує не
 * роботу, а вік запису. Задача, заведена місяць тому й зроблена вчора, малює
 * місячну смугу — і це не помилка розрахунку, а межа даних, яку видно лише
 * тоді, коли клієнт малює такі смуги інакше.
 */
export type GanttStartSource = 'startDate' | 'createdAt';

/**
 * Звідки взявся КІНЕЦЬ смуги: дедлайн, фактичне завершення або «досі йде».
 * `open` означає, що правого краю в даних немає і смуга обрізана «зараз».
 */
export type GanttEndSource = 'deadline' | 'done' | 'open';

export interface GanttRow {
  taskId: string;
  title: string;
  /** Колір проєкту задачі; для задач поза проєктами — нейтральний акцент. */
  color: string;
  /** Межі смуги, ISO. */
  start: string;
  end: string;
  startSource: GanttStartSource;
  endSource: GanttEndSource;
  done: boolean;
  /** Зсув лівого краю у частках вікна, 0..1. */
  offset: number;
  /** Ширина у частках вікна, 0..1. Нуль — цілком нормально: робота на день. */
  width: number;
  /** Тривалість смуги в календарних днях, мінімум 1. */
  days: number;
}

export interface GanttTick {
  /** Перше число місяця всередині вікна, ISO. */
  at: string;
  /** «сер» — короткий місяць; січень підписується роком. */
  label: string;
  offset: number;
}

export interface GanttChart {
  /** Межі вікна, ISO. */
  from: string;
  to: string;
  /** Ширина вікна в днях — з неї компонент рахує ширину під горизонтальний скрол. */
  days: number;
  rows: GanttRow[];
  /** Скільки смуг побудовано на даті створення, тобто на вигаданому початку. */
  estimated: number;
  /** Скільки рядків не вмістилось у ліміт. */
  hidden: number;
  /** Задачі без жодної придатної дати початку — намалювати нічого. */
  skipped: number;
  /** Позиція «сьогодні» у частках вікна; null, коли воно поза вікном. */
  todayOffset: number | null;
  ticks: GanttTick[];
}

/**
 * Стеля рядків.
 *
 * Гантт на півтори сотні смуг — це не діаграма, а шпалери: жоден рядок у ньому
 * не прочитати, а екран росте на кілька екранів скролу. Решту показуємо
 * числом, а не мовчки викидаємо.
 */
export const GANTT_MAX_ROWS = 40;

/**
 * Запасний колір смуги для задачі поза проєктами.
 *
 * Веб ставить сюди `var(--primary)`. У RN CSS-змінних немає, і такий рядок
 * дійшов би до стилю як «немає кольору» — смуга просто зникла б. Тому тут той
 * самий HEX, яким пофарбований акцент екрана проєктів. Це єдина розбіжність із
 * дзеркалом, і вона про подання, а не про числа.
 */
export const GANTT_FALLBACK_COLOR = '#7C3AED';

/** Вужче вікно перетворює всі смуги на риски біля лівого краю. */
const GANTT_MIN_SPAN_DAYS = 14;

/**
 * Одиниця Гантта — ДОБА, тому «зараз» тут округлюється до початку сьогодні.
 *
 * Це не косметика. Зсуви й ширини смуг рахуються в частках вікна, а вікно
 * упирається в «зараз» щоразу, коли в задачі немає ані дедлайну, ані дати
 * завершення. З точністю до мілісекунди ті частки різні на кожному ререндері,
 * тож смуги мікроскопічно «дихали» б, доки екран відкритий (у вебі те саме
 * дає ще й лайку React на розбіжність гідратації). Секунди тут усе одно нічого
 * не показують: смуга завширшки в чверть дня — це один піксель.
 */
function ganttNow(now: Date): number {
  return startOfDay(now).getTime();
}

interface RawRow {
  row: Omit<GanttRow, 'offset' | 'width' | 'days'>;
  startAt: number;
  endAt: number;
}

function ganttRow(task: ChartTaskLike, color: string, nowAt: number): RawRow | null {
  const startDate = parseDate(task.startDate);
  const created = parseDate(task.createdAt);
  const from = startDate ?? created;
  if (!from) return null;

  const deadline = parseDate(task.deadline);
  const finished = task.status === 'done' ? doneAt(task) : null;

  const endSource: GanttEndSource = deadline ? 'deadline' : finished ? 'done' : 'open';
  const rawEnd = deadline ?? finished ?? new Date(nowAt);

  // Дедлайн раніше за початок — не рідкість: задачу заводять уже
  // простроченою. Малювати смугу назад не можна, тож вона стискається в точку
  // на дні початку. Джерело кінця при цьому не підмінюємо: у підписі поруч має
  // бути видно справжню дату.
  const endAt = Math.max(from.getTime(), rawEnd.getTime());

  return {
    startAt: from.getTime(),
    endAt,
    row: {
      taskId: task.id,
      title: task.title,
      color,
      start: from.toISOString(),
      end: new Date(endAt).toISOString(),
      startSource: startDate ? 'startDate' : 'createdAt',
      endSource,
      done: task.status === 'done',
    },
  };
}

function monthTicks(
  from: Date,
  to: Date,
  span: number,
  months: readonly string[],
): GanttTick[] {
  const ticks: GanttTick[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  // Перший місяць пропускаємо: його межа лежить лівіше за вікно або точно на
  // краю, і підпис там наклався б на дату початку шкали.
  cursor.setMonth(cursor.getMonth() + 1);
  const fromAt = from.getTime();

  while (cursor.getTime() < to.getTime()) {
    ticks.push({
      at: cursor.toISOString(),
      // Січень підписуємо роком: інакше на шкалі в кілька років дванадцять
      // однакових «січ» не відрізнити одне від одного.
      label: cursor.getMonth() === 0 ? String(cursor.getFullYear()) : months[cursor.getMonth()],
      offset: (cursor.getTime() - fromAt) / span,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

/**
 * Смуги Гантта для набору задач.
 *
 * Вікно рахується по ВИДИМИХ рядках, а не по всіх: інакше обрізаний ліміт
 * лишав би праворуч порожнечу під смуги, яких на екрані немає.
 *
 * «Сьогодні» у вікно НЕ втягується силоміць. Проєкт, закритий торік, розтягся
 * б до сьогодні порожнім полем на пів екрана; краще чесно не показати
 * позначку, ніж перекосити шкалу заради неї.
 */
export function buildGantt(
  tasks: ChartTaskLike[],
  projects: ChartProjectLike[],
  options: {
    now?: Date;
    maxRows?: number;
    months?: readonly string[];
    /** Колір смуги для задачі поза проєктами. */
    fallbackColor?: string;
  } = {},
): GanttChart {
  const nowAt = ganttNow(options.now ?? new Date());
  const maxRows = options.maxRows ?? GANTT_MAX_ROWS;
  const months = options.months ?? MONTHS_SHORT;
  const fallbackColor = options.fallbackColor ?? GANTT_FALLBACK_COLOR;
  const colors = new Map(projects.map(project => [project.id, project.color]));

  const raw: RawRow[] = [];
  let skipped = 0;
  for (const task of tasks) {
    const built = ganttRow(task, colors.get(task.projectId ?? '') ?? fallbackColor, nowAt);
    if (built) raw.push(built);
    else skipped += 1;
  }

  raw.sort(
    (left, right) =>
      left.startAt - right.startAt ||
      left.endAt - right.endAt ||
      left.row.title.localeCompare(right.row.title, 'uk-UA'),
  );

  const visible = raw.slice(0, Math.max(0, maxRows));
  const hidden = raw.length - visible.length;

  // Порожній Гантт усе одно має вікно: компонент малює шкалу й напис «немає
  // жодної смуги», а не падає на undefined.
  let fromAt = visible.length ? Math.min(...visible.map(item => item.startAt)) : nowAt;
  let toAt = visible.length ? Math.max(...visible.map(item => item.endAt)) : nowAt;

  const minSpan = GANTT_MIN_SPAN_DAYS * DAY_MS;
  if (toAt - fromAt < minSpan) {
    const middle = (fromAt + toAt) / 2;
    fromAt = middle - minSpan / 2;
    toAt = middle + minSpan / 2;
  }
  const span = toAt - fromAt;

  const rows: GanttRow[] = visible.map(item => ({
    ...item.row,
    offset: (item.startAt - fromAt) / span,
    width: (item.endAt - item.startAt) / span,
    // Робота на один день — це один день, а не нуль: у підписі «0 днів»
    // читалося б як відсутність запису.
    days: Math.max(1, Math.round((item.endAt - item.startAt) / DAY_MS)),
  }));

  return {
    from: new Date(fromAt).toISOString(),
    to: new Date(toAt).toISOString(),
    days: Math.max(1, Math.round(span / DAY_MS)),
    rows,
    estimated: rows.filter(row => row.startSource === 'createdAt').length,
    hidden,
    skipped,
    todayOffset: nowAt >= fromAt && nowAt <= toAt ? (nowAt - fromAt) / span : null,
    ticks: monthTicks(new Date(fromAt), new Date(toAt), span, months),
  };
}
