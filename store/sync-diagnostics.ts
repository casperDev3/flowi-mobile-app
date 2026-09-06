/**
 * store/sync-diagnostics.ts — журнал ТРИГЕРА синхронізації.
 *
 * Симптом, заради якого це існує: запис, зроблений на телефоні, лежить в
 * outbox доти, доки користувач не натисне «Синхронізувати». Кнопка кличе той
 * самий doSync(), тож мережа, токен і сервер тут ні до чого — ламається ланцюг
 * «saveSynced → notifySyncScheduler → scheduleSync → дебаунс → doSync».
 *
 * Чому окремий модуль: цей ланцюг проходить через synced-storage і sync-engine,
 * які навмисно не імпортують один одного (рушій ставить планувальник у сховище
 * зсередини ефекту, саме щоб не було циклу). Спільного місця, де видно весь
 * ланцюг, не існувало — воно тут. Власних залежностей модуль не має теж
 * навмисно: його імпортують обидві сторони, і будь-який зворотний імпорт
 * повернув би цикл.
 *
 * ЗАЛІЗНЕ ПРАВИЛО: модуль лише ЗАПИСУЄ. Він не планує, не скасовує і нічого не
 * викликає — діагностика, яка зсуває момент синку, діагностує саму себе.
 * Уся робота тут синхронна й у пам'яті: жодного AsyncStorage, жодних промісів,
 * щоб виклик із гарячого шляху не додавав мікротасок і не змінював порядок.
 */

/** Що саме зараз стоїть у реєстрі планувальника. */
export type SchedulerTag = 'none' | 'live' | 'noop';

/** Хто просив синк. Слот `_debounceTimer` один на всіх, і це видно тільки так. */
export type ScheduleCaller = 'outbox' | 'ws' | 'fullSync' | 'rollback' | 'retryGate' | 'drain';

/** Чому озброєний дебаунс зник, не вистріливши. */
export type DebounceCancel = 'rearm' | 'flush' | 'syncNow';

/** Назва гейта, на якому doSync мовчки вийшов. */
export type GateReason = 'offline' | 'notAuthed' | 'busy';

/**
 * Хто покликав doSync.
 *
 * Гейт «вже йде» нічого не каже, поки невідомо, ХТО тримає обмін: п'ятихвилинний
 * поллінг, повернення з фону, ретрай чи власний дебаунс запису. Різні відповіді
 * — різні лікування, а сам гейт їх не розрізняє.
 */
export type SyncTrigger =
  | 'debounce' | 'retry' | 'coldStart' | 'foreground' | 'poll' | 'flush' | 'button';

export type SyncOutcome = 'ok' | 'offline' | 'error';

export type WsPhase = 'idle' | 'connecting' | 'open' | 'closed' | 'failed';

export interface SyncDiagEvent {
  at: number;
  /** Уже готовий до показу рядок: панель не форматує, лише друкує. */
  text: string;
}

export interface SchedulerDiag {
  tag: SchedulerTag;
  installs: number;
  uninstalls: number;
  lastChangeAt: number | null;
  /** Екземпляр synced-storage, у який рушій поставив планувальник. */
  storageId: string | null;
}

export interface NotifyDiag {
  count: number;
  lastAt: number | null;
  /** Сповіщення до першої реєстрації планувальника (гонка монтування). */
  droppedNull: number;
  /** Сповіщення після cleanup — реєстр тримає порожню функцію. */
  droppedNoop: number;
  lastDropAt: number | null;
  /** Скільки минуло від старту процесу до останньої втрати. */
  lastDropSinceStartMs: number | null;
}

export interface DebounceDiag {
  armed: number;
  fired: number;
  cancelled: Record<DebounceCancel, number>;
  byCaller: Record<ScheduleCaller, number>;
  lastArmedAt: number | null;
  lastArmedDelayMs: number | null;
  lastCaller: ScheduleCaller | null;
  /** Коли поточний таймер має вистрілити; чи він живий — питання до рушія. */
  dueAt: number | null;
  lastFiredAt: number | null;
  lastCancelAt: number | null;
  lastCancelBy: DebounceCancel | null;
}

export interface AttemptDiag {
  total: number;
  entered: number;
  blocked: Record<GateReason, number>;
  lastBlockedAt: Record<GateReason, number | null>;
  lastAttemptAt: number | null;
  lastEnteredAt: number | null;
  lastOutcome: SyncOutcome | null;
  lastOutcomeAt: number | null;
  lastDurationMs: number | null;
  /** Хто покликав останній обмін і хто — останній відбитий виклик. */
  lastEnteredTrigger: SyncTrigger | null;
  lastBlockedTrigger: SyncTrigger | null;
  /** Хто тримає обмін просто зараз; null — обміну немає. */
  runningTrigger: SyncTrigger | null;
}

export interface RetryDiag {
  armedCount: number;
  lastArmedAt: number | null;
  lastDelayMs: number | null;
  dueAt: number | null;
  /** Номер спроби на момент зведення — живе значення бере рушій. */
  lastAttempt: number;
}

export interface AppStateDiag {
  last: string | null;
  lastAt: number | null;
  /** Переходів 'active' → не-'active', тобто викликів flushPendingSync. */
  toBackground: number;
  toForeground: number;
}

export interface SyncDiagnostics {
  startedAt: number;
  /** >1 означає, що модуль synced-storage переоцінили (Fast Refresh тощо). */
  storageEvalCount: number;
  scheduler: SchedulerDiag;
  notify: NotifyDiag;
  debounce: DebounceDiag;
  attempts: AttemptDiag;
  retry: RetryDiag;
  appState: AppStateDiag;
  ws: { phase: WsPhase; lastAt: number | null };
  events: SyncDiagEvent[];
}

const EVENT_LIMIT = 40;

const state: SyncDiagnostics = {
  startedAt: Date.now(),
  storageEvalCount: 0,
  scheduler: { tag: 'none', installs: 0, uninstalls: 0, lastChangeAt: null, storageId: null },
  notify: {
    count: 0, lastAt: null, droppedNull: 0, droppedNoop: 0,
    lastDropAt: null, lastDropSinceStartMs: null,
  },
  debounce: {
    armed: 0, fired: 0,
    cancelled: { rearm: 0, flush: 0, syncNow: 0 },
    byCaller: { outbox: 0, ws: 0, fullSync: 0, rollback: 0, retryGate: 0, drain: 0 },
    lastArmedAt: null, lastArmedDelayMs: null, lastCaller: null,
    dueAt: null, lastFiredAt: null, lastCancelAt: null, lastCancelBy: null,
  },
  attempts: {
    total: 0, entered: 0,
    blocked: { offline: 0, notAuthed: 0, busy: 0 },
    lastBlockedAt: { offline: null, notAuthed: null, busy: null },
    lastAttemptAt: null, lastEnteredAt: null,
    lastOutcome: null, lastOutcomeAt: null, lastDurationMs: null,
    lastEnteredTrigger: null, lastBlockedTrigger: null, runningTrigger: null,
  },
  retry: { armedCount: 0, lastArmedAt: null, lastDelayMs: null, dueAt: null, lastAttempt: 0 },
  appState: { last: null, lastAt: null, toBackground: 0, toForeground: 0 },
  ws: { phase: 'idle', lastAt: null },
  events: [],
};

function log(text: string): void {
  state.events.push({ at: Date.now(), text });
  // Обрізаємо з початку: цікавий завжди хвіст — те, що сталося після запису.
  if (state.events.length > EVENT_LIMIT) state.events.splice(0, state.events.length - EVENT_LIMIT);
}

/** Викликається на верхньому рівні synced-storage — рахує оцінки модуля. */
export function recordStorageEval(instanceId: string): void {
  state.storageEvalCount += 1;
  log(`модуль synced-storage оцінено (#${state.storageEvalCount}, ${instanceId})`);
}

export function recordSchedulerInstalled(tag: 'live' | 'noop', storageId: string): void {
  if (tag === 'live') state.scheduler.installs += 1;
  else state.scheduler.uninstalls += 1;
  state.scheduler.tag = tag;
  state.scheduler.lastChangeAt = Date.now();
  state.scheduler.storageId = storageId;
  log(tag === 'live' ? 'планувальник підключено' : 'планувальник знято (noop)');
}

export function recordNotify(tag: SchedulerTag): void {
  state.notify.count += 1;
  state.notify.lastAt = Date.now();
  if (tag === 'live') return;
  if (tag === 'none') state.notify.droppedNull += 1;
  else state.notify.droppedNoop += 1;
  state.notify.lastDropAt = Date.now();
  state.notify.lastDropSinceStartMs = Date.now() - state.startedAt;
  log(`notify втрачено: реєстр = ${tag === 'none' ? 'порожній' : 'заглушка'}`);
}

export function recordDebounceArmed(
  delayMs: number,
  caller: ScheduleCaller,
  replacedArmed: boolean,
): void {
  if (replacedArmed) {
    state.debounce.cancelled.rearm += 1;
    state.debounce.lastCancelAt = Date.now();
    state.debounce.lastCancelBy = 'rearm';
  }
  state.debounce.armed += 1;
  state.debounce.byCaller[caller] += 1;
  state.debounce.lastArmedAt = Date.now();
  state.debounce.lastArmedDelayMs = delayMs;
  state.debounce.lastCaller = caller;
  state.debounce.dueAt = Date.now() + delayMs;
  log(`дебаунс ${delayMs} мс (${caller})${replacedArmed ? ' — перезведено' : ''}`);
}

export function recordDebounceFired(): void {
  state.debounce.fired += 1;
  state.debounce.lastFiredAt = Date.now();
  state.debounce.dueAt = null;
  log('дебаунс спрацював');
}

export function recordDebounceCancelled(by: 'flush' | 'syncNow'): void {
  state.debounce.cancelled[by] += 1;
  state.debounce.lastCancelAt = Date.now();
  state.debounce.lastCancelBy = by;
  state.debounce.dueAt = null;
  log(by === 'flush' ? 'дебаунс погашено згортанням' : 'дебаунс погашено кнопкою');
}

/** gate === null означає, що doSync зайшов у тіло. */
export function recordSyncAttempt(gate: GateReason | null, trigger: SyncTrigger): void {
  state.attempts.total += 1;
  state.attempts.lastAttemptAt = Date.now();
  if (gate) {
    state.attempts.blocked[gate] += 1;
    state.attempts.lastBlockedAt[gate] = Date.now();
    state.attempts.lastBlockedTrigger = trigger;
    const holder = gate === 'busy' && state.attempts.runningTrigger
      ? ` (тримає ${TRIGGER_LABELS[state.attempts.runningTrigger]})`
      : '';
    log(`doSync (${TRIGGER_LABELS[trigger]}) відбито гейтом: ${GATE_LABELS[gate]}${holder}`);
    return;
  }
  state.attempts.entered += 1;
  state.attempts.lastEnteredAt = Date.now();
  state.attempts.lastEnteredTrigger = trigger;
  state.attempts.runningTrigger = trigger;
  log(`doSync стартував (${TRIGGER_LABELS[trigger]})`);
}

export function recordSyncOutcome(outcome: SyncOutcome, durationMs: number): void {
  state.attempts.lastOutcome = outcome;
  state.attempts.lastOutcomeAt = Date.now();
  state.attempts.lastDurationMs = durationMs;
  state.attempts.runningTrigger = null;
  log(`doSync → ${OUTCOME_LABELS[outcome]} за ${(durationMs / 1000).toFixed(1)} с`);
}

export function recordRetryArmed(delayMs: number, attempt: number): void {
  state.retry.armedCount += 1;
  state.retry.lastArmedAt = Date.now();
  state.retry.lastDelayMs = delayMs;
  state.retry.dueAt = Date.now() + delayMs;
  state.retry.lastAttempt = attempt;
  log(`retry через ${Math.round(delayMs / 1000)} с (спроба ${attempt})`);
}

export function recordAppState(previous: string, next: string): void {
  state.appState.last = next;
  state.appState.lastAt = Date.now();
  if (previous === 'active' && next !== 'active') state.appState.toBackground += 1;
  if (previous !== 'active' && next === 'active') state.appState.toForeground += 1;
  log(`AppState ${previous} → ${next}`);
}

export function recordWs(phase: WsPhase): void {
  if (state.ws.phase === phase) return;
  state.ws.phase = phase;
  state.ws.lastAt = Date.now();
  log(`ws: ${WS_LABELS[phase]}`);
}

const GATE_LABELS: Record<GateReason, string> = {
  offline: 'офлайн',
  notAuthed: 'не авторизований',
  busy: 'вже йде',
};

const OUTCOME_LABELS: Record<SyncOutcome, string> = {
  ok: 'успіх',
  offline: 'офлайн',
  error: 'помилка',
};

const TRIGGER_LABELS: Record<SyncTrigger, string> = {
  debounce: 'дебаунс',
  retry: 'ретрай',
  coldStart: 'старт',
  foreground: 'з фону',
  poll: 'поллінг',
  flush: 'згортання',
  button: 'кнопка',
};

const WS_LABELS: Record<WsPhase, string> = {
  idle: 'не піднімався',
  connecting: 'підключення',
  open: 'відкритий',
  closed: 'закритий',
  failed: 'не піднявся',
};

export const gateLabel = (gate: GateReason): string => GATE_LABELS[gate];
export const outcomeLabel = (outcome: SyncOutcome): string => OUTCOME_LABELS[outcome];
export const wsLabel = (phase: WsPhase): string => WS_LABELS[phase];
export const triggerLabel = (trigger: SyncTrigger): string => TRIGGER_LABELS[trigger];

/**
 * Знімок для UI.
 *
 * Копія поверхнева, але достатня: панель перечитує знімок щосекунди й нічого в
 * ньому не тримає між кадрами. Вкладені лічильники копіюємо теж — інакше
 * React бачив би той самий об'єкт і не перемальовував рядки.
 */
export function getSyncDiagnostics(): SyncDiagnostics {
  return {
    ...state,
    scheduler: { ...state.scheduler },
    notify: { ...state.notify },
    debounce: {
      ...state.debounce,
      cancelled: { ...state.debounce.cancelled },
      byCaller: { ...state.debounce.byCaller },
    },
    attempts: {
      ...state.attempts,
      blocked: { ...state.attempts.blocked },
      lastBlockedAt: { ...state.attempts.lastBlockedAt },
    },
    retry: { ...state.retry },
    appState: { ...state.appState },
    ws: { ...state.ws },
    events: [...state.events],
  };
}

/**
 * Одне речення: де саме рветься ланцюг.
 *
 * Порядок перевірок — це порядок самого ланцюга, від сховища до обміну.
 * Перша ланка, що не зійшлася, і є відповіддю: далі рахувати немає сенсу, бо
 * все нижче просто не отримало сигналу. Функція чиста, щоб її можна було
 * перевіряти на вигаданому знімку, а не на живому телефоні.
 */
export function diagnoseTrigger(d: SyncDiagnostics): string {
  if (d.scheduler.tag === 'none') {
    return 'Планувальник ніколи не підключався — автоматика мертва від старту.';
  }
  if (d.scheduler.tag === 'noop') {
    return 'У реєстрі стоїть заглушка після cleanup SyncProvider — сповіщення нікуди не йдуть.';
  }
  if (d.notify.droppedNull + d.notify.droppedNoop > 0 && d.debounce.armed === 0) {
    return 'Усі сповіщення впали в порожній реєстр — рушій їх не бачив жодного разу.';
  }
  if (d.notify.count > 0 && d.debounce.armed === 0) {
    return 'notify був, дебаунс не зводився — обрив між сховищем і рушієм.';
  }
  if (d.debounce.armed > 0 && d.debounce.fired === 0) {
    if (d.debounce.cancelled.rearm > 0) {
      return 'Дебаунс перезводиться швидше, ніж встигає вистрілити — тік не настає ніколи.';
    }
    if (d.debounce.cancelled.flush > 0) {
      return 'Дебаунс гасить згортання застосунку (flushPendingSync), а власного тіку не було.';
    }
    return 'Дебаунс зведено, але ще не спрацював — почекай його затримку.';
  }
  if (d.attempts.total > d.attempts.entered) {
    const { blocked } = d.attempts;
    const worst = (['busy', 'notAuthed', 'offline'] as const)
      .filter(gate => blocked[gate] > 0)
      .sort((a, b) => blocked[b] - blocked[a])[0];
    const holder = worst === 'busy' && d.attempts.runningTrigger
      ? ` Обмін тримає: ${TRIGGER_LABELS[d.attempts.runningTrigger]}.`
      : '';
    if (worst && d.attempts.entered === 0) {
      return `doSync доходить, але щоразу відбивається гейтом «${GATE_LABELS[worst]}».${holder}`;
    }
    if (worst) {
      return `Частина тіків згоріла на гейті «${GATE_LABELS[worst]}» — переозброєння там немає.${holder}`;
    }
  }
  if (d.attempts.lastOutcome === 'error') {
    return 'Ланцюг цілий: doSync доходить до обміну і падає — дивись помилку вище.';
  }
  if (d.attempts.lastOutcome === 'offline') {
    return 'doSync доходить, але обмін вважає застосунок офлайном.';
  }
  if (d.attempts.entered > 0) {
    return 'Ланцюг цілий: сповіщення → дебаунс → обмін проходять повністю.';
  }
  return 'Даних ще немає — створи запис і подивись сюди через кілька секунд.';
}
