import { type ActiveTimer } from '../utils/activeTimers';
import {
  buildMeetingTimer,
  closeMeetingSession,
  findTimerForMeeting,
  isMeetingTimer,
  meetingTimerId,
  meetingTrackedSeconds,
  type Meeting,
} from '../utils/meetings';

const NOW = new Date('2026-08-27T12:00:00Z');
const meeting = (over: Partial<Meeting> = {}): Meeting => ({
  id: 'm1',
  title: 'Планерка',
  date: '2026-08-27',
  time: '10:00',
  durationMinutes: 30,
  color: '#6366F1',
  ...over,
});

describe('id таймера наради', () => {
  it('похідний від id наради', () => {
    expect(meetingTimerId('m1')).toBe('meeting:m1');
    expect(buildMeetingTimer(meeting(), NOW).id).toBe('meeting:m1');
  });

  it('той самий на двох пристроях — інакше LWW не зіллє записи', () => {
    // Ключова властивість: два старти однієї наради дають ОДИН local_id, тож
    // сервер бачить один запис. З випадковими id вийшло б два паралельні
    // таймери, і зупинка одного лишила б другий вічно активним.
    const phone = buildMeetingTimer(meeting(), new Date('2026-08-27T12:00:00Z'));
    const laptop = buildMeetingTimer(meeting(), new Date('2026-08-27T12:00:09Z'));
    expect(phone.id).toBe(laptop.id);
  });

  it('не перетинається з id таймера завдання', () => {
    // Нарада і завдання можуть мати однаковий id — вони з різних колекцій.
    // Спільний простір local_id склеїв би два різні таймери в один.
    expect(meetingTimerId('7')).not.toBe('task:7');
  });
});

describe('впізнавання таймера наради', () => {
  const timers: ActiveTimer[] = [
    { id: 'adhoc:1', label: 'Читання', startedAt: NOW.toISOString(), shift: 'day' },
    { id: 'task:7', taskId: '7', label: 'Завдання', startedAt: NOW.toISOString(), shift: 'day' },
    buildMeetingTimer(meeting(), NOW),
  ];

  it('шукається за meetingId, а не за розбором id', () => {
    expect(findTimerForMeeting(timers, 'm1')?.id).toBe('meeting:m1');
    expect(findTimerForMeeting(timers, 'm2')).toBeUndefined();
  });

  it('таймери завдань і вільні за нараду себе не видають', () => {
    expect(timers.filter(isMeetingTimer).map(t => t.id)).toEqual(['meeting:m1']);
  });

  it('таймер наради не прикидається таймером завдання', () => {
    // taskId лишається порожнім навмисно: саме за ним стор вирішує, чи
    // рухати запис по дошці й чи дописувати сесію в завдання. Заповнений
    // «про всяк випадок», він відправив би нараду в колонку «На перевірці».
    const timer = buildMeetingTimer(meeting(), NOW);
    expect(timer.taskId).toBeUndefined();
    expect(timer.meetingId).toBe('m1');
  });
});

describe('стоп пише сесію в нараду', () => {
  const timer = buildMeetingTimer(meeting(), new Date('2026-08-27T11:30:00Z'));
  const endedAt = new Date('2026-08-27T12:00:00Z');

  it('дописує завершений запис із endedAt і тривалістю', () => {
    const next = closeMeetingSession(meeting(), timer, endedAt, 1800);
    expect(next.timeEntries).toEqual([{
      id: `meeting:m1-${endedAt.getTime().toString(36)}`,
      startedAt: '2026-08-27T11:30:00.000Z',
      endedAt: '2026-08-27T12:00:00.000Z',
      duration: 1800,
    }]);
  });

  it('не чіпає попередні сесії й решту полів наради', () => {
    const before = meeting({
      notes: 'порядок денний',
      timeEntries: [{ id: 'old', startedAt: '2026-08-20T10:00:00.000Z', endedAt: '2026-08-20T10:10:00.000Z', duration: 600 }],
    });
    const next = closeMeetingSession(before, timer, endedAt, 1800);
    expect(next.timeEntries).toHaveLength(2);
    expect(next.timeEntries?.[0].id).toBe('old');
    expect(next.notes).toBe('порядок денний');
    // Вхідний обʼєкт лишається недоторканим: екран тримає його у власному
    // стані, і мутація на місці не викликала б перерендер.
    expect(before.timeEntries).toHaveLength(1);
  });

  it('повторний стоп тієї самої секунди не подвоює час', () => {
    // id сесії детермінований, тож дубль перекриває сам себе за id, а не
    // додає другу сесію з тим самим інтервалом.
    const once = closeMeetingSession(meeting(), timer, endedAt, 1800);
    const twice = closeMeetingSession(meeting(), timer, endedAt, 1800);
    expect(once.timeEntries?.[0].id).toBe(twice.timeEntries?.[0].id);
  });
});

describe('сумарний час наради', () => {
  it('підсумовує завершені сесії', () => {
    const m = meeting({
      timeEntries: [
        { id: 'a', startedAt: '2026-08-20T10:00:00.000Z', endedAt: '2026-08-20T10:10:00.000Z', duration: 600 },
        { id: 'b', startedAt: '2026-08-21T10:00:00.000Z', endedAt: '2026-08-21T10:05:00.000Z', duration: 300 },
      ],
    });
    expect(meetingTrackedSeconds(m)).toBe(900);
  });

  it('нарада без сесій дає нуль, а не NaN', () => {
    expect(meetingTrackedSeconds(meeting())).toBe(0);
    expect(meetingTrackedSeconds(meeting({ timeEntries: [] }))).toBe(0);
  });

  it('запис без endedAt у підсумок не йде', () => {
    // Такого запису бути не має — сесія, що триває, живе в active_timers.
    // Але старий бекап може принести його назад, і тривалості в ньому немає.
    const m = meeting({
      timeEntries: [
        { id: 'a', startedAt: '2026-08-20T10:00:00.000Z', endedAt: '2026-08-20T10:10:00.000Z', duration: 600 },
        { id: 'open', startedAt: '2026-08-27T11:00:00.000Z', duration: 0 },
      ],
    });
    expect(meetingTrackedSeconds(m)).toBe(600);
  });
});
