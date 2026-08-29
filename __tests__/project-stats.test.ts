/**
 * __tests__/project-stats.test.ts — метрики проєкту.
 *
 * Половина тестів тут дослівно повторює веб (lib/project-stats.test.mjs) — і
 * це навмисно: саме розходження двох клієнтів у таких формулах у цьому проєкті
 * ловилося вже тричі, і щоразу мовчки.
 */

import {
  compareArchived,
  compareLive,
  projectStats,
  projectTimeline,
  TIMELINE_BUCKETS,
  type ProjectLike,
  type ProjectTaskLike,
} from '../utils/projectStats';

const NOW = new Date('2026-08-29T10:00:00.000Z');
const iso = (d: string) => new Date(d).toISOString();

function project(over: Partial<ProjectLike> & { id: string }): ProjectLike {
  return { name: over.id, color: '#7C3AED', createdAt: iso('2026-01-01'), ...over };
}

function task(over: Partial<ProjectTaskLike> & { id: string }): ProjectTaskLike {
  return { status: 'active', ...over };
}

describe('projectStats', () => {
  const p = project({ id: 'p1' });

  it('порожній проєкт — 0%, а не 100%', () => {
    // Найлегша помилка формули: done/total на нулях дає NaN або 1.
    const s = projectStats(p, [], NOW);
    expect(s.pct).toBe(0);
    expect(s.empty).toBe(true);
  });

  it('рахує зроблене, активне й відсоток', () => {
    const s = projectStats(p, [
      task({ id: '1', projectId: 'p1', status: 'done' }),
      task({ id: '2', projectId: 'p1' }),
      task({ id: '3', projectId: 'p1' }),
      task({ id: '4', projectId: 'other' }),
    ], NOW);
    expect({ total: s.total, done: s.done, active: s.active, pct: s.pct })
      .toEqual({ total: 3, done: 1, active: 2, pct: 33 });
  });

  it('прострочене рахується лише серед НЕЗАВЕРШЕНИХ', () => {
    const s = projectStats(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2026-08-01') }),
      task({ id: '2', projectId: 'p1', deadline: iso('2026-08-01'), status: 'done' }),
    ], NOW);
    expect(s.overdue).toBe(1);
  });

  it('дедлайн СЬОГОДНІ ще не прострочений', () => {
    // Порівняння за календарною добою, а не за міліметрами часу: інакше
    // задача на сьогодні 09:00 о 10:00 вже вважалася б простроченою.
    const s = projectStats(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2026-08-29T09:00') }),
    ], NOW);
    expect(s.overdue).toBe(0);
    expect(s.upcomingDeadline).not.toBeNull();
  });

  it('найближчий дедлайн у минулому не анонсується як майбутній', () => {
    const s = projectStats(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2026-08-20') }),
    ], NOW);
    expect(s.nearestDeadline).toBe(iso('2026-08-20'));
    expect(s.upcomingDeadline).toBeNull();
  });

  it('битий дедлайн не ламає підрахунок', () => {
    const s = projectStats(p, [
      task({ id: '1', projectId: 'p1', deadline: 'не дата' }),
    ], NOW);
    expect(s.overdue).toBe(0);
    expect(s.nearestDeadline).toBeNull();
  });
});

describe('власний термін проєкту', () => {
  it('прострочений термін проєкту з незакритими задачами', () => {
    const s = projectStats(
      project({ id: 'p1', deadline: iso('2026-08-20') }),
      [task({ id: '1', projectId: 'p1' })],
      NOW,
    );
    expect(s.projectOverdue).toBe(true);
  });

  it('усе зроблено — простроченим не вважаємо, хоч термін і минув', () => {
    // Червона позначка на завершеній роботі — докір ні за що.
    const s = projectStats(
      project({ id: 'p1', deadline: iso('2026-08-20') }),
      [task({ id: '1', projectId: 'p1', status: 'done' })],
      NOW,
    );
    expect(s.projectOverdue).toBe(false);
  });

  it('термін проєкту НЕ виводиться з дедлайнів задач', () => {
    // Проєкт може мати термін, якого немає в жодної задачі, — заради цього
    // поле й додавали.
    const s = projectStats(
      project({ id: 'p1', deadline: iso('2026-10-01') }),
      [task({ id: '1', projectId: 'p1' })],
      NOW,
    );
    expect(s.nearestDeadline).toBeNull();
    expect(s.project.deadline).toBe(iso('2026-10-01'));
  });
});

describe('відпрацьований час', () => {
  const withTime = (id: string, seconds: number, open = false): ProjectTaskLike =>
    task({
      id,
      projectId: 'p1',
      timeEntries: [
        { startedAt: iso('2026-08-28T10:00'), endedAt: iso('2026-08-28T11:00'), duration: seconds },
        ...(open ? [{ startedAt: iso('2026-08-29T09:00'), duration: 0 }] : []),
      ],
    });

  it('підсумовує лише ЗАВЕРШЕНІ сесії задач проєкту', () => {
    const s = projectStats(project({ id: 'p1' }), [
      withTime('1', 3600),
      withTime('2', 1800),
      task({ id: '3', projectId: 'other', timeEntries: [{ startedAt: iso('2026-08-01'), endedAt: iso('2026-08-01'), duration: 9999 }] }),
    ], NOW);
    expect(s.trackedSeconds).toBe(5400);
  });

  it('відкритий запис старої форми тривалості не додає', () => {
    const s = projectStats(project({ id: 'p1' }), [withTime('1', 3600, true)], NOW);
    expect(s.trackedSeconds).toBe(3600);
  });

  it('сесія, що ТРИВАЄ, додається з реєстру таймерів', () => {
    const s = projectStats(
      project({ id: 'p1' }),
      [withTime('1', 3600)],
      NOW,
      // Мітка ЯВНО в UTC: 'T09:30' без Z парситься як локальний час, і тест
      // ламався б залежно від часового поясу машини.
      [{ taskId: '1', startedAt: '2026-08-29T09:30:00.000Z' }],
    );
    expect(s.trackedSeconds).toBe(3600 + 1800);
  });

  it('вільний таймер без задачі до проєкту не належить', () => {
    // Приписати його якомусь проєкту було б вигадкою.
    const s = projectStats(
      project({ id: 'p1' }),
      [withTime('1', 3600)],
      NOW,
      [{ startedAt: '2026-08-29T09:00:00.000Z' }],
    );
    expect(s.trackedSeconds).toBe(3600);
  });

  it('таймер чужої задачі теж не рахується', () => {
    const s = projectStats(
      project({ id: 'p1' }),
      [withTime('1', 3600)],
      NOW,
      [{ taskId: 'stranger', startedAt: '2026-08-29T09:00:00.000Z' }],
    );
    expect(s.trackedSeconds).toBe(3600);
  });

  it('годинник, що зʼїхав назад, не дає відʼємного часу', () => {
    const s = projectStats(
      project({ id: 'p1' }),
      [withTime('1', 0)],
      NOW,
      [{ taskId: '1', startedAt: '2026-08-30T10:00:00.000Z' }],
    );
    expect(s.trackedSeconds).toBe(0);
  });
});

describe('порядок карток', () => {
  const stat = (p: ProjectLike, tasks: ProjectTaskLike[]) => projectStats(p, tasks, NOW);

  it('прострочене — попереду всього', () => {
    const hot = stat(project({ id: 'a', name: 'Я' }), [task({ id: '1', projectId: 'a', deadline: iso('2026-08-01') })]);
    const calm = stat(project({ id: 'b', name: 'А' }), [task({ id: '2', projectId: 'b', deadline: iso('2026-09-01') })]);
    expect([calm, hot].sort(compareLive)[0].project.id).toBe('a');
  });

  it('прострочений ВЛАСНИЙ термін піднімає так само, як горіла б задача', () => {
    const hot = stat(project({ id: 'a', name: 'Я', deadline: iso('2026-08-01') }), [task({ id: '1', projectId: 'a' })]);
    const calm = stat(project({ id: 'b', name: 'А' }), [task({ id: '2', projectId: 'b', deadline: iso('2026-09-01') })]);
    expect([calm, hot].sort(compareLive)[0].project.id).toBe('a');
  });

  it('без дедлайнів — за назвою, і проєкти з датою попереду них', () => {
    const dated = stat(project({ id: 'a', name: 'Я', deadline: iso('2026-12-01') }), []);
    const nameB = stat(project({ id: 'b', name: 'Б' }), []);
    const nameA = stat(project({ id: 'c', name: 'А' }), []);
    expect([nameB, nameA, dated].sort(compareLive).map(s => s.project.id)).toEqual(['a', 'c', 'b']);
  });

  it('архівні — найсвіжіше зверху', () => {
    const older = stat(project({ id: 'a', archivedAt: iso('2026-05-01') }), []);
    const newer = stat(project({ id: 'b', archivedAt: iso('2026-08-01') }), []);
    expect([older, newer].sort(compareArchived).map(s => s.project.id)).toEqual(['b', 'a']);
  });
});

describe('міні-шкала', () => {
  const p = project({ id: 'p1' });
  const WEEK = 7 * 86_400_000;

  it('без жодного дедлайну шкала все одно є — порожня, навколо сьогодні', () => {
    // Порожня шкала чесніша за відсутню: видно, що дат просто немає.
    const buckets = projectTimeline(p, [task({ id: '1', projectId: 'p1' })], NOW);
    expect(buckets).toHaveLength(TIMELINE_BUCKETS);
    expect(buckets.every(b => b.count === 0 && b.done === 0)).toBe(true);
    expect(buckets.filter(b => b.current)).toHaveLength(1);
  });

  it('усі дедлайни в один день — вікно розтягується, а не ділиться на нуль', () => {
    // Без розтягування from === to, size === 0 і індекс виходить NaN.
    const same = iso('2026-08-10T12:00');
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'p1', deadline: same }),
      task({ id: '2', projectId: 'p1', deadline: same, status: 'done' }),
    ], NOW);
    expect(buckets).toHaveLength(TIMELINE_BUCKETS);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2);
    expect(buckets.reduce((sum, b) => sum + b.done, 0)).toBe(1);
    // Рівно один відрізок несе обидві дати: вікно симетричне навколо дня.
    expect(buckets.filter(b => b.count > 0)).toHaveLength(1);
    expect(buckets.every(b => !Number.isNaN(new Date(b.start).getTime()))).toBe(true);
  });

  it('останній дедлайн рівно на межі лишається в останньому відрізку', () => {
    // floor((to - from) / size) дає рівно TIMELINE_BUCKETS — без затиску
    // запис писався б у buckets[12], якого немає, і падав би на undefined.
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date(from.getTime() + 12 * WEEK);
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'p1', deadline: from.toISOString() }),
      task({ id: '2', projectId: 'p1', deadline: to.toISOString() }),
    ], NOW);
    expect(buckets[0].count).toBe(1);
    expect(buckets[TIMELINE_BUCKETS - 1].count).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(2);
  });

  it('виконані рахуються окремо від загальної кількості', () => {
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2026-03-01') }),
      task({ id: '2', projectId: 'p1', deadline: iso('2026-03-02'), status: 'done' }),
      task({ id: '3', projectId: 'p1', deadline: iso('2026-06-01') }),
    ], NOW);
    const totals = buckets.reduce(
      (acc, b) => ({ count: acc.count + b.count, done: acc.done + b.done }),
      { count: 0, done: 0 },
    );
    expect(totals).toEqual({ count: 3, done: 1 });
  });

  it('сьогодні всередині вікна позначене рівно одним відрізком', () => {
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2026-06-01') }),
      task({ id: '2', projectId: 'p1', deadline: iso('2026-12-01') }),
    ], NOW);
    expect(buckets.filter(b => b.current)).toHaveLength(1);
  });

  it('сьогодні поза вікном не позначається жодним відрізком', () => {
    // Проєкт, у якому все з минулого року: «зараз» на шкалі просто немає.
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'p1', deadline: iso('2020-01-01') }),
      task({ id: '2', projectId: 'p1', deadline: iso('2020-06-01') }),
    ], NOW);
    expect(buckets.some(b => b.current)).toBe(false);
  });

  it('чужі задачі й биті дати у шкалу не потрапляють', () => {
    const buckets = projectTimeline(p, [
      task({ id: '1', projectId: 'other', deadline: iso('2026-03-01') }),
      task({ id: '2', projectId: 'p1', deadline: 'не дата' }),
      task({ id: '3', projectId: 'p1' }),
    ], NOW);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(0);
  });
});
