/**
 * utils/syncDivergence.ts — пошук записів, які існують ЛИШЕ на цьому пристрої.
 *
 * Навіщо це взагалі. 6 вересня 2026 у користувача на планшеті були транзакції
 * за два дні, яких не бачив ні веб, ні телефон. Кнопка «Синхронізувати»
 * повідомляла «синхронізовано успішно» — і це була правда в буквальному сенсі:
 * обмін пройшов без помилок, просто черга на відправку була порожня, тож
 * відправилось НУЛЬ записів. Найгірший клас повідомлення: воно заспокоює саме
 * тоді, коли треба бити на сполох.
 *
 * Порожня черга при непорожньому сховищі означає, що запис у чергу не
 * потрапив або її очистили після запису (це робить «Завантажити все з
 * сервера» і кілька службових шляхів). Сам обмін про це не знає й знати не
 * може: він відправляє чергу, а не порівнює сховище з сервером.
 *
 * Ознака, за якою тут ловиться розбіжність, — мапа ревізій. Вона накопичувальна
 * (applyRevisionUpdates зливає нове в наявне), тож запис, який сервер бодай раз
 * підтвердив або надіслав, ключ у ній має. Локальний запис БЕЗ ревізії і БЕЗ
 * рядка в черзі не був на сервері жодного разу.
 *
 * Функція навмисно нічого не читає й не імпортує: усі ключі рахує викликач.
 * Так її можна перевірити тестом без сховища, а сама вона не може стати ще
 * одним місцем, де формат ключа розійдеться з рештою рушія.
 */

export interface LocalOnlyCollection {
  collection: string;
  count: number;
}

export interface LocalOnlyReport {
  /** Скільки записів існують лише локально. 0 — розбіжності немає. */
  total: number;
  /** Розбивка за колекціями, спадання за кількістю. Порожня, коли total = 0. */
  byCollection: LocalOnlyCollection[];
}

export const EMPTY_LOCAL_ONLY: LocalOnlyReport = { total: 0, byCollection: [] };

/**
 * @param entries    ключі локальних записів, згруповані за колекцією
 * @param knownKeys  ключі, які сервер уже знає (ревізії) або які стоять у черзі
 */
export function findLocalOnly(
  entries: readonly { collection: string; keys: readonly string[] }[],
  knownKeys: ReadonlySet<string>,
): LocalOnlyReport {
  const byCollection: LocalOnlyCollection[] = [];
  let total = 0;

  for (const entry of entries) {
    // Дедуп за ключем: дубль у сховищі — це один запис для сервера, і рахувати
    // його двічі означало б лякати числом, якого користувач ніде не побачить.
    const missing = new Set<string>();
    for (const key of entry.keys) {
      if (!knownKeys.has(key)) missing.add(key);
    }
    if (missing.size === 0) continue;
    byCollection.push({ collection: entry.collection, count: missing.size });
    total += missing.size;
  }

  if (total === 0) return EMPTY_LOCAL_ONLY;

  byCollection.sort((a, b) =>
    b.count - a.count || a.collection.localeCompare(b.collection));
  return { total, byCollection };
}
