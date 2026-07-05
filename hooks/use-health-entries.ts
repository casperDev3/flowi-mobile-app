import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { HK_AVAILABLE, HKDayData, fetchTodayData, initHealthKit } from '@/store/healthkit';
import { cancelDailyReminder, scheduleDailyReminder, scheduleWeeklyReminder } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { Events, track } from '@/utils/analytics';
import { isSameDay } from '@/utils/dateUtils';
import {
  EntryType,
  FALLBACK_WEIGHT,
  HealthEntry,
  HealthProfile,
  PROFILE_KEY,
  bmiCategory,
  calcBMI,
  computeGoals,
  lastForDay,
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

/**
 * Єдине джерело даних здоров'я: записи + профіль + нагадування + HealthKit-синк,
 * усі агрегати/цілі/чарти та дії додавання. Використовується хабом і модулями.
 */
export function useHealthEntries() {
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [reminders, setReminders] = useState<Reminders>(DEFAULT_REMINDERS);
  const [remindersLoaded, setRemindersLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const [hkAuthorized, setHkAuthorized] = useState(false);
  const [hkSyncing, setHkSyncing] = useState(false);
  const [hkLastSync, setHkLastSync] = useState<Date | null>(null);

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
    const data = await loadData<HealthEntry[]>(ENTRIES_KEY, []);
    setEntries(migrate(data));
  }, [migrate]);

  const loadProfile = useCallback(async () => {
    setProfile(await loadData<HealthProfile | null>(PROFILE_KEY, null));
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadEntries(), loadProfile()]);
  }, [loadEntries, loadProfile]);

  const syncHealthKit = useCallback(async () => {
    if (!HK_AVAILABLE) return;
    setHkSyncing(true);
    const data: HKDayData = await fetchTodayData();
    setHkLastSync(new Date());
    setEntries(prev => {
      const todayDate = new Date();
      const filtered = prev.filter(e => {
        const isToday = isSameDay(new Date(e.date), todayDate);
        return !isToday || e.note !== '__hk__';
      });
      const iso = new Date().toISOString();
      const hk: HealthEntry[] = [];
      if (data.steps > 0)         hk.push({ id: genId(), type: 'steps', value: data.steps, note: '__hk__', date: iso });
      if (data.heartRateAvg)      hk.push({ id: genId(), type: 'pulse', value: data.heartRateAvg, note: '__hk__', date: iso });
      if (data.weight)            hk.push({ id: genId(), type: 'weight', value: data.weight, note: '__hk__', date: iso });
      if (data.activeCalories > 0) hk.push({ id: genId(), type: 'calories_out', value: data.activeCalories, note: '__hk__', date: iso });
      if (data.sleepMinutes)      hk.push({ id: genId(), type: 'sleep', value: data.sleepMinutes, note: '__hk__', date: iso });
      return [...hk, ...filtered];
    });
    setHkSyncing(false);
  }, []);

  useEffect(() => {
    Promise.all([loadEntries(), loadProfile()]).then(() => setInitialized(true));
    loadData<Reminders>(REMINDERS_KEY, DEFAULT_REMINDERS).then(r => { setReminders(r); setRemindersLoaded(true); });
    if (HK_AVAILABLE) {
      if (_hkInited) {
        setHkAuthorized(_hkAuthorized); // вже ініціалізовано в цій сесії — не синкаємо повторно
      } else {
        _hkInited = true;
        initHealthKit().then(ok => { _hkAuthorized = ok; setHkAuthorized(ok); if (ok) syncHealthKit(); });
      }
    }
  }, []);

  // Перечитувати записи+профіль при поверненні на екран
  // (модулі мають власні екземпляри хука — так зміни синхронізуються через сховище)
  useFocusEffect(useCallback(() => { if (initialized) reload(); }, [initialized, reload]));

  // Зберігати записи після ініціалізації
  useEffect(() => { if (initialized) void saveSynced(ENTRIES_KEY, entries); }, [entries, initialized]);

  // ─── Дії ────────────────────────────────────────────────────────────────
  const addEntry = useCallback((e: NewEntry) => {
    setEntries(p => [{ id: genId(), date: new Date().toISOString(), ...e }, ...p]);
    track(Events.HealthEntryAdded, { type: e.type });
  }, []);

  const addQuick = useCallback((type: EntryType, value: number) => {
    setEntries(p => [{ id: genId(), type, value, date: new Date().toISOString() }, ...p]);
  }, []);

  const setReminder = useCallback(async (key: keyof Reminders, on: boolean, title: string, body: string) => {
    setReminders(curr => { const next = { ...curr, [key]: on }; saveData(REMINDERS_KEY, next); return next; });
    if (!on) { await cancelDailyReminder(key); return; }
    if (key === 'measurements') await scheduleWeeklyReminder(key, MEASUREMENTS_WEEKDAY, MEASUREMENTS_HOUR, 0, title, body);
    else await scheduleDailyReminder(key, DAILY_HOURS[key], 0, title, body);
  }, []);

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

  const latestWeight = useMemo(() => {
    const all = entries.filter(e => e.type === 'weight');
    return all.length ? all[0].value : null; // newest-first
  }, [entries]);

  const goals = useMemo(() => computeGoals(profile, latestWeight ?? FALLBACK_WEIGHT), [profile, latestWeight]);
  const heightCm = profile?.heightCm ?? 175;
  const bmi = useMemo(() => (latestWeight ? calcBMI(latestWeight, heightCm) : null), [latestWeight, heightCm]);

  const calNet = todayCalIn - todayCalOut;
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
    goals, heightCm, latestWeight, bmi, bmiCategory,
    today: {
      water: todayWater, calIn: todayCalIn, calOut: todayCalOut, steps: todaySteps,
      weight: todayWeight, sleep: todaySleep, pulse: todayPulse, protein: todayProtein,
    },
    cal: { net: calNet, remaining: calRemaining, pct: calPct, over: calOver },
    charts: { cal: calChart, weight: weightChart, steps: stepsChart, sleep: sleepChart },
    last7, prevWeight,
    addEntry, addQuick,
    reminders, remindersLoaded, setReminder,
    hk: { available: HK_AVAILABLE, authorized: hkAuthorized, syncing: hkSyncing, lastSync: hkLastSync, sync: syncHealthKit },
    reload,
  };
}
