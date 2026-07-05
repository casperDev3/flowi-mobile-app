import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Animated, { FadeInDown } from 'react-native-reanimated';
import { RingCell } from '@/components/health/RingCell';
import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { SyncBadge } from '@/components/today/SyncBadge';
import { QuickActions } from '@/components/today/QuickActions';
import { TodayTaskRow } from '@/components/today/TodayTaskRow';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { useScreenView } from '@/hooks/use-screen-view';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';
import { isSameDay } from '@/utils/dateUtils';
import { Transaction, calcTotals, filterByMonth, txCurrency } from '@/utils/financeUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_SLEEP, ACCENT_STEPS, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { FALLBACK_WEIGHT, HealthEntry, HealthProfile, computeGoals, lastForDay, sumForDay } from '@/utils/healthUtils';
import { Habit, habitDoneToday, habitStreak } from '@/utils/preventionUtils';
import { PRIORITY_COLORS, Task, isOverdue } from '@/utils/taskUtils';
import { haptic } from '@/utils/haptics';

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
  const motion = useMotion();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  const { setPendingTask } = useTimerContext();
  useScreenView('today');

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [txs,      setTxs]      = useState<Transaction[]>([]);
  const [time,     setTime]     = useState<TimeEntry[]>([]);
  const [health,   setHealth]   = useState<HealthEntry[]>([]);
  const [profile,  setProfile]  = useState<HealthProfile | null>(null);
  const [meetings, setMeetings] = useState<TodayMeeting[]>([]);
  const [habits,   setHabits]   = useState<Habit[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const firstLoadDone = useRef(false);

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

  useFocusEffect(useCallback(() => {
    const doLoad = async () => {
      await load();
      if (!firstLoadDone.current) {
        firstLoadDone.current = true;
        setLoaded(true);
      }
    };
    doLoad();
  }, [load]));

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

  // «У фокусі»: найбільш термінова активна задача (прострочена → найближчий дедлайн → перша активна)
  const focusTask = useMemo<Task | null>(() => {
    const active = tasks.filter(t => t.status === 'active');
    const byDl = (a: Task, b: Task) =>
      +new Date(a.deadline!) - +new Date(b.deadline!);
    const overdue = active.filter(isOverdue).sort(byDl);
    if (overdue.length) return overdue[0];
    const withDl = active.filter(t => t.deadline).sort(byDl);
    return withDl[0] ?? active[0] ?? null;
  }, [tasks]);
  const focusOverdue = focusTask ? isOverdue(focusTask) : false;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs]);

  // Time today
  const trackedSec = time
    .filter(e => isSameDay(new Date(e.date), today))
    .reduce((s, e) => s + (e.duration || 0), 0);

  // Today's meetings
  const todayMeetings = useMemo(
    () => meetings.filter(m => isSameDay(new Date(m.date + 'T00:00'), today)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    haptic.light();
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
    haptic.success();
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
    haptic.light();
  }, []);

  const handleFocusTimer = useCallback(() => {
    if (!focusTask) return;
    setPendingTask(focusTask.title);
    haptic.medium();
    router.push('/(tabs)/time');
  }, [focusTask, setPendingTask, router]);

  const openTaskDetails = useCallback((id: string) => {
    router.push({ pathname: '/', params: { open: id } });
  }, [router]);

  // ─── Formatters ────────────────────────────────────────────────────────────

  const hUnit = lang === 'uk' ? 'г' : 'h';
  const mUnit = lang === 'uk' ? 'хв' : 'm';
  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}${hUnit} ${m}${mUnit}`;
    return `${m}${mUnit}`;
  };
  const fmtMoney = (n: number) =>
    `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString(locale)} ₴`;
  const fmtDeadline = (d: string) => {
    const dl = new Date(d);
    if (isSameDay(dl, today)) {
      return dl.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    }
    return dl.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  const Section = ({ index, children }: { index: number; children: React.ReactNode }) => (
    <Animated.View entering={motion.entering(FadeInDown.duration(250).delay(index * 50))}>
      {children}
    </Animated.View>
  );

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

          {/* Skeleton — перше завантаження */}
          {!loaded && (
            <>
              <SkeletonCard style={{ marginTop: 4 }} />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {loaded && <>

          {/* 1. Здоровʼя — hero-стрічка кілець */}
          <Section index={0}>
            <PressableScale
              onPress={() => router.push('/health')}
              accessibilityRole="button"
              accessibilityLabel={tr.tabHealth}
              style={{ marginBottom: 12 }}>
              <BlurView
                intensity={isDark ? 22 : 42}
                tint={isDark ? 'dark' : 'light'}
                style={[s.card, { borderColor: c.border }]}>
                <View style={s.cardHead}>
                  <Text style={[s.sectionTitle, { color: c.sub }]}>{tr.tabHealth}</Text>
                  <IconSymbol name="chevron.right" size={12} color={c.sub} />
                </View>
                <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                  <RingCell pct={goals.calories ? Math.max(0, calNet) / goals.calories : 0} color={ACCENT_CAL} label={tr.calories} value={`${calNet}кк`} />
                  <RingCell pct={steps / goals.steps} color={ACCENT_STEPS} label={tr.steps} value={steps >= 1000 ? `${(steps / 1000).toFixed(1)}т` : `${steps}`} />
                  <RingCell pct={water / goals.water} color={ACCENT} label={tr.water} value={water >= 1000 ? `${(water / 1000).toFixed(1)}л` : `${water}мл`} />
                  <RingCell pct={sleep ? sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep} value={sleep ? fmtSleep(sleep) : '—'} />
                </View>
              </BlurView>
            </PressableScale>
          </Section>

          {/* 2. Швидкі дії */}
          <Section index={1}>
            <QuickActions
              isDark={isDark}
              c={c}
              tr={tr}
              onAddTask={() => router.push({ pathname: '/', params: { create: '1' } })}
              onAddExpense={() => router.push({ pathname: '/explore', params: { create: '1' } })}
              onAddWater={handleAddWater}
              onTimer={() => router.push('/time')}
            />
          </Section>

          {/* 3. У фокусі — найтерміновіша задача + старт таймера */}
          {focusTask && (
            <Section index={2}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { color: c.sub, marginBottom: 6 }]}>{tr.todayFocus}</Text>
                <BlurView
                  intensity={isDark ? 22 : 42}
                  tint={isDark ? 'dark' : 'light'}
                  style={[s.focusCard, { borderColor: focusOverdue ? '#EF4444' + '55' : c.border }]}>
                  <View style={[s.focusBar, { backgroundColor: PRIORITY_COLORS[focusTask.priority] || ACCENT_TASK }]} />
                  <AnimatedCheck
                    checked={false}
                    size={24}
                    color={PRIORITY_COLORS[focusTask.priority] || ACCENT_TASK}
                    borderColor={c.sub}
                    onPress={() => handleToggleTask(focusTask.id)}
                    accessibilityLabel={focusTask.title}
                  />
                  <PressableScale
                    onPress={() => openTaskDetails(focusTask.id)}
                    accessibilityRole="button"
                    accessibilityLabel={focusTask.title}
                    style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.focusTitle, { color: c.text }]} numberOfLines={2}>{focusTask.title}</Text>
                    {focusTask.deadline && (
                      <Text style={{ color: focusOverdue ? '#EF4444' : c.sub, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
                        {focusOverdue ? `${tr.todayOverdue} · ` : ''}{fmtDeadline(focusTask.deadline)}
                      </Text>
                    )}
                  </PressableScale>
                  <PressableScale
                    onPress={handleFocusTimer}
                    scaleTo={0.9}
                    accessibilityRole="button"
                    accessibilityLabel={tr.quickTimer}
                    style={[s.playBtn, { backgroundColor: ACCENT_TIME + '22' }]}>
                    <IconSymbol name="play.fill" size={16} color={ACCENT_TIME} />
                  </PressableScale>
                </BlurView>
              </View>
            </Section>
          )}

          {/* 4. Завдання на сьогодні */}
          <Section index={3}>
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
                tasks={focusTask ? tasks.filter(t => t.id !== focusTask.id) : tasks}
                isDark={isDark}
                c={c}
                tr={tr}
                onToggle={handleToggleTask}
                onOpen={openTaskDetails}
              />
              {activeCount === 0 && (
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{tr.noTasksToday}</Text>
              )}
            </View>
          </Section>

          {/* 5. Зустрічі сьогодні */}
          {todayMeetings.length > 0 && (
            <Section index={4}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { color: c.sub, marginBottom: 6 }]}>{tr.todayMeetings}</Text>
                {todayMeetings.map(m => (
                  <PressableScale
                    key={m.id}
                    onPress={() => router.push('/meetings')}
                    style={{ marginBottom: 6 }}>
                    <BlurView
                      intensity={isDark ? 18 : 36}
                      tint={isDark ? 'dark' : 'light'}
                      style={[s.meetingRow, { borderColor: c.border }]}>
                      <View style={[s.meetingBar, { backgroundColor: m.color || ACCENT_TASK }]} />
                      <Text style={[s.meetingTime, { color: c.sub }]}>{m.time}</Text>
                      <Text style={[s.meetingTitle, { color: c.text }]} numberOfLines={1}>{m.title}</Text>
                    </BlurView>
                  </PressableScale>
                ))}
              </View>
            </Section>
          )}

          {/* 6. Звички */}
          {habits.length > 0 && (
            <Section index={5}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { color: c.sub, marginBottom: 6 }]}>{tr.todayHabits}</Text>
                {habits.map(h => {
                  const done   = habitDoneToday(h);
                  const streak = habitStreak(h);
                  return (
                    <PressableScale
                      key={h.id}
                      onPress={() => handleToggleHabit(h.id)}
                      style={{ marginBottom: 6 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done }}
                      accessibilityLabel={h.title}>
                      <BlurView
                        intensity={isDark ? 18 : 36}
                        tint={isDark ? 'dark' : 'light'}
                        style={[s.habitRow, { borderColor: c.border }]}>
                        <View style={[s.habitBar, { backgroundColor: h.color || ACCENT }]} />
                        <AnimatedCheck
                          checked={done}
                          size={20}
                          color={h.color || ACCENT}
                          borderColor={c.sub}
                        />
                        <Text style={[s.habitTitle, { color: c.text }]} numberOfLines={1}>{h.title}</Text>
                        {streak > 0 && (
                          <Text style={[s.streakBadge, { color: h.color || ACCENT }]}>
                            🔥{streak}
                          </Text>
                        )}
                      </BlurView>
                    </PressableScale>
                  );
                })}
              </View>
            </Section>
          )}

          {/* 7. Фінанси + Час — сітка 2 колонки */}
          <Section index={6}>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              <StatTile
                c={c} isDark={isDark}
                icon="banknote" color={ACCENT_FIN}
                title={tr.tabFinance}
                onPress={() => router.push('/explore')}>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: fin.balance >= 0 ? '#10B981' : '#EF4444', fontSize: 20, fontWeight: '800', marginTop: 6 }}>
                  {fmtMoney(fin.balance)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                  <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>↑ {fmtMoney(fin.income)}</Text>
                  <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>↓ {fmtMoney(fin.expense)}</Text>
                </View>
              </StatTile>
              <StatTile
                c={c} isDark={isDark}
                icon="timer" color={ACCENT_TIME}
                title={tr.quickTimer}
                onPress={() => router.push('/time')}>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginTop: 6 }}>
                  {fmtTime(trackedSec)}
                </Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{tr.todayTracked}</Text>
              </StatTile>
            </View>
          </Section>

          {/* 8. Спільне */}
          <Section index={7}>
            <PressableScale
              onPress={() => router.push('/(tabs)/shared')}
              accessibilityRole="button"
              accessibilityLabel={tr.sharedTitle}
              style={{ marginBottom: 12 }}>
              <BlurView
                intensity={isDark ? 22 : 42}
                tint={isDark ? 'dark' : 'light'}
                style={[s.card, { borderColor: c.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[s.cardIcon, { backgroundColor: ACCENT_SHARE + '22' }]}>
                    <IconSymbol name="person.2.fill" size={16} color={ACCENT_SHARE} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{tr.sharedTitle}</Text>
                    <Text style={{ color: c.sub, fontSize: 12, marginTop: 1 }}>{tr.sharedSubtitle}</Text>
                  </View>
                  <IconSymbol name="chevron.right" size={13} color={c.sub} />
                </View>
              </BlurView>
            </PressableScale>
          </Section>

          </>}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── StatTile — компактна плитка сітки ────────────────────────────────────────

function StatTile({ c, isDark, icon, color, title, onPress, children }: {
  c: any;
  isDark: boolean;
  icon: string;
  color: string;
  title: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{ flex: 1 }}>
      <BlurView
        intensity={isDark ? 22 : 42}
        tint={isDark ? 'dark' : 'light'}
        style={[s.card, { borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[s.cardIcon, { backgroundColor: color + '22' }]}>
            <IconSymbol name={icon as any} size={15} color={color} />
          </View>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginLeft: 8, flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        {children}
      </BlurView>
    </PressableScale>
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
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 12,
    overflow: 'hidden',
  },
  focusBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  focusTitle: { fontSize: 15, fontWeight: '700' },
  playBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
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
