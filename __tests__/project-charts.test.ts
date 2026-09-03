/**
 * __tests__/project-charts.test.ts — агрегації графіків проєктів.
 *
 * Тести дослівно повторюють веб (flowi-web-app/lib/project-charts.test.mjs) —
 * і це головне, заради чого вони тут. utils/projectCharts.ts є дзеркалом, а
 * дзеркало без спільного набору перевірок розходиться мовчки: обидва клієнти
 * малюють графік, обидва виглядають правдоподібно, і котрий із них бреше —
 * невидно доти, доки хтось не звірить два екрани вручну.
 *
 * Наприкінці — кілька тестів, яких у вебі немає: вони стережуть саме ті два
 * місця, де мобільний навмисно відходить від дзеркала (локалізовані підписи
 * місяців і запасний колір смуги замість CSS-змінної).
 */

import {
  buildGantt,
  CHART_WEEKS,
  columnDistribution,
  deadlineLoad,
  doneByWeek,
  GANTT_FALLBACK_COLOR,
  tasksForProjects,
  timeByProject,
  trackedSeconds,
  weekLabel,
  type ChartProjectLike,
  type ChartTaskLike,
} from '../utils/projectCharts';
import { IN_PROGRESS_COLUMN_ID, mergeTaskStatusColumns } from '../utils/taskStatuses';

// Середа, щоб тиждень не збігався з добою і зсув до понеділка був видимий.
const NOW = new Date(2026, 7, 26, 9, 0, 0); // 26 серпня 2026, середа
const COLUMNS = mergeTaskStatusColumns([]);

const day = (offset: number, hour = 12): string => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offset);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const task = (over: Partial<ChartTaskLike> = {}): ChartTaskLike => ({
  id: 't',
  title: 'Задача',
  status: 'active',
  projectId: 'p1',
  ...over,
});

const doneEvent = (offset: number) => ({ at: day(offset), type: 'done' });
const project = (over: Partial<ChartProjectLike> = {}): ChartProjectLike => ({
  id: 'p1', name: 'Flowi', color: '#7C3AED', ...over,
});

// ─── Відбір ───────────────────────────────────────────────────────────────────

describe('відбір задач', () => {
  it('бере задачі перелічених проєктів і лише їх', () => {
    const tasks = [
      task({ id: 'a', projectId: 'p1' }),
      task({ id: 'b', projectId: 'p2' }),
      task({ id: 'c', projectId: undefined }),
    ];
    expect(tasksForProjects(tasks, ['p1']).map(t => t.id)).toEqual(['a']);
    expect(tasksForProjects(tasks, ['p1', 'p2']).map(t => t.id)).toEqual(['a', 'b']);
    // Задача без проєкту не «нічия»: у жоден зріз вона не потрапляє.
    expect(tasksForProjects(tasks, [])).toEqual([]);
  });
});

// ─── 1. Колонки дошки ─────────────────────────────────────────────────────────

describe('columnDistribution', () => {
  it('іде в порядку дошки, а не за спаданням', () => {
    // Єдине місце, де тест НЕ дослівний до веба, і різниця не в дзеркалі, а в
    // самій моделі даних: у веба є третій статус 'in_progress', а мобільний
    // тримає «у процесі» колонкою (Status тут — лише 'active' | 'done').
    // Правило «яка колонка в задачі» на обох клієнтах живе в taskColumnId і
    // враховує цю різницю; columnDistribution лише питає його.
    const tasks = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'done' }),
      task({ id: 'c', status: 'done' }),
      task({ id: 'd', kanbanColumnId: IN_PROGRESS_COLUMN_ID }),
    ];
    const slices = columnDistribution(tasks, COLUMNS);
    // Воронка читається зліва направо, тож порядок — бойовий.
    expect(slices.map(slice => slice.key)).toEqual(COLUMNS.map(column => column.id));
    expect(slices.map(slice => slice.value)).toEqual([0, 1, 0, 3]);
  });

  it('лишає порожні колонки в ряді', () => {
    const slices = columnDistribution([task({ status: 'done' })], COLUMNS);
    expect(slices).toHaveLength(COLUMNS.length);
    expect(slices.filter(slice => slice.value === 0)).toHaveLength(COLUMNS.length - 1);
  });

  it('дає частки на одиницю й не ділить на нуль', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' }), task({ id: 'c', status: 'done' })];
    const slices = columnDistribution(tasks, COLUMNS);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBe(1);

    const empty = columnDistribution([], COLUMNS);
    expect(empty.every(slice => slice.share === 0 && slice.value === 0)).toBe(true);
  });

  it('бере колір колонки з дошки', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'status-active', name: 'До роботи', color: '#123456', position: 0, isDone: false },
    ]);
    const slice = columnDistribution([task()], columns).find(item => item.key === 'status-active');
    expect(slice?.color).toBe('#123456');
  });

  it('визначає колонку задачі так само, як дошка', () => {
    // kanbanColumnId суперечить статусу — виграє статус, як у taskColumnId.
    const slices = columnDistribution(
      [task({ id: 'a', status: 'done', kanbanColumnId: 'status-active' })],
      COLUMNS,
    );
    expect(slices.find(slice => slice.key === 'status-done')?.value).toBe(1);
    expect(slices.find(slice => slice.key === 'status-active')?.value).toBe(0);
  });
});

// ─── 2. Виконано по тижнях ────────────────────────────────────────────────────

describe('doneByWeek', () => {
  it('дає ряд сталої довжини, що закінчується поточним тижнем', () => {
    const result = doneByWeek([], CHART_WEEKS, NOW);
    expect(result.weeks).toHaveLength(CHART_WEEKS);
    expect(result.weeks.filter(week => week.current)).toHaveLength(1);
    expect(result.weeks[CHART_WEEKS - 1].current).toBe(true);
    // Тиждень починається з понеділка — 24 серпня, а не з неділі.
    expect(result.weeks[CHART_WEEKS - 1].weekStart).toBe('2026-08-24');
  });

  it('лишає порожні тижні в ряді нулями', () => {
    const result = doneByWeek([task({ status: 'done', history: [doneEvent(0)] })], 4, NOW);
    expect(result.weeks.map(week => week.count)).toEqual([0, 0, 0, 1]);
  });

  it('рахує лише задачі, які зараз done', () => {
    const tasks = [
      task({ id: 'a', status: 'done', history: [doneEvent(-1)] }),
      // Відкрита назад: подія в журналі є, але задача не закрита.
      task({ id: 'b', status: 'active', history: [doneEvent(-1)] }),
    ];
    // Інакше сума стовпчиків розійшлася б із лічильником картки проєкту.
    expect(doneByWeek(tasks, CHART_WEEKS, NOW).total).toBe(1);
  });

  it('бере останню подію done, а не першу', () => {
    const result = doneByWeek([task({ status: 'done', history: [doneEvent(-40), doneEvent(-1)] })], CHART_WEEKS, NOW);
    expect(result.weeks[CHART_WEEKS - 1].count).toBe(1);
    expect(result.earlier).toBe(0);
  });

  it('завершену без події done відносить в undated, а не в стовпчик', () => {
    const tasks = [
      task({ id: 'a', status: 'done' }),
      task({ id: 'b', status: 'done', history: [{ at: day(-1), type: 'edited' }] }),
    ];
    const result = doneByWeek(tasks, CHART_WEEKS, NOW);
    // updatedAt зсувається від будь-якої правки — це не дата завершення.
    expect(result.total).toBe(0);
    expect(result.undated).toBe(2);
  });

  it('закрите раніше за вікно йде в earlier, а не в перший стовпчик', () => {
    const result = doneByWeek([task({ status: 'done', history: [doneEvent(-200)] })], CHART_WEEKS, NOW);
    expect(result.earlier).toBe(1);
    expect(result.total).toBe(0);
    expect(result.weeks[0].count).toBe(0);
  });

  it('не валиться на зіпсованій даті в журналі', () => {
    const result = doneByWeek([task({ status: 'done', history: [{ at: 'не-дата', type: 'done' }] })], CHART_WEEKS, NOW);
    expect(result.undated).toBe(1);
    expect(result.total).toBe(0);
  });

  it('підписує тиждень числом і коротким місяцем', () => {
    expect(weekLabel('2026-08-24')).toBe('24 сер');
    expect(weekLabel('2026-01-05')).toBe('5 січ');
  });
});

// ─── 3. Витрачений час ────────────────────────────────────────────────────────

describe('timeByProject', () => {
  const entry = (duration: number) => [{ duration }];

  it('сумує сесії задачі й ігнорує биті записи', () => {
    expect(trackedSeconds({ timeEntries: [{ duration: 600 }, { duration: -5 }, { duration: Number.NaN }, { duration: 300 }] })).toBe(900);
    expect(trackedSeconds({})).toBe(0);
  });

  it('сортує за спаданням і дає частки', () => {
    const projects = [project({ id: 'p1', name: 'Flowi' }), project({ id: 'p2', name: 'Сайт' })];
    const tasks = [
      task({ id: 'a', projectId: 'p1', timeEntries: entry(600) }),
      task({ id: 'b', projectId: 'p1', timeEntries: entry(600) }),
      task({ id: 'c', projectId: 'p2', timeEntries: entry(900) }),
    ];
    const slices = timeByProject(projects, tasks);
    expect(slices.map(slice => slice.key)).toEqual(['p1', 'p2']);
    expect(slices.map(slice => slice.value)).toEqual([1200, 900]);
    expect(Math.round(slices[0].share * 100)).toBe(57);
    expect(slices[0].color).toBe('#7C3AED');
  });

  it('не показує проєкт без жодної сесії', () => {
    const projects = [project({ id: 'p1' }), project({ id: 'p2', name: 'Порожній' })];
    const tasks = [
      task({ id: 'a', projectId: 'p1', timeEntries: entry(60) }),
      task({ id: 'b', projectId: 'p2' }),
    ];
    expect(timeByProject(projects, tasks).map(slice => slice.key)).toEqual(['p1']);
  });

  it('не приписує нікому час задач без проєкту', () => {
    const tasks = [task({ id: 'a', projectId: undefined, timeEntries: entry(999) })];
    expect(timeByProject([project({ id: 'p1' })], tasks)).toEqual([]);
  });
});

// ─── 4. Дедлайни попереду ─────────────────────────────────────────────────────

describe('deadlineLoad', () => {
  it('починає ряд поточним тижнем і йде вперед', () => {
    const result = deadlineLoad([], CHART_WEEKS, NOW);
    expect(result.weeks).toHaveLength(CHART_WEEKS);
    expect(result.weeks[0].current).toBe(true);
    expect(result.weeks[0].weekStart).toBe('2026-08-24');
    expect(result.weeks[CHART_WEEKS - 1].weekStart).toBe('2026-10-12');
  });

  it('не зливає прострочене з першим стовпчиком', () => {
    const tasks = [
      task({ id: 'a', deadline: day(-30) }),
      task({ id: 'b', deadline: day(-1) }),
      task({ id: 'c', deadline: day(1) }),
    ];
    const result = deadlineLoad(tasks, CHART_WEEKS, NOW);
    // Борг не має ховатись усередині плану.
    expect(result.overdue).toBe(2);
    expect(result.weeks[0].count).toBe(1);
    expect(result.total).toBe(1);
  });

  it('вважає вчорашній дедлайн простроченим, хоч тиждень і поточний', () => {
    // Вівторок 25 серпня лежить у тому самому тижні, що й середа 26-го, — але
    // на картці проєкту він уже червоний, і два екрани мусять казати одне.
    const result = deadlineLoad([task({ deadline: day(-1) })], CHART_WEEKS, NOW);
    expect(result.overdue).toBe(1);
    expect(result.weeks[0].count).toBe(0);
  });

  it('лишає сьогоднішній дедлайн у поточному тижні', () => {
    const result = deadlineLoad([task({ deadline: day(0) })], CHART_WEEKS, NOW);
    expect(result.overdue).toBe(0);
    expect(result.weeks[0].count).toBe(1);
  });

  it('не роздуває останній стовпчик далекими дедлайнами', () => {
    const result = deadlineLoad([task({ deadline: day(200) })], CHART_WEEKS, NOW);
    expect(result.beyond).toBe(1);
    expect(result.weeks[CHART_WEEKS - 1].count).toBe(0);
  });

  it('не бере завершені та задачі без дедлайну', () => {
    const tasks = [
      task({ id: 'a', status: 'done', deadline: day(3) }),
      task({ id: 'b', status: 'active' }),
      task({ id: 'c', status: 'active', deadline: 'не-дата' }),
    ];
    const result = deadlineLoad(tasks, CHART_WEEKS, NOW);
    expect(result.total).toBe(0);
    // Бита дата — це та сама відсутність дати.
    expect(result.undated).toBe(2);
  });
});

// ─── 5. Гантт ─────────────────────────────────────────────────────────────────

describe('buildGantt', () => {
  const projects = [project({ id: 'p1', name: 'Flowi', color: '#7C3AED' })];

  it('позначає справжню startDate і вигаданий початок по-різному', () => {
    const tasks = [
      task({ id: 'a', title: 'Зі стартом', startDate: day(-20), deadline: day(-10), createdAt: day(-60) }),
      task({ id: 'b', title: 'Без старту', createdAt: day(-30), deadline: day(-5) }),
    ];
    const chart = buildGantt(tasks, projects, { now: NOW });
    const byId = new Map(chart.rows.map(row => [row.taskId, row]));
    expect(byId.get('a')?.startSource).toBe('startDate');
    expect(byId.get('b')?.startSource).toBe('createdAt');
    // Рахунок вигаданих смуг потрібен легенді.
    expect(chart.estimated).toBe(1);
    expect(byId.get('a')?.start).toBe(day(-20));
  });

  it('без startDate бере початок із дати створення', () => {
    const chart = buildGantt([task({ id: 'a', createdAt: day(-30), deadline: day(0) })], projects, { now: NOW });
    expect(chart.rows[0].start).toBe(day(-30));
    // Саме та завищена тривалість, про яку попереджає легенда.
    expect(chart.rows[0].days).toBe(30);
  });

  it('не малює задачу без жодної дати початку, але й не ховає її мовчки', () => {
    const chart = buildGantt(
      [task({ id: 'a', deadline: day(3) }), task({ id: 'b', createdAt: day(-5) })],
      projects,
      { now: NOW },
    );
    expect(chart.rows.map(row => row.taskId)).toEqual(['b']);
    expect(chart.skipped).toBe(1);
  });

  it('бере кінець смуги в порядку дедлайн → факт завершення → «досі йде»', () => {
    const tasks = [
      task({ id: 'a', createdAt: day(-10), deadline: day(-2) }),
      task({ id: 'b', createdAt: day(-10), status: 'done', history: [doneEvent(-3)] }),
      task({ id: 'c', createdAt: day(-10) }),
    ];
    const chart = buildGantt(tasks, projects, { now: NOW });
    const byId = new Map(chart.rows.map(row => [row.taskId, row]));
    expect(byId.get('a')?.endSource).toBe('deadline');
    expect(byId.get('b')?.endSource).toBe('done');
    expect(byId.get('c')?.endSource).toBe('open');
    // «Зараз» на Гантті — це початок сьогоднішньої доби: одиниця шкали доба, а
    // мілісекунди лише змушували б смуги «дихати» на кожному ререндері.
    expect(byId.get('c')?.end).toBe(new Date(2026, 7, 26).toISOString());
  });

  it('не малює смугу назад, коли дедлайн раніше за початок', () => {
    const chart = buildGantt([task({ id: 'a', createdAt: day(-2), deadline: day(-20) })], projects, { now: NOW });
    expect(chart.rows[0].width).toBeGreaterThanOrEqual(0);
    expect(chart.rows[0].end).toBe(chart.rows[0].start);
    // Джерело кінця лишається справжнім — воно йде в підпис для читалки.
    expect(chart.rows[0].endSource).toBe('deadline');
  });

  it('дає зсув і ширину частками вікна, а не пікселями', () => {
    const tasks = [
      task({ id: 'a', startDate: day(-40), deadline: day(-20) }),
      task({ id: 'b', startDate: day(-20), deadline: day(0) }),
    ];
    const chart = buildGantt(tasks, projects, { now: NOW });
    expect(chart.rows[0].offset).toBe(0);
    expect(Math.abs(chart.rows[0].width - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(chart.rows[1].offset - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(chart.rows[1].offset + chart.rows[1].width - 1)).toBeLessThan(0.01);
  });

  it('ставить рядки в хронологічному порядку', () => {
    const tasks = [
      task({ id: 'late', startDate: day(-5), deadline: day(0) }),
      task({ id: 'early', startDate: day(-50), deadline: day(-40) }),
      task({ id: 'mid', startDate: day(-20), deadline: day(-10) }),
    ];
    expect(buildGantt(tasks, projects, { now: NOW }).rows.map(row => row.taskId))
      .toEqual(['early', 'mid', 'late']);
  });

  it('обрізає за лімітом, повідомляє залишок і звужує вікно по видимих', () => {
    const tasks = Array.from({ length: 5 }, (_, index) =>
      task({ id: `t${index}`, startDate: day(-50 + index * 10), deadline: day(-45 + index * 10) }));
    const chart = buildGantt(tasks, projects, { now: NOW, maxRows: 2 });
    expect(chart.rows).toHaveLength(2);
    expect(chart.hidden).toBe(3);
    // Праворуч немає порожнечі під смуги, яких не показано.
    expect(chart.to).toBe(day(-35));
  });

  it('розтягує вузьке вікно до мінімальної ширини, не роздуваючи смугу', () => {
    const chart = buildGantt([task({ id: 'a', startDate: day(0), deadline: day(0) })], projects, { now: NOW });
    // Інакше одноденні смуги збиваються в риску біля лівого краю.
    expect(chart.days).toBeGreaterThanOrEqual(14);
    expect(chart.rows[0].width).toBeLessThan(0.05);
    // Робота на день — це один день, а не нуль.
    expect(chart.rows[0].days).toBe(1);
  });

  it('показує «сьогодні» лише коли воно у вікні', () => {
    const inside = buildGantt([task({ id: 'a', startDate: day(-10), deadline: day(10) })], projects, { now: NOW });
    expect(inside.todayOffset).toBeGreaterThan(0.45);
    expect(inside.todayOffset).toBeLessThan(0.55);

    const past = buildGantt([task({ id: 'a', startDate: day(-400), deadline: day(-300) })], projects, { now: NOW });
    // Шкалу не перекошує заради позначки.
    expect(past.todayOffset).toBeNull();
  });

  it('на порожньому наборі дає порожній Гантт, а не падіння', () => {
    const chart = buildGantt([], projects, { now: NOW });
    expect(chart.rows).toEqual([]);
    expect(chart.estimated).toBe(0);
    expect(chart.hidden).toBe(0);
    expect(chart.days).toBeGreaterThanOrEqual(14);
    expect(chart.todayOffset).not.toBeNull();
  });

  it('фарбує смугу кольором проєкту, а поза проєктом — запасним акцентом', () => {
    const tasks = [
      task({ id: 'a', projectId: 'p1', startDate: day(-10), deadline: day(0) }),
      task({ id: 'b', projectId: undefined, startDate: day(-10), deadline: day(0) }),
    ];
    const byId = new Map(buildGantt(tasks, projects, { now: NOW }).rows.map(row => [row.taskId, row]));
    expect(byId.get('a')?.color).toBe('#7C3AED');
    expect(byId.get('b')?.color).toBe(GANTT_FALLBACK_COLOR);
  });

  it('ставить позначки на початки місяців усередині вікна, січень підписує роком', () => {
    const chart = buildGantt(
      [task({ id: 'a', startDate: '2025-11-15T12:00:00.000Z', deadline: '2026-02-10T12:00:00.000Z' })],
      projects,
      { now: NOW },
    );
    expect(chart.ticks.map(tick => tick.label)).toEqual(['гру', '2026', 'лют']);
    expect(chart.ticks.every(tick => tick.offset > 0 && tick.offset < 1)).toBe(true);
  });
});

// ─── Мобільні відхилення від дзеркала ─────────────────────────────────────────

describe('відхилення мобільного від веб-дзеркала', () => {
  it('запасний колір смуги — справжній HEX, а не CSS-змінна', () => {
    // var(--primary) у RN дійшов би до стилю як «немає кольору», і смуга
    // задачі поза проєктом просто зникла б.
    expect(GANTT_FALLBACK_COLOR).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('підписи місяців приходять зі словника — інтерфейс двомовний', () => {
    const en = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    expect(weekLabel('2026-08-24', en)).toBe('24 Aug');

    const chart = buildGantt(
      [{ id: 'a', title: 'T', status: 'active', startDate: '2025-11-15T12:00:00.000Z', deadline: '2026-02-10T12:00:00.000Z' }],
      [],
      { now: NOW, months: en },
    );
    // Січень усе одно рік, а не назва місяця: на шкалі в кілька років
    // дванадцять однакових «Jan» не відрізнити.
    expect(chart.ticks.map(tick => tick.label)).toEqual(['Dec', '2026', 'Feb']);
  });

  it('числа не залежать від мови підписів', () => {
    const tasks = [task({ id: 'a', startDate: day(-40), deadline: day(-20) })];
    const uk = buildGantt(tasks, [project()], { now: NOW });
    const en = buildGantt(tasks, [project()], { now: NOW, months: ['Jan'] });
    expect({ ...uk, ticks: [] }).toEqual({ ...en, ticks: [] });
  });
});
