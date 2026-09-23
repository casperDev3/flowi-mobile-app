/**
 * Формули docs/specs/projects-analytics.md §5–§6 на мобільній реалізації
 * (utils/projectStatsMetrics.ts), включно з кутовими випадками §2, і бюджет
 * продуктивності §9.4.
 */
import type { Sprint } from '../utils/sprintUtils';
import { mergeTaskStatusColumns, seedProjectStatusColumns, type TaskStatusColumn } from '../utils/taskStatuses';
import {
  currentSprintCard, isCompletedSprint, isSprintOverdue, portfolioKpi, projectCounters,
  projectCountersMap, sprintBurndown, sprintDays, sprintVelocity, taskStageType, velocityWindow,
  type MetricsTaskLike,
} from '../utils/projectStatsMetrics';

const NOW = new Date(2026, 8, 23, 15, 0); // ср, 23 вер 2026
const at = (day: number, month = 8, hour = 12) => new Date(2026, month, day, hour).toISOString();

const project = { id: 'p1' };
const sprints: Sprint[] = [
  { id: 's-open', projectId: 'p1', name: 'Тиждень 12', createdAt: at(1), startDate: at(21, 8, 0), endDate: at(27, 8, 0) },
  { id: 's-later', projectId: 'p1', name: 'Тиждень 13', createdAt: at(10) },
];

describe('projectCounters — воронка й ознаки', () => {
  const columns: TaskStatusColumn[] = [];
  const tasks: MetricsTaskLike[] = [
    // done у колонці з isDone:false — рахується done за статусом
    { id: 't1', status: 'done', projectId: 'p1', kanbanColumnId: 'status-in-progress' },
    // «в роботі» — за колонкою, хоча status 'active'
    { id: 't2', status: 'active', projectId: 'p1', kanbanColumnId: 'status-in-progress', assigneeId: 'u1', sprintId: 's-open' },
    // на перевірці → todo (§5.5); assigneeId null
    { id: 't3', status: 'active', projectId: 'p1', kanbanColumnId: 'status-review', assigneeId: null, deadline: at(20) },
    // assigneeId '' і невідомий спринт → беклог
    { id: 't4', status: 'active', projectId: 'p1', assigneeId: '', sprintId: 'ghost' },
    // без дедлайну, без виконавця, у спринті
    { id: 't5', status: 'active', projectId: 'p1', sprintId: 's-open', deadline: at(23) },
    // чужий проєкт і особистий — не рахуються
    { id: 't6', status: 'active', projectId: 'p2' },
    { id: 't7', status: 'active' },
  ];

  const counters = projectCounters(project, tasks, sprints, columns, NOW);

  it('воронка сходиться: done + inProgress + todo === total', () => {
    expect(counters).toMatchObject({ total: 5, done: 1, inProgress: 1, todo: 3, open: 4 });
    expect(counters.done + counters.inProgress + counters.todo).toBe(counters.total);
  });

  it('assigned + unassigned === open; null і "" — без виконавця', () => {
    expect(counters.assigned).toBe(1);
    expect(counters.unassigned).toBe(3);
  });

  it('беклог: без sprintId АБО невідомий спринт; лише відкриті', () => {
    expect(counters.backlog).toBe(2); // t3, t4
  });

  it('overdue: лише відкриті з минулою добою; сьогоднішній дедлайн ще не прострочений', () => {
    expect(counters.overdue).toBe(1); // t3
  });

  it('проєктні колонки st-<uuid>: тип — з колонки проєкту; особистий id зводиться за sourceStatusId', () => {
    const own = seedProjectStatusColumns(mergeTaskStatusColumns([]), 'p1');
    const inProgress = own.find(c => c.sourceStatusId === 'status-in-progress')!;
    expect(taskStageType({ id: 'x', status: 'active', projectId: 'p1', kanbanColumnId: inProgress.id }, own)).toBe('in_progress');
    expect(taskStageType({ id: 'y', status: 'active', projectId: 'p1', kanbanColumnId: 'status-in-progress' }, own)).toBe('in_progress');
    expect(taskStageType({ id: 'z', status: 'in_progress', projectId: 'p1' }, own)).toBe('in_progress');
  });

  it('Map-версія дає ті самі числа, що й поштучна; проєкт без задач — нулі', () => {
    const map = projectCountersMap([project, { id: 'empty' }], tasks, sprints, columns, NOW);
    expect(map.get('p1')).toEqual(counters);
    expect(map.get('empty')?.total).toBe(0);
  });
});

describe('спринт картки', () => {
  const tasks: MetricsTaskLike[] = [
    { id: 'a', status: 'done', sprintId: 's-open', projectId: 'p1' },
    { id: 'b', status: 'active', sprintId: 's-open', projectId: 'p1' },
  ];

  it('поточний — найстаріший відкритий; лишилось днів у локальних добах', () => {
    const card = currentSprintCard(project, sprints, tasks, NOW)!;
    expect(card.sprint.id).toBe('s-open');
    expect(card).toMatchObject({ done: 1, total: 2, pct: 50, daysLeft: 4, overdue: false, dated: true });
  });

  it('останній день — daysLeft 0; після — overdue і daysLeft null', () => {
    expect(currentSprintCard(project, sprints, tasks, new Date(2026, 8, 27, 23, 0))!.daysLeft).toBe(0);
    const late = currentSprintCard(project, sprints, tasks, new Date(2026, 8, 29, 9))!;
    expect(late).toMatchObject({ overdue: true, daysLeft: null, overdueDays: 2 });
  });

  it('недатований спринт — daysLeft null, не протермінований; 0 з 0 — 0%', () => {
    const only: Sprint[] = [{ id: 'u', projectId: 'p1', name: 'U', createdAt: at(1) }];
    expect(currentSprintCard(project, only, [], NOW)).toMatchObject({ daysLeft: null, overdue: false, pct: 0, dated: false });
  });

  it('isSprintOverdue: закритий не протермінований', () => {
    const past: Sprint = { id: 'x', projectId: 'p1', name: 'X', createdAt: at(1), startDate: at(1), endDate: at(5) };
    expect(isSprintOverdue(past, NOW)).toBe(true);
    expect(isSprintOverdue({ ...past, closedAt: at(6) }, NOW)).toBe(false);
  });

  it('немає відкритих спринтів — картка без спринта', () => {
    expect(currentSprintCard(project, [], [], NOW)).toBeNull();
  });
});

describe('велосіті', () => {
  const mk = (id: string, start: number, end: number, extra: Partial<Sprint> = {}): Sprint => ({
    id, projectId: 'p1', name: id, createdAt: at(start, 7), startDate: at(start, 7, 0), endDate: at(end, 7, 0), closedAt: at(end, 7, 18), ...extra,
  });
  const closed = [
    mk('s1', 1, 7),
    mk('s2', 8, 21),       // 14 днів
    mk('s3', 22, 22),      // одноденний (артефакт міграції)
    mk('s4', 23, 29),
    { id: 'undated', projectId: 'p1', name: 'U', createdAt: at(1, 7), closedAt: at(2, 7) },
    { id: 'open', projectId: 'p1', name: 'O', createdAt: at(1, 8) },
  ] as Sprint[];
  const doneIn = (sprintId: string, n: number): MetricsTaskLike[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${sprintId}-${i}`, status: 'done', sprintId, projectId: 'p1' }));
  const tasks = [
    ...doneIn('s1', 5), ...doneIn('s2', 14), ...doneIn('s3', 2), ...doneIn('s4', 7),
    { id: 'open-1', status: 'active', projectId: 'p1' },
    { id: 'open-2', status: 'active', projectId: 'p1', sprintId: 'open' },
    { id: 'foreign', status: 'active', projectId: 'p2' },
  ];

  it('sprintDays включно з обома кінцями, мінімум 1; недатований — 0', () => {
    expect(sprintDays(closed[1])).toBe(14);
    expect(sprintDays(closed[2])).toBe(1);
    expect(sprintDays(closed[4])).toBe(0);
  });

  it('velocity — done-задачі спринта (як рядок спринта)', () => {
    expect(sprintVelocity(closed[1], tasks)).toBe(14);
  });

  it('вікно — 3 останні за endDate, у хронологічному порядку; недатовані окремо', () => {
    const w = velocityWindow(closed, tasks, { projectId: 'p1' });
    expect(w.rows.map(r => r.sprint.id)).toEqual(['s2', 's3', 's4']);
    expect(w.sampleSize).toBe(3);
    expect(w.undatedClosed).toBe(1);
    expect(w.avgVelocity).toBeCloseTo((14 + 2 + 7) / 3);
    // тижнева: 14*7/14=7, 2*7/1=14, 7*7/7=7
    expect(w.avgWeeklyVelocity).toBeCloseTo(28 / 3);
    expect(w.remainingWork).toBe(2);
    expect(w.forecastWeeks).toBe(Math.ceil(2 / (28 / 3)));
    expect(isCompletedSprint(closed[4])).toBe(false);
  });

  it('менше VELOCITY_MIN_SPRINTS — прогнозу немає', () => {
    const w = velocityWindow([closed[0]], tasks, { projectId: 'p1' });
    expect(w.sampleSize).toBe(1);
    expect(w.forecastWeeks).toBeNull();
  });

  it('середня тижнева 0 — прогнозу немає (не Infinity)', () => {
    const w = velocityWindow([closed[0], closed[1]], [], { projectId: 'p1', remainingWork: 10 });
    expect(w.forecastWeeks).toBeNull();
  });
});

describe('burndown', () => {
  // 21–27 вер, D = 7, сьогодні 23-тє → todayIndex = 3
  const sprint = sprints[0];
  const tasks: MetricsTaskLike[] = [
    { id: 'early', status: 'done', sprintId: 's-open', history: [{ at: at(15), type: 'done' }] },          // carriedIn → точка 1
    { id: 'd21', status: 'done', sprintId: 's-open', history: [{ at: at(21, 8, 23), type: 'done' }] },
    { id: 'd22', status: 'done', sprintId: 's-open', history: [{ at: at(10), type: 'done' }, { at: at(22), type: 'active' }, { at: at(22, 8, 9), type: 'done' }] },
    { id: 'nolog', status: 'done', sprintId: 's-open' },                                                  // undated
    { id: 'open', status: 'active', sprintId: 's-open', history: [{ at: at(21), type: 'done' }] },        // відкрита назад — не рахується
    { id: 'other', status: 'done', sprintId: 'x', history: [{ at: at(21), type: 'done' }] },
  ];

  it('ідеал від поточного обсягу до 0; факт до сьогодні, далі null', () => {
    const b = sprintBurndown(sprint, tasks, NOW)!;
    expect(b.days).toBe(7);
    expect(b.scope).toBe(5);
    expect(b.ideal).toHaveLength(8);
    expect(b.ideal[0]).toBe(5);
    expect(b.ideal[7]).toBe(0);
    expect(b.todayIndex).toBe(3);
    // точка 1: early + d21 → 3; точка 2: + d22 → 2; точка 3 — без змін
    expect(b.actual).toEqual([5, 3, 2, 2, null, null, null, null]);
    expect(b.undated).toBe(1);
    expect(b.carriedIn).toBe(1);
    expect(b.insufficient).toBe(false);
    expect(b.dayKeys[0]).toBe('2026-09-21');
    expect(b.dayKeys).toHaveLength(7);
  });

  it('undated > scope/2 — графік не малюється', () => {
    const b = sprintBurndown(sprint, [
      { id: '1', status: 'done', sprintId: 's-open' },
      { id: '2', status: 'done', sprintId: 's-open' },
      { id: '3', status: 'active', sprintId: 's-open' },
    ], NOW)!;
    expect(b.insufficient).toBe(true);
  });

  it('недатований спринт — null; одноденний — D = 1', () => {
    expect(sprintBurndown(sprints[1], tasks, NOW)).toBeNull();
    const one: Sprint = { ...sprint, startDate: at(23, 8, 0), endDate: at(23, 8, 0) };
    const b = sprintBurndown(one, [], NOW)!;
    expect(b.days).toBe(1);
    expect(b.ideal).toEqual([0, 0]);
  });

  it('майбутній спринт — факт лише в точці 0', () => {
    const future: Sprint = { ...sprint, startDate: at(1, 9, 0), endDate: at(7, 9, 0) };
    expect(sprintBurndown(future, [], NOW)!.todayIndex).toBe(0);
  });
});

describe('portfolioKpi', () => {
  it('сума карток видимих проєктів + doneByWeek по них', () => {
    const tasks: MetricsTaskLike[] = [
      { id: '1', status: 'done', projectId: 'p1', history: [{ at: at(22), type: 'done' }] },
      { id: '2', status: 'active', projectId: 'p1', kanbanColumnId: 'status-in-progress', deadline: at(1) },
      { id: '3', status: 'active', projectId: 'p2', assigneeId: 'u' },
      { id: '4', status: 'done', projectId: 'hidden', history: [{ at: at(22), type: 'done' }] },
    ];
    const kpi = portfolioKpi([{ id: 'p1' }, { id: 'p2' }], tasks, [], [], NOW);
    expect(kpi).toMatchObject({ projects: 2, total: 3, done: 1, pct: 33, inProgress: 1, overdue: 1, unassigned: 1 });
    expect(kpi.weekly.total).toBe(1);
    expect(kpi.avgWeekly).toBeCloseTo(1 / 8);
  });

  it('порожній портфель — 0%, не NaN', () => {
    expect(portfolioKpi([], [], [], [], NOW).pct).toBe(0);
  });
});

describe('бюджет продуктивності (§9.4)', () => {
  const projects = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}` }));
  const bigSprints: Sprint[] = Array.from({ length: 200 }, (_, i) => ({
    id: `s${i}`, projectId: `p${i % 40}`, name: `S${i}`, createdAt: at(1),
    startDate: new Date(2026, 0, 1 + i).toISOString(), endDate: new Date(2026, 0, 28 + i).toISOString(),
    ...(i % 2 ? { closedAt: new Date(2026, 1, 1 + i).toISOString() } : {}),
  }));
  const bigTasks: MetricsTaskLike[] = Array.from({ length: 20_000 }, (_, i) => ({
    id: `t${i}`,
    status: i % 3 === 0 ? 'done' : 'active',
    projectId: `p${i % 40}`,
    sprintId: i % 5 ? `s${i % 200}` : undefined,
    kanbanColumnId: i % 2 ? 'status-in-progress' : undefined,
    assigneeId: i % 4 ? 'u' : null,
    deadline: new Date(2026, 8, 1 + (i % 60)).toISOString(),
    history: i % 3 === 0 ? [{ at: new Date(2026, 8, 1 + (i % 22)).toISOString(), type: 'done' }] : undefined,
  }));
  const columns = mergeTaskStatusColumns([]);

  it('портфель + усі лічильники ≤ 120 мс', () => {
    const started = performance.now();
    const counters = projectCountersMap(projects, bigTasks, bigSprints, columns, NOW);
    portfolioKpi(projects, bigTasks, bigSprints, columns, NOW, counters);
    expect(performance.now() - started).toBeLessThan(120);
  });

  it('burndown одного спринта (300 задач, 28 днів) ≤ 5 мс', () => {
    const sprint: Sprint = { id: 'b', projectId: 'p0', name: 'B', createdAt: at(1), startDate: at(1, 8, 0), endDate: at(28, 8, 0) };
    const own = bigTasks.slice(0, 300).map(task => ({ ...task, sprintId: 'b' }));
    sprintBurndown(sprint, own, NOW); // прогрів JIT
    const started = performance.now();
    sprintBurndown(sprint, own, NOW);
    expect(performance.now() - started).toBeLessThan(5);
  });

  it('velocityWindow (200 спринтів) ≤ 10 мс', () => {
    velocityWindow(bigSprints, bigTasks, { projectId: 'p1' });
    const started = performance.now();
    velocityWindow(bigSprints, bigTasks, { projectId: 'p1' });
    expect(performance.now() - started).toBeLessThan(10);
  });
});
