/**
 * store/timer-ops.ts — старт і зупинка таймерів без React.
 *
 * Жили всередині TimerProvider (store/timer-context.tsx). Тепер ті самі
 * ефекти потрібні й поза екранами: «Стоп» у Live Activity, в Android-нотифікації
 * і дія з годинника приходять як DeviceAction і застосовуються
 * store/device-actions.ts — без провайдера, інколи ще до першого рендера.
 * Якби там була власна копія зупинки, рано чи пізно вона розійшлася б із
 * внутрішньою (колонка «На перевірці», дзеркало в time_entries, історія), тож
 * обидва шляхи йдуть через ці функції (watch-lockscreen-v1.md §3.4, §11.1).
 *
 * Відмінності шляху «поза застосунком» задаються опціями, а не гілками коду:
 *   • `at` — час з дії, а не годинник телефона;
 *   • `id` / `entryId` / `historyId` — детерміновані id (`adhoc:<id>`,
 *     `wa-<id>`, `wa-<id>-s`), щоб повтор дії не подвоював записи;
 *   • `silentWorkflow` — немає колонки «У процесі» в проєкті: не показувати
 *     Alert і не зупиняти старт, а лишити колонку як є;
 *   • `keepColumn` — зупинка разом із «готово»: не повертати задачу на дошку.
 *
 * Стан провайдера (лічильники ревізій, Alert, ref таймерів) — це хуки:
 * провайдер передає свої, застосувальник дій — жодних, тож помилки сховища в
 * нього летять нагору й годинник не отримує «ack» за незаписане.
 */
import {
  adHocTimerId,
  findTimerForTask,
  sortTimers,
  taskTimerId,
  type ActiveTimer,
} from '@/utils/activeTimers';
import {
  buildMeetingTimer,
  closeMeetingSession,
  findTimerForMeeting,
  type Meeting,
} from '@/utils/meetings';
import { appendHistory } from '@/utils/taskHistory';
import {
  DEFAULT_TASK_STATUS_COLUMNS,
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  mergeTaskStatusColumns,
  resolvedStatusType,
  type TaskStatusColumn,
} from '@/utils/taskStatuses';
import type { HistoryEventType, Task, TaskHistoryEvent } from '@/utils/taskUtils';

import { loadData } from './storage';
import { updateSynced } from './synced-storage';

export const TIMERS_KEY = 'active_timers';
export const TASKS_KEY = 'tasks';
export const MEETINGS_KEY = 'meetings';
export const TIME_ENTRIES_KEY = 'time_entries';

/**
 * Запис дзеркала у 'time_entries' — підмножина `TimeRecord` (utils/timeEntries).
 *
 * `shift` тут більше немає: поділу на ранок/день/вечір/ніч у продукті не
 * лишилось, жоден підсумок за ним не рахується, і писати його в НОВІ записи
 * означало б плодити дані, які ніхто не читає. У `TimeRecord` поле збережене
 * лише для читання старих записів.
 *
 * Натомість дзеркало пише `taskId`, `startedAt` і `endedAt` — те, чим воно
 * відрізнялося від записів, перенесених `utils/timeMigration.ts`:
 *   • `taskId` — щоб фільтр за задачею (`recordTaskKey`) і відсів дублів
 *     (`sessionKeys`) працювали за id, а не за збігом НАЗВИ задачі;
 *   • `startedAt`/`endedAt` — щоб блок аномалій бачив справжні межі сесії.
 */
export interface MirroredTimeEntry {
  id: string;
  task: string;
  /** Задача, з якої пішла сесія. Немає — вільний таймер або нарада. */
  taskId?: string;
  duration: number;
  /** ISO кінця сесії — те саме, що `endedAt`; лишається, бо за ним сортують. */
  date: string;
  startedAt: string;
  endedAt: string;
  /** Проєкт сесії (WORKSPACE_PROJECTS_PLAN §3 «години за тиждень» на Огляді). */
  projectId?: string;
}

/** Мінімум, потрібний для старту: решту полів завдання він не читає. */
export interface TimerTaskInput {
  id: string;
  title: string;
  kanbanColumnId?: string;
  status: 'active' | 'done';
  projectId?: string;
}

/** Мінімум, потрібний для старту таймера наради (колонки в наради немає). */
export interface TimerMeetingInput {
  id: string;
  title: string;
  projectId?: string;
}

export interface TimerOpOptions {
  /** id таймера (вільний таймер з дії: `adhoc:<action.id>`). */
  id?: string;
  /** Момент старту/зупинки — час дії, а не годинник телефона. */
  at?: Date;
  /** id завершеної сесії в timeEntries і дзеркала в time_entries (`wa-<id>`). */
  entryId?: string;
  /** id події історії задачі (`wa-<id>` для старту, `wa-<id>-s` для зупинки). */
  historyId?: string;
  /** Немає колонки робочого процесу в проєкті: без Alert, колонку не чіпати. */
  silentWorkflow?: boolean;
  /** Зупинка разом із «готово» (task_complete): задачу нікуди не переносити. */
  keepColumn?: boolean;
  /**
   * Шлях дій пристроїв: збій запису будь-якого кроку летить нагору (а не
   * ковтається в saveData), а зупинка йде в порядку, який можна безпечно
   * повторити (`retry`), — див. stopTimerOp.
   */
  checked?: boolean;
}

export interface TimerOpHooks {
  /** Свіжий реєстр — викликається ВСЕРЕДИНІ запису під блокуванням ключа. */
  onTimers?: (timers: ActiveTimer[]) => void;
  /** Початок/кінець запису реєстру (провайдер рахує записи в польоті). */
  onTimersWriteStart?: () => void;
  onTimersWriteEnd?: () => void;
  onTasksChanged?: () => void;
  onMeetingsChanged?: () => void;
  onTimeEntriesChanged?: () => void;
  /** У проєкті немає потрібної колонки — провайдер показує Alert. */
  onWorkflowMissing?: () => void;
  /**
   * Є — помилку запису кроку логують і ковтають (поведінка провайдера: таймер
   * лишається на екрані, решта кроків іде далі). Немає — помилка летить нагору.
   */
  onWriteError?: (scope: 'active_timers' | 'tasks' | 'meetings' | 'time_entries', e: unknown, id?: string) => void;
}

function fail(hooks: TimerOpHooks, scope: Parameters<NonNullable<TimerOpHooks['onWriteError']>>[0], e: unknown, id?: string): void {
  if (!hooks.onWriteError) throw e;
  hooks.onWriteError(scope, e, id);
}

function historyEvent(type: HistoryEventType, id: string, at: Date): TaskHistoryEvent {
  return { id, at: at.toISOString(), type };
}

function withHistory(task: Task, type: HistoryEventType, options: TimerOpOptions): TaskHistoryEvent[] {
  if (!options.historyId) return appendHistory(task, type);
  return [...(task.history ?? []), historyEvent(type, options.historyId, options.at ?? new Date())];
}

/**
 * Read-modify-write реєстру: мутація рахується від СХОВИЩА, не від стану
 * екрана — синк, міграція чи бекап пишуть у ключ повз провайдер, і повний
 * масив із застарілого стану видалив би чужий таймер на сервері.
 */
export async function writeTimers(
  mutate: (current: ActiveTimer[]) => ActiveTimer[],
  hooks: TimerOpHooks = {},
  checked = false,
): Promise<void> {
  hooks.onTimersWriteStart?.();
  try {
    // Читання й запис — одна операція під блокуванням ключа, інакше pull,
    // що ліг між ними, пішов би на сервер як DELETE.
    await updateSynced<ActiveTimer>(TIMERS_KEY, raw => {
      const current = sortTimers(raw.filter(t => t?.id && t.startedAt));
      const mutated = mutate(current);
      const next = sortTimers(mutated);
      hooks.onTimers?.(next);
      // mutate повернув той самий масив — робити нічого, але свіжий стан зі
      // сховища ми вже підхопили.
      return mutated === current ? raw : next;
    }, { checked });
  } catch (e) {
    fail(hooks, 'active_timers', e);
  } finally {
    hooks.onTimersWriteEnd?.();
  }
}

/** Read-modify-write 'tasks' під блокуванням ключа. true — завдання знайдено. */
export async function patchTaskRecord(
  taskId: string,
  patch: (task: Task) => Task,
  hooks: TimerOpHooks = {},
  checked = false,
): Promise<boolean> {
  let found = false;
  try {
    await updateSynced<Task>(TASKS_KEY, tasks => {
      const index = tasks.findIndex(t => t.id === taskId);
      if (index < 0) return tasks;
      found = true;
      const patched = patch(tasks[index]);
      // Патч нічого не змінив (повтор ідемпотентної дії) — запису немає.
      if (patched === tasks[index]) return tasks;
      const next = [...tasks];
      next[index] = patched;
      return next;
    }, { checked });
    if (found) hooks.onTasksChanged?.();
  } catch (e) {
    fail(hooks, 'tasks', e, taskId);
  }
  return found;
}

/** Read-modify-write 'meetings' — дзеркало patchTaskRecord. */
export async function patchMeetingRecord(
  meetingId: string,
  patch: (meeting: Meeting) => Meeting,
  hooks: TimerOpHooks = {},
  checked = false,
): Promise<boolean> {
  let found = false;
  try {
    await updateSynced<Meeting>(MEETINGS_KEY, meetings => {
      const index = meetings.findIndex(m => m.id === meetingId);
      // Нараду могли видалити, поки таймер ішов. Сесії немає куди класти —
      // але в 'time_entries' вона все одно потрапить, тож час не зникне.
      if (index < 0) return meetings;
      found = true;
      const patched = patch(meetings[index]);
      if (patched === meetings[index]) return meetings;
      const next = [...meetings];
      next[index] = patched;
      return next;
    }, { checked });
    if (found) hooks.onMeetingsChanged?.();
  } catch (e) {
    fail(hooks, 'meetings', e, meetingId);
  }
  return found;
}

/** Проєкт сесії: таймер → задача → нарада (таймер старої версії його не мав). */
export async function sessionProjectId(timer: ActiveTimer): Promise<string | undefined> {
  if (timer.projectId) return timer.projectId;
  if (timer.taskId) {
    const tasks = await loadData<Task[]>(TASKS_KEY, []);
    return tasks.find(task => task.id === timer.taskId)?.projectId;
  }
  if (timer.meetingId) {
    const meetings = await loadData<Meeting[]>(MEETINGS_KEY, []);
    return meetings.find(meeting => meeting.id === timer.meetingId)?.projectId;
  }
  return undefined;
}

/** Дзеркало завершеної сесії для екранів часу — вони читають лише 'time_entries'. */
export async function mirrorTimeEntry(
  timer: ActiveTimer,
  duration: number,
  endedAt: Date,
  hooks: TimerOpHooks = {},
  entryId?: string,
  checked = false,
): Promise<MirroredTimeEntry | null> {
  if (duration <= 0) return null;
  try {
    const endedAtIso = endedAt.toISOString();
    // Таймер без проєкту (запущений у вебі чи старою версією) — беремо
    // проєкт задачі або наради, інакше сесія впала б в «Особисте».
    const projectId = await sessionProjectId(timer);
    const entry: MirroredTimeEntry = {
      id: entryId ?? `timer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      task: timer.label,
      taskId: timer.taskId,
      duration,
      date: endedAtIso,
      startedAt: timer.startedAt,
      endedAt: endedAtIso,
      ...(projectId ? { projectId } : {}),
    };
    await updateSynced<MirroredTimeEntry>(TIME_ENTRIES_KEY, existing =>
      // Детермінований id уже лежить — повтор тієї самої дії, другий запис дав би дубль.
      entryId && existing.some(e => e?.id === entryId) ? existing : [entry, ...existing], { checked });
    hooks.onTimeEntriesChanged?.();
    return entry;
  } catch (e) {
    fail(hooks, 'time_entries', e);
    return null;
  }
}

/**
 * Колонка для автоматики таймера («У процесі» / «На перевірці»).
 *
 * Проєктні колонки мають власні id. «Перевірка» має той самий type, що й
 * «До роботи», тому підбір лише за type повертав би не ту колонку.
 * `missing: true` — у проєкті такої колонки немає (робочий процес змінює
 * лише власник, тож вигадувати колонку клієнт не має права).
 */
export async function resolveTimerColumn(
  taskId: string,
  target: string,
): Promise<{ columnId: string | undefined; missing: boolean }> {
  const tasks = await loadData<Task[]>(TASKS_KEY, []);
  const task = tasks.find(t => t.id === taskId);
  if (task?.status === 'done') return { columnId: task.kanbanColumnId, missing: false };
  const projectId = task?.projectId;
  if (!projectId) return { columnId: target, missing: false };
  const columns = await loadData<TaskStatusColumn[]>('task_statuses', []);
  const scoped = mergeTaskStatusColumns(columns, projectId);
  if (!scoped.length) return { columnId: target, missing: false };
  const source = DEFAULT_TASK_STATUS_COLUMNS.find(column => column.id === target)!;
  const match = scoped.find(column => !column.isDone && column.sourceStatusId === target)
    ?? scoped.find(column => !column.isDone && column.name === source.name)
    ?? (target === IN_PROGRESS_COLUMN_ID
      ? scoped.find(column => !column.isDone && resolvedStatusType(column) === 'in_progress') : undefined);
  if (match) return { columnId: match.id, missing: false };
  return { columnId: undefined, missing: true };
}

export type StartTaskTimerOutcome = 'started' | 'exists' | 'task_done' | 'workflow_missing';

export async function startTaskTimerOp(
  task: TimerTaskInput,
  options: TimerOpOptions = {},
  hooks: TimerOpHooks = {},
): Promise<StartTaskTimerOutcome> {
  // Завершене завдання не трекають: сесія на ньому нікуди не веде, а
  // колонку done автоматика чіпати не сміє.
  if (task.status === 'done') return 'task_done';

  const resolved = await resolveTimerColumn(task.id, IN_PROGRESS_COLUMN_ID);
  if (resolved.missing && !options.silentWorkflow) {
    // Workflow changes are owner-only on the server. Never create a local
    // column that a member cannot synchronize, or silently select Todo.
    hooks.onWorkflowMissing?.();
    return 'workflow_missing';
  }
  const now = options.at ?? new Date();

  const timer: ActiveTimer = {
    id: taskTimerId(task.id),
    taskId: task.id,
    label: task.title,
    startedAt: now.toISOString(),
    projectId: task.projectId,
  };

  let created = false;
  await writeTimers(current => {
    // Перевірка на СВІЖОМУ списку: таймер на це завдання міг зʼявитися з
    // іншого пристрою. Другий запис створив би дубль, який неможливо
    // зупинити разом.
    if (findTimerForTask(current, task.id)) return current;
    created = true;
    return [...current, timer];
  }, hooks, options.checked);
  // Таймер уже йшов — історію та колонку чіпати не за що.
  if (!created) return 'exists';

  await patchTaskRecord(task.id, t => ({
    ...t,
    // Старт ЗАВЖДИ переводить у «У процесі», з якої б колонки завдання не
    // прийшло. Робота почалась — і на дошці це має бути видно однаково.
    // Без колонки в проєкті (лише тихий шлях) — колонку не чіпаємо.
    kanbanColumnId: resolved.columnId ?? t.kanbanColumnId,
    history: withHistory(t, 'timer_start', { ...options, at: now }),
  }), hooks, options.checked);
  return 'started';
}

export async function startAdHocTimerOp(
  label: string,
  options: TimerOpOptions = {},
  hooks: TimerOpHooks = {},
): Promise<'started' | 'exists'> {
  // Частини доби (shift) більше не пишемо: поділ на ранок/день/вечір/ніч
  // прибрано з продукту, мітка таймера тепер — проєкт (timerProject).
  const timer: ActiveTimer = {
    id: options.id ?? adHocTimerId(),
    label,
    startedAt: (options.at ?? new Date()).toISOString(),
  };
  let created = false;
  await writeTimers(current => {
    // Детермінований id (дія з годинника) уже в реєстрі — це повтор.
    if (options.id && current.some(t => t.id === options.id)) return current;
    created = true;
    return [...current, timer];
  }, hooks, options.checked);
  return created ? 'started' : 'exists';
}

/**
 * Старт таймера наради — без перевірки «завершене», без колонки й історії:
 * нарада не живе на дошці.
 */
export async function startMeetingTimerOp(
  meeting: TimerMeetingInput,
  options: TimerOpOptions = {},
  hooks: TimerOpHooks = {},
): Promise<void> {
  const timer = buildMeetingTimer(meeting, options.at);
  await writeTimers(current =>
    findTimerForMeeting(current, meeting.id) ? current : [...current, timer],
  hooks);
}

export interface StoppedSession {
  timer: ActiveTimer;
  duration: number;
  endedAt: Date;
  /** Записане дзеркало в 'time_entries' (null — сесія нульова). */
  mirror: MirroredTimeEntry | null;
}

function elapsedSeconds(startedAt: string, now: number): number {
  // Годинник пристрою може зʼїхати назад (зміна поясу, ручне переведення) —
  // відʼємна тривалість сесії зіпсувала б усю статистику часу.
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** Сесія з цим id уже лежить у записі — повтор тієї самої зупинки. */
function hasEntry(entries: readonly { id?: unknown }[] | undefined, id: string): boolean {
  return !!entries?.some(e => e?.id === id);
}

/** Сесія таймера → timeEntries задачі (+ історія й колонка). Ідемпотентно за entryId/historyId. */
function taskStopPatch(
  timer: ActiveTimer,
  entryId: string,
  endedAt: Date,
  duration: number,
  columnId: string | undefined,
  options: TimerOpOptions,
): (t: Task) => Task {
  return t => {
    const entryKnown = hasEntry(t.timeEntries, entryId);
    const historyKnown = !!options.historyId && !!t.history?.some(e => e?.id === options.historyId);
    // Повтор (retry дії пристрою): запис уже є — нічого не міняти.
    if (entryKnown && (historyKnown || !options.historyId)) return t;
    return {
      ...t,
      // Зупинка ЗАВЖДИ переводить у «На перевірці»: робота скінчилась, але
      // результат ще не приймали. Єдиний виняток — завершене завдання:
      // «Готово» САМО зупиняє таймер, і цей запис прилітає вже ПІСЛЯ того,
      // як завдання стало «Готово»; безумовний перенос скасував би роботу.
      kanbanColumnId: t.status === 'done' || options.keepColumn
        ? t.kanbanColumnId
        : (columnId ?? t.kanbanColumnId),
      timeEntries: entryKnown ? t.timeEntries : [
        ...(t.timeEntries ?? []),
        {
          id: entryId,
          startedAt: timer.startedAt,
          endedAt: endedAt.toISOString(),
          duration,
        },
      ],
      history: historyKnown ? t.history : withHistory(t, 'timer_stop', { ...options, at: endedAt }),
    };
  };
}

/**
 * Зупинка: реєстр → завдання/нарада → дзеркало в time_entries.
 * null — таймера в сховищі вже немає (його зупинили деінде).
 *
 * `options.checked` (дії пристроїв): спершу сесія лягає в завдання/нараду й
 * дзеркало (усе ідемпотентно за `entryId`), і лише ПОТІМ таймер зникає з
 * реєстру. Збій будь-якого кроку летить нагору → `retry`, а таймер лишається
 * в реєстрі, тож повтор тієї самої дії дописує те, чого бракує. У зворотному
 * порядку збій запису 'tasks' після видалення таймера губив сесію назавжди:
 * повтор уже не бачив таймера і відповідав `not_found`.
 */
export async function stopTimerOp(
  id: string,
  options: TimerOpOptions = {},
  hooks: TimerOpHooks = {},
): Promise<StoppedSession | null> {
  if (options.checked) return stopTimerChecked(id, options, hooks);
  const endedAt = options.at ?? new Date();

  // 1. Прибрати з реєстру — після цього таймер більше ніде не «йде».
  //    Джерело правди про сесію — сховище, а не стан екрана: він міг
  //    відстати, і тоді ми або не знайшли б живий таймер, або записали б
  //    сесію, яку вже записав інший пристрій.
  let removed: ActiveTimer | undefined;
  await writeTimers(current => {
    removed = current.find(t => t.id === id);
    if (!removed) return current;
    return current.filter(t => t.id !== id);
  }, hooks);
  // Таймера в сховищі немає — його вже зупинили деінде, і сесія там
  // записана. Другий запис дав би дубль у завданні та в 'time_entries'.
  const timer = removed as ActiveTimer | undefined;
  if (!timer) return null;

  const duration = elapsedSeconds(timer.startedAt, endedAt.getTime());
  const entryId = options.entryId ?? `${timer.id}-${endedAt.getTime().toString(36)}`;

  // 2. Завершена сесія переїжджає в timeEntries завдання. endedAt тут є
  //    ЗАВЖДИ: відкритих записів у timeEntries більше не буває.
  if (timer.taskId) {
    let columnId: string | undefined;
    if (!options.keepColumn) {
      const resolved = await resolveTimerColumn(timer.taskId, REVIEW_COLUMN_ID);
      if (resolved.missing && !options.silentWorkflow) hooks.onWorkflowMissing?.();
      columnId = resolved.columnId;
    }
    await patchTaskRecord(timer.taskId, taskStopPatch(timer, entryId, endedAt, duration, columnId, options), hooks);
  }

  // 2б. Сесія наради лягає в timeEntries САМОЇ наради — та сама структура,
  //     що в завдання, але без колонки дошки й історії.
  if (timer.meetingId) {
    await patchMeetingRecord(timer.meetingId, m => meetingStopPatch(m, timer, endedAt, duration, options), hooks);
  }

  // 3. Дзеркало для екранів часу.
  const mirror = await mirrorTimeEntry(timer, duration, endedAt, hooks, options.entryId);
  return { timer, duration, endedAt, mirror };
}

function meetingStopPatch(m: Meeting, timer: ActiveTimer, endedAt: Date, duration: number, options: TimerOpOptions): Meeting {
  if (!options.entryId) return closeMeetingSession(m, timer, endedAt, duration);
  if (hasEntry(m.timeEntries, options.entryId)) return m;
  return {
    ...m,
    timeEntries: [
      ...(m.timeEntries ?? []),
      { id: options.entryId, startedAt: timer.startedAt, endedAt: endedAt.toISOString(), duration },
    ],
  };
}

/** Повторювана зупинка для дій пристроїв — див. `options.checked` у stopTimerOp. */
async function stopTimerChecked(
  id: string,
  options: TimerOpOptions,
  hooks: TimerOpHooks,
): Promise<StoppedSession | null> {
  const endedAt = options.at ?? new Date();
  const stored = await loadData<unknown>(TIMERS_KEY, []);
  const timer = (Array.isArray(stored) ? stored as ActiveTimer[] : [])
    .find(t => t && t.id === id && typeof t.startedAt === 'string');
  if (!timer) return null;

  const duration = elapsedSeconds(timer.startedAt, endedAt.getTime());
  const entryId = options.entryId ?? `${timer.id}-${endedAt.getTime().toString(36)}`;

  if (timer.taskId) {
    let columnId: string | undefined;
    if (!options.keepColumn) {
      const resolved = await resolveTimerColumn(timer.taskId, REVIEW_COLUMN_ID);
      if (resolved.missing && !options.silentWorkflow) hooks.onWorkflowMissing?.();
      columnId = resolved.columnId;
    }
    await patchTaskRecord(timer.taskId, taskStopPatch(timer, entryId, endedAt, duration, columnId, options), {}, true);
  }
  if (timer.meetingId) {
    await patchMeetingRecord(timer.meetingId, m => meetingStopPatch(m, timer, endedAt, duration, options), {}, true);
  }
  const mirror = await mirrorTimeEntry(timer, duration, endedAt, {}, entryId, true);

  // Останнім кроком — прибрати таймер із реєстру.
  await writeTimers(current => current.some(t => t.id === id) ? current.filter(t => t.id !== id) : current, { ...hooks, onWriteError: undefined }, true);
  return { timer, duration, endedAt, mirror };
}

// ─── Сигнал «таймери змінено поза провайдером» ───────────────────────────────

export interface ExternalTimerChange {
  timers?: boolean;
  tasks?: boolean;
  meetings?: boolean;
  timeEntries?: boolean;
}

type ExternalListener = (change: ExternalTimerChange) => void;
const externalListeners = new Set<ExternalListener>();

/**
 * Дії пристроїв пишуть у ті самі ключі повз провайдер. Він перечитує реєстр
 * і піднімає ревізії, щоб екрани, які тримають завдання у власному стані,
 * побачили зміну (так само, як після власного старту/стопу).
 */
export function subscribeExternalTimerChanges(listener: ExternalListener): () => void {
  externalListeners.add(listener);
  return () => { externalListeners.delete(listener); };
}

export function notifyExternalTimerChange(change: ExternalTimerChange): void {
  for (const listener of [...externalListeners]) {
    try {
      listener(change);
    } catch (e) {
      if (__DEV__) console.warn('[timers] external change listener failed:', e);
    }
  }
}
