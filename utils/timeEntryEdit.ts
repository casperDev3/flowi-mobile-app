/**
 * utils/timeEntryEdit.ts — правка запису часу з форми: дата, початок, кінець
 * або тривалість, задача, проєкт, нотатка.
 *
 * Чистий модуль, дзеркало вебового `lib/time-entry-edit.ts` (назви функцій ті
 * самі): форма на телефоні й у браузері мусить перетворювати ті самі поля на
 * той самий запис, інакше запис, виправлений на одному пристрої, «їде» на
 * іншому.
 *
 * Чому окремий модуль, а не код у формі:
 *  • зміна тексту задачі лишала старий `taskId` — запис показувався під новою
 *    назвою, а рахувався (фільтр, медіана аномалій) під старою задачею;
 *  • «кінець раніше за початок» (сесія через північ) без правила давав
 *    від'ємну тривалість;
 *  • проєкт запису задає задача, і форма не повинна дозволяти записати інший.
 *
 * Зміна `projectId` — це переміщення запису між потоками синку; його робить
 * наявний шар (`saveSynced` у store/synced-storage.ts ставить delete у старий
 * потік і upsert у новий, §3.5), тут лише правильне значення поля.
 */

import { localDateKey, parseLocalDateInput } from './dateUtils';
import { entrySeconds, entryStartMs } from './timeAnomalies';
import { recordProjectId, type TaskProjects } from './timeEntries';

/** Задача, яку можна обрати у формі. */
export interface EditableTask {
  id: string;
  title: string;
  projectId?: string;
}

/** Мінімум запису, який правка читає й пише. */
export interface EditableEntry {
  id: string;
  task?: string;
  taskId?: string;
  projectId?: string;
  duration?: number;
  date?: string;
  startedAt?: string;
  endedAt?: string;
  note?: string;
}

/** Стан форми. `durationSeconds` — синхронізований із «Початок»/«Кінець». */
export interface EntryEditDraft {
  /** `YYYY-MM-DD` — локальна доба ПОЧАТКУ сесії. */
  date: string;
  /** `HH:MM` початку. */
  start: string;
  /** `HH:MM` кінця; раніше за початок — наступна доба. */
  end: string;
  durationSeconds: number;
  taskId: string | null;
  taskTitle: string;
  projectId: string | null;
  note: string;
}

export interface EntryEditInput {
  date: string;
  start: string;
  /** Непорожній — тривалість рахується з «Початок»/«Кінець». */
  end?: string;
  /** Коли `end` порожній. */
  durationSeconds?: number;
  taskId: string | null;
  taskTitle: string;
  projectId: string | null;
  note?: string;
}

export type EntryEditError = 'task' | 'date' | 'start' | 'end' | 'duration';

export type EntryEditResult<T> = { ok: true; entry: T } | { ok: false; error: EntryEditError };

const DAY_MINUTES = 24 * 60;

/** `HH:MM` (або `H:MM`, `HHMM`) → хвилини від початку доби; `null` — не час. */
export function parseClock(text: string | null | undefined): number | null {
  const match = /^(\d{1,2}):?(\d{2})$/.exec(String(text ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Хвилини доби → `HH:MM`; більше за добу загортається. */
export function clockText(minutes: number): string {
  const value = ((Math.floor(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/**
 * Тривалість між «Початок» і «Кінець», секунди.
 *
 * Кінець раніше за початок — це наступна доба (сесія через північ, 23:30 →
 * 00:30 = 1 год), а не від'ємне число. Однакові — нуль: «24 години» з двох
 * однакових полів майже завжди помилка набору, а не доба роботи.
 */
export function durationFromClock(start: string, end: string): number | null {
  const from = parseClock(start);
  const to = parseClock(end);
  if (from === null || to === null) return null;
  const minutes = to >= from ? to - from : to + DAY_MINUTES - from;
  return minutes * 60;
}

/** «Кінець» для відображення: початок + тривалість (через північ — загортається). */
export function endFromDuration(start: string, seconds: number): string | null {
  const from = parseClock(start);
  if (from === null) return null;
  return clockText(from + Math.floor(Math.max(0, Number(seconds) || 0) / 60));
}

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Проєкт, який задає задача; `null` — задача особиста або її немає в списку.
 * Коли не `null`, вибір проєкту у формі заблоковано.
 */
export function lockedProjectId(taskId: string | null | undefined, tasks: readonly EditableTask[]): string | null {
  if (!taskId) return null;
  return (tasks ?? []).find((task) => task?.id === taskId)?.projectId || null;
}

/** Задачі для вибору: пошук за назвою без регістру, не більше `limit`. */
export function searchTasks<T extends EditableTask>(tasks: readonly T[], query: string, limit = 20): T[] {
  const needle = String(query ?? '').trim().toLowerCase();
  const out: T[] = [];
  for (const task of tasks ?? []) {
    if (!task?.id || !task.title?.trim()) continue;
    if (needle && !task.title.toLowerCase().includes(needle)) continue;
    out.push(task);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Початковий стан форми.
 *
 * Наявний запис — його справжній початок (явний `startedAt` або кінець мінус
 * тривалість) і проєкт за `recordProjectId`: запис без `projectId` на
 * проєктній задачі показуємо в проєкті, як і список. Новий — остання година
 * до `now`: і «Початок», і «Кінець» одразу заповнені, тож людині лишається
 * поправити хвилини, а не вводити все з нуля.
 */
export function entryEditDraft(
  entry: EditableEntry | null | undefined,
  now: Date,
  options: { taskProjects?: TaskProjects; projectId?: string | null } = {},
): EntryEditDraft {
  if (entry) {
    const startMs = entryStartMs(entry);
    const start = startMs === null ? new Date(now.getTime()) : new Date(startMs);
    const seconds = entrySeconds(entry);
    const startText = clockText(minuteOfDay(start));
    return {
      date: localDateKey(start),
      start: startText,
      end: endFromDuration(startText, seconds) ?? startText,
      durationSeconds: seconds,
      taskId: entry.taskId ?? null,
      taskTitle: entry.task ?? '',
      projectId: recordProjectId(entry, options.taskProjects),
      note: entry.note ?? '',
    };
  }
  const end = new Date(now.getTime());
  end.setSeconds(0, 0);
  const start = new Date(end.getTime() - 3600 * 1000);
  return {
    date: localDateKey(start),
    start: clockText(minuteOfDay(start)),
    end: clockText(minuteOfDay(end)),
    durationSeconds: 3600,
    taskId: null,
    taskTitle: '',
    projectId: options.projectId ?? null,
    note: '',
  };
}

/**
 * Поля форми → запис.
 *
 *  • задача обрана зі списку → `taskId`, назва задачі і її `projectId`
 *    (проєкт задачі важливіший за вибір у формі);
 *  • вільний текст (`taskId: null`) → `taskId` знімається: інакше запис жив би
 *    під новою назвою, а рахувався під старою задачею;
 *  • `date` + `start` — початок; кінець — з `end` (раніше за початок →
 *    наступна доба) або початок + `durationSeconds`;
 *  • у запис лягають `startedAt`, `date` (= кінець, як пише таймер) і
 *    `endedAt`, якщо він у записі вже був.
 *
 * Незмінений початок береться з запису точно, до секунди: поле має хвилинну
 * точність, і «Зберегти» без правки інакше зрізало б секунди з кожного запису.
 */
export function applyEntryEdit<T extends EditableEntry>(
  base: T | null | undefined,
  input: EntryEditInput,
  options: { tasks?: readonly EditableTask[]; id?: string } = {},
): EntryEditResult<T> {
  const tasks = options.tasks ?? [];
  const picked = input.taskId ? tasks.find((task) => task?.id === input.taskId) ?? null : null;
  const title = picked?.title?.trim() || String(input.taskTitle ?? '').trim();
  if (!title) return { ok: false, error: 'task' };

  const day = parseLocalDateInput(String(input.date ?? ''));
  if (!day) return { ok: false, error: 'date' };
  const startMinute = parseClock(input.start);
  if (startMinute === null) return { ok: false, error: 'start' };

  let seconds: number;
  if (input.end !== undefined && String(input.end).trim() !== '') {
    const fromClock = durationFromClock(input.start, input.end);
    if (fromClock === null) return { ok: false, error: 'end' };
    seconds = fromClock;
  } else {
    seconds = Math.floor(Number(input.durationSeconds) || 0);
  }
  if (!(seconds > 0)) return { ok: false, error: 'duration' };

  let startMs = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(startMinute / 60),
    startMinute % 60,
    0,
    0,
  ).getTime();
  const baseStart = base ? entryStartMs(base) : null;
  if (baseStart !== null) {
    const previous = new Date(baseStart);
    if (localDateKey(previous) === localDateKey(day) && minuteOfDay(previous) === startMinute) startMs = baseStart;
  }
  const endIso = new Date(startMs + seconds * 1000).toISOString();

  const next = { ...(base ?? {}) } as T & EditableEntry;
  next.id = base?.id ?? options.id ?? '';
  next.task = title;
  next.duration = seconds;
  next.startedAt = new Date(startMs).toISOString();
  next.date = endIso;
  if (base?.endedAt) next.endedAt = endIso;

  const taskId = input.taskId || null;
  if (taskId) next.taskId = taskId;
  else delete next.taskId;

  const projectId = picked?.projectId || input.projectId || null;
  if (projectId) next.projectId = projectId;
  else delete next.projectId;

  const note = String(input.note ?? '').trim();
  if (note) next.note = note;
  else delete next.note;

  return { ok: true, entry: next as T };
}
