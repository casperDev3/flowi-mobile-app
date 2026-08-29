import {
  completedSessions,
  elapsedSince,
  totalSecondsIncludingActive,
  totalTrackedSeconds,
  type TimedTask,
} from '../utils/taskTimer';

const NOW = new Date('2026-08-27T12:00:00Z').getTime();
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

const done = (id: string, duration: number) => ({ id, startedAt: ago(9999), endedAt: ago(9000), duration });
/** Форма запису зі старих даних: до переїзду на реєстр сесія жила тут без endedAt. */
const legacyOpen = (id: string, secondsAgo: number) => ({ id, startedAt: ago(secondsAgo), duration: 0 });

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
  const task: TimedTask = { timeEntries: [done('a', 600), done('b', 300)] };

  it('totalTrackedSeconds підсумовує завершені сесії', () => {
    expect(totalTrackedSeconds(task)).toBe(900);
  });

  it('totalSecondsIncludingActive додає сесію з реєстру', () => {
    // Різниця між двома підрахунками — це те, що досі йде. Мітка старту
    // приходить ззовні: у самому завданні активної сесії вже немає.
    expect(totalSecondsIncludingActive(task, ago(45), NOW)).toBe(945);
    expect(totalSecondsIncludingActive(task, undefined, NOW)).toBe(900);
  });

  it('відкритий запис зі старих даних не потрапляє в підсумки', () => {
    // Міграція такі записи виносить у реєстр, але старий бекап чи пристрій
    // зі старою версією можуть принести їх назад. Тривалості в них немає —
    // порахувати їх означало б додати нуль і показати зайву сесію.
    const legacy: TimedTask = { timeEntries: [done('a', 600), legacyOpen('c', 45)] };
    expect(totalTrackedSeconds(legacy)).toBe(600);
    expect(completedSessions(legacy).map(e => e.id)).toEqual(['a']);
  });

  it('порожнє завдання дає нулі, а не NaN', () => {
    expect(totalTrackedSeconds({})).toBe(0);
    expect(totalSecondsIncludingActive({}, undefined, NOW)).toBe(0);
    expect(completedSessions({})).toEqual([]);
  });
});
