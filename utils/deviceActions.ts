/**
 * utils/deviceActions.ts — дії «поза застосунком» (DeviceAction) як дані.
 *
 * Годинник, кнопка «Стоп» у Live Activity і в Android-нотифікації не вміють
 * писати в AsyncStorage. Кожен такий намір приходить сюди як DeviceAction з
 * UUID, згенерованим на пристрої (docs/specs/watch-lockscreen-v1.md §2). Той
 * самий UUID — і ключ ідемпотентності, і зерно ВСІХ id записів, які дія
 * створює (`wa-<id>`, `<id>-next`, `adhoc:<id>`). Тому дія, застосована
 * телефоном і сервером у будь-якому порядку, дає ті самі записи (§0).
 *
 * Тут лише чисті функції: валідація конверта (§2.3), похідні id (§1) і
 * побудова записів (§3). Читання/запис сховища — store/device-actions.ts.
 * Сервер має дзеркало цих правил у `watch/actions.py`; розбіжність тут
 * означала б два різні записи з одним id.
 */
import type { ActiveTimer } from './activeTimers';
import type { Account } from './accounts';
import { localDateKey } from './dateUtils';
import type { Habit } from './preventionUtils';
import { reopenInfoFor } from './taskCompletion';
import { applyDeadlineFields, nextOccurrenceDeadline } from './taskDeadline';
import { nextRecurrenceDate } from './taskRecurrence';
import type { SubTask, Task, TaskHistoryEvent, TaskTimeEntry } from './taskUtils';
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { uuidV4 } from './uuid';

// ─── Типи (§2) ────────────────────────────────────────────────────────────────

export type DeviceActionType =
  | 'task_complete' | 'task_create' | 'timer_start' | 'timer_stop'
  | 'expense_create' | 'habit_check' | 'note_create';
export type DeviceActionSource = 'watch' | 'live_activity' | 'android_notification';
export interface DeviceAction {
  id: string; type: DeviceActionType; at: string;
  tz?: string; day?: string; source?: DeviceActionSource;
  payload: Record<string, unknown>;
}
export type ActionStatus = 'applied' | 'duplicate' | 'rejected' | 'retry';
export type ActionRejectReason =
  | 'invalid_payload' | 'unknown_type' | 'not_found' | 'forbidden' | 'review_required'
  | 'task_done' | 'invalid_account' | 'stale' | 'conflict';
export interface ActionResult {
  id: string; status: ActionStatus; reason?: ActionRejectReason;
  record?: { collection: string; local_id: string };
}

export const DEVICE_ACTION_TYPES: readonly DeviceActionType[] = [
  'task_complete', 'task_create', 'timer_start', 'timer_stop',
  'expense_create', 'habit_check', 'note_create',
];

/** Вікно, в якому `not_found` ще вважається тимчасовим (§2.1). */
export const RETRY_WINDOW_MS = 15 * 60_000;
/** Годинник пристрою може трохи поспішати — далі вже не «поспішає», а бреше. */
export const FUTURE_TOLERANCE_MS = 10 * 60_000;
/** Старіші дії не застосовуються: стан, у який вони цілились, давно інший. */
export const STALE_AFTER_MS = 7 * 24 * 3600_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isActionId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isDeviceActionType(value: unknown): value is DeviceActionType {
  return typeof value === 'string' && (DEVICE_ACTION_TYPES as readonly string[]).includes(value);
}

// ─── Похідні id (§1) ─────────────────────────────────────────────────────────

/** Запис часу (task/meeting timeEntries і `time_entries`) та подія історії. */
export const entryIdFor = (actionId: string) => `wa-${actionId}`;
/** Подія `timer_stop` в історії задачі. */
export const stopHistoryIdFor = (actionId: string) => `wa-${actionId}-s`;
/** Наступна копія повторюваної задачі та її подія `created`. */
export const nextTaskIdFor = (actionId: string) => `${actionId}-next`;
export const nextHistoryIdFor = (actionId: string) => `wa-${actionId}-n`;
/** Вільний таймер, запущений дією. */
export const adhocTimerIdFor = (actionId: string) => `adhoc:${actionId}`;

/** Нова дія з цього пристрою (тести, майбутні джерела на JS). */
export function makeDeviceAction(
  type: DeviceActionType,
  payload: Record<string, unknown>,
  options: { at?: Date; source?: DeviceActionSource; tz?: string; day?: string } = {},
): DeviceAction {
  const at = options.at ?? new Date();
  return {
    id: uuidV4(),
    type,
    at: at.toISOString(),
    ...(options.tz ? { tz: options.tz } : {}),
    ...(options.day ? { day: options.day } : {}),
    ...(options.source ? { source: options.source } : {}),
    payload,
  };
}

export function actionResult(
  id: string,
  status: ActionStatus,
  reason?: ActionRejectReason,
  record?: { collection: string; local_id: string },
): ActionResult {
  return { id, status, ...(reason ? { reason } : {}), ...(record ? { record } : {}) };
}

// ─── Час і доба в поясі дії ──────────────────────────────────────────────────

/** Чи знає рушій Intl такий IANA-пояс (у Hermes невідомий пояс кидає). */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim() || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

/**
 * Локальна доба (`YYYY-MM-DD`) моменту в поясі `tz`; без поясу — у поясі
 * пристрою. Голий `YYYY-MM-DD` уже є добою і повертається як є.
 */
export function dayKeyInZone(value: unknown, tz?: string): string | null {
  if (typeof value === 'string' && DAY_RE.test(value.trim())) return value.trim();
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  if (tz && isValidTimeZone(tz)) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      }).formatToParts(date);
      const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
      const key = `${get('year')}-${get('month')}-${get('day')}`;
      if (DAY_RE.test(key)) return key;
    } catch {
      // Intl без formatToParts — падаємо на пояс пристрою нижче.
    }
  }
  return localDateKey(date);
}

// ─── Валідація конверта (§2.3) ───────────────────────────────────────────────

export interface CheckedAction {
  ok: true;
  action: DeviceAction;
  at: Date;
  /** Валідний IANA-пояс дії або undefined (тоді — пояс пристрою). */
  tz: string | undefined;
  day: string;
}

export type EnvelopeCheck = CheckedAction | { ok: false; result: ActionResult };

/**
 * Перевірка конверта в тому самому порядку, що й на сервері: id → тип →
 * час/payload/доба → «застаріла». Результати відмови тут остаточні (§2.1).
 */
export function checkEnvelope(raw: unknown, now: Date): EnvelopeCheck {
  const reject = (id: string, reason: ActionRejectReason): EnvelopeCheck =>
    ({ ok: false, result: actionResult(id, 'rejected', reason) });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return reject('', 'invalid_payload');
  const input = raw as Record<string, unknown>;
  if (!isActionId(input.id)) {
    return reject(typeof input.id === 'string' ? input.id.slice(0, 64) : '', 'invalid_payload');
  }
  const id = input.id;
  if (!isDeviceActionType(input.type)) return reject(id, 'unknown_type');
  const atMs = typeof input.at === 'string' ? Date.parse(input.at) : NaN;
  if (!Number.isFinite(atMs) || atMs > now.getTime() + FUTURE_TOLERANCE_MS) return reject(id, 'invalid_payload');
  const payload = input.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reject(id, 'invalid_payload');
  const tz = isValidTimeZone(input.tz) ? input.tz : undefined;
  const at = new Date(atMs);
  let day: string | null;
  if (input.day !== undefined && input.day !== null) {
    day = typeof input.day === 'string' && DAY_RE.test(input.day.trim()) ? input.day.trim() : null;
  } else {
    day = dayKeyInZone(at, tz);
  }
  if (!day) return reject(id, 'invalid_payload');
  if (atMs < now.getTime() - STALE_AFTER_MS) return reject(id, 'stale');
  const action: DeviceAction = {
    id,
    type: input.type,
    at: input.at as string,
    ...(typeof input.tz === 'string' ? { tz: input.tz } : {}),
    ...(typeof input.day === 'string' ? { day: input.day } : {}),
    ...(typeof input.source === 'string' ? { source: input.source as DeviceActionSource } : {}),
    payload: payload as Record<string, unknown>,
  };
  return { ok: true, action, at, tz, day };
}

/** `not_found` ще може «знайтись», поки дія свіжа (§2.1) — тоді це `retry`. */
export function notFoundStatus(at: Date, now: Date): ActionStatus {
  return now.getTime() - at.getTime() < RETRY_WINDOW_MS ? 'retry' : 'rejected';
}

/** Обрізаний рядок довжиною 1..max або null. */
export function payloadText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

// ─── Записи завдань (§3.1–§3.2) ──────────────────────────────────────────────

/** Повторювана задача — та, що несе правило повтору (поле пише лише мобільний). */
export type RecurringTask = Task & { recurrence?: RecurrenceRule };

function historyOf(task: Pick<Task, 'history'>): TaskHistoryEvent[] {
  return Array.isArray(task.history) ? task.history : [];
}

export function hasHistoryEvent(task: Pick<Task, 'history'>, eventId: string): boolean {
  return historyOf(task).some(event => event?.id === eventId);
}

/** «Готово» з дії — односторонньо, з тим самим `reopen`, що й чекбокс. */
export function completeTaskRecord<T extends Task>(
  task: T,
  options: { actionId: string; at: string; doneColumnId: string },
): T {
  const reopen = reopenInfoFor(task);
  const event: TaskHistoryEvent = {
    id: entryIdFor(options.actionId),
    at: options.at,
    type: 'done',
    ...(reopen ? { reopen } : {}),
  };
  const subtasks: SubTask[] = Array.isArray(task.subtasks) ? task.subtasks : [];
  return {
    ...task,
    status: 'done',
    kanbanColumnId: options.doneColumnId,
    subtasks: subtasks.map(s => (s.done ? s : { ...s, done: true })),
    history: [...historyOf(task), event],
  };
}

/** Поля, що описують ЗДАЧУ результату конкретної копії, а не саму задачу. */
const TRANSIENT_TASK_FIELDS = ['reviewState', 'reviewFeedback', 'resultSummary', 'resultLinks', 'resultFiles'] as const;

/**
 * Наступна копія повторюваної задачі (§3.1 п.6) або null, коли правило каже
 * «далі нічого» чи дедлайну немає. Будується з задачі ДО завершення.
 */
export function nextOccurrenceRecord(
  before: RecurringTask,
  options: { actionId: string; at: string; todoColumnId: string },
): RecurringTask | null {
  const rule = before.recurrence;
  if (!rule || !before.deadline) return null;
  const fields = nextOccurrenceDeadline(before, day => nextRecurrenceDate(day, rule));
  if (!fields) return null;
  const next: RecurringTask = {
    ...before,
    id: nextTaskIdFor(options.actionId),
    status: 'active',
    kanbanColumnId: options.todoColumnId,
    subtasks: (Array.isArray(before.subtasks) ? before.subtasks : []).map(s => ({ ...s, done: false })),
    timeEntries: [],
    history: [{ id: nextHistoryIdFor(options.actionId), at: options.at, type: 'created' }],
    createdAt: options.at,
  };
  delete next.updatedAt;
  delete next.completedAt;
  for (const field of TRANSIENT_TASK_FIELDS) delete (next as Partial<Task>)[field];
  return applyDeadlineFields(next, fields);
}

/** Задача, надиктована на годиннику (§3.2): особиста, «на сьогодні». */
export function createdTaskRecord(options: { actionId: string; at: string; title: string; deadline: string }): Task {
  return {
    id: options.actionId,
    title: options.title,
    status: 'active',
    kanbanColumnId: 'status-active',
    priorityLevel: 3,
    priority: 'medium',
    subtasks: [],
    createdAt: options.at,
    deadline: options.deadline,
    history: [{ id: entryIdFor(options.actionId), at: options.at, type: 'created' }],
  };
}

// ─── Таймери (§3.3–§3.4) ─────────────────────────────────────────────────────

/** Секунди сесії: від `startedAt` таймера до `at` дії, не менше нуля. */
export function sessionSeconds(startedAt: string, at: string | Date): number {
  const end = at instanceof Date ? at.getTime() : Date.parse(at);
  const start = Date.parse(startedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function sessionEntry(timer: Pick<ActiveTimer, 'startedAt'>, entryId: string, endedAt: string, duration: number): TaskTimeEntry {
  return { id: entryId, startedAt: timer.startedAt, endedAt, duration };
}

// ─── Фінанси (§3.5) ──────────────────────────────────────────────────────────

export const MAX_EXPENSE_AMOUNT = 1e12;

/** Округлення суми до знаків валюти рахунку (як Math.round у формі операції). */
export function roundAmount(amount: number, decimals: number): number {
  const digits = Number.isFinite(decimals) ? Math.max(0, Math.min(8, Math.floor(decimals))) : 2;
  const scale = 10 ** digits;
  return Math.round(amount * scale) / scale;
}

export function isValidExpenseAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_EXPENSE_AMOUNT;
}

export interface ExpenseRecord {
  id: string;
  type: 'expense';
  category: string;
  amount: number;
  note: string;
  date: string;
  accountId: string;
  currency: string;
}

export function expenseRecord(options: {
  actionId: string; at: string; amount: number; category: string; note?: string;
  account: Pick<Account, 'id' | 'currency'>; decimals: number;
}): ExpenseRecord {
  const currency = options.account.currency || 'UAH';
  return {
    id: options.actionId,
    type: 'expense',
    category: options.category,
    amount: roundAmount(options.amount, options.decimals),
    note: (options.note ?? '').trim().slice(0, 500),
    date: options.at,
    accountId: options.account.id,
    currency,
  };
}

// ─── Звички (§3.6) ───────────────────────────────────────────────────────────

/**
 * Звичка після відмітки з набором-семантикою на добу `day` (не перемикач).
 * null — нічого міняти не треба (`duplicate`).
 */
export function habitAfterCheck(
  habit: Habit,
  options: { done: boolean; day: string; tz: string | undefined; at: string },
): Habit | null {
  const log = Array.isArray(habit.log) ? habit.log.filter((entry): entry is string => typeof entry === 'string') : [];
  const onDay = (entry: string) => dayKeyInZone(entry, options.tz) === options.day;
  const today = log.filter(onDay);
  if (options.done) {
    if (today.length) return null;
    return { ...habit, log: [...log, options.at] };
  }
  if (!today.length) return null;
  return { ...habit, log: log.filter(entry => !onDay(entry)) };
}

// ─── Нотатки (§3.7) ──────────────────────────────────────────────────────────

export interface InboxNoteRecord {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Назва нотатки — перший рядок тексту, до 80 символів. */
export function noteTitleFromText(text: string): string {
  return text.split('\n', 1)[0].trim().slice(0, 80);
}

export function inboxNoteRecord(options: { actionId: string; at: string; text: string }): InboxNoteRecord {
  return {
    id: options.actionId,
    title: noteTitleFromText(options.text),
    body: options.text,
    createdAt: options.at,
    updatedAt: options.at,
  };
}
