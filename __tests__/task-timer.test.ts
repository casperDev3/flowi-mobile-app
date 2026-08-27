import {
  activeSessionSeconds,
  completedSessionCount,
  elapsedSince,
  getActiveTimerEntry,
  totalSecondsIncludingActive,
  totalTrackedSeconds,
  type TimedTask,
} from '../utils/taskTimer';

const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const done = (id: string, duration: number) => ({ id, startedAt: ago(9999), endedAt: ago(9000), duration });
const running = (id: string, secondsAgo: number) => ({ id, startedAt: ago(secondsAgo), duration: 0 });

describe('getActiveTimerEntry', () => {
  it('знаходить сесію без endedAt', () => {
    const task: TimedTask = { timeEntries: [done('a', 60), running('b', 30)] };
    expect(getActiveTimerEntry(task)?.id).toBe('b');
  });

  it('без записів — undefined, а не падіння', () => {
    expect(getActiveTimerEntry({})).toBeUndefined();
    expect(getActiveTimerEntry({ timeEntries: [] })).toBeUndefined();
  });

  it('усі сесії завершені — undefined', () => {
    expect(getActiveTimerEntry({ timeEntries: [done('a', 60)] })).toBeUndefined();
  });
});

describe('elapsedSince', () => {
  it('рахує різницю в секундах', () => {
    expect(elapsedSince(ago(125), NOW)).toBe(125);
  });

  it('НЕ буває відʼємним', () => {
    // Годинник пристрою може зʼїхати назад — зміна поясу, ручне
    // переведення. Показане «-3 секунди» читалося б як поламаний
    // застосунок, а не як зміщений годинник.
    const future = new Date(NOW + 5000).toISOString();
    expect(elapsedSince(future, NOW)).toBe(0);
  });
});

describe('підрахунок часу', () => {
  const task: TimedTask = { timeEntries: [done('a', 600), done('b', 300), running('c', 45)] };

  it('totalTrackedSeconds рахує лише завершені', () => {
    expect(totalTrackedSeconds(task)).toBe(900);
  });

  it('totalSecondsIncludingActive додає поточну сесію', () => {
    // Різниця між двома підрахунками — це те, що досі йде. Якби активну
    // сесію брали за її duration (нуль до зупинки), час зникав би з
    // очей рівно поки його витрачають.
    expect(totalSecondsIncludingActive(task, NOW)).toBe(945);
  });

  it('activeSessionSeconds — лише поточна', () => {
    expect(activeSessionSeconds(task, NOW)).toBe(45);
    expect(activeSessionSeconds({ timeEntries: [done('a', 600)] }, NOW)).toBe(0);
  });

  it('completedSessionCount не рахує ту, що триває', () => {
    expect(completedSessionCount(task)).toBe(2);
  });

  it('порожнє завдання дає нулі, а не NaN', () => {
    expect(totalTrackedSeconds({})).toBe(0);
    expect(totalSecondsIncludingActive({}, NOW)).toBe(0);
    expect(activeSessionSeconds({}, NOW)).toBe(0);
    expect(completedSessionCount({})).toBe(0);
  });
});
