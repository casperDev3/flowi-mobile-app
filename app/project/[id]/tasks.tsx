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
 * (`includeEmpty`): секція — це ще й місце, куди задачу кладуть
 * (тап по порожньому місцю відкриває інлайн-поле зі статусом цієї колонки —
 * `InlineTaskComposer`, паритет із дошкою вебу), а порожній проєкт мусить
 * показувати свої колонки, а не самий лише напис «Задач ще немає».
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
 * Повний редактор задачі (підзавдання, таймер, спринт, нагадування) лишається
 * єдиним на застосунок — на екрані Завдань `(tabs)`, а не тут: `openTask`/
 * `openFullForm` нижче `router.push` туди з `?open=`/
 * `?create=1&projectId=&statusId=&sprintId=` — `statusId` несе колонку ЦЬОГО
 * проєкту, щоб «Детальніше» з інлайн-поля відкривало форму з тим самим
 * статусом, а не з типовим «До роботи».
 * Це ЗАЛИШАЄ запис у навігаційному стеку на цьому екрані (push, не replace)
 * — `(tabs)/index.tsx` сам відстежує, що прийшов із проєкту (`projectId`
 * задачі/параметра), і щойно редактор закриється, повертає `router.back()`
 * сюди, а не лишає користувача в Особистому (review finding: «leaves the
 * project space»). Контракт §3 «вхід у проєкт = повна зміна контексту» —
 * порушення саме на ЦЬОМУ переході й було, а не на самому факті спільного
 * редактора.
 */
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { MonthPicker } from '@/components/shared/MonthPicker';
import { ProjectGantt } from '@/components/projects/ProjectGantt';
import { ProjectScreenShell, projectShellColors } from '@/components/projects/ProjectScreenShell';
import { ProjectSyncIndicator } from '@/components/projects/ProjectSyncIndicator';
import { InlineComposerSlot, InlineTaskComposer } from '@/components/tasks/InlineTaskComposer';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { IconSymbol } from '@/components/ui/icon-symbol';
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
import { expandMeetings, type Meeting } from '@/utils/meetings';
import { buildGantt, shiftGanttEdge } from '@/utils/projectCharts';
import { projectModules } from '@/utils/projectUtils';
import {
  buildProjectCalendarDays, buildProjectListGroups, projectDetailTasks,
  type GroupLabels, type ProjectListGroupBy,
} from '@/utils/taskListView';
import {
  boardColumnForTask, mergeTaskStatusColumns, orderColumnsForList, personalEquivalentStrict,
  projectEquivalentColumn, scopedColumnFor, seedProjectStatusColumns,
  type TaskStatusColumn,
} from '@/utils/taskStatuses';
import { saveStatusLink } from '@/store/status-links';
import { useAuth } from '@/store/auth';
import {
  assigneeDisplayName,
  filterTasksByMonth, priorityFields, priorityLabel as priorityLevelLabel, DEFAULT_PRIORITY_LEVEL,
  normalizePriority, type Filter, type Task,
} from '@/utils/taskUtils';
import { applyFormSprint, BACKLOG_GROUP_KEY, type Sprint } from '@/utils/sprintUtils';
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
/**
 * `ensureProjectColumns` нижче — єдине місце на екрані, що пише статуси.
 * Оголошуємо це окремо, щоб сигнал про ЧУЖИЙ запис у `tasks`, який прилетів
 * саме в ту мить, не був відкинутий як «наш».
 */
const STATUSES_KEY_ONLY = ['task_statuses'] as const;

const GROUP_BY_OPTIONS: { key: ProjectListGroupBy }[] = [
  { key: 'none' }, { key: 'status' }, { key: 'priority' }, { key: 'sprint' },
];

export default function ProjectTasksScreen() {
  const { id: projectId } = useLocalSearchParams<{ id: string }>();
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
  const canEdit = useProjectRole(projectId) !== 'viewer';
  const { stopTimerForTask } = useTimerContext();
  const { isWide } = useResponsive();
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
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<ViewMode>('list');
  // Список (contract §3: «Список — групування за статусом/пріоритетом/
  // спринтом, фільтри») — 'none' лишає плаский список, як і було.
  const [groupBy, setGroupBy] = useState<ProjectListGroupBy>('none');
  const [activeMonth, setActiveMonth] = useState(() => startOfMonth(new Date()));
  const [newTitle, setNewTitle] = useState('');
  /**
   * Відкрите інлайн-поле створення: КУДИ саме впаде задача.
   * `columnId` — колонка дошки / секція статусу, `sprintId` — група спринта
   * (лише за групування «за спринтом»); `null` в обох — беклог без статусу.
   * Одне поле на екран: два відкритих поля означали б два курсори і два
   * місця, куди піде наступний Enter.
   */
  const [compose, setCompose] = useState<{ columnId: string | null; sprintId: string | null } | null>(null);
  const [composeTitle, setComposeTitle] = useState('');
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

  const c = projectShellColors(isDark, project?.color ?? '#7C3AED');

  const ownTasks = useMemo(
    () => (projectId ? projectDetailTasks(tasks, sprints, projectId) : []),
    [tasks, sprints, projectId],
  );
  const filtered = useMemo(
    () => ownTasks.filter(t => filter === 'all' || t.status === filter),
    [ownTasks, filter],
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
    if (!canEdit) return;
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
          const column = scopedColumnFor(columns, projectId, status === 'done' ? 'done' : 'todo');
          return { ...t, status, kanbanColumnId: column?.id ?? t.kanbanColumnId };
        }));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.light();
      if (becameDone) await stopTimerForTask(task.id);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] відмітка не вдалася:', e);
    }
  }, [canEdit, trackWrite, stopTimerForTask, columns, projectId]);

  const openTask = useCallback((task: Task) => {
    router.push({ pathname: '/(tabs)', params: { open: task.id } } as never);
  }, [router]);

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
    if (!canEdit || column.id === task.kanbanColumnId) return;
    let becameDone = false;
    try {
      await trackWrite(async () => {
        const updated = await updateSynced<Task>('tasks', fresh => fresh.map(t => {
          if (t.id !== task.id) return t;
          becameDone = column.isDone && t.status !== 'done';
          return { ...t, status: column.isDone ? 'done' : 'active', kanbanColumnId: column.id };
        }));
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.light();
      if (becameDone) await stopTimerForTask(task.id);
      askPersonalStatusLink(task, column);
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] перенесення в колонку не вдалося:', e);
    }
  }, [canEdit, trackWrite, stopTimerForTask, askPersonalStatusLink]);

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
   * Весь `task_statuses` із ГАРАНТОВАНИМИ колонками цього проєкту.
   *
   * Проєкт копіює власні статуси при створенні (contract §3.3), але проєкти,
   * заведені до тієї фази (а також ті, кому копіювання не вдалося — це
   * окремий запис, паралельний до самого проєкту), живуть без жодної. Раніше
   * швидке додавання в такому проєкті писало задачу БЕЗ `kanbanColumnId`: на
   * вигляд усе гаразд (дошка падала на особисті колонки), але щойно колонки
   * проєкту з'являлись, задача опинялась казна-де — і рівно цей мовчазний
   * промах тепер сигналить `boardColumnForTask` у dev.
   *
   * Тому колонки створюються ТУТ, перед записом задачі, тими самими копіями
   * системних, що й при створенні проєкту (`seedProjectStatusColumns`), а
   * задача пишеться вже в справжню колонку.
   */
  const ensureProjectColumns = useCallback(async (): Promise<TaskStatusColumn[]> => {
    if (!projectId) return [];
    const current = await loadData<TaskStatusColumn[]>('task_statuses', []);
    if (mergeTaskStatusColumns(current, projectId).length) return current;
    const seeded = seedProjectStatusColumns(mergeTaskStatusColumns(current), projectId);
    if (!seeded.length) return current;
    const next = await trackWrite(
      () => updateSynced<TaskStatusColumn>('task_statuses', fresh => [...fresh, ...seeded]),
      STATUSES_KEY_ONLY,
    );
    setColumns(next);
    return next;
  }, [projectId, trackWrite]);

  /**
   * Одна точка створення задачі на весь екран: і рядок угорі, і «+» у шапці
   * колонки, і тап по порожньому місцю секції. `target.column` — колонка
   * ДОШКИ, тобто, для легасі-проєкту, можливо особиста; `projectEquivalentColumn`
   * зводить її до колонки цього проєкту вже ПІСЛЯ того, як колонки
   * гарантовано існують.
   */
  const createTask = useCallback(async (
    rawTitle: string,
    target?: { column?: TaskStatusColumn; sprintId?: string | null },
  ): Promise<boolean> => {
    const title = rawTitle.trim();
    if (!canEdit || !title || !projectId) return false;
    try {
      const all = await ensureProjectColumns();
      const column = target?.column
        ? projectEquivalentColumn(target.column, all, projectId)
        // Колонка «todo» ЦЬОГО проєкту — інакше задача без kanbanColumnId
        // падала на дефолт першої колонки дошки (boardColumnForTask), що
        // випадково міг бути НЕ todo-колонкою (review finding: «quick-add
        // task also sets no kanbanColumnId»).
        : scopedColumnFor(all, projectId, 'todo');
      await trackWrite(async () => {
        const base: Task = {
          id: Date.now().toString(),
          title,
          projectId,
          // Колонка «Готово» дає одразу завершену задачу — та сама пара полів,
          // що й у `moveToColumn`: розійтись вони не мають права.
          status: column?.isDone ? 'done' : 'active',
          kanbanColumnId: column?.id,
          // §3.3 «createdBy — клієнт ставить при створенні в проєкті».
          createdBy: user?.id,
          ...priorityFields(DEFAULT_PRIORITY_LEVEL),
          createdAt: new Date().toISOString(),
          subtasks: [],
        };
        // Спринт групи (CONTRACT §D.3): null — беклог, інакше assignTaskToSprint.
        const created = applyFormSprint(base, sprints, target?.sprintId ?? null);
        const updated = await updateSynced<Task>('tasks', fresh => [created, ...fresh]);
        setTasks(updated);
      }, TASKS_KEY_ONLY);
      haptic.success();
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[project/tasks] створення не вдалося:', e);
      return false;
    }
  }, [canEdit, projectId, ensureProjectColumns, trackWrite, sprints, user]);

  const addTask = useCallback(async () => {
    if (await createTask(newTitle)) setNewTitle('');
  }, [createTask, newTitle]);

  const openCompose = useCallback((target: { columnId?: string | null; sprintId?: string | null }) => {
    if (!canEdit) return;
    setCompose({ columnId: target.columnId ?? null, sprintId: target.sprintId ?? null });
    setComposeTitle('');
  }, [canEdit]);

  const closeCompose = useCallback(() => { setCompose(null); setComposeTitle(''); }, []);

  const submitCompose = useCallback(async () => {
    if (!compose) return;
    const column = compose.columnId ? boardColumns.find(col => col.id === compose.columnId) : undefined;
    // Поле лишається відкритим: у колонку зазвичай заводять кілька задач
    // поспіль, і закриття після кожної коштувало б тап на кожну наступну.
    if (await createTask(composeTitle, { column, sprintId: compose.sprintId })) setComposeTitle('');
  }, [compose, composeTitle, boardColumns, createTask]);

  /** Чи це поле відкрите саме тут (колонка + спринт — повна адреса місця). */
  const composingAt = useCallback(
    (columnId: string | null, sprintId: string | null) =>
      !!compose && compose.columnId === columnId && compose.sprintId === sprintId,
    [compose],
  );

  const openFullForm = useCallback((preset?: { columnId?: string | null; sprintId?: string | null }) => {
    router.push({
      pathname: '/(tabs)',
      params: {
        create: '1',
        projectId,
        // `statusId` — колонка ЦЬОГО проєкту; форма зводить її до особистого
        // еквівалента для свого пікера й повертає назад при збереженні
        // (personalStatusIdFor / projectEquivalentColumn).
        statusId: preset?.columnId ?? '',
        sprintId: preset?.sprintId ?? '',
      },
    } as never);
  }, [router, projectId]);

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

  const VIEWS: { key: ViewMode; icon: 'list.bullet' | 'square.grid.2x2' | 'calendar' | 'chart.bar.xaxis' }[] = [
    { key: 'list', icon: 'list.bullet' },
    { key: 'board', icon: 'square.grid.2x2' },
    { key: 'calendar', icon: 'calendar' },
    { key: 'timeline', icon: 'chart.bar.xaxis' },
  ];

  return (
    <ProjectScreenShell
      project={project}
      isDark={isDark}
      title={tr.tabTasks}
      actions={projectId ? (
        <ProjectSyncIndicator projectId={projectId} accent={c.accent} subColor={c.sub} dimColor={c.dim} />
      ) : undefined}
      headerChildren={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {VIEWS.map(v => (
            <TouchableOpacity
              key={v.key}
              onPress={() => setView(v.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: view === v.key }}
              style={[st.viewChip, { borderColor: view === v.key ? c.accent : c.border, backgroundColor: view === v.key ? c.accent + '18' : c.dim }]}>
              <IconSymbol name={v.icon} size={14} color={view === v.key ? c.accent : c.sub} />
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {(['active', 'all', 'done'] as Filter[]).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[st.filterChip, { borderColor: filter === f ? c.accent : c.border, backgroundColor: filter === f ? c.accent + '18' : c.dim }]}>
              <Text style={{ color: filter === f ? c.accent : c.sub, fontSize: 11, fontWeight: '700' }}>
                {f === 'active' ? tr.filterActive : f === 'done' ? tr.filterDone : tr.filterAll}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      }>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]}
        showsVerticalScrollIndicator={false}
        // L3: перший тап по «+» поруч із полем назви інакше лише ховає
        // клавіатуру, і завдання не створюється.
        keyboardShouldPersistTaps="handled"
        // Після keyboardShouldPersistTaps навмисно: аудит простору проєкту
        // (`__tests__/audit-project-space.test.tsx`) читає ПЕРШИЙ тег
        // <ScrollView> регуляркою до першого «>», а вкладений
        // <RefreshControl … /> обриває їй цей тег передчасно.
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>

        {/* Швидке створення — повна форма (проєкт/спринт/пріоритет/дедлайн)
            лишається на екрані Завдань, тут лише назва. Глядач (contract §4.1)
            рядка взагалі не бачить — створювати йому нічого. */}
        {canEdit && (
          <View style={[st.addRow, { borderColor: c.border, backgroundColor: c.dim, marginBottom: 14 }]}>
            <TextInput
              placeholder={tr.projectAddTask}
              accessibilityLabel={tr.projectAddTask}
              placeholderTextColor={c.sub}
              value={newTitle}
              onChangeText={setNewTitle}
              onSubmitEditing={addTask}
              returnKeyType="done"
              style={{ flex: 1, color: c.text, fontSize: 14, paddingVertical: 10 }}
            />
            <TouchableOpacity
              onPress={() => openFullForm()}
              accessibilityRole="button"
              accessibilityLabel={tr.openFullTaskForm}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
              <IconSymbol name="arrow.up.right" size={16} color={c.sub} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={addTask}
              disabled={!newTitle.trim()}
              accessibilityRole="button"
              accessibilityLabel={tr.projectAddTask}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}>
              <IconSymbol name="plus" size={17} color={newTitle.trim() ? c.accent : c.sub} />
            </TouchableOpacity>
          </View>
        )}

        {view === 'list' && (
          <>
            {/* contract §3 «Список — групування за статусом/пріоритетом/
                спринтом»: ряд-перемикач над списком, 'none' — як і було,
                плаский список без заголовків. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ alignItems: 'center', gap: 6 }} keyboardShouldPersistTaps="handled">
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginRight: 2 }}>{tr.projectGroupByLabel}</Text>
              {GROUP_BY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setGroupBy(opt.key)}
                  style={[st.filterChip, { borderColor: groupBy === opt.key ? c.accent : c.border, backgroundColor: groupBy === opt.key ? c.accent + '18' : c.dim }]}>
                  <Text style={{ color: groupBy === opt.key ? c.accent : c.sub, fontSize: 11, fontWeight: '700' }}>
                    {opt.key === 'none' ? tr.projectGroupByNone
                      : opt.key === 'status' ? tr.sortStatus
                      : opt.key === 'priority' ? tr.sortPriority
                      : tr.sprints}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {effectiveGroupBy === 'none' ? (
              <View style={{ gap: 8 }}>
                {filtered.map(task => (
                  <TaskCompactCard
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
                  />
                ))}
              </View>
            ) : listGroups.length === 0 ? (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 40 }}>{tr.projectNoTasks}</Text>
            ) : (
              <View style={{ gap: 16 }}>
                {listGroups.map(group => {
                  // Секція статусу — це колонка дошки; секція спринта — сам
                  // спринт (беклог = без спринта). За пріоритетом створювати
                  // нема куди: пріоритет — ознака задачі, а не місце.
                  const groupColumn = effectiveGroupBy === 'status' ? boardColumns.find(col => col.id === group.key) : undefined;
                  const groupSprintId = effectiveGroupBy === 'sprint' && group.key !== BACKLOG_GROUP_KEY ? group.key : null;
                  const canCompose = canEdit && effectiveGroupBy !== 'priority';
                  const composeColumnId = groupColumn?.id ?? null;
                  return (
                    <View key={group.key}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{group.label}</Text>
                        <Text style={{ color: c.sub, fontSize: 11 }}>{group.tasks.length}</Text>
                        <View style={{ flex: 1 }} />
                        {canCompose && (
                          <TouchableOpacity
                            onPress={() => openCompose({ columnId: composeColumnId, sprintId: groupSprintId })}
                            accessibilityRole="button"
                            accessibilityLabel={tr.projectAddTask}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="plus" size={15} color={c.sub} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={{ gap: 8 }}>
                        {group.tasks.map(task => (
                          <TaskCompactCard
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
                          />
                        ))}
                        {canCompose && (composingAt(composeColumnId, groupSprintId) ? (
                          <InlineTaskComposer
                            value={composeTitle}
                            onChangeText={setComposeTitle}
                            onSubmit={() => void submitCompose()}
                            onCancel={closeCompose}
                            onDetails={() => openFullForm({ columnId: composeColumnId, sprintId: groupSprintId })}
                            placeholder={tr.projectAddTask}
                            submitLabel={tr.add}
                            cancelLabel={tr.cancel}
                            detailsLabel={tr.openFullTaskForm}
                            colors={c}
                            accentColor={groupColumn?.color}
                          />
                        ) : (
                          <InlineComposerSlot
                            label={group.tasks.length === 0 ? tr.projectNoTasksHint : tr.projectAddTask}
                            colors={c}
                            onPress={() => openCompose({ columnId: composeColumnId, sprintId: groupSprintId })}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
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
              ).visible;
              return (
                <View key={col.id} style={[st.boardColumn, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col.color }} />
                    <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 13, fontWeight: '700' }}>{col.name}</Text>
                    <Text style={{ color: c.sub, fontSize: 11 }}>{colTasks.length}</Text>
                    {canEdit && (
                      <TouchableOpacity
                        onPress={() => openCompose({ columnId: col.id })}
                        accessibilityRole="button"
                        accessibilityLabel={tr.projectAddTask}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="plus" size={15} color={c.sub} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {colTasks.map(task => (
                    <View key={task.id} style={{ marginBottom: 6 }}>
                      <TaskCompactCard
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
                      />
                    </View>
                  ))}
                  {/* Порожнє місце колонки — ціль тапу, а не просто пустота:
                      інакше «створити одразу в цій колонці» на телефоні немає
                      взагалі, і статус доводиться міняти вже після створення. */}
                  {canEdit && (composingAt(col.id, null) ? (
                    <InlineTaskComposer
                      value={composeTitle}
                      onChangeText={setComposeTitle}
                      onSubmit={() => void submitCompose()}
                      onCancel={closeCompose}
                      onDetails={() => openFullForm({ columnId: col.id })}
                      placeholder={tr.projectAddTask}
                      submitLabel={tr.add}
                      cancelLabel={tr.cancel}
                      detailsLabel={tr.openFullTaskForm}
                      colors={c}
                      accentColor={col.color}
                    />
                  ) : (
                    <InlineComposerSlot
                      label={colTasks.length === 0 ? tr.projectNoTasksHint : tr.projectAddTask}
                      colors={c}
                      onPress={() => openCompose({ columnId: col.id })}
                      minHeight={colTasks.length === 0 ? 80 : 44}
                    />
                  ))}
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
                    onPress={() => router.push(projectRoute(projectId, 'meetings') as never)}
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
                <View style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, padding: 12, marginBottom: 6 }}>
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
                      onPress={canEdit ? () => setEditingDates(editing ? null : {
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
                        <TouchableOpacity onPress={saveDates} style={[st.saveDatesBtn, { backgroundColor: c.accent }]}>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{tr.save}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )
        )}
      </ScrollView>
    </ProjectScreenShell>
  );
}

const st = StyleSheet.create({
  viewChip: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterChip: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 7 },
  boardColumn: { width: 240, borderRadius: 14, borderWidth: 1, padding: 10 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 10 },
  meetingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 9 },
  dateEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 8, marginTop: 6 },
  dateInput: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 },
  saveDatesBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
});
