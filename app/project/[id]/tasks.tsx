import {isProjectWork} from '@/utils/projectBacklog';
/**
 * app/project/[id]/tasks.tsx — Завдання простору проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §3: «Завдання (Дошка / Список / Календар /
 * Таймлайн)»).
 *
 * Розділ ЗАВЖДИ доступний, як і Огляд.
 *
 * Список має перемикач групування (без групи / за статусом / за пріоритетом /
 * за спринтом — `buildProjectListGroups` в `utils/taskListView.ts`, чиста
 * функція з юніт-тестами). Порожні секції СТАТУСУ тут НЕ прибираються
 * (`includeEmpty`): порожній проєкт мусить показувати свої колонки, а не
 * самий лише напис «Задач ще немає».
 *
 * Створення — ОДНА кнопка на екран (рішення власника, п. 3): FAB на телефоні,
 * підписана кнопка в шапці на планшеті. Жодних «+» у групах/колонках і
 * інлайн-полів: кнопка відкриває ту саму коротку форму швидкого створення
 * (TaskQuickCreate), що й особистий екран Завдань — ТУТ, у просторі проєкту,
 * з уже обраним проєктом (раніше форма відкривалась на особистому екрані, і
 * людина випадала з проєкту).
 *
 * Шапка — той самий патерн, що в особистих Завданнях: створення (планшет) і
 * одна кнопка «⋯» (вигляд, групування, «лише мої», календар, архів). Пошук —
 * над списком.
 *
 * Маршрут приймає `?open=<taskId>&tab=` (картка задачі, напр. з календаря
 * проєкту) і `?create=1&deadline=&sprintId=` (швидке створення) — щоб усі
 * переходи всередині проєкту лишались у просторі проєкту.
 *
 * Дошка гортається горизонтально (`ScrollView horizontal` — «телефон = горизонтальний свайп
 * колонок» із контракту §3); саме тягнення пальцем картки МІЖ колонками —
 * НЕ реалізоване (свідомо, попередній прохід: велика окрема функція з
 * autoscroll на межах горизонтального ScrollView) — довге натискання
 * відкриває вибір колонки (`openColumnPicker` нижче) як заміна на ВСІХ
 * розмірах екрана, а не лише на телефоні.
 * Календар (contract §3) — задачі за дедлайном
 * ПЛЮС наради проєкту за датою (розгорнуті по повторах), об'єднані по днях,
 * у межах місяця; Таймлайн — графік `ProjectGantt` задач ЦЬОГО проєкту
 * (від старту до дедлайну), плюс редагування дат під ним:
 * contract §3 «тягнення країв змінює дати (планшет/веб; телефон — перегляд +
 * редагування дат у картці)» — тягнення країв (drag-to-resize) реалізоване
 * (`onGanttEdgeDrag` нижче, планшет/веб); на телефоні лишається лише
 * перегляд + текстове редагування дат у картці, як і задумано контрактом.
 *
 * Layout System v2.4 (зони): шапка розділу (PageHeader/KPI/вкладки «Список ·
 * Дошка») — у ГОЛОВНІЙ зоні; «Дошка» = режим «Колонки» (`?view=columns`,
 * KanbanPager: на телефоні одна колонка на екран із крапками, на iPad —
 * поруч). Картка задачі — ДИНАМІЧНА зона (`?task=<id>`): панель праворуч з ✕
 * на iPad, нижній аркуш ~60% → весь екран на телефоні. «Сьогодні» проєкту
 * (TasksTodayPane) — СТАТИЧНА зона поруч лише на дуже широкому вікні (≥1280).
 * Рядки списку свайпаються вліво («В архів» = виконано, «Видалити» — лише
 * лід, як у футері картки); довгий тап у списку — масовий вибір
 * (BulkActionBar «N вибрано · Дії ▾ · ✕»). Створення — плаваюча «+» і на
 * планшеті. Кожна зона має стани завантаження / порожньо / помилка.
 *
 * Повна картка задачі (підзавдання, таймер, спринт, нагадування) живе ТУТ,
 * у просторі проєкту: `selectTask` відкриває її в динамічній зоні (панель
 * праворуч на широкому вікні, аркуш на вужчому), `?open=<id>&tab=` — так
 * само (пуш, календар особистого простору). Швидке створення (`?create=1`)
 * — теж тут, аркушем TaskQuickCreate з уже обраним проєктом. В особистий
 * екран Завдань `(tabs)` звідси не веде жоден перехід: контракт §3 «вхід у
 * проєкт = повна зміна контексту». Решта розділів (Спринти, Беклог,
 * Календар, Обговорення) відкривають ту саму картку в себе —
 * components/projects/ProjectTaskSheet.tsx.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { MonthPicker } from '@/components/shared/MonthPicker';
import { SheetHandle, SheetModal } from '@/components/shared/SheetModal';
import { useUndoToast } from '@/components/shared/UndoToast';
import { TaskQuickCreate } from '@/components/tasks/card/TaskQuickCreate';
import { TasksHeaderMenu, TasksMenuButton, type TasksMenuItem } from '@/components/tasks/TasksHeaderMenu';
import { ActionButton } from '@/components/shared/ActionBar';
import { useTaskEditor } from '@/hooks/use-task-editor';
import { useToday } from '@/hooks/use-today';
import { appendHistory, makeHistoryEvent } from '@/utils/taskHistory';
import { reopenColumnId, reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import { applyFormSprint } from '@/utils/sprintUtils';
import { priorityFields } from '@/utils/taskUtils';
import { useProjectTaskCard } from '@/components/projects/ProjectTaskCard';
import { TasksTodayPane } from '@/components/tasks/TasksTodayPane';
import type { TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { ProjectGantt } from '@/components/projects/ProjectGantt';
import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectSyncIndicator } from '@/components/projects/ProjectSyncIndicator';
import { AddTaskFab, FAB_LIST_CLEARANCE } from '@/components/tasks/AddTaskButton';
import { taskCardZone } from '@/components/projects/ProjectTaskSheet';
import {
  BulkActionBar, KanbanPager, SwipeRow, ZoneEmpty, ZoneError, ZoneSkeleton, useZoneState, zoneWidths,
  type BulkAction, type KanbanColumn, type SwipeAction,
} from '@/components/layout-zones';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { projectRoute } from '@/constants/projectNav';
import { useI18n } from '@/store/i18n';
import { refreshProjectNow } from '@/store/project-sync';
import { loadData, loadDataResult, retryStorageRead } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { useTimerContext } from '@/store/timer-context';
import { endOfMonth, localDateKey, resolveTimelineDatePatch, startOfMonth, type TimelineDateEdit } from '@/utils/dateUtils';
import { haptic } from '@/utils/haptics';
import { expandMeetings, meetingsOnDate, orderTodayMeetings, type Meeting } from '@/utils/meetings';
import { buildGantt, shiftGanttEdge } from '@/utils/projectCharts';
import { projectModules } from '@/utils/projectUtils';
import {
  buildProjectCalendarDays, buildProjectListGroups, projectDetailTasks,
  type GroupLabels, type ProjectListGroupBy,
} from '@/utils/taskListView';
import {
  boardColumnForTask, mergeTaskStatusColumns, orderColumnsForList, personalEquivalentStrict,
  scopedColumnFor,
  type TaskStatusColumn,
} from '@/utils/taskStatuses';
import { saveStatusLink } from '@/store/status-links';
import { isLead, taskRights } from '@/utils/teamwork';
import { useAuth } from '@/store/auth';
import {
  assigneeDisplayName, closeSubtasksOnDone,
  filterTasksByMonth, priorityLabel as priorityLevelLabel,
  isOverdue, normalizePriority, type Filter, type Task,
} from '@/utils/taskUtils';
import { type Sprint } from '@/utils/sprintUtils';
import { limitBoardColumn } from '@/utils/taskGroupLimit';
import { fontFamily, radius, type } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { KpiCounter, SectionTabs } from '@/components/ds';

type ViewMode = 'list' | 'board' | 'calendar' | 'timeline';

/**
 * Ключі, яких торкаються ВЛАСНІ записи цього екрана (`trackWrite`) — усі
 * правки тут ідуть лише в `tasks`. Завдяки цьому сигнал про чужий запис у
 * `sprints`/`task_statuses`/`meetings`, що прилетів саме під час нашого
 * збереження (обмін проєкту цілком може дописати їх у ту ж мить), не
 * відкидається, а програється після запису — див. `hooks/use-storage-refresh.ts`.
 */
const TASKS_KEY_ONLY = ['tasks'] as const;

const GROUP_BY_OPTIONS: { key: ProjectListGroupBy }[] = [
  { key: 'none' }, { key: 'status' }, { key: 'priority' }, { key: 'sprint' },
];

export default function ProjectTasksScreen() {
  const {
    id: routeProjectId, open: openParam, tab: tabParam, create: createParam, deadline: deadlineParam, sprintId: sprintParam,
  } = useLocalSearchParams<{ id: string; open?: string; tab?: string; create?: string; deadline?: string; sprintId?: string }>();
  const projectId = useProjectRouteId() ?? routeProjectId;
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { project } = useProject(projectId);
  const { user } = useAuth();
  // Contract §4.1: глядач читає завдання проєкту, але не створює, не рухає по
  // дошці/дедлайнах і не відмічає готовим.
  const teamRole = useProjectRole(projectId);
  const canEdit = teamRole !== 'viewer';
  const { stopTimerForTask, activeTimers } = useTimerContext();
  const { isWide, width: windowWidth } = useResponsive();
  const screenWidth = useScreenWidth();
  /**
   * Layout System v2.4 — стан зон розділу: режим «Список / Колонки»
   * (`?view=`), видимість статичної зони й панелі деталей (`?panel=`) і
   * відкрита задача (`?task=`). Вибір режиму/панелей — налаштування пристрою.
   */
  const zoneState = useZoneState({ section: 'project-tasks', selectedParam: 'task', columns: true, label: tr.tabTasks });
  /** Деталь поміщається панеллю поруч зі списком (iPad) чи йде нижнім аркушем. */
  const panelMode = zoneWidths({
    windowWidth, screenWidth, wide: isWide, wantStatic: false, wantDynamic: true,
  }).dynamicMode === 'panel';
  /** Одна кнопка створення — плаваюча «+» (Layout System v2.4: і на планшеті). */
  const showFab = canEdit;
  // §4.5 — підпис виконавця на картках усіх чотирьох видів. Один проєкт тут
  // (не «Сьогодні»/«Завдання», де завдання йдуть з кількох проєктів разом) —
  // досить членів САМЕ цього проєкту з кешу `project_members_v1`.
  const projectMembers = useProjectMembers(projectId);
  const assigneeLabelFor = useCallback(
    (task: Task) => assigneeDisplayName(task.assigneeId, projectMembers, user?.id, tr.taskAssigneeMe),
    [projectMembers, user?.id, tr.taskAssigneeMe],
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [columns, setColumns] = useState<TaskStatusColumn[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  // 'all', а не 'active' (як на екрані Завдань): це повний беклог проєкту,
  // і щойно позначена «готово» задача не має раптово зникати з-під пальця.
  const [query, setQuery] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const today = useToday();
  const composer = useTaskEditor('', today);
  const { show: showToast, element: toastElement, visible: toastVisible } = useUndoToast(true);
  const [filter] = useState<Filter>('all');
  // «Дошка» — це режим «Колонки» зон (паритет із вебом і особистими Завданнями).
  // Календар і Таймлайн лишаються окремими гілками рендера нижче.
  const zoneView = zoneState.view;
  const zoneSetView = zoneState.setView;
  const view = (zoneView === 'columns' ? 'board' : 'list') as ViewMode;
  const setView = useCallback((v: 'list' | 'board') => zoneSetView(v === 'board' ? 'columns' : 'list'), [zoneSetView]);
  // Список (contract §3: «Список — групування за статусом/пріоритетом/
  // спринтом, фільтри») — 'none' лишає плаский список, як і було.
  const [groupBy, setGroupBy] = useState<ProjectListGroupBy>('none');
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));
  // `origStart`/`origDeadline` — значення на момент відкриття редактора
  // (review finding, resolveTimelineDatePatch у utils/dateUtils.ts): «Зберегти»
  // без правок не повинно мовчки перезаписувати дату переклопаною з локального
  // рядка версією — лише реально змінене поле йде в парсинг, інше лишається
  // байт-у-байт тим, що вже лежить у задачі.
  const [editingDates, setEditingDates] = useState<(TimelineDateEdit & { id: string }) | null>(null);

  /**
   * Стан головної зони: «вантажиться» → скелет у формі списку/дошки,
   * «помилка» → ZoneError з «Повторити» всередині зони (шапка, KPI й
   * навігація лишаються робочими). «Не прочиталось» ≠ «порожньо» (ERR-01):
   * при збої читання задач список не показує порожнечу.
   */
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const loadAll = useCallback(async (retry = false) => {
    const [tr_, s, c, m] = await Promise.all([
      (retry ? retryStorageRead : loadDataResult)<Task[]>('tasks', []),
      loadData<Sprint[]>('sprints', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Meeting[]>('meetings', []),
    ]);
    setSprints(s); setColumns(c); setMeetings(m);
    if (!tr_.ok || !Array.isArray(tr_.value)) {
      if (__DEV__) console.warn('[project/tasks] задачі не прочитались:', tr_.ok ? 'не масив' : tr_.error);
      setLoadState('error');
      return;
    }
    setTasks(tr_.value);
    setLoadState('ready');
  }, []);
  const reloadAll = useCallback(() => loadAll(false), [loadAll]);

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  const trackWrite = useStorageRefresh(['tasks', 'sprints', 'task_statuses', 'meetings'], reloadAll);

  /**
   * Картка завдання — ТУТ, у просторі проєкту (DetailPane: колонка праворуч на
   * широкому вікні, аркуш на вужчому). Раніше тап вів на особистий екран
   * Завдань (`/(tabs)?open=`), і людина випадала з проєкту.
   */
  const { height: windowHeight } = useWindowDimensions();
  const detailScrollRef = useRef<InstanceType<typeof ScrollView> | null>(null);
  // Вибрана задача — у параметрі маршруту `?task=` (useZoneState).
  const selectedId = zoneState.selectedId;
  const setSelectedId = zoneState.select;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const [detailTab, setDetailTab] = useState<TaskDetailTab>('main');
  const selectTask = useCallback((task: Task, tab: TaskDetailTab = 'main') => {
    setSelectedId(task.id);
    setDetailTab(tab);
  }, [setSelectedId]);

  /**
   * Pull-to-refresh — справжній: іде на сервер (`refreshProjectNow`), а не
   * перечитує AsyncStorage. Саме його тут не було взагалі, і вкладка Завдань
   * проєкту лишалась на локальних даних, поки не спрацює поллінг.
   * Офлайн `refreshProjectNow` тихо виходить, і лишається перечитування
   * локальних даних — офлайн-режим нічого не ламає.
   */
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void (async () => {
      try {
        if (projectId) await refreshProjectNow(projectId);
      } catch (e) {
        if (__DEV__) console.warn('[project/tasks] оновлення не вдалося:', e);
      } finally {
        await loadAll();
        setRefreshing(false);
      }
    })();
  }, [projectId, loadAll]);

  const c = projectShellColors(isDark, project?.color ?? '#7C3AED',project?.appearance);
  // DS v2: поверхні карток/шторок — з токенів, а не з палітри оболонки.
  const t = dsTokens(isDark);

  const ownTasks = useMemo(
    () => (projectId ? projectDetailTasks(tasks, sprints, projectId) : []),
    [tasks, sprints, projectId],
  );
  const filtered = useMemo(
    () => ownTasks.filter(t => !t.backlogKind && t.title.toLowerCase().includes(query.toLowerCase()) && (!mineOnly||t.assigneeId===String(user?.id)) && t.status!=='done' && isProjectWork(t,columns) && (filter === 'all' || t.status === filter)),
    [ownTasks, filter, columns,query,mineOnly,user?.id],
  );

  // Omni KPI шапки — по ВСІЙ роботі проєкту (не по пошуку/«лише мої»):
  // відкриті · прострочені · виконані. Ті самі умови, що й `filtered`.
  const headerStats = useMemo(() => {
    const work = ownTasks.filter(task => !task.backlogKind && isProjectWork(task, columns));
    const open = work.filter(task => task.status !== 'done');
    return {
      open: open.length,
      overdue: open.filter(task => isOverdue(task)).length,
      done: work.length - open.length,
    };
  }, [ownTasks, columns]);

  // Годинник «щойно створених» для дошки (як на вебі, kanban-board.tsx):
  // хвилинний такт, щоб задача сама сходила з верху колонки, коли минає вікно
  // RECENTLY_CREATED_WINDOW_MS, а не лише на наступній зміні даних.
  const [boardNow, setBoardNow] = useState(() => Date.now());
  useEffect(() => {
    if (view !== 'board') return;
    setBoardNow(Date.now());
    const timer = setInterval(() => setBoardNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [view]);

  // Проєкт копіює власні статуси при створенні (contract §3.3); поки їх
  // немає (легасі-проєкт до цієї фази), дошка падає на особисті/типові —
  // порожня дошка гірша за неідеальну.
  const boardColumns = useMemo(() => {
    const scoped = mergeTaskStatusColumns(columns, projectId);
    return orderColumnsForList(scoped.length ? scoped : mergeTaskStatusColumns(columns));
  }, [columns, projectId]);

  const groupLabels: GroupLabels = useMemo(() => ({
    today: tr.today, yesterday: tr.yesterday, tomorrow: tr.tomorrow,
    withoutDeadline: tr.withoutDeadline, overdue: tr.overdueSection,
  }), [tr]);

  // Наради проєкту в межах активного місяця, розгорнуті по повторах — лише
  // якщо розділ «Наради» увімкнено (contract §3.3: модулі проєкту), інакше
  // календар задач показував би дані вимкненого розділу.
  const monthMeetings = useMemo(() => {
    if (!project || !projectModules(project).meetings) return [];
    const scoped = meetings.filter(m => m.projectId === project.id);
    return expandMeetings(scoped, startOfMonth(activeMonth), endOfMonth(activeMonth));
  }, [meetings, project, activeMonth]);

  const calendarGroups = useMemo(() => {
    const inMonth = filterTasksByMonth(filtered, activeMonth);
    return buildProjectCalendarDays(inMonth, monthMeetings, new Date(), groupLabels, locale);
  }, [filtered, activeMonth, monthMeetings, groupLabels, locale]);

  /**
   * Групування, яким список малюється НАСПРАВДІ.
   *
   * Порожній проєкт має показувати свої колонки, а не самий лише напис
   * «Задач ще немає»: колонки — це і структура проєкту, і єдине місце, де
   * першу задачу можна завести одразу в потрібному статусі. Поки задач
   * жодної, «без групи» і «за пріоритетом» не розрізняють нічого (групувати
   * нічого), тож список показує статуси; щойно з'явиться перша задача —
   * діє вибір людини, як і раніше.
   */
  const effectiveGroupBy: ProjectListGroupBy = useMemo(
    () => (filtered.length === 0 && (groupBy === 'none' || groupBy === 'priority') ? 'status' : groupBy),
    [filtered.length, groupBy],
  );

  const listGroups = useMemo(
    () => (projectId
      ? buildProjectListGroups(filtered, effectiveGroupBy, columns, sprints, projectId, {
        priorityNone: tr.priorityNone, sprintBacklog: tr.sprintBacklog,
      // Порожні секції СТАТУСУ лишаються: секція — це ще й місце, куди
      // задачу кладуть (тап відкриває інлайн-поле), а порожній проєкт має
      // показувати свої колонки, а не сам лише напис «Задач ще немає».
      // На спринти це не поширюється: там порожня група — це здебільшого
      // ЗАКРИТИЙ спринт, і десяток таких заголовків не місце для нової
      // задачі, а шум.
      }, { includeEmpty: effectiveGroupBy === 'status' })
      : []),
    [filtered, effectiveGroupBy, columns, sprints, projectId, tr.priorityNone, tr.sprintBacklog],
  );

  const timelineTasks = useMemo(
    () => [...filtered].sort((a, b) =>
      new Date(a.startDate ?? a.createdAt).getTime() - new Date(b.startDate ?? b.createdAt).getTime()),
    [filtered],
  );
  // Таймлайн задач ЦЬОГО проєкту, пофарбований у ЙОГО колір. (На екрані
  // списку проєктів Ганта більше немає — лише тут, у проєкті.)
  const ganttChart = useMemo(
    () => (project ? buildGantt(filtered, [project], { months: tr.monthsShort }) : null),
    [filtered, project, tr.monthsShort],
  );

  const projectForBadge = project ? [{ id: project.id, name: project.name, color: project.color }] : [];
  const priorityA11yFor = useCallback((task: Task) => {
    const level = normalizePriority(task);
    return level === null ? '' : tr.priorityA11y.replace('{level}', priorityLevelLabel(level));
  }, [tr]);

  const toggleTask = useCallback(async (task: Task) => {
    if (!taskRights(task,teamRole,String(user?.id??'')).execute) return;
    if(task.reviewRequired || task.resultRequirements?.length) {selectTask(task,'team');return;}
    let becameDone = false;
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => {
          if (t.id !== task.id) return t;
          becameDone = t.status !== 'done';
          const status = t.status === 'done' ? 'active' : 'done';
          // Колонка проєкту, що відповідає новому статусу — інакше швидка
          // відмітка тут міняла лише `status`, а `kanbanColumnId` лишався
          // старим, і задача «готово» стояла на дошці в колонці «todo»
          // назавжди (review finding).
          const fallback = scopedColumnFor(columns, projectId, status === 'done' ? 'done' : 'todo')?.id ?? t.kanbanColumnId;
          if (status === 'done') {
            return closeSubtasksOnDone(t, {
              ...t, status, kanbanColumnId: fallback,
              history: withReopenInfo(appendHistory(t, 'done'), t),
            });
          }
          // «Не готово» — назад у колонку, з якої завершили, і лише ті
          // підзавдання, що були відкриті (utils/taskCompletion.ts).
          return {
            ...t, status,
            kanbanColumnId: reopenColumnId(t, boardColumns, fallback),
            subtasks: reopenSubtasks(t),
            history: appendHistory(t, 'active'),
          };
        }));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.light();
      if (becameDone) await stopTimerForTask(task.id);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] відмітка не вдалася:', e);
    }
  }, [teamRole, user?.id, selectTask, trackWrite, stopTimerForTask, columns, projectId, boardColumns]);

  const openTask = useCallback((task: Task) => selectTask(task), [selectTask]);

  /**
   * Перенесення задачі в конкретну колонку статусу довгим натисканням картки
   * на дошці — review finding: «board view is read-only (no drag and no
   * status picker)». Без drag-n-drop (велика окрема функція для дошки), але
   * бодай перехід у будь-яку колонку без відкриття повного редактора.
   */
  /**
   * Задача, яку щойно перенесли В ПРОЄКТІ, видна і в моєму особистому
   * просторі (якщо призначена мені). Якщо в особистому немає статусу з тією ж
   * назвою (і немає копії чи збереженого зв'язку) — питаємо, під яким
   * статусом показувати такі задачі в особистому, і запам'ятовуємо відповідь.
   */
  const askPersonalStatusLink = useCallback((task: Task, column: TaskStatusColumn) => {
    if (!projectId || !column.projectId || !user?.id || task.assigneeId !== user.id) return;
    if (personalEquivalentStrict(column, columns)) return;
    const personal = mergeTaskStatusColumns(columns);
    Alert.alert(
      tr.statusLinkAskPersonalTitle,
      tr.statusLinkAskPersonalBody.replace('{name}', column.name).replace('{project}', project?.name ?? ''),
      [
        ...personal.map(target => ({
          text: target.name,
          onPress: () => void saveStatusLink(target, projectId, column.id),
        })),
        { text: tr.statusLinkKeepAsIs, style: 'cancel' as const },
      ],
    );
  }, [projectId, user?.id, columns, project?.name, tr]);

  const moveToColumn = useCallback(async (task: Task, column: TaskStatusColumn) => {
    if (!taskRights(task,teamRole,String(user?.id??'')).execute || column.id === task.kanbanColumnId) return;
    if(task.reviewRequired || (column.isDone && task.resultRequirements?.length)){selectTask(task,'team');return;}
    let becameDone = false;
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => {
          if (t.id !== task.id) return t;
          becameDone = column.isDone && t.status !== 'done';
          const history = appendHistory(t, column.isDone ? 'done' : 'active', column.name);
          return closeSubtasksOnDone(t, {
            ...t,
            status: column.isDone ? 'done' : 'active',
            kanbanColumnId: column.id,
            ...(!column.isDone && t.status === 'done' ? { subtasks: reopenSubtasks(t) } : {}),
            history: column.isDone ? withReopenInfo(history, t) : history,
          });
        }));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.light();
      if (becameDone) await stopTimerForTask(task.id);
      askPersonalStatusLink(task, column);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] перенесення в колонку не вдалося:', e);
    }
  }, [teamRole, user?.id, selectTask, trackWrite, stopTimerForTask, askPersonalStatusLink]);

  const openColumnPicker = useCallback((task: Task) => {
    Alert.alert(
      task.title,
      undefined,
      [
        ...boardColumns.map(column => ({
          text: column.name,
          onPress: () => void moveToColumn(task, column),
        })),
        { text: tr.cancel, style: 'cancel' as const },
      ],
    );
  }, [boardColumns, moveToColumn, tr.cancel]);

  /**
   * Єдина точка створення задачі на екрані: коротка форма (TaskQuickCreate) —
   * та сама, що на особистому екрані Завдань, але ТУТ, у проєкті: проєкт
   * зафіксований простором, спринт/дедлайн можуть прийти з маршруту.
   */
  const firstOpenColumnId = useMemo(
    () => boardColumns.find(col => !col.isDone)?.id ?? boardColumns[0]?.id ?? '',
    [boardColumns],
  );
  const composerReset = composer.reset;
  const openQuickCreate = useCallback((preset?: { deadline?: string; sprintId?: string | null }) => {
    if (!canEdit || !projectId) return;
    composerReset(firstOpenColumnId, {
      projectId,
      sprintId: preset?.sprintId ?? null,
      ...(preset?.deadline ? { deadline: preset.deadline } : {}),
    });
    setShowAdd(true);
  }, [canEdit, projectId, composerReset, firstOpenColumnId]);
  const openFullForm = useCallback(() => openQuickCreate(), [openQuickCreate]);

  /** Задача, картку якої треба відкрити, щойно аркуш створення зникне (NEW-02). */
  const [openAfterCreate, setOpenAfterCreate] = useState<string | null>(null);
  useEffect(() => {
    if (!openAfterCreate || showAdd) return;
    const id = openAfterCreate;
    const timer = setTimeout(() => {
      setOpenAfterCreate(null);
      setSelectedId(id);
      setDetailTab('main');
    }, 350);
    return () => clearTimeout(timer);
  }, [openAfterCreate, showAdd, setSelectedId]);

  const createTask = useCallback(async (): Promise<Task | null> => {
    const draft = composer.draft;
    if (!canEdit || !projectId || !draft.title.trim()) return null;
    const column = boardColumns.find(col => col.id === draft.statusId) ?? boardColumns.find(col => col.id === firstOpenColumnId);
    const me = user?.id ? String(user.id) : undefined;
    const base: Task = {
      id: Date.now().toString(),
      title: draft.title.trim(),
      description: draft.desc.trim(),
      ...priorityFields(draft.priorityLevel),
      status: column?.isDone ? 'done' : 'active',
      kanbanColumnId: column?.id,
      subtasks: [],
      createdAt: new Date().toISOString(),
      deadline: draft.deadline ?? undefined,
      projectId,
      createdBy: me,
      // Як в особистому екрані: нова задача — на мені (у «Команді» її
      // можна перепризначити). Учасник інакше й не може: сервер пускає
      // учасника створювати лише задачу на себе.
      assigneeId: me,
      timeEntries: [],
      history: [makeHistoryEvent('created')],
    };
    const created = applyFormSprint(base, sprints, draft.sprintId);
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => [created, ...fresh]);
        setTasks(updated);
      }, TASKS_KEY_ONLY);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] створення не вдалося:', e);
      return null;
    }
    haptic.success();
    composerReset(firstOpenColumnId, { projectId, sprintId: null });
    setShowAdd(false);
    return created;
  }, [composer.draft, canEdit, projectId, boardColumns, firstOpenColumnId, user?.id, sprints, trackWrite, composerReset]);

  const createAndOpen = useCallback(() => {
    void createTask().then(created => {
      if (!created) return;
      // Панель поруч — одразу; нижній аркуш — після того, як зникне аркуш
      // створення (NEW-02: два аркуші в одному тіку лишають мертвий шар).
      if (panelMode) { setSelectedId(created.id); setDetailTab('main'); }
      else setOpenAfterCreate(created.id);
    });
  }, [createTask, panelMode, setSelectedId]);

  // ?create=1 (календар/спринти/«Моя робота» проєкту) — форма тут же.
  useEffect(() => {
    if (createParam !== '1' || !projectId) return;
    openQuickCreate({ deadline: deadlineParam || undefined, sprintId: sprintParam || null });
    router.setParams({ create: '', deadline: '', sprintId: '' });
  }, [createParam, deadlineParam, sprintParam, projectId, openQuickCreate, router]);

  // ?open=<taskId>&tab= — картка задачі (календар, обговорення, «Моя робота»).
  useEffect(() => {
    if (!openParam) return;
    if (!tasks.some(t => t.id === openParam)) return;
    const tab: TaskDetailTab = tabParam === 'team' || tabParam === 'details' || tabParam === 'activity' ? tabParam : 'main';
    setSelectedId(openParam);
    setDetailTab(tab);
    router.setParams({ open: '', tab: '' });
  }, [openParam, tabParam, tasks, router, setSelectedId]);

  const saveDates = useCallback(async () => {
    if (!canEdit || !editingDates) return;
    const { id } = editingDates;
    // resolveTimelineDatePatch (utils/dateUtils.ts): порівнює з `orig*` —
    // значенням на момент відкриття форми, а не з тим, що вже в задачі —
    // і НЕ повертає поле, якого людина не торкалась (review finding:
    // правка лише старту мовчки зсувала дедлайн на день заходу через
    // round-trip `.slice(0,10)` ISO-рядка в UTC замість локальної дати).
    const patch = resolveTimelineDatePatch(editingDates);
    if (!patch.ok) {
      Alert.alert(tr.error, tr.invalidDateInput);
      return;
    }
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => {
          if (t.id !== id) return t;
          const next = { ...t };
          if ('startDate' in patch) next.startDate = patch.startDate ?? undefined;
          if ('deadline' in patch) next.deadline = patch.deadline ?? undefined;
          return next;
        }));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] збереження дат не вдалося:', e);
    }
    setEditingDates(null);
  }, [canEdit, editingDates, trackWrite, tr.error, tr.invalidDateInput]);

  /**
   * Тягнення краю смуги на Таймлайні (contract §3 «тягнення країв змінює
   * дати (планшет/веб)») — review finding, раніше геть не реалізоване.
   * `deltaDays` — від ProjectGantt, ЛИШЕ на відпускання пальця (жива позиція
   * під час тягнення — локальний стан компонента, сховище не чіпає).
   */
  const onGanttEdgeDrag = useCallback(async (taskId: string, edge: 'start' | 'end', deltaDays: number) => {
    if (!canEdit) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const patch = shiftGanttEdge(task, edge, deltaDays);
    if (!patch) return; // 0 днів, зіпсована дата, або зробило б тривалість від'ємною
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => (t.id !== taskId ? t : { ...t, ...patch })));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.light();
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] тягнення краю не вдалося:', e);
    }
  }, [canEdit, tasks, trackWrite]);

  /** Одна точка запису для картки: свіжий масив зі сховища + trackWrite. */
  const writeTask = useCallback(async (taskId: string, patch: (t: Task) => Task) => {
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => (t.id === taskId ? patch(t) : t)));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] правка картки не вдалася:', e);
    }
  }, [trackWrite]);

  const deleteTask = useCallback((task: Task) => {
    Alert.alert(tr.deletePermanently, `«${task.title}»\n${tr.cannotUndo}`, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          if (selectedIdRef.current === task.id) setSelectedId(null);
          void (async () => {
            try {
              await stopTimerForTask(task.id);
              await trackWrite(async () => {
                const updated = await updateSynced<Task>('tasks', fresh => fresh.filter(t => t.id !== task.id));
                setTasks(updated);
              }, TASKS_KEY_ONLY);
              // Undo — як на особистому екрані: той самий запис повертається.
              showToast(tr.taskDeleted, () => {
                void trackWrite(async () => {
                  const restored = await updateSynced<Task>('tasks', fresh => (fresh.some(t => t.id === task.id) ? fresh : [...fresh, task]));
                  setTasks(restored);
                }, TASKS_KEY_ONLY).catch(e => { if (__DEV__) console.warn('[project/tasks] відновлення не вдалося:', e); });
              });
            } catch (e) {
              if (__DEV__) console.warn('[project/tasks] видалення не вдалося:', e);
            }
          })();
        },
      },
    ]);
  }, [tr, trackWrite, stopTimerForTask, showToast, setSelectedId]);

  // ─── Свайп рядка й масовий вибір (Layout System v2.4) ────────────────────
  // Ті самі права, що й з картки: відмітити — `taskRights().execute`,
  // видалити — лише лід (як кнопка «Видалити» у футері useProjectTaskCard).
  const myId = String(user?.id ?? '');
  const canExecuteTask = useCallback((task: Task) => taskRights(task, teamRole, myId).execute, [teamRole, myId]);
  const canDeleteTask = useCallback((task: Task) => canExecuteTask(task) && isLead(teamRole), [canExecuteTask, teamRole]);

  /** Свайп вліво: «В архів» (= виконано, завершені йдуть в Архів проєкту) і «Видалити». */
  const swipeActionsFor = useCallback((task: Task): SwipeAction[] => [
    ...(task.status !== 'done' && canExecuteTask(task)
      ? [{ key: 'archive', label: tr.archive, icon: 'archivebox.fill' as const, tone: 'success' as const, onPress: () => { void toggleTask(task); }, testID: `swipe-archive-${task.id}` }]
      : []),
    ...(canDeleteTask(task)
      ? [{ key: 'delete', label: tr.delete, icon: 'trash.fill' as const, tone: 'danger' as const, onPress: () => deleteTask(task), testID: `swipe-delete-${task.id}` }]
      : []),
  ], [canExecuteTask, canDeleteTask, toggleTask, deleteTask, tr.archive, tr.delete]);

  /** Масовий вибір: довгий тап по рядку списку; далі тапи додають/знімають. */
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);
  const toggleBulk = useCallback((task: Task) => {
    haptic.light();
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id); else next.add(task.id);
      return next;
    });
  }, []);
  // Вибір не переживає зміну режиму (на дошці довгий тап — перенесення).
  useEffect(() => { if (view !== 'list') clearBulk(); }, [view, clearBulk]);
  const bulkTasks = useMemo(() => tasks.filter(t => bulkIds.has(t.id)), [tasks, bulkIds]);

  /**
   * «Виконано» для набору — та сама toggleTask по черзі (права, колонка
   * «готово», зупинка таймера). Задачі з перевіркою/вимогами до результату
   * пропускаємо: їх закривають у картці, вкладка «Команда».
   */
  const bulkMarkDone = useCallback(async () => {
    const targets = bulkTasks.filter(t => t.status !== 'done' && canExecuteTask(t) && !t.reviewRequired && !t.resultRequirements?.length);
    clearBulk();
    for (const t of targets) await toggleTask(t);
  }, [bulkTasks, canExecuteTask, clearBulk, toggleTask]);

  /** Перенесення набору в колонку — те саме moveToColumn, що й довгий тап на дошці. */
  const bulkMove = useCallback(() => {
    const targets = bulkTasks.filter(canExecuteTask);
    if (!targets.length) return;
    Alert.alert(tr.statusLabel, `${targets.length} × ${tr.tasks}`, [
      ...boardColumns.map(column => ({
        text: column.name,
        onPress: () => {
          clearBulk();
          void (async () => { for (const t of targets) await moveToColumn(t, column); })();
        },
      })),
      { text: tr.cancel, style: 'cancel' as const },
    ]);
  }, [bulkTasks, canExecuteTask, boardColumns, moveToColumn, clearBulk, tr.statusLabel, tr.tasks, tr.cancel]);

  /** Видалення набору: одне підтвердження, зупинка таймерів, один undo на весь набір. */
  const bulkDelete = useCallback(() => {
    const doomed = bulkTasks.filter(canDeleteTask);
    if (!doomed.length) return;
    Alert.alert(
      tr.deletePermanently,
      doomed.length === 1 ? `«${doomed[0].title}»\n${tr.cannotUndo}` : `${doomed.length} × ${tr.tasks}\n${tr.cannotUndo}`,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.delete,
          style: 'destructive',
          onPress: () => {
            const ids = new Set(doomed.map(t => t.id));
            clearBulk();
            if (selectedIdRef.current && ids.has(selectedIdRef.current)) setSelectedId(null);
            void (async () => {
              try {
                for (const t of doomed) await stopTimerForTask(t.id);
                await trackWrite(async () => {
                  const updated = await updateSynced<Task>('tasks', fresh => fresh.filter(t => !ids.has(t.id)));
                  setTasks(updated);
                }, TASKS_KEY_ONLY);
                showToast(tr.taskDeleted, () => {
                  void trackWrite(async () => {
                    const restored = await updateSynced<Task>('tasks', fresh => [...fresh, ...doomed.filter(t => !fresh.some(x => x.id === t.id))]);
                    setTasks(restored);
                  }, TASKS_KEY_ONLY).catch(e => { if (__DEV__) console.warn('[project/tasks] відновлення набору не вдалося:', e); });
                });
              } catch (e) {
                if (__DEV__) console.warn('[project/tasks] масове видалення не вдалося:', e);
              }
            })();
          },
        },
      ],
    );
  }, [bulkTasks, canDeleteTask, clearBulk, setSelectedId, stopTimerForTask, trackWrite, showToast, tr]);

  const bulkActions = useMemo<BulkAction[]>(() => [
    { key: 'done', label: tr.completed, icon: 'checkmark.circle.fill', onPress: () => { void bulkMarkDone(); }, disabled: !bulkTasks.some(t => t.status !== 'done' && canExecuteTask(t)), testID: 'project-bulk-done' },
    { key: 'move', label: tr.statusLabel, icon: 'square.grid.2x2', onPress: bulkMove, disabled: !bulkTasks.some(canExecuteTask), testID: 'project-bulk-move' },
    { key: 'delete', label: tr.delete, icon: 'trash.fill', tone: 'danger', onPress: bulkDelete, disabled: !bulkTasks.some(canDeleteTask), testID: 'project-bulk-delete' },
  ], [tr.completed, tr.statusLabel, tr.delete, bulkMarkDone, bulkMove, bulkDelete, bulkTasks, canExecuteTask, canDeleteTask]);

  /** Тап по рядку: у режимі вибору — перемикає вибір, інакше відкриває картку. */
  const pressTask = useCallback((task: Task) => {
    if (selectionMode) { toggleBulk(task); return; }
    openTask(task);
  }, [selectionMode, toggleBulk, openTask]);
  const longPressTask = useCallback((task: Task) => {
    haptic.light();
    setBulkIds(prev => new Set(prev).add(task.id));
  }, []);

  const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) ?? null : null;
  const cardColors = { ...c, sheet: glassOf(t).sheet };
  const card = useProjectTaskCard({
    task: selectedTask,
    projectId: projectId ?? '',
    projectName: project?.name ?? '',
    projectColor: project?.color ?? c.accent,
    role: teamRole,
    boardColumns,
    allColumns: columns,
    sprints,
    write: writeTask,
    onDelete: deleteTask,
    onMoved: name => showToast(tr.taskMovedToProject.replace('{project}', name)),
    onClose: () => setSelectedId(null),
    // Ручку малює нижній аркуш зони (BottomSheet), панель iPad її не має.
    wide: true,
    tab: detailTab,
    onTabChange: setDetailTab,
    colors: cardColors,
    isDark,
  });

  /**
   * Права колонка без вибраного завдання — «Сьогодні» проєкту: наради дня
   * цього проєкту й графік активності (той самий TasksTodayPane, що на
   * екрані Завдань), а не порожнеча. Завдання — лише в списку ліворуч.
   */
  const todayKey = localDateKey(new Date());
  const todayPaneMeetings = useMemo(() => {
    if (!project || !projectModules(project).meetings) return [];
    return orderTodayMeetings(meetingsOnDate(meetings.filter(m => m.projectId === project.id), new Date()), new Date());
    // todayKey — тригер перерахунку на зміну дня.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, project, todayKey]);
  /** Відстежений час лише цього проєкту: його завдання, наради й таймери. */
  const todayPaneActivity = useMemo(() => ({
    tasks: ownTasks,
    meetings: project ? meetings.filter(m => m.projectId === project.id) : [],
    timers: activeTimers.filter(t => t.projectId === projectId),
  }), [ownTasks, meetings, project, activeTimers, projectId]);

  /**
   * Меню «⋯» (той самий патерн, що в особистих Завданнях): вигляд,
   * групування списку, «лише призначені мені», календар і архів проєкту.
   * Окремих іконок у шапці більше немає.
   */
  const menuItems: TasksMenuItem[] = [
    { key: 'view-list', icon: 'list.bullet', label: tr.projectViewList, checked: view === 'list', onPress: () => setView('list'), color: c.accent },
    { key: 'view-board', icon: 'square.grid.2x2', label: tr.projectViewBoard, checked: view === 'board', onPress: () => setView('board'), color: c.accent },
    ...(view === 'list' ? GROUP_BY_OPTIONS.map((opt, index) => ({
      key: `group-${opt.key}`,
      icon: 'rectangle.3.group' as const,
      label: `${tr.projectGroupByLabel} ${opt.key === 'none' ? tr.projectGroupByNone
        : opt.key === 'status' ? tr.sortStatus
        : opt.key === 'priority' ? tr.sortPriority
        : tr.sprints}`,
      checked: groupBy === opt.key,
      onPress: () => setGroupBy(opt.key),
      separatorBefore: index === 0,
    })) : []),
    { key: 'mine', icon: 'person.fill', label: tr.projectTasksMine, checked: mineOnly, onPress: () => setMineOnly(v => !v), separatorBefore: true },
    { key: 'calendar', icon: 'calendar', label: tr.calendar, color: t.status.info, onPress: () => router.push(projectRoute(projectId, 'calendar') as never), separatorBefore: true },
    { key: 'archive', icon: 'archivebox', label: tr.projectArchive, color: t.status.success, onPress: () => router.push(projectRoute(projectId, 'archive') as never) },
  ];
  const menuActive = mineOnly || groupBy !== 'none' || view !== 'list';

  /** Картка в списку: свайп вліво (архів/видалення) і масовий вибір. */
  const renderListCard = (task: Task) => (
    <SwipeRow key={task.id} actions={swipeActionsFor(task)} enabled={!selectionMode} radius={radius.nested} testID={`project-task-row-${task.id}`}>
      {a11y => (
        <TaskCompactCard
          hideProject
          task={task}
          statusColumn={boardColumnForTask(task, boardColumns, columns) ?? boardColumns[0]}
          onPress={pressTask}
          onToggle={toggleTask}
          onLongPress={longPressTask}
          c={c}
          isDark={isDark}
          projects={projectForBadge}
          sprints={sprints}
          overdueLabel={tr.overdueSection}
          priorityLabel={priorityA11yFor(task)}
          subtasksLabel={tr.subtasks}
          assigneeLabel={assigneeLabelFor(task)}
          priorityPlacement="corner"
          selected={bulkIds.has(task.id)}
          selectionMode={selectionMode}
          rowAccessibilityActions={selectionMode ? undefined : a11y.accessibilityActions}
          onRowAccessibilityAction={selectionMode ? undefined : a11y.onAccessibilityAction}
        />
      )}
    </SwipeRow>
  );

  /** Колонки дошки (KanbanPager): ті самі відфільтровані задачі, порядок дошки. */
  const kanbanColumns = useMemo(() => {
    if (view !== 'board') return [] as (KanbanColumn & { all: Task[]; visible: Task[] })[];
    return boardColumns.map(col => {
      // За isDone, а не завжди boardColumns[0] — інакше легасі-задача з
      // висячим kanbanColumnId опинялась у ПЕРШІЙ колонці (review finding).
      const all = filtered.filter(t => boardColumnForTask(t, boardColumns, columns)?.id === col.id);
      // Рішення власника (п. 7+8, паритет з вебом): щойно створені — першими.
      const visible = limitBoardColumn(all, boardNow).visible.slice(0, 5);
      return { key: col.id, title: col.name, color: col.color, count: all.length, all, visible };
    });
  }, [view, boardColumns, filtered, columns, boardNow]);

  /** Пошук/«лише мої» нічого не знайшли — порожній стан з однією дією. */
  const filteredEmpty = loadState === 'ready' && filtered.length === 0 && (!!query || mineOnly);
  const resetSearch = () => { setQuery(''); setMineOnly(false); };
  const listBottom = tabBarInset + (showFab ? FAB_LIST_CLEARANCE : 40);

  let mainBody: React.ReactNode;
  if (loadState === 'loading') {
    mainBody = <ZoneSkeleton variant={view === 'board' ? 'columns' : 'list'} style={{ paddingHorizontal: 20, paddingTop: 8 }} />;
  } else if (loadState === 'error') {
    mainBody = <ZoneError testID="project-tasks-error" onRetry={() => { setLoadState('loading'); void loadAll(true); }} />;
  } else if (filteredEmpty) {
    mainBody = (
      <ZoneEmpty
        testID="project-tasks-empty"
        icon="magnifyingglass"
        title={tr.projectNoTasks}
        actionLabel={tr.resetFilter}
        onAction={resetSearch}
      />
    );
  } else if (view === 'board') {
    mainBody = (
      // «Колонки»: телефон — одна колонка на екран зі свайпом і крапками
      // (рішення 06), планшет — колонки поруч. Перетягування між колонками
      // немає — довгий тап по картці відкриває вибір колонки (openColumnPicker).
      <KanbanPager
        testID="project-tasks-kanban"
        columns={kanbanColumns}
        paging={!isWide}
        contentBottom={listBottom}
        renderColumn={col => (
          <>
            {col.visible.map(task => (
              <TaskCompactCard
                hideProject
                key={task.id}
                task={task}
                statusColumn={boardColumns.find(b => b.id === col.key) ?? boardColumns[0]}
                onPress={openTask}
                onToggle={toggleTask}
                onLongPress={canEdit ? openColumnPicker : undefined}
                c={c}
                isDark={isDark}
                projects={projectForBadge}
                sprints={sprints}
                overdueLabel={tr.overdueSection}
                priorityLabel={priorityA11yFor(task)}
                subtasksLabel={tr.subtasks}
                assigneeLabel={assigneeLabelFor(task)}
                priorityPlacement="corner"
              />
            ))}
            {col.all.length > col.visible.length && (
              <TouchableOpacity accessibilityRole="button" onPress={() => setView('list')} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: c.text, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>{tr.projectBoardShowAll}</Text>
              </TouchableOpacity>
            )}
            {/* Порожня колонка — простий текст-підказка (рішення власника,
                п. 3): створення має одну точку на екрані. */}
            {col.all.length === 0 && (
              <Text style={[st.emptyHint, { color: c.sub, backgroundColor: t.surface.subtle }]}>{tr.projectNoTasksInGroup}</Text>
            )}
          </>
        )}
      />
    );
  } else {
    mainBody = (
      <ScrollView
        // L3: перший тап по чипу/рядку з відкритою клавіатурою пошуку інакше
        // лише ховає клавіатуру. (Аудит простору проєкту читає ПЕРШИЙ тег
        // ScrollView до першого символу «більше», тож проп стоїть першим.)
        keyboardShouldPersistTaps="handled"
        // Телефон: під списком місце для «+», щоб вона не накривала останню
        // картку. На планшеті список займає всю головну зону (вона завжди
        // найширша) — без центрування вузькою колонкою.
        contentContainerStyle={[isWide ? null : contentWidth, { paddingHorizontal: 20, paddingBottom: listBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {view === 'list' && (
          <>
            {/* Групування (contract §3) — у меню «⋯»; 'none' — плаский список. */}
            {effectiveGroupBy === 'none' ? (
              <View style={{ gap: 8 }}>
                {filtered.map(renderListCard)}
              </View>
            ) : listGroups.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tr.projectNoTasks}</Text>
            ) : (
              <View style={{ gap: 16 }}>
                {listGroups.map(group => (
                  <View key={group.key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <Text accessibilityRole="header" style={[type.h2, { color: c.text }]}>{group.label}</Text>
                      <View style={[st.countPill, { backgroundColor: t.surface.card }]}>
                        <Text style={[type.caption, type.numeric, { color: c.sub, fontFamily: fontFamily.semibold }]}>{group.tasks.length}</Text>
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      {group.tasks.map(renderListCard)}
                      {/* Порожня секція — лише підказка, не кнопка: створення
                          має одну точку на екрані (плаваюча «+»). */}
                      {group.tasks.length === 0 && (
                        <Text style={[st.emptyHint, { color: c.sub, backgroundColor: t.surface.card }]}>{tr.projectNoTasksInGroup}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {view === 'calendar' && (
          <>
            <MonthPicker
              month={activeMonth}
              onChange={setActiveMonth}
              months={tr.months}
              monthsGenitive={tr.monthsGenitive}
              accentColor={c.accent}
              textColor={c.text}
              subColor={c.sub}
              dimColor={c.dim}
              borderColor={c.border}
            />
            {calendarGroups.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 24 }}>{tr.projectNoTasks}</Text>
            ) : calendarGroups.map(group => (
              <View key={group.key} style={{ marginTop: 16 }}>
                <Text style={[type.caption, { color: c.sub, fontFamily: fontFamily.semibold, marginBottom: 6 }]}>{group.label}</Text>
                {group.meetings.map(meeting => (
                  <TouchableOpacity
                    key={meeting.id}
                    onPress={() => router.push({ pathname: '/project/[id]/calendar', params: { id: projectId, open: meeting._origId ?? meeting.id } } as never)}
                    activeOpacity={0.75}
                    style={[st.meetingRow, { backgroundColor: t.surface.card, marginBottom: 6 }]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meeting.color }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{meeting.title}</Text>
                    {meeting.time ? <Text style={[type.caption, type.numeric, { color: c.sub }]}>{meeting.time}</Text> : null}
                    <IconSymbol name="calendar" size={12} color={c.sub} />
                  </TouchableOpacity>
                ))}
                {group.tasks.map(task => (
                  <View key={task.id} style={{ marginBottom: 6 }}>
                    <TaskCompactCard
                      hideProject
                      task={task}
                      statusColumn={boardColumnForTask(task, boardColumns, columns) ?? boardColumns[0]}
                      onPress={openTask}
                      onToggle={toggleTask}
                      c={c}
                      isDark={isDark}
                      projects={projectForBadge}
                      sprints={sprints}
                      overdueLabel={tr.overdueSection}
                      priorityLabel={priorityA11yFor(task)}
                      subtasksLabel={tr.subtasks}
                      assigneeLabel={assigneeLabelFor(task)}
                      priorityPlacement="corner"
                    />
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {view === 'timeline' && (
          timelineTasks.length === 0 ? (
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tr.projectNoTasks}</Text>
          ) : (
            <View style={{ gap: 10 }}>
              {/* Той самий графік, що на аналітиці списку проєктів — тут
                  звужений до цього проєкту. Тягнення країв (планшет/веб)
                  реалізоване — `onGanttEdgeDrag`/`shiftGanttEdge` вище (див.
                  коментар угорі файлу); дати також редагуються текстом у
                  рядку під графіком (усі розміри екрана). */}
              {ganttChart ? (
                <View style={{ borderRadius: radius.cardCompact, backgroundColor: t.surface.card, padding: 16, marginBottom: 6 }}>
                  <ProjectGantt
                    chart={ganttChart}
                    wide={isWide}
                    palette={{ text: c.text, sub: c.sub, border: c.border }}
                    onEdgeDrag={onGanttEdgeDrag}
                  />
                </View>
              ) : null}
              {timelineTasks.map(task => {
                const editing = editingDates?.id === task.id;
                return (
                  <View key={task.id}>
                    <TouchableOpacity
                      onPress={taskRights(task,teamRole,String(user?.id??'')).plan ? () => setEditingDates(editing ? null : {
                        id: task.id,
                        // localDateKey (не `.slice(0, 10)` рядка ISO, який
                        // читає УТС-компоненти): для UTC+2/+3 (Україна)
                        // збережена північ учора-в-UTC — це вже сьогодні
                        // локально, і зріз ISO показував би вчорашню дату
                        // (review finding — поле переднаповнювалось на день
                        // раніше, і «Зберегти» без правок відкочувало дату).
                        start: task.startDate ? localDateKey(new Date(task.startDate)) : '',
                        deadline: task.deadline ? localDateKey(new Date(task.deadline)) : '',
                        origStart: task.startDate ? localDateKey(new Date(task.startDate)) : '',
                        origDeadline: task.deadline ? localDateKey(new Date(task.deadline)) : '',
                      }) : undefined}
                      accessibilityRole="button"
                      accessibilityLabel={task.title}
                      style={[st.timelineRow, { backgroundColor: t.surface.card }]}>
                      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{task.title}</Text>
                      <IconSymbol name="calendar" size={14} color={c.sub} />
                    </TouchableOpacity>
                    {editing ? (
                      <View style={[st.dateEditRow, { backgroundColor: c.dim }]}>
                        <TextInput
                          placeholder={tr.dateInputFormatHint}
                          placeholderTextColor={t.text.muted}
                          value={editingDates.start}
                          onChangeText={v => setEditingDates(prev => (prev ? { ...prev, start: v } : prev))}
                          style={[st.dateInput, { color: c.text, backgroundColor: t.surface.card }]}
                        />
                        <TextInput
                          placeholder={tr.dateInputFormatHint}
                          placeholderTextColor={t.text.muted}
                          value={editingDates.deadline}
                          onChangeText={v => setEditingDates(prev => (prev ? { ...prev, deadline: v } : prev))}
                          style={[st.dateInput, { color: c.text, backgroundColor: t.surface.card }]}
                        />
                        <ActionButton label={tr.save} tone="primary" onPress={saveDates} colors={c} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    );
  }

  /** Відкрита картка: на iPad з вимкненою панеллю (три крапки → «фокус») — ні. */
  const detailOpen = !!selectedTask && (!panelMode || zoneState.panels.dynamic);

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.tabTasks}
      actions={projectId ? (
        <>
          {/* Порядок дій шапки — однаковий у всіх розділах проєкту: стан синку,
              меню «⋯». Створення — плаваюча «+» (Layout System v2.4). */}
          <ProjectSyncIndicator projectId={projectId} accent={c.accent} subColor={c.sub} dimColor={c.dim} />
          <TasksMenuButton onPress={() => setShowMenu(true)} label={tr.projectTasksMenu} active={menuActive} colors={c} />
        </>
      ) : undefined}
      kpis={
        <>
          <KpiCounter value={headerStats.open} label={tr.projectTasks} />
          <KpiCounter
            value={headerStats.overdue}
            label={tr.projectOverdueTasks}
            valueColor={headerStats.overdue > 0 ? t.status.danger : undefined}
          />
          <KpiCounter value={headerStats.done} label={tr.completed} />
        </>
      }
      tabs={
        // Omni: вид розділу — pill-вкладки (Список · Дошка). Той самий стан
        // `view`, що й пункти меню «⋯»: меню лишається, вкладки — коротший шлях.
        <SectionTabs
          tabs={[
            { key: 'list', label: tr.projectViewList, icon: 'list.bullet' },
            { key: 'board', label: tr.projectViewBoard, icon: 'square.grid.2x2' },
          ]}
          value={view === 'board' ? 'board' : 'list'}
          onChange={key => setView(key)}
          accessibilityLabel={tr.projectTasksMenu}
          bleed={isWide ? 0 : 20}
        />
      }
      headerChildren={
        // Пошук — під заголовком, нерухомо над списком (як фільтр-рядок
        // особистих Завдань на планшеті). «Лише мої» видно чипом, поки увімкнено.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[st.search, { backgroundColor: t.surface.card }]}>
            <IconSymbol name="magnifyingglass" size={16} color={c.sub} />
            <TextInput
              accessibilityLabel={tr.projectTasksSearch}
              placeholder={tr.projectTasksSearch}
              placeholderTextColor={t.text.muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: fontFamily.regular, paddingVertical: 0 }}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={tr.clear} style={st.clearBtn}>
                <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
              </TouchableOpacity>
            ) : null}
          </View>
          {mineOnly ? (
            <TouchableOpacity
              onPress={() => setMineOnly(false)}
              accessibilityRole="button"
              accessibilityLabel={`${tr.projectTasksMine}. ${tr.resetFilter}`}
              style={[st.mineChip, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="person.fill" size={12} color={t.text.onAction} />
              <IconSymbol name="xmark" size={10} color={t.text.onAction} />
            </TouchableOpacity>
          ) : null}
        </View>
      }
      zone={{
        ...taskCardZone({
          card,
          open: detailOpen,
          onClose: () => setSelectedId(null),
          label: selectedTask?.title,
          scrollRef: detailScrollRef,
        }),
        /**
         * Статична зона — «Сьогодні» проєкту: наради дня й графік активності
         * (той самий TasksTodayPane, що на екрані Завдань). Поруч зі списком —
         * лише на дуже широкому вікні; інакше контекст дня — вкладка
         * «Сьогодні» і Календар проєкту.
         */
        static: (
          <TasksTodayPane
            today={today}
            locale={locale}
            meetings={todayPaneMeetings}
            activitySources={todayPaneActivity}
            onOpenMeeting={meeting => router.push({
              pathname: '/project/[id]/calendar',
              params: { id: projectId, open: meeting._origId ?? meeting.id },
            } as never)}
            onOpenCalendar={() => router.push(projectRoute(projectId, 'calendar') as never)}
            colors={{ ...c, dim: t.surface.subtle }}
            tr={tr}
          />
        ),
        showStatic: zoneState.panels.static,
        // Три крапки під списком (планшет): статична зона · головна · деталі.
        panels: isWide ? zoneState.panels : undefined,
        onTogglePanel: zoneState.togglePanel,
        fab: showFab && !toastVisible && !selectionMode ? (
          <AddTaskFab label={tr.projectAddTask} onPress={openFullForm} color={c.accent} bottom={tabBarInset + 20} />
        ) : null,
        overlay: (
          <BulkActionBar
            testID="project-tasks-bulk-bar"
            count={bulkIds.size}
            actions={bulkActions}
            onClear={clearBulk}
            bottom={tabBarInset + 16}
          />
        ),
        testID: 'project-tasks-zones',
      }}>
      {mainBody}

      <TasksHeaderMenu visible={showMenu} onClose={() => setShowMenu(false)} items={menuItems} colors={c} isDark={isDark} />

      {/* Швидке створення — та сама коротка форма, що в особистих Завданнях. */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} handle="inside">
        <View style={[st.quickSheet, { maxHeight: windowHeight * 0.88, backgroundColor: cardColors.sheet }]}>
          {/* «Брудне скло» (Layout System v2.4): блюр + тонування + зерно. */}
          <OverlayMaterial isDark={isDark} />
          <SheetHandle />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TaskQuickCreate
              editor={composer}
              pickableProjects={projectForBadge}
              projects={projectForBadge}
              projectLocked
              sprints={sprints}
              today={today}
              onSave={() => { void createTask(); }}
              onMore={createAndOpen}
              colors={cardColors}
              isDark={isDark}
              locale={locale}
            />
          </ScrollView>
        </View>
      </SheetModal>

      {toastElement}
    </ProjectScreenShell>
  );
}

const st = StyleSheet.create({
  search: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingLeft: 16 },
  clearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mineChip: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12 },
  quickSheet: { borderRadius: radius.card, padding: 24, overflow: 'hidden' },
  boardColumn: { width: 280, borderRadius: radius.card, padding: 10 },
  boardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.pill },
  statusRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  countPill: { minWidth: 24, height: 22, paddingHorizontal: 8, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.nested, padding: 12 },
  meetingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.nested, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  dateEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.nested, padding: 8, marginTop: 6 },
  dateInput: { flex: 1, minHeight: 44, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 6, fontSize: 13, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] },
  emptyHint: { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', borderRadius: radius.nested, overflow: 'hidden', paddingVertical: 16, paddingHorizontal: 12 },
});
