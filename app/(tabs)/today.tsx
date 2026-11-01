import { Atlas } from '@/constants/atlas';
import { AdSlot, SponsorPause, advertisingActivity } from '@/components/advertising/Advertising';
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
import { ContainerSearchPanel } from '@/components/containers/ContainerSearchPanel';
import { UpcomingPaymentsCard, useUpcomingPayments } from '@/components/finance/UpcomingPaymentsCard';
import { MeetingProjectChip } from '@/components/meetings/MeetingProjectChip';
import { useInPlaceProjectTask } from '@/components/projects/ProjectTaskSheet';
import { RingCell } from '@/components/health/RingCell';
import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';
import { ZoneSkeleton } from '@/components/layout-zones/ZoneStates';
import { SyncBadge } from '@/components/today/SyncBadge';
import { QuickActions } from '@/components/today/QuickActions';
import { TodayTaskRow } from '@/components/today/TodayTaskRow';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useMotion } from '@/hooks/use-motion';
import { useScreenView } from '@/hooks/use-screen-view';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useToday } from '@/hooks/use-today';
import { useAuth } from '@/store/auth';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { MODULE_SETTINGS_ROUTE, type ModuleId } from '@/constants/nav';
import { areModulesEnabled, isModuleEnabled, useUiModules } from '@/store/ui-preferences';
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
import { FALLBACK_WEIGHT, HealthEntry, HealthProfile, calcCalorieDay, computeGoals, lastForDay, sumForDay } from '@/utils/healthUtils';
import { Habit, habitDoneToday, habitStreak } from '@/utils/preventionUtils';
import { Task, isMyTask, isOverdue } from '@/utils/taskUtils';
import { haptic } from '@/utils/haptics';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { formatDuration } from '@/utils/durationFormat';
import { BUILTIN_CURRENCIES, formatCurrency, type Currency } from '@/utils/financeUtils';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { Layout } from '@/constants/tokens';
import { TODAY_SECTION_GAP, TodaySectionGrid, type TodaySectionEntry } from '@/components/today/TodaySectionGrid';
import { orderTodaySections } from '@/components/today/sectionOrder';
import { masonryColumnCount } from '@/utils/masonry';
import { fontFamily, radius, type, type GlassAccent } from '@/constants/theme';
import {
  BentoArrowButton, BentoCard, KpiCounter, MeshBackground, SegmentedProgress, useBentoColors,
} from '@/components/ds';
import { useDS } from '@/hooks/use-ds';

// ─── Local types ──────────────────────────────────────────────────────────────

interface TimeEntry { id: string; duration: number; date: string; }

interface TodayProject {
  id: string;
  name: string;
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// DS v2.1: акценти розділів — glass.moduleAccent: здоров'я/звички — coral,
// фінанси — lime, час — amber, завдання — lavender, зустрічі — info.
// Один акцент на картку (крапка заголовка / icon-chip / змивка KPI).
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
 * На широкому екрані секції розкладає TodaySectionGrid (2–3 незалежні
 * masonry-колонки; кожна секція — у найкоротшу, тож порядок за верхнім
 * краєм карток лишається правилом власника). Дашборд із восьми карток в одну колонку на планшеті — це смуга
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
  // Стеля Layout.wideMaxWidth: на 13" iPad у ландшафті дашборд інакше
  // розтягувався на ~1130pt, і три колонки ставали надто широкими для
  // коротких карток. Колонки рахуємо від уже обмеженої ширини (пороги
  // masonryColumnCount задані для ширини екрана, поля в них уже враховано).
  const { sizeClass } = useResponsive();
  const gutter = Layout.gutter[sizeClass];
  const columnCount = masonryColumnCount(Math.min(useScreenWidth(), Layout.wideMaxWidth));
  // DS v2: canvas + білі картки без рамок і блюру; KPI — тонкі великі цифри.
  const { t, isDark } = useDSTheme();
  const { g } = useDS();
  // Задача ПРОЄКТУ — карткою проєкту тут же, а не в особистому редакторі.
  const { openProjectTask, projectTaskSheet } = useInPlaceProjectTask(isDark);
  const router = useRouter();
  const { tr, lang } = useI18n();
  const { user } = useAuth();
  const motion = useMotion();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('today');
  /**
   * Вимкнені модулі — з того самого синхронізованого 'ui_preferences', що й
   * сайдбар із панеллю табів (`app/(tabs)/_layout.tsx`): вимкнули розділ тут
   * або у вебі — його немає й на дашборді.
   *
   * Дашборд — другий вхід у кожен модуль, і без цього фільтра він лишався б
   * єдиним видимим: пункт меню зникав, а плитка «Фінанси» на «Сьогодні» далі
   * вела в розділ, якого у користувача, за його ж вибором, немає.
   *
   * `ready` навмисно не чекаємо: доки сховище не прочитане, `disabledModules`
   * порожній, тобто видно все. Показати секцію й прибрати її наступним кадром
   * гірше, ніж показати на кадр пізніше — а кеш на процес (див. хук) лишає це
   * блимання щонайбільше на перший запуск застосунку.
   */
  const { disabledModules } = useUiModules();
  const moduleOn = (...modules: ModuleId[]) => areModulesEnabled(disabledModules, modules);
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
  const dateStr = today.toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // Tasks
  const activeCount  = tasks.filter(t => t.status === 'active').length;

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
  // Той самий набір, що й секція «Прострочені» на «Завданнях»: лише МОЇ
  // задачі (§3.7, isMyTask — без беклогу й чужих задач проєктів). Раніше Home
  // рахував усі сирі задачі й казав «3 прострочено», а Завдання — 2 (P2
  // аудиту 2026-10).
  const overdueCount = tasks.filter(task =>
    isOverdue(task) && (user?.id === undefined || isMyTask(task, user.id, projectRoles)),
  ).length;
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
  // Дашборд показує лише кільце калорій, а кільце міряє З'ЇДЕНЕ проти ліміту
  // їжі — спалене на нього не впливає, тому тут свідомо 0. День без жодного
  // запису їжі мусить давати порожнє кільце, навіть якщо спалено 500 кк.
  // Якщо на дашборді колись зʼявиться «залишок», знадобиться колекція
  // workouts і burnedForDay замість цього нуля.
  const calDay = calcCalorieDay(goals.calories, sumForDay(health, 'calories', today), 0);
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

  const habitsDone = habits.filter(h => habitDoneToday(h)).length;

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
    const task = tasks.find(t => t.id === id);
    if (task && openProjectTask(task)) return;
    router.push({ pathname: '/', params: { open: id } });
  }, [router, tasks, openProjectTask]);

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

  // У кількох колонках секції без власної анімації появи: раніше masonry
  // переносив секцію в іншу колонку (перемонтування) просто під час
  // вступної анімації, і на Fabric Reanimated лишав «привида» старої копії
  // поверх сусідньої картки. Masonry знову може перенести секцію (коли
  // висота суттєво змінилась), тож на планшеті анімацію появи вимкнено —
  // і для секцій, і для рядків завдань усередині.
  const animateIntro = !introDone && columnCount === 1;

  let sections: TodaySectionEntry[] = [];

  // Omni (DS v2.2): секції — суцільні bento-картки (BentoCard) з шапкою
  // «icon-chip + назва» і ↗ праворуч; акцент модуля — на icon-chip.
  // Порядок, ключі й сітка (TodaySectionGrid) — без змін.

  // 1. Здоровʼя (hero-стрічка кілець) + швидкі дії — одна секція: за
  // правилом власника вони йдуть парою одразу після пошуку речей, і на
  // планшеті не мають розходитись по різних клітинках сітки.
  //
  // Швидкі дії: ряд з чотирьох плиток веде в чотири різні модулі (завдання,
  // фінанси, здоров'я, час), а `QuickActions` приймає рівно чотири
  // обов'язкові дії — відфільтрувати ОДНУ плитку звідси неможливо. Тому ряд
  // зникає лише тоді, коли вимкнено всі чотири. Плитка вимкненого модуля
  // веде на заглушку «Ви вимкнули цю функцію» (app/(tabs)/_layout.tsx).
  const showHealthCard = moduleOn('health');
  const showQuickActions = moduleOn('tasks') || moduleOn('finance') || moduleOn('health') || moduleOn('time');
  if (showHealthCard || showQuickActions) sections.push({
    key: 'health-quick',
    node: (
      <Section index={0} animate={animateIntro} motion={motion}>
        <View style={{ gap: TODAY_SECTION_GAP }}>
        {showHealthCard && (
          <BentoCard
            compact
            title={tr.tabHealth}
            icon="heart.fill"
            accent="coral"
            headerRight={<BentoArrowButton />}
            onPress={() => router.push('/health')}
            accessibilityLabel={tr.tabHealth}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <RingCell pct={calDay.pct} color={ACCENT_CAL} label={tr.calories} value={`${calDay.consumed}кк`} />
              <RingCell pct={steps / goals.steps} color={ACCENT_STEPS} label={tr.steps} value={steps >= 1000 ? `${(steps / 1000).toFixed(1)}т` : `${steps}`} />
              <RingCell pct={water / goals.water} color={ACCENT} label={tr.water} value={water >= 1000 ? `${(water / 1000).toFixed(1)}л` : `${water}мл`} />
              <RingCell pct={sleep ? sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep} value={sleep ? fmtSleep(sleep) : '—'} />
            </View>
          </BentoCard>
        )}
        {showQuickActions && (
          <QuickActions
            isDark={isDark}
            c={c}
            tr={tr}
            onAddTask={() => router.push({ pathname: '/', params: { create: '1' } })}
            onAddExpense={() => router.push({ pathname: '/explore', params: { create: '1' } })}
            onAddWater={handleAddWater}
            onTimer={() => router.push('/time')}
          />
        )}
        </View>
      </Section>
    ),
  });

  // 2. Фінанси (+ плитка Часу поруч) — ряд з 2 плиток
  //
  // Плитки з РІЗНИХ модулів, тож фільтруються поокремо: кожна має flex:1,
  // тому та, що лишилась сама, просто займає весь ряд. Ряд без жодної
  // плитки не додається взагалі — інакше лишився б порожній відступ.
  const showFinanceTile = moduleOn('finance');
  const showTimeTile = moduleOn('time');
  if (showFinanceTile || showTimeTile) sections.push({
    key: 'finance',
    node: (
      <Section index={1} animate={animateIntro} motion={motion}>
        <View style={{ flexDirection: 'row', gap: TODAY_SECTION_GAP }}>
          {showFinanceTile && (
          <StatTile
            icon="banknote" accent="lime"
            title={tr.tabFinance}
            onPress={() => router.push('/explore')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text numberOfLines={1} style={{ color: t.text.secondary, fontSize: 12, fontFamily: fontFamily.regular, flexShrink: 1 }}>
                {hasPrimaryAccounts ? tr.totalOnAccounts : tr.monthNet}
              </Text>
              {overview.unassigned.count > 0 && (
                <View
                  accessible
                  accessibilityLabel={tr.unassignedTxWarning.replace('{n}', String(overview.unassigned.count))}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={12} color={t.status.warning} />
                </View>
              )}
            </View>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ ...type.displaySm, fontSize: 32, lineHeight: 36, letterSpacing: -0.32, color: headlineValue >= 0 ? t.text.primary : t.status.danger, marginTop: 6 }}>
              {fmtMoney(headlineValue)}
            </Text>
            {hasPrimaryAccounts && (
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: t.text.secondary, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'], marginTop: 4 }}>
                {tr.monthNet}: {overview.month.net > 0 ? '+' : ''}{fmtMoney(overview.month.net)}
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, marginTop: 8 }}>
              <Text style={{ color: g.accent.success.ink, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>↑ {fmtMoney(overview.month.income)}</Text>
              <Text style={{ color: t.status.danger, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>↓ {fmtMoney(overview.month.expense)}</Text>
            </View>
          </StatTile>
          )}
          {showTimeTile && (
          <StatTile
            icon="timer" accent="amber"
            title={tr.quickTimer}
            onPress={() => router.push('/time')}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ ...type.displaySm, fontSize: 32, lineHeight: 36, letterSpacing: -0.32, color: t.text.primary }}>
              {fmtTime(trackedSec)}
            </Text>
            <Text style={{ color: t.text.secondary, fontSize: 12, marginTop: 2 }}>{tr.todayTracked}</Text>
          </StatTile>
          )}
        </View>
      </Section>
    ),
  });

  // 3. Звички — це модуль «Профілактика» всередині «Здоров'я»: на вебі це
  // окремі перемикачі, тож вимкнення будь-якого з двох прибирає секцію.
  if (moduleOn('health', 'prevention') && habits.length > 0) {
    sections.push({
      key: 'habits',
      node: (
        <Section index={2} animate={animateIntro} motion={motion}>
          <BentoCard compact title={tr.todayHabits} icon="flame.fill" accent="coral">
            {/* Omni: сегментний прогрес дня — скільки звичок уже відмічено. */}
            <SegmentedProgress
              value={habitsDone / habits.length}
              label={`${habitsDone}/${habits.length}`}
              showValue
              accessibilityLabel={`${tr.todayHabits}: ${habitsDone}/${habits.length}`}
              style={{ marginBottom: 14 }}
            />
            <View style={{ gap: 8 }}>
            {habits.map(h => {
              const done   = habitDoneToday(h);
              const streak = habitStreak(h);
              return (
                <PressableScale
                  key={h.id}
                  onPress={() => handleToggleHabit(h.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={h.title}>
                  <View
                    style={[s.habitRow, { backgroundColor: t.surface.subtle }]}>
                    <AnimatedCheck
                      checked={done}
                      size={20}
                      color={h.color || ACCENT}
                      borderColor={c.sub}
                    />
                    <Text style={[s.habitTitle, { color: c.text }, done && { textDecorationLine: 'line-through', color: t.text.secondary }]} numberOfLines={1}>{h.title}</Text>
                    {streak > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <IconSymbol name="flame.fill" size={12} color={g.accent.coral.ink} />
                        <Text style={[s.streakBadge, { color: g.accent.coral.ink }]}>{streak}</Text>
                      </View>
                    )}
                  </View>
                </PressableScale>
              );
            })}
            </View>
          </BentoCard>
        </Section>
      ),
    });
  }

  // 4. Завдання на сьогодні
  if (moduleOn('tasks')) sections.push({
    key: 'tasks',
    node: (
      <Section index={3} animate={animateIntro} motion={motion}>
        <BentoCard
          compact
          title={tr.todayTasks}
          icon="checklist"
          accent="lavender"
          headerRight={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {/* Дві pill зі словами з'їдали заголовок картки до «Завдан…»
                  (телефон і пів-колонка планшета) — лишаємо числа, слова
                  йдуть у VoiceOver; повні підписи вже є в KPI шапки. */}
              {overdueCount > 0 && (
                <View
                  accessible
                  accessibilityLabel={`${overdueCount} ${tr.todayOverdue}`}
                  style={[s.badge, { backgroundColor: g.accent.coral.tint, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={12} color={g.accent.coral.ink} />
                  <Text style={{ color: g.accent.coral.ink, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
                    {overdueCount}
                  </Text>
                </View>
              )}
              <View
                accessible
                accessibilityLabel={`${activeCount} ${tr.todayActive}`}
                style={[s.badge, { backgroundColor: g.accent.lavender.tint }]}>
                <Text style={{ color: g.accent.lavender.ink, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
                  {activeCount}
                </Text>
              </View>
            </View>
          }>
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
                animate={columnCount === 1}
              />
            </View>
          ))}
          {todayGroups.hidden > 0 && (
            <ShowAllRow
              label={tr.showAllCount.replace('{count}', String(todayGroups.total))}
              color={t.text.primary}
              c={c}
              onPress={() => router.push('/')}
            />
          )}
          {todayGroups.total === 0 && (
            <Text style={{ color: t.text.secondary, fontSize: 13, marginTop: 2 }}>{tr.noTasksToday}</Text>
          )}
        </BentoCard>
      </Section>
    ),
  });

  // 5. Зустрічі сьогодні — Omni: ЄДИНА «темна» виділена картка екрана.
  // Найближча (поточна/майбутня) зустріч — крупно, решта — рядками; біла
  // pill унизу веде в календар (як і колишнє «Показати всі»).
  if (moduleOn('meetings') && todayMeetings.length > 0) {
    sections.push({
      key: 'meetings',
      node: (
        <Section index={4} animate={animateIntro} motion={motion}>
          <BentoCard compact variant="dark" title={tr.todayMeetings} icon="calendar" accent="info">
            <TodayMeetingsList
              items={todayMeetings.slice(0, TODAY_PREVIEW_LIMIT)}
              projects={projects}
              onOpen={openMeeting}
            />
            <MeetingsCta
              label={todayMeetings.length > TODAY_PREVIEW_LIMIT
                ? tr.showAllCount.replace('{count}', String(todayMeetings.length))
                : tr.todayPaneOpenCalendar}
              onPress={() => router.push('/calendar' as never)}
            />
          </BentoCard>
        </Section>
      ),
    });
  }

  // 6. Найближчі оплати / прострочені підписки
  if (moduleOn('subscriptions') && upcomingPayments.items.length > 0) {
    sections.push({
      key: 'payments',
      node: (
        <Section index={5} animate={animateIntro} motion={motion}>
          {/* Власний marginBottom картки (потрібний на «Фінансах») тут гасимо:
              відступ між секціями дає сітка. */}
          <UpcomingPaymentsCard data={upcomingPayments} isDark={isDark} c={c} tr={tr} lang={lang} style={{ marginBottom: 0 }} />
        </Section>
      ),
    });
  }

  // Порядок секцій — ПРАВИЛО ВЛАСНИКА (CLAUDE.md → «Правила екранів»):
  // пошук речей → здоров'я + швидкі кнопки → фінанси → звички → завдання →
  // зустрічі → оплати. Змінювати лише з дозволу власника. Джерело правди —
  // TODAY_SECTION_ORDER (components/today/sectionOrder.ts); push'і вище
  // йдуть у тому самому порядку, а orderTodaySections нижче — страховка.
  // Порядок ОДИН для телефона і планшета: на телефоні — одна колонка в
  // цьому порядку, на планшеті TodaySectionGrid кладе секції по черзі в
  // найкоротшу masonry-колонку (здоров'я — завжди перша зліва вгорі).
  // Вимкнений модуль просто не додає секцію — решта не переставляється.

  // Вимкнено геть усе: порожній екран мовчить про причину, тож кажемо її
  // прямо й ведемо туди, де модулі вмикають назад.
  if (sections.length === 0) {
    sections.push({
      key: 'all-modules-off',
      fullWidth: true,
      node: (
        <Section index={0} animate={animateIntro} motion={motion}>
          <PressableScale
            // `as never` — той самий обхід, що й у заглушці вкладки
            // (app/(tabs)/_layout.tsx): типізовані маршрути expo-router не
            // приймають рядкову константу, лише літерал.
            onPress={() => router.push(MODULE_SETTINGS_ROUTE as never)}
            accessibilityRole="button"
            accessibilityLabel={tr.modulesOpenSettings}>
            <View
              style={[s.card, { gap: 6, backgroundColor: t.surface.card }]}>
              <Text style={{ color: t.text.primary, fontSize: 16, fontFamily: fontFamily.semibold }}>
                {tr.modulesDashboardEmptyTitle}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, lineHeight: 18 }}>
                {tr.modulesDashboardEmptyBody}
              </Text>
              <Text style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>
                {tr.modulesOpenSettings}
              </Text>
            </View>
          </PressableScale>
        </Section>
      ),
    });
  }

  sections = orderTodaySections(sections);

  // ─── KPI дня (Omni: великі тонкі числа в шапці) ─────────────────────────────
  // Лише реальні дані й лише ввімкнених модулів; до першого читання — нічого
  // (нуль до завантаження збрехав би). Тап веде в розділ.
  const kpis = loaded && (moduleOn('tasks') || moduleOn('meetings') || moduleOn('time')) ? (
    <>
      {moduleOn('tasks') && (
        <KpiCounter
          value={activeCount}
          label={tr.tabTasks}
          delta={overdueCount > 0 ? `${overdueCount} ${tr.todayOverdue}` : undefined}
          deltaTone="down"
          onPress={() => router.push('/')}
        />
      )}
      {moduleOn('meetings') && (
        <KpiCounter
          value={todayMeetings.length}
          // «Наради», а не «Зустрічі сьогодні»: той самий заголовок має
          // секція нижче, і скрінрідер чув би його двічі поспіль.
          label={tr.navMeetings}
          onPress={() => router.push('/calendar' as never)}
        />
      )}
      {moduleOn('time') && (
        <KpiCounter
          value={fmtTime(trackedSec)}
          label={tr.todayTracked}
          onPress={() => router.push('/time')}
        />
      )}
    </>
  ) : undefined;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1 }} onTouchStart={advertisingActivity}>
      <SponsorPause />
      <MeshBackground />
      <View style={{ flex: 1 }}>
        {/* Header */}
        {/* Omni: глобальна шапка (☰ шухляда · дзвіник · акаунт на телефоні;
            рядок інструментів на планшеті) + KPI-лічильники дня. */}
        <AppHeader
          title={dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}
          titleStyle={s.title}
          // Unslop: замість привітання за часом доби — назва контексту.
          eyebrow={<Text style={{ color: t.text.secondary, fontSize: 13, fontFamily: fontFamily.medium }}>{tr.tabToday}</Text>}
          actions={<SyncBadge />}
          kpis={kpis}
          paddingBottom={14}
        />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: tabBarInset + 24,
            width: '100%',
            maxWidth: Layout.wideMaxWidth,
            alignSelf: 'center',
          }}
          showsVerticalScrollIndicator={false}
          // Тап по результату пошуку речей при відкритій клавіатурі має
          // спрацювати з першого разу, а не лише сховати клавіатуру.
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.text.secondary} />}>

          {/* Пошук речей у контейнерах (containers.md §7.2) — під шапкою.
              Сам ховається, коли модуль вимкнено; обгортка — лише для відступу. */}
          {isModuleEnabled(disabledModules, 'containers') ? (
            <View style={{ marginBottom: TODAY_SECTION_GAP }}>
              <ContainerSearchPanel />
            </View>
          ) : null}

          {/* Skeleton — перше завантаження. Layout System v2.4: «Сьогодні» —
              це статична зона (KPI + зустрічі дня) на телефоні й iPad, де
              вона не вміщається поруч зі списком; скелет — у формі її вмісту. */}
          {!loaded && <ZoneSkeleton variant="static" style={{ marginTop: 4 }} />}

          {loaded && (
            <TodaySectionGrid items={sections} columnCount={columnCount} />
          )}

          {/* Реклама — окремим рядком на всю ширину ПІСЛЯ всіх секцій правила
              (після «оплат»): між «здоров'ям» і «фінансами» вона ламала
              правило власника. Без обгортки й поза сіткою: порожній AdSlot
              повертає null і не лишає ні рядка, ні відступу; власний
              marginVertical у банера є. */}
          {loaded && sections.length > 0 && <AdSlot slot="M1" />}

        </ScrollView>
      </View>
      {projectTaskSheet}
    </View>
  );
}

// ─── StatTile — компактна плитка сітки ────────────────────────────────────────

/** Omni: компактна bento-плитка (icon-chip акценту + назва), уся — кнопка. */
function StatTile({ icon, accent, title, onPress, children }: {
  icon: IconSymbolName;
  /** Акцент модуля плитки — icon-chip. */
  accent: GlassAccent;
  title: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      <BentoCard compact title={title} icon={icon} accent={accent} onPress={onPress} accessibilityLabel={title} style={{ flexGrow: 1 }}>
        {children}
      </BentoCard>
    </View>
  );
}

// ─── Зустрічі на темній картці ────────────────────────────────────────────────

function TodayMeetingsList({ items, projects, onOpen }: {
  items: ReturnType<typeof orderTodayMeetings>;
  projects: TodayProject[];
  onOpen: (m: Meeting) => void;
}) {
  const bc = useBentoColors();
  const { g } = useDS();
  const featuredIdx = Math.max(0, items.findIndex(x => x.phase !== 'past'));
  return (
    <View style={{ gap: 8 }}>
      {items.map(({ meeting: m, phase }, i) => {
        const featured = i === featuredIdx && phase !== 'past';
        return (
          <PressableScale
            key={m.id}
            onPress={() => onOpen(m)}
            accessibilityRole="button"
            accessibilityLabel={`${m.time} ${m.title}`}
            style={{ opacity: phase === 'past' ? 0.6 : 1 }}>
            {featured ? (
              <View style={{ paddingVertical: 4, gap: 4 }}>
                <Text numberOfLines={2} style={[s.meetingFeatured, { color: bc.text }]}>{m.title}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.meetingDot, { backgroundColor: m.color || g.accent.info.fill }]} />
                  <Text style={[s.meetingTime, { color: bc.textSecondary }]}>{m.time}</Text>
                  <MeetingProjectChip project={meetingProject(m, projects)} textColor={bc.textSecondary} maxWidth={140} />
                </View>
              </View>
            ) : (
              <View style={[s.meetingRow, { backgroundColor: bc.nestedBg }]}>
                <View style={[s.meetingDot, { backgroundColor: m.color || g.accent.info.fill }]} />
                <Text style={[s.meetingTime, { color: bc.textSecondary }]}>{m.time}</Text>
                <Text style={[s.meetingTitle, { color: bc.text }]} numberOfLines={1}>{m.title}</Text>
                <MeetingProjectChip project={meetingProject(m, projects)} textColor={bc.textSecondary} maxWidth={110} />
              </View>
            )}
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Omni: біла pill-дія на темній картці («Start Meeting»). */
function MeetingsCta({ label, onPress }: { label: string; onPress: () => void }) {
  const bc = useBentoColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.cta, { backgroundColor: bc.actionBg }]}>
      <IconSymbol name="calendar" size={16} color={bc.actionText} />
      <Text style={{ color: bc.actionText, fontSize: 14, fontFamily: fontFamily.semibold }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // lineHeight явний: ScreenHeader задає 38 під свої 32pt, і без переозначення
  // 26-й кегль тягнув би за собою чужий міжрядковий інтервал.
  title: { fontSize: 28, fontFamily: fontFamily.medium, letterSpacing: -0.28, lineHeight: 34, marginTop: 2 },
  // DS v2: картка 20 радіус, 20 відступ, без рамки.
  card:  { borderRadius: Atlas.radius.xlarge, padding: 20, overflow: 'hidden' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  groupRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 4 },
  groupDot:   { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  groupName:  { flex: 1, fontSize: 12, fontFamily: fontFamily.semibold },
  groupCount: { fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
  meetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Atlas.radius.large,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    overflow: 'hidden',
  },
  meetingTime: { fontSize: 13, fontFamily: fontFamily.medium, minWidth: 40, fontVariant: ['tabular-nums'] },
  meetingFeatured: { fontSize: 20, lineHeight: 26, fontFamily: fontFamily.medium, letterSpacing: -0.2 },
  meetingDot: { width: 8, height: 8, borderRadius: 4 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, borderRadius: radius.pill, marginTop: 14,
  },
  meetingTitle: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
  habitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Atlas.radius.large,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    overflow: 'hidden',
  },
  habitTitle: { flex: 1, fontSize: 14, fontFamily: fontFamily.medium },
  streakBadge: { fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
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
        gap: 4,
        marginTop: 2,
      }}>
      <Text style={{ color, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
      <IconSymbol name="chevron.right" size={12} color={color} />
    </TouchableOpacity>
  );
}
