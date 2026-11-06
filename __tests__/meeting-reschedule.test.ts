/**
 * __tests__/meeting-reschedule.test.ts — «Перенести» і перетягування зустрічі.
 *
 * Звичайна зустріч міняє власні дату/час; екземпляр повтору — лише сам себе
 * (виняток recurrenceOverrides на оригіналі), і розгортання це враховує
 * скрізь: календар, «Сьогодні», секції проєкту.
 */
import {
  addDaysKey, dropTarget, MEETING_TIME_SLOTS, occurrenceDateOf, presetTarget, rescheduleMeeting,
  restoreMeetingSchedule, scheduleSnapshot, shiftSlot, slotIndexFor,
} from '@/utils/meetingReschedule';
import { expandMeetings, expandRecurring, meetingsOnDate, type Meeting } from '@/utils/meetings';

const weekly: Meeting = {
  id: 'w1', title: 'Стендап', date: '2026-11-02', time: '10:00', durationMinutes: 30, color: '#6366F1',
  recurrence: { freq: 'weekly', interval: 1 },
};
const single: Meeting = {
  id: 's1', title: 'Демо', date: '2026-11-05', time: '15:00', durationMinutes: 60, color: '#0EA5E9',
};

const range = (a: string, b: string) => [new Date(a + 'T00:00'), new Date(b + 'T23:59')] as const;

describe('слоти часу', () => {
  it('48 слотів по 30 хв від 00:00 до 23:30', () => {
    expect(MEETING_TIME_SLOTS).toHaveLength(48);
    expect(MEETING_TIME_SLOTS[0]).toBe('00:00');
    expect(MEETING_TIME_SLOTS[19]).toBe('09:30');
    expect(MEETING_TIME_SLOTS[47]).toBe('23:30');
  });
  it('прокрутка — до вибраного, інакше до поточного часу', () => {
    expect(slotIndexFor('09:30')).toBe(19);
    expect(slotIndexFor('09:45')).toBe(19);
    expect(slotIndexFor('', new Date(2026, 10, 6, 14, 10))).toBe(28);
  });
});

describe('пресети «Перенести»', () => {
  const from = { date: '2026-11-06', time: '23:45' };
  it('+30 хв і +1 год переходять через північ', () => {
    expect(presetTarget('plus30', from)).toEqual({ date: '2026-11-07', time: '00:15' });
    expect(presetTarget('plus60', from)).toEqual({ date: '2026-11-07', time: '00:45' });
  });
  it('завтра / наступного тижня — той самий час', () => {
    expect(presetTarget('tomorrow', from)).toEqual({ date: '2026-11-07', time: '23:45' });
    expect(presetTarget('nextWeek', from)).toEqual({ date: '2026-11-13', time: '23:45' });
  });
  it('зустріч без часу: +30/+1 год недоступні, дні — так', () => {
    const noTime = { date: '2026-11-06', time: '' };
    expect(presetTarget('plus30', noTime)).toBeNull();
    expect(presetTarget('tomorrow', noTime)).toEqual({ date: '2026-11-07', time: '' });
    expect(shiftSlot(noTime, 30)).toBe(noTime);
  });
  it('addDaysKey переходить межу місяця', () => {
    expect(addDaysKey('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('перетягування: куди лягає блок', () => {
  it('крок 30 хв і зсув днів', () => {
    expect(dropTarget({ date: '2026-11-05', time: '10:00' }, 1, 40)).toEqual({ date: '2026-11-06', time: '10:30' });
    expect(dropTarget({ date: '2026-11-05', time: '10:00' }, 0, -95)).toEqual({ date: '2026-11-05', time: '08:30' });
  });
  it('не виходить за межі доби', () => {
    expect(dropTarget({ date: '2026-11-05', time: '01:00' }, 0, -300).time).toBe('00:00');
    expect(dropTarget({ date: '2026-11-05', time: '22:00' }, 0, 600).time).toBe('23:30');
  });
});

describe('звичайна зустріч', () => {
  it('переносить власні дату й час', () => {
    const next = rescheduleMeeting([single, weekly], single, { date: '2026-11-06', time: '09:00' });
    expect(next[0]).toMatchObject({ id: 's1', date: '2026-11-06', time: '09:00', durationMinutes: 60 });
    expect(next[1]).toBe(weekly);
  });
  it('та сама ціль чи невідома зустріч — той самий масив (синк не будиться)', () => {
    const list = [single];
    expect(rescheduleMeeting(list, single, { date: single.date, time: single.time })).toBe(list);
    expect(rescheduleMeeting(list, { ...single, id: 'nope' }, { date: '2026-11-07', time: '09:00' })).toBe(list);
  });
  it('«Скасувати» повертає лише розклад, інші правки лишаються', () => {
    const snap = scheduleSnapshot(single);
    const moved = rescheduleMeeting([single], single, { date: '2026-11-09', time: '11:30' });
    const edited = [{ ...moved[0], notes: 'дописали' }];
    const restored = restoreMeetingSchedule(edited, snap);
    expect(restored[0]).toMatchObject({ date: '2026-11-05', time: '15:00', notes: 'дописали' });
  });
});

describe('екземпляр повтору — лише він', () => {
  const instances = () => expandRecurring(weekly, ...range('2026-11-01', '2026-11-30'));

  it('екземпляр знає свою первісну дату', () => {
    const inst = instances()[1];
    expect(inst._occurrenceDate).toBe('2026-11-09');
    expect(occurrenceDateOf(inst)).toBe('2026-11-09');
    // Старий екземпляр без позначки — дата з id.
    expect(occurrenceDateOf({ id: 'w1_2026-11-09', date: '2026-11-10', _origId: 'w1' })).toBe('2026-11-09');
  });

  it('перенос пише виняток, серія лишається на місці', () => {
    const inst = instances()[1];
    const [orig] = rescheduleMeeting([weekly], inst, { date: '2026-11-10', time: '12:00' });
    expect(orig.date).toBe('2026-11-02');
    expect(orig.time).toBe('10:00');
    expect(orig.recurrenceOverrides).toEqual({ '2026-11-09': { date: '2026-11-10', time: '12:00' } });

    const expanded = expandRecurring(orig, ...range('2026-11-01', '2026-11-30'));
    expect(expanded.map(m => `${m.date} ${m.time}`)).toEqual([
      '2026-11-02 10:00', '2026-11-10 12:00', '2026-11-16 10:00', '2026-11-23 10:00', '2026-11-30 10:00',
    ]);
    // id — від первісної дати: вибраний екземпляр не губиться.
    expect(expanded[1].id).toBe('w1_2026-11-09');
  });

  it('перенесений раніше за сусіда — порядок за датою', () => {
    const inst = instances()[2]; // 16-те
    const [orig] = rescheduleMeeting([weekly], inst, { date: '2026-11-03', time: '09:00' });
    const dates = expandRecurring(orig, ...range('2026-11-01', '2026-11-30')).map(m => m.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('повторний перенос того ж екземпляра і повернення на правило прибирають виняток', () => {
    const inst = instances()[1];
    const [once] = rescheduleMeeting([weekly], inst, { date: '2026-11-10', time: '12:00' });
    const moved = expandRecurring(once, ...range('2026-11-01', '2026-11-30'))[1];
    const [twice] = rescheduleMeeting([once], moved, { date: '2026-11-11', time: '12:00' });
    expect(twice.recurrenceOverrides).toEqual({ '2026-11-09': { date: '2026-11-11', time: '12:00' } });
    const again = expandRecurring(twice, ...range('2026-11-01', '2026-11-30'))[1];
    const [back] = rescheduleMeeting([twice], again, { date: '2026-11-09', time: '10:00' });
    expect(back.recurrenceOverrides).toBeUndefined();
    expect('recurrenceOverrides' in back).toBe(false);
  });

  it('«Скасувати» повертає винятки, як були', () => {
    const inst = instances()[1];
    const snap = scheduleSnapshot(weekly);
    const moved = rescheduleMeeting([weekly], inst, { date: '2026-11-10', time: '12:00' });
    const [restored] = restoreMeetingSchedule(moved, snap);
    expect('recurrenceOverrides' in restored).toBe(false);
    const back = expandRecurring(restored, ...range('2026-11-01', '2026-11-30')).find(i => i.id === 'w1_2026-11-09');
    expect(back?.date).toBe('2026-11-09');
  });

  it('скасований екземпляр зникає', () => {
    const m: Meeting = { ...weekly, recurrenceOverrides: { '2026-11-09': { cancelled: true } } };
    expect(expandRecurring(m, ...range('2026-11-01', '2026-11-15')).map(i => i.date)).toEqual(['2026-11-02']);
  });

  it('«Сьогодні»: перенесений НА цей день видно, а з цього дня — ні', () => {
    const m: Meeting = { ...weekly, recurrenceOverrides: { '2026-11-09': { date: '2026-11-11', time: '08:00' } } };
    expect(meetingsOnDate([m], new Date(2026, 10, 9))).toHaveLength(0);
    const on11 = meetingsOnDate([m], new Date(2026, 10, 11));
    expect(on11).toHaveLength(1);
    expect(on11[0]).toMatchObject({ date: '2026-11-11', time: '08:00', _origId: 'w1' });
  });

  it('виняток переживає JSON (синк) і розгортається так само', () => {
    const m: Meeting = { ...weekly, recurrenceOverrides: { '2026-11-09': { date: '2026-11-10', time: '12:00', durationMinutes: 45 } } };
    const wire = JSON.parse(JSON.stringify(m)) as Meeting;
    const inst = expandMeetings([wire], ...range('2026-11-10', '2026-11-10')).find(i => i.date === '2026-11-10');
    expect(inst).toMatchObject({ time: '12:00', durationMinutes: 45 });
  });
});

describe('екземпляр, перенесений у вікно з-поза нього', () => {
  const series: Meeting = {
    id: 'w', title: 'Тиждень', date: '2026-11-02', time: '10:00', durationMinutes: 60, color: '#3B82F6',
    recurrence: { freq: 'weekly', interval: 1 },
    recurrenceOverrides: {
      // Понеділок 16.11 перенесено на неділю 15.11 (попередній тиждень).
      '2026-11-16': { date: '2026-11-15', time: '18:00' },
      // Два екземпляри, переставлені місцями, не зациклюють розгортання.
      '2026-11-23': { date: '2026-11-30' },
      '2026-11-30': { date: '2026-11-23' },
    },
  } as Meeting;

  it('показує його в тижні, куди перенесли', () => {
    const list = expandMeetings([series], new Date(2026, 10, 9), new Date(2026, 10, 15, 23, 59, 59));
    const moved = list.find(m => m._occurrenceDate === '2026-11-16');
    expect(moved?.date).toBe('2026-11-15');
    expect(moved?.time).toBe('18:00');
  });

  it('переставлені місцями екземпляри — кожен один раз', () => {
    const list = expandRecurring(series, new Date(2026, 10, 30), new Date(2026, 10, 30, 23, 59, 59));
    const ids = list.filter(m => m.date === '2026-11-30').map(m => m.id);
    expect(ids).toEqual(['w_2026-11-23']);
  });
});
