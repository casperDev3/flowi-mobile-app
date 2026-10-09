import {isProjectWork} from '@/utils/projectBacklog';
import { Atlas } from '@/constants/atlas';
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
 * Повна картка задачі (підзавдання, таймер, спринт, нагадування) живе ТУТ,
 * у просторі проєкту: `selectTask` відкриває її в ListDetailLayout (колонка
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
import { TASK_CARD_SHEET_RATIO } from '@/components/tasks/card/primitives';
import { TasksHeaderMenu, TasksMenuButton, type TasksMenuItem } from '@/components/tasks/TasksHeaderMenu';
import { BlurView } from 'expo-blur';
import { ActionButton } from '@/components/shared/ActionBar';
import { useTaskEditor } from '@/hooks/use-task-editor';
import { useToday } from '@/hooks/use-today';
import { appendHistory, makeHistoryEvent } from '@/utils/taskHistory';
import { reopenColumnId, reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import { applyFormSprint } from '@/utils/sprintUtils';
import { priorityFields } from '@/utils/taskUtils';
import { ListDetailLayout, useListDetail } from '@/components/shared/ListDetailLayout';
import { useProjectTaskCard } from '@/components/projects/ProjectTaskCard';
import { TasksTodayPane } from '@/components/tasks/TasksTodayPane';
import type { TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { ProjectGantt } from '@/components/projects/ProjectGantt';
import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectSyncIndicator } from '@/components/projects/ProjectSyncIndicator';
import { AddTaskFab, AddTaskHeaderButton, FAB_LIST_CLEARANCE } from '@/components/tasks/AddTaskButton';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useProjectRouteId } from '@/hooks/use-project-route-id';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useProject } from '@/hooks/use-project';
import { useProjectMembers } from '@/hooks/use-project-members';
import { useProjectRole } from '@/hooks/use-project-role';
import { useResponsive } from '@/hooks/use-responsive';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { projectRoute } from '@/constants/projectNav';
import { useI18n } from '@/store/i18n';
import { refreshProjectNow } from '@/store/project-sync';
import { loadData } from '@/store/storage';
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
import { taskRights } from '@/utils/teamwork';
import { useAuth } from '@/store/auth';
import {
  assigneeDisplayName, closeSubtasksOnDone,
  filterTasksByMonth, priorityLabel as priorityLevelLabel,
  normalizePriority, type Filter, type Task,
} from '@/utils/taskUtils';
import { type Sprint } from '@/utils/sprintUtils';
import { limitBoardColumn } from '@/utils/taskGroupLimit';

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
  const { isWide } = useResponsive();
  /** Телефон: одна кнопка створення — FAB; на планшеті вона в шапці. */
  const showFab = !isWide && canEdit;
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
  const [view, setView] = useState<ViewMode>('list');
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

  const loadAll = useCallback(async () => {
    const [t, s, c, m] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Sprint[]>('sprints', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Meeting[]>('meetings', []),
    ]);
    setTasks(t); setSprints(s); setColumns(c); setMeetings(m);
  }, []);

  useFocusEffect(useCallback(() => { void loadAll(); }, [loadAll]));
  const trackWrite = useStorageRefresh(['tasks', 'sprints', 'task_statuses', 'meetings'], loadAll);

  /**
   * Картка завдання — ТУТ, у просторі проєкту (DetailPane: колонка праворуч на
   * широкому вікні, аркуш на вужчому). Раніше тап вів на особистий екран
   * Завдань (`/(tabs)?open=`), і людина випадала з проєкту.
   */
  const listDetail = useListDetail();
  const { height: windowHeight } = useWindowDimensions();
  const detailScrollRef = useRef<InstanceType<typeof ScrollView> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<TaskDetailTab>('main');
  const selectTask = useCallback((task: Task, tab: TaskDetailTab = 'main') => {
    setSelectedId(task.id);
    setDetailTab(tab);
  }, []);

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

  const ownTasks = useMemo(
    () => (projectId ? projectDetailTasks(tasks, sprints, projectId) : []),
    [tasks, sprints, projectId],
  );
  const filtered = useMemo(
    () => ownTasks.filter(t => !t.backlogKind && t.title.toLowerCase().includes(query.toLowerCase()) && (!mineOnly||t.assigneeId===String(user?.id)) && t.status!=='done' && isProjectWork(t,columns) && (filter === 'all' || t.status === filter)),
    [ownTasks, filter, columns,query,mineOnly,user?.id],
  );

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
  }, [openAfterCreate, showAdd]);

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
      if (listDetail.wide) { setSelectedId(created.id); setDetailTab('main'); }
      else setOpenAfterCreate(created.id);
    });
  }, [createTask, listDetail.wide]);

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
  }, [openParam, tabParam, tasks, router]);

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
          setSelectedId(null);
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
  }, [tr, trackWrite, stopTimerForTask, showToast]);

  const selectedTask = selectedId ? tasks.find(t => t.id === selectedId) ?? null : null;
  const cardColors = { ...c, sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)' };
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
    wide: listDetail.wide,
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
    { key: 'calendar', icon: 'calendar', label: tr.calendar, color: '#6366F1', onPress: () => router.push(projectRoute(projectId, 'calendar') as never), separatorBefore: true },
    { key: 'archive', icon: 'archivebox', label: tr.projectArchive, color: '#10B981', onPress: () => router.push(projectRoute(projectId, 'archive') as never) },
  ];
  const menuActive = mineOnly || groupBy !== 'none' || view !== 'list';

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.tabTasks}
      actions={projectId ? (
        <>
          {/* Порядок дій шапки — однаковий у всіх розділах проєкту: стан синку,
              створення (лише планшет; на телефоні — FAB), меню «⋯». */}
          <ProjectSyncIndicator projectId={projectId} accent={c.accent} subColor={c.sub} dimColor={c.dim} />
          {isWide && canEdit && (
            <AddTaskHeaderButton label={tr.projectAddTask} onPress={openFullForm} color={c.accent} />
          )}
          <TasksMenuButton onPress={() => setShowMenu(true)} label={tr.projectTasksMenu} active={menuActive} colors={c} />
        </>
      ) : undefined}
      headerChildren={
        // Пошук — під заголовком, нерухомо над списком (як фільтр-рядок
        // особистих Завдань на планшеті). «Лише мої» видно чипом, поки увімкнено.
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[st.search, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="magnifyingglass" size={15} color={c.sub} />
            <TextInput
              accessibilityLabel={tr.projectTasksSearch}
              placeholder={tr.projectTasksSearch}
              placeholderTextColor={c.sub}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={{ flex: 1, color: c.text, fontSize: 15, paddingVertical: 0 }}
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
              style={[st.mineChip, { borderColor: c.accent, backgroundColor: c.accent + '18' }]}>
              <IconSymbol name="person.fill" size={12} color={c.accent} />
              <IconSymbol name="xmark" size={10} color={c.accent} />
            </TouchableOpacity>
          ) : null}
        </View>
      }>
      <ListDetailLayout
        open={!!selectedTask}
        onClose={() => setSelectedId(null)}
        isDark={isDark}
        sheetColor={isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)'}
        borderColor={c.border}
        maxHeight={windowHeight * 0.88}
        // Стала висота картки на телефоні — вкладки не смикають лист (P2).
        sheetHeight={Math.round(windowHeight * TASK_CARD_SHEET_RATIO)}
        scrollRef={detailScrollRef}
        header={card.header}
        footer={card.footer}
        empty={
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
            colors={c}
            tr={tr}
          />
        }
        list={
      <ScrollView
        // На телефоні під списком місце для FAB, щоб він не накривав останню картку.
        // Поруч із карткою (list+detail) список не центрується вузькою
        // колонкою: його лівий край має стояти на одній лінії з шапкою.
        contentContainerStyle={[listDetail.wide ? null : contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + (showFab ? FAB_LIST_CLEARANCE : 40) }]}
        showsVerticalScrollIndicator={false}
        // L3: перший тап по чипу групування/фільтра з відкритою клавіатурою
        // пошуку інакше лише ховає клавіатуру.
        keyboardShouldPersistTaps="handled"
        // Після keyboardShouldPersistTaps навмисно: аудит простору проєкту
        // (`__tests__/audit-project-space.test.tsx`) читає ПЕРШИЙ тег
        // <ScrollView> регуляркою до першого «>», а вкладений
        // <RefreshControl … /> обриває їй цей тег передчасно.
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {view === 'list' && (
          <>
            {/* Групування (contract §3) — у меню «⋯»; 'none' — плаский список. */}
            {effectiveGroupBy === 'none' ? (
              <View style={{ gap: 8 }}>
                {filtered.map(task => (
                  <TaskCompactCard
                    hideProject
                    key={task.id}
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
                ))}
              </View>
            ) : listGroups.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tr.projectNoTasks}</Text>
            ) : (
              <View style={{ gap: 16 }}>
                {listGroups.map(group => (
                  <View key={group.key}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{group.label}</Text>
                      <Text style={{ color: c.sub, fontSize: 11 }}>{group.tasks.length}</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      {group.tasks.map(task => (
                        <TaskCompactCard
                          hideProject
                          key={task.id}
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
                      ))}
                      {/* Порожня секція — лише підказка, не кнопка: створення
                          має одну точку на екрані (кнопка «Додати задачу»). */}
                      {group.tasks.length === 0 && (
                        <Text style={[st.emptyHint, { color: c.sub, borderColor: c.border }]}>{tr.projectNoTasksInGroup}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {view === 'board' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            {boardColumns.map(col => {
              // За isDone, а не завжди boardColumns[0] — інакше легасі-задача
              // з висячим/відсутнім kanbanColumnId (статус видалили в
              // налаштуваннях проєкту) завжди опинялась у ПЕРШІЙ колонці,
              // навіть якщо вона вже виконана (review finding).
              // Рішення власника (пункт 7+8, паритет з вебом): щойно створені —
              // першими в колонці. Ліміту карток тут немає, тож лише порядок.
              const colTasks = limitBoardColumn(
                filtered.filter(t => boardColumnForTask(t, boardColumns, columns)?.id === col.id),
                boardNow,
              ).visible.slice(0,5);
              return (
                <View key={col.id} style={[st.boardColumn, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col.color }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '700' }}>{col.name}</Text>
                    <Text style={{ color: c.sub, fontSize: 11 }}>{colTasks.length}</Text>
                  </View>
                  {filtered.filter(t => boardColumnForTask(t, boardColumns, columns)?.id === col.id).length > 5 && (
                    <TouchableOpacity accessibilityRole="button" onPress={() => setView('list')} style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Text style={{ color: c.accent, fontWeight: '600' }}>{tr.projectBoardShowAll}</Text>
                    </TouchableOpacity>
                  )}
                  {colTasks.map(task => (
                    <View key={task.id} style={{ marginBottom: 6 }}>
                      <TaskCompactCard
                        hideProject
                        task={task}
                        statusColumn={col}
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
                    </View>
                  ))}
                  {/* Порожня колонка — простий текст-підказка (рішення власника,
                      п. 3): створення має одну точку на екрані. */}
                  {colTasks.length === 0 && (
                    <Text style={[st.emptyHint, { color: c.sub, borderColor: c.border }]}>{tr.projectNoTasksInGroup}</Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
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
              <View key={group.key} style={{ marginTop: 14 }}>
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>{group.label}</Text>
                {group.meetings.map(meeting => (
                  <TouchableOpacity
                    key={meeting.id}
                    onPress={() => router.push({ pathname: '/project/[id]/calendar', params: { id: projectId, open: meeting._origId ?? meeting.id } } as never)}
                    activeOpacity={0.75}
                    style={[st.meetingRow, { borderColor: c.border, marginBottom: 6 }]}>
                    <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: meeting.color }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}>{meeting.title}</Text>
                    {meeting.time ? <Text style={{ color: c.sub, fontSize: 11 }}>{meeting.time}</Text> : null}
                    <IconSymbol name="calendar" size={13} color={c.sub} />
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
                <View style={{ borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 6 }}>
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
                      style={[st.timelineRow, { borderColor: c.border }]}>
                      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '600' }}>{task.title}</Text>
                      <IconSymbol name="calendar" size={14} color={c.sub} />
                    </TouchableOpacity>
                    {editing ? (
                      <View style={[st.dateEditRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                        <TextInput
                          placeholder={tr.dateInputFormatHint}
                          placeholderTextColor={c.sub}
                          value={editingDates.start}
                          onChangeText={v => setEditingDates(prev => (prev ? { ...prev, start: v } : prev))}
                          style={[st.dateInput, { color: c.text, borderColor: c.border }]}
                        />
                        <TextInput
                          placeholder={tr.dateInputFormatHint}
                          placeholderTextColor={c.sub}
                          value={editingDates.deadline}
                          onChangeText={v => setEditingDates(prev => (prev ? { ...prev, deadline: v } : prev))}
                          style={[st.dateInput, { color: c.text, borderColor: c.border }]}
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
        }>
        {card.body}
      </ListDetailLayout>
      {showFab && !toastVisible && (
        <AddTaskFab label={tr.projectAddTask} onPress={openFullForm} color={c.accent} bottom={tabBarInset + 20} />
      )}

      <TasksHeaderMenu visible={showMenu} onClose={() => setShowMenu(false)} items={menuItems} colors={c} isDark={isDark} />

      {/* Швидке створення — та сама коротка форма, що в особистих Завданнях. */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} handle="inside">
        <BlurView
          intensity={isDark ? 50 : 70}
          tint={isDark ? 'dark' : 'light'}
          style={[st.quickSheet, { maxHeight: windowHeight * 0.88, borderColor: c.border, backgroundColor: cardColors.sheet }]}>
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
        </BlurView>
      </SheetModal>

      {toastElement}
    </ProjectScreenShell>
  );
}

const st = StyleSheet.create({
  search: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Atlas.radius.medium, paddingLeft: 12 },
  clearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mineChip: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 10 },
  quickSheet: { borderRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 20, overflow: 'hidden' },
  boardColumn: { width: 240, borderRadius: Atlas.radius.large, borderWidth: 1, padding: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Atlas.radius.medium, borderWidth: 1, padding: 10 },
  meetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Atlas.radius.medium, borderWidth: 1, padding: 9 },
  dateEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Atlas.radius.medium, borderWidth: 1, padding: 8, marginTop: 6 },
  dateInput: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: Atlas.radius.small, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 },
  emptyHint: { fontSize: 12, textAlign: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: Atlas.radius.medium, paddingVertical: 18, paddingHorizontal: 10 },
});
