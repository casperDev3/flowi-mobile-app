/**
 * components/ds/filters/filterLogic.ts — чиста логіка фільтрів DS v2.5.
 *
 * Без React і без react-native: тестується jest-ом напряму. Семантика
 * ІДЕНТИЧНА вебовим помічникам (flowi-web-app/lib/filters.ts) — одна
 * поведінка «Фільтри · N», підсумку мультивибору й typeahead на обох клієнтах.
 */

/** Візуальна висота КОЖНОГО контролу в рядку фільтрів (pt). */
export const FILTER_CONTROL_H = 36;
/** Рамка контролу = зона дотику (pt). Примітиви малюють 36pt усередині 44pt. */
export const FILTER_HIT_H = 44;
/**
 * Добір 36 → 44 для ВЛАСНИХ контролів сторінки поруч із фільтрами. Увага:
 * hitSlop обрізається межами предка (A11Y-08) — примітиви v2.5 його не
 * використовують, а мають справжню рамку FILTER_HIT_H.
 */
export const FILTER_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 } as const;
/** Відстань між елементами рядка. */
export const FILTER_GAP = 8;
/** Понад стільки варіантів у FilterSelect з'являється пошук. */
export const FILTER_SEARCH_THRESHOLD = 8;

export interface PartitionInput {
  /** Ширини елементів у порядку рядка. */
  widths: number[];
  /** Закріплені елементи не ховаються ніколи. */
  pinned?: boolean[];
  /** Доступна ширина під елементи (без пошуку й дій). */
  available: number;
  gap: number;
  /** Ширина тригера «Фільтри · N». */
  overflowWidth: number;
}

/**
 * Розкласти елементи на видимі й сховані в «Фільтри · N».
 * Усе вміщається → усе видно. Інакше резервуємо місце під тригер, закріплені
 * лишаються завжди, незакріплені додаються по порядку до першого, що не
 * вліз, — і всі наступні незакріплені теж ховаються (ховаємо з хвоста).
 * Кожен видимий елемент займає width + gap; бюджет = available − overflowWidth.
 */
export function partitionFilterItems({ widths, pinned = [], available, gap, overflowWidth }: PartitionInput): {
  visible: number[];
  hidden: number[];
} {
  const n = widths.length;
  const all = widths.map((_, i) => i);
  if (n === 0) return { visible: [], hidden: [] };
  const total = widths.reduce((s, w) => s + w, 0) + gap * (n - 1);
  if (total <= available) return { visible: all, hidden: [] };

  // Кожен видимий елемент займає width + gap (gap — до наступного або до тригера).
  let budget = available - overflowWidth;
  // Закріплені, що не влазять навіть самі (вузька панель), знімаються з кінця —
  // паритет із вебом (lib/filters.ts): краще сховати в меню, ніж стиснути до нуля.
  const keep = all.map((i) => Boolean(pinned[i]));
  for (let i = 0; i < n; i++) if (keep[i]) budget -= widths[i] + gap;
  for (let i = n - 1; i >= 0 && budget < 0; i--) {
    if (!keep[i]) continue;
    keep[i] = false;
    budget += widths[i] + gap;
  }
  const visible: number[] = [];
  const hidden: number[] = [];
  let spilled = false;
  for (let i = 0; i < n; i++) {
    if (keep[i]) {
      visible.push(i);
    } else if (!spilled && widths[i] + gap <= budget) {
      visible.push(i);
      budget -= widths[i] + gap;
    } else {
      spilled = true;
      hidden.push(i);
    }
  }
  return { visible, hidden };
}

/** Підпис тригера переповнення: «Фільтри» або «Фільтри · N». */
export function overflowTriggerText(label: string, n: number): string {
  return n > 0 ? `${label} · ${n}` : label;
}

/** Скільки активних фільтрів сховано (true → 1, число → саме число). */
export function countHiddenActive(hidden: number[], active: (boolean | number | undefined)[]): number {
  let sum = 0;
  for (const i of hidden) {
    const a = active[i];
    if (typeof a === 'number') sum += Math.max(0, a);
    else if (a) sum += 1;
  }
  return sum;
}

export interface TriggerTextInput {
  label: string;
  multiple?: boolean;
  selectedLabels: string[];
  allLabel?: string;
  /** Для одиночного вибору без значення — замість allLabel. */
  placeholder?: string;
}

/**
 * Текст тригера «Label: Value». Мультивибір: 0 → «Статус: Усі», 1 → «Статус:
 * Прострочені», ≥ 2 → «Статус · 2» (prefix = null).
 */
export function filterTriggerText({
  label, multiple, selectedLabels, allLabel = 'Усі', placeholder,
}: TriggerTextInput): { prefix: string | null; value: string } {
  if (multiple) {
    if (selectedLabels.length === 0) return { prefix: label, value: allLabel };
    if (selectedLabels.length === 1) return { prefix: label, value: selectedLabels[0] };
    return { prefix: null, value: `${label} · ${selectedLabels.length}` };
  }
  return { prefix: label, value: selectedLabels[0] ?? placeholder ?? allLabel };
}

const norm = (s: string) => s.toLocaleLowerCase('uk-UA');

/** Чи містить підпис запит (без регістру, обрізаний; порожній запит — так). */
export function matchesQuery(label: string, query: string): boolean {
  const q = norm(query.trim());
  if (!q) return true;
  return norm(label).includes(q);
}

/**
 * Typeahead списку: перший варіант після `from`, що починається з `query`
 * (з обгортанням), пропускаючи вимкнені. Запит з однієї й тієї самої літери
 * («ппп») циклить за першою літерою; фраза з кількох різних літер шукає
 * починаючи з САМОГО `from` (поточний пункт лишається, поки збігається). −1 — нічого.
 */
export function typeaheadIndex(labels: string[], query: string, from: number, disabled: boolean[] = []): number {
  const n = labels.length;
  const needle = norm(query.trim());
  if (!n || !needle) return -1;
  const chars = Array.from(needle);
  const repeated = chars.length > 1 && chars.every(c => c === chars[0]);
  const prefix = repeated ? chars[0] : needle;
  // Одна літера або повтор — шукаємо з наступного; фраза може лишитись на поточному.
  const start = repeated || chars.length === 1 ? from + 1 : from;
  for (let step = 0; step < n; step++) {
    const i = (((start + step) % n) + n) % n;
    if (disabled[i]) continue;
    if (norm(labels[i]).startsWith(prefix)) return i;
  }
  return -1;
}

// ─── Позиція меню ────────────────────────────────────────────────────────────

export type MenuAnchor = { x: number; y: number; w: number; h: number };

const MENU_MAX_H = 360;
const MENU_MIN_W = 240;
const EDGE = 8;

/**
 * Позиція меню під тригером; не влазить знизу, а згори місця більше — над ним.
 * Чиста функція (повторює вебову логіку фліпу).
 */
export function placeFilterMenu(anchor: MenuAnchor, menu: { w: number; h: number }, win: { width: number; height: number }) {
  const width = Math.min(Math.max(menu.w, anchor.w, MENU_MIN_W), win.width - EDGE * 2);
  const below = win.height - (anchor.y + anchor.h) - EDGE - 4;
  const above = anchor.y - EDGE - 4;
  const wanted = Math.min(menu.h || MENU_MAX_H, MENU_MAX_H);
  const flip = below < wanted && above > below;
  const maxHeight = Math.max(120, Math.min(MENU_MAX_H, flip ? above : below));
  const left = Math.min(Math.max(EDGE, anchor.x), win.width - EDGE - width);
  return flip
    ? { left, width, maxHeight, bottom: win.height - anchor.y + 4, placement: 'top' as const }
    : { left, width, maxHeight, top: anchor.y + anchor.h + 4, placement: 'bottom' as const };
}

