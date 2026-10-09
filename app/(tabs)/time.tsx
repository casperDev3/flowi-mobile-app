import { Atlas } from '@/constants/atlas';
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
 * Компонування за шириною (рішення 5 аудиту планшета):
 *  • телефон — одна колонка, як і було;
 *  • портрет планшета (medium, 600–839) — одна колонка, але активні таймери
 *    сіткою у 2 колонки (KPI і так стоять рядком у 4);
 *  • широко (expanded і ≥720pt вмісту поруч із сайдбаром) — KPI рядком угорі,
 *    під ними дві колонки: зліва історія з фільтрами, справа липка панель
 *    «таймери → почати таймер → перевірка → розподіл». Правка запису
 *    відкривається В ЦІЙ ПАНЕЛІ, а не аркушем: список лишається видно.
 *
 * Чого тут навмисно НЕМАЄ:
 *  • вільного секундоміра — таймер стартує лише із задачі або зустрічі, бо
 *    вільний секундомір лишав час, не привʼязаний ні до чого, і його однаково
 *    доводилось потім переписувати руками. «Почати таймер» у правій панелі
 *    широкого екрана — це вибір МОЄЇ задачі, а не секундомір;
 *  • поділу на ранок/день/вечір/ніч — жоден звіт за ним не будувався.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { AnomalyPanel, anomalyReasonText } from '@/components/time/AnomalyPanel';
import { TimerProjectTag } from '@/components/time/ActiveTimerRow';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { StartTimerCard } from '@/components/time/StartTimerCard';
import { TimeEntryForm } from '@/components/time/TimeEntryForm';
import { TimeEntrySheet } from '@/components/time/TimeEntrySheet';
import { TimeFilterSheet } from '@/components/time/TimeFilterSheet';
import { TimeKpi, TimeKpiTiles, TimeProjectBreakdown } from '@/components/time/TimeKpi';
import type { TimerCandidateTask } from '@/components/time/timerCandidates';
import { useTimerProjects } from '@/components/time/useTimerProjects';
import { timeColors } from '@/components/time/TimePalette';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Layout, detailColumnWidthFor } from '@/constants/tokens';
import { WIDE_CONTENT_MAX_WIDTH, useContentWidth } from '@/hooks/use-content-width';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useScreenView } from '@/hooks/use-screen-view';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
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

/**
 * Від цієї ширини ВМІСТУ (вікно мінус сайдбар) — дві колонки. Рахуємо від
 * вмісту, а не від класу вікна: на 840pt з повним сайдбаром лишається ~600pt,
 * і дві колонки там були б тісніші за одну.
 */
const TWO_PANE_MIN = 720;

type PanelState = { mode: 'none' } | { mode: 'new' } | { mode: 'edit'; entry: TimeRecord };

export default function TimeScreen() {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { width, height, isWide, isExpanded } = useResponsive();
  const screenWidth = useScreenWidth();
  /** Широко: KPI рядком, історія зліва, панель справа. */
  const twoPane = isExpanded && screenWidth >= TWO_PANE_MIN;
  /** Портрет планшета: одна колонка, таймери сіткою в 2. */
  const timerColumns = isWide && !twoPane ? 2 : 1;
  const { user } = useAuth();
  const projectRoles = useProjectRoles();
  const isDark = useColorScheme() === 'dark';
  useScreenView('time');
  const { activeTimers, stopTimer, startTaskTimer, tasksRevision, timeEntriesRevision } = useTimerContext();
  // Мітка проєкту в рядку таймера — та сама, що в панелі над табами й сайдбарі.
  const projectOf = useTimerProjects(activeTimers);
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

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
  /** Права панель широкого екрана: таймери або форма запису. */
  const [panel, setPanel] = useState<PanelState>({ mode: 'none' });
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
        onPress: () => {
          setEntries(prev => prev.filter(e => e.id !== entry.id));
          // Запис, відкритий у панелі, щойно зник — форма над ним уже ні до чого.
          setPanel(current => (current.mode === 'edit' && current.entry.id === entry.id ? { mode: 'none' } : current));
        },
      },
    ]);
  }, [tr.cancel, tr.cannotUndo, tr.delete, tr.deletePermanently]);

  const openEntry = useCallback((entry: TimeRecord | null) => {
    haptic.light();
    if (twoPane) {
      setPanel(entry ? { mode: 'edit', entry } : { mode: 'new' });
      return;
    }
    setSheetEntry(entry);
    setSheetOpen(true);
  }, [twoPane]);

  const closePanel = useCallback(() => setPanel({ mode: 'none' }), []);

  // Нова правка — з верху панелі: форма замінює таймери, і прокрутка, що
  // лишилась від них, ховала б заголовок і поле задачі.
  const panelKey = panel.mode === 'edit' ? panel.entry.id : panel.mode;
  useEffect(() => {
    if (panel.mode !== 'none') panelScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [panelKey, panel.mode]);

  // Поворот / Split View звузив екран, поки форма була в панелі: панелі більше
  // немає, тож правка переїжджає в аркуш, а не губиться разом із набраним.
  useEffect(() => {
    if (twoPane || panel.mode === 'none') return;
    setSheetEntry(panel.mode === 'edit' ? panel.entry : null);
    setSheetOpen(true);
    setPanel({ mode: 'none' });
  }, [twoPane, panel]);

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
            card={c.card}
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

  const historyTitle = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: twoPane ? 4 : 24, marginBottom: 4 }}>
      <Text style={[s.sectionTitle, { color: c.text, flex: 1 }]} accessibilityRole="header">{tr.history}</Text>
      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>
        {periodLabels[period]}
        {grouping === 'project' ? tr.timeByProjectSuffix : ''}
      </Text>
    </View>
  );

  const selectedId = twoPane && panel.mode === 'edit' ? panel.entry.id : null;

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 14 }}>
      {section.color && (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: section.color, marginRight: 7 }} />
      )}
      <Text numberOfLines={1} style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{section.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <IconSymbol name="timer" size={11} color={c.sub} />
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>{fmtDur(section.seconds)}</Text>
      </View>
    </View>
  );

  const renderItem = ({ item }: { item: TimeRecord }) => {
    const anomaly: RowAnomaly | undefined = rowAnomalies.get(item.id);
    const severity = anomalySeverity(anomaly?.kinds ?? []);
    const trim = severity ? trimmedSeconds(item) : null;
    return (
      <EntryRow
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
    );
  };

  const emptyList = (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <IconSymbol name="clock.fill" size={40} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>{tr.noRecords}</Text>
      {hasFilters ? (
        <TouchableOpacity onPress={resetFilters} style={[s.emptyAction, { backgroundColor: c.indigo }]}>
          <IconSymbol name="xmark" size={12} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 6 }}>{tr.resetAllFilters}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>
          {tr.timeEmptyHint}
        </Text>
      )}
    </View>
  );

  const periodChips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }} accessibilityRole="radiogroup">
      {(Object.keys(periodLabels) as TimePeriod[]).map(key => {
        const active = period === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => { haptic.light(); setPeriod(key); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[s.periodChip, { borderColor: active ? c.indigo : c.border, backgroundColor: active ? c.indigo + '20' : 'transparent' }]}>
            <Text style={{ color: active ? c.indigo : c.text, fontSize: 13, fontWeight: active ? '700' : '500' }}>
              {periodLabels[key]}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        onPress={() => setShowFilters(true)}
        accessibilityRole="button"
        accessibilityLabel={tr.filtersAndSort}
        style={[s.periodChip, { borderColor: hasFilters ? c.indigo : c.border, flexDirection: 'row', gap: 6 }]}>
        <IconSymbol name="slider.horizontal.3" size={13} color={hasFilters ? c.indigo : c.sub} />
        <Text style={{ color: hasFilters ? c.indigo : c.text, fontSize: 13, fontWeight: '600' }}>{tr.timeMoreFilters}</Text>
      </TouchableOpacity>
    </View>
  );

  const rightPanel = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ width: detailColumnWidthFor(width), flexShrink: 0 }}>
      <ScrollView
        ref={panelScrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: tabBarInset + 24, gap: 14 }}>
        {panel.mode !== 'none' ? (
          <View
            style={[s.panelCard, { borderColor: c.border, backgroundColor: c.sheet }]}
            accessibilityLabel={panel.mode === 'edit' ? tr.timeEditEntry : tr.timeNewEntry}>
            <TimeEntryForm
              active
              entry={panel.mode === 'edit' ? panel.entry : null}
              c={c}
              tr={tr}
              tasks={taskChoices}
              projects={projects}
              taskProjects={taskProjects}
              onClose={closePanel}
              onSubmit={entry => { upsertEntry(entry); closePanel(); }}
            />
          </View>
        ) : (
          <>
            <View>
              <Text style={[s.sectionTitle, { color: c.text, marginBottom: 10 }]} accessibilityRole="header">
                {tr.activeTimers}{activeTimers.length > 0 ? ` (${activeTimers.length})` : ''}
              </Text>
              {activeTimersBlock ?? (
                <View style={[s.panelEmpty, { borderColor: c.border }]}>
                  <IconSymbol name="stop.fill" size={12} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 13, marginLeft: 8, flex: 1 }}>{tr.timeNothingRunning}</Text>
                </View>
              )}
            </View>
            <StartTimerCard
              c={c}
              tr={tr}
              tasks={myTimerTasks}
              running={runningTaskIds}
              projectById={projectById}
              onStart={task => { void startFromPanel(task); }}
            />
            {anomalyBlock}
            <TimeProjectBreakdown {...kpiProps} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={tr.navTimeTracker}
          color={c.text}
          paddingBottom={14}
          actions={
            <>
              {/* Режим зосередження показує те, що йде просто зараз, тож вхід у
                  порожню сітку обіцяв би, що там щось є. */}
              {activeTimers.length > 0 && (
                <HeaderButton
                  onPress={() => { haptic.light(); setFsOpen(true); }}
                  accessibilityLabel={`${tr.fullscreenTimers}, ${tr.activeTimers}: ${activeTimers.length}`}
                  style={{ backgroundColor: c.indigo + '20', borderColor: c.indigo }}>
                  <IconSymbol name="timer" size={17} color={c.indigo} />
                </HeaderButton>
              )}
              {/* На широкому фільтри стоять над самою історією (чипи періоду +
                  «Ще фільтри»), тож кнопка в шапці дублювала б їх. */}
              {!twoPane && (
                <HeaderButton
                  onPress={() => setShowFilters(true)}
                  accessibilityLabel={tr.filtersAndSort}
                  style={{
                    backgroundColor: hasFilters ? c.indigo + '20' : c.dim,
                    borderColor: hasFilters ? c.indigo : c.border,
                  }}>
                  <IconSymbol name="slider.horizontal.3" size={17} color={hasFilters ? c.indigo : c.sub} />
                </HeaderButton>
              )}
              {/* FAB на широкому висів би над історією посеред екрана —
                  головна дія переїжджає в шапку. */}
              {twoPane && (
                <HeaderButton
                  onPress={() => openEntry(null)}
                  accessibilityLabel={tr.timeAddEntry}
                  style={{ backgroundColor: c.indigo, borderColor: c.indigo }}>
                  <IconSymbol name="plus" size={17} color="#fff" />
                </HeaderButton>
              )}
            </>
          }
        />

        {twoPane ? (
          <View style={[s.wideBody, { maxWidth: WIDE_CONTENT_MAX_WIDTH, paddingHorizontal: Layout.gutter.expanded }]}>
            <TimeKpiTiles {...kpiProps} large />
            <View style={s.wideColumns}>
              <SectionList
                style={{ flex: 1, minWidth: 0 }}
                sections={sections}
                keyExtractor={item => item.id}
                contentContainerStyle={{ paddingTop: 4, paddingBottom: tabBarInset + 24 }}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderSectionFooter={() => <View style={{ height: 6 }} />}
                renderSectionHeader={renderSectionHeader}
                renderItem={renderItem}
                ListEmptyComponent={emptyList}
                ListHeaderComponent={<>{historyTitle}{periodChips}</>}
              />
              {rightPanel}
            </View>
          </View>
        ) : (
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
              <>
                {/* 1. Що йде ЗАРАЗ. Порожньої секції немає навмисно: заголовок
                    «Активні (0)» щодня займав би екран ні за що. */}
                {activeTimersBlock && (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[s.sectionTitle, { color: c.text, marginBottom: 10 }]}>
                      {tr.activeTimers} ({activeTimers.length})
                    </Text>
                    {activeTimersBlock}
                  </View>
                )}

                {/* 2. KPI за обраним періодом. */}
                <TimeKpi {...kpiProps} />

                {/* 3. Що треба перевірити. */}
                {anomalyBlock && <View style={{ marginTop: 14 }}>{anomalyBlock}</View>}

                {/* 4. Самі записи. */}
                {historyTitle}
              </>
            }
          />
        )}
      </View>

      {!twoPane && (
        <PressableScale
          onPress={() => openEntry(null)}
          scaleTo={0.92}
          accessibilityLabel={tr.timeAddEntry}
          style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.indigo }]}>
          <IconSymbol name="plus" size={26} color="#fff" />
        </PressableScale>
      )}

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
    </View>
  );
}

// ─── Рядки списків ────────────────────────────────────────────────────────────

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
  timer, project, tr, subtasks, accent, border, card, text, sub, stopLabel, onStop,
}: ActiveTimerRowProps) {
  const all = subtasks ?? [];
  const doneCount = all.filter(x => x.done).length;
  // Два рядки — стеля: список тут довідка збоку від годинника, а не екран задачі.
  const pending = all.filter(x => !x.done).slice(0, 2);
  const hidden = all.filter(x => !x.done).length - pending.length;
  return (
    <View style={[s.activeRow, { borderColor: border, backgroundColor: card }]}>
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
        <IconSymbol name="stop.fill" size={13} color="#EF4444" />
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
}

/**
 * Рядок запису окремим memo-компонентом: поки біжить таймер, екран
 * перемальовується щосекунди, і без цього разом із ним перемальовувався б увесь
 * список записів.
 */
const EntryRow = React.memo(function EntryRow({
  entry, selected = false, severity, reason, trimSeconds, trimLabel, warn, projectName, projectColor, accent, border, text, sub, danger,
  duration, when, tr, onPress, onDelete, onTrim,
}: EntryRowProps) {
  const flag = severity === 'red' ? danger : severity === 'amber' ? warn : null;
  const title = entry.task || tr.untitled;
  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${duration}.${reason ? ` ${tr.timeRowAnomalyA11y.replace('{kinds}', reason)}.` : ''} ${tr.edit}`}
      style={[
        s.entryCard,
        selected
          ? { borderColor: accent, backgroundColor: accent + '18' }
          : { borderColor: flag ? flag + '88' : border, backgroundColor: flag ? flag + '12' : 'transparent' },
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
          <Text numberOfLines={2} style={[s.entryMeta, { color: text, fontWeight: '600' }]}>{reason}</Text>
        ) : null}
        {trimSeconds !== null && trimLabel ? (
          <TouchableOpacity
            onPress={() => onTrim(entry, trimSeconds)}
            accessibilityRole="button"
            accessibilityLabel={`${trimLabel}: ${title}`}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            style={[s.trimBtn, { borderColor: border }]}>
            <IconSymbol name="scissors" size={11} color={accent} />
            <Text style={{ color: accent, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>{trimLabel}</Text>
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
  activeRow: { borderRadius: Atlas.radius.large, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  rowDot: { width: 9, height: 9, borderRadius: 5 },
  rowSubLine: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  rowSubDot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1.2, marginRight: 6 },
  rowSubText: { flex: 1, fontSize: 11, opacity: 0.85 },
  rowSubMore: { fontSize: 10, fontWeight: '700', marginTop: 3, letterSpacing: 0.3 },
  rowClock: { fontSize: 15, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.3, fontVariant: ['tabular-nums'], marginRight: 10 },
  stopBtn: { width: 32, height: 32, borderRadius: Atlas.radius.medium, borderWidth: 1, borderColor: 'rgba(239,68,68,0.28)', backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: Atlas.type.headingWeight },
  groupLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  entryCard: { borderRadius: Atlas.radius.large, borderWidth: 1, paddingVertical: 11, paddingRight: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  entryBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 11 },
  entryTask: { fontSize: 13, fontWeight: '600' },
  entryMeta: { fontSize: 11, marginTop: 2 },
  entryDur: { fontSize: 13, fontWeight: Atlas.type.headingWeight },
  trimBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, marginTop: 7 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11 },
  periodChip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  panelCard: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 18 },
  panelEmpty: { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.large, borderWidth: 1, borderStyle: 'dashed', padding: 14 },
  wideBody: { flex: 1, width: '100%', alignSelf: 'center' },
  wideColumns: { flex: 1, flexDirection: 'row', gap: 20, marginTop: 16 },
  fab: { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: Atlas.radius.large, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
});
