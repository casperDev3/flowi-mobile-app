/**
 * __tests__/timer-grid.test.ts — сітка мусить займати весь простір.
 *
 * Баг, який це ловить: кількість колонок була прибита до класу розміру
 * (isCompact ? 1 : 2), тож єдиний таймер, що лишався після зупинки сусіда,
 * тримав половину екрана, а друга половина стояла порожня.
 */

import { timerClockSize, timerGridLayout } from '../utils/timerGrid';

/** Широке вікно iPad в альбомі: 1194×834 мінус падінги й шапка. */
const WIDE = {
  maxColumns: 2,
  rowsPerScreen: 2,
  gridWidth: 1130,
  gridHeight: 740,
  gap: 12,
  minCellHeight: 132,
};

const NARROW = { ...WIDE, maxColumns: 1, rowsPerScreen: 4, gridWidth: 358, gridHeight: 690 };

describe('timerGridLayout', () => {
  it('єдиний таймер займає ВСЮ ширину, а не половину', () => {
    const { columns, widths } = timerGridLayout({ ...WIDE, count: 1 });
    expect(columns).toBe(1);
    expect(widths).toEqual([WIDE.gridWidth]);
  });

  it('два таймери діляться порівну', () => {
    const { columns, widths } = timerGridLayout({ ...WIDE, count: 2 });
    expect(columns).toBe(2);
    expect(widths[0]).toBe(widths[1]);
    expect(widths[0] * 2 + WIDE.gap).toBeCloseTo(WIDE.gridWidth);
  });

  it('зупинка одного з двох повертає другому весь простір', () => {
    // Саме цей перехід і був зламаний: сітка лишалася двоколонковою.
    const before = timerGridLayout({ ...WIDE, count: 2 });
    const after = timerGridLayout({ ...WIDE, count: 1 });
    expect(after.widths[0]).toBeGreaterThan(before.widths[0]);
    expect(after.widths[0]).toBe(WIDE.gridWidth);
  });

  it('непарний третій розтягується на весь нижній ряд', () => {
    const { widths } = timerGridLayout({ ...WIDE, count: 3 });
    expect(widths[0]).toBe(widths[1]);
    expect(widths[2]).toBe(WIDE.gridWidth);
  });

  it('чотири таймери — рівна сітка 2×2 без розтягувань', () => {
    const { columns, rows, widths } = timerGridLayout({ ...WIDE, count: 4 });
    expect(columns).toBe(2);
    expect(rows).toBe(2);
    expect(new Set(widths).size).toBe(1);
  });

  it('уся ширина вибирається без дірок за будь-якої кількості', () => {
    for (let count = 1; count <= 8; count++) {
      const { columns, widths } = timerGridLayout({ ...WIDE, count });
      // Перший ряд завжди заповнений повністю.
      const firstRow = widths.slice(0, columns);
      const used = firstRow.reduce((a, w) => a + w, 0) + WIDE.gap * (firstRow.length - 1);
      expect(used).toBeCloseTo(WIDE.gridWidth);
    }
  });

  it('вузьке вікно лишається одноколонковим за будь-якої кількості', () => {
    for (const count of [1, 2, 5]) {
      const { columns, widths } = timerGridLayout({ ...NARROW, count });
      expect(columns).toBe(1);
      expect(new Set(widths)).toEqual(new Set([NARROW.gridWidth]));
    }
  });

  it('понад стелю рядів висота клітинки не падає далі — далі скрол', () => {
    const four = timerGridLayout({ ...WIDE, count: 4 });
    const eight = timerGridLayout({ ...WIDE, count: 8 });
    expect(eight.rows).toBe(four.rows);
    expect(eight.cellHeight).toBe(four.cellHeight);
    expect(eight.widths).toHaveLength(8);
  });

  it('клітинка ніколи не нижча за поріг читабельності', () => {
    const cramped = timerGridLayout({ ...WIDE, gridHeight: 120, count: 4 });
    expect(cramped.cellHeight).toBe(WIDE.minCellHeight);
  });

  it('порожній список не ділить на нуль', () => {
    const empty = timerGridLayout({ ...WIDE, count: 0 });
    expect(empty.widths).toEqual([]);
    expect(Number.isFinite(empty.cellHeight)).toBe(true);
  });
});

describe('timerClockSize', () => {
  it('ширша клітинка дає більші цифри, поки ширина — вузьке місце', () => {
    // Висота однакова й невелика, тож розмір визначає саме ширина. На великих
    // клітинках обидві впираються в стелю 72 і порівняння нічого не показує.
    expect(timerClockSize(400, 200)).toBeGreaterThan(timerClockSize(200, 200));
  });

  it('має стелю, щоб годинник не став банером', () => {
    expect(timerClockSize(4000, 4000)).toBe(72);
  });

  it('має підлогу, щоб не зникнути в тісній клітинці', () => {
    expect(timerClockSize(40, 40)).toBe(30);
  });
});
