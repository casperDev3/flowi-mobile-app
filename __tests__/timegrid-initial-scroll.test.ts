/**
 * __tests__/timegrid-initial-scroll.test.ts — з якої години відкривається
 * погодинна сітка (components/calendar/TimeGrid.tsx, initialScrollHour).
 *
 * Аудит: тижнева сітка на iPad о 23:52 відкривалась на 00:00, і наради
 * 10:00/14:30 того дня були за кадром.
 */
import { initialScrollHour } from '../components/calendar/TimeGrid';

const DAYS = ['2026-10-05', '2026-10-06', '2026-10-07'];
const TODAY = '2026-10-07';
const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

describe('initialScrollHour', () => {
  it('пізно ввечері — до першої наради періоду, а не до «зараз»', () => {
    const meetings = { '2026-10-07': [{ time: '14:30' }, { time: '10:00' }] };
    expect(initialScrollHour(DAYS, TODAY, meetings, at(23, 52))).toBe(10);
  });

  it('у робочий час із сьогоднішнім днем — година до «зараз»', () => {
    expect(initialScrollHour(DAYS, TODAY, {}, at(18, 5))).toBe(17);
  });

  it('без нарад і поза сьогоднішнім днем — 07:00', () => {
    expect(initialScrollHour(['2026-10-12'], TODAY, {}, at(12))).toBe(7);
  });

  it('не прокручує нижче 18:00', () => {
    expect(initialScrollHour(['2026-10-12'], TODAY, { '2026-10-12': [{ time: '22:00' }] }, at(12))).toBe(18);
  });
});
