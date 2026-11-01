/**
 * Паритет телефон ↔ веб ↔ сервер (ревʼю 2026-10-18, раунд 2; контракт C1–C5,
 * contracts/task-contract.md). Регресії до P1, P2, P4, P6, P7, R3.
 *
 * Перевірки через ЛОКАЛЬНІ геттери Date — не залежать від поясу машини;
 * той самий набір проходить і з TZ=America/New_York / Pacific/Auckland.
 */
import { deadlineIsoForKey } from '@/components/calendar/calendarModel';
import { resolveTimelineDatePatch } from '@/utils/dateUtils';
import { nextOccurrenceRecord } from '@/utils/deviceActions';
import { shiftGanttEdge } from '@/utils/projectCharts';
import { buildDeadline, deadlineDayKey, isTimedDeadline, nextOccurrenceDeadline } from '@/utils/taskDeadline';
import { nextRecurrenceDate, sanitizeRecurrenceRule } from '@/utils/taskRecurrence';
import { isTodayTask, isWeekTask } from '@/utils/taskToday';
import type { Task } from '@/utils/taskUtils';
import { progress, type TeamTask } from '@/utils/teamwork';
import { orderTodayTasks, snapshotTaskHasTime } from '@/utils/watchSnapshot';
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';

const localParts = (iso: string) => {
  const d = new Date(iso);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
};

describe('P1 — snapshot hasTime is self-validating', () => {
  const timed = buildDeadline('2026-10-20', '18:00')!;
  it('hasTime only when the flag and deadlineTimeAt === deadline', () => {
    expect(snapshotTaskHasTime(timed)).toBe(true);
    expect(snapshotTaskHasTime({ deadline: timed.deadline, deadlineHasTime: true })).toBe(false);
    // Стара збірка перенесла дедлайн на інший день, лишивши прапорці.
    const moved = { ...timed, deadline: new Date(2026, 9, 21, 12).toISOString() };
    expect(snapshotTaskHasTime(moved)).toBe(false);
  });
  it('device-actions next copy carries a fresh deadlineTimeAt and drops completedAt (C1/C5)', () => {
    const before = {
      id: 't1', title: 'Щодня', status: 'active', kanbanColumnId: 'status-active', subtasks: [],
      createdAt: '2026-10-01T00:00:00.000Z', completedAt: '2026-10-19T10:00:00.000Z',
      ...timed, recurrence: { freq: 'daily', interval: 1 } as RecurrenceRule,
    } as Task & { recurrence: RecurrenceRule };
    const next = nextOccurrenceRecord(before, { actionId: 'a1', at: '2026-10-20T19:00:00.000Z', todoColumnId: 'status-active' })!;
    expect(isTimedDeadline(next)).toBe(true);
    expect(next.deadlineTimeAt).toBe(next.deadline);
    expect(localParts(next.deadline!)).toEqual({ y: 2026, m: 10, d: 21, h: 18, min: 0 });
    expect('completedAt' in next).toBe(false);
  });
  it('device-actions next copy of a stale-flag task is date-only (no flags copied)', () => {
    const before = {
      id: 't2', title: 'Щодня', status: 'active', subtasks: [], createdAt: '',
      deadline: new Date(2026, 9, 20, 12).toISOString(), deadlineHasTime: true, deadlineTimeAt: 'stale',
      recurrence: { freq: 'daily', interval: 1 } as RecurrenceRule,
    } as unknown as Task & { recurrence: RecurrenceRule };
    const next = nextOccurrenceRecord(before, { actionId: 'a2', at: '2026-10-20T19:00:00.000Z', todoColumnId: 'x' })!;
    expect('deadlineHasTime' in next).toBe(false);
    expect('deadlineTimeAt' in next).toBe(false);
    expect(localParts(next.deadline!).h).toBe(12);
  });
});

describe('P1/P2 — Gantt edge drag (Timeline)', () => {
  it('timed deadline keeps its time on a new day with a rewritten deadlineTimeAt', () => {
    const task = { createdAt: new Date(2026, 9, 1, 12).toISOString(), ...buildDeadline('2026-10-20', '08:30')! };
    const r = shiftGanttEdge(task, 'end', 2) as { deadline: string; deadlineHasTime?: true; deadlineTimeAt?: string };
    expect(localParts(r.deadline)).toEqual({ y: 2026, m: 10, d: 22, h: 8, min: 30 });
    expect(r.deadlineHasTime).toBe(true);
    expect(r.deadlineTimeAt).toBe(r.deadline);
  });
  it('legacy midnight date-only deadline lands on the local NOON of the new day, no flags', () => {
    const task = { createdAt: new Date(2026, 9, 1, 12).toISOString(), deadline: new Date(2026, 9, 20, 0, 0).toISOString() };
    const r = shiftGanttEdge(task, 'end', -3) as { deadline: string; deadlineHasTime?: true };
    expect(localParts(r.deadline)).toEqual({ y: 2026, m: 10, d: 17, h: 12, min: 0 });
    expect('deadlineHasTime' in r).toBe(false);
  });
  it('stale flag (old build) moves as date-only', () => {
    const task = {
      createdAt: new Date(2026, 9, 1, 12).toISOString(),
      deadline: new Date(2026, 9, 20, 12).toISOString(), deadlineHasTime: true, deadlineTimeAt: 'x',
    };
    const r = shiftGanttEdge(task, 'end', 1) as { deadline: string };
    expect('deadlineHasTime' in r).toBe(false);
    expect(localParts(r.deadline)).toEqual({ y: 2026, m: 10, d: 21, h: 12, min: 0 });
  });
});

describe('P2 — date-only deadlines are written as local noon', () => {
  it('calendar ?deadline= preset is buildDeadline(key, null)', () => {
    expect(deadlineIsoForKey('2026-10-06')).toBe(buildDeadline('2026-10-06', null)!.deadline);
    expect(localParts(deadlineIsoForKey('2026-10-06'))).toEqual({ y: 2026, m: 10, d: 6, h: 12, min: 0 });
  });
  it('Timeline text editor writes local noon', () => {
    const patch = resolveTimelineDatePatch({ start: '', deadline: '2026-10-21', origStart: '', origDeadline: '2026-10-20' });
    expect(patch.ok).toBe(true);
    expect(patch.deadline).toBe(buildDeadline('2026-10-21', null)!.deadline);
  });
});

describe('P4 — bare YYYY-MM-DD (imports) is that local day', () => {
  const columns: never[] = [];
  const bare = (deadline: string) => ({ deadline, status: 'active' } as unknown as Task);
  it('isTodayTask: today late evening and early morning', () => {
    expect(isTodayTask(bare('2026-10-20'), columns, new Date(2026, 9, 20, 0, 30))).toBe(true);
    expect(isTodayTask(bare('2026-10-20'), columns, new Date(2026, 9, 20, 23, 30))).toBe(true);
    expect(isTodayTask(bare('2026-10-21'), columns, new Date(2026, 9, 20, 23, 30))).toBe(false);
  });
  it('isWeekTask counts whole local days', () => {
    expect(isWeekTask(bare('2026-10-27'), columns, new Date(2026, 9, 20, 23, 30))).toBe(true);
    expect(isWeekTask(bare('2026-10-28'), columns, new Date(2026, 9, 20, 23, 30))).toBe(false);
  });
  it('deadlineDayKey keeps a bare date as is', () => {
    expect(deadlineDayKey('2026-10-20')).toBe('2026-10-20');
  });
});

describe('P6 / C4 — watch sort tie-break: lower-cased title by code units, then id', () => {
  const now = new Date(2026, 9, 20, 9, 0);
  const deadline = buildDeadline('2026-10-20', null)!.deadline;
  const t = (id: string, title: string) => ({ id, title, status: 'active', deadline }) as unknown as Task;
  it('not localeCompare: "é…" sorts after "f…" (U+00E9 > U+0066)', () => {
    expect(orderTodayTasks([t('1', 'école'), t('2', 'fig')], now).map(x => x.id)).toEqual(['2', '1']);
  });
  it('case-insensitive, then id', () => {
    expect(orderTodayTasks([t('b', 'Apple'), t('a', 'apple'), t('c', 'BANANA')], now).map(x => x.id))
      .toEqual(['a', 'b', 'c']);
  });
  it('bare-date deadline sorts at local noon of its day (like server deadline_moment)', () => {
    const timedMorning = { id: 'm', title: 'z', status: 'active', ...buildDeadline('2026-10-21', '11:00')! } as unknown as Task;
    const timedEvening = { id: 'e', title: 'z', status: 'active', ...buildDeadline('2026-10-21', '13:00')! } as unknown as Task;
    const bareTask = { id: 'b', title: 'a', status: 'active', deadline: '2026-10-21' } as unknown as Task;
    expect(orderTodayTasks([timedEvening, bareTask, timedMorning], now).map(x => x.id)).toEqual(['m', 'b', 'e']);
  });
});

describe('P7 / C5 — recurrence rule sanitizer', () => {
  it('unknown freq → no recurrence', () => {
    expect(sanitizeRecurrenceRule({ freq: 'hourly', interval: 1 })).toBeNull();
    expect(sanitizeRecurrenceRule(null)).toBeNull();
    expect(nextRecurrenceDate('2026-01-31', { freq: 'hourly', interval: 1 } as unknown as RecurrenceRule)).toBeNull();
  });
  it('interval: floor, <1 → 1, numeric string parsed, anything else → 1', () => {
    const iv = (interval: unknown) => sanitizeRecurrenceRule({ freq: 'daily', interval })!.interval;
    expect(iv(0)).toBe(1);
    expect(iv(-3)).toBe(1);
    expect(iv(2.9)).toBe(2);
    expect(iv(0.5)).toBe(1);
    expect(iv('2')).toBe(2);
    expect(iv(' 3 ')).toBe(3);
    expect(iv('2.7')).toBe(2);
    expect(iv('0')).toBe(1);
    expect(iv('abc')).toBe(1);
    expect(iv('')).toBe(1);
    expect(iv(undefined)).toBe(1);
    expect(iv(null)).toBe(1);
    expect(iv(true)).toBe(1);
    expect(iv(Infinity)).toBe(1);
    expect(iv(NaN)).toBe(1);
    // Формат рядка — як _NUMERIC_RE сервера: без `.5`, `2.` чи експоненти.
    expect(iv('.5')).toBe(1);
    expect(iv('3.')).toBe(1);
    expect(iv('1e1')).toBe(1);
    expect(iv('+4')).toBe(4);
  });
  it('daysOfWeek: integers 0..6, unique, sorted; empty → not set', () => {
    expect(sanitizeRecurrenceRule({ freq: 'weekly', interval: 1, daysOfWeek: [3, 3, 1, 7, -1, 2.5, '4'] })!.daysOfWeek).toEqual([1, 3]);
    expect('daysOfWeek' in sanitizeRecurrenceRule({ freq: 'weekly', interval: 1, daysOfWeek: [-1, 7] })!).toBe(false);
  });
  it('next dates for malformed rules (same table as server watch/recurrence.py)', () => {
    const next = (rule: unknown, from = '2026-01-31') => nextRecurrenceDate(from, rule as RecurrenceRule);
    expect(next({ freq: 'daily', interval: 0 })).toBe('2026-02-01');
    expect(next({ freq: 'daily' })).toBe('2026-02-01');
    expect(next({ freq: 'daily', interval: '2' })).toBe('2026-02-02');
    // 2026-01-31 — субота (Пн=0 → 5). [-1] → «днів не задано» → звичайний weekly.
    expect(next({ freq: 'weekly', interval: 1, daysOfWeek: [-1] })).toBe('2026-02-07');
    expect(next({ freq: 'weekly', interval: 0, daysOfWeek: [1] })).toBe('2026-02-03');
    expect(next({ freq: 'weekly', interval: 1, daysOfWeek: [3, 3, 1] })).toBe('2026-02-03');
    expect(next({ freq: 'monthly', interval: 1 })).toBe('2026-03-03');
    expect(next({ freq: 'yearly', interval: 100000 })).toBeNull();
  });
  it('nextOccurrenceDeadline with a malformed rule still steps by a sanitized interval', () => {
    const task = buildDeadline('2026-10-20', null)!;
    const r = nextOccurrenceDeadline(task, day => nextRecurrenceDate(day, { freq: 'daily', interval: 0 } as RecurrenceRule))!;
    expect(deadlineDayKey(r.deadline)).toBe('2026-10-21');
  });
});

describe('R3 — teamwork progress().overdue uses the canonical rule', () => {
  const now = new Date(2026, 9, 20, 15, 0);
  const task = (over: Partial<TeamTask>): TeamTask => ({ id: Math.random().toString(36), title: 't', status: 'active', ...over });
  it('date-only today is not overdue at 15:00; timed 14:00 is', () => {
    const timed = buildDeadline('2026-10-20', '14:00')!;
    const tasks = [
      task({ deadline: buildDeadline('2026-10-20', null)!.deadline }),
      task({ deadline: '2026-10-20' }),
      task({ ...timed }),
      task({ deadline: timed.deadline, deadlineHasTime: true }), // застарілий прапорець — добовий
      task({ deadline: '2026-10-19' }),
    ];
    expect(progress(tasks, now).overdue).toBe(2);
  });
});
