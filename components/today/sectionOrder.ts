/**
 * components/today/sectionOrder.ts — порядок секцій головного екрана.
 *
 * ПРАВИЛО ВЛАСНИКА (CLAUDE.md → «Правила екранів»):
 *   пошук речей → здоров'я + швидкі кнопки → фінанси → звички → завдання
 *   → зустрічі → оплати.
 * Змінювати порядок лише з дозволу власника.
 *
 * Пошук речей стоїть над сіткою (повна ширина, поза цим списком), тому тут
 * перелічено все, що йде ПІСЛЯ нього. Порядок один для телефона і планшета:
 * на телефоні — одна колонка рівно в цьому порядку; на планшеті — masonry
 * (utils/masonry.ts): кожна секція по черзі лягає в найкоротшу колонку.
 * Так кожна наступна секція починається не вище за попередню, тобто
 * порядок «згори вниз» за верхнім краєм карток збігається з правилом,
 * а «здоров'я + швидкі кнопки» завжди стоїть першою зліва вгорі.
 *
 * Чисті функції без React — їх перевіряє юніт-тест.
 */

export const TODAY_SECTION_ORDER = [
  'health-quick',
  'finance',
  'habits',
  'tasks',
  'meetings',
  'payments',
] as const;

export type TodaySectionKey = (typeof TODAY_SECTION_ORDER)[number];

export interface TodayGridEntry {
  key: string;
  /** На планшеті займає весь рядок (реклама, заглушка «усе вимкнено»). */
  fullWidth?: boolean;
}

/**
 * Сортує секції за правилом власника. Ключі поза правилом (службові)
 * лишаються в кінці у вихідному порядку — сортування стабільне.
 */
export function orderTodaySections<T extends { key: string }>(entries: readonly T[]): T[] {
  const rank = (key: string) => {
    const i = (TODAY_SECTION_ORDER as readonly string[]).indexOf(key);
    return i === -1 ? TODAY_SECTION_ORDER.length : i;
  };
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry.key) - rank(b.entry.key) || a.index - b.index)
    .map(x => x.entry);
}

/** Шматок розкладки: або masonry-колонки, або один рядок на всю ширину. */
export interface TodayGridSegment<T extends TodayGridEntry> {
  fullWidth: boolean;
  items: T[];
}

/**
 * Ділить секції на шматки для планшета: поспіль ідучі звичайні секції —
 * один masonry-блок (незалежні колонки, без дір під нижчою сусідкою),
 * `fullWidth` — окремий рядок на всю ширину. Порядок шматків і секцій
 * усередині — вихідний (правило власника), порожніх шматків немає.
 *
 * Реклами тут немає: її рядок екран рендерить окремо, без обгортки, тож
 * порожній AdSlot (null) не лишає по собі відступу.
 */
export function todayGridSegments<T extends TodayGridEntry>(items: readonly T[]): TodayGridSegment<T>[] {
  const segments: TodayGridSegment<T>[] = [];
  for (const item of items) {
    const full = !!item.fullWidth;
    const last = segments[segments.length - 1];
    if (!full && last && !last.fullWidth) last.items.push(item);
    else segments.push({ fullWidth: full, items: [item] });
  }
  return segments;
}
