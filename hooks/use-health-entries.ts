import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useAutoBackup } from '@/store/auto-backup';
import { healthConnectSource } from '@/store/health-connect';
import { enableHealthKitBackground, healthKitSource } from '@/store/healthkit';
import { cancelDailyReminder, scheduleDailyReminder, scheduleWeeklyReminder } from '@/store/notifications';
import { loadData, loadDataResult, retryStorageRead, saveData } from '@/store/storage';
import { saveSynced, saveSyncedValue, updateSynced } from '@/store/synced-storage';
import { Events, track } from '@/utils/analytics';
import { isSameDay, localDateKey } from '@/utils/dateUtils';
import {
  EntryType,
  FALLBACK_WEIGHT,
  HealthEntry,
  HealthProfile,
  WorkoutCalorieRecord,
  PROFILE_KEY,
  bmiCategory,
  burnedForDay,
  calcBMI,
  calcCalorieDay,
  buildAutoDayEntries,
  buildWeightEntries,
  collapseStaleHkWeights,
  computeGoals,
  daysToSync,
  isDerivedAutoId,
  lastForDay,
  latestValue,
  mergeAutoEntries,
  sleepNightForDay,
  sleepQuality,
  sumForDay,
  type HealthAccess,
  type HealthSourceApi,
} from '@/utils/healthUtils';

export const ENTRIES_KEY = 'health_entries_v2';
export const REMINDERS_KEY = 'health_reminders';
/**
 * Колекція тренувань. Читається сюди лише заради поля `calories`: тренування
 * Flowi мусять зараховуватись у спалене за той самий день (див. burnedForDay),
 * інакше пробіжка, записана в застосунку, ніяк не впливає на залишок калорій.
 */
export const WORKOUTS_KEY = 'workouts';

export interface Reminders { water: boolean; sleep: boolean; weight: boolean; measurements: boolean; }
const DEFAULT_REMINDERS: Reminders = { water: false, sleep: false, weight: false, measurements: false };
// Години щоденних нагадувань; заміри — щотижня (неділя)
const DAILY_HOURS: Record<'water' | 'sleep' | 'weight', number> = { water: 14, sleep: 22, weight: 8 };
const MEASUREMENTS_WEEKDAY = 1; // 1 = неділя
const MEASUREMENTS_HOUR = 9;

export interface NewEntry {
  type: EntryType;
  value: number;
  note?: string;
  protein?: number;
  fat?: number;
  carbs?: number;
}

let _idSeq = 0;
function genId() {
  _idSeq = (_idSeq + 1) % 100000;
  return `${Date.now()}_${_idSeq}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Автоматичні дані (HealthKit / Health Connect) — спільний рушій для
// переднього плану і фонової задачі. Специфікація:
// flowi-server-app/docs/specs/health-auto-data.md §8, §10, §11.
// ═════════════════════════════════════════════════════════════════════════════

/** Локальний (НЕ синхронізований) стан пристрою: що вже прочитано з цього телефона. */
export const AUTO_STATE_KEY = 'health_auto_state';
/** Локальні тумбстоуни: автоматичні id, які людина видалила, — синк їх не відтворює. */
export const AUTO_SUPPRESSED_KEY = 'health_auto_suppressed';
/** Прапорець одноразового прибирання ваги, переклеєної на «сьогодні» (ВАДА-2). */
export const WEIGHT_CLEANUP_KEY = 'health_weight_cleanup_v1';
/** Не частіше — інакше витрачаємо бюджет ОС і батарею. Ручне «оновити» обходить. */
export const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 60 * 1000;
export const HEALTH_BG_TASK = 'health-auto-sync';

export interface HealthAutoState {
  lastSyncedDay: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  platform: string | null;
}
const EMPTY_AUTO_STATE: HealthAutoState = { lastSyncedDay: null, lastRunAt: null, lastError: null, platform: null };

/** Реалізація джерела для платформи; хук не знає, яка ОС під ним. */
export function pickHealthSource(os: string = Platform.OS): HealthSourceApi | null {
  if (os === 'ios') return healthKitSource ?? null;
  if (os === 'android') return healthConnectSource ?? null;
  return null;
}

const healthSource = pickHealthSource();
const SOURCE_AVAILABLE = !!healthSource?.isAvailable;

export interface AutoReadResult {
  /** Свіжі автоматичні записи з похідними id. */
  entries: HealthEntry[];
  suppressed: Set<string>;
  /** false — жодна доба не прочиталась (не «нулі», а «нічого не знаємо»). */
  ok: boolean;
  days: string[];
}

function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const pause = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let _running: Promise<AutoReadResult | null> | null = null;

/**
 * Прочитати пропущені доби (до 7) + заміри ваги. Спільна функція для
 * переднього плану й фону. Паралельні виклики отримують той самий прохід
 * (м'ютекс), а без `force` — не частіше, ніж раз на 30 хв (`lastRunAt`).
 * null — прохід пропущено (тротлінг або джерела немає).
 */
export function readAutoHealth(opts: {
  force?: boolean;
  source?: HealthSourceApi | null;
  now?: Date;
  pauseMs?: number;
} = {}): Promise<AutoReadResult | null> {
  if (_running) return _running;
  _running = (async () => {
    try {
      const src = opts.source === undefined ? healthSource : opts.source;
      if (!src?.isAvailable) return null;
      const now = opts.now ?? new Date();
      const state = { ...EMPTY_AUTO_STATE, ...(await loadData<HealthAutoState | null>(AUTO_STATE_KEY, null) ?? {}) };
      if (!opts.force && state.lastRunAt) {
        const since = now.getTime() - new Date(state.lastRunAt).getTime();
        if (Number.isFinite(since) && since >= 0 && since < AUTO_SYNC_MIN_INTERVAL_MS) return null;
      }

      const days = daysToSync(state.lastSyncedDay, now);
      const fresh: HealthEntry[] = [];
      let anyOk = false;
      // По одній добі, від найстарішої, з мікропаузою — щоб не блокувати UI.
      for (let i = 0; i < days.length; i++) {
        const { read, outcome } = await src.readDay(parseDayKey(days[i]), now);
        if (outcome.ok) {
          anyOk = true;
          fresh.push(...buildAutoDayEntries(read, src.source, now));
        }
        if (i < days.length - 1) await pause(opts.pauseMs ?? 40);
      }
      const weights = await src.readWeights(parseDayKey(days[0]), now);
      if (weights.outcome.ok) fresh.push(...buildWeightEntries(weights.samples, src.source));

      const suppressed = new Set(await loadData<string[]>(AUTO_SUPPRESSED_KEY, []));
      await saveData(AUTO_STATE_KEY, {
        lastSyncedDay: anyOk ? localDateKey(now) : state.lastSyncedDay,
        lastRunAt: now.toISOString(),
        lastError: anyOk ? null : 'read_failed',
        platform: src.source,
      } satisfies HealthAutoState);
      return { entries: fresh, suppressed, ok: anyOk, days };
    } catch (e) {
      if (__DEV__) console.warn('[health] auto read failed:', e);
      return { entries: [], suppressed: new Set<string>(), ok: false, days: [] };
    } finally {
      _running = null;
    }
  })();
  return _running;
}

/** Тільки для тестів. */
export function __resetAutoHealthForTests(): void {
  _running = null;
}

/**
 * Фоновий прохід: той самий readAutoHealth + злиття прямо в сховище під
 * блокуванням ключа (updateSynced), бо React-стану у фоні немає.
 */
export async function runHealthAutoSyncInBackground(): Promise<'new' | 'none' | 'failed'> {
  const res = await readAutoHealth({ force: false });
  if (!res) return 'none';
  if (!res.ok) return 'failed';
  let changed = false;
  try {
    await updateSynced<HealthEntry>(ENTRIES_KEY, prev => {
      const next = mergeAutoEntries(prev, res.entries, res.suppressed);
      changed = next !== prev;
      return next;
    });
  } catch (e) {
    if (__DEV__) console.warn('[health] background merge failed:', e);
    return 'failed';
  }
  return changed ? 'new' : 'none';
}

// ─── Фонова задача (§10) ─────────────────────────────────────────────────────
// Пакети опційні: без них збірка працює, фон просто вимкнений. Задачу треба
// визначити в ГЛОБАЛЬНІЙ області модуля — expo-router завантажує маршрути, а з
// ними й цей хук, на старті JS, у тому числі при фоновому запуску.
/* eslint-disable @typescript-eslint/no-require-imports */
let TaskManager: any = null;
let BackgroundTask: any = null;
try { TaskManager = require('expo-task-manager'); } catch { TaskManager = null; }
try { BackgroundTask = require('expo-background-task'); } catch { BackgroundTask = null; }
/* eslint-enable @typescript-eslint/no-require-imports */

if (SOURCE_AVAILABLE && TaskManager && typeof TaskManager.defineTask === 'function') {
  try {
    TaskManager.defineTask(HEALTH_BG_TASK, async () => {
      try {
        const r = await runHealthAutoSyncInBackground();
        // Android без READ_HEALTH_DATA_IN_BACKGROUND нічого не прочитає —
        // тихо виходимо, нулів не пишемо (readAutoHealth їх і не дасть).
        return r === 'failed'
          ? (BackgroundTask?.BackgroundTaskResult?.Failed ?? 2)
          : (BackgroundTask?.BackgroundTaskResult?.Success ?? 1);
      } catch {
        return BackgroundTask?.BackgroundTaskResult?.Failed ?? 2;
      }
    });
  } catch (e) {
    if (__DEV__) console.warn('[health] defineTask failed:', e);
  }
}

let _backgroundArmed = false;

/** Увімкнути фон один раз за сесію: BGTask (обидві ОС) + HealthKit background delivery. */
async function armBackground(): Promise<void> {
  if (_backgroundArmed) return;
  _backgroundArmed = true;
  if (BackgroundTask && typeof BackgroundTask.registerTaskAsync === 'function') {
    try { await BackgroundTask.registerTaskAsync(HEALTH_BG_TASK, { minimumInterval: 15 }); } catch (e) {
      if (__DEV__) console.warn('[health] registerTaskAsync failed:', e);
    }
  }
  if (Platform.OS === 'ios' && typeof enableHealthKitBackground === 'function') {
    // На передньому плані синк робить сам екран (фокус/повернення) —
    // тут лише фон, щоб не писати в сховище повз React-стан відкритого екрана.
    await enableHealthKitBackground(() => {
      if (AppState.currentState !== 'active') void runHealthAutoSyncInBackground();
    });
  }
}

// Доступ кешується на сесію: екземпляри хука не питають ОС щоразу.
let _authRequested = false;
let _hkAuthorized = false;
let _hkAccess: HealthAccess = SOURCE_AVAILABLE ? 'unknown' : 'unavailable';

/**
 * Єдине джерело даних здоров'я: записи + профіль + нагадування + HealthKit-синк,
 * усі агрегати/цілі/чарти та дії додавання. Використовується хабом і модулями.
 */
export function useHealthEntries() {
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutCalorieRecord[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [reminders, setReminders] = useState<Reminders>(DEFAULT_REMINDERS);
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  // ERR-10: «зберігається» — стан, якого не було взагалі; перемикач стрибав
  // у ON миттєво, ще до того, як щось було заплановано.
  const [reminderBusy, setReminderBusy] = useState<keyof Reminders | null>(null);
  const [initialized, setInitialized] = useState(false);

  const [hkAuthorized, setHkAuthorized] = useState(false);
  const [hkSyncing, setHkSyncing] = useState(false);
  const [hkLastSync, setHkLastSync] = useState<Date | null>(null);
  // ERR-14: стан доступу окремо від «модуль є у збірці» і окремо від
  // «останнє читання провалилось». Нулі можна малювати лише коли доступ є
  // і запити вдались; інакше це «немає даних», а не «нуль кроків».
  const [hkAccess, setHkAccess] = useState<HealthAccess>(_hkAccess);
  const [hkFailed, setHkFailed] = useState(false);
  /** Скільки повторів ваги прибрала одноразова міграція (показати людині). */
  const [weightCleanupRemoved, setWeightCleanupRemoved] = useState<number | null>(null);
  const { triggerBackup } = useAutoBackup();

  // ERR-01: читання ключа провалилось. Екран мусить показати помилку з
  // повтором, а не порожній список; автозапис у такий ключ заборонено.
  const [loadFailed, setLoadFailed] = useState(false);

  // Міграція старих HK-калорій (note '__hk__') → 'calories_out'
  const migrate = useCallback((data: HealthEntry[]): HealthEntry[] => {
    let changed = false;
    const out = data.map(e => {
      if (e.type === 'calories' && e.note === '__hk__') { changed = true; return { ...e, type: 'calories_out' as EntryType }; }
      return e;
    });
    return changed ? out : data;
  }, []);

  const loadEntries = useCallback(async () => {
    const r = await loadDataResult<HealthEntry[]>(ENTRIES_KEY, []);
    if (!r.ok) {
      // Головне: НЕ підставляти порожній масив у стан. Саме він потім їхав
      // назад у сховище автозаписом і знищував ще читабельні байти.
      setLoadFailed(true);
      return false;
    }
    setEntries(migrate(r.value));
    return true;
  }, [migrate]);

  const loadProfile = useCallback(async () => {
    setProfile(await loadData<HealthProfile | null>(PROFILE_KEY, null));
  }, []);

  /**
   * Тренування читаються через loadData, а не loadDataResult: збій цього ключа
   * не має блокувати весь розділ здоров'я. Найгірше, що станеться, — спалене
   * не врахує тренувань цього дня; записів здоров'я це не псує й нічого не
   * перезаписує, бо хук у `workouts` не пише.
   */
  const loadWorkouts = useCallback(async () => {
    setWorkouts(await loadData<WorkoutCalorieRecord[]>(WORKOUTS_KEY, []));
  }, []);

  const reload = useCallback(async () => {
    const [ok] = await Promise.all([loadEntries(), loadProfile(), loadWorkouts()]);
    return ok;
  }, [loadEntries, loadProfile, loadWorkouts]);

  /** «Повторити» після збою читання: лише retryStorageRead знімає блокування запису. */
  const retryLoad = useCallback(async () => {
    const r = await retryStorageRead<HealthEntry[]>(ENTRIES_KEY, []);
    if (!r.ok) return false;
    setEntries(migrate(r.value));
    setLoadFailed(false);
    setInitialized(true);
    return true;
  }, [migrate]);

  /**
   * Синк автоматичних даних (обидві ОС). Без `force` — не частіше ніж раз на
   * 30 хв; `force` — ручне «оновити» / «повторити».
   *
   * Замість «видалити все `__hk__` за сьогодні й вставити заново з новими id»
   * (ВАДА-3) — злиття за похідними id: той самий семпл перезаписує сам себе.
   */
  const syncHealthKit = useCallback(async (force: boolean = true) => {
    if (!SOURCE_AVAILABLE) return;
    setHkSyncing(true);
    try {
      const res = await readAutoHealth({ force });
      if (!res) {
        // Прохід пропущено (тротлінг) — підпис «оновлено» беремо зі стану пристрою.
        const st = await loadData<HealthAutoState | null>(AUTO_STATE_KEY, null);
        if (st?.lastRunAt && !st.lastError) setHkLastSync(new Date(st.lastRunAt));
        return;
      }
      setHkFailed(!res.ok);
      // ERR-14: «оновлено щойно» ставимо лише коли справді щось прочитали —
      // інакше підпис стверджував свіжість нулів, яких ніхто не читав.
      if (!res.ok) return;
      setHkLastSync(new Date());
      setEntries(prev => mergeAutoEntries(prev, res.entries, res.suppressed));
      void armBackground();
    } finally {
      setHkSyncing(false);
    }
  }, []);

  /** Доступ дозволяє читати (Apple не каже, що саме дозволено → `unknown` теж читаємо). */
  const canRead = hkAuthorized && (hkAccess === 'granted' || hkAccess === 'unknown');

  useEffect(() => {
    // initialized вмикається ЛИШЕ на успішному читанні — це і є заборона
    // автозапису поверх ключа, який не прочитався (ERR-01).
    Promise.all([loadEntries(), loadProfile(), loadWorkouts()]).then(([ok]) => { if (ok) setInitialized(true); });
    loadData<Reminders>(REMINDERS_KEY, DEFAULT_REMINDERS).then(r => { setReminders(r); setRemindersLoaded(true); });
    if (!SOURCE_AVAILABLE || !healthSource) return;
    if (_authRequested) {
      setHkAuthorized(_hkAuthorized);
      setHkAccess(_hkAccess);
      return;
    }
    _authRequested = true;
    // iOS: діалог HealthKit показується на першому відкритті розділу (як і
    // раніше; повторно iOS його не показує). Android: дозволи Health Connect
    // просимо лише кнопкою «Підключити» — тут тільки питаємо, що вже дали.
    const request = Platform.OS === 'ios' ? healthSource.requestAccess() : Promise.resolve(true);
    request.then(async ok => {
      const access = await healthSource.getAccess();
      _hkAuthorized = ok && access !== 'unavailable';
      _hkAccess = access;
      setHkAuthorized(_hkAuthorized);
      setHkAccess(access);
    }).catch(e => { if (__DEV__) console.warn('[health] access check failed:', e); });
  }, []);

  // Синк — лише ПІСЛЯ читання сховища: злиття в ще порожній стан загубилось
  // би при завантаженні (loadEntries замінює масив цілком).
  useEffect(() => {
    if (initialized && canRead) void syncHealthKit(false);
  }, [initialized, canRead, syncHealthKit]);

  // Повернення застосунку на передній план — головний шлях оновлення
  // (фон на iOS опортуністичний і не є джерелом правди).
  useEffect(() => {
    if (!initialized || !canRead) return;
    const sub = AppState.addEventListener('change', st => { if (st === 'active') void syncHealthKit(false); });
    return () => sub.remove();
  }, [initialized, canRead, syncHealthKit]);

  // ВАДА-2, одноразово: прибрати ланцюжки однакової ваги, які старий синк
  // щодня переклеював на «сьогодні». Спершу — авто-бекап; без бекапу нічого
  // не видаляємо (спробуємо наступного разу). Людині показуємо підсумок.
  const cleanupStarted = useRef(false);
  useEffect(() => {
    if (!initialized || cleanupStarted.current) return;
    cleanupStarted.current = true;
    void (async () => {
      const done = await loadData<{ at: string; removed: number } | null>(WEIGHT_CLEANUP_KEY, null);
      if (done) return;
      const current = await loadDataResult<HealthEntry[]>(ENTRIES_KEY, []);
      if (!current.ok) return;
      const { removed } = collapseStaleHkWeights(current.value);
      if (removed > 0) {
        const backup = await triggerBackup();
        if (!backup) return;
        setEntries(prev => collapseStaleHkWeights(prev).entries);
        setWeightCleanupRemoved(removed);
      }
      await saveData(WEIGHT_CLEANUP_KEY, { at: new Date().toISOString(), removed });
    })();
  }, [initialized, triggerBackup]);

  // Перечитувати записи+профіль при поверненні на екран
  // (модулі мають власні екземпляри хука — так зміни синхронізуються через сховище)
  // + синк автоданих (сам тротлиться до разу на 30 хв).
  useFocusEffect(useCallback(() => {
    if (!initialized) return;
    void reload();
    if (canRead) void syncHealthKit(false);
  }, [initialized, reload, canRead, syncHealthKit]));

  // Зберігати записи після ініціалізації.
  // .catch обовʼязковий: saveSynced тепер відхиляється StorageWriteBlockedError,
  // якщо ключ позначений як «не прочитався».
  useEffect(() => {
    if (!initialized) return;
    void saveSynced(ENTRIES_KEY, entries).catch(e => { if (__DEV__) console.warn('[health] save failed:', e); });
  }, [entries, initialized]);

  // ─── Дії ────────────────────────────────────────────────────────────────
  const addEntry = useCallback((e: NewEntry) => {
    setEntries(p => [{ id: genId(), date: new Date().toISOString(), ...e }, ...p]);
    track(Events.HealthEntryAdded, { type: e.type });
  }, []);

  const addQuick = useCallback((type: EntryType, value: number) => {
    setEntries(p => [{ id: genId(), type, value, date: new Date().toISOString() }, ...p]);
  }, []);

  /**
   * ERR-10. Перемикач нагадування більше не бреше.
   *
   * Було: `reminders[key]` писався в стан і в сховище ПЕРШИМ, а
   * `scheduleDailyReminder` викликався після — і його boolean ніхто не читав.
   * Якщо сповіщення вимкнені глобально або ОС не дала дозволу, перемикач
   * лишався ON, а в системі не було заплановано нічого.
   *
   * Стало: спершу плануємо, і лише успіх вмикає перемикач. Помилка повертає
   * false — екран показує плашку «нагадування не увімкнено» і сам перемикач
   * лишається вимкненим, бо стан не змінився.
   *
   * Застереження (нативний прогін): `requestNotificationPermissions()` віддає
   * true без запиту до iOS, коли `!Device.isDevice` — тобто в симуляторі й
   * дев-білді гілка відмови не виконується НІКОЛИ. Відтворити це можна лише
   * на живому пристрої або вимкнувши глобальний тумблер сповіщень.
   */
  const setReminder = useCallback(async (key: keyof Reminders, on: boolean, title: string, body: string): Promise<boolean> => {
    setReminderBusy(key);
    try {
      if (!on) {
        await cancelDailyReminder(key);
        setReminders(curr => { const next = { ...curr, [key]: false }; void saveSyncedValue(REMINDERS_KEY, next); return next; });
        return true;
      }
      const scheduled = key === 'measurements'
        ? await scheduleWeeklyReminder(key, MEASUREMENTS_WEEKDAY, MEASUREMENTS_HOUR, 0, title, body)
        : await scheduleDailyReminder(key, DAILY_HOURS[key], 0, title, body);
      if (!scheduled) return false;
      setReminders(curr => { const next = { ...curr, [key]: true }; void saveSyncedValue(REMINDERS_KEY, next); return next; });
      return true;
    } finally {
      setReminderBusy(null);
    }
  }, []);

  /**
   * Видалити запис. Автоматичний (похідний id) ще й потрапляє в локальні
   * тумбстоуни — інакше наступний синк відтворив би його (§11.6).
   */
  const deleteEntry = useCallback((id: string) => {
    setEntries(p => p.filter(e => e.id !== id));
    if (isDerivedAutoId(id)) {
      void (async () => {
        const list = await loadData<string[]>(AUTO_SUPPRESSED_KEY, []);
        if (!list.includes(id)) await saveData(AUTO_SUPPRESSED_KEY, [...list, id].slice(-500));
      })();
    }
  }, []);

  /** Запит доступу з екрана («Підключити дані»; ERR-14). */
  const requestHkAccess = useCallback(async () => {
    if (!SOURCE_AVAILABLE || !healthSource) return false;
    const ok = await healthSource.requestAccess();
    const access = await healthSource.getAccess();
    _authRequested = true;
    _hkAuthorized = ok && access !== 'unavailable';
    _hkAccess = access;
    setHkAuthorized(_hkAuthorized);
    setHkAccess(access);
    const granted = _hkAuthorized && access !== 'denied';
    if (granted) await syncHealthKit(true);
    return granted;
  }, [syncHealthKit]);

  // ─── Агрегати (сьогодні) ──────────────────────────────────────────────────
  const today = new Date();
  const todayWater   = useMemo(() => sumForDay(entries, 'water', today),        [entries]);
  const todayCalIn   = useMemo(() => sumForDay(entries, 'calories', today),     [entries]);
  const todayCalOut  = useMemo(() => sumForDay(entries, 'calories_out', today), [entries]);
  const todaySteps   = useMemo(() => sumForDay(entries, 'steps', today),        [entries]);
  const todayWeight  = useMemo(() => lastForDay(entries, 'weight', today),      [entries]);
  const todaySleep   = useMemo(() => lastForDay(entries, 'sleep', today),       [entries]);
  const todayPulse   = useMemo(() => lastForDay(entries, 'pulse', today),       [entries]);
  const todayPulseRest = useMemo(() => lastForDay(entries, 'pulse_rest', today), [entries]);
  const todaySpo2    = useMemo(() => lastForDay(entries, 'spo2', today),        [entries]);
  const todayDistance = useMemo(() => lastForDay(entries, 'distance', today),   [entries]);
  /** Ніч, що закінчилась сьогодні: тривалість + фази (якщо джерело їх дало). */
  const todaySleepNight = useMemo(() => sleepNightForDay(entries, today), [entries]);
  const todayProtein = useMemo(
    () => entries.filter(e => e.type === 'calories' && isSameDay(new Date(e.date), today)).reduce((s, e) => s + (e.protein ?? 0), 0),
    [entries],
  );

  // Через latestValue, а не all[0]: порядок health_entries_v2 гарантує лише
  // локальне додавання (prepend), а звичайний синк приносить записи в порядку
  // сервера. З ваги рахуються TDEE й усі норми, тож «якесь» зважування замість
  // останнього — це неправильні числа без жодної ознаки, що вони неправильні.
  const latestWeight = useMemo(() => latestValue(entries, 'weight'), [entries]);

  const goals = useMemo(() => computeGoals(profile, latestWeight ?? FALLBACK_WEIGHT), [profile, latestWeight]);
  const heightCm = profile?.heightCm ?? 175;
  const bmi = useMemo(() => (latestWeight ? calcBMI(latestWeight, heightCm) : null), [latestWeight, heightCm]);

  /**
   * Спалене за сьогодні = `calories_out` + калорії тренувань Flowi.
   *
   * Тримається окремо від `today.calOut` (це чисті записи) свідомо: екран
   * «Активність» показує саме зведене число, а графіки метрики `calories_out`
   * мусять лишатись графіками записів, інакше стовпчик за сьогодні розійдеться
   * з журналом.
   */
  const todayBurned = useMemo(
    () => burnedForDay(entries, workouts, today),
    [entries, workouts],
  );

  // Три незалежні числа: з'їдене, спалене й залишок. Кільце міряє лише перше.
  /** Якість сну з фаз (§6.2); без фаз — за тривалістю (`byDurationOnly`). */
  const todaySleepQuality = useMemo(
    () => (todaySleepNight
      ? sleepQuality(todaySleepNight.total, todaySleepNight.deep, todaySleepNight.rem, todaySleepNight.awake, goals.sleep)
      : null),
    [todaySleepNight, goals.sleep],
  );

  const cal = useMemo(
    () => calcCalorieDay(goals.calories, todayCalIn, todayBurned),
    [goals.calories, todayCalIn, todayBurned],
  );

  // ─── 7-денні чарти ─────────────────────────────────────────────────────────
  const last7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
  }), []);

  const chart = useCallback((type: EntryType, agg: 'sum' | 'last') =>
    last7.map(day => (agg === 'sum' ? sumForDay(entries, type, day) : (lastForDay(entries, type, day) ?? 0))),
    [entries, last7]);

  const calChart    = useMemo(() => chart('calories', 'sum'),  [chart]);
  const weightChart = useMemo(() => chart('weight', 'last'),   [chart]);
  const stepsChart  = useMemo(() => chart('steps', 'sum'),     [chart]);
  const sleepChart  = useMemo(() => chart('sleep', 'last'),    [chart]);

  const prevWeight = useMemo(() => {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const old = entries.filter(e => e.type === 'weight' && new Date(e.date) <= weekAgo);
    return old.length ? old[0].value : null; // newest серед записів ≤ тиждень тому
  }, [entries]);

  return {
    entries, setEntries, profile, initialized,
    loadFailed, retryLoad,
    goals, heightCm, latestWeight, bmi, bmiCategory,
    today: {
      water: todayWater, calIn: todayCalIn, calOut: todayCalOut, steps: todaySteps,
      weight: todayWeight, sleep: todaySleep, pulse: todayPulse, protein: todayProtein,
      pulseRest: todayPulseRest, spo2: todaySpo2, distance: todayDistance,
      sleepNight: todaySleepNight, sleepQuality: todaySleepQuality,
    },
    cal,
    charts: { cal: calChart, weight: weightChart, steps: stepsChart, sleep: sleepChart },
    last7, prevWeight,
    addEntry, addQuick, deleteEntry,
    /** Одноразове прибирання ваги: N прибраних повторів (null — нічого показувати). */
    weightCleanupRemoved,
    dismissWeightCleanup: () => setWeightCleanupRemoved(null),
    reminders, remindersLoaded, reminderBusy, setReminder,
    hk: {
      available: SOURCE_AVAILABLE,
      /** 'healthkit' | 'healthconnect' | null — яке джерело на цій ОС. */
      source: healthSource?.source ?? null,
      /** Назва сервісу («Apple Health» / «Health Connect») — не перекладається. */
      label: healthSource?.label ?? null,
      authorized: hkAuthorized,
      access: hkAccess,
      /** true — останній синк не зміг прочитати нічого (не плутати з «нуль кроків»). */
      failed: hkFailed,
      syncing: hkSyncing,
      lastSync: hkLastSync,
      sync: () => syncHealthKit(true),
      requestAccess: requestHkAccess,
    },
    reload,
  };
}
