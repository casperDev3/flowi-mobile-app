/**
 * __tests__/meeting-schedule.test.ts — адресація повторюваних зустрічей.
 */
import {
  expandMeetings,
  expandRecurring,
  meetingsOnDate,
  orderTodayMeetings,
  resolveOriginalMeeting,
  TODAY_MEETINGS_PREVIEW,
  withMeetingRecording,
  type Meeting,
} from '@/utils/meetings';

const base: Meeting = {
  id: 'm1', title: 'Стендап', date: '2026-09-01', time: '10:00', durationMinutes: 15, color: '#6366F1',
  recurrence: { freq: 'daily', interval: 1 },
};

describe('resolveOriginalMeeting', () => {
  test('звичайна зустріч — вона сама', () => {
    expect(resolveOriginalMeeting(base, [base])).toBe(base);
  });

  test('екземпляр повтору — оригінал зі сховища', () => {
    const inst: Meeting = { ...base, id: 'm1_2026-09-13', date: '2026-09-13', _origId: 'm1' };
    expect(resolveOriginalMeeting(inst, [base])).toBe(base);
  });

  test('оригінал зник — повертається екземпляр', () => {
    const inst: Meeting = { ...base, id: 'm1_2026-09-13', date: '2026-09-13', _origId: 'm1' };
    expect(resolveOriginalMeeting(inst, [])).toBe(inst);
  });
});

describe('withMeetingRecording', () => {
  test('імпортована з Google зустріч (id з підкресленням) отримує запис', () => {
    const gcal: Meeting = { ...base, id: 'gcal_abc_def', recurrence: undefined, recordings: ['file:///a.m4a'] };
    const other: Meeting = { ...base, id: 'gcal', recurrence: undefined };
    const next = withMeetingRecording([other, gcal], 'gcal_abc_def', 'file:///b.m4a');
    expect(next[1].recordings).toEqual(['file:///a.m4a', 'file:///b.m4a']);
    expect(next[0]).toBe(other);
  });

  test('невідомий id — нічого не змінює й нічого не видаляє', () => {
    const next = withMeetingRecording([base], 'missing', 'file:///b.m4a');
    expect(next).toEqual([base]);
  });
});

const mk = (over: Partial<Meeting>): Meeting => ({
  id: 'x', title: 'Зустріч', date: '2026-09-13', time: '10:00', durationMinutes: 30, color: '#6366F1', ...over,
});

describe('expandRecurring / expandMeetings', () => {
  test('звичайна зустріч — як є', () => {
    const m = mk({ id: 'one' });
    expect(expandRecurring(m, new Date(2026, 0, 1), new Date(2027, 0, 1))).toEqual([m]);
  });

  test('щоденна: екземпляри з суфіксом дати й _origId, до межі включно', () => {
    const m = mk({ id: 'd', date: '2026-09-10', recurrence: { freq: 'daily', interval: 1 } });
    const inst = expandRecurring(m, new Date(2026, 8, 10), new Date(2026, 8, 12, 23, 59, 59));
    expect(inst.map(i => i.id)).toEqual(['d_2026-09-10', 'd_2026-09-11', 'd_2026-09-12']);
    expect(inst.every(i => i._origId === 'd')).toBe(true);
  });

  test('тижнева з днями тижня (0 = понеділок) і until', () => {
    // 2026-09-07 — понеділок.
    const m = mk({ id: 'w', date: '2026-09-07', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [0, 2], until: '2026-09-16' } });
    const dates = expandRecurring(m, new Date(2026, 8, 1), new Date(2026, 11, 31)).map(i => i.date);
    expect(dates).toEqual(['2026-09-07', '2026-09-09', '2026-09-14', '2026-09-16']);
  });

  test('місячний крок без обрізання дня (31 січня → 3 березня), як на вебі', () => {
    const m = mk({ id: 'mo', date: '2026-01-31', recurrence: { freq: 'monthly', interval: 1 } });
    const dates = expandRecurring(m, new Date(2026, 0, 1), new Date(2026, 2, 31)).map(i => i.date);
    expect(dates).toEqual(['2026-01-31', '2026-03-03']);
  });

  test('вікно: щоденна серія від 2025-01-01 доходить до fromDate, ранні екземпляри як були', () => {
    const m = mk({ id: 'old', date: '2025-01-01', recurrence: { freq: 'daily', interval: 1 } });
    const inst = expandRecurring(m, new Date(2026, 8, 13), new Date(2026, 8, 14, 23, 59, 59));
    const dates = inst.map(i => i.date);
    // перші 500 кроків від старту — без змін для наявних викликів
    expect(dates[0]).toBe('2025-01-01');
    expect(dates.filter(d => d < '2026-09-13')).toHaveLength(500);
    expect(dates.filter(d => d >= '2026-09-13')).toEqual(['2026-09-13', '2026-09-14']);
  });

  test('вікно: тижнева з днями від 2019 і інтервалом 3 — правильна фаза після перескоку', () => {
    // Очікування — з веба (lib/meeting-schedule.ts): серія Ср/Пт кожні 3 тижні від 2019-01-01.
    const m = mk({ id: 'w', date: '2019-01-01', recurrence: { freq: 'weekly', interval: 3, daysOfWeek: [2, 4] } });
    const dates = expandRecurring(m, new Date(2026, 8, 13), new Date(2026, 9, 10, 23, 59, 59))
      .map(i => i.date).filter(d => d >= '2026-09-13');
    expect(dates).toEqual(['2026-09-16', '2026-09-18', '2026-10-07', '2026-10-09']);
  });

  test('вікно: тижнева без днів і щоденна з інтервалом зберігають фазу', () => {
    const w = mk({ id: 'w', date: '2019-01-01', recurrence: { freq: 'weekly', interval: 2 } });
    const wd = expandRecurring(w, new Date(2026, 8, 13), new Date(2026, 8, 30)).map(i => i.date).filter(d => d >= '2026-09-13');
    const d = mk({ id: 'd', date: '2019-03-05', recurrence: { freq: 'daily', interval: 2 } });
    const dd = expandRecurring(d, new Date(2026, 8, 13), new Date(2026, 8, 17, 23, 59, 59)).map(i => i.date).filter(x => x >= '2026-09-13');
    expect({ wd, dd }).toEqual({ wd: ['2026-09-15', '2026-09-29'], dd: ['2026-09-14', '2026-09-16'] }); // з веба
  });

  test('expandMeetings пропускає звичайні без фільтра дат і розгортає повтори', () => {
    const plain = mk({ id: 'p', date: '2020-01-01' });
    const rec = mk({ id: 'r', date: '2026-09-12', recurrence: { freq: 'daily', interval: 1 } });
    const out = expandMeetings([plain, rec], new Date(2026, 8, 1), new Date(2026, 8, 13, 23, 59, 59));
    expect(out.map(m => m.id)).toEqual(['p', 'r_2026-09-12', 'r_2026-09-13']);
  });
});

describe('meetingsOnDate', () => {
  const day = new Date(2026, 8, 13, 15, 30);

  test('звичайні за локальною датою + сьогоднішні екземпляри повторів', () => {
    const today = mk({ id: 't' });
    const other = mk({ id: 'o', date: '2026-09-12' });
    const daily = mk({ id: 'd', date: '2026-09-01', recurrence: { freq: 'daily', interval: 1 } });
    const weeklyOff = mk({ id: 'w', date: '2026-09-01', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [1] } }); // вівторки
    const ended = mk({ id: 'e', date: '2026-09-01', recurrence: { freq: 'daily', interval: 1, until: '2026-09-10' } });
    const out = meetingsOnDate([today, other, daily, weeklyOff, ended], day);
    expect(out.map(m => m.id)).toEqual(['t', 'd_2026-09-13']);
    expect(out[1]._origId).toBe('d');
  });

  test('давні серії (щоденна від 2025, тижнева від 2019) сьогодні видно, як у веб lib/today.ts', () => {
    const daily = mk({ id: 'd', date: '2025-01-01', recurrence: { freq: 'daily', interval: 1 } });
    const weekly = mk({ id: 'w', date: '2019-01-06', recurrence: { freq: 'weekly', interval: 1, daysOfWeek: [6] } }); // неділі
    expect(meetingsOnDate([daily, weekly], day).map(m => m.id)).toEqual(['d_2026-09-13', 'w_2026-09-13']);
  });

  test('повтор, що починається пізніше, сьогодні не показується', () => {
    const future = mk({ id: 'f', date: '2026-09-14', recurrence: { freq: 'daily', interval: 1 } });
    expect(meetingsOnDate([future], day)).toEqual([]);
  });
});

describe('orderTodayMeetings', () => {
  const now = new Date(2026, 8, 13, 12, 0);

  test('поточні й майбутні за часом, минулі — в кінці', () => {
    const past1 = mk({ id: 'p1', time: '09:00', durationMinutes: 30 });
    const past2 = mk({ id: 'p2', time: '08:00', durationMinutes: 60 });
    const current = mk({ id: 'c', time: '11:30', durationMinutes: 60 });
    const later = mk({ id: 'l', time: '15:00' });
    const soon = mk({ id: 's', time: '12:30' });
    const out = orderTodayMeetings([later, past1, current, soon, past2], now);
    expect(out.map(r => r.meeting.id)).toEqual(['c', 's', 'l', 'p2', 'p1']);
    expect(out.map(r => r.phase)).toEqual(['current', 'upcoming', 'upcoming', 'past', 'past']);
  });

  test('межі: кінець == now — минула; початок == now — поточна', () => {
    const endsNow = mk({ id: 'a', time: '11:00', durationMinutes: 60 });
    const startsNow = mk({ id: 'b', time: '12:00', durationMinutes: 15 });
    const out = orderTodayMeetings([endsNow, startsNow], now);
    expect(out).toEqual([
      { meeting: startsNow, phase: 'current' },
      { meeting: endsNow, phase: 'past' },
    ]);
  });

  test('порожній чи "--:--" час — 00:00; нульова тривалість одразу минула', () => {
    const noTime = mk({ id: 'n', time: '' });
    const dashes = mk({ id: 'd', time: '--:--', durationMinutes: 0 });
    const out = orderTodayMeetings([noTime, dashes], now);
    expect(out.every(r => r.phase === 'past')).toBe(true);
  });

  test('рівний час — за назвою (uk), потім за id', () => {
    const b = mk({ id: '2', title: 'Бета', time: '13:00' });
    const a = mk({ id: '3', title: 'Альфа', time: '13:00' });
    const a2 = mk({ id: '1', title: 'Альфа', time: '13:00' });
    expect(orderTodayMeetings([b, a, a2], now).map(r => r.meeting.id)).toEqual(['1', '3', '2']);
  });

  test('прев’ю — 4 зустрічі', () => {
    expect(TODAY_MEETINGS_PREVIEW).toBe(4);
  });
});
