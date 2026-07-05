import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RingCell } from '@/components/health/RingCell';
import { SyncBadge } from '@/components/today/SyncBadge';
import { QuickActions } from '@/components/today/QuickActions';
import { TodayTaskRow } from '@/components/today/TodayTaskRow';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import { Transaction, calcTotals, filterByMonth, txCurrency } from '@/utils/financeUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_SLEEP, ACCENT_STEPS, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { FALLBACK_WEIGHT, HealthEntry, HealthProfile, computeGoals, lastForDay, sumForDay } from '@/utils/healthUtils';
import { Habit, habitDoneToday, habitStreak } from '@/utils/preventionUtils';
import { Task, isOverdue } from '@/utils/taskUtils';

// ─── Local types ──────────────────────────────────────────────────────────────

interface TimeEntry { id: string; duration: number; date: string; }

interface TodayMeeting {
  id: string;
  title: string;
  date: string;   // "YYYY-MM-DD"
  time: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_TASK  = '#7C3AED';
const ACCENT_FIN   = '#0EA5E9';
const ACCENT_TIME  = '#6366F1';
const ACCENT_SHARE = '#8B5CF6';
const QUICK_WATER  = 250;

// ─── Main component ───────────────────────────────────────────────────────────

export default function TodayScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('today');

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [txs,      setTxs]      = useState<Transaction[]>([]);
  const [time,     setTime]     = useState<TimeEntry[]>([]);
  const [health,   setHealth]   = useState<HealthEntry[]>([]);
  const [profile,  setProfile]  = useState<HealthProfile | null>(null);
  const [meetings, setMeetings] = useState<TodayMeeting[]>([]);
  const [habits,   setHabits]   = useState<Habit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [t, x, tm, h, p, m, hb] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Transaction[]>('transactions', []),
      loadData<TimeEntry[]>('time_entries', []),
      loadData<HealthEntry[]>('health_entries_v2', []),
      loadData<HealthProfile | null>('health_profile', null),
      loadData<TodayMeeting[]>('meetings', []),
      loadData<Habit[]>('health_habits', []),
    ]);
    setTasks(t); setTxs(x); setTime(tm); setHealth(h); setProfile(p);
    setMeetings(m); setHabits(hb);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const today = new Date();
  const hour  = today.getHours();
  const greet = hour < 6
    ? tr.todayGreetNight
    : hour < 12
      ? tr.todayGreetMorning
      : hour < 18
        ? tr.todayGreetDay
        : tr.todayGreetEvening;
  const dateStr = today.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // Tasks
  const activeCount  = tasks.filter(t => t.status === 'active').length;
  const overdueCount = tasks.filter(isOverdue).length;

  // Health
  const goals = useMemo(() => {
    const weights = health.filter(e => e.type === 'weight');
    const lw = weights.length ? weights[0].value : null;
    return computeGoals(profile, lw ?? FALLBACK_WEIGHT);
  }, [health, profile]);
  const calNet = sumForDay(health, 'calories', today) - sumForDay(health, 'calories_out', today);
  const steps  = sumForDay(health, 'steps', today);
  const water  = sumForDay(health, 'water', today);
  const sleep  = lastForDay(health, 'sleep', today);

  // Finance (UAH)
  const fin = useMemo(() => {
    const month = filterByMonth(txs.filter(t => txCurrency(t) === 'UAH'), today);
    return calcTotals(month);
  }, [txs]);

  // Time today
  const trackedSec = time
    .filter(e => isSameDay(new Date(e.date), today))
    .reduce((s, e) => s + (e.duration || 0), 0);

  // Today's meetings
  const todayMeetings = useMemo(
    () => meetings.filter(m => isSameDay(new Date(m.date + 'T00:00'), today)),
    [meetings],
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleToggleTask = useCallback(async (id: string) => {
    const fresh = await loadData<Task[]>('tasks', []);
    const updated = fresh.map(t => {
      if (t.id !== id) return t;
      return { ...t, status: t.status === 'done' ? 'active' : 'done' } as Task;
    });
    await saveSynced('tasks', updated);
    setTasks(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleAddWater = useCallback(async () => {
    const newEntry: HealthEntry = {
      id: `${Date.now()}_w`,
      type: 'water',
      value: QUICK_WATER,
      date: new Date().toISOString(),
    };
    const current = await loadData<HealthEntry[]>('health_entries_v2', []);
    const updated  = [newEntry, ...current];
    await saveSynced('health_entries_v2', updated);
    setHealth(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleToggleHabit = useCallback(async (id: string) => {
    const fresh = await loadData<Habit[]>('health_habits', []);
    const todayDate = new Date();
    const updated = fresh.map(h => {
      if (h.id !== id) return h;
      const doneToday = h.log.some(l => isSameDay(new Date(l), todayDate));
      if (doneToday) {
        return { ...h, log: h.log.filter(l => !isSameDay(new Date(l), todayDate)) };
      }
      return { ...h, log: [...h.log, new Date().toISOString()] };
    });
    await saveSynced('health_habits', updated);
    setHabits(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  // ─── Formatters ────────────────────────────────────────────────────────────

  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}г ${m}хв`;
    return `${m}хв`;
  };
  const fmtMoney = (n: number) =>
    `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString(locale)} ₴`;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>{greet}</Text>
            <Text style={[s.title, { color: c.text }]} numberOfLines={1}>
              {dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
            </Text>
          </View>
          <SyncBadge />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Quick Actions */}
          <QuickActions
            isDark={isDark}
            c={c}
            tr={tr}
            onAddTask={() => router.push({ pathname: '/', params: { create: '1' } })}
            onAddExpense={() => router.push({ pathname: '/explore', params: { create: '1' } })}
            onAddWater={handleAddWater}
            onTimer={() => router.push('/time')}
          />

          {/* Tasks section (merged counter + rows) */}
          <View style={{ marginBottom: 12 }}>
            <View style={s.sectionRow}>
              <Text style={[s.sectionTitle, { color: c.sub }]}>{tr.todayTasks}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {overdueCount > 0 && (
                  <View style={[s.badge, { backgroundColor: '#EF4444' + '20', borderColor: '#EF4444' + '40' }]}>
                    <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>
                      {overdueCount} {tr.todayOverdue}
                    </Text>
                  </View>
                )}
                <View style={[s.badge, { backgroundColor: ACCENT_TASK + '18', borderColor: ACCENT_TASK + '35' }]}>
                  <Text style={{ color: ACCENT_TASK, fontSize: 11, fontWeight: '700' }}>
                    {activeCount} {tr.todayActive}
                  </Text>
                </View>
              </View>
            </View>
            <TodayTaskRow
              tasks={tasks}
              isDark={isDark}
              c={c}
              tr={tr}
              onToggle={handleToggleTask}
            />
            {activeCount === 0 && (
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{tr.noTasksToday}</Text>
            )}
          </View>

          {/* Today Meetings */}
          {todayMeetings.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.sectionTitle, { color: c.sub }]}>{tr.todayMeetings}</Text>
              {todayMeetings.map(m => (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => router.push('/meetings')}
                  activeOpacity={0.8}
                  style={{ marginBottom: 6 }}>
                  <BlurView
                    intensity={isDark ? 18 : 36}
                    tint={isDark ? 'dark' : 'light'}
                    style={[s.meetingRow, { borderColor: c.border }]}>
                    <View style={[s.meetingBar, { backgroundColor: m.color || ACCENT_TASK }]} />
                    <Text style={[s.meetingTime, { color: c.sub }]}>{m.time}</Text>
                    <Text style={[s.meetingTitle, { color: c.text }]} numberOfLines={1}>{m.title}</Text>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Today Habits */}
          {habits.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <Text style={[s.sectionTitle, { color: c.sub }]}>{tr.todayHabits}</Text>
              {habits.map(h => {
                const done   = habitDoneToday(h);
                const streak = habitStreak(h);
                return (
                  <TouchableOpacity
                    key={h.id}
                    onPress={() => handleToggleHabit(h.id)}
                    activeOpacity={0.8}
                    style={{ marginBottom: 6 }}
                    accessibilityRole="checkbox"
                    accessibilityLabel={h.title}>
                    <BlurView
                      intensity={isDark ? 18 : 36}
                      tint={isDark ? 'dark' : 'light'}
                      style={[s.habitRow, { borderColor: c.border }]}>
                      <View style={[s.habitBar, { backgroundColor: h.color || ACCENT }]} />
                      <IconSymbol
                        name={done ? 'checkmark.circle.fill' : 'circle'}
                        size={20}
                        color={done ? (h.color || ACCENT) : c.sub}
                      />
                      <Text style={[s.habitTitle, { color: c.text }]} numberOfLines={1}>{h.title}</Text>
                      {streak > 0 && (
                        <Text style={[s.streakBadge, { color: h.color || ACCENT }]}>
                          🔥{streak}
                        </Text>
                      )}
                    </BlurView>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Shared card */}
          <Card
            onPress={() => router.push('/(tabs)/shared')}
            c={c}
            isDark={isDark}
            title={tr.sharedTitle}
            icon="person.2.fill"
            color={ACCENT_SHARE}>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{tr.sharedSubtitle}</Text>
          </Card>

          {/* Health */}
          <Card onPress={() => router.push('/health')} c={c} isDark={isDark} title={tr.tabHealth} icon="figure.run" color={ACCENT}>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              <RingCell pct={goals.calories ? Math.max(0, calNet) / goals.calories : 0} color={ACCENT_CAL} label={tr.calories} value={`${calNet}кк`} />
              <RingCell pct={steps / goals.steps} color={ACCENT_STEPS} label={tr.steps} value={steps >= 1000 ? `${(steps / 1000).toFixed(1)}т` : `${steps}`} />
              <RingCell pct={water / goals.water} color={ACCENT} label={tr.water} value={water >= 1000 ? `${(water / 1000).toFixed(1)}л` : `${water}мл`} />
              <RingCell pct={sleep ? sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep} value={sleep ? fmtSleep(sleep) : '—'} />
            </View>
          </Card>

          {/* Finance */}
          <Card onPress={() => router.push('/explore')} c={c} isDark={isDark} title={tr.tabFinance} icon="banknote" color={ACCENT_FIN}>
            <Text style={{ color: fin.balance >= 0 ? '#10B981' : '#EF4444', fontSize: 24, fontWeight: '800', marginTop: 4 }}>
              {fmtMoney(fin.balance)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <Text style={{ color: c.sub, fontSize: 12 }}>↑ <Text style={{ color: '#10B981', fontWeight: '700' }}>{fmtMoney(fin.income)}</Text></Text>
              <Text style={{ color: c.sub, fontSize: 12 }}>↓ <Text style={{ color: '#EF4444', fontWeight: '700' }}>{fmtMoney(fin.expense)}</Text></Text>
            </View>
          </Card>

          {/* Time */}
          <Card onPress={() => router.push('/time')} c={c} isDark={isDark} title={tr.tabToday + ' · ' + fmtTime(trackedSec)} icon="timer" color={ACCENT_TIME}>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{tr.todayTracked}</Text>
          </Card>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── Card component ───────────────────────────────────────────────────────────

function Card({ onPress, c, isDark, title, icon, color, children }: {
  onPress: () => void;
  c: any;
  isDark: boolean;
  title: string;
  icon: string;
  color: string;
  children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title} style={{ marginBottom: 12 }}>
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name={icon as any} size={16} color={color} />
          </View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 10, flex: 1 }}>{title}</Text>
          <IconSymbol name="chevron.right" size={13} color={c.sub} />
        </View>
        {children}
      </BlurView>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  card:  { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  badge: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 10,
    overflow: 'hidden',
  },
  meetingBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  meetingTime: { fontSize: 13, fontWeight: '600', minWidth: 40 },
  meetingTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 10,
    overflow: 'hidden',
  },
  habitBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  habitTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  streakBadge: { fontSize: 13, fontWeight: '700' },
});
