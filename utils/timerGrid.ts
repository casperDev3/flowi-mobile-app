/**
 * utils/timerGrid.ts — розкладка сітки повноекранних таймерів.
 *
 * Живе окремо від компонента, бо це арифметика, а не розмітка: її можна
 * перевірити тестом, і саме тут ховалася помилка, через яку єдиний таймер,
 * що лишився після зупинки сусіда, тримав половину екрана.
 *
 * Головне правило: сітка не має сталої форми. Кількість колонок визначає
 * кількість таймерів, а не клас розміру екрана — стеля лише обмежує її
 * згори.
 */

export interface TimerGridOptions {
  /** Скільки таймерів показуємо. */
  count: number;
  /** Стеля колонок для цього класу розміру: 1 у вузькому вікні, 2 у широкому. */
  maxColumns: number;
  /** Скільки рядів влазить в екран; далі — скрол. */
  rowsPerScreen: number;
  /** Доступна ширина під сітку (без падінгів і вирізів). */
  gridWidth: number;
  /** Доступна висота під сітку. */
  gridHeight: number;
  gap: number;
  /** Нижче цієї висоти клітинка перестає бути читабельною. */
  minCellHeight: number;
}

export interface TimerGridLayout {
  columns: number;
  rows: number;
  cellHeight: number;
  /** Ширина кожної клітинки за її місцем — довжина масиву дорівнює count. */
  widths: number[];
}

export function timerGridLayout(o: TimerGridOptions): TimerGridLayout {
  if (o.count <= 0) {
    return { columns: 1, rows: 1, cellHeight: o.minCellHeight, widths: [] };
  }

  // Колонок рівно стільки, скільки таймерів, але не більше за стелю.
  const columns = Math.max(1, Math.min(o.maxColumns, o.count));

  const rows = Math.max(1, Math.min(Math.ceil(o.count / columns), o.rowsPerScreen));
  const cellHeight = Math.max(o.minCellHeight, (o.gridHeight - o.gap * (rows - 1)) / rows);

  const cellWidth = (o.gridWidth - o.gap * (columns - 1)) / columns;

  // Непарний останній розтягується на весь рядок. Інакше при трьох таймерах
  // він стоїть сам у нижньому ряду, лишаючи поряд дірку рівно свого розміру, —
  // а порожнеча біля годинника читається як «щось не завантажилось».
  const orphan = columns > 1 && o.count % columns === 1;
  const widths = Array.from({ length: o.count }, (_, i) =>
    orphan && i === o.count - 1 ? o.gridWidth : cellWidth,
  );

  return { columns, rows, cellHeight, widths };
}

/**
 * Кегль годинника для клітинки заданих розмірів.
 *
 * Рахується від самої клітинки, а не від сітки: розтягнутий на весь рядок
 * таймер має право на більші цифри. Стеля 72 — щоб на широкому екрані
 * годинник не перетворювався на банер.
 */
export function timerClockSize(cellWidth: number, cellHeight: number): number {
  return Math.round(Math.max(30, Math.min(cellHeight * 0.32, cellWidth * 0.24, 72)));
}

/** Скільки висоти клітинки зайнято не циферблатом: підпис, кнопка, підзавдання. */
const CELL_CHROME_H = 96;
const CELL_CHROME_W = 28;

/**
 * Полотно циферблата в клітинці.
 *
 * Це НЕ кегль цифр: круглим циферблатам потрібен квадрат під саму фігуру, і
 * вони самі вирішують, як його витратити. Рахується від меншого з боків — те,
 * що не влізе у висоту, не врятує ширина.
 *
 * Стеля 240 не з міркувань смаку: пісочний годинник і хронограф на весь екран
 * перетворюються на ілюстрацію, поряд з якою час доводиться шукати.
 */
export function timerDialSize(cellWidth: number, cellHeight: number): number {
  const available = Math.min(cellWidth - CELL_CHROME_W, cellHeight - CELL_CHROME_H);
  return Math.round(Math.max(72, Math.min(available, 240)));
}
