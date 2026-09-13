/**
 * __tests__/active-timers-bar.test.ts — глобальна панель активних таймерів.
 *
 * Перевіряється те, що ламається тихо: панель, яка перекриває FAB, бо відступ
 * її не врахував; «2 таймерів» замість «2 таймери»; годинник не того таймера.
 */
import {
  ACTIVE_TIMERS_BAR_HEIGHT,
  TAB_BAR_HEIGHT,
  activeTimersBarVisible,
  tabBarInsetFor,
} from '../constants/nav';
import { allTranslations } from '../store/translations';
import type { ActiveTimer } from '../utils/activeTimers';
import { pluralForm, primaryTimer, timerKind, timersCountLabel } from '../utils/activeTimersBar';

describe('видимість і відступ', () => {
  it('на телефоні видно лише коли є таймери', () => {
    expect(activeTimersBarVisible(false, 0)).toBe(false);
    expect(activeTimersBarVisible(false, 1)).toBe(true);
    expect(activeTimersBarVisible(false, 5)).toBe(true);
  });

  it('на широкому екрані панелі над табами немає ніколи (там картка в сайдбарі)', () => {
    expect(activeTimersBarVisible(true, 3)).toBe(false);
  });

  it('відступ таб-бару додає висоту панелі лише коли вона видна', () => {
    expect(tabBarInsetFor(false, 0)).toBe(TAB_BAR_HEIGHT);
    expect(tabBarInsetFor(false, 2)).toBe(TAB_BAR_HEIGHT + ACTIVE_TIMERS_BAR_HEIGHT);
    expect(tabBarInsetFor(true, 0)).toBe(0);
    expect(tabBarInsetFor(true, 2)).toBe(0);
  });

  it('биті лічильники не показують панель', () => {
    expect(activeTimersBarVisible(false, NaN)).toBe(false);
    expect(activeTimersBarVisible(false, -1)).toBe(false);
  });
});

describe('pluralForm / timersCountLabel', () => {
  const uk = allTranslations.uk;
  const en = allTranslations.en;

  it('українські форми 1 / 2-4 / 5+ / 11-14', () => {
    expect(timersCountLabel(1, 'uk', uk)).toBe('1 таймер');
    expect(timersCountLabel(2, 'uk', uk)).toBe('2 таймери');
    expect(timersCountLabel(4, 'uk', uk)).toBe('4 таймери');
    expect(timersCountLabel(5, 'uk', uk)).toBe('5 таймерів');
    expect(timersCountLabel(11, 'uk', uk)).toBe('11 таймерів');
    expect(timersCountLabel(12, 'uk', uk)).toBe('12 таймерів');
    expect(timersCountLabel(14, 'uk', uk)).toBe('14 таймерів');
    expect(timersCountLabel(21, 'uk', uk)).toBe('21 таймер');
    expect(timersCountLabel(22, 'uk', uk)).toBe('22 таймери');
    expect(timersCountLabel(111, 'uk', uk)).toBe('111 таймерів');
  });

  it('англійська — лише one/many', () => {
    expect(timersCountLabel(1, 'en', en)).toBe('1 timer');
    expect(timersCountLabel(2, 'en', en)).toBe('2 timers');
    expect(timersCountLabel(21, 'en', en)).toBe('21 timers');
    expect(pluralForm(0, 'en')).toBe('many');
  });
});

describe('timerKind / primaryTimer', () => {
  const t = (over: Partial<ActiveTimer>): ActiveTimer => ({
    id: 'x', label: 'L', startedAt: '2026-09-13T10:00:00.000Z', shift: 'day', ...over,
  });

  it('вид — за полями, а не за префіксом id', () => {
    expect(timerKind(t({ taskId: '1' }))).toBe('task');
    expect(timerKind(t({ meetingId: 'm' }))).toBe('meeting');
    expect(timerKind(t({ id: 'task:looks-like-task' }))).toBe('adhoc');
  });

  it('головний — найстаріший, незалежно від порядку в масиві', () => {
    const newer = t({ id: 'b', startedAt: '2026-09-13T11:00:00.000Z' });
    const older = t({ id: 'a', startedAt: '2026-09-13T09:00:00.000Z' });
    expect(primaryTimer([newer, older])?.id).toBe('a');
    expect(primaryTimer([])).toBeUndefined();
  });
});
