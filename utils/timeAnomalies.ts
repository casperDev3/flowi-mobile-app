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
 *   • коротший за 1 хв;
 *   • довший ніж утричі за ТИПОВУ сесію І водночас щонайменше на 30 хв
 *     довший за неї (рішення власника, пункт 4).
 *
 * Типова сесія — медіана сесій цієї задачі (коли їх ≥ 3), інакше медіана
 * сесій проєкту за `recordProjectId(entry, taskProjects)` (≥ 3). Задача
 * важливіша за проєкт: «довго» для огляду коду і для стендапу — різні числа.
 *
 * Навіщо друга умова (+30 хв): для п'ятихвилинної задачі «утричі» — це 15 хв,
 * і черга «перевір» заповнювалась звичайними сесіями, у яких нема чого правити.
 *
 * Проєкт — через `recordProjectId`, а не лише `entry.projectId`: таймер у
 * вебі довго писав записи БЕЗ проєкту, і такі сесії випадали з медіани
 * проєкту, хоча сторінка показує їх у ньому.
 *
 * Позначка «це нормально» (`markedNormal`) живе в самому записі, тож вона
 * переживає перезапуск і синхронізується на інші пристрої разом із записом.
 */

import { recordProjectId, type TaskProjects } from './timeEntries';

/** Довше за це — аномалія. */
export const ANOMALY_MAX_SECONDS = 8 * 3600;
/** Коротше за це — аномалія. */
export const ANOMALY_MIN_SECONDS = 60;
/** У скільки разів перевищення типової сесії вважається викидом. */
export const ANOMALY_OUTLIER_FACTOR = 3;
/** І водночас щонайменше на стільки секунд довше за типову. */
export const ANOMALY_OUTLIER_MIN_EXCESS = 30 * 60;
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
  /** Типова сесія, з якою порівнювали, секунди; `null` — порівнювати не було з чим. */
  typicalSeconds: number | null;
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

/** Ключ «той самий проєкт» — власний `projectId` запису, інакше проєкт його задачі. */
export function projectGroupKey(entry: AnomalyEntry, taskProjects?: TaskProjects): string | null {
  const projectId = recordProjectId(entry, taskProjects);
  return projectId ? `project:${projectId}` : null;
}

/** Медіани тривалості за задачами й за проєктами — один прохід по набору. */
export function groupMedians(
  entries: readonly AnomalyEntry[],
  taskProjects?: TaskProjects,
): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const entry of entries ?? []) {
    const seconds = entrySeconds(entry);
    if (!seconds) continue;
    for (const key of [taskGroupKey(entry), projectGroupKey(entry, taskProjects)]) {
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
 * Типова сесія запису: медіана його задачі, інакше медіана його проєкту;
 * `null` — жодна група не набрала ANOMALY_MIN_GROUP записів.
 *
 * Не мінімум із двох, як було: медіана проєкту змішує короткі й довгі задачі,
 * і довга, але звична для СВОЄЇ задачі сесія виходила «викидом» лише тому, що
 * поруч у проєкті багато п'ятихвилинок.
 */
export function typicalSessionFor(
  entry: AnomalyEntry,
  medians: Map<string, number>,
  taskProjects?: TaskProjects,
): number | null {
  const taskMedian = medians.get(taskGroupKey(entry) ?? '') ?? 0;
  if (taskMedian > 0) return taskMedian;
  const projectMedian = medians.get(projectGroupKey(entry, taskProjects) ?? '') ?? 0;
  return projectMedian > 0 ? projectMedian : null;
}

/** Сесія набагато довша за типову: утричі І щонайменше на 30 хв. */
export function isOutlier(seconds: number, typicalSeconds: number | null): boolean {
  if (!typicalSeconds || typicalSeconds <= 0) return false;
  return (
    seconds > typicalSeconds * ANOMALY_OUTLIER_FACTOR &&
    seconds - typicalSeconds >= ANOMALY_OUTLIER_MIN_EXCESS
  );
}

/**
 * «×3.5» — у скільки разів сесія довша за типову. До десятих, а від десяти —
 * цілими: «×12.3» нічого не додає до «×12».
 */
export function outlierFactor(seconds: number, typicalSeconds: number | null): number | null {
  if (!typicalSeconds || typicalSeconds <= 0 || seconds <= 0) return null;
  const ratio = seconds / typicalSeconds;
  return ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
}

/**
 * Усі порушення конкретного запису. Масив, а не один прапорець: та сама сесія
 * буває і задовгою, і викидом, і людині корисно бачити обидві причини.
 */
export function anomalyKinds(
  entry: AnomalyEntry,
  medians: Map<string, number> = new Map(),
  taskProjects?: TaskProjects,
): AnomalyKind[] {
  const kinds: AnomalyKind[] = [];
  const seconds = entrySeconds(entry);
  if (seconds > ANOMALY_MAX_SECONDS) kinds.push('long');
  if (crossesMidnight(entry)) kinds.push('midnight');
  if (isOutlier(seconds, typicalSessionFor(entry, medians, taskProjects))) kinds.push('outlier');

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
  taskProjects?: TaskProjects,
): AnomalyReport<T>[] {
  const list = entries ?? [];
  const medians = groupMedians(list, taskProjects);
  const reports: AnomalyReport<T>[] = [];
  for (const entry of list) {
    if (!entry || entry.markedNormal) continue;
    const kinds = anomalyKinds(entry, medians, taskProjects);
    if (kinds.length) {
      reports.push({ entry, kinds, typicalSeconds: typicalSessionFor(entry, medians, taskProjects) });
    }
  }
  return reports.sort((a, b) => (entryEndMs(b.entry) ?? 0) - (entryEndMs(a.entry) ?? 0));
}

/** Що список записів знає про аномалію рядка — за id запису. */
export interface RowAnomaly {
  kinds: AnomalyKind[];
  typicalSeconds: number | null;
}

/**
 * Черга → мапа для рядків списку. Рядок бере рівно той самий звіт, що й блок
 * «Перевір N записів»: інакше рядок і блок могли б розійтись у тому, що вони
 * вважають аномалією.
 */
export function anomalyMap(reports: readonly AnomalyReport[]): Map<string, RowAnomaly> {
  const map = new Map<string, RowAnomaly>();
  for (const report of reports ?? []) {
    map.set(report.entry.id, { kinds: report.kinds, typicalSeconds: report.typicalSeconds });
  }
  return map;
}

/**
 * Наскільки серйозно виділяти рядок: «red» — задовга чи через північ (майже
 * завжди забутий таймер), «amber» — лише довша за звичне або коротша за
 * хвилину (варто глянути, але найчастіше це правда).
 */
export function anomalySeverity(kinds: readonly AnomalyKind[]): 'red' | 'amber' | null {
  if (!kinds?.length) return null;
  return kinds.includes('long') || kinds.includes('midnight') ? 'red' : 'amber';
}

/**
 * «Звичайна сесія» для KPI — медіана тривалості записів вибірки, секунди.
 *
 * Поруч із «Середнє на задачу» (сума ÷ число задач): середнє тягне вгору одна
 * забута на ніч сесія, медіана — ні, і саме її людина впізнає як «зазвичай».
 */
export function typicalSessionSeconds(entries: readonly AnomalyEntry[] | undefined): number {
  const values = (entries ?? []).map(entrySeconds).filter((v) => v > 0);
  return Math.round(median(values));
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
