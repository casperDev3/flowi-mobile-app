/**
 * Дедлайн «лише день» vs «день + час» (utils/taskDeadline.ts) — спільний
 * контракт із вебом (lib/task-deadline.ts) і сервером (_plan_task):
 * прапорець `deadlineHasTime` пишеться лише як true разом із `deadlineTimeAt`
 * (= той самий рядок, C1; читач перевіряє рівність), день без часу —
 * локальний полудень, час не з'являється сам.
 *
 * Перевірки — через ЛОКАЛЬНІ геттери Date, тож не залежать від поясу машини.
 */
import { draftDeadlineFields, editedDraftFields, taskToDraft } from '@/hooks/use-task-editor';
import {
  DATE_ONLY_ANCHOR_HOUR,
  DEFAULT_DEADLINE_TIME,
  applyDeadlineFields,
  buildDeadline,
  clearedDeadline,
  deadlineDayKey,
  deadlineTimeOf,
  deadlinePatch,
  deadlineSourceOf,
  formatDeadlineTime,
  isDeadlinePast,
  isTimedDeadline,
  moveDeadlineToDay,
  nextOccurrenceDeadline,
  parseDeadlineTime,
} from '@/utils/taskDeadline';

const localParts = (iso: string) => {
  const d = new Date(iso);
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), min: d.getMinutes() };
};

const plusDays = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  const x = new Date(y, m - 1, d + n, 12);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

describe('constants', () => {
  it('anchor is noon, add-time pre-fill is 18:00', () => {
    expect(DATE_ONLY_ANCHOR_HOUR).toBe(12);
    expect(DEFAULT_DEADLINE_TIME).toBe('18:00');
  });
});

describe('parseDeadlineTime (C3, identical to web)', () => {
  it('accepts H, HH, H:MM and HH:MM (outer whitespace trimmed) and pads', () => {
    expect(parseDeadlineTime('9:05')).toBe('09:05');
    expect(parseDeadlineTime('18:30')).toBe('18:30');
    expect(parseDeadlineTime(' 7:05 ')).toBe('07:05');
    expect(parseDeadlineTime('7')).toBe('07:00');
    expect(parseDeadlineTime('23')).toBe('23:00');
  });
  it('accepts a separate hours/minutes pair', () => {
    expect(parseDeadlineTime('9', '5')).toBe('09:05');
    expect(parseDeadlineTime('14', '')).toBe('14:00');
    expect(parseDeadlineTime(' 9 ', ' 05 ')).toBe('09:05');
  });
  it('rejects out-of-range values instead of clamping', () => {
    expect(parseDeadlineTime('99:99')).toBeNull();
    expect(parseDeadlineTime('24:00')).toBeNull();
    expect(parseDeadlineTime('23:60')).toBeNull();
    expect(parseDeadlineTime('25', '75')).toBeNull();
    expect(parseDeadlineTime('9', '60')).toBeNull();
  });
  it('rejects garbage: inner spaces, signs, letters, 1-digit minutes in one string (review P8)', () => {
    expect(parseDeadlineTime(' 9 : 05 ')).toBeNull();
    expect(parseDeadlineTime('7:5')).toBeNull();
    expect(parseDeadlineTime('abc', '5')).toBeNull();
    expect(parseDeadlineTime('-1', '0')).toBeNull();
    expect(parseDeadlineTime('+9')).toBeNull();
    expect(parseDeadlineTime('9', '-5')).toBeNull();
    expect(parseDeadlineTime('123')).toBeNull();
    expect(parseDeadlineTime('9:05:00')).toBeNull();
  });
  it('empty input means "no time"', () => {
    expect(parseDeadlineTime('')).toBeNull();
    expect(parseDeadlineTime('', '30')).toBeNull();
    expect(parseDeadlineTime('ab:cd')).toBeNull();
  });
});

describe('buildDeadline', () => {
  it('no time → local noon of that day, no flag', () => {
    const r = buildDeadline('2026-10-20', null)!;
    expect(r.deadlineHasTime).toBeUndefined();
    expect('deadlineHasTime' in r).toBe(false);
    expect(localParts(r.deadline)).toEqual({ y: 2026, m: 10, d: 20, h: 12, min: 0 });
  });
  it('time → local moment at that time with flag true', () => {
    const r = buildDeadline('2026-10-20', '18:45')!;
    expect(r.deadlineHasTime).toBe(true);
    expect(localParts(r.deadline)).toEqual({ y: 2026, m: 10, d: 20, h: 18, min: 45 });
  });
  it('00:00 and 12:00 are still timed (the flag decides, not the hour)', () => {
    expect(buildDeadline('2026-10-20', '00:00')!.deadlineHasTime).toBe(true);
    const noon = buildDeadline('2026-10-20', '12:00')!;
    expect(noon.deadlineHasTime).toBe(true);
    expect(noon.deadline).toBe(buildDeadline('2026-10-20', null)!.deadline);
  });
  it('invalid day → null', () => {
    expect(buildDeadline('2026-02-30', null)).toBeNull();
    expect(buildDeadline('garbage', '10:00')).toBeNull();
  });
  it('time given but unparsable → null (not a silent date-only save; C3, same as web)', () => {
    expect(buildDeadline('2026-10-20', 'abc')).toBeNull();
    expect(buildDeadline('2026-10-20', '25:00')).toBeNull();
    expect(buildDeadline('2026-10-20', '')).toBeNull();
    expect(buildDeadline('2026-10-20', undefined)!.deadlineHasTime).toBeUndefined();
  });
  it('timed → deadlineTimeAt is the exact same string as deadline (C1)', () => {
    const r = buildDeadline('2026-10-20', '18:45')!;
    expect(r.deadlineTimeAt).toBe(r.deadline);
    expect('deadlineTimeAt' in buildDeadline('2026-10-20', null)!).toBe(false);
  });
});

describe('deadlineDayKey / deadlineTimeOf', () => {
  it('bare YYYY-MM-DD is returned as is and is date-only even with flag', () => {
    expect(deadlineDayKey('2026-10-20')).toBe('2026-10-20');
    expect(deadlineTimeOf({ deadline: '2026-10-20', deadlineHasTime: true })).toBeNull();
  });
  it('requires strictly true AND deadlineTimeAt === deadline (C1)', () => {
    const iso = buildDeadline('2026-10-20', '09:30')!.deadline;
    expect(deadlineTimeOf({ deadline: iso, deadlineHasTime: true, deadlineTimeAt: iso })).toBe('09:30');
    expect(deadlineTimeOf({ deadline: iso, deadlineHasTime: true })).toBeNull();
    expect(deadlineTimeOf({ deadline: iso, deadlineHasTime: 'true' as unknown as boolean, deadlineTimeAt: iso })).toBeNull();
    expect(deadlineTimeOf({ deadline: iso, deadlineHasTime: false, deadlineTimeAt: iso })).toBeNull();
    expect(deadlineTimeOf({ deadline: iso, deadlineTimeAt: iso })).toBeNull();
    expect(deadlineTimeOf({ deadline: 'nope', deadlineHasTime: true, deadlineTimeAt: 'nope' })).toBeNull();
    expect(formatDeadlineTime({ deadline: iso, deadlineHasTime: true, deadlineTimeAt: iso })).toBe('09:30');
    expect(formatDeadlineTime({ deadline: iso })).toBe('');
  });
  it('stale flag from an old build that moved only `deadline` → date-only (review P1)', () => {
    // Нова збірка: 20.10 18:00 з часом; стара (≤1.2.0) переносить на 21.10,
    // пишучи лише `deadline` = локальний полудень і копіюючи решту полів.
    const rec = { id: 't', ...buildDeadline('2026-10-20', '18:00')! };
    const afterOld = { ...rec, deadline: new Date(2026, 9, 21, 12, 0, 0, 0).toISOString() };
    expect(isTimedDeadline(rec)).toBe(true);
    expect(isTimedDeadline(afterOld)).toBe(false);
    expect(deadlineTimeOf(afterOld)).toBeNull();
    expect(deadlineDayKey(afterOld.deadline)).toBe('2026-10-21');
    // Не timed → не «12:00» і не прострочено о 12:01 того ж дня.
    expect(isDeadlinePast(afterOld, new Date(2026, 9, 21, 12, 1))).toBe(false);
    expect(isDeadlinePast(afterOld, new Date(2026, 9, 22, 0, 1))).toBe(true);
  });
  it('day key is the local day of a stored ISO (noon or midnight legacy)', () => {
    expect(deadlineDayKey(buildDeadline('2026-10-20', null)!.deadline)).toBe('2026-10-20');
    expect(deadlineDayKey(new Date(2026, 9, 20, 0, 0).toISOString())).toBe('2026-10-20');
    expect(deadlineDayKey(undefined)).toBeNull();
  });
});

describe('moveDeadlineToDay', () => {
  it('keeps the time of a timed task and rewrites deadlineTimeAt', () => {
    const task = buildDeadline('2026-10-20', '08:15')!;
    const moved = moveDeadlineToDay(task, '2026-11-02')!;
    expect(moved.deadlineHasTime).toBe(true);
    expect(moved.deadlineTimeAt).toBe(moved.deadline);
    expect(moved.deadlineTimeAt).not.toBe(task.deadlineTimeAt);
    expect(localParts(moved.deadline)).toEqual({ y: 2026, m: 11, d: 2, h: 8, min: 15 });
  });
  it('stays date-only for a date-only / legacy task', () => {
    const moved = moveDeadlineToDay({ deadline: '2026-10-20' }, '2026-10-21')!;
    expect('deadlineHasTime' in moved).toBe(false);
    expect(localParts(moved.deadline).h).toBe(12);
  });
});

describe('clearing and applying', () => {
  it('clearedDeadline removes all three', () => {
    const o = JSON.parse(JSON.stringify({ id: 'x', ...clearedDeadline() }));
    expect(o).toEqual({ id: 'x' });
  });
  it('applyDeadlineFields never writes false and keeps deadlineTimeAt in lockstep', () => {
    const t: { deadline?: string; deadlineHasTime?: boolean; deadlineTimeAt?: string } = { deadline: 'a', deadlineHasTime: true, deadlineTimeAt: 'a' };
    applyDeadlineFields(t, { deadline: '2026-10-20T09:00:00.000Z', deadlineHasTime: false });
    expect('deadlineHasTime' in t).toBe(false);
    expect('deadlineTimeAt' in t).toBe(false);
    applyDeadlineFields(t, { deadline: '2026-10-20T09:00:00.000Z', deadlineHasTime: true });
    expect(t).toEqual({ deadline: '2026-10-20T09:00:00.000Z', deadlineHasTime: true, deadlineTimeAt: '2026-10-20T09:00:00.000Z' });
    applyDeadlineFields(t, { deadline: null, deadlineHasTime: true });
    expect(t).toEqual({});
  });
  it('deadlinePatch: explicit undefineds so a spread drops a stale flag', () => {
    const stale = { id: 'x', deadline: 'old', deadlineHasTime: true, deadlineTimeAt: 'old' };
    const dateOnly = JSON.parse(JSON.stringify({ ...stale, ...deadlinePatch('new') }));
    expect(dateOnly).toEqual({ id: 'x', deadline: 'new' });
    expect({ ...stale, ...deadlinePatch('new', true) }).toEqual({ id: 'x', deadline: 'new', deadlineHasTime: true, deadlineTimeAt: 'new' });
    expect(JSON.parse(JSON.stringify({ ...stale, ...deadlinePatch(null, true) }))).toEqual({ id: 'x' });
  });
  it('deadlineSourceOf turns a validated UI flag into a timed source', () => {
    const iso = buildDeadline('2026-10-20', '07:05')!.deadline;
    expect(deadlineTimeOf(deadlineSourceOf(iso, true))).toBe('07:05');
    expect(deadlineTimeOf(deadlineSourceOf(iso, false))).toBeNull();
    expect(deadlineTimeOf(deadlineSourceOf(null, true))).toBeNull();
  });
});

describe('draft integration', () => {
  const base = { title: 'T' };
  it('stale flag without deadlineTimeAt → draft date-only (P1)', () => {
    const iso = buildDeadline('2026-10-20', '18:00')!.deadline;
    expect(taskToDraft({ ...base, deadline: iso, deadlineHasTime: true }, 's').deadlineHasTime).toBe(false);
    expect(taskToDraft({ ...base, deadline: iso, deadlineHasTime: true, deadlineTimeAt: iso }, 's').deadlineHasTime).toBe(true);
  });
  it('legacy task without flag → draft date-only; re-save is a no-op', () => {
    const d = taskToDraft({ ...base, deadline: '2026-10-20T09:00:00.000Z' }, 's');
    expect(d.deadlineHasTime).toBe(false);
    expect(editedDraftFields(d, { ...d }).has('deadline')).toBe(false);
  });
  it('toggling the time marks deadline edited even with the same ISO', () => {
    const iso = buildDeadline('2026-10-20', null)!.deadline;
    const d = taskToDraft({ ...base, deadline: iso }, 's');
    expect(editedDraftFields(d, { ...d, deadlineHasTime: true }).has('deadline')).toBe(true);
  });
  it('draftDeadlineFields writes the flag only with a date and a time', () => {
    expect(draftDeadlineFields({ deadline: null, deadlineHasTime: true })).toEqual({});
    expect(draftDeadlineFields({ deadline: 'x', deadlineHasTime: false })).toEqual({ deadline: 'x' });
    expect(draftDeadlineFields({ deadline: 'x', deadlineHasTime: true })).toEqual({ deadline: 'x', deadlineHasTime: true, deadlineTimeAt: 'x' });
  });
});

describe('nextOccurrenceDeadline (recurring tasks)', () => {
  const daily = (key: string) => plusDays(key, 1);
  it('keeps the time and the flag, with a NEW deadlineTimeAt', () => {
    const task = buildDeadline('2026-10-20', '07:30')!;
    const next = nextOccurrenceDeadline(task, daily)!;
    expect(next.deadlineHasTime).toBe(true);
    expect(next.deadlineTimeAt).toBe(next.deadline);
    expect(localParts(next.deadline)).toEqual({ y: 2026, m: 10, d: 21, h: 7, min: 30 });
  });
  it('date-only stays date-only and gets no flag', () => {
    const task = { ...buildDeadline('2026-10-20', null)!, deadlineHasTime: 'true' as unknown as boolean };
    const next = nextOccurrenceDeadline(task, daily)!;
    expect('deadlineHasTime' in next).toBe(false);
    expect(deadlineDayKey(next.deadline)).toBe('2026-10-21');
  });
  it('passes the LOCAL day key (not raw ISO) to the stepper', () => {
    const seen: string[] = [];
    nextOccurrenceDeadline({ deadline: new Date(2026, 9, 20, 0, 5).toISOString() }, k => { seen.push(k); return null; });
    expect(seen).toEqual(['2026-10-20']);
  });
  it('end of recurrence / no deadline → null', () => {
    expect(nextOccurrenceDeadline({ deadline: '2026-10-20' }, () => null)).toBeNull();
    expect(nextOccurrenceDeadline({}, daily)).toBeNull();
  });
});
