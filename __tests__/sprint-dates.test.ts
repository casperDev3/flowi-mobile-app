/**
 * Інваріанти дат спринта (docs/specs/projects-analytics.md §3.1):
 * обидві дати або жодної, end >= start, очищення ВИДАЛЯЄ ключі, а решта
 * полів запису (включно з невідомими цьому клієнту) переживає правку.
 */
import {
  createSprint, isSprintDated, overlappingSprints, parseSprintDatesInput, renameSprint,
  setSprintClosed, setSprintDates, sprintDateInput, type Sprint,
} from '../utils/sprintUtils';

describe('parseSprintDatesInput', () => {
  it('обидва порожні — дат немає', () => {
    expect(parseSprintDatesInput('', '  ')).toEqual({ ok: true, dates: null });
  });

  it('одне поле без другого — partial', () => {
    expect(parseSprintDatesInput('2026-09-01', '')).toEqual({ ok: false, error: 'partial' });
    expect(parseSprintDatesInput('', '2026-09-01')).toEqual({ ok: false, error: 'partial' });
  });

  it('неіснуюча дата чи чужий формат — invalid', () => {
    expect(parseSprintDatesInput('2026-02-31', '2026-03-05')).toEqual({ ok: false, error: 'invalid' });
    expect(parseSprintDatesInput('01.09.2026', '2026-09-05')).toEqual({ ok: false, error: 'invalid' });
  });

  it('кінець раніше за початок — order; рівність дозволена', () => {
    expect(parseSprintDatesInput('2026-09-10', '2026-09-09')).toEqual({ ok: false, error: 'order' });
    const same = parseSprintDatesInput('2026-09-10', '2026-09-10');
    expect(same.ok).toBe(true);
  });

  it('дати — повний ISO локальної півночі, і поле форми відтворює ту саму добу', () => {
    const result = parseSprintDatesInput('2026-09-01', '2026-09-14');
    if (!result.ok || !result.dates) throw new Error('expected dates');
    expect(new Date(result.dates.startDate).getHours()).toBe(0);
    expect(sprintDateInput(result.dates.startDate)).toBe('2026-09-01');
    expect(sprintDateInput(result.dates.endDate)).toBe('2026-09-14');
  });
});

describe('setSprintDates', () => {
  const base = { ...createSprint('p1', 'Тиждень 1', new Date(2026, 8, 1)), futureField: 'keep' } as Sprint & { futureField: string };

  it('ставить обидві дати й не чіпає решту полів', () => {
    const dated = setSprintDates(base, { startDate: 'a', endDate: 'b' });
    expect(dated.startDate).toBe('a');
    expect(dated.endDate).toBe('b');
    expect(dated.futureField).toBe('keep');
    expect(dated.name).toBe('Тиждень 1');
  });

  it('очищення видаляє ключі, а не ставить undefined', () => {
    const dated = setSprintDates(base, { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-07T00:00:00.000Z' });
    const cleared = setSprintDates(dated, null);
    expect('startDate' in cleared).toBe(false);
    expect('endDate' in cleared).toBe(false);
    expect(cleared.futureField).toBe('keep');
  });

  it('очищення недатованого повертає той самий обʼєкт (зайва правка не будить синк)', () => {
    expect(setSprintDates(base, null)).toBe(base);
  });

  it('перейменування й закриття зберігають дати (мердж, а не перезбирання)', () => {
    const dated = setSprintDates(base, { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-07T00:00:00.000Z' });
    const renamed = renameSprint(dated, 'Нова');
    const closed = setSprintClosed(renamed, true, new Date(2026, 8, 8));
    const reopened = setSprintClosed(closed, false);
    for (const sprint of [renamed, closed, reopened]) {
      expect(sprint.startDate).toBe(dated.startDate);
      expect(sprint.endDate).toBe(dated.endDate);
    }
  });
});

describe('isSprintDated / overlappingSprints', () => {
  const iso = (d: number) => new Date(2026, 8, d).toISOString();
  const sprints: Sprint[] = [
    { id: 'a', projectId: 'p1', name: 'A', createdAt: iso(1), startDate: iso(1), endDate: iso(7) },
    { id: 'b', projectId: 'p1', name: 'B', createdAt: iso(1), startDate: iso(8), endDate: iso(14) },
    { id: 'c', projectId: 'p2', name: 'C', createdAt: iso(1), startDate: iso(1), endDate: iso(30) },
    { id: 'd', projectId: 'p1', name: 'D', createdAt: iso(1), startDate: iso(1) },
  ];

  it('половинчастий запис недатований', () => {
    expect(isSprintDated(sprints[3])).toBe(false);
    expect(isSprintDated(sprints[0])).toBe(true);
  });

  it('перетин — лише свій проєкт, межі включно, без себе', () => {
    const hits = overlappingSprints(sprints, 'p1', { startDate: iso(7), endDate: iso(8) });
    expect(hits.map(s => s.id)).toEqual(['a', 'b']);
    expect(overlappingSprints(sprints, 'p1', { startDate: iso(7), endDate: iso(8) }, 'a').map(s => s.id)).toEqual(['b']);
    expect(overlappingSprints(sprints, 'p1', { startDate: iso(15), endDate: iso(20) })).toEqual([]);
  });
});
