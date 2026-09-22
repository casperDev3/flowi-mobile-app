/**
 * utils/masonry.ts — розкладка карток дашборду в незалежні колонки.
 *
 * Сітка row/wrap ставить картки рядами: висота ряду — висота найвищої
 * картки, і під нижчою сусідкою лишається діра. Masonry натомість кладе
 * кожну картку в НАЙКОРОТШУ на цей момент колонку, тож колонки ростуть
 * незалежно і дір немає.
 *
 * Чисті функції без React: їх перевіряє юніт-тест, а компонент
 * (components/shared/MasonryColumns.tsx) лише постачає виміряні висоти.
 */

/** Від цієї ширини вмісту екрана (вікно мінус сайдбар) — дві колонки. */
export const MASONRY_TWO_COLUMNS_MIN = 600;
/** Від цієї ширини — три колонки. */
export const MASONRY_THREE_COLUMNS_MIN = 1100;

/**
 * Наскільки має змінитися висота картки, щоб перерозкласти колонки.
 *
 * Дрібні зміни (рядок став на пару пікселів вищим, шрифт підвантажився) не
 * повинні перекидати картки між колонками: переїзд — це перемонтування
 * картки й стрибок усього дашборду. Колонка сама розтягується під нову
 * висоту, тож поріг лише вирішує, коли баланс колонок варто перерахувати.
 */
export const MASONRY_REASSIGN_THRESHOLD = 24;

/** Межі включні знизу: рівно 600 — уже дві колонки. */
export function masonryColumnCount(contentWidth: number): number {
  if (contentWidth >= MASONRY_THREE_COLUMNS_MIN) return 3;
  if (contentWidth >= MASONRY_TWO_COLUMNS_MIN) return 2;
  return 1;
}

export interface MasonryItem {
  key: string;
  /**
   * Виміряна висота; ще не виміряна — undefined. Така картка рахується
   * середньою висотою виміряних (або 1, якщо не виміряно нічого): з нулем
   * усі невиміряні картки звалились би в першу колонку.
   */
  height?: number;
}

/**
 * Жадібна розкладка: картки по черзі (у вихідному порядку) лягають у
 * найкоротшу колонку; при рівних висотах — у колонку з меншим індексом.
 * Тож без вимірів (усі висоти однакові) виходить звичайний round-robin, а порядок
 * читання зліва направо, згори вниз лишається близьким до вихідного.
 *
 * `gap` додається до кожної картки: колонка з трьох низьких карток справді
 * вища, ніж її сума висот.
 */
export function assignMasonryColumns(
  items: readonly MasonryItem[],
  columnCount: number,
  gap = 0,
): string[][] {
  const count = Math.max(1, Math.floor(columnCount) || 1);
  const columns: string[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  const valid = (h: number | undefined): h is number => typeof h === 'number' && Number.isFinite(h) && h >= 0;
  const measured = items.map(item => item.height).filter(valid);
  const estimate = measured.length > 0
    ? Math.max(1, measured.reduce((sum, h) => sum + h, 0) / measured.length)
    : 1;
  for (const item of items) {
    let target = 0;
    for (let i = 1; i < count; i++) {
      if (heights[i] < heights[target]) target = i;
    }
    columns[target].push(item.key);
    heights[target] += (valid(item.height) ? item.height : estimate) + gap;
  }
  return columns;
}

/** Поточна розкладка разом із висотами, з яких її порахували. */
export interface MasonryLayout {
  columns: string[][];
  /** Висоти на момент розкладки (undefined — ще не виміряна). */
  basis: Record<string, number | undefined>;
  /** Кількість колонок + порядок ключів: зміна будь-чого — нова розкладка. */
  signature: string;
}

export function masonrySignature(keys: readonly string[], columnCount: number): string {
  return `${columnCount}|${keys.join('|')}`;
}

/**
 * Чи змінилися висоти настільки, що варто перерахувати колонки: з'явився
 * перший вимір картки або висота зсунулась більше ніж на поріг.
 */
export function heightsChangedMaterially(
  basis: Record<string, number | undefined>,
  heights: Record<string, number | undefined>,
  keys: readonly string[],
  threshold = MASONRY_REASSIGN_THRESHOLD,
): boolean {
  for (const key of keys) {
    const before = basis[key];
    const now = heights[key];
    if (now === undefined) continue;
    if (before === undefined) return true;
    if (Math.abs(now - before) > threshold) return true;
  }
  return false;
}

/**
 * Наступна розкладка. Повертає ТОЙ САМИЙ об'єкт `prev`, якщо нічого суттєво
 * не змінилося, — тоді React не перемальовує колонки й картки не
 * перемонтовуються.
 *
 * Навіть при суттєвій зміні висот, якщо перерахунок дає ті самі колонки,
 * повертаємо prev з оновленою базою — без нового масиву колонок.
 */
export function nextMasonryLayout(
  prev: MasonryLayout | null,
  keys: readonly string[],
  heights: Record<string, number | undefined>,
  columnCount: number,
  gap = 0,
  threshold = MASONRY_REASSIGN_THRESHOLD,
): MasonryLayout {
  const signature = masonrySignature(keys, columnCount);
  if (prev && prev.signature === signature
    && !heightsChangedMaterially(prev.basis, heights, keys, threshold)) {
    return prev;
  }
  const basis: Record<string, number | undefined> = {};
  for (const key of keys) basis[key] = heights[key];
  const columns = assignMasonryColumns(keys.map(key => ({ key, height: heights[key] })), columnCount, gap);
  if (prev && prev.signature === signature && sameColumns(prev.columns, columns)) {
    // Той самий масив колонок — рендер нічого не переставить.
    prev.basis = basis;
    return prev;
  }
  return { columns, basis, signature };
}

function sameColumns(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}
