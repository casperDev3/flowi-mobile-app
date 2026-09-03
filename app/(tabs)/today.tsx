import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import Animated, { FadeInDown } from 'react-native-reanimated';
import { RingCell } from '@/components/health/RingCell';
import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { SkeletonCard } from '@/components/shared/Skeleton';
import { SyncBadge } from '@/components/today/SyncBadge';
import { QuickActions } from '@/components/today/QuickActions';
import { TodayTaskRow } from '@/components/today/TodayTaskRow';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { useScreenView } from '@/hooks/use-screen-view';
import { loadData } from '@/store/storage';
import { mergeTaskStatusColumns, type TaskStatusColumn } from '@/utils/taskStatuses';
import { groupTodayTasks } from '@/utils/todayGroups';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import { Transaction, calcTotals, filterByMonth } from '@/utils/financeUtils';
import { resolveTxCurrency, type Account } from '@/utils/accounts';
import {
  ACCENT, ACCENT_CAL, ACCENT_SLEEP, ACCENT_STEPS, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { FALLBACK_WEIGHT, HealthEntry, HealthProfile, calcNetCalories, computeGoals, lastForDay, sumForDay } from '@/utils/healthUtils';
import { Habit, habitDoneToday, habitStreak } from '@/utils/preventionUtils';
import { Task, isOverdue } from '@/utils/taskUtils';
import { haptic } from '@/utils/haptics';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { formatDuration } from '@/utils/durationFormat';
import { BUILTIN_CURRENCIES, formatCurrency, type Currency } from '@/utils/financeUtils';
import { useResponsive } from '@/hooks/use-responsive';

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

/**
 * Скільки записів показувати на головному екрані до «показати всі».
 *
 * Три — щоб екран лишався оглядовим: він відповідає на питання «що зараз
 * важливо», а не замінює екран завдань.
 */
const TODAY_PREVIEW_LIMIT = 3;

/**
 * Обгортка секції дашборду.
 *
 * Оголошена на рівні модуля, а не всередині екрана: локальна стрілка дає
 * новий тип компонента при кожному рендері, і React перемонтовує всі
 * вісім секцій — разом з їхніми анімаціями появи.
 *
 * На широкому екрані секції лягають у дві колонки. Дашборд із восьми
 * карток в одну колонку на планшеті — це смуга контенту посеред
 * порожнечі, а прокрутка вдвічі довша за потрібну.
 */
function Section({ index, wide, motion, children }: {
  index: number;
  wide: boolean;
  motion: ReturnType<typeof useMotion>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      style={wide ? { width: '48.5%' } : undefined}
      entering={motion.entering(FadeInDown.duration(250).delay(index * 50))}>
      {children}
    </Animated.View>
  );
}

export default function TodayScreen() {
  const tabBarInset = useTabBarInset();
  const { isWide } = useResponsive();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const motion = useMotion();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('today');

  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [txs,      setTxs]      = useState<Transaction[]>([]);
  // Рахунки потрібні лише як довідник валют: у нових операцій валюта живе на
  // рахунку, а поле currency лишилося тільки в записах, створених до рахунків.
  const [accounts, setAccounts] = useState<Account[]>([]);
  // Валюта зведення. До цього екран рахував лише UAH і підписував «₴»:
  // у користувача з іншою валютою фінанси мовчки зникали зі зведення.
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [primaryCode, setPrimaryCode] = useState('UAH');
  const [time,     setTime]     = useState<TimeEntry[]>([]);
  const [health,   setHealth]   = useState<HealthEntry[]>([]);
  const [profile,  setProfile]  = useState<HealthProfile | null>(null);
  const [meetings, setMeetings] = useState<TodayMeeting[]>([]);
  const [habits,   setHabits]   = useState<Habit[]>([]);
  const [statusColumns, setStatusColumns] = useState<TaskStatusColumn[]>([]);
  const [notesCount, setNotesCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const firstLoadDone = useRef(false);

  const load = useCallback(async () => {
    const [t, cols, x, tm, h, p, m, hb, notes, curs, primary, accs] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Transaction[]>('transactions', []),
      loadData<TimeEntry[]>('time_entries', []),
      loadData<HealthEntry[]>('health_entries_v2', []),
      loadData<HealthProfile | null>('health_profile', null),
      loadData<TodayMeeting[]>('meetings', []),
      loadData<Habit[]>('health_habits', []),
      loadData<{ updatedAt?: string; createdAt?: string }[]>('notes', []),
      loadData<Currency[]>('finance_currencies', []),
      loadData<string>('finance_primary_currency', 'UAH'),
      loadData<Account[]>('accounts', []),
    ]);
    setTasks(t); setStatusColumns(cols); setTxs(x); setTime(tm); setHealth(h); setProfile(p);
    setMeetings(m); setHabits(hb);
    setNotesCount(Array.isArray(notes) ? notes.length : 0);
    setCurrencies(Array.isArray(curs) ? curs : []);
    setPrimaryCode(typeof primary === 'string' && primary ? primary : 'UAH');
    setAccounts(Array.isArray(accs) ? accs : []);
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

  /**
   * Незавершені завдання на сьогодні — прострочені та з дедлайном сьогодні,
   * за спаданням пріоритету.
   *
   * Обчислюється тут, а не всередині TodayTaskRow: екрану потрібна не лише
   * перша трійка, а й загальна кількість — щоб знати, чи показувати «показати
   * всі», і що написати на кнопці статистики.
   */
  const columns = useMemo(() => mergeTaskStatusColumns(statusColumns), [statusColumns]);

  const todayGroups = useMemo(
    () => groupTodayTasks(tasks, columns, today, TODAY_PREVIEW_LIMIT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, columns],
  );

  // Health
  const goals = useMemo(() => {
    const weights = health.filter(e => e.type === 'weight');
    const lw = weights.length ? weights[0].value : null;
    return computeGoals(profile, lw ?? FALLBACK_WEIGHT);
  }, [health, profile]);
  const calNet = calcNetCalories(
    sumForDay(health, 'calories', today),
    sumForDay(health, 'calories_out', today),
  );
  const steps  = sumForDay(health, 'steps', today);
  const water  = sumForDay(health, 'water', today);
  const sleep  = lastForDay(health, 'sleep', today);

  // Finance (UAH)
  const primaryCurrency = useMemo<Currency>(
    () => [...BUILTIN_CURRENCIES, ...currencies].find(cur => cur.code === primaryCode)
       ?? BUILTIN_CURRENCIES[0],
    [currencies, primaryCode],
  );

  /**
   * Зведення дня рахує лише оборот основної валюти. Перекази сюди не
   * потрапляють: `calcTotals` бере тільки 'income' і 'expense', тож переїзд
   * грошей між своїми рахунками не роздуває ні дохід, ні витрату місяця.
   */
  const fin = useMemo(() => {
    const month = filterByMonth(
      txs.filter(t => resolveTxCurrency(t, accounts) === primaryCode),
      today,
    );
    return calcTotals(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txs, accounts, primaryCode]);

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


  const openTaskDetails = useCallback((id: string) => {
    router.push({ pathname: '/', params: { open: id } });
  }, [router]);

  // ─── Formatters ────────────────────────────────────────────────────────────

  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtTime = useCallback((sec: number) => formatDuration(sec, durationUnits), [durationUnits]);
  const fmtMoney = useCallback(
    (n: number) => formatCurrency(n, primaryCurrency, locale),
    [primaryCurrency, locale],
  );


  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1 }}>
        {/* Header */}
        <ScreenHeader
          title={dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
          color={c.text}
          titleStyle={s.title}
          eyebrow={<Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>{greet}</Text>}
          actions={<SyncBadge />}
        />

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarInset + 24 }}
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

          {loaded && (
          <View style={isWide ? s.grid : undefined}>

          {/* 1. Завдання на сьогодні */}
          <Section index={0} wide={isWide} motion={motion}>
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
              {/* Групи за статусом. «У процесі» йде першою і не обрізається:
                  на екрані дня спершу те, що робиться просто зараз. Заголовок
                  групи показуємо лише коли груп справді кілька — над єдиним
                  списком він був би шумом. */}
              {todayGroups.groups.map(group => (
                <View key={group.id}>
                  {todayGroups.groups.length > 1 && (
                    <View style={s.groupRow}>
                      <View style={[s.groupDot, { backgroundColor: group.color }]} />
                      <Text style={[s.groupName, { color: c.sub }]}>{group.name}</Text>
                      <Text style={[s.groupCount, { color: c.sub }]}>{group.tasks.length}</Text>
                    </View>
                  )}
                  <TodayTaskRow
                    tasks={group.tasks}
                    isDark={isDark}
                    c={c}
                    tr={tr}
                    onToggle={handleToggleTask}
                    onOpen={openTaskDetails}
                  />
                </View>
              ))}
              {todayGroups.hidden > 0 && (
                <ShowAllRow
                  label={tr.showAllCount.replace('{count}', String(todayGroups.total))}
                  color={ACCENT_TASK}
                  c={c}
                  onPress={() => router.push('/')}
                />
              )}
              {todayGroups.total === 0 && (
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 2 }}>{tr.noTasksToday}</Text>
              )}
            </View>
          </Section>

          {/* 2. Зустрічі сьогодні */}
          {todayMeetings.length > 0 && (
            <Section index={1} wide={isWide} motion={motion}>
              <View style={{ marginBottom: 12 }}>
                <Text style={[s.sectionTitle, { color: c.sub, marginBottom: 6 }]}>{tr.todayMeetings}</Text>
                {todayMeetings.slice(0, TODAY_PREVIEW_LIMIT).map(m => (
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
                {todayMeetings.length > TODAY_PREVIEW_LIMIT && (
                  <ShowAllRow
                    label={tr.showAllCount.replace('{count}', String(todayMeetings.length))}
                    color="#6366F1"
                    c={c}
                    onPress={() => router.push('/meetings')}
                  />
                )}
              </View>
            </Section>
          )}

          {/* 3. Здоровʼя — hero-стрічка кілець */}
          <Section index={2} wide={isWide} motion={motion}>
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

          {/* 4. Швидкі дії */}
          <Section index={3} wide={isWide} motion={motion}>
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

          {/* 5. Звички */}
          {habits.length > 0 && (
            <Section index={4} wide={isWide} motion={motion}>
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

          {/* 6. Фінанси + Час — сітка 2 колонки */}
          <Section index={5} wide={isWide} motion={motion}>
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

          {/* 7. Спільне */}
          <Section index={6} wide={isWide} motion={motion}>
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

          {/* 8. Швидкі переходи з лічильниками за сьогодні */}
          <Section index={7} wide={isWide} motion={motion}>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <NavStat
                icon="calendar"
                count={todayMeetings.length}
                label={tr.meetings}
                color="#6366F1"
                c={c}
                isDark={isDark}
                onPress={() => router.push('/meetings')}
              />
              <NavStat
                icon="checklist"
                count={todayGroups.total}
                label={tr.tabTasks}
                color={ACCENT_TASK}
                c={c}
                isDark={isDark}
                onPress={() => router.push('/')}
              />
              <NavStat
                icon="note.text"
                count={notesCount}
                label={tr.notes}
                color="#F59E0B"
                c={c}
                isDark={isDark}
                onPress={() => router.push('/notes')}
              />
            </View>
          </Section>

          </View>
          )}

        </ScrollView>
      </View>
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
  // Дві колонки з рівним проміжком. alignItems: 'flex-start' — щоб картка
  // не розтягувалася до висоти сусідки й не лишала порожнечі всередині.
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', columnGap: 12 },
  // lineHeight явний: ScreenHeader задає 38 під свої 32pt, і без переозначення
  // 26-й кегль тягнув би за собою чужий міжрядковий інтервал.
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, lineHeight: 32, marginTop: 2 },
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
  groupRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4 },
  groupDot:   { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  groupName:  { flex: 1, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  groupCount: { fontSize: 11, fontWeight: '700', opacity: 0.7 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  navStat: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    overflow: 'hidden',
    minHeight: 88,
    justifyContent: 'center',
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

/** Рядок «показати всі» під скороченим списком. */
function ShowAllRow({ label, color, c, onPress }: {
  label: string;
  color: string;
  c: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        marginTop: 2,
      }}>
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <IconSymbol name="chevron.right" size={12} color={color} />
    </TouchableOpacity>
  );
}

/**
 * Плитка-перехід із лічильником за сьогодні.
 *
 * Цифра і підпис разом: «3» саме по собі не каже, чого саме три, а сама лише
 * назва не дає причини натиснути.
 */
function NavStat({ icon, count, label, color, c, isDark, onPress }: {
  icon: string;
  count: number;
  label: string;
  color: string;
  c: any;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${count}`}
      style={{ flex: 1 }}>
      <BlurView
        intensity={isDark ? 22 : 42}
        tint={isDark ? 'dark' : 'light'}
        style={[s.navStat, { borderColor: c.border }]}>
        <IconSymbol name={icon as any} size={16} color={color} />
        <Text style={{ color: c.text, fontSize: 19, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] }}>
          {count}
        </Text>
        <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 1 }}>
          {label}
        </Text>
      </BlurView>
    </PressableScale>
  );
}
