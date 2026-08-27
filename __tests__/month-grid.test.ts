import { monthGrid } from '../utils/dateUtils';

describe('monthGrid', () => {
  it('рядки завжди по сім клітинок', () => {
    for (let m = 0; m < 12; m++) {
      for (const week of monthGrid(2026, m)) expect(week).toHaveLength(7);
    }
  });

  it('містить кожне число місяця рівно раз', () => {
    const days = monthGrid(2026, 7).flat().filter(d => d !== null);
    expect(days).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
  });

  it('тиждень починається з понеділка', () => {
    // 1 серпня 2026 — субота, тобто пʼята позиція в тижні (Пн=0).
    expect(monthGrid(2026, 7)[0].indexOf(1)).toBe(5);
  });

  it('неділя як перший день дає шість порожніх клітинок, а не мінус одну', () => {
    // getDay() віддає 0 для неділі; наївне d - 1 дало б -1, порожній
    // відступ зник би, і весь місяць зсунувся б на день.
    // 1 листопада 2026 — неділя.
    const first = monthGrid(2026, 10)[0];
    expect(first.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(first[6]).toBe(1);
  });

  it('лютий високосного року', () => {
    expect(monthGrid(2028, 1).flat().filter(d => d !== null)).toHaveLength(29);
    expect(monthGrid(2026, 1).flat().filter(d => d !== null)).toHaveLength(28);
  });

  it('порожні клітинки лише на краях', () => {
    const flat = monthGrid(2026, 7).flat();
    const firstDay = flat.indexOf(1);
    const lastDay = flat.lastIndexOf(31);
    expect(flat.slice(firstDay, lastDay + 1).every(d => d !== null)).toBe(true);
  });
});
