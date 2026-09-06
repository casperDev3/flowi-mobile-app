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
 *
 * Головний вхід — timerFocusLayout: розкладка за КІЛЬКІСТЮ таймерів (один на
 * весь екран, два-чотири рівною сіткою, п'ять і більше зі скролом). Нижчий
 * рівень — timerGridLayout: ділення області на колонки й ряди.
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


// ── Хром клітинки ────────────────────────────────────────────────────────────
// Скільки висоти й ширини клітинки з'їдає все, що не є циферблатом. Раніше це
// було одне число 96 «на око», і разом зі стелею полотна воно не мало ваги:
// циферблат однаково впирався в стелю раніше, ніж у хром. Стелі більше немає,
// тож хром мусить бути чесним — інакше на планшеті циферблат наліз би на «Стоп».

/** paddingHorizontal 14 з обох боків картки. */
const CELL_CHROME_W = 28;
/** paddingVertical 12×2 + рядок назви 24 + пігулка «Стоп» ~30. */
const CELL_CHROME_H = 80;
/** Відступ блока підзавдань + рядок лічильника «N/M». */
const SUBS_BLOCK_H = 23;
/** Один рядок підзавдання: текст 11pt + marginBottom 3. */
const SUB_ROW_H = 16;
/** Нижче цього циферблат перестає читатись, і краще скрол, ніж крихта. */
const MIN_DIAL = 72;

/**
 * Скільки рядків підзавдань показує клітинка такої висоти.
 *
 * Живе тут, а не в TimerCell, бо це та сама сходинка, за якою рахується місце
 * під циферблат: якщо компонент і арифметика розійдуться, список підзавдань
 * поїде на годинник. TimerCell імпортує саме її.
 */
export function timerCellSubtaskRows(cellHeight: number): number {
  return cellHeight >= 260 ? 3 : cellHeight >= 200 ? 2 : cellHeight >= 150 ? 1 : 0;
}

/** Уся висота клітинки, що дістанеться не циферблату. */
function cellChromeHeight(cellHeight: number): number {
  const rows = timerCellSubtaskRows(cellHeight);
  return CELL_CHROME_H + (rows > 0 ? SUBS_BLOCK_H + SUB_ROW_H * rows : 0);
}

/**
 * Полотно циферблата в клітинці.
 *
 * Це НЕ кегль цифр: круглим циферблатам потрібен квадрат під саму фігуру, і
 * вони самі вирішують, як його витратити. Рахується від меншого з боків — те,
 * що не влізе у висоту, не врятує ширина.
 *
 * СТЕЛІ НЕМАЄ. Вона була 240 і разом зі стелею 320 у розгорнутому вигляді
 * тримала циферблат маленьким посеред iPad: на 1194×834 обидві спрацьовували
 * раніше за реальні межі клітинки. Обмежують лише сама клітинка й підлога
 * MIN_DIAL.
 */
export function timerDialSize(cellWidth: number, cellHeight: number): number {
  const available = Math.min(cellWidth - CELL_CHROME_W, cellHeight - cellChromeHeight(cellHeight));
  return Math.round(Math.max(MIN_DIAL, available));
}

/**
 * Полотно циферблата в розгорнутому вигляді (клітинку відкрили на весь екран).
 *
 * Окрема функція, бо хром там інший: назва згори, підпис «Поточна сесія» знизу
 * і прокручуваний список підзавдань під ними.
 *
 * Під хром резервується його СПРАВЖНЯ висота, а не частка від екрана. Частка
 * (тут колись стояло ×0.68) працювала, поки сітка впиралася в стелю 240pt: на
 * її тлі розгорнутий вигляд завжди виглядав більшим. Коли стелю прибрали,
 * сітка на iPad почала давати 589pt, а розгорнутий — 422pt, і жест «розгорнути»
 * став ЗМЕНШУВАТИ циферблат. Тепер циферблат бере всю висоту, крім
 * зарезервованої смуги, а підзавдання під ним прокручуються — їх однаково не
 * видно все одразу, скільки місця не лишай.
 */
export function timerExpandedDialSize(areaWidth: number, areaHeight: number): number {
  const EXPANDED_CHROME_H = 120;
  return Math.round(
    Math.max(MIN_DIAL, Math.min(areaWidth - CELL_CHROME_W, areaHeight - EXPANDED_CHROME_H)),
  );
}

// ── Розкладка за кількістю ───────────────────────────────────────────────────

/** Понад стільки таймерів рівна сітка вже не рятує — далі скрол. */
export const FOCUS_GRID_MAX = 4;
/**
 * Наскільки гіршим може бути циферблат, щоб розкладку все одно взяли заради
 * форми клітинки. Смуга 273×740 дає більший циферблат, ніж квадрат 559×364,
 * але простір навколо нього витрачається дарма, і чотири такі смуги на iPad
 * читаються не як сітка годинників, а як колонки.
 */
const NEAR_ENOUGH = 0.8;
/** Наскільки більшим має бути циферблат, щоб виправдати розтягнутий останній. */
const ORPHAN_GAIN = 1.05;

export interface TimerFocusOptions {
  count: number;
  /** Доступна ширина під сітку: вікно мінус вирізи й падінги. */
  width: number;
  /** Доступна висота під сітку: вікно мінус вирізи, шапка й падінги. */
  height: number;
  gap: number;
  /** Стеля колонок у режимі скролу (5+): 1 у вузькому вікні, 2 у широкому. */
  maxColumns: number;
  /** Скільки рядів лишається на екрані в режимі скролу. */
  rowsPerScreen: number;
  /** Нижче цієї висоти клітинка перестає бути читабельною. */
  minCellHeight: number;
}

export interface TimerFocusLayout {
  columns: number;
  rows: number;
  cellHeight: number;
  /** Ширина кожної клітинки за її місцем — довжина масиву дорівнює count. */
  widths: number[];
  /**
   * ОДИН розмір циферблата на всі клітинки. Головного немає: коли таймерів
   * два, вибирати з них головний немає сенсу, а різні розміри поруч читаються
   * саме як «оцей головніший».
   */
  dialSize: number;
  /** Чи не влазить сітка в екран — тоді список прокручується. */
  scrolls: boolean;
}

interface Candidate extends TimerFocusLayout {
  /** Витягнутість базової клітинки: 1 — квадрат. */
  aspect: number;
}

function candidate(o: TimerFocusOptions, columns: number, rowsCap: number): Candidate {
  const rowsNeeded = Math.ceil(o.count / columns);
  const rows = Math.max(1, Math.min(rowsNeeded, rowsCap));
  const cellHeight = Math.max(o.minCellHeight, (o.height - o.gap * (rows - 1)) / rows);
  const cellWidth = (o.width - o.gap * (columns - 1)) / columns;

  // Непарний останній розтягується на весь рядок. Інакше при трьох таймерах
  // він стоїть сам у нижньому ряду, лишаючи поряд дірку рівно свого розміру, —
  // а порожнеча біля годинника читається як «щось не завантажилось».
  const orphan = columns > 1 && o.count % columns === 1;
  const widths = Array.from({ length: o.count }, (_, i) =>
    orphan && i === o.count - 1 ? o.width : cellWidth,
  );

  // Найменша клітинка задає розмір усім: рівність важливіша за пару зайвих
  // пунктів у розтягнутого.
  const dialSize = widths.reduce(
    (min, w) => Math.min(min, timerDialSize(w, cellHeight)),
    Number.POSITIVE_INFINITY,
  );

  const contentHeight = rowsNeeded * cellHeight + o.gap * (rowsNeeded - 1);
  return {
    columns,
    rows,
    cellHeight,
    widths,
    dialSize: Number.isFinite(dialSize) ? dialSize : MIN_DIAL,
    scrolls: contentHeight > o.height + 0.5,
    aspect: Math.max(cellWidth, cellHeight) / Math.max(1, Math.min(cellWidth, cellHeight)),
  };
}

/** Кандидат — це розкладка плюс службова оцінка форми; назовні оцінка не йде. */
function asLayout(c: Candidate): TimerFocusLayout {
  return {
    columns: c.columns,
    rows: c.rows,
    cellHeight: c.cellHeight,
    widths: c.widths,
    dialSize: c.dialSize,
    scrolls: c.scrolls,
  };
}

/** З кількох розкладок беремо найбільший циферблат, а за майже рівних — найквадратнішу. */
function pickBest(candidates: Candidate[]): Candidate {
  const best = candidates.reduce((a, b) => (b.dialSize > a.dialSize ? b : a));
  const near = candidates.filter(c => c.dialSize >= best.dialSize * NEAR_ENOUGH);
  return near.reduce((a, b) => (b.aspect < a.aspect ? b : a));
}

/**
 * Розкладка повноекранного режиму ЗА КІЛЬКІСТЮ таймерів.
 *
 * Один — на весь доступний екран. Два-чотири — рівна сітка, форму якої
 * визначає не клас розміру пристрою, а пропорції самої області: два таймери в
 * альбомі стають поруч, у портреті — один під одним, і ту саму арифметику
 * отримує Split View, де планшет віддає вузьке вікно. П'ять і більше —
 * попередня поведінка: стеля колонок, стеля рядів на екран, далі прокрутка.
 */
export function timerFocusLayout(o: TimerFocusOptions): TimerFocusLayout {
  if (o.count <= 0) {
    return {
      columns: 1,
      rows: 1,
      cellHeight: o.minCellHeight,
      widths: [],
      dialSize: MIN_DIAL,
      scrolls: false,
    };
  }

  if (o.count > FOCUS_GRID_MAX) {
    // Скрол-режим не переглядаємо: тут сітка вже не «кожен великий», а список,
    // і стеля колонок за класом розміру лишається чинною.
    const columns = Math.max(1, Math.min(o.maxColumns, o.count));
    return asLayout(candidate(o, columns, o.rowsPerScreen));
  }

  // Рівна сітка: колонок стільки, скільки ділить кількість без дірок.
  const even: Candidate[] = [];
  const stretched: Candidate[] = [];
  for (let columns = 1; columns <= o.count; columns++) {
    const c = candidate(o, columns, o.count);
    if (o.count % columns === 0) even.push(c);
    else if (o.count % columns === 1) stretched.push(c);
  }

  const best = pickBest(even);
  if (stretched.length > 0) {
    // Розтягнутий останній ламає рівність сітки, тож він виправданий лише коли
    // помітно виграє: три таймери на телефоні це 2+1 із циферблатом 145 проти
    // трьох поспіль із 83.
    const alt = pickBest(stretched);
    if (alt.dialSize > best.dialSize * ORPHAN_GAIN) return asLayout(alt);
  }

  return asLayout(best);
}
