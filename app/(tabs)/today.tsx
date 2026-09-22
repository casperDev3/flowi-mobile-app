import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import Animated, { FadeInDown } from 'react-native-reanimated';
import { UpcomingPaymentsCard, useUpcomingPayments } from '@/components/finance/UpcomingPaymentsCard';
import { MeetingProjectChip } from '@/components/meetings/MeetingProjectChip';
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
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useToday } from '@/hooks/use-today';
import { useAuth } from '@/store/auth';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { loadData } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';
import { meetingProject, meetingsOnDate, orderTodayMeetings, type Meeting } from '@/utils/meetings';
import { type TaskStatusColumn } from '@/utils/taskStatuses';
import { groupTodayTasks } from '@/utils/todayGroups';
import { updateSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import { Transaction } from '@/utils/financeUtils';
import { financeOverview } from '@/utils/financeOverview';
import { type Account } from '@/utils/accounts';
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
import { useScreenWidth } from '@/hooks/use-responsive';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { masonryColumnCount } from '@/utils/masonry';

// ─── Local types ──────────────────────────────────────────────────────────────

interface TimeEntry { id: string; duration: number; date: string; }

interface TodayProject {
  id: string;
  name: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT_TASK  = '#7C3AED';
const ACCENT_FIN   = '#0EA5E9';
const ACCENT_TIME  = '#6366F1';
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
 * На широкому екрані секції розкладає MasonryColumns (2–3 незалежні
 * колонки). Дашборд із восьми карток в одну колонку на планшеті — це смуга
 * контенту посеред порожнечі, а прокрутка вдвічі довша за потрібну.
 *
 * `animate` — лише під час першої появи екрана: masonry зрідка переносить
 * секцію в іншу колонку (це перемонтування), і повторний FadeInDown тоді
 * виглядав би як мерехтіння.
 */
function Section({ index, animate, motion, children }: {
  index: number;
  animate: boolean;
  motion: ReturnType<typeof useMotion>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={animate ? motion.entering(FadeInDown.duration(250).delay(index * 50)) : undefined}>
      {children}
    </Animated.View>
  );
}

/** Скільки триває вступна анімація секцій (8 × 50мс затримки + 250мс). */
const INTRO_ANIMATION_MS = 800;

export default function TodayScreen() {
  const tabBarInset = useTabBarInset();
  // Колонки дашборду — від ширини самого екрана (вікно мінус сайдбар).
  const columnCount = masonryColumnCount(useScreenWidth());
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const { user } = useAuth();
  const motion = useMotion();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('today');
  // Найближчі й прострочені оплати підписок — окремий блок, власне читання сховища.
  const upcomingPayments = useUpcomingPayments();

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
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<TodayProject[]>([]);
  const [habits,   setHabits]   = useState<Habit[]>([]);
  const [statusColumns, setStatusColumns] = useState<TaskStatusColumn[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const firstLoadDone = useRef(false);

  /**
   * Читання по ключу: і повне завантаження, і точкове перечитування, коли в
   * один ключ записали повз екран (пул синку з вебу, інший екран).
   */
  const loaders = useMemo<Record<string, () => Promise<void>>>(() => ({
    tasks: async () => setTasks(await loadData<Task[]>('tasks', [])),
    task_statuses: async () => setStatusColumns(await loadData<TaskStatusColumn[]>('task_statuses', [])),
    transactions: async () => setTxs(await loadData<Transaction[]>('transactions', [])),
    time_entries: async () => setTime(await loadData<TimeEntry[]>('time_entries', [])),
    health_entries_v2: async () => setHealth(await loadData<HealthEntry[]>('health_entries_v2', [])),
    health_profile: async () => setProfile(await loadData<HealthProfile | null>('health_profile', null)),
    meetings: async () => {
      const m = await loadData<Meeting[]>('meetings', []);
      setMeetings(Array.isArray(m) ? m : []);
    },
    health_habits: async () => setHabits(await loadData<Habit[]>('health_habits', [])),
    finance_currencies: async () => {
      const curs = await loadData<Currency[]>('finance_currencies', []);
      setCurrencies(Array.isArray(curs) ? curs : []);
    },
    finance_primary_currency: async () => {
      const primary = await loadData<string>('finance_primary_currency', 'UAH');
      setPrimaryCode(typeof primary === 'string' && primary ? primary : 'UAH');
    },
    accounts: async () => {
      const accs = await loadData<Account[]>('accounts', []);
      setAccounts(Array.isArray(accs) ? accs : []);
    },
    projects: async () => {
      const prj = await loadData<TodayProject[]>('projects', []);
      setProjects(Array.isArray(prj) ? prj.filter(x => x && typeof x.id === 'string') : []);
    },
  }), []);

  const load = useCallback(async () => {
    await Promise.all(Object.values(loaders).map(loadKey => loadKey()));
  }, [loaders]);

  /**
   * Дані читаються ОДИН раз, далі — лише змінені ключі.
   *
   * Раніше кожен фокус перечитував усі тринадцять ключів (і перераховував
   * увесь дашборд), хоча зазвичай між переходами не змінюється нічого. Тепер
   * кожен запис у сховище (saveData → notifyStorageChanged) приходить сюди
   * підпискою:
   *  - екран у фокусі — перечитуємо саме цей ключ одразу;
   *  - екран у фоні (вкладка лишається змонтованою) — лише позначаємо ключ
   *    брудним, а перечитуємо на наступному фокусі. Фоновий дашборд, який
   *    ніхто не бачить, не рендериться на кожен запис синку.
   */
  const focusedRef = useRef(false);
  const dirtyKeys = useRef(new Set<string>());
  const refreshKeys = useMemo(() => Object.keys(loaders), [loaders]);
  const onKeyChanged = useCallback((key: string) => {
    if (focusedRef.current) return loaders[key]?.();
    dirtyKeys.current.add(key);
  }, [loaders]);
  useStorageRefresh(refreshKeys, onKeyChanged, loaded);

  useFocusEffect(useCallback(() => {
    focusedRef.current = true;
    if (!firstLoadDone.current) {
      firstLoadDone.current = true;
      dirtyKeys.current.clear();
      void load().then(() => setLoaded(true));
    } else if (dirtyKeys.current.size > 0) {
      const keys = [...dirtyKeys.current];
      dirtyKeys.current.clear();
      void Promise.all(keys.map(key => loaders[key]?.()));
    }
    return () => { focusedRef.current = false; };
  }, [load, loaders]));

  // Вступна анімація секцій — лише при першій появі; див. Section.
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => setIntroDone(true), INTRO_ANIMATION_MS);
    return () => clearTimeout(t);
  }, [loaded]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  /**
   * «Сьогодні» для мемоізованих зрізів — СТАБІЛЬНЕ посилання в межах доби
   * (`hooks/use-today.ts`: нове значення лише коли доба справді змінилась,
   * на фокусі екрана й на поверненні з фону).
   *
   * Було `const today = new Date()` на кожен рендер, і тому кожен мемо, що
   * від нього залежить, мусив брехати в deps (локальний `dayKey` замість
   * `today`) під eslint-disable — а від disable React Compiler переставав
   * оптимізувати ВЕСЬ екран (PERF-2). `useToday()` — той самий хук, яким це
   * вже вирішено на екрані Завдань і в «Усі (N)», з тією ж семантикою
   * оновлення, що й колишній `dayKey`.
   */
  const today = useToday();
  // Година — окремо й на кожен рендер: привітання залежить від ЧАСУ доби, а
  // не від дати, і не має застигати на момент, коли доба почалась.
  const hour  = new Date().getHours();
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
  // Сирий (немерджений) `statusColumns`, а не mergeTaskStatusColumns(...) —
  // особистий merge відфільтровує колонки ЧУЖОГО (тобто будь-якого) проєкту,
  // а groupTodayTasks сам звужує колонки до ВЛАСНОГО проєкту кожної задачі
  // (§3.7 «Особисте агрегує»); з попереднім особистим-only списком задача
  // проєкту в «У процесі» завжди показувалась як звичайне «До роботи».
  const projectRoles = useProjectRoles();
  const todayGroups = useMemo(
    () => groupTodayTasks(tasks, statusColumns, today, TODAY_PREVIEW_LIMIT, user?.id, projectRoles),
    [tasks, statusColumns, today, user?.id, projectRoles],
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
   * Цифри плитки — з ТОГО САМОГО джерела, що й екран «Фінанси»
   * (utils/financeOverview.ts). Раніше тут був оборот місяця, підписаний як
   * баланс, а на «Фінансах» — баланс рахунків, і різниця між ними виглядала
   * як помилка. Тепер головна цифра — «На рахунках» (та сама, що на
   * «Фінансах»), а оборот місяця — окремим рядком «Сальдо місяця».
   */
  const overview = useMemo(
    () => financeOverview({ txs, accounts, primary: primaryCode, now: today }),
    [txs, accounts, primaryCode, today],
  );
  const hasPrimaryAccounts = accounts.some(a => !a.archived && (a.currency || 'UAH') === primaryCode);
  const headlineValue = hasPrimaryAccounts ? overview.totalByCurrency[primaryCode] ?? 0 : overview.month.net;

  // Time today
  const trackedSec = time
    .filter(e => isSameDay(new Date(e.date), today))
    .reduce((s, e) => s + (e.duration || 0), 0);

  // Today's meetings — разом із екземплярами повторюваних (як секція на
  // екрані Завдань і веб-дашборд): поточні/майбутні за часом, минулі в кінці.
  const todayMeetings = useMemo(
    () => orderTodayMeetings(meetingsOnDate(meetings, today), today),
    [meetings, today],
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const { stopTimerForTask } = useTimerContext();
  // Contract §4.1: «Сьогодні» агрегує задачі БУДЬ-ЯКОГО проєкту (§3.7) —
  // глядач бачить їх тут так само, як на екрані Завдань, і без цієї
  // перевірки міг відмічати чужі проєктні задачі готовими просто зі списку
  // дня (review finding, той самий гандикап, що й у `(tabs)/index.tsx`).

  const handleToggleTask = useCallback(async (id: string) => {
    if (!canEditProjectItem(tasks.find(t => t.id === id)?.projectId, projectRoles)) return;
    // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
    // ними інакше пішов би на сервер як DELETE.
    let becameDone = false;
    const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => {
      if (t.id !== id) return t;
      becameDone = t.status !== 'done';
      return { ...t, status: t.status === 'done' ? 'active' : 'done' } as Task;
    }));
    setTasks(updated);
    haptic.light();
    // Як на екрані Завдань (pendingTimerStops) і у вебі: «готово» зупиняє
    // таймер задачі — ПІСЛЯ того, як наш запис 'tasks' ліг у сховище, бо стор
    // дописує сесію тим самим read-modify-write. Без таймера — no-op (стор
    // звіряється зі свіжим реєстром і нічого не пише).
    if (becameDone) {
      await stopTimerForTask(id);
      setTasks(await loadData<Task[]>('tasks', []));
    }
  }, [stopTimerForTask, tasks, projectRoles]);

  /** Перегляд зустрічі — на екрані Завдань (там живе MeetingDetail), екземпляр за датою. */
  const openMeeting = useCallback((m: Meeting) => {
    router.push({ pathname: '/', params: { meeting: m._origId ?? m.id, meetingDate: m.date } });
  }, [router]);

  const handleAddWater = useCallback(async () => {
    const newEntry: HealthEntry = {
      id: `${Date.now()}_w`,
      type: 'water',
      value: QUICK_WATER,
      date: new Date().toISOString(),
    };
    const updated = await updateSynced<HealthEntry>('health_entries_v2', current => [newEntry, ...current]);
    setHealth(updated);
    haptic.success();
  }, []);

  const handleToggleHabit = useCallback(async (id: string) => {
    const todayDate = new Date();
    const updated = await updateSynced<Habit>('health_habits', fresh => fresh.map(h => {
      if (h.id !== id) return h;
      const doneToday = h.log.some(l => isSameDay(new Date(l), todayDate));
      if (doneToday) {
        return { ...h, log: h.log.filter(l => !isSameDay(new Date(l), todayDate)) };
      }
      return { ...h, log: [...h.log, new Date().toISOString()] };
    }));
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


  // ─── Секції дашборду ───────────────────────────────────────────────────────

  // У кількох колонках секції без власної анімації появи: MasonryColumns
  // переносить секцію в іншу колонку (перемонтування) просто під час
  // вступної анімації, і на Fabric Reanimated лишав «привида» старої копії
  // поверх сусідньої картки, а нова застрягала невидимою — звідси
  // накладання й порожня діра в колонці. Сітку й так проявляє сам
  // MasonryColumns (opacity після першого виміру).
  const animateIntro = !introDone && columnCount === 1;

  const sections: MasonryEntry[] = [];

  // 1. Завдання на сьогодні
  sections.push({
    key: 'tasks',
    node: (
      <Section index={0} animate={animateIntro} motion={motion}>
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
                projects={projects}
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
    ),
  });

  // 2. Зустрічі сьогодні
  if (todayMeetings.length > 0) {
    sections.push({
      key: 'meetings',
      node: (
        <Section index={1} animate={animateIntro} motion={motion}>
          <View style={{ marginBottom: 12 }}>
            <Text style={[s.sectionTitle, { color: c.sub, marginBottom: 6 }]}>{tr.todayMeetings}</Text>
            {todayMeetings.slice(0, TODAY_PREVIEW_LIMIT).map(({ meeting: m, phase }) => (
              <PressableScale
                key={m.id}
                onPress={() => openMeeting(m)}
                accessibilityRole="button"
                accessibilityLabel={`${m.time} ${m.title}`}
                style={{ marginBottom: 6, opacity: phase === 'past' ? 0.5 : 1 }}>
                <BlurView
                  intensity={isDark ? 18 : 36}
                  tint={isDark ? 'dark' : 'light'}
                  style={[s.meetingRow, { borderColor: c.border }]}>
                  <View style={[s.meetingBar, { backgroundColor: m.color || ACCENT_TASK }]} />
                  <Text style={[s.meetingTime, { color: c.sub }]}>{m.time}</Text>
                  <Text style={[s.meetingTitle, { color: c.text }]} numberOfLines={1}>{m.title}</Text>
                  <MeetingProjectChip project={meetingProject(m, projects)} textColor={c.sub} maxWidth={110} />
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
      ),
    });
  }

  // 2б. Найближчі оплати / прострочені підписки
  if (upcomingPayments.items.length > 0) {
    sections.push({
      key: 'payments',
      node: (
        <Section index={1} animate={animateIntro} motion={motion}>
          <UpcomingPaymentsCard data={upcomingPayments} isDark={isDark} c={c} tr={tr} lang={lang} />
        </Section>
      ),
    });
  }

  // 3. Здоровʼя — hero-стрічка кілець
  sections.push({
    key: 'health',
    node: (
      <Section index={2} animate={animateIntro} motion={motion}>
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
    ),
  });

  // 4. Швидкі дії
  sections.push({
    key: 'quick',
    node: (
      <Section index={3} animate={animateIntro} motion={motion}>
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
    ),
  });

  // 5. Звички
  if (habits.length > 0) {
    sections.push({
      key: 'habits',
      node: (
        <Section index={4} animate={animateIntro} motion={motion}>
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
      ),
    });
  }

  // 6. Фінанси + Час — сітка 2 колонки
  sections.push({
    key: 'stats',
    node: (
      <Section index={5} animate={animateIntro} motion={motion}>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <StatTile
            c={c} isDark={isDark}
            icon="banknote" color={ACCENT_FIN}
            title={tr.tabFinance}
            onPress={() => router.push('/explore')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, fontWeight: '600', flexShrink: 1 }}>
                {hasPrimaryAccounts ? tr.totalOnAccounts : tr.monthNet}
              </Text>
              {overview.unassigned.count > 0 && (
                <View
                  accessible
                  accessibilityLabel={tr.unassignedTxWarning.replace('{n}', String(overview.unassigned.count))}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={11} color="#F59E0B" />
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ color: headlineValue >= 0 ? '#10B981' : '#EF4444', fontSize: 20, fontWeight: '800', marginTop: 2 }}>
              {fmtMoney(headlineValue)}
            </Text>
            {hasPrimaryAccounts && (
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                {tr.monthNet}: {overview.month.net > 0 ? '+' : ''}{fmtMoney(overview.month.net)}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>↑ {fmtMoney(overview.month.income)}</Text>
              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>↓ {fmtMoney(overview.month.expense)}</Text>
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
    ),
  });

  // На телефоні (одна колонка) завдання й оплати стоять під «Фінанси + Час»:
  // верх екрана лишається за оглядом дня — здоров'я, швидкі дії, зведення.
  // («Спільне» плитка тут стояла раніше — прибрана: WORKSPACE_PROJECTS_PLAN.md
  // §4, «Спільне» зливається в проєкти, жорсткий перехід.)
  const orderedSections = columnCount === 1 ? moveAfter(sections, ['tasks', 'payments'], 'stats') : sections;

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
            <MasonryColumns items={orderedSections} columnCount={columnCount} />
          )}

        </ScrollView>
      </View>
    </View>
  );
}

/** Переставляє секції `keys` (у їхньому порядку) одразу за секцію `anchor`. */
function moveAfter(items: MasonryEntry[], keys: string[], anchor: string): MasonryEntry[] {
  const moved = items.filter(item => keys.includes(item.key));
  const rest = items.filter(item => !keys.includes(item.key));
  const at = rest.findIndex(item => item.key === anchor);
  if (at < 0) return items;
  return [...rest.slice(0, at + 1), ...moved, ...rest.slice(at + 1)];
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
