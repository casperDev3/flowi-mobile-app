/**
 * utils/timeAnomalies.ts — пошук підозрілих записів часу.
 *
 * Чистий модуль без React і без сховища: рівно ті самі правила читає веб
 * `lib/time-anomalies.ts` (там же й тест). Дві копії формули «що вважати
 * аномалією» розійшлися
 * б за перший же тиждень, а розбіжність тут особливо шкідлива — людина бачила б
 * на телефоні інше число «перевір N записів», ніж у браузері.
 *
 * Запис аномальний, якщо виконується БУДЬ-ЩО з:
 *   • довший за 8 год;
 *   • перетинає північ;
 *   • більший ніж утричі за медіану записів цієї задачі АБО цього проєкту;
 *   • коротший за 1 хв.
 *
 * Позначка «це нормально» (`markedNormal`) живе в самому записі, тож вона
 * переживає перезапуск і синхронізується на інші пристрої разом із записом.
 */

/** Довше за це — аномалія. */
export const ANOMALY_MAX_SECONDS = 8 * 3600;
/** Коротше за це — аномалія. */
export const ANOMALY_MIN_SECONDS = 60;
/** У скільки разів перевищення медіани вважається викидом. */
export const ANOMALY_OUTLIER_FACTOR = 3;
/**
 * Менше записів у групі — медіани не рахуємо.
 *
 * З двох записів «медіана» — це просто середнє двох чисел, і будь-яка пара
 * «10 хв + 40 хв» миттєво дала б фальшивий викид. Три — найменший розмір, за
 * якого середній елемент справді середній.
 */
export const ANOMALY_MIN_GROUP = 3;

export type AnomalyKind = 'long' | 'midnight' | 'outlier' | 'short';

/** Мінімум, потрібний для розбору; повна форма запису — в utils/timeEntries.ts. */
export interface AnomalyEntry {
  id: string;
  task?: string;
  taskId?: string;
  projectId?: string;
  duration?: number;
  /** ISO кінця сесії — так його пише дзеркало таймера. */
  date?: string;
  startedAt?: string;
  endedAt?: string;
  markedNormal?: boolean;
}

export interface AnomalyReport<T extends AnomalyEntry = AnomalyEntry> {
  entry: T;
  kinds: AnomalyKind[];
}

function parseMs(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Тривалість у секундах, очищена від сміття. */
export function entrySeconds(entry: AnomalyEntry): number {
  const value = Number(entry?.duration);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * Кінець сесії. `endedAt` точніший, але його мають лише записи, перенесені з
 * `task.timeEntries`; у дзеркала таймера й у ручного запису кінець — це `date`.
 */
export function entryEndMs(entry: AnomalyEntry): number | null {
  return parseMs(entry?.endedAt) ?? parseMs(entry?.date);
}

/**
 * Початок сесії. Якщо його не записано — відлічуємо від кінця на тривалість:
 * інакше «перетинає північ» не можна було б перевірити для ручних записів.
 */
export function entryStartMs(entry: AnomalyEntry): number | null {
  const explicit = parseMs(entry?.startedAt);
  if (explicit !== null) return explicit;
  const end = entryEndMs(entry);
  return end === null ? null : end - entrySeconds(entry) * 1000;
}

/** Початок і кінець припадають на різні календарні доби (за локальним часом). */
export function crossesMidnight(entry: AnomalyEntry): boolean {
  const start = entryStartMs(entry);
  const end = entryEndMs(entry);
  if (start === null || end === null || end <= start) return false;
  const from = new Date(start);
  // `end - 1`, а не `end`: сесія, що скінчилась РІВНО опівночі, належить добі,
  // що минула, і північ не перетинає. Інакше дія «обрізати до опівночі» лишала
  // б запис у черзі на перевірку — рівно з тією аномалією, яку щойно прибрала.
  const to = new Date(end - 1);
  return (
    from.getFullYear() !== to.getFullYear() ||
    from.getMonth() !== to.getMonth() ||
    from.getDate() !== to.getDate()
  );
}

/** Медіана; порожній набір — 0. */
export function median(values: readonly number[]): number {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Ключ «та сама задача». За id, коли він є; інакше — за назвою, бо саме так
 * склеюються записи, дописані вільним таймером і рукою.
 */
export function taskGroupKey(entry: AnomalyEntry): string | null {
  if (entry?.taskId) return `id:${entry.taskId}`;
  const title = (entry?.task ?? '').trim().toLowerCase();
  return title ? `title:${title}` : null;
}

export function projectGroupKey(entry: AnomalyEntry): string | null {
  return entry?.projectId ? `project:${entry.projectId}` : null;
}

/** Медіани тривалості за задачами й за проєктами — один прохід по набору. */
export function groupMedians(entries: readonly AnomalyEntry[]): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const entry of entries ?? []) {
    const seconds = entrySeconds(entry);
    if (!seconds) continue;
    for (const key of [taskGroupKey(entry), projectGroupKey(entry)]) {
      if (!key) continue;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(seconds);
      else buckets.set(key, [seconds]);
    }
  }
  const out = new Map<string, number>();
  for (const [key, values] of buckets) {
    if (values.length < ANOMALY_MIN_GROUP) continue;
    const value = median(values);
    if (value > 0) out.set(key, value);
  }
  return out;
}

/**
 * Усі порушення конкретного запису. Масив, а не один прапорець: та сама сесія
 * буває і задовгою, і викидом, і людині корисно бачити обидві причини.
 */
export function anomalyKinds(
  entry: AnomalyEntry,
  medians: Map<string, number> = new Map(),
): AnomalyKind[] {
  const kinds: AnomalyKind[] = [];
  const seconds = entrySeconds(entry);
  if (seconds > ANOMALY_MAX_SECONDS) kinds.push('long');
  if (crossesMidnight(entry)) kinds.push('midnight');

  const taskMedian = medians.get(taskGroupKey(entry) ?? '') ?? 0;
  const projectMedian = medians.get(projectGroupKey(entry) ?? '') ?? 0;
  const limit = Math.min(
    taskMedian > 0 ? taskMedian * ANOMALY_OUTLIER_FACTOR : Infinity,
    projectMedian > 0 ? projectMedian * ANOMALY_OUTLIER_FACTOR : Infinity,
  );
  if (Number.isFinite(limit) && seconds > limit) kinds.push('outlier');

  // Нульова тривалість — це не «коротка сесія», а биті дані: такий запис
  // однаково не потрапляє в підсумки, і тягти його в чергу на перевірку
  // означало б щодня показувати «перевір», де нема чого правити.
  if (seconds > 0 && seconds < ANOMALY_MIN_SECONDS) kinds.push('short');
  return kinds;
}

/**
 * Черга на перевірку: лише записи з порушеннями і без позначки «нормально».
 * Порядок — найсвіжіші зверху, як у самому списку.
 */
export function detectAnomalies<T extends AnomalyEntry>(
  entries: readonly T[] | undefined,
): AnomalyReport<T>[] {
  const list = entries ?? [];
  const medians = groupMedians(list);
  const reports: AnomalyReport<T>[] = [];
  for (const entry of list) {
    if (!entry || entry.markedNormal) continue;
    const kinds = anomalyKinds(entry, medians);
    if (kinds.length) reports.push({ entry, kinds });
  }
  return reports.sort((a, b) => (entryEndMs(b.entry) ?? 0) - (entryEndMs(a.entry) ?? 0));
}

/**
 * Пропозиція для дії «обрізати», секунди; `null` — обрізати нема до чого.
 *
 * Сесія через північ ріжеться до опівночі свого дня (решта часу майже завжди —
 * забутий увімкненим таймер), а просто задовга — до 8 год. Порядок саме такий:
 * запис, що і задовгий, і через північ, має лягти у свою добу.
 */
export function trimmedSeconds(entry: AnomalyEntry): number | null {
  const kinds = anomalyKinds(entry, new Map());
  if (kinds.includes('midnight')) {
    const start = entryStartMs(entry);
    if (start === null) return null;
    const midnight = new Date(start);
    midnight.setHours(24, 0, 0, 0);
    const seconds = Math.floor((midnight.getTime() - start) / 1000);
    return seconds > 0 ? seconds : null;
  }
  if (entrySeconds(entry) > ANOMALY_MAX_SECONDS) return ANOMALY_MAX_SECONDS;
  return null;
}

/** Поля, якими зміна тривалості лягає в запис. */
export interface DurationPatch {
  duration: number;
  date: string;
  endedAt?: string;
}

/**
 * Нова тривалість із зафіксованим ПОЧАТКОМ: кінець їде, початок лишається.
 *
 * Без цього «обрізати» правило б лише `duration`, а `date` (він же кінець
 * сесії) лишався б старим — і похідний початок поїхав би вперед замість того,
 * щоб відрізати хвіст. Запис тоді все одно перетинав би північ.
 */
export function applyDuration(entry: AnomalyEntry, seconds: number): DurationPatch {
  const duration = Math.max(0, Math.floor(Number(seconds) || 0));
  const start = entryStartMs(entry);
  if (start === null) {
    return { duration, date: entry?.date ?? new Date().toISOString() };
  }
  const end = new Date(start + duration * 1000).toISOString();
  return entry?.endedAt
    ? { duration, date: end, endedAt: end }
    : { duration, date: end };
}
