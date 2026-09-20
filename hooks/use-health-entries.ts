import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  HK_AVAILABLE, type HKAccess, fetchTodayDataResult, getHealthKitAccess, initHealthKit,
} from '@/store/healthkit';
import { cancelDailyReminder, scheduleDailyReminder, scheduleWeeklyReminder } from '@/store/notifications';
import { loadData, loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced, saveSyncedValue } from '@/store/synced-storage';
import { Events, track } from '@/utils/analytics';
import { isSameDay } from '@/utils/dateUtils';
import {
  EntryType,
  FALLBACK_WEIGHT,
  HealthEntry,
  HealthProfile,
  calcNetCalories,
  PROFILE_KEY,
  bmiCategory,
  calcBMI,
  computeGoals,
  lastForDay,
  latestValue,
  sumForDay,
} from '@/utils/healthUtils';

export const ENTRIES_KEY = 'health_entries_v2';
export const REMINDERS_KEY = 'health_reminders';

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

// HealthKit init/sync — один раз за сесію застосунку (спільно для всіх екземплярів хука).
// Решта екранів отримують HK-дані через сховище (reload-on-focus), без повторних синків.
let _hkInited = false;
let _hkAuthorized = false;
let _hkAccess: HKAccess = HK_AVAILABLE ? 'unknown' : 'unavailable';

/**
 * Єдине джерело даних здоров'я: записи + профіль + нагадування + HealthKit-синк,
 * усі агрегати/цілі/чарти та дії додавання. Використовується хабом і модулями.
 */
export function useHealthEntries() {
  const [entries, setEntries] = useState<HealthEntry[]>([]);
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
  const [hkAccess, setHkAccess] = useState<HKAccess>(_hkAccess);
  const [hkFailed, setHkFailed] = useState(false);

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

  const reload = useCallback(async () => {
    const [ok] = await Promise.all([loadEntries(), loadProfile()]);
    return ok;
  }, [loadEntries, loadProfile]);

  /** «Повторити» після збою читання: лише retryStorageRead знімає блокування запису. */
  const retryLoad = useCallback(async () => {
    const r = await retryStorageRead<HealthEntry[]>(ENTRIES_KEY, []);
    if (!r.ok) return false;
    setEntries(migrate(r.value));
    setLoadFailed(false);
    setInitialized(true);
    return true;
  }, [migrate]);

  const syncHealthKit = useCallback(async () => {
    if (!HK_AVAILABLE) return;
    setHkSyncing(true);
    const { data, outcome } = await fetchTodayDataResult();
    setHkFailed(!outcome.ok);
    // ERR-14: «оновлено щойно» ставимо лише коли справді щось прочитали —
    // інакше підпис стверджував свіжість нулів, яких ніхто не читав.
    if (outcome.ok) setHkLastSync(new Date());
    else { setHkSyncing(false); return; }
    setEntries(prev => {
      const todayDate = new Date();
      const filtered = prev.filter(e => {
        const isToday = isSameDay(new Date(e.date), todayDate);
        return !isToday || e.note !== '__hk__';
      });
      const iso = new Date().toISOString();
      const hk: HealthEntry[] = [];
      if (data.steps > 0)          hk.push({ id: genId(), type: 'steps',        value: data.steps,           note: '__hk__', source: 'healthkit', date: iso });
      if (data.heartRateAvg)       hk.push({ id: genId(), type: 'pulse',        value: data.heartRateAvg,    note: '__hk__', source: 'healthkit', date: iso });
      if (data.weight)             hk.push({ id: genId(), type: 'weight',       value: data.weight,          note: '__hk__', source: 'healthkit', date: iso });
      if (data.activeCalories > 0) hk.push({ id: genId(), type: 'calories_out', value: data.activeCalories,  note: '__hk__', source: 'healthkit', date: iso });
      if (data.sleepMinutes)       hk.push({ id: genId(), type: 'sleep',        value: data.sleepMinutes,    note: '__hk__', source: 'healthkit', date: iso });
      return [...hk, ...filtered];
    });
    setHkSyncing(false);
  }, []);

  useEffect(() => {
    // initialized вмикається ЛИШЕ на успішному читанні — це і є заборона
    // автозапису поверх ключа, який не прочитався (ERR-01).
    Promise.all([loadEntries(), loadProfile()]).then(([ok]) => { if (ok) setInitialized(true); });
    loadData<Reminders>(REMINDERS_KEY, DEFAULT_REMINDERS).then(r => { setReminders(r); setRemindersLoaded(true); });
    if (HK_AVAILABLE) {
      if (_hkInited) {
        setHkAuthorized(_hkAuthorized); // вже ініціалізовано в цій сесії — не синкаємо повторно
        setHkAccess(_hkAccess);
      } else {
        _hkInited = true;
        initHealthKit().then(async ok => {
          _hkAuthorized = ok;
          setHkAuthorized(ok);
          // requestAuthorization не кидає й не повертає «дозволено» — питаємо
          // систему окремо, інакше «модуль є» видавалось за «доступ є».
          const access = await getHealthKitAccess();
          _hkAccess = access;
          setHkAccess(access);
          if (ok && access !== 'denied') syncHealthKit();
        });
      }
    }
  }, []);

  // Перечитувати записи+профіль при поверненні на екран
  // (модулі мають власні екземпляри хука — так зміни синхронізуються через сховище)
  useFocusEffect(useCallback(() => { if (initialized) reload(); }, [initialized, reload]));

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

  /** Повторний запит доступу до HealthKit з екрана (ERR-14). */
  const requestHkAccess = useCallback(async () => {
    if (!HK_AVAILABLE) return false;
    const ok = await initHealthKit();
    _hkAuthorized = ok;
    setHkAuthorized(ok);
    const access = await getHealthKitAccess();
    _hkAccess = access;
    setHkAccess(access);
    if (ok && access !== 'denied') await syncHealthKit();
    return ok && access !== 'denied';
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

  const calNet = calcNetCalories(todayCalIn, todayCalOut);
  const calRemaining = goals.calories - calNet;
  const calPct = goals.calories > 0 ? calNet / goals.calories : 0;
  const calOver = calNet > goals.calories;

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
    },
    cal: { net: calNet, remaining: calRemaining, pct: calPct, over: calOver },
    charts: { cal: calChart, weight: weightChart, steps: stepsChart, sleep: sleepChart },
    last7, prevWeight,
    addEntry, addQuick,
    reminders, remindersLoaded, reminderBusy, setReminder,
    hk: {
      available: HK_AVAILABLE,
      authorized: hkAuthorized,
      access: hkAccess,
      /** true — останній синк не зміг прочитати нічого (не плутати з «нуль кроків»). */
      failed: hkFailed,
      syncing: hkSyncing,
      lastSync: hkLastSync,
      sync: syncHealthKit,
      requestAccess: requestHkAccess,
    },
    reload,
  };
}
