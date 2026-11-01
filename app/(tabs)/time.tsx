import { Atlas } from '@/constants/atlas';
import { fontFamily } from '@/constants/theme';
/**
 * app/(tabs)/time.tsx — єдина сторінка про час.
 *
 * Сюди зведено те, що раніше жило на трьох екранах: сам трекер, «Записи часу»
 * (`app/time-records.tsx`) і «Статистика часу» (`app/time-stats.tsx`). Причина
 * не в економії екранів, а в тому, що вони мали РІЗНІ джерела даних —
 * `time_entries` і `task.timeEntries` — і показували різні підсумки про одне й
 * те саме. Джерело тепер одне, `time_entries`; старі сесії задач переносить у
 * нього `utils/timeMigration.ts`.
 *
 * Порядок блоків задає порядок питань: що йде ЗАРАЗ → скільки вийшло за період
 * → що треба перевірити → самі записи.
 *
 * Аномалії видно не лише в блоці «Перевір N записів», а й у САМОМУ рядку
 * списку (червона смуга — задовга чи через північ, бурштинова — довша за
 * звичне), з «Обрізати до …» одним дотиком. Рядок бере той самий звіт
 * `detectAnomalies`, що й блок, тож вони не розходяться.
 *
 * Компонування за шириною:
 *  • телефон (compact) — одна колонка, як і було (без змін);
 *  • планшет (medium/expanded) — три зони Layout System v2.4, як «Завдання»
 *    (components/layout-zones):
 *      [статична: KPI періоду · таймери · почати таймер · по днях · перевірка
 *       · розподіл] ┃ [головна: історія записів] ┃ [динамічна: запис]
 *    – статична стоїть поруч лише там, де вистачає ширини (ZoneLayout
 *      вирішує сам); інакше ті самі картки — над історією в головній, а KPI —
 *      у шапці;
 *    – тап по запису (і «+») відкриває форму в динамічній зоні праворуч (у
 *      вузькому вікні — нижній аркуш ZoneLayout), ✕ закриває, список
 *      розтягується. Вибраний запис — у параметрі `?entry=` (диплінк),
 *      видимість панелей — вибір пристрою (hooks/use-zone-state.ts).
 *
 * Чого тут навмисно НЕМАЄ:
 *  • вільного секундоміра — таймер стартує лише із задачі або зустрічі, бо
 *    вільний секундомір лишав час, не привʼязаний ні до чого, і його однаково
 *    доводилось потім переписувати руками. «Почати таймер» у правій панелі
 *    широкого екрана — це вибір МОЄЇ задачі, а не секундомір;
 *  • поділу на ранок/день/вечір/ніч — жоден звіт за ним не будувався.
 */

import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import {
  DEFAULT_ZONE_SIZE_KEY, SwipeRow, ZONE_HANDLE_WIDTH, ZoneLayout, useZoneSizes, zoneWidths, type SwipeAction,
} from '@/components/layout-zones';
import { useFinanceLayoutStrings } from '@/components/finance/layoutStrings';
import { HeaderButton } from '@/components/shared/ScreenHeader';
// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { AnomalyPanel, anomalyReasonText } from '@/components/time/AnomalyPanel';
import { TimerProjectTag } from '@/components/time/ActiveTimerRow';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { StartTimerCard } from '@/components/time/StartTimerCard';
import { TimeEntryForm } from '@/components/time/TimeEntryForm';
import { TimeEntrySheet } from '@/components/time/TimeEntrySheet';
import { TimeFilterSheet } from '@/components/time/TimeFilterSheet';
import { TimeProjectBreakdown } from '@/components/time/TimeKpi';
import type { TimerCandidateTask } from '@/components/time/timerCandidates';
import { useTimerProjects } from '@/components/time/useTimerProjects';
import { timeColors } from '@/components/time/TimePalette';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { TimeZoneKpiCard } from '@/components/time/TimeZoneKpiCard';
import { useContentWidth } from '@/hooks/use-content-width';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useScreenView } from '@/hooks/use-screen-view';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useZoneState } from '@/hooks/use-zone-state';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import type { ActiveTimer, TimerProject } from '@/utils/activeTimers';
import { formatClock, formatDuration } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { elapsedSince } from '@/utils/taskTimer';
import { isMyTask } from '@/utils/taskUtils';
import {
  anomalyMap,
  anomalySeverity,
  applyDuration,
  detectAnomalies,
  trimmedSeconds,
  typicalSessionSeconds,
  type RowAnomaly,
} from '@/utils/timeAnomalies';
import {
  averageTaskSeconds,
  filterRecords,
  groupByDay,
  groupByProject,
  projectBreakdown,
  recordProjectId,
  taskProjectMap,
  type TaskProjects,
  sortRecords,
  taskOptions,
  totalSeconds,
  type ProjectLike,
  type TimeGrouping,
  type TimePeriod,
  type TimeRecord,
  type TimeSort,
} from '@/utils/timeEntries';
import type { EditableTask } from '@/utils/timeEntryEdit';
import { migrateTaskSessions, type MigratableTask } from '@/utils/timeMigration';
import {
  BentoCard, BentoPeriodPill, HatchedBars, KpiCounter, MeshBackground, SectionTabs, type HatchedBar,
} from '@/components/ds';
import { dsGlass } from '@/components/shared/dsTheme';

/** Рівно те, що рядок активного таймера показує про підзавдання. */
interface RowSubtask { id: string; title: string; done: boolean }

interface Section {
  key: string;
  title: string;
  seconds: number;
  color: string | null;
  data: TimeRecord[];
}

/**
 * Міграція виконується ОДИН раз на запуск застосунку, а не на кожен фокус
 * екрана: сама вона ідемпотентна, але зайве читання всіх задач при кожному
 * поверненні на вкладку нічого не дає.
 */
let migrationRan = false;

export default function TimeScreen() {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { width, height, isWide } = useResponsive();
  const screenWidth = useScreenWidth();
  /**
   * Планшет — три зони Layout System v2.4. Телефон (compact) сюди не
   * потрапляє ніколи: його розмітка й поведінка лишаються як були.
   */
  const zoneMode = isWide;
  const { user } = useAuth();
  const projectRoles = useProjectRoles();
  // DS v2: canvas, білі картки без рамок, головна дія — action.primary.
  const { t, isDark } = useDSTheme();
  const g = useMemo(() => dsGlass(isDark), [isDark]);
  useScreenView('time');
  const { activeTimers, stopTimer, startTaskTimer, tasksRevision, timeEntriesRevision } = useTimerContext();
  // Мітка проєкту в рядку таймера — та сама, що в панелі над табами й сайдбарі.
  const projectOf = useTimerProjects(activeTimers);
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const lz = useFinanceLayoutStrings();

  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtDur = useCallback((s: number) => formatDuration(s, durationUnits), [durationUnits]);

  const [entries, setEntries] = useState<TimeRecord[]>([]);
  const [projects, setProjects] = useState<ProjectLike[]>([]);
  const [taskProjects, setTaskProjects] = useState<TaskProjects>(() => new Map());
  /** Задачі для вибору у формі запису (id, назва, проєкт). */
  const [taskChoices, setTaskChoices] = useState<EditableTask[]>([]);
  /** Задачі для «Почати таймер» (лише широка панель). */
  const [timerTasks, setTimerTasks] = useState<TimerCandidateTask[]>([]);
  const [timerSubtasks, setTimerSubtasks] = useState<Record<string, RowSubtask[]>>({});
  const [initialized, setInitialized] = useState(false);

  const [period, setPeriod] = useState<TimePeriod>('week');
  const [sort, setSort] = useState<TimeSort>('date-desc');
  const [grouping, setGrouping] = useState<TimeGrouping>('list');
  const [filterProjectId, setFilterProjectId] = useState<string | null>(null);
  const [filterTaskKey, setFilterTaskKey] = useState<string | null>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [fsOpen, setFsOpen] = useState(false);
  const [sheetEntry, setSheetEntry] = useState<TimeRecord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * Динамічна зона планшета: вибраний запис — у `?entry=` (useZoneState),
   * новий запис — локально (порожня форма не має id для диплінка).
   */
  const zone = useZoneState({ section: 'time', selectedParam: 'entry', label: tr.navTimeTracker });
  const zoneSizes = useZoneSizes(DEFAULT_ZONE_SIZE_KEY);
  const [creating, setCreating] = useState(false);
  const panelScrollRef = React.useRef<ScrollView>(null);

  /**
   * «Сьогодні» перераховується, поки екран відкритий.
   *
   * Раніше межа доби бралася з `const today = new Date()` НА РІВНІ МОДУЛЯ:
   * модуль обчислюється один раз за запуск застосунку, тож після півночі
   * фільтр «сьогодні» й підпис «Сьогодні» лишались учорашніми до перезапуску.
   * Тепер дата живе в стані й оновлюється на кожен фокус екрана та на межі доби.
   */
  const [now, setNow] = useState(() => new Date());
  const refreshNow = useCallback(() => setNow(current => {
    const fresh = new Date();
    // Нове значення лише тоді, коли доба справді змінилась: інакше кожен фокус
    // давав би новий обʼєкт і перераховував усі мемоізації екрана ні за що.
    return fresh.toDateString() === current.toDateString() ? current : fresh;
  }), []);

  useEffect(() => {
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    // +1 с, щоб таймер спрацював уже ПІСЛЯ межі, а не рівно на ній.
    const timer = setTimeout(refreshNow, midnight.getTime() - Date.now() + 1000);
    return () => clearTimeout(timer);
  }, [now, refreshNow]);

  const reloadEntries = useCallback(async () => {
    const data = await loadData<TimeRecord[]>('time_entries', []);
    // Ідентичність масиву зберігаємо, коли нічого не змінилось: інакше ефект
    // збереження ганяв би в синк ті самі дані.
    setEntries(prev =>
      prev.length === data.length && prev.every((e, i) => e.id === data[i].id) ? prev : data,
    );
  }, []);

  const reloadProjects = useCallback(async () => {
    try {
      const stored = await loadData<ProjectLike[]>('projects', []);
      setProjects(stored.filter(p => p?.id));
      // 'tasks' читаємо ОДИН раз на подію й виводимо з нього все: проєкти
      // задач, кандидатів таймера і підзавдання для рядків активних таймерів
      // (раніше — окреме читання й парсинг усього списку на кожну ревізію).
      const tasks = await loadData<(Omit<TimerCandidateTask, 'title'> & { title?: string; subtasks?: RowSubtask[] })[]>('tasks', []);
      setTaskProjects(taskProjectMap(tasks));
      const subtaskMap: Record<string, RowSubtask[]> = {};
      for (const task of tasks) {
        if (task?.id && task.subtasks?.length) subtaskMap[task.id] = task.subtasks;
      }
      setTimerSubtasks(subtaskMap);
      const titled = tasks.filter(
        (t): t is TimerCandidateTask => !!t?.id && typeof t.title === 'string' && !!t.title.trim(),
      );
      setTaskChoices(titled.map(t => ({ id: t.id, title: t.title, projectId: t.projectId })));
      setTimerTasks(titled);
    } catch (e) {
      if (__DEV__) console.warn('[time] проєкти не прочитались:', e);
    }
  }, []);

  /**
   * Перше читання — з міграцією сесій задач у `time_entries`.
   *
   * Міграція мусить відпрацювати ДО того, як екран покаже підсумки: інакше
   * людина побачила б суму без перенесених годин, а за мить — стрибок.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await loadData<TimeRecord[]>('time_entries', []);
      let next = stored;
      if (!migrationRan) {
        migrationRan = true;
        try {
          const tasks = await loadData<MigratableTask[]>('tasks', []);
          const result = migrateTaskSessions(tasks, stored);
          if (result.added > 0) {
            next = result.entries;
            await saveSynced('time_entries', next);
            if (__DEV__) console.log(`[time] перенесено сесій задач: ${result.added}`);
          }
        } catch (e) {
          // Провал міграції не має ламати екран: записи з `time_entries`
          // читаються й показуються, а наступний запуск спробує ще раз.
          migrationRan = false;
          if (__DEV__) console.warn('[time] міграція сесій задач не вдалась:', e);
        }
      }
      if (cancelled) return;
      setEntries(next);
      setInitialized(true);
    })();
    // Проєкти й задачі читає useFocusEffect нижче — він спрацьовує і на
    // першому фокусі, тож окремий виклик тут лише дублював читання.
    return () => { cancelled = true; };
  }, []);

  // Стор зупинки таймера дописує завершену сесію в 'time_entries' сам, повз наш
  // стан — лічилка стору єдиний сигнал, що дзеркало сесії дописане.
  useEffect(() => {
    if (timeEntriesRevision > 0) void reloadEntries();
  }, [timeEntriesRevision, reloadEntries]);

  useEffect(() => {
    if (initialized) void saveSynced('time_entries', entries);
  }, [entries, initialized]);

  // Підзавдання для рядків активних таймерів — з того ж читання 'tasks',
  // що й проєкти (reloadProjects).
  // Старт таймера з панелі переносить задачу в «У процесі» — список
  // кандидатів мусить це побачити, а не тримати старий порядок.
  useEffect(() => {
    if (tasksRevision > 0) void reloadProjects();
  }, [tasksRevision, reloadProjects]);

  useFocusEffect(useCallback(() => {
    refreshNow();
    void reloadEntries();
    void reloadProjects();
  }, [refreshNow, reloadEntries, reloadProjects]));

  // ─── Вибірка ────────────────────────────────────────────────────────────────

  const filtered = useMemo(
    () => filterRecords(entries, { period, projectId: filterProjectId, taskKey: filterTaskKey }, now, taskProjects),
    [entries, period, filterProjectId, filterTaskKey, now, taskProjects],
  );
  const sorted = useMemo(() => sortRecords(filtered, sort), [filtered, sort]);

  const periodOnly = useMemo(
    () => filterRecords(entries, { period, projectId: null, taskKey: null }, now),
    [entries, period, now],
  );
  const tasksForFilter = useMemo(
    () => taskOptions(filterProjectId ? periodOnly.filter(e => recordProjectId(e, taskProjects) === filterProjectId) : periodOnly),
    [periodOnly, filterProjectId, taskProjects],
  );
  const projectsForFilter = useMemo(() => {
    const ids = new Set(periodOnly.map(e => recordProjectId(e, taskProjects)).filter(Boolean));
    return projects.filter(p => ids.has(p.id));
  }, [periodOnly, projects, taskProjects]);

  const breakdown = useMemo(
    () => projectBreakdown(filtered, projects, undefined, undefined, taskProjects),
    [filtered, projects, taskProjects],
  );
  const total = useMemo(() => totalSeconds(filtered), [filtered]);
  const average = useMemo(() => averageTaskSeconds(filtered), [filtered]);
  const typical = useMemo(() => typicalSessionSeconds(filtered), [filtered]);

  /**
   * Omni: штриховані стовпці «По днях» — останні 7 днів (сьогодні — праворуч).
   * Не залежить від чипа періоду (інакше «Сьогодні» дало б один стовпець),
   * але поважає фільтр проєкту/задачі — ті самі записи, що й у списку.
   * День — за локальною датою запису (getFullYear/getMonth/getDate).
   */
  const weekBars = useMemo<HatchedBar[]>(() => {
    const scoped = filterRecords(entries, { period: 'all', projectId: filterProjectId, taskKey: filterTaskKey }, now, taskProjects);
    const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const sums = new Map<string, number>();
    for (const e of scoped) {
      const d = new Date(e.date);
      if (Number.isNaN(d.getTime())) continue;
      sums.set(keyOf(d), (sums.get(keyOf(d)) ?? 0) + (e.duration || 0));
    }
    const out: HatchedBar[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const value = sums.get(keyOf(day)) ?? 0;
      out.push({ label: day.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 2), value, display: value > 0 ? fmtDur(value) : '—' });
    }
    return out;
  }, [entries, filterProjectId, filterTaskKey, now, taskProjects, locale, fmtDur]);
  /** Вибраний стовпець (лише підсвітка й підказка; за замовч. — сьогодні). */
  const [barIndex, setBarIndex] = useState(6);

  /**
   * Аномалії шукаємо у ВСІХ записах, а не лише у відфільтрованих: медіана за
   * тижнем на трьох сесіях — не медіана, а випадкове число, і фільтр «сьогодні»
   * щоразу давав би інший список «перевір».
   */
  const anomalies = useMemo(() => detectAnomalies(entries, taskProjects), [entries, taskProjects]);
  const rowAnomalies = useMemo(() => anomalyMap(anomalies), [anomalies]);

  const sections = useMemo<Section[]>(() => {
    if (grouping === 'project') {
      return groupByProject(sorted, projects, undefined, undefined, taskProjects).map(group => ({
        key: group.projectId ?? 'personal',
        title: group.name,
        seconds: group.seconds,
        color: group.color,
        data: group.items,
      }));
    }
    const todayKey = now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toDateString();
    return groupByDay(sorted).map(group => {
      const date = new Date(group.ms);
      const key = date.toDateString();
      const title = key === todayKey ? tr.today
        : key === yesterdayKey ? tr.yesterday
        : date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
      return { key: group.key, title, seconds: group.seconds, color: null, data: group.items };
    });
  }, [grouping, sorted, projects, now, tr.today, tr.yesterday, locale, taskProjects]);

  const c = useMemo(() => timeColors(isDark), [isDark]);
  const projectById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  // ─── Дії над записами ───────────────────────────────────────────────────────

  const upsertEntry = useCallback((entry: TimeRecord) => {
    setEntries(prev => {
      const index = prev.findIndex(e => e.id === entry.id);
      if (index < 0) return [entry, ...prev];
      const next = [...prev];
      next[index] = entry;
      return next;
    });
  }, []);

  const patchEntry = useCallback((id: string, patch: Partial<TimeRecord>) => {
    setEntries(prev => prev.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const deleteEntry = useCallback((entry: TimeRecord) => {
    Alert.alert(tr.deletePermanently, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        // Запис, відкритий у панелі, щойно зник — панель закриває ефект нижче
        // (вибраного запису більше немає серед entries).
        onPress: () => setEntries(prev => prev.filter(e => e.id !== entry.id)),
      },
    ]);
  }, [tr.cancel, tr.cannotUndo, tr.delete, tr.deletePermanently]);

  const selectInZone = zone.select;
  const closeZone = zone.closePanel;
  /** Запис, відкритий у динамічній зоні (лише планшет). */
  const zoneEntry = useMemo(
    () => (zoneMode && zone.selectedId ? entries.find(e => e.id === zone.selectedId) ?? null : null),
    [zoneMode, zone.selectedId, entries],
  );
  const dynamicOpen = zoneMode && (creating || (zone.panelOpen && !!zoneEntry));

  const openEntry = useCallback((entry: TimeRecord | null) => {
    haptic.light();
    if (zoneMode) {
      if (entry) { setCreating(false); selectInZone(entry.id); }
      else { closeZone(); setCreating(true); }
      return;
    }
    setSheetEntry(entry);
    setSheetOpen(true);
  }, [zoneMode, selectInZone, closeZone]);

  const closePanel = useCallback(() => { setCreating(false); closeZone(); }, [closeZone]);

  // Вибраний запис зник (видалили, синк прибрав) — панель закриваємо.
  useEffect(() => {
    if (zoneMode && initialized && zone.selectedId && !zoneEntry) closeZone();
  }, [zoneMode, initialized, zone.selectedId, zoneEntry, closeZone]);

  // Нова правка — з верху панелі: прокрутка, що лишилась від попереднього
  // запису, ховала б заголовок і поле задачі.
  const panelKey = creating ? 'new' : zoneEntry?.id ?? '';
  useEffect(() => {
    if (dynamicOpen) panelScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [panelKey, dynamicOpen]);

  // Split View / Stage Manager звузив вікно до телефонного, поки форма була в
  // зоні: зони більше немає, тож правка переїжджає в аркуш, а не губиться.
  // Лише на ПЕРЕХОДІ планшет → телефон: телефон сам по собі зон не має.
  const wasZoneMode = React.useRef(zoneMode);
  useEffect(() => {
    const was = wasZoneMode.current;
    wasZoneMode.current = zoneMode;
    if (zoneMode || !was || (!creating && !zone.selectedId)) return;
    const pending = zone.selectedId ? entries.find(e => e.id === zone.selectedId) ?? null : null;
    setCreating(false);
    closeZone();
    if (!creating && !pending) return;
    setSheetEntry(pending);
    setSheetOpen(true);
  }, [zoneMode, creating, zone.selectedId, entries, closeZone]);

  // «Почати таймер» — лише МОЇ задачі: трекати чужу задачу проєкту з
  // особистого екрана означало б записати свій час під роботу колеги.
  const myTimerTasks = useMemo(
    () => (user?.id === undefined ? timerTasks : timerTasks.filter(t => isMyTask(t, user.id, projectRoles))),
    [timerTasks, user?.id, projectRoles],
  );
  const runningTaskIds = useMemo(
    () => new Set(activeTimers.map(t => t.taskId).filter((id): id is string => !!id)),
    [activeTimers],
  );
  const startFromPanel = useCallback(async (task: TimerCandidateTask) => {
    haptic.medium();
    try {
      await startTaskTimer({
        id: task.id,
        title: task.title,
        status: task.status,
        kanbanColumnId: task.kanbanColumnId,
        projectId: task.projectId,
      });
    } catch (e) {
      if (__DEV__) console.warn('[time] таймер задачі не стартував:', e);
      Alert.alert(tr.error, tr.timeStartTimerFailed);
    }
  }, [startTaskTimer, tr.error, tr.timeStartTimerFailed]);

  const trimEntry = useCallback((entry: TimeRecord, seconds: number) => {
    haptic.medium();
    patchEntry(entry.id, applyDuration(entry, seconds));
  }, [patchEntry]);

  const markNormal = useCallback((entry: TimeRecord) => {
    haptic.light();
    patchEntry(entry.id, { markedNormal: true });
  }, [patchEntry]);

  const stopActive = useCallback(async (id: string) => {
    haptic.medium();
    await stopTimer(id);
    await reloadEntries();
  }, [reloadEntries, stopTimer]);

  const resetFilters = useCallback(() => {
    setPeriod('week');
    setSort('date-desc');
    setGrouping('list');
    setFilterProjectId(null);
    setFilterTaskKey(null);
  }, []);

  const hasFilters = !!(filterProjectId || filterTaskKey) || period !== 'week' || grouping !== 'list';

  const periodLabels = useMemo<Record<TimePeriod, string>>(() => ({
    today: tr.periodToday,
    week: tr.periodWeek,
    month: tr.periodMonth,
    all: tr.periodAll,
  }), [tr.periodToday, tr.periodWeek, tr.periodMonth, tr.periodAll]);

  const formatEntryDate = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    },
    [locale],
  );

  // ─── Зони планшета ─────────────────────────────────────────────────────────

  const zoneFit = zoneWidths({
    windowWidth: width,
    screenWidth,
    wide: isWide,
    wantStatic: zone.panels.static,
    wantDynamic: dynamicOpen,
    sizes: zoneSizes,
    handles: { static: ZONE_HANDLE_WIDTH, dynamic: ZONE_HANDLE_WIDTH },
  });
  /** Статична зона стоїть поруч: KPI й картки несе вона, а не шапка/головна. */
  const staticBeside = zoneMode && zoneFit.showStatic;
  /**
   * Таймери сіткою в 2 — лише в широкій головній зоні планшета (без статичної
   * поруч і без відкритої панелі). Телефон — одна колонка, як і було.
   */
  const timerColumns = zoneMode && !staticBeside && !dynamicOpen ? 2 : 1;

  // ─── Шматки розмітки, спільні для обох компонувань ─────────────────────────

  const activeTimersBlock = activeTimers.length > 0 ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {activeTimers.map(timer => (
        <View key={timer.id} style={{ width: timerColumns === 2 ? '49%' : '100%' }}>
          <ActiveTimerRow
            timer={timer}
            project={projectOf(timer)}
            tr={tr}
            subtasks={timer.taskId ? timerSubtasks[timer.taskId] : undefined}
            accent={c.indigo}
            border={c.border}
            // Рядок усередині суцільної bento-картки — вкладена підкладка
            // surface.subtle (скляна на білій картці не видна).
            card={t.surface.subtle}
            text={c.text}
            sub={c.sub}
            stopLabel={tr.stopTimerAction}
            onStop={stopActive}
          />
        </View>
      ))}
    </View>
  ) : null;

  const kpiProps = {
    c,
    isDark,
    totalSeconds: total,
    averageTaskSeconds: average,
    typicalSessionSeconds: typical,
    recordCount: filtered.length,
    breakdown,
    formatDuration: fmtDur,
    tr,
  };

  const anomalyBlock = anomalies.length > 0 ? (
    <AnomalyPanel
      reports={anomalies}
      c={c}
      isDark={isDark}
      formatDuration={fmtDur}
      formatDate={formatEntryDate}
      onTrim={trimEntry}
      onEditDuration={openEntry}
      onDelete={deleteEntry}
      onMarkNormal={markNormal}
      tr={tr}
      lang={lang}
    />
  ) : null;

  // Omni: шапка розділу «Історія» — icon-chip + назва, праворуч — період
  // (і «за проєктами») та кількість сесій вибірки.
  const historyTitle = (
    <View style={[s.historyHead, { marginTop: staticBeside ? 8 : 24 }]}>
      <View style={[s.headChip, { backgroundColor: g.accent.amber.tint }]}>
        <IconSymbol name="clock.fill" size={16} color={g.accent.amber.ink} />
      </View>
      <Text style={[s.sectionTitle, { color: c.text, flex: 1 }]} accessibilityRole="header">{tr.history}</Text>
      <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium }}>
        {periodLabels[period]}
        {grouping === 'project' ? tr.timeByProjectSuffix : ''}
        {` · ${filtered.length} ${tr.sessionsCount}`}
      </Text>
    </View>
  );

  const selectedId = dynamicOpen && !creating ? zoneEntry?.id ?? null : null;

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 14 }}>
      {section.color && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: section.color, marginRight: 7 }} />
      )}
      <Text numberOfLines={1} style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{section.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <IconSymbol name="timer" size={11} color={c.sub} />
        <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{fmtDur(section.seconds)}</Text>
      </View>
    </View>
  );

  /** Layout System v2.4: свайп уліво — «Змінити» / «Видалити» без входу в запис. */
  const swipeActionsFor = (entry: TimeRecord): SwipeAction[] => [
    { key: 'edit', label: lz.swipeEdit, icon: 'pencil', tone: 'neutral', onPress: () => openEntry(entry) },
    { key: 'delete', label: lz.swipeDelete, icon: 'trash.fill', tone: 'danger', onPress: () => deleteEntry(entry) },
  ];

  const renderItem = ({ item }: { item: TimeRecord }) => {
    const anomaly: RowAnomaly | undefined = rowAnomalies.get(item.id);
    const severity = anomalySeverity(anomaly?.kinds ?? []);
    const trim = severity ? trimmedSeconds(item) : null;
    return (
      <SwipeRow actions={swipeActionsFor(item)} radius={Atlas.radius.xlarge}>
        {a11y => (
      // Суцільна підкладка: тоноване тло аномалії напівпрозоре, і без неї під
      // ним просвічували б кнопки свайпу.
      <View style={{ backgroundColor: t.surface.card, borderRadius: Atlas.radius.xlarge }}>
      <EntryRow
        {...a11y}
        entry={item}
        selected={selectedId === item.id}
        severity={severity}
        reason={anomaly && severity ? anomalyReasonText(item, anomaly.kinds, anomaly.typicalSeconds, tr, lang, fmtDur) : null}
        trimSeconds={trim}
        trimLabel={trim !== null ? tr.anomalyTrimTo.replace('{duration}', fmtDur(trim)) : null}
        warn={c.warn}
        projectName={projectById.get(recordProjectId(item, taskProjects) ?? '')?.name}
        projectColor={projectById.get(recordProjectId(item, taskProjects) ?? '')?.color}
        accent={c.indigo}
        border={c.border}
        text={c.text}
        sub={c.sub}
        danger={c.danger}
        duration={fmtDur(item.duration)}
        when={formatEntryDate(item.date)}
        tr={tr}
        onPress={openEntry}
        onDelete={deleteEntry}
        onTrim={trimEntry}
      />
      </View>
        )}
      </SwipeRow>
    );
  };

  const emptyList = (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <IconSymbol name="clock.fill" size={40} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontFamily: fontFamily.semibold }}>{tr.noRecords}</Text>
      {hasFilters ? (
        <TouchableOpacity onPress={resetFilters} style={[s.emptyAction, { backgroundColor: t.action.primary }]}>
          <IconSymbol name="xmark" size={12} color={t.text.onAction} />
          <Text style={{ color: t.text.onAction, fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{tr.resetAllFilters}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: c.sub, fontSize: 13, marginTop: 4 }}>
          {tr.timeEmptyHint}
        </Text>
      )}
    </View>
  );

  // Omni: період — вкладки розділу (pill-таби, активна чорна). На широкому
  // поруч — «Ще фільтри» (на телефоні та сама дія стоїть у шапці).
  const periodTabs = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <SectionTabs
        tabs={(Object.keys(periodLabels) as TimePeriod[]).map(key => ({ key, label: periodLabels[key] }))}
        value={period}
        onChange={key => { haptic.light(); setPeriod(key); }}
        accessibilityLabel={tr.history}
        style={{ flex: 1, minWidth: 0 }}
      />
      {zoneMode && (
        <TouchableOpacity
          onPress={() => setShowFilters(true)}
          accessibilityRole="button"
          accessibilityLabel={tr.filtersAndSort}
          style={[s.periodChip, { borderColor: hasFilters ? c.indigo : 'transparent', backgroundColor: t.surface.card, flexDirection: 'row', gap: 6 }]}>
          <IconSymbol name="slider.horizontal.3" size={13} color={hasFilters ? c.indigo : c.sub} />
          <Text style={{ color: hasFilters ? c.indigo : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.timeMoreFilters}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Omni: «По днях» — штриховані стовпці, вибраний день — градієнтом.
  const daysCard = (
    <BentoCard
      compact
      title={tr.byDays}
      icon="chart.bar.fill"
      accent="amber"
      headerRight={<BentoPeriodPill label={tr.days7} />}>
      <HatchedBars
        data={weekBars}
        activeIndex={barIndex}
        onSelect={setBarIndex}
        height={110}
        accessibilityLabel={`${tr.byDays}, ${tr.days7}`}
      />
    </BentoCard>
  );

  // Активні таймери — bento-картка з лічильником у шапці.
  const activeTimersCard = (empty: React.ReactNode) => (
    <BentoCard
      compact
      title={tr.activeTimers}
      icon="timer"
      accent="amber"
      headerRight={activeTimers.length > 0 ? (
        <View style={[s.countPill, { backgroundColor: t.surface.subtle }]}>
          <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{activeTimers.length}</Text>
        </View>
      ) : undefined}>
      {activeTimersBlock ?? empty}
    </BentoCard>
  );

  /** Картки контексту: статична зона, а без неї — над історією в головній. */
  const contextCards = (
    <>
      {activeTimersCard(
        <View style={[s.panelEmpty, { backgroundColor: t.surface.subtle }]}>
          <IconSymbol name="stop.fill" size={12} color={c.sub} />
          <Text style={{ color: c.sub, fontSize: 13, marginLeft: 8, flex: 1 }}>{tr.timeNothingRunning}</Text>
        </View>,
      )}
      <StartTimerCard
        c={c}
        tr={tr}
        tasks={myTimerTasks}
        running={runningTaskIds}
        projectById={projectById}
        onStart={task => { void startFromPanel(task); }}
      />
      {daysCard}
      {anomalyBlock}
      <TimeProjectBreakdown {...kpiProps} />
    </>
  );

  const zoneStatic = (
    <View style={{ gap: 14 }} testID="time-static-zone">
      <TimeZoneKpiCard
        title={periodLabels[period]}
        total={initialized && total > 0 ? fmtDur(total) : '—'}
        average={initialized && average > 0 ? fmtDur(average) : '—'}
        typical={initialized && typical > 0 ? fmtDur(typical) : '—'}
        tr={tr}
      />
      {contextCards}
    </View>
  );

  const zoneForm = dynamicOpen ? (
    <TimeEntryForm
      active
      entry={creating ? null : zoneEntry}
      c={c}
      tr={tr}
      tasks={taskChoices}
      projects={projects}
      taskProjects={taskProjects}
      onClose={closePanel}
      onSubmit={entry => { upsertEntry(entry); closePanel(); }}
    />
  ) : null;

  const headerKpis = initialized ? (
    <>
      <KpiCounter value={total > 0 ? fmtDur(total) : '—'} label={tr.totalLabel} />
      <KpiCounter value={average > 0 ? fmtDur(average) : '—'} label={tr.timeAverageTask} />
      <KpiCounter value={typical > 0 ? fmtDur(typical) : '—'} label={tr.timeTypicalSession} />
    </>
  ) : undefined;

  const fab = (
    <PressableScale
      onPress={() => openEntry(null)}
      scaleTo={0.92}
      accessibilityLabel={tr.timeAddEntry}
      style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: t.action.primary }]}>
      <IconSymbol name="plus" size={26} color={t.text.onAction} />
    </PressableScale>
  );

  /** Аркуші й повноекранні таймери — спільні для обох компонувань. */
  const sheets = (
    <>
        <TimeEntrySheet
          visible={sheetOpen}
          entry={sheetEntry}
          c={c}
          isDark={isDark}
          height={height}
          isWide={isWide}
          tr={tr}
          tasks={taskChoices}
          projects={projects}
          taskProjects={taskProjects}
          onClose={() => { setSheetOpen(false); setSheetEntry(null); }}
          onSubmit={upsertEntry}
        />

        <TimeFilterSheet
          visible={showFilters}
          c={c}
          isDark={isDark}
          height={height}
          isWide={isWide}
          period={period}
          sort={sort}
          grouping={grouping}
          projectId={filterProjectId}
          taskKey={filterTaskKey}
          projects={projectsForFilter}
          tasks={tasksForFilter}
          periodLabels={periodLabels}
          tr={tr}
          onChange={next => {
            if (next.period !== undefined) setPeriod(next.period);
            if (next.sort !== undefined) setSort(next.sort);
            if (next.grouping !== undefined) setGrouping(next.grouping);
            if (next.projectId !== undefined) setFilterProjectId(next.projectId);
            if (next.taskKey !== undefined) setFilterTaskKey(next.taskKey);
          }}
          onReset={resetFilters}
          onClose={() => setShowFilters(false)}
        />

        <FullscreenTimers visible={fsOpen} onClose={() => setFsOpen(false)} />
    </>
  );

  // Omni: глобальна шапка (☰ · дзвіник · акаунт; рядок інструментів на
  // планшеті) + KPI обраного періоду. «Середнє на задачу» і «Звичайна
  // сесія» стоять поруч навмисно (див. components/time/TimeKpi.tsx).
  const appHeader = (
    <AppHeader
      title={tr.navTimeTracker}
      paddingBottom={14}
      // Статична зона поруч несе ті самі KPI — шапка їх не дублює.
      kpis={staticBeside ? undefined : headerKpis}
      actions={
        <>
          {/* Режим зосередження показує те, що йде просто зараз, тож вхід у
              порожню сітку обіцяв би, що там щось є. */}
          {activeTimers.length > 0 && (
            <HeaderButton
              onPress={() => { haptic.light(); setFsOpen(true); }}
              accessibilityLabel={`${tr.fullscreenTimers}, ${tr.activeTimers}: ${activeTimers.length}`}>
              <IconSymbol name="timer" size={17} color={c.indigo} />
            </HeaderButton>
          )}
          {/* На широкому фільтри стоять над самою історією (вкладки
              періоду + «Ще фільтри»), тож кнопка в шапці дублювала б їх. */}
          {!zoneMode && (
            <HeaderButton
              onPress={() => setShowFilters(true)}
              accessibilityLabel={tr.filtersAndSort}
              style={hasFilters ? { backgroundColor: c.indigo + '20' } : undefined}>
              <IconSymbol name="slider.horizontal.3" size={17} color={hasFilters ? c.indigo : c.sub} />
            </HeaderButton>
          )}
        </>
      }
    />
  );

  if (zoneMode) {
    // ── Планшет: три зони (Layout System v2.4) ─────────────────────────────
    const mainZone = (
      <View style={{ flex: 1 }}>
        {appHeader}
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          // Місце під плаваючу «+» (56 + відступ 20) із запасом.
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: tabBarInset + 96 }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 6 }} />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={emptyList}
          ListHeaderComponent={
            <View style={{ gap: 14 }}>
              {periodTabs}
              {/* Статичної зони поруч немає — її картки стоять над історією
                  (порожньої «Активні (0)» тут немає, як і на телефоні). */}
              {!staticBeside && (
                <>
                  {activeTimersBlock && activeTimersCard(null)}
                  <StartTimerCard
                    c={c}
                    tr={tr}
                    tasks={myTimerTasks}
                    running={runningTaskIds}
                    projectById={projectById}
                    onStart={task => { void startFromPanel(task); }}
                  />
                  {daysCard}
                  <TimeProjectBreakdown {...kpiProps} />
                  {anomalyBlock}
                </>
              )}
              {historyTitle}
            </View>
          }
        />
      </View>
    );
    return (
      <View style={{ flex: 1 }}>
        <MeshBackground />
        <ZoneLayout
          testID="time-zones"
          main={mainZone}
          dynamic={zoneForm}
          dynamicOpen={dynamicOpen}
          onCloseDynamic={closePanel}
          dynamicLabel={creating ? tr.timeNewEntry : tr.timeEditEntry}
          dynamicScrollRef={panelScrollRef}
          // ✕ і заголовок дає сама форма (TimeEntryForm).
          dynamicChrome={false}
          static={zoneStatic}
          showStatic={zone.panels.static}
          panels={zone.panels}
          onTogglePanel={zone.togglePanel}
          fab={fab}
        />
        {sheets}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      <View style={{ flex: 1 }}>
        {appHeader}
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingTop: 8, paddingBottom: tabBarInset + 24 }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderSectionFooter={() => <View style={{ height: 6 }} />}
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
          ListEmptyComponent={emptyList}
          ListHeaderComponent={
            <View style={{ gap: 14 }}>
              {/* Період — вкладки розділу одразу під шапкою (Omni). */}
              {periodTabs}

              {/* 1. Що йде ЗАРАЗ. Порожньої картки немає навмисно: «Активні
                  (0)» щодня займали б екран ні за що. */}
              {activeTimersBlock && activeTimersCard(null)}

              {/* 2. Підсумки: стовпці «По днях» і розподіл за проєктами
                  (самі KPI періоду — у шапці). */}
              {daysCard}
              <TimeProjectBreakdown {...kpiProps} />

              {/* 3. Що треба перевірити. */}
              {anomalyBlock}

              {/* 4. Самі записи. */}
              {historyTitle}
            </View>
          }
        />
      </View>

      {/* Layout System v2.4: «+» — плаваюча в правому нижньому куті списку. */}
      {fab}

      {sheets}
    </View>
  );
}

// ─── Рядки списків ────────────────────────────────────────────────────────────

/** status.danger / focus.ring — однакові в обох темах для цих ролей. */
const STOP_RED = '#E8543F';
const FOCUS_RING = '#B8A4F8';

interface ActiveTimerRowProps {
  subtasks?: RowSubtask[];
  timer: ActiveTimer;
  /** Проєкт таймера (useTimerProjects); undefined — мітки немає. */
  project?: TimerProject;
  tr: Translations;
  accent: string;
  border: string;
  card: string;
  text: string;
  sub: string;
  stopLabel: string;
  onStop: (id: string) => void;
}

/**
 * Рядок таймера, що йде. Час іде через ElapsedClock, а не через formatClock
 * прямо в <Text>: інакше число завмирає до наступного перерендеру екрана.
 */
const ActiveTimerRow = React.memo(function ActiveTimerRow({
  timer, project, tr, subtasks, accent, border: _border, card, text, sub, stopLabel, onStop,
}: ActiveTimerRowProps) {
  const all = subtasks ?? [];
  const doneCount = all.filter(x => x.done).length;
  // Два рядки — стеля: список тут довідка збоку від годинника, а не екран задачі.
  const pending = all.filter(x => !x.done).slice(0, 2);
  const hidden = all.filter(x => !x.done).length - pending.length;
  return (
    <View style={[s.activeRow, { backgroundColor: card }]}>
      <View style={[s.rowDot, { backgroundColor: accent }]} />
      <View style={{ flex: 1, marginLeft: 11, marginRight: 8 }}>
        <Text style={[s.entryTask, { color: text }]} numberOfLines={1}>{timer.label}</Text>
        <TimerProjectTag project={project} tr={tr} color={sub} style={{ marginTop: 2 }} />
        {all.length > 0 && (
          <Text style={[s.entryMeta, { color: sub }]}>{doneCount}/{all.length}</Text>
        )}
        {pending.map(item => (
          <View key={item.id} style={s.rowSubLine}>
            <View style={[s.rowSubDot, { borderColor: sub }]} />
            <Text numberOfLines={1} style={[s.rowSubText, { color: sub }]}>{item.title}</Text>
          </View>
        ))}
        {hidden > 0 && <Text style={[s.rowSubMore, { color: sub }]}>+{hidden}</Text>}
      </View>
      <ElapsedClock
        running
        seconds={now => elapsedSince(timer.startedAt, now)}
        format={formatClock}
        style={[s.rowClock, { color: accent }]}
      />
      <TouchableOpacity
        onPress={() => onStop(timer.id)}
        accessibilityLabel={stopLabel}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={s.stopBtn}>
        <IconSymbol name="stop.fill" size={13} color={STOP_RED} />
      </TouchableOpacity>
    </View>
  );
});

interface EntryRowProps {
  entry: TimeRecord;
  /** Запис відкритий у правій панелі широкого екрана. */
  selected?: boolean;
  /** З `anomalySeverity`: червоне — задовга чи через північ, бурштинове — решта. */
  severity: 'red' | 'amber' | null;
  /** Готовий підпис причин («×3,1 від звичного · зазвичай 25 хв»). */
  reason: string | null;
  trimSeconds: number | null;
  trimLabel: string | null;
  warn: string;
  projectName?: string;
  projectColor?: string;
  accent: string;
  border: string;
  text: string;
  sub: string;
  danger: string;
  /** Готові рядки, а не секунди: щоб не тягти сюди форматування. */
  duration: string;
  when: string;
  tr: Translations;
  onPress: (entry: TimeRecord) => void;
  onDelete: (entry: TimeRecord) => void;
  onTrim: (entry: TimeRecord, seconds: number) => void;
  /** Layout System v2.4: дії свайпу рядка — і для VoiceOver (SwipeRow). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
}

/**
 * Рядок запису окремим memo-компонентом: поки біжить таймер, екран
 * перемальовується щосекунди, і без цього разом із ним перемальовувався б увесь
 * список записів.
 */
const EntryRow = React.memo(function EntryRow({
  entry, selected = false, severity, reason, trimSeconds, trimLabel, warn, projectName, projectColor, accent, border: _border, text, sub, danger,
  duration, when, tr, onPress, onDelete, onTrim, accessibilityActions, onAccessibilityAction,
}: EntryRowProps) {
  const flag = severity === 'red' ? danger : severity === 'amber' ? warn : null;
  const title = entry.task || tr.untitled;
  const { t } = useDSTheme();
  // Omni: рядок історії — суцільна біла картка (surface.card), без скла.
  const cardBg = t.surface.card;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      accessibilityLabel={`${title}, ${duration}.${reason ? ` ${tr.timeRowAnomalyA11y.replace('{kinds}', reason)}.` : ''} ${tr.edit}`}
      style={[
        s.entryCard,
        // DS v2: картка surface.card без рамки; вибраний — 2px focus ring;
        // аномалія — тоноване тло (колір несуть смуга й іконка).
        selected
          ? { borderColor: FOCUS_RING, backgroundColor: cardBg }
          : { borderColor: 'transparent', backgroundColor: flag ? flag + '14' : cardBg },
      ]}>
      {/* Смуга: колір проєкту, а в аномального запису — колір тривоги, і
          ширша, щоб її було видно краєм ока під час гортання. */}
      <View style={[s.entryBar, flag ? { width: 4, backgroundColor: flag } : { backgroundColor: projectColor ?? accent }]} />
      <View style={{ flex: 1, marginLeft: 11 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {flag && (
            <IconSymbol name="exclamationmark.triangle.fill" size={12} color={flag} style={{ marginRight: 5 }} />
          )}
          <Text numberOfLines={1} style={[s.entryTask, { color: text, flexShrink: 1 }]}>{title}</Text>
        </View>
        <Text numberOfLines={1} style={[s.entryMeta, { color: sub }]}>
          {when}
          {projectName ? ` · ${projectName}` : ''}
          {entry.note ? ` · ${entry.note}` : ''}
        </Text>
        {reason ? (
          // Текст — кольором тексту: бурштиновий 11 px у світлій темі не
          // тримає 4.5:1. Колір несуть смуга, рамка й іконка.
          <Text numberOfLines={2} style={[s.entryMeta, { color: text, fontFamily: fontFamily.semibold }]}>{reason}</Text>
        ) : null}
        {trimSeconds !== null && trimLabel ? (
          <TouchableOpacity
            onPress={() => onTrim(entry, trimSeconds)}
            accessibilityRole="button"
            accessibilityLabel={`${trimLabel}: ${title}`}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            style={[s.trimBtn, { backgroundColor: t.surface.subtle }]}>
            <IconSymbol name="scissors" size={11} color={accent} />
            <Text style={{ color: accent, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 5 }}>{trimLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[s.entryDur, { color: text }]}>{duration}</Text>
      <TouchableOpacity
        onPress={() => onDelete(entry)}
        accessibilityLabel={tr.timeDeleteEntryA11y.replace('{task}', entry.task)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginLeft: 10 }}>
        <IconSymbol name="trash" size={14} color={danger} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const s = StyleSheet.create({
  activeRow: { borderRadius: Atlas.radius.xlarge, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowDot: { width: 9, height: 9, borderRadius: 5 },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  rowSubDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.2, marginRight: 6 },
  rowSubText: { fontFamily: fontFamily.regular, flex: 1, fontSize: 11, opacity: 0.85 },
  rowSubMore: { fontSize: 10, fontFamily: fontFamily.bold, marginTop: 3, letterSpacing: 0.3 },
  rowClock: { fontSize: 20, fontFamily: fontFamily.light, letterSpacing: -0.4, fontVariant: ['tabular-nums'], marginRight: 10 },
  stopBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(232,84,63,0.12)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontFamily: fontFamily.semibold },
  historyHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4, minHeight: 36 },
  headChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  countPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  groupLabel: { fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.2 },
  entryCard: { borderRadius: Atlas.radius.xlarge, borderWidth: 2, minHeight: 56, paddingVertical: 12, paddingRight: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  entryBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 11 },
  entryTask: { fontSize: 14, fontFamily: fontFamily.semibold },
  entryMeta: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },
  entryDur: { fontSize: 15, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
  trimBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 20, minHeight: 44, borderRadius: 999 },
  periodChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  panelCard: { borderRadius: Atlas.radius.xxlarge, padding: 24 },
  panelEmpty: { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.xlarge, padding: 16 },
  wideBody: { flex: 1, width: '100%', alignSelf: 'center' },
  wideColumns: { flex: 1, flexDirection: 'row', gap: 20, marginTop: 16 },
  fab: { position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', shadowColor: '#111113', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 6 },
});
