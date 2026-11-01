/**
 * utils/taskDeadline.ts — дедлайн завдання: лише день або день + час.
 *
 * Дзеркало веб `lib/task-deadline.ts` (ті самі імена й семантика;
 * contracts/task-contract.md, контракт C1–C3).
 *
 * Модель даних:
 * - `deadline` — завжди повний ISO (UTC). Читач приймає й легасі `YYYY-MM-DD`
 *   (імпорти Jira/Notion/Worksection): доба такого рядка — він сам.
 * - Точний момент (C1): пишемо РАЗОМ `deadlineHasTime: true` і
 *   `deadlineTimeAt` = ТОЙ САМИЙ рядок, що в `deadline`. Читач вважає дедлайн
 *   точним ЛИШЕ коли прапорець `=== true` і `deadlineTimeAt === deadline`
 *   (isTimedDeadline). Старі збірки (≤1.2.0), що переносили дедлайн, переписуючи
 *   лише `deadline`, ламають рівність — запис безпечно читається як добовий,
 *   а не «12:00». Будь-яке переміщення точного дедлайну (правка, тягнення на
 *   Таймлайні, наступна копія повтору) переписує й `deadlineTimeAt`.
 * - Пишемо тільки `true`, НІКОЛИ `false`: «лише день» = обох ключів немає. Так
 *   старі записи не змінюються від збереження, а серверний diff прав
 *   (teamwork_policy) не бачить фальшивої зміни None→False у виконавця.
 * - День без часу зберігається як ЛОКАЛЬНИЙ ПОЛУДЕНЬ (C2; запас ±12 год для
 *   інших поясів). Полудень — лише якір збереження, а не час нагадування:
 *   нагадування про прострочку для дедлайну без часу сервер шле о 9:00
 *   наступного дня.
 * - Прострочка (C2): точний — `now` пізніше за момент; добовий — локальне
 *   «сьогодні» пізніше за добу дедлайну. Готові ніколи не прострочені.
 */
import { isoToLocalDateInput, localDateKey } from './dateUtils';

export const DATE_ONLY_ANCHOR_HOUR = 12;
/** Початкове значення ЛИШЕ для «Додати час»; автоматично не ставиться ніколи. */
export const DEFAULT_DEADLINE_TIME = '18:00';

/** Поля дедлайну для запису: прапорці або обидва є (точний), або обох немає. */
export interface DeadlineFields {
  deadline: string;
  deadlineHasTime?: true;
  /** Копія `deadline`, записана РАЗОМ із прапорцем (C1). */
  deadlineTimeAt?: string;
}

export interface DeadlineSource {
  deadline?: string | null;
  deadlineHasTime?: boolean | unknown;
  deadlineTimeAt?: string | unknown;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** `H`, `HH`, `H:MM`, `HH:MM` — лише цифри, без внутрішніх пробілів і знаків (C3). */
const TIME_RE = /^(\d{1,2})(?::(\d{2}))?$/;
const HOURS_RE = /^\d{1,2}$/;
const MINUTES_RE = /^\d{1,2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

function inRange(hours: number, minutes: number): string | null {
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${pad(hours)}:${pad(minutes)}`;
}

/**
 * Час дедлайну з поля вводу → `HH:MM` або null (C3, дзеркало вебу).
 *
 * - одним рядком: `H`, `HH`, `H:MM`, `HH:MM` після обрізання ЗОВНІШНІХ
 *   пробілів; лише цифри; години 0..23, хвилини 0..59. Інакше null — без
 *   «затискання»: `25:00` не стає `23:00`.
 * - окремими полями (`parseDeadlineTime('9', '5')`, мобільний аркуш): години
 *   `H`/`HH`, хвилини `M`/`MM` або порожньо (= 00), ті самі межі.
 */
export function parseDeadlineTime(raw: string, mins?: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (mins === undefined) {
    const m = TIME_RE.exec(trimmed);
    if (!m) return null;
    return inRange(Number(m[1]), m[2] === undefined ? 0 : Number(m[2]));
  }
  if (typeof mins !== 'string' || !HOURS_RE.test(trimmed)) return null;
  const minsTrimmed = mins.trim();
  if (minsTrimmed && !MINUTES_RE.test(minsTrimmed)) return null;
  return inRange(Number(trimmed), minsTrimmed ? Number(minsTrimmed) : 0);
}

function localDate(dayKey: string, hours: number, minutes: number): Date | null {
  const m = DAY_RE.exec((dayKey ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d, hours, minutes, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * День (`YYYY-MM-DD`) + необов'язковий час → поля дедлайну (C1–C3).
 * Без часу (null/undefined) — локальний полудень без прапорців; з часом —
 * локальний момент, `deadlineHasTime: true` і `deadlineTimeAt` = той самий рядок.
 * Неіснуюча доба (2026-02-30), биті дані чи нерозбірний час → null (як на вебі).
 */
export function buildDeadline(dayKey: string, time: string | null | undefined): DeadlineFields | null {
  if (time === null || time === undefined) {
    const date = localDate(dayKey, DATE_ONLY_ANCHOR_HOUR, 0);
    return date ? { deadline: date.toISOString() } : null;
  }
  const hhmm = parseDeadlineTime(time);
  if (!hhmm) return null;
  const [hh, mm] = hhmm.split(':').map(Number);
  const date = localDate(dayKey, hh, mm);
  if (!date) return null;
  const deadline = date.toISOString();
  return { deadline, deadlineHasTime: true, deadlineTimeAt: deadline };
}

/**
 * Чи дедлайн — ТОЧНИЙ момент (C1): прапорець строго `true` І `deadlineTimeAt`
 * — рядок, що дорівнює `deadline`. Будь-що інше — дедлайн лише на день.
 */
export function isTimedDeadline(task: DeadlineSource | null | undefined): boolean {
  return Boolean(
    task
      && task.deadlineHasTime === true
      && typeof task.deadlineTimeAt === 'string'
      && typeof task.deadline === 'string'
      && task.deadlineTimeAt === task.deadline,
  );
}

/**
 * Джерело дедлайну з УЖЕ перевіреного UI-прапорця (чернетка форми, `value`
 * поля DeadlineField — туди кладуть isTimedDeadline(task), а не сирий ключ).
 */
export function deadlineSourceOf(deadline: string | null | undefined, timed: boolean | null | undefined): DeadlineSource {
  return timed && deadline
    ? { deadline, deadlineHasTime: true, deadlineTimeAt: deadline }
    : { deadline: deadline ?? null };
}

/** Локальна календарна доба дедлайну (`YYYY-MM-DD`); голий день — як є. */
export function deadlineDayKey(deadline?: string | null): string | null {
  return isoToLocalDateInput(deadline) || null;
}

/** Мітка часу ТОЧНОГО дедлайну (isTimedDeadline, повний ISO), інакше null. */
export function exactDeadlineMs(task: DeadlineSource | null | undefined): number | null {
  if (!task || !isTimedDeadline(task)) return null;
  const raw = (task.deadline as string).trim();
  if (DAY_RE.test(raw)) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Локальний `HH:MM` лише для ТОЧНОГО дедлайну (isTimedDeadline), інакше null. */
export function deadlineTimeOf(task: DeadlineSource | null | undefined): string | null {
  const ms = exactDeadlineMs(task);
  if (ms === null) return null;
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Чи дедлайн уже минув (C2): точний — `now` пізніше за момент; інакше добовий
 * — прострочений лише з наступної ЛОКАЛЬНОЇ доби (голий `YYYY-MM-DD` — доба
 * як є, без зсуву через UTC). Статус задачі тут не враховується.
 */
export function isDeadlinePast(task: DeadlineSource | null | undefined, now: Date = new Date()): boolean {
  if (!task || typeof task.deadline !== 'string' || !task.deadline) return false;
  const exact = exactDeadlineMs(task);
  if (exact !== null) return now.getTime() > exact;
  const day = deadlineDayKey(task.deadline);
  return !!day && localDateKey(now) > day;
}

/** Перенести дедлайн на інший день, зберігши час задачі (якщо він є). */
export function moveDeadlineToDay(task: DeadlineSource | null | undefined, dayKey: string): DeadlineFields | null {
  return buildDeadline(dayKey, deadlineTimeOf(task));
}

/**
 * Дедлайн наступної копії повторюваної задачі. `nextDayOf` отримує ЛОКАЛЬНУ
 * добу поточного дедлайну (`YYYY-MM-DD`, не сирий ISO) і повертає наступну
 * або null (кінець повторення). Час задачі переноситься з НОВИМ
 * `deadlineTimeAt`; без часу — лише день, без прапорців.
 */
export function nextOccurrenceDeadline(
  task: DeadlineSource | null | undefined,
  nextDayOf: (dayKey: string) => string | null,
): DeadlineFields | null {
  const fromDay = deadlineDayKey(task?.deadline as string | null | undefined);
  if (!fromDay) return null;
  const nextDay = nextDayOf(fromDay);
  return nextDay ? buildDeadline(nextDay, deadlineTimeOf(task)) : null;
}

/** Зняти дедлайн — разом із прапорцями часу. */
export function clearedDeadline(): { deadline: undefined; deadlineHasTime: undefined; deadlineTimeAt: undefined } {
  return { deadline: undefined, deadlineHasTime: undefined, deadlineTimeAt: undefined };
}

/**
 * Поля для запису ПОВЕРХ наявної задачі (`{...t, ...patch}`): прапорці явно
 * `undefined` для добового дедлайну — щоб розгортання не лишило старий `true`.
 * `timed` — уже перевірений UI-прапорець.
 */
export function deadlinePatch(
  deadline: string | null | undefined,
  timed?: boolean | null,
): { deadline: string | undefined; deadlineHasTime: true | undefined; deadlineTimeAt: string | undefined } {
  if (!deadline) return clearedDeadline();
  const isTimed = timed === true;
  return { deadline, deadlineHasTime: isTimed ? true : undefined, deadlineTimeAt: isTimed ? deadline : undefined };
}

/** `HH:MM` (24 год) для підпису «<день>, HH:MM» або ''. */
export function formatDeadlineTime(task: DeadlineSource | null | undefined): string {
  return deadlineTimeOf(task) ?? '';
}

/** День з Date (для пресетів/календаря) → ключ доби. */
export function dayKeyOf(day: Date): string {
  return localDateKey(day);
}

/**
 * Записати поля дедлайну в об'єкт задачі за правилом «лише true» (C1):
 * `deadline` порожній — знімає й прапорці; `deadlineHasTime === true` (уже
 * перевірений прапорець: чернетка або buildDeadline) — пише обидва ключі з
 * `deadlineTimeAt` = `deadline`; інакше обидва ключі видаляються.
 */
export function applyDeadlineFields<T extends { deadline?: string; deadlineHasTime?: boolean; deadlineTimeAt?: string }>(
  target: T,
  fields: { deadline?: string | null; deadlineHasTime?: boolean | null },
): T {
  if (fields.deadline) target.deadline = fields.deadline;
  else delete target.deadline;
  if (fields.deadline && fields.deadlineHasTime === true) {
    target.deadlineHasTime = true;
    target.deadlineTimeAt = fields.deadline;
  } else {
    delete target.deadlineHasTime;
    delete target.deadlineTimeAt;
  }
  return target;
}
