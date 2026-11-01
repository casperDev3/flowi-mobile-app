/**
 * store/device-actions.ts — застосувати DeviceAction на телефоні.
 *
 * Годинник (через WatchConnectivity), «Стоп» у Live Activity і в
 * Android-нотифікації присилають дії (utils/deviceActions.ts). Телефон
 * застосовує їх РІВНО так, як це зробила б людина в застосунку: ті самі
 * ключі, ті самі форми записів, `updateSynced` — а далі звичайний синк
 * везе зміни на сервер і в веб (docs/specs/watch-lockscreen-v1.md §0, §3).
 *
 * Та сама дія могла вже дійти до сервера іншим шляхом (годинник не дочекався
 * «ack» за 3 с) — тому:
 *   • журнал `device_actions_applied_v1` відповідає `duplicate` на повтор;
 *   • кожен обробник ще й дивиться на стан цілі (запис із id дії вже є,
 *     задача вже «готово», у таймера вже є наш `wa-` запис);
 *   • id записів і часові поля беруться з дії, а не з годинника телефона,
 *     тож обидва шляхи пишуть той самий запис, а розбіжність у `updatedAt`
 *     зводить звичайний LWW синку.
 *
 * Дії йдуть строго по черзі (і між викликами теж): друга дія пакета часто
 * спирається на першу (старт → стоп того самого таймера).
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import * as FlowiAndroid from '@/modules/flowi-android';
import * as IosBridge from '@/modules/flowi-ios-bridge';
import { taskTimerId, type ActiveTimer } from '@/utils/activeTimers';
import type { Account } from '@/utils/accounts';
import {
  actionResult,
  checkEnvelope,
  completeTaskRecord,
  createdTaskRecord,
  entryIdFor,
  expenseRecord,
  habitAfterCheck,
  hasHistoryEvent,
  inboxNoteRecord,
  isValidExpenseAmount,
  nextOccurrenceRecord,
  nextTaskIdFor,
  notFoundStatus,
  payloadText,
  stopHistoryIdFor,
  adhocTimerIdFor,
  type ActionRejectReason,
  type ActionResult,
  type ActionStatus,
  type CheckedAction,
  type DeviceAction,
  type RecurringTask,
} from '@/utils/deviceActions';
import type { Habit } from '@/utils/preventionUtils';
import { ACTIVE_COLUMN_ID, DONE_COLUMN_ID, scopedColumnFor, type TaskStatusColumn } from '@/utils/taskStatuses';
import type { Task } from '@/utils/taskUtils';
import { taskRights } from '@/utils/teamwork';
import { currencyInfo } from '@/utils/watchSnapshot';
import { widgetRoleMap } from '@/utils/widgetSnapshot';

import { useAuth } from './auth';
import { ensureStorageMigrations } from './migrations';
import { loadData, removeData, saveData } from './storage';
import { updateSynced } from './synced-storage';
import {
  TIME_ENTRIES_KEY,
  TIMERS_KEY,
  notifyExternalTimerChange,
  patchTaskRecord,
  startAdHocTimerOp,
  startTaskTimerOp,
  stopTimerOp,
  type ExternalTimerChange,
} from './timer-ops';

export const APPLIED_LOG_KEY = 'device_actions_applied_v1';
const LOG_MAX_ENTRIES = 500;
const LOG_MAX_AGE_MS = 30 * 24 * 3600_000;

/** Запис журналу ідемпотентності (§2.2). `reason`/`record` — щоб повтор віддав той самий результат. */
export interface AppliedLogEntry {
  id: string;
  status: ActionStatus;
  at: number;
  reason?: ActionRejectReason;
  record?: { collection: string; local_id: string };
}

/** Що повернув обробник — до правила `retry` (§2.1) і журналу. */
interface Outcome {
  status: 'applied' | 'duplicate' | 'rejected';
  reason?: ActionRejectReason;
  record?: { collection: string; local_id: string };
}

const applied = (collection: string, local_id: string): Outcome => ({ status: 'applied', record: { collection, local_id } });
const duplicate = (collection?: string, local_id?: string): Outcome =>
  ({ status: 'duplicate', ...(collection && local_id ? { record: { collection, local_id } } : {}) });
const rejected = (reason: ActionRejectReason): Outcome => ({ status: 'rejected', reason });

/** Записи дій пристроїв — лише з прокинутою помилкою сховища (→ `retry`). */
const CHECKED = { checked: true } as const;

interface StoredTimeEntry {
  id?: unknown;
  timerId?: unknown;
  taskId?: unknown;
  task?: unknown;
  startedAt?: unknown;
}

function sameInstant(value: unknown, at: Date): boolean {
  return typeof value === 'string' && Date.parse(value) === at.getTime();
}

/**
 * Запис time_entries — це зупинена сесія вільного таймера `adhoc:<id>`:
 * явний `timerId`, id дзеркала вебу (`mirror-adhoc:<id>-…`) чи сесії
 * (`adhoc:<id>-…`), або той самий старт без задачі з тією ж назвою.
 */
export function isAdhocSessionOf(entry: StoredTimeEntry, timerId: string, at: Date, label: string): boolean {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.timerId === timerId) return true;
  if (typeof entry.id === 'string'
    && (entry.id.startsWith(`${timerId}-`) || entry.id.startsWith(`mirror-${timerId}-`))) return true;
  return !entry.taskId && sameInstant(entry.startedAt, at)
    && typeof entry.task === 'string' && entry.task.trim() === label;
}

/** Спільне для пакета: читається один раз на виклик. */
interface BatchContext {
  now: Date;
  roles: Record<string, string>;
  myUserId: string | null;
  statuses: TaskStatusColumn[];
  changes: ExternalTimerChange;
}

interface ActionContext extends BatchContext {
  id: string;
  at: Date;
  atIso: string;
  tz: string | undefined;
  day: string;
  payload: Record<string, unknown>;
}

// ─── Журнал ──────────────────────────────────────────────────────────────────

function pruneLog(entries: AppliedLogEntry[], now: number): AppliedLogEntry[] {
  return entries
    .filter(e => e && typeof e.id === 'string' && Number.isFinite(e.at) && now - e.at < LOG_MAX_AGE_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, LOG_MAX_ENTRIES);
}

async function readLog(): Promise<AppliedLogEntry[]> {
  const raw = await loadData<unknown>(APPLIED_LOG_KEY, []);
  return Array.isArray(raw) ? (raw.filter(e => e && typeof e === 'object') as AppliedLogEntry[]) : [];
}

/** Повтор зареєстрованої дії: успіх стає `duplicate`, відмова лишається відмовою. */
function loggedResult(entry: AppliedLogEntry): ActionResult {
  if (entry.status === 'applied' || entry.status === 'duplicate') {
    return actionResult(entry.id, 'duplicate', undefined, entry.record);
  }
  return actionResult(entry.id, entry.status, entry.reason, entry.record);
}

// ─── Допоміжне ───────────────────────────────────────────────────────────────

async function readArray<T>(key: string): Promise<T[]> {
  const raw = await loadData<unknown>(key, []);
  return Array.isArray(raw) ? (raw.filter(item => item && typeof item === 'object') as T[]) : [];
}

function doneColumnFor(ctx: BatchContext, projectId: string | undefined): string {
  if (!projectId) return DONE_COLUMN_ID;
  return scopedColumnFor(ctx.statuses, projectId, 'done')?.id ?? DONE_COLUMN_ID;
}

function todoColumnFor(ctx: BatchContext, projectId: string | undefined): string {
  if (!projectId) return ACTIVE_COLUMN_ID;
  return scopedColumnFor(ctx.statuses, projectId, 'todo')?.id ?? ACTIVE_COLUMN_ID;
}

/** Глядач не рухає проєктну задачу (contract §4.1) — і годинник за нього теж. */
function forbiddenFor(ctx: BatchContext, task: Task, execute: boolean): boolean {
  if (!task.projectId) return false;
  const role = ctx.roles[task.projectId];
  if (role === 'viewer') return true;
  if (execute && role && ctx.myUserId) {
    return !taskRights(task as Parameters<typeof taskRights>[0], role as Parameters<typeof taskRights>[1], ctx.myUserId).execute;
  }
  return false;
}

// ─── Обробники (§3) ──────────────────────────────────────────────────────────

async function taskComplete(ctx: ActionContext): Promise<Outcome> {
  const taskId = payloadText(ctx.payload.taskId, 64);
  if (!taskId) return rejected('invalid_payload');
  const tasks = await readArray<RecurringTask>('tasks');
  const task = tasks.find(t => t.id === taskId);
  if (!task) return rejected('not_found');
  if (hasHistoryEvent(task, entryIdFor(ctx.id))) {
    // Повтор після `retry`: «готово» вже записано, але таймер міг лишитись.
    await stopTaskTimerFor(ctx, taskId);
    return duplicate('tasks', taskId);
  }
  if (task.status === 'done') return duplicate('tasks', taskId);
  if (task.reviewRequired === true || task.resultRequirements?.length) return rejected('review_required');
  if (forbiddenFor(ctx, task, true)) return rejected('forbidden');

  let completed = false;
  await updateSynced<RecurringTask>('tasks', fresh => {
    const index = fresh.findIndex(t => t.id === taskId);
    if (index < 0 || fresh[index].status === 'done') return fresh;
    const before = fresh[index];
    const next = [...fresh];
    next[index] = completeTaskRecord(before, {
      actionId: ctx.id, at: ctx.atIso, doneColumnId: doneColumnFor(ctx, before.projectId),
    });
    // Наступна копія повторюваної задачі (§3.1 п.6) — лише одна на дію.
    if (!fresh.some(t => t.id === nextTaskIdFor(ctx.id))) {
      const copy = nextOccurrenceRecord(before, {
        actionId: ctx.id, at: ctx.atIso, todoColumnId: todoColumnFor(ctx, before.projectId),
      });
      if (copy) next.push(copy);
    }
    completed = true;
    return next;
  }, CHECKED);
  if (!completed) return duplicate('tasks', taskId);
  ctx.changes.tasks = true;

  await stopTaskTimerFor(ctx, taskId);
  return applied('tasks', taskId);
}

/** «Готово» зупиняє таймер задачі тією ж дією — без переносу в «На перевірці». */
async function stopTaskTimerFor(ctx: ActionContext, taskId: string): Promise<void> {
  const timers = await readArray<ActiveTimer>(TIMERS_KEY);
  const timerId = taskTimerId(taskId);
  if (!timers.some(t => t.id === timerId)) return;
  await stopTimerOp(timerId, {
    at: ctx.at, entryId: entryIdFor(ctx.id), historyId: stopHistoryIdFor(ctx.id),
    keepColumn: true, silentWorkflow: true, checked: true,
  });
  Object.assign(ctx.changes, { timers: true, timeEntries: true });
}

async function taskCreate(ctx: ActionContext): Promise<Outcome> {
  const title = payloadText(ctx.payload.title, 200);
  const deadline = ctx.payload.deadline;
  if (!title || typeof deadline !== 'string' || /^\d{4}-\d{2}-\d{2}$/.test(deadline.trim())
    || !Number.isFinite(Date.parse(deadline))) {
    return rejected('invalid_payload');
  }
  let created = false;
  await updateSynced<Task>('tasks', fresh => {
    if (fresh.some(t => t.id === ctx.id)) return fresh;
    created = true;
    return [...fresh, createdTaskRecord({ actionId: ctx.id, at: ctx.atIso, title, deadline })];
  }, CHECKED);
  if (!created) return duplicate('tasks', ctx.id);
  ctx.changes.tasks = true;
  return applied('tasks', ctx.id);
}

async function timerStart(ctx: ActionContext): Promise<Outcome> {
  const kind = ctx.payload.kind;
  if (kind === 'adhoc') {
    const label = payloadText(ctx.payload.label, 120);
    if (!label) return rejected('invalid_payload');
    const timerId = adhocTimerIdFor(ctx.id);
    // Ту саму дію вже застосували деінде (сервер, коли годинник не дочекався
    // «ack») і таймер відтоді зупинили: повтор не має його воскрешати.
    const entries = await readArray<StoredTimeEntry>(TIME_ENTRIES_KEY);
    if (entries.some(e => isAdhocSessionOf(e, timerId, ctx.at, label))) return duplicate('active_timers', timerId);
    const outcome = await startAdHocTimerOp(label, { id: timerId, at: ctx.at, checked: true });
    if (outcome === 'exists') return duplicate('active_timers', timerId);
    ctx.changes.timers = true;
    return applied('active_timers', timerId);
  }
  if (kind !== 'task') return rejected('invalid_payload');
  const taskId = payloadText(ctx.payload.taskId, 64);
  if (!taskId) return rejected('invalid_payload');
  const tasks = await readArray<Task>('tasks');
  const task = tasks.find(t => t.id === taskId);
  if (!task) return rejected('not_found');
  const timerId = taskTimerId(taskId);
  const timers = await readArray<ActiveTimer>(TIMERS_KEY);
  const running = timers.find(t => t.id === timerId || t.taskId === taskId);
  if (running && !hasHistoryEvent(task, entryIdFor(ctx.id)) && sameInstant(running.startedAt, ctx.at)) {
    // Попередня спроба записала таймер, але не історію задачі (збій запису →
    // `retry`): дописати подію старту, а не відповісти «вже є» з дірою.
    await patchTaskRecord(taskId, t => hasHistoryEvent(t, entryIdFor(ctx.id)) ? t : {
      ...t,
      history: [...(t.history ?? []), { id: entryIdFor(ctx.id), at: ctx.atIso, type: 'timer_start' }],
    }, {}, true);
    Object.assign(ctx.changes, { tasks: true });
    return duplicate('active_timers', timerId);
  }
  if (running || hasHistoryEvent(task, entryIdFor(ctx.id))) {
    return duplicate('active_timers', timerId);
  }
  if (task.status === 'done') return rejected('task_done');
  if (forbiddenFor(ctx, task, false)) return rejected('forbidden');
  const outcome = await startTaskTimerOp(
    { id: task.id, title: task.title, status: task.status, kanbanColumnId: task.kanbanColumnId, projectId: task.projectId },
    { at: ctx.at, historyId: entryIdFor(ctx.id), silentWorkflow: true, checked: true },
  );
  if (outcome === 'task_done') return rejected('task_done');
  if (outcome === 'exists') return duplicate('active_timers', timerId);
  Object.assign(ctx.changes, { timers: true, tasks: true });
  return applied('active_timers', timerId);
}

async function timerStop(ctx: ActionContext): Promise<Outcome> {
  const timerId = payloadText(ctx.payload.timerId, 64);
  if (!timerId) return rejected('invalid_payload');
  const entryId = entryIdFor(ctx.id);
  const timers = await readArray<ActiveTimer>(TIMERS_KEY);
  const timer = timers.find(t => t.id === timerId);
  if (timer?.taskId) {
    const task = (await readArray<Task>('tasks')).find(t => t.id === timer.taskId);
    if (task && forbiddenFor(ctx, task, false)) return rejected('forbidden');
  }
  const stopped = timer
    ? await stopTimerOp(timerId, {
      at: ctx.at, entryId, historyId: stopHistoryIdFor(ctx.id), silentWorkflow: true, checked: true,
    })
    : null;
  if (!stopped) {
    const entries = await readArray<{ id?: unknown }>(TIME_ENTRIES_KEY);
    if (entries.some(e => e.id === entryId)) return duplicate('time_entries', entryId);
    return rejected('not_found');
  }
  Object.assign(ctx.changes, {
    timers: true,
    timeEntries: true,
    ...(stopped.timer.taskId ? { tasks: true } : {}),
    ...(stopped.timer.meetingId ? { meetings: true } : {}),
  });
  return stopped.mirror ? applied('time_entries', entryId) : applied('active_timers', timerId);
}

async function expenseCreate(ctx: ActionContext): Promise<Outcome> {
  const { amount, note } = ctx.payload;
  const category = payloadText(ctx.payload.category, 64);
  const accountId = payloadText(ctx.payload.accountId, 64);
  if (!isValidExpenseAmount(amount) || !category || !accountId
    || (note !== undefined && note !== null && typeof note !== 'string')) {
    return rejected('invalid_payload');
  }
  const transactions = await readArray<{ id?: unknown }>('transactions');
  if (transactions.some(t => t.id === ctx.id)) return duplicate('transactions', ctx.id);
  const account = (await readArray<Account>('accounts')).find(a => a.id === accountId);
  if (!account || account.archived === true) return rejected('invalid_account');
  const currencies = await loadData<unknown>('finance_currencies', []);
  const { decimals } = currencyInfo(account.currency || 'UAH', currencies);
  const record = expenseRecord({
    actionId: ctx.id, at: ctx.atIso, amount, category, note: typeof note === 'string' ? note : '',
    account, decimals,
  });
  let created = false;
  await updateSynced<{ id: string }>('transactions', fresh => {
    if (fresh.some(t => t.id === ctx.id)) return fresh;
    created = true;
    return [record, ...fresh];
  }, CHECKED);
  return created ? applied('transactions', ctx.id) : duplicate('transactions', ctx.id);
}

async function habitCheck(ctx: ActionContext): Promise<Outcome> {
  const habitId = payloadText(ctx.payload.habitId, 64);
  const done = ctx.payload.done;
  if (!habitId || typeof done !== 'boolean') return rejected('invalid_payload');
  const habits = await readArray<Habit>('health_habits');
  if (!habits.some(h => h.id === habitId)) return rejected('not_found');
  let changed = false;
  await updateSynced<Habit>('health_habits', fresh => {
    const index = fresh.findIndex(h => h.id === habitId);
    if (index < 0) return fresh;
    const next = habitAfterCheck(fresh[index], { done, day: ctx.day, tz: ctx.tz, at: ctx.atIso });
    if (!next) return fresh;
    changed = true;
    const out = [...fresh];
    out[index] = next;
    return out;
  }, CHECKED);
  return changed ? applied('health_habits', habitId) : duplicate('health_habits', habitId);
}

async function noteCreate(ctx: ActionContext): Promise<Outcome> {
  const text = payloadText(ctx.payload.text, 2000);
  if (!text) return rejected('invalid_payload');
  let created = false;
  await updateSynced<{ id: string }>('notes', fresh => {
    if (fresh.some(n => n.id === ctx.id)) return fresh;
    created = true;
    return [inboxNoteRecord({ actionId: ctx.id, at: ctx.atIso, text }), ...fresh];
  }, CHECKED);
  return created ? applied('notes', ctx.id) : duplicate('notes', ctx.id);
}

const HANDLERS: Record<DeviceAction['type'], (ctx: ActionContext) => Promise<Outcome>> = {
  task_complete: taskComplete,
  task_create: taskCreate,
  timer_start: timerStart,
  timer_stop: timerStop,
  expense_create: expenseCreate,
  habit_check: habitCheck,
  note_create: noteCreate,
};

// ─── Конвеєр ─────────────────────────────────────────────────────────────────

async function batchContext(now: Date): Promise<BatchContext> {
  const [syncState, summaries, user, statuses] = await Promise.all([
    loadData<unknown>('project_sync_state_v1', {}),
    loadData<unknown>('workspace_projects', []),
    loadData<{ id?: unknown } | null>('auth_user', null),
    readArray<TaskStatusColumn>('task_statuses'),
  ]);
  const rawId = user && typeof user === 'object' ? user.id : undefined;
  return {
    now,
    roles: widgetRoleMap(syncState, summaries),
    myUserId: rawId === undefined || rawId === null ? null : String(rawId),
    statuses,
    changes: {},
  };
}

async function applyOne(raw: unknown, batch: BatchContext, log: Map<string, AppliedLogEntry>): Promise<ActionResult> {
  const id = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
  const logged = typeof id === 'string' ? log.get(id) : undefined;
  if (logged) return loggedResult(logged);

  const remember = (result: ActionResult): ActionResult => {
    // `retry` не зберігається: наступна спроба має оцінити дію заново (§2.2).
    if (result.status !== 'retry' && result.id) {
      log.set(result.id, {
        id: result.id, status: result.status, at: batch.now.getTime(),
        ...(result.reason ? { reason: result.reason } : {}),
        ...(result.record ? { record: result.record } : {}),
      });
    }
    return result;
  };

  const checked = checkEnvelope(raw, batch.now);
  if (!checked.ok) return remember(checked.result);
  const { action, at, tz, day } = checked as CheckedAction;
  const ctx: ActionContext = {
    ...batch, id: action.id, at, atIso: at.toISOString(), tz, day, payload: action.payload,
  };
  let outcome: Outcome;
  try {
    outcome = await HANDLERS[action.type](ctx);
  } catch (e) {
    // Запис у сховище не вдався — «ack» за незаписане давати не можна.
    // `retry` лишає дію в черзі джерела; детерміновані id не дадуть дубля.
    if (__DEV__) console.warn(`[device-actions] ${action.type} ${action.id} не застосовано:`, e);
    return actionResult(action.id, 'retry');
  }
  if (outcome.status === 'rejected' && outcome.reason === 'not_found') {
    const status = notFoundStatus(at, batch.now);
    return remember(actionResult(action.id, status, 'not_found'));
  }
  return remember(actionResult(action.id, outcome.status, outcome.reason, outcome.record));
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Застосувати дії по черзі. Результати — у порядку запиту; проміс
 * завершується лише тоді, коли всі записи вже лягли в сховище (§6.1 «ack»).
 */
export function applyDeviceActions(actions: DeviceAction[]): Promise<ActionResult[]> {
  const run = chain.then(() => applyAll(Array.isArray(actions) ? actions : []));
  chain = run.catch(() => undefined);
  return run;
}

async function applyAll(actions: unknown[]): Promise<ActionResult[]> {
  if (!actions.length) return [];
  const now = new Date();
  const batch = await batchContext(now);
  const entries = await readLog();
  const log = new Map(entries.map(e => [e.id, e]));
  const before = log.size;
  const results: ActionResult[] = [];
  for (const raw of actions) {
    results.push(await applyOne(raw, batch, log));
  }
  if (log.size !== before || entries.some(e => now.getTime() - e.at >= LOG_MAX_AGE_MS)) {
    try {
      await saveData(APPLIED_LOG_KEY, pruneLog([...log.values()], now.getTime()));
    } catch (e) {
      if (__DEV__) console.warn('[device-actions] журнал не записано:', e);
    }
  }
  if (Object.keys(batch.changes).length) notifyExternalTimerChange(batch.changes);
  return results;
}

// ─── Черга iOS (App Group, §7.3) ─────────────────────────────────────────────

/** Розбір JSON черги: не масив чи битий JSON — порожньо. */
export function parsePendingQueue(json: string | null | undefined): unknown[] {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Дія належить `ownerId` (NATIVE CONTRACT): нативний писач штампує `userId`
 * власника черги. Без штампа (стара збірка) чи чужий — не застосовується.
 */
export function isActionOwnedBy(raw: unknown, ownerId: string | null | undefined): boolean {
  if (!ownerId || !raw || typeof raw !== 'object') return false;
  const userId = (raw as { userId?: unknown }).userId;
  return typeof userId === 'string' && userId.length > 0 && userId === ownerId;
}

let draining: Promise<void> | null = null;

/**
 * Прочитати чергу App Group, застосувати дії поточного користувача, прибрати
 * все, що не `retry`. Чужі й непідписані дії прибираються без застосування.
 */
export async function drainIosPendingActions(ownerId: string | null): Promise<void> {
  if (Platform.OS !== 'ios' || !ownerId) return;
  if (draining) return draining;
  draining = (async () => {
    try {
      const queue = parsePendingQueue(IosBridge.readPendingActions());
      if (!queue.length) return;
      const owned = queue.filter(item => isActionOwnedBy(item, ownerId));
      const foreign = queue
        .filter(item => !isActionOwnedBy(item, ownerId))
        .map(item => (item && typeof item === 'object' ? (item as { id?: unknown }).id : undefined))
        .filter((id): id is string => typeof id === 'string' && id.length > 0);
      if (foreign.length) IosBridge.removePendingActions(foreign);
      if (!owned.length) return;
      const results = await applyDeviceActions(owned as DeviceAction[]);
      const done = results.filter(r => r.status !== 'retry' && r.id).map(r => r.id);
      IosBridge.removePendingActions(done);
    } catch (e) {
      if (__DEV__) console.warn('[device-actions] черга iOS не оброблена:', e);
    }
  })().finally(() => { draining = null; });
  return draining;
}

/**
 * Вихід і зміна workspace (store/auth.tsx): власника черг немає, нативні
 * черги iOS і Android порожні, журнал ідемпотентності — геть. Інакше «Стоп»,
 * натиснутий до виходу, застосувався б до даних наступного акаунта, а журнал
 * відповідав би йому `duplicate` на чужі id.
 */
export async function resetDeviceActions(): Promise<void> {
  IosBridge.setDeviceActionOwner(null);
  IosBridge.clearPendingActions();
  FlowiAndroid.setDeviceActionOwner(null);
  FlowiAndroid.clearPendingActions();
  try {
    await removeData(APPLIED_LOG_KEY);
  } catch (e) {
    if (__DEV__) console.warn('[device-actions] журнал не стерто:', e);
  }
}

/**
 * Монтується один раз (components/shared/DeviceSurfaces.tsx): на старті, при
 * поверненні застосунку і за Darwin-сигналом від інтенту «Стоп» — лише для
 * входу. Також тримає власника черги App Group (NATIVE CONTRACT): увійшов —
 * id користувача, вийшов — null і порожня черга.
 * Android має власну склейку (store/android-surfaces.ts) з тим самим застосувальником.
 */
export function useDeviceActionDrain(): void {
  const { status, user } = useAuth();
  const rawId = user?.id;
  const ownerId = status === 'authed' && rawId !== undefined && rawId !== null && String(rawId)
    ? String(rawId) : null;

  useEffect(() => {
    if (Platform.OS !== 'ios' || status === 'loading') return;
    IosBridge.setDeviceActionOwner(ownerId);
    if (!ownerId) IosBridge.clearPendingActions();
  }, [status, ownerId]);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !ownerId) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      // Спершу міграції: застосувальник читає колекції в їхній поточній формі.
      void ensureStorageMigrations().catch(() => undefined).then(() => {
        if (!cancelled) return drainIosPendingActions(ownerId);
      });
    };
    run();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') run(); });
    const pending = IosBridge.addPendingActionsListener(run);
    return () => {
      cancelled = true;
      appState.remove();
      pending.remove();
    };
  }, [ownerId]);
}
