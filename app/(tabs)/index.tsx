import { copyMeeting } from '@/utils/meetingSharing';
import { Atlas } from '@/constants/atlas';
import { AdSlot } from '@/components/advertising/Advertising';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  type SectionListData,
  type SectionListRenderItemInfo,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { MonthPicker } from '@/components/shared/MonthPicker';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
} from 'react-native-reanimated';
import { useMotion } from '@/hooks/use-motion';
import { MeetingFormSheet, MeetingFormData, RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { SheetHandle, SheetModal } from '@/components/shared/SheetModal';
import { SkeletonRow } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';
// Meeting — спільний тип (utils/meetings.ts). Локальна копія тут не знала про
// timeEntries таймера наради, а цей екран пише масив нарад назад у сховище:
// перший же збіг «таймер зупинили → тут щось зберегли» коштував би сесії.
import {
  findTimerForMeeting, meetingProject, meetingsOnDate, orderTodayMeetings, resolveOriginalMeeting, withMeetingProject,
  TODAY_MEETINGS_PREVIEW, type Meeting,
} from '@/utils/meetings';
import { MeetingDetailBody, MeetingDetailHeader } from '@/components/meetings/MeetingDetail';
import { MeetingProjectChip } from '@/components/meetings/MeetingProjectChip';
import {isLead,taskRights} from '@/utils/teamwork';
import { TeamTaskPanel, hasTeamContext } from '@/components/projects/TeamTaskPanel';
import { TaskDetailHeader, type TaskDetailTab } from '@/components/tasks/TaskDetailHeader';
import { TaskCardActivity, TaskCardDetails, TaskCardMain } from '@/components/tasks/card/TaskCardSections';
import { OptionField, ReminderSheet } from '@/components/tasks/card/fields';
import { TaskQuickCreate } from '@/components/tasks/card/TaskQuickCreate';
import { estimateDraft, recurrenceDraft } from '@/components/tasks/card/draftParts';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { saveStatusLink } from '@/store/status-links';
import { cancelReminder, scheduleReminder } from '@/store/notifications';
import {
  assigneeDisplayName,
  assigneeForPersonalProjectTask,
  closeSubtasksOnDone,
  createdByAfterProjectChange,
  isMyTask,
  isOverdue,
  normalizePriority,
  priorityFields,
  priorityLabel as priorityLevelLabel,
  type Filter,
  type PriorityLevel,
  type SortBy,
  type Status,
  type SubTask,
  type Task as BaseTask,
} from '@/utils/taskUtils';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { PriorityFilterChips } from '@/components/tasks/PriorityFilterChips';
import { type TaskListScope } from '@/utils/taskListSections';
import {
  applyTaskScope,
  buildTaskGroups,
  filterTasksForList,
  limitGroupTasks,
  TASK_GROUP_LIMIT,
  overdueForList,
  sortTasksForList,
  taskListQueryToParams,
  taskScopeCounts,
  OVERDUE_GROUP_KEY,
  type GroupLabels,
  type TaskListGroup,
  type TaskListQuery,
} from '@/utils/taskListView';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { copyTextToClipboard } from '@/utils/clipboard';
import { taskMarkdownLabels, taskToMarkdown } from '@/utils/taskMarkdown';
import { inTaskScope, isWeekTask } from '@/utils/taskToday';
import {
  ACTIVE_COLUMN_ID, DONE_COLUMN_ID, mergeTaskStatusColumns, personalDisplayColumn, personalStatusIdFor,
  projectEquivalentColumn, projectEquivalentStrict,
  scopedColumnFor, scopedTaskStatusColumn, subtaskToggleTransition,
} from '@/utils/taskStatuses';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { reopenColumnId, reopenSubtasks, withReopenInfo } from '@/utils/taskCompletion';
import { haptic } from '@/utils/haptics';
import { nextProjectColor } from '@/utils/projectColors';
import { projectQuickAction } from '@/utils/projectQuickCreate';
import { applyProjectQuickAction, type ProjectQuickApplyResult } from '@/utils/projectQuickApply';
import type { Project } from '../projects';
import { projectRoute } from '@/constants/projectNav';
import { useInPlaceProjectTask } from '@/components/projects/ProjectTaskSheet';
import { projectTaskUrl } from '@/utils/pushLink';
import { applyFormSprint, retargetTaskProject, sprintFieldVisible, sprintOptionLabel, sprintOptionsForTask, type Sprint } from '@/utils/sprintUtils';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useZoneState } from '@/hooks/use-zone-state';
import { BulkActionBar, KanbanPager, SwipeRow, ZoneLayout, zoneWidths, type KanbanColumn, type SwipeAction } from '@/components/layout-zones';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import { useToday } from '@/hooks/use-today';
import { draftEstimatedMinutes, draftRecurrence, editedDraftFields, taskToDraft, useTaskEditor, type TaskDraft } from '@/hooks/use-task-editor';
import { useAllProjectMembers, useProjectMembers } from '@/hooks/use-project-members';
import type { MemberOut } from '@/store/project-team';
import { useProjectRole } from '@/hooks/use-project-role';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { HeaderButton } from '@/components/shared/ScreenHeader';
// Верхній інсет рахує ScreenHeader усередині AppHeader (useTopInset у JS).
import { AppHeader } from '@/components/shared/AppHeader';
import type { PickerCreateOption } from '@/components/shared/PickerField';
import { TaskHistoryTab, type HistoryEventType } from '@/components/tasks/TaskHistoryTab';
import { TaskTimerButton } from '@/components/tasks/TaskTimerButton';
import { TaskTimerTab } from '@/components/tasks/TaskTimerTab';
import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { TaskSubtasks } from '@/components/tasks/TaskSubtasks';
import { AddTaskFab, FAB_LIST_CLEARANCE } from '@/components/tasks/AddTaskButton';
import { TasksTodayPane } from '@/components/tasks/TasksTodayPane';
import { appendHistory, makeHistoryEvent } from '@/utils/taskHistory';
import { monthGrid } from '@/utils/dateUtils';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { formatClock, formatDuration } from '@/utils/durationFormat';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { BentoArrowButton, BentoCard, KpiCounter, MeshBackground, SectionTabs, SegmentedProgress } from '@/components/ds';
import { glassOf, glassRim, dsGlass } from '@/components/shared/dsTheme';


/**
 * Завдання цього екрана = спільний тип (utils/taskUtils.ts) + поля, які поки
 * пише лише мобільний клієнт (повтор і аудіозаписи). Раніше тут стояла повна
 * локальна копія інтерфейсу, і нове поле в утилітах доводилося дописувати
 * двічі — або воно мовчки губилося на цьому екрані.
 */
interface Task extends BaseTask {
  recurrence?: RecurrenceRule;
  recordings?: string[];
}


/**
 * Локальний `YYYY-MM-DD` — той самий ключ, яким живе `meeting.date`
 * (`utils/meetings.ts` будує його з getFullYear/getMonth/getDate).
 *
 * Свідомо НЕ `toISOString().slice(0, 10)`: на схід від UTC локальна північ у
 * ISO дає ПОПЕРЕДНЮ добу, тож попап дня шукав зустрічі за вчорашнім ключем
 * (крапка «є зустріч» на дні раніше, «нічого не заплановано» на правильному
 * числі), а створена з календаря зустріч зберігалась учорашнім числом.
 */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}



function getProgress(t: Task) {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

function nextRecurrenceDate(fromDateStr: string, rule: RecurrenceRule): string | null {
  const d = new Date(fromDateStr + 'T00:00');
  const { freq, interval, daysOfWeek, until } = rule;
  let next: Date;
  if (freq === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    // Find next matching day-of-week after `d`
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const curDow = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
    // Look in the same week first, then next interval weeks
    let found: Date | null = null;
    for (let week = 0; week < 200 && !found; week++) {
      for (const day of sortedDays) {
        const candidate = new Date(d);
        const weekOffset = week * interval * 7;
        const dayOffset = day - curDow + weekOffset;
        if (dayOffset <= 0 && week === 0) continue;
        candidate.setDate(d.getDate() + (week === 0 ? day - curDow : weekOffset - curDow + day));
        if (candidate > d) { found = candidate; break; }
      }
    }
    if (!found) return null;
    next = found;
  } else {
    next = new Date(d);
    switch (freq) {
      case 'daily':   next.setDate(next.getDate() + interval); break;
      case 'weekly':  next.setDate(next.getDate() + interval * 7); break;
      case 'monthly': next.setMonth(next.getMonth() + interval); break;
      case 'yearly':  next.setFullYear(next.getFullYear() + interval); break;
    }
  }
  const nextStr = localDateStr(next);
  if (until && nextStr > until) return null;
  return nextStr;
}

/** Стабільне посилання для проєктів без кешу команди (соло) — щоб
 *  assigneeLabelFor не створював новий масив щоразу. */
const EMPTY_MEMBERS_LIST: MemberOut[] = [];

export default function TasksScreen() {
  const tabBarInset = useTabBarInset();
  const { width, height, isMedium, isWide } = useResponsive();
  const screenWidth = useScreenWidth();
  // DS v2: нейтральна палітра; акцент завдань — глибока лаванда; головні дії — action.primary (c.primary).
  const { t, isDark } = useDSTheme();
  useScreenView('tasks');
  const router = useRouter();
  // Меню опцій живе в окремому Modal і мусить лягти рівно під кнопкою хедера,
  // тож бере той самий інсет, що й сам хедер.
  const topInset = useTopInset();
  // «Сьогодні» мусить пережити північ у відкритому застосунку: від нього
  // тепер залежить не лише підпис групи, а й те, чи завдання взагалі
  // потрапить у статусні групи.
  const today = useToday();
  const { tr, lang } = useI18n();
  const { user } = useAuth();
  /**
   * Layout System v2.4 — зони екрана: режим «Список / Колонки», видимість
   * статичної зони й панелі деталей, вибране завдання в параметрі `?task=`
   * (разом із `?view=` і `?panel=` — посилання відкриває той самий стан).
   */
  const zoneState = useZoneState({ section: 'tasks', selectedParam: 'task', columns: true, label: tr.tasks });
  const zoneFit = zoneWidths({ windowWidth: width, screenWidth, wide: isWide, wantStatic: zoneState.panels.static, wantDynamic: true });
  // Деталь — панель праворуч, коли вона вміщається поруч зі списком (iPad,
  // вікно ≥ ~800pt); інакше — нижній аркуш, як на телефоні (BottomSheet).
  const showDetailColumn = zoneFit.dynamicMode === 'panel';
  // Одиниці приходять зі словника: до цього кожен екран мав власну копію
  // форматування з вшитими «год» і «хв».
  const durationUnits = useMemo(
    () => ({ hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute }),
    [tr.unitHour, tr.unitHourLong, tr.unitMinute],
  );
  const fmtDurLocal = useCallback((s: number) => formatDuration(s, durationUnits), [durationUnits]);
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const motion = useMotion();

  // Пріоритет для опису картки у VoiceOver: «Пріоритет P2»; без пріоритету — порожньо.
  // useCallback: іде в renderItem списку, який тепер стабільний.
  const priorityA11y = useCallback((t: Pick<Task, 'priority' | 'priorityLevel'>): string => {
    const level = normalizePriority(t);
    return level === null ? '' : tr.priorityA11y.replace('{level}', priorityLevelLabel(level));
  }, [tr.priorityA11y]);
  const SORT_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
    { key: 'status',    label: tr.sortStatus,    icon: 'rectangle.3.group' },
    { key: 'deadline',  label: tr.sortDeadline,  icon: 'flag' },
    { key: 'priority',  label: tr.sortPriority,  icon: 'exclamationmark.circle' },
    { key: 'newest',    label: tr.sortNewest,    icon: 'arrow.down.circle' },
    { key: 'oldest',    label: tr.sortOldest,    icon: 'arrow.up.circle' },
    { key: 'name',      label: tr.sortAZ,        icon: 'textformat.abc' },
  ];
  const MONTHS_UA = tr.months;
  const WEEKDAYS_SHORT = tr.weekdays;
  // Таймери завдань живуть у сторі, а не в цьому екрані: ту саму сесію можна
  // зупинити з вкладки часу або з іншого пристрою, і локальний стан про це
  // ніколи б не дізнався.
  const {
    startTaskTimer, stopTimerForTask, getTimerForTask, tasksRevision, meetingsRevision,
    activeTimers, startMeetingTimer, stopTimer: stopTimerById,
  } = useTimerContext();
  const [projects, setProjects] = useState<Project[]>([]);
  // Спринти екран лише ЧИТАЄ — заради бейджа «Проєкт · Спринт». Створюють,
  // перейменовують і закривають їх на сторінці проєкту, і другої точки входу
  // в те саме рішення тут навмисно немає.
  const [sprints, setSprints] = useState<Sprint[]>([]);

  // Ролі в УСІХ моїх проєктах одразу (contract §4.1) — задачі різних проєктів
  // лежать в одному списку («Особисте агрегує», §3.7), тож роль перевіряється
  // за ВЛАСНИМ `projectId` кожної задачі, а не однією роллю на весь екран.
  const projectRoles = useProjectRoles();

  // Пікери показують лише ЖИВІ проєкти, а `projects` лишається повним.
  // Це навмисно: підпис обраного значення шукається в повному списку, тож
  // задача в архівному проєкті й далі показує його назву, а не порожнє поле.
  // Глядацькі проєкти прибрані (review finding): учасник не мусить мати
  // змогу ПЕРЕНЕСТИ задачу в проєкт, де сервер однаково відхилить запис
  // `forbidden` (contract §4.1 — upsert tasks недоступний viewer).
  const pickableProjects = useMemo(
    () => projects.filter(p => !p.archivedAt && canEditProjectItem(p.id, projectRoles)),
    [projects, projectRoles],
  );
  const [storedTaskStatuses, setStoredTaskStatuses] = useState<TaskStatusColumn[]>([]);
  const taskStatuses = useMemo(() => mergeTaskStatusColumns(storedTaskStatuses), [storedTaskStatuses]);
  const [initialized, setInitialized] = useState(false);
  /**
   * Завдання, чий таймер треба зупинити, щойно наш власний запис 'tasks'
   * долетить до сховища. Стор зупиняє таймер через read-modify-write того
   * самого ключа — якби він прочитав список ДО нашого запису, або статус
   * «готово», або дописана сесія загубилися б залежно від того, хто написав
   * останнім.
   */
  const pendingTimerStops = useRef<string[]>([]);
  /**
   * 'tasks' більше НЕ зберігається цілим станом (saveSynced дифав масив зі
   * сховищем, і застарілий стан екрана видаляв задачі, додані на вебі, або
   * відкочував чужі відмітки). useSyncedList пише лише локальні зміни по
   * полях і сам перечитує ключ, коли в нього пише рушій синку чи стор таймерів.
   */
  const { items: tasks, setItems: setTasks, reload: reloadTasks } = useSyncedList<Task>('tasks', {
    enabled: initialized,
    onSaved: () => {
      if (pendingTimerStops.current.length === 0) return;
      const ids = pendingTimerStops.current;
      pendingTimerStops.current = [];
      for (const id of ids) void stopTimerForTask(id);
    },
  });
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortBy>('status');
  /**
   * Що показує вкладка: денну роботу чи весь список.
   *
   * Стан навмисно НЕ зберігається між сесіями. «Сьогодні за замовчуванням» має
   * означати саме це: людина, яка одного разу зазирнула в увесь беклог, не
   * мусить назавжди отримати його при кожному відкритті вкладки.
   */
  const [scope, setScope] = useState<TaskListScope>('today');
  /**
   * Лише в режимі «Всі»: false (типово) — мої активні З дедлайном, true —
   * БЕЗ дедлайну (utils/taskToday.ts inTaskScope). Поза «Всі» скидається.
   */
  const [noDeadline, setNoDeadline] = useState(false);
  const selectScope = useCallback((next: TaskListScope, nextNoDeadline = false) => {
    setScope(next);
    setNoDeadline(next === 'all' && nextNoDeadline);
  }, []);

  // Search & extra filters
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  // Мультивибір P0…P5; порожній = без фільтра.
  const [filterPriorities, setFilterPriorities] = useState<PriorityLevel[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  /**
   * «Детальніше» у швидкому створенні: id щойно створеної задачі, чию картку
   * треба відкрити, щойно аркуш створення зникне (NEW-02: SheetModal ще ~150 мс
   * тримає себе змонтованим, і друга модалка в тому ж тіку не показалась би).
   */
  const [openAfterCreate, setOpenAfterCreate] = useState<string | null>(null);

  // Recurrence for add task

  const [selected, setSelected] = useState<Task | null>(null);
  /**
   * Скільки карток у ряд. Портретний планшет (medium): поки праворуч немає
   * панелі деталей, список іде у дві колонки; з відкритою панеллю — в одну.
   */
  const cardColumns = isMedium && !(showDetailColumn && selected) ? 2 : 1;
  /** Масовий вибір (довгий тап по рядку): id вибраних завдань. */
  const [bulkIds, setBulkIds] = useState<ReadonlySet<string>>(() => new Set());
  const selectionMode = bulkIds.size > 0;
  /**
   * Задача ПРОЄКТУ (з `projectId`) не відкривається в особистому редакторі
   * (`selected`): її картка — карткою проєкту тут же, аркушем ProjectTaskSheet.
   */
  const { openProjectTask, projectTaskSheet } = useInPlaceProjectTask(isDark);
  const [newSubtask, setNewSubtask] = useState('');
  const detailScrollRef = useRef<ScrollView>(null);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  // Meetings state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsInit, setMeetingsInit] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingFormInitial, setMeetingFormInitial] = useState<MeetingFormData | null>(null);
  const [meetingFormPreset, setMeetingFormPreset] = useState<string | undefined>(undefined);
  /**
   * Відкритий ПЕРЕГЛЯД зустрічі. Зберігаємо адресу (id оригіналу + дата
   * екземпляра), а не знімок: у колонці планшета перегляд лишається відкритим
   * під час редагування й таймера, і знімок показував би застарілі дані. Та
   * сама панель, що й деталь завдання: вибір зустрічі знімає вибір задачі.
   */
  const [selectedMeeting, setSelectedMeeting] = useState<{ origId: string; date: string } | null>(null);
  /** «Показати всі (N)» у секції сьогоднішніх зустрічей. */
  const [showAllTodayMeetings, setShowAllTodayMeetings] = useState(false);

  // Inline subtask editing (no nested Modal — prevents iOS freeze)
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState('');

  // Створення нового завдання користується тією самою формою й тим самим
  // станом, що й редагування — це той самий набір полів.
  const composer = useTaskEditor(ACTIVE_COLUMN_ID, today);
  // Увесь кеш команд одразу (не один проєкт) — картки списку показують
  // завдання з РІЗНИХ проєктів одночасно, підпис виконавця (§4.5) шукається
  // по projectId кожного окремого завдання.
  const allProjectMembers = useAllProjectMembers();
  const assigneeLabelFor = useCallback((task: Task): string | null => {
    if (!task.projectId) return null; // особисте завдання — виконавця нема
    const members = allProjectMembers[task.projectId] ?? EMPTY_MEMBERS_LIST;
    return assigneeDisplayName(task.assigneeId, members, user?.id, tr.taskAssigneeMe);
  }, [allProjectMembers, user?.id, tr.taskAssigneeMe]);

  // Нагадування ПІДЗАВДАННЯ (з меню «…» рядка). Нагадування самої задачі —
  // рядок у вкладці «Деталі» зі своїм аркушем.
  const [subReminder, setSubReminder] = useState<{ taskId: string; subtaskId: string } | null>(null);

  // Detail tab + timer display
  const [detailTab, setDetailTab] = useState<TaskDetailTab>('main');
  /** Вкладка, з якої відкрити наступну картку (напр. «Команда» для здачі на перевірку). */
  const pendingDetailTab = useRef<TaskDetailTab | null>(null);

  const loadOthers = useCallback(async () => {
    const [p, m, statuses, s] = await Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Meeting[]>('meetings', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
      loadData<Sprint[]>('sprints', []),
    ]);
    setProjects(p);
    setMeetings(m);
    setStoredTaskStatuses(statuses);
    setSprints(s);
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([reloadTasks(), loadOthers()]);
  }, [reloadTasks, loadOthers]);

  // Проєкти, спринти й статуси екран лише читає — чужий запис (пул синку,
  // сторінка проєкту) перечитується одразу, без pull-to-refresh.
  // 'meetings' тут немає: для них окрема підписка нижче (reloadMeetings).
  useStorageRefresh(['projects', 'task_statuses', 'sprints'], loadOthers, initialized);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // Load from storage (useFocusEffect refreshes when returning from subtasks screen)
  useFocusEffect(useCallback(() => {
    loadAll().then(() => { setInitialized(true); setMeetingsInit(true); });
  }, [loadAll]));

  // Open create-task modal when navigated with ?create=1 (e.g. from Today quick actions)
  // ?projectId=&sprintId= — створення зі спринта в деталі проєкту: форма
  // відкривається з уже обраними проєктом і спринтом (CONTRACT §D.3.6).
  const {
    create: createParam, open: openParam, projectId: projectParam, sprintId: sprintParam,
    statusId: statusParam, deadline: deadlineParam,
    meeting: meetingParam, meetingDate: meetingDateParam,
  } = useLocalSearchParams<{
    create?: string; open?: string; projectId?: string; sprintId?: string;
    /**
     * ?statusId=<id колонки> — створення З КОЛОНКИ дошки/секції статусу
     * простору проєкту: задача мусить одразу лягти в ту саму колонку, з якої
     * її завели, а не в типову «До роботи». Приходить id колонки ПРОЄКТУ
     * (`st-<uuid4>`), тоді як пікер цієї форми показує особисті статуси
     * (§3.7) — звідси мапінг в обидва боки (див. `personalStatusIdFor`
     * нижче і `projectEquivalentColumn` у `addTask`).
     */
    statusId?: string; deadline?:string;
    /** ?meeting=<id оригіналу>&meetingDate=YYYY-MM-DD — перегляд зустрічі (з «Сьогодні»). */
    meeting?: string; meetingDate?: string;
  }>();
  /**
   * Проєкт, у простір якого повернутись, коли закриється модалка, відкрита
   * звідси нижче (review finding: «openTask/openFullForm пушать у /(tabs) —
   * лишають простір проєкту; закриття лишає користувача в Особистому»).
   * Повний редактор задачі й далі живе лише тут (один на застосунок) — але
   * прихід із проєкту (`?open=`/`?create=1&projectId=`) запам'ятовує, куди
   * повернутись, а ефект нижче виконує сам перехід, щойно і `selected`
   * (деталь задачі), і `showAdd` (форма створення) знову закриті — байдуже,
   * яким саме шляхом користувач це зробив (Готово, Видалити, свайп тощо).
   */
  const [returnToProject, setReturnToProject] = useState<string | null>(null);

  // Окремою змінною, а не `composer` цілком: `reset` стабільний (useCallback
  // на [today], а today тут — `useToday()`), тоді як сам composer міняє
  // ідентичність на кожну зміну чернетки — ефект нижче бігав би на кожну
  // натиснуту клавішу й скидав би форму. Раніше це вирішував eslint-disable,
  // від якого React Compiler переставав оптимізувати ВЕСЬ екран (PERF-2).
  const composerReset = composer.reset;
  useEffect(() => {
    if (createParam !== '1') return;
    // Статус із маршруту мапиться по ЗАВАНТАЖЕНИХ колонках: поки
    // `task_statuses` ще не прочитані, мапити нема по чому, і форма відкрилась
    // би з типовим «До роботи» замість колонки, з якої її покликали.
    if (statusParam && !initialized) return;
    if (projectParam) {
      const statusId = statusParam
        ? personalStatusIdFor(statusParam, storedTaskStatuses)
        : ACTIVE_COLUMN_ID;
      composerReset(statusId, { projectId: projectParam, sprintId: sprintParam || null, ...(deadlineParam ? {deadline:deadlineParam} : {}) });
      setReturnToProject(projectParam);
    } else if (deadlineParam) {
      // Створення з «Календаря» без проєкту: день, з якого натиснули «+», —
      // одразу дедлайном у формі.
      composerReset(ACTIVE_COLUMN_ID, { deadline: deadlineParam });
    }
    setShowAdd(true);
    router.setParams({ create: '', projectId: '', sprintId: '', statusId: '', deadline:'' });
  }, [createParam, projectParam, sprintParam, statusParam, deadlineParam, initialized, storedTaskStatuses, router, composerReset]);

  // Open task details when navigated with ?open=<taskId> (e.g. from Today rows)
  useEffect(() => {
    if (!openParam || !initialized) return;
    const t = tasks.find(x => x.id === openParam);
    router.setParams({ open: '' });
    // Задача проєкту (deep link `ftrackingapp://task/{id}`) — у просторі
    // ЇЇ проєкту, картка там же; особистий редактор — лише для особистих.
    if (t?.projectId) router.push(projectTaskUrl(t.projectId, t.id) as never);
    else if (t) setSelected(t);
    // `tasks` у deps чесно: ефект усе одно виконується один раз — перший же
    // прохід гасить `openParam` через router.setParams, а далі спрацьовує
    // ранній вихід. Було в eslint-disable, який вимикав React Compiler на
    // всьому екрані (PERF-2).
  }, [openParam, initialized, router, tasks]);

  // Layout System v2.4: вибране завдання — у параметрі `?task=<id>` (поряд
  // із `?view=` і `?panel=`). Перший прохід після читання сховища відкриває
  // задачу з адреси; далі вибір дзеркалиться в адресу, а нове значення
  // параметра ззовні (диплінк у вже відкритий екран) — відкриває задачу.
  const zoneSelect = zoneState.select;
  const zoneSelectedId = zoneState.selectedId;
  const taskParamConsumed = useRef(false);
  const prevZoneSelected = useRef(zoneSelectedId);
  const selectedIdForZone = selected?.id ?? null;
  const selectedIdRef = useRef(selectedIdForZone);
  selectedIdRef.current = selectedIdForZone;
  useEffect(() => {
    if (!initialized || taskParamConsumed.current) return;
    taskParamConsumed.current = true;
    const t = zoneSelectedId ? tasksRef.current.find(x => x.id === zoneSelectedId) : undefined;
    if (t && !openProjectTask(t)) setSelected(t);
  }, [initialized, zoneSelectedId, openProjectTask]);
  useEffect(() => {
    if (prevZoneSelected.current === zoneSelectedId) return;
    prevZoneSelected.current = zoneSelectedId;
    if (!taskParamConsumed.current || !zoneSelectedId) return;
    const t = tasksRef.current.find(x => x.id === zoneSelectedId);
    if (t && t.id !== selectedIdRef.current && !openProjectTask(t)) setSelected(t);
  }, [zoneSelectedId, openProjectTask]);
  useEffect(() => {
    if (!taskParamConsumed.current) return;
    zoneSelect(selectedIdForZone);
  }, [selectedIdForZone, zoneSelect]);

  // Сам перехід назад — щойно ОБИДВІ модалки, які могли прийти з проєкту,
  // знову закриті. `router.back()`, коли можна: цей екран стоїть у стеку
  // ПОВЕРХ `/project/{id}/tasks` (routing — push, не replace), і повернення
  // назад лишає скрол/стан того екрана як був; `router.replace` — запасний
  // шлях, якщо стека раптом нема (наприклад, deep link).
  useEffect(() => {
    if (!returnToProject || selected || showAdd || openAfterCreate) return;
    const target = returnToProject;
    setReturnToProject(null);
    if (router.canGoBack()) router.back();
    else router.replace(projectRoute(target, 'tasks') as never);
  }, [returnToProject, selected, showAdd, openAfterCreate, router]);

  // Стор пише 'tasks' повз наш стан: старт таймера дописує історію і рухає
  // колонку, зупинка — додає завершену сесію. Підписка useSyncedList це вже
  // ловить; ревізія стору — запасний сигнал на випадок, якщо запис пройшов
  // повз saveData.
  useEffect(() => {
    if (!initialized || tasksRevision === 0) return;
    reloadTasks()
      .catch(e => { if (__DEV__) console.warn('[tasks] перечитування після запису стору не вдалося:', e); });
  }, [tasksRevision, initialized, reloadTasks]);

  // 'meetings' цей екран більше НЕ зберігає цілим станом: saveSynced дифає
  // масив зі сховищем, і зустріч, додана деінде (синк-пул, екран «Зустрічі»,
  // веб), була б відправлена на сервер як видалена. Усі записи —
  // read-modify-write у mutateMeetings нижче (як CONTRACT §D.4.3 для
  // projects/sprints).
  const reloadMeetings = useCallback(async () => {
    setMeetings(await loadData<Meeting[]>('meetings', []));
  }, []);
  const trackMeetingsWrite = useStorageRefresh(['meetings'], reloadMeetings, meetingsInit);
  const meetingsWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const mutateMeetings = useCallback((mutate: (list: Meeting[]) => Meeting[]) => {
    meetingsWriteQueue.current = meetingsWriteQueue.current
      .then(() => trackMeetingsWrite(async () => {
        // Читання й запис — під одним блокуванням ключа (updateSynced): pull між
        // ними інакше пішов би на сервер як DELETE.
        setMeetings(await updateSynced<Meeting>('meetings', mutate));
      }))
      .catch(e => { if (__DEV__) console.warn('[meetings] збереження не вдалося:', e); });
  }, [trackMeetingsWrite]);

  // Стоп таймера наради дописує завершену сесію в її timeEntries повз наш
  // стан — перечитуємо, щоб показ не відставав.
  useEffect(() => {
    if (!meetingsInit || meetingsRevision === 0) return;
    loadData<Meeting[]>('meetings', [])
      .then(setMeetings)
      .catch(e => { if (__DEV__) console.warn('[meetings] перечитування після запису стору не вдалося:', e); });
  }, [meetingsRevision, meetingsInit]);

  // Ref для синхронного читання поточних tasks (використовується в callbacks без deps)
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const storedTaskStatusesRef = useRef<TaskStatusColumn[]>([]);
  useEffect(() => { storedTaskStatusesRef.current = storedTaskStatuses; }, [storedTaskStatuses]);

  // Undo-тост (таб — над таб-баром)
  const { show: showUndo, element: undoElement, visible: undoVisible } = useUndoToast(true);

  // Reset detail tab when opening a different task
  // Ключ — саме id, а не об'єкт: інакше будь-яке оновлення задачі (синк,
  // цокання таймера) викидало б людину з відкритої вкладки «Коментарі» на
  // «Інфо». Окрема змінна замість `selected?.id` у тілі — щоб deps були
  // чесні без eslint-disable, який глушив React Compiler (PERF-2).
  const selectedId = selected?.id;
  useEffect(() => {
    setDetailTab(pendingDetailTab.current ?? 'main');
    pendingDetailTab.current = null;
    setSubReminder(null);
    // Панель деталі одна на задачу й зустріч: відкрита задача витісняє зустріч.
    if (selectedId) setSelectedMeeting(null);
  }, [selectedId]);

  // Джерело правди про «йде» — реєстр активних таймерів у сторі. Читання
  // синхронне, але реактивне: стор оновлює стан разом із ref, тож цей рендер
  // уже бачить актуальний запис.
  const activeTimer = selected ? getTimerForTask(selected.id) : undefined;
  const isTimerRunning = !!activeTimer;

  const todayStr = today.toDateString();
  // Tasks due today (deadline = today) — both done and not done
  // Лише МОЄ (isMyTask): у шапці не має рахуватись робота інших учасників
  // проєктів, якої немає в самому списку нижче.
  // Один memo на всю статистику дня: екран рендериться на кожне натискання
  // клавіші, а тут — Date + рядок на кожне завдання.
  const userId = user?.id;
  const { dueTodayTasks, doneCount, activeCount, effTotalUnits, effDoneUnits, totalSubtasks, doneSubtasks } = useMemo(() => {
    const due = tasks.filter(t => t.deadline && new Date(t.deadline).toDateString() === todayStr
      && (userId === undefined || isMyTask(t, userId, projectRoles)));
    return {
      dueTodayTasks: due,
      doneCount: due.filter(t => t.status === 'done').length,
      activeCount: due.filter(t => t.status === 'active').length,
      // Efficiency based on subtasks (if task has subtasks, count subtask progress; otherwise count task status)
      effTotalUnits: due.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.length : 1), 0),
      effDoneUnits: due.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.filter(s => s.done).length : (t.status === 'done' ? 1 : 0)), 0),
      // Subtasks of tasks due today
      totalSubtasks: due.reduce((acc, t) => acc + t.subtasks.length, 0),
      doneSubtasks: due.reduce((acc, t) => acc + t.subtasks.filter(s => s.done).length, 0),
    };
  }, [tasks, todayStr, userId, projectRoles]);
  // Omni: червона дельта біля KPI «Активні» — скільки МОЇХ завдань уже
  // прострочено (те саме правило «моє» й isOverdue, що й у списку).
  const overdueMineCount = useMemo(
    () => tasks.filter(t => isOverdue(t) && (userId === undefined || isMyTask(t, userId, projectRoles))).length,
    [tasks, userId, projectRoles],
  );
  // Today's meetings — past meetings count as completed units in efficiency
  // Екземпляри повторів теж рахуються — так само, як у секції зустрічей нижче.
  const todayMeetings     = useMemo(() => meetingsOnDate(meetings, today), [meetings, today]);
  const pastMeetingsCount = todayMeetings.filter(m => {
    const mt = new Date(`${m.date}T${m.time || '23:59'}`);
    return mt.getTime() + m.durationMinutes * 60000 <= Date.now();
  }).length;
  const efficiency = (effTotalUnits + todayMeetings.length) > 0
    ? Math.round(((effDoneUnits + pastMeetingsCount) / (effTotalUnits + todayMeetings.length)) * 100)
    : 0;

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => {
      const d = new Date(t.createdAt);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [tasks]);

  const sorted = useMemo(() => sortTasksForList(tasks, sort), [tasks, sort]);

  /**
   * Усе, що звужує список, одним обʼєктом. Той самий обʼєкт іде параметрами
   * маршруту на екран «Всі (N)» — і там із нього будується рівно той самий
   * набір (utils/taskListView.ts), а не друга копія правил.
   */
  const listQuery = useMemo<TaskListQuery>(() => ({
    filter, sort, scope, search,
    projectId: filterProject,
    priorities: filterPriorities,
    dateFilter,
    month: activeMonth,
    // §3.7 «Особисте агрегує» — те саме правило «моє», що вже застосовує
    // «Сьогодні» (groupTodayTasks): без нього «Завдання» показували чужі
    // задачі з усіх проєктів, щойно в проєкті зʼявиться другий учасник
    // (мінор із ревʼю).
    myUserId: user?.id,
    projectRoles,
    noDeadline: scope === 'all' && noDeadline,
  }), [filter, sort, scope, search, filterProject, filterPriorities, dateFilter, activeMonth, user?.id, projectRoles, noDeadline]);

  /**
   * Набір без урахування денного скоупу — тобто те, що людина побачила б,
   * перемкнувши тумблер на «Усі».
   *
   * Потрібен окремо, і не лише заради лічильника на тумблері: коли на сьогодні
   * порожньо, порожній стан мусить чесно сказати, СКІЛЬКИ роботи лежить поза
   * днем. Рахувати це «десь іще» означало б завести другу копію набору фільтрів.
   */
  const filteredAll = useMemo(() => filterTasksForList(sorted, listQuery), [sorted, listQuery]);

  const filtered = useMemo(
    // storedTaskStatuses (сирий, усі потоки), а не taskStatuses (звужений до
    // особистого) — інакше isTodayTask/статусні групи всередині не бачать
    // власних колонок задач проєкту (§3.7 «Особисте агрегує»).
    () => applyTaskScope(filteredAll, listQuery, storedTaskStatuses, today),
    [filteredAll, listQuery, storedTaskStatuses, today],
  );

  // Overdue tasks pulled into a dedicated top section (list view, active/all filter only)
  const overdueItems = useMemo(
    () => overdueForList(filtered, filter, true),
    [filtered, filter],
  );

  // For groups we exclude overdue tasks when the overdue section is shown
  const groupsSource = useMemo(
    () => overdueItems.length > 0 ? filtered.filter(t => !isOverdue(t)) : filtered,
    [filtered, overdueItems],
  );

  const groupLabels = useMemo<GroupLabels>(() => ({
    today: tr.today,
    yesterday: tr.yesterday,
    tomorrow: tr.tomorrow,
    withoutDeadline: tr.withoutDeadline,
    overdue: tr.overdueSection,
  }), [tr]);

  // Статусні групи — це погляд на СЬОГОДНІ: правило, кого туди пускати,
  // живе в утиліті поруч із правилом екрана дня, щоб копії не розходились.
  const groups = useMemo<TaskListGroup<Task>[]>(
    () => buildTaskGroups(groupsSource, listQuery, storedTaskStatuses, today, groupLabels, locale),
    [groupsSource, listQuery, storedTaskStatuses, today, groupLabels, locale],
  );

  // Пошук навмисно не враховано: у нього власна гілка порожнього стану,
  // і змішувати їх означало б радити «скинути фільтри» людині, яка
  // просто нічого не знайшла за запитом.
  const hasFiltersBesidesSearch = filter !== 'active' || sort !== 'status' || !!dateFilter || !!filterProject || filterPriorities.length > 0;
  const hasActiveFilters = filter !== 'active' || sort !== 'status' || !!dateFilter || !!filterProject || filterPriorities.length > 0 || !!search.trim();

  const addTask = useCallback((): Task | null => {
    const draft = composer.draft;
    if (!draft.title.trim()) return null;
    const pickedStatus = taskStatuses.find(column => column.id === draft.statusId) ?? taskStatuses[0];
    // Пікер форми пропонує ОСОБИСТІ статуси незалежно від обраного проєкту
    // (§3.7); еквівалент у ЦЬОМУ проєкті — інакше нова задача проєкту
    // отримувала б особистий status-active/status-done, якого немає серед
    // колонок його дошки (review finding: «create at index.tsx:611 uses
    // selectedStatus.id»), і зникала б із board view.
    const selectedStatus = draft.projectId
      ? projectEquivalentColumn(pickedStatus, storedTaskStatuses, draft.projectId) ?? pickedStatus
      : pickedStatus;
    const base: Task = {
      id: Date.now().toString(),
      title: draft.title.trim(),
      description: draft.desc.trim(),
      ...priorityFields(draft.priorityLevel),
      status: selectedStatus.isDone ? 'done' : 'active',
      kanbanColumnId: selectedStatus.id,
      subtasks: [],
      createdAt: new Date().toISOString(),
      estimatedMinutes: draftEstimatedMinutes(draft),
      deadline: draft.deadline ?? undefined,
      projectId: draft.projectId ?? undefined,
      // §3.3 «createdBy — клієнт ставить при створенні в проєкті».
      createdBy: draft.projectId ? user?.id : undefined,
      // §4.5 — виконавець; має сенс лише для завдання проєкту. Не обраний —
      // я: в особистому просторі видно лише призначене мені (isMyTask), і без
      // цього щойно створена задача проєкту зникала б одразу після «Додати».
      assigneeId: assigneeForPersonalProjectTask({ projectId: draft.projectId ?? undefined, assigneeId: draft.assigneeId ?? undefined }, user?.id),
      timeEntries: [],
      history: [makeHistoryEvent('created')],
      recurrence: draftRecurrence(draft),
    };
    // Спринт із форми (CONTRACT §D.3): null — беклог, інакше assignTaskToSprint.
    const created = applyFormSprint(base, sprints, draft.sprintId);
    setTasks(p => [created, ...p]);
    // Щойно створене завдання МУСИТЬ лишитись на екрані.
    //
    // Денний режим ховає все, що не є роботою на сьогодні, а форма створення
    // лишає дедлайн порожнім за замовчуванням — тобто типове нове завдання під
    // це правило не підпадає й зникало одразу після «Додати». Для людини це
    // невідрізнити від втрати даних: вона щойно натиснула кнопку й нічого не
    // побачила. Тому створення, що виводить завдання з поточного обсягу, САМЕ
    // розширює обсяг до «Усі» — дія користувача важить більше за фільтр.
    if (!inTaskScope(created, storedTaskStatuses, scope, { noDeadline }, today)) {
      if (isWeekTask(created, storedTaskStatuses, today)) selectScope('week');
      else selectScope('all', !created.deadline);
    }
    composer.reset(ACTIVE_COLUMN_ID);
    setShowAdd(false);
    haptic.success();
    return created;
  }, [composer, taskStatuses, storedTaskStatuses, today, sprints, setTasks, user, scope, noDeadline, selectScope]);

  /** «Детальніше»: створити задачу й одразу відкрити її повну картку. */
  const createAndOpen = useCallback(() => {
    const created = addTask();
    if (!created) return;
    // Колонка планшета — не модалка, її можна показати в тому ж тіку.
    // Задача проєкту — аркушем проєкту, а він, як і модалка, чекає, поки
    // зникне аркуш створення.
    if (showDetailColumn && !created.projectId) setSelected(created);
    else setOpenAfterCreate(created.id);
  }, [addTask, showDetailColumn]);
  useEffect(() => {
    if (!openAfterCreate || showAdd) return;
    const id = openAfterCreate;
    const timer = setTimeout(() => {
      setOpenAfterCreate(null);
      const created = tasksRef.current.find(t => t.id === id);
      if (created && !openProjectTask(created)) setSelected(created);
    }, 350);
    return () => clearTimeout(timer);
  }, [openAfterCreate, showAdd, openProjectTask]);

  const deleteTask = useCallback((id: string, title?: string) => {
    const taskToDelete = tasksRef.current.find(t => t.id === id);
    // Contract §4.1: глядач не видаляє проєктні задачі. Перевірка ТУТ, а не
    // лише прихованою кнопкою (review finding): та сама функція викликається
    // з деталі задачі, з рядків «Сьогодні»/Завдань і з дошки/списку проєкту —
    // один захист замість дублювання в кожному місці виклику.
    if (taskToDelete?.projectId && !isLead(projectRoles[taskToDelete.projectId] ?? 'owner')) return;
    Alert.alert(
      tr.deletePermanently,
      title ? `«${title}»\n${tr.cannotUndo}` : tr.cannotUndo,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.delete,
          style: 'destructive',
          onPress: () => {
            // Видалення завдання мусить прибрати і його таймер: інакше в
            // реєстрі лишається запис із taskId, що вказує в нікуди, — він
            // далі цокає у fullscreen-сітці, а зупинити його нема звідки.
            // Черга, а не прямий виклик — див. коментар до pendingTimerStops.
            // Витрачений час при цьому не губиться: stopTimer дзеркалить сесію
            // в 'time_entries', які переживають видалення завдання.
            if (getTimerForTask(id)) pendingTimerStops.current.push(id);
            setTasks(p => p.filter(t => t.id !== id));
            if (selected?.id === id) setSelected(null);
            // Undo: повернути задачу до списку
            if (taskToDelete) {
              showUndo(tr.taskDeleted, () => {
                setTasks(prev => [...prev, taskToDelete]);
              });
            }
          },
        },
      ],
    );
  }, [selected, tr, showUndo, getTimerForTask, setTasks, projectRoles]);

  /**
   * Переносить завдання в іншу колонку статусу.
   *
   * Доти статус можна було змінити лише чекбоксом (готово ↔ активне) або
   * увійшовши в режим редагування. Тобто перевести завдання з «В роботі» в
   * будь-який інший кастомний статус із деталей було неможливо.
   */
  /** Ставить задачу в УЖЕ зведену до її простору колонку. */
  const applyTaskColumn = useCallback((id: string, column: TaskStatusColumn) => {
    // Перенесення в колонку «готово» — така сама зупинка таймера, як і
    // чекбокс: інакше відлік лишався б на завершеному завданні, а кнопку
    // «Стоп» у деталі до нього вже не показують.
    if (column.isDone && getTimerForTask(id)) pendingTimerStops.current.push(id);
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (scopedTaskStatusColumn(t, storedTaskStatusesRef.current).id === column.id && t.kanbanColumnId === column.id) return t;
      const status: Status = column.isDone ? 'done' : 'active';
      const history = appendHistory(t, column.isDone ? 'done' : 'active', column.name);
      return closeSubtasksOnDone(t, {
        ...t,
        status,
        kanbanColumnId: column.id,
        // Назва колонки в нотатці: інакше в історії видно лише «активне», без
        // того, КУДИ саме перенесли завдання.
        history: column.isDone ? withReopenInfo(history, t) : history,
      });
    }));
  }, [getTimerForTask, setTasks]);

  const setTaskColumn = useCallback((id: string, columnId: string) => {
    const chosen = taskStatuses.find(item => item.id === columnId);
    if (!chosen) return;
    const task = tasksRef.current.find(t => t.id === id);
    if (!task) return;
    // Contract §4.1: глядач не рухає проєктну задачу по статусах.
    if (!canEditProjectItem(task.projectId, projectRoles)) return;
    haptic.light();
    // Пікер пропонує ОСОБИСТІ статуси незалежно від проєкту задачі (§3.7
    // «Особисте агрегує»); задачі проєкту пишемо еквівалент у ВЛАСНОМУ
    // проєкті: та сама назва → копія → явний зв'язок (utils/statusLinks.ts).
    const strict = projectEquivalentStrict(chosen, storedTaskStatuses, task.projectId);
    if (strict) { applyTaskColumn(id, strict); return; }
    // Розбіжність: у проєкті немає такого статусу. Дія зроблена в ОСОБИСТОМУ
    // просторі — питаємо, куди перенести задачу в проєкті, і запам'ятовуємо
    // відповідь, щоб наступного разу не питати.
    const projectId = task.projectId!;
    const projectColumns = mergeTaskStatusColumns(storedTaskStatuses, projectId);
    const projectName = projects.find(p => p.id === projectId)?.name ?? '';
    Alert.alert(
      tr.statusLinkAskProjectTitle,
      tr.statusLinkAskProjectBody.replace('{project}', projectName).replace('{name}', chosen.name),
      [
        ...projectColumns.map(column => ({
          text: column.name,
          onPress: () => {
            applyTaskColumn(id, column);
            void saveStatusLink(chosen, projectId, column.id);
          },
        })),
        { text: tr.cancel, style: 'cancel' as const },
      ],
    );
  }, [taskStatuses, storedTaskStatuses, projectRoles, projects, tr, applyTaskColumn]);

  const toggleTask = useCallback((id: string) => {
    // Знімок поточного стану задачі для undo
    const prevTask = tasksRef.current.find(t => t.id === id);
    // Contract §4.1: глядач не відмічає проєктну задачу готовою.
    if (prevTask?.projectId) {
      if(!taskRights(prevTask,projectRoles[prevTask.projectId]??'owner',String(user?.id??'')).execute)return;
      if(prevTask.reviewRequired || prevTask.resultRequirements?.length){openProjectTask(prevTask,'team');return;}
    }
    haptic.light();
    const becomingDone = prevTask?.status === 'active';

    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
      // Скоуп за ВЛАСНИМ проєктом задачі (§3.7): без цього чекбокс завжди
      // ставив особистий status-active/status-done, і задача проєкту після
      // відмітки «готово» лишалась у своїй дошці в колонці «todo» назавжди
      // (review finding: «quick-toggle changes status but not kanbanColumnId»).
      const fallbackColumnId = scopedColumnFor(storedTaskStatuses, t.projectId, status === 'done' ? 'done' : 'todo')?.id
        ?? (status === 'done' ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID);
      // Зняття «готово» повертає задачу туди, звідки її завершили, і
      // відкриває лише ті підзавдання, що були відкриті (utils/taskCompletion.ts).
      const kanbanColumnId = status === 'done'
        ? fallbackColumnId
        : reopenColumnId(t, mergeTaskStatusColumns(storedTaskStatuses, t.projectId), fallbackColumnId) ?? fallbackColumnId;
      const histType: HistoryEventType = status === 'done' ? 'done' : 'active';
      // timeEntries тут не чіпаємо: завершену сесію допише стор при зупинці —
      // він єдиний знає, коли вона почалась.
      return {
        ...t, status, kanbanColumnId,
        subtasks: status === 'done' ? t.subtasks.map(s => ({ ...s, done: true })) : reopenSubtasks(t),
        history: status === 'done' ? withReopenInfo(appendHistory(t, histType), t) : appendHistory(t, histType),
      };
    };

    // «Готово» зупиняє таймер завдання: тримати відлік на завершеному
    // завданні означало б накопичувати час, якого ніхто не витрачає.
    // Черга, а не прямий виклик — див. коментар до pendingTimerStops.
    if (becomingDone && getTimerForTask(id)) pendingTimerStops.current.push(id);
    setTasks(p => {
      const updated = p.map(patch);
      const task = p.find(t => t.id === id);
      // Auto-create next occurrence if recurring task is being marked done
      if (task && task.status === 'active' && task.recurrence && task.deadline) {
        const nextDeadline = nextRecurrenceDate(task.deadline, task.recurrence);
        if (nextDeadline) {
          const nextTask: Task = {
            ...task,
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            status: 'active',
            kanbanColumnId: scopedColumnFor(storedTaskStatuses, task.projectId, 'todo')?.id ?? ACTIVE_COLUMN_ID,
            deadline: nextDeadline,
            subtasks: task.subtasks.map(s => ({ ...s, done: false })),
            timeEntries: [],
            history: [makeHistoryEvent('created')],
          };
          return [...updated, nextTask];
        }
      }
      return updated;
    });
    setSelected(prev => prev?.id === id ? patch(prev) : prev);

    // Тост undo лише при позначенні виконаним
    if (becomingDone && prevTask) {
      const snapshot = prevTask;
      /**
       * Відкочуємо ЛИШЕ те, що змінив чекбокс, а не підміняємо завдання цілим
       * знімком. Знімок зроблено ДО зупинки таймера, а стор дописує завершену
       * сесію (і подію timer_stop) уже після нашого запису 'tasks' — підміна
       * стерла б її назавжди, лишивши дзеркало в 'time_entries' без пари.
       */
      const restore = (t: Task): Task => t.id !== id ? t : {
        ...t,
        status: snapshot.status,
        kanbanColumnId: snapshot.kanbanColumnId,
        // Прапорці підзавдань повертаємо за id: решту полів підзавдання
        // чекбокс завдання не чіпав.
        subtasks: t.subtasks.map(sub => {
          const before = snapshot.subtasks.find(x => x.id === sub.id);
          return before ? { ...sub, done: before.done } : sub;
        }),
        history: appendHistory(t, 'active'),
      };
      showUndo(tr.taskMarkedDone, () => {
        setTasks(prev => prev.map(restore));
        setSelected(prev => prev?.id === id ? restore(prev) : prev);
      });
    }
  }, [showUndo, tr.taskMarkedDone, getTimerForTask, setTasks, storedTaskStatuses, projectRoles, user?.id, openProjectTask]);

  const addSubtask = useCallback((taskId: string) => {
    if (!newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    const patch = (t: Task): Task => t.id === taskId ? {
      ...t,
      subtasks: [...t.subtasks, sub],
      history: appendHistory(t, 'subtask_add', sub.title),
    } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setNewSubtask('');
  }, [newSubtask, setTasks]);

  const toggleSubtask = useCallback((taskId: string, subId: string) => {
    const current = tasksRef.current.find(t => t.id === taskId);
    // Contract §4.1: підзадача — частина запису задачі, тож той самий захист.
    if (!canEditProjectItem(current?.projectId, projectRoles)) return;
    const nextSubs = current?.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s) ?? [];
    // Єдине джерело правила «куди веде відмітка підзавдання» — утиліта.
    // null означає, що ні статус, ні колонку чіпати не можна: відмітка не
    // останньої підзадачі не мусить викидати завдання з «У процесі».
    const transition = current ? subtaskToggleTransition(current, nextSubs, storedTaskStatusesRef.current) : null;
    // Закрита остання підзадача — робота скінчилась, тож таймер зупиняємо так
    // само, як від чекбокса завдання. Зупинка сама переставляє завдання в «На
    // перевірці», тобто пише ТУ САМУ колонку, що й перехід вище: два
    // механізми збігаються, а не воюють за значення.
    if (transition && getTimerForTask(taskId)) pendingTimerStops.current.push(taskId);

    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const targetSub = t.subtasks.find(s => s.id === subId);
      const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
      const histType: HistoryEventType = targetSub?.done ? 'subtask_undone' : 'subtask_done';
      return {
        ...t,
        subtasks,
        ...(transition ?? {}),
        history: appendHistory(t, histType, targetSub?.title),
      };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [getTimerForTask, setTasks, projectRoles]);

  const deleteSubtask = useCallback((taskId: string, subId: string) => {
    const patch = (t: Task): Task => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subId) } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks]);

  const moveSubtask = useCallback((taskId: string, subId: string, dir: 'up' | 'down') => {
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const idx = t.subtasks.findIndex(s => s.id === subId);
      if (idx === -1) return t;
      const newSubs = [...t.subtasks];
      const target = dir === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= newSubs.length) return t;
      [newSubs[idx], newSubs[target]] = [newSubs[target], newSubs[idx]];
      return { ...t, subtasks: newSubs };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks]);

  const duplicateSubtask = useCallback((taskId: string, sub: SubTask) => {
    const copy: SubTask = { id: Date.now().toString(), title: sub.title + tr.subtaskCopySuffix, done: false };
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const idx = t.subtasks.findIndex(s => s.id === sub.id);
      const newSubs = [...t.subtasks];
      newSubs.splice(idx + 1, 0, copy);
      return { ...t, subtasks: newSubs };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks, tr.subtaskCopySuffix]);

  const saveSubEdit = useCallback((taskId: string, subId: string, text: string) => {
    if (!text.trim()) { setEditingSubId(null); return; }
    const patch = (t: Task): Task => t.id !== taskId ? t : {
      ...t, subtasks: t.subtasks.map(s => s.id !== subId ? s : { ...s, title: text.trim() }),
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setEditingSubId(null);
  }, [setTasks]);

  // Стабільні посилання: інакше React.memo на картках нічого не дає.
  const sections = useMemo(
    // key, а не позиція в масиві: групи зʼявляються й зникають разом зі своїм
    // вмістом, і без стабільного ключа заголовки перемонтовувались би на
    // кожній зміні складу.
    // Секція показує не більше TASK_GROUP_LIMIT завдань; решту відкриває
    // «Всі (N)» у футері секції — окремий екран лише цієї групи.
    // Елемент секції — РЯД карток (1 на телефоні/expanded, 2 на medium):
    // SectionList сам по собі колонок не вміє.
    () => groups.map(group => {
      const { visible, total } = limitGroupTasks(group.tasks);
      return { key: group.key, title: group.label, data: chunkRows(visible, cardColumns), total };
    }),
    [groups, cardColumns],
  );
  const overdueLimited = useMemo(() => limitGroupTasks(overdueItems), [overdueItems]);

  /**
   * «Всі (N)»: повний список однієї групи на окремому екрані. Передаємо не
   * знімок завдань, а ФІЛЬТРИ — екран сам перечитує сховище й будує той самий
   * набір тими самими утилітами, тож список там лишається живим.
   */
  const openGroup = useCallback((key: string, title: string) => {
    router.push({
      pathname: '/task-group',
      params: { mode: 'tasks', group: key, title, ...taskListQueryToParams(listQuery) },
    });
  }, [router, listQuery]);

  // ─── Копіювання як Markdown ────────────────────────────────────────────────
  const copyTask = useCallback((task: Task) => {
    const text = taskToMarkdown(task, { projects, sprints, columns: taskStatuses }, taskMarkdownLabels(tr));
    void copyTextToClipboard(text).then(ok => { if (ok) showUndo(tr.taskCopied); });
  }, [projects, sprints, taskStatuses, tr, showUndo]);

  const copySubtask = useCallback((sub: { title: string }) => {
    void copyTextToClipboard(sub.title).then(ok => { if (ok) showUndo(tr.subtaskCopied); });
  }, [tr, showUndo]);

  /** Довгий тап по картці списку — меню дій над завданням. */
  /**
   * Довгий тап по рядку — масовий вибір (Layout System v2.4): рядок стає
   * вибраним, далі короткі тапи додають/знімають інші. «Копіювати», що
   * раніше жило в меню довгого тапу, — тепер у «Дії ▾» панелі вибору.
   */
  const handleLongPressTask = useCallback((task: Task) => {
    haptic.light();
    setBulkIds(prev => {
      const next = new Set(prev);
      next.add(task.id);
      return next;
    });
  }, []);

  /**
   * Скільки роботи припадає на сьогодні. Рахується від НАБОРУ до денного
   * скоупу, а не від побудованих секцій: у режимі «Усі» секції містять увесь
   * список, і підрахунок по них показував би на тумблері «Сьогодні» його ж
   * число. Прострочене входить сюди само — воно сьогоднішнє за правилом.
   */
  const scopeCounts = useMemo(
    () => taskScopeCounts(filteredAll, listQuery, storedTaskStatuses, today),
    [filteredAll, listQuery, storedTaskStatuses, today],
  );
  const todayCount = scopeCounts.today;
  /**
   * Куди вести з порожнього «Сьогодні»: у найближчий непорожній режим —
   * тиждень, далі «Всі» з дедлайном, далі «Без дедлайну».
   */
  const emptyTodayTarget = useMemo(() => (
    scopeCounts.week > 0
      ? { scope: 'week' as const, noDeadline: false, count: scopeCounts.week, label: tr.tasksScopeWeek }
      : scopeCounts.all > 0
        ? { scope: 'all' as const, noDeadline: false, count: scopeCounts.all, label: tr.allTasks }
        : { scope: 'all' as const, noDeadline: true, count: scopeCounts.noDeadline, label: tr.withoutDeadline }
  ), [scopeCounts, tr.tasksScopeWeek, tr.allTasks, tr.withoutDeadline]);
  /**
   * Порожній день при непорожньому списку. Пошук виключено навмисно: у нього
   * власна гілка порожнього стану, і пропонувати «показати всі» людині, яка
   * просто нічого не знайшла за запитом, означало б відповідати не на те питання.
   */
  const todayEmpty = scope === 'today' && !search.trim() && todayCount === 0 && emptyTodayTarget.count > 0;

  /**
   * У віртуалізованому списку елементи монтуються заново при поверненні
   * до них прокруткою. Без цієї перевірки картки «вʼїжджали» б щоразу,
   * як користувач гортає туди-сюди. Анімується лише перша поява.
   */
  const animatedTaskIds = useRef<Set<string>>(new Set());
  const shouldAnimateTask = useCallback((id: string) => {
    if (animatedTaskIds.current.has(id)) return false;
    animatedTaskIds.current.add(id);
    return true;
  }, []);

  // Списки для полів вибору в деталі. Мемоізовані: PickerField тримає їх у
  // useMemo фільтрації, і новий масив на кожен рендер знецінював би це.
  const statusOptions = useMemo(
    () => taskStatuses.map(column => ({ id: column.id, label: column.name, color: column.color })),
    [taskStatuses],
  );
  const projectOptions = useMemo(
    () => pickableProjects.map(project => ({ id: project.id, label: project.name, color: project.color })),
    [pickableProjects],
  );

  /**
   * Завести проєкт прямо з рядка пошуку в пікері — або повернути з архіву той,
   * що вже так звався. Повертає id, який треба обрати.
   *
   * Список читається зі СХОВИЩА, а не береться зі стану екрана. Причина не в
   * акуратності: saveSynced('projects', …) зберігає масив ЦІЛКОМ, і все, чого
   * в ньому немає, синхронізація вважає видаленим. Екран же перечитує проєкти
   * лише при поверненні фокуса, тож проєкт, привезений синком за час, поки
   * відкритий список задач, у застарілому масиві відсутній — і запис поставив
   * би на нього тумбстоун.
   *
   * Ефекту, що зберігав би `projects` при кожній зміні стану, тут навмисно
   * немає: запис робиться один раз, рівно на дію людини.
   */
  const quickCreateProject = useCallback(async (typed: string): Promise<string | null> => {
    // Читання й запис — під одним блокуванням ключа (updateSynced): проєкт,
    // привезений pull-ом між ними, інакше отримав би тумбстоун.
    let stored: Project[] = [];
    let result!: ProjectQuickApplyResult<Project>;
    const saved = await updateSynced<Project>('projects', fresh => {
      stored = fresh;
      result = applyProjectQuickAction(fresh, typed, name => ({
        id: Date.now().toString(),
        name,
        // Колір — не прикраса, а крапка біля задачі й колір на графіках, тож
        // новий проєкт бере наступний ВІЛЬНИЙ колір палітри (спільне з вебом
        // правило), а не завжди перший.
        color: nextProjectColor(fresh),
        createdAt: new Date().toISOString(),
      }));
      return result.projects ?? fresh;
    });
    // Навіть без запису сховище могло піти вперед — хай екран це побачить.
    if (result.projects || result.projectId) setProjects(saved);

    // Підпис кнопки рахується зі стану екрана, а дія — зі сховища, і за час,
    // поки відкритий список задач, синк міг привезти проєкт із такою назвою.
    // Тоді людина прочитала «Новий проект», а сталося повернення з архіву (або
    // навпаки). Мовчки підмінити дію не можна — це рівно та брехня, заради
    // усунення якої підпис і зробили залежним від набраного, — тож кажемо, що
    // насправді відбулось.
    const promised = projectQuickAction(projects, typed).kind;
    if (result.kind !== promised) {
      const done = stored.find(p => p.id === result.projectId) ?? null;
      Alert.alert(
        result.kind === 'restore' ? tr.unarchiveProject : tr.newProject,
        done ? done.name : typed.trim(),
      );
    }
    return result.projectId;
  }, [projects, tr]);

  /**
   * Рядок «створити» для пікера проєктів; `assign` каже, куди подіти обраний.
   *
   * Підпис залежить від набраного: якщо така назва вже лежить в архіві, дія
   * пропонує ПОВЕРНУТИ проєкт, а не завести двійника — інакше історія проєкту
   * (задачі, час, графіки) почалася б заново під тією самою назвою. Точний
   * збіг із живим проєктом ховає рядок сам PickerField, тож там вибір, а не
   * створення.
   */
  const projectCreateOption = useCallback(
    (assign: (id: string) => void): PickerCreateOption => ({
      label: (name: string) => {
        const action = projectQuickAction(projects, name);
        // Для повернення з архіву показуємо назву ЗБЕРЕЖЕНОГО проєкту, а не
        // набране: архівний «Ремонт» і набране «ремонт» — той самий проєкт, але
        // «Повернути з архіву «ремонт»» людина не впізнає.
        return action.kind === 'restore'
          ? `${tr.unarchiveProject} «${action.project.name.trim()}»`
          : `${tr.newProject} «${name}»`;
      },
      onCreate: (name: string) => {
        void quickCreateProject(name).then(id => { if (id) assign(id); });
      },
    }),
    [projects, tr, quickCreateProject],
  );

  const toggleBulk = useCallback((id: string) => {
    haptic.light();
    setBulkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearBulk = useCallback(() => setBulkIds(new Set()), []);

  const handleSelectTask = useCallback((task: Task) => {
    // Режим масового вибору: тап перемикає вибір, картка не відкривається.
    if (selectionMode) { toggleBulk(task.id); return; }
    if (!openProjectTask(task)) setSelected(task);
  }, [openProjectTask, selectionMode, toggleBulk]);
  /** Єдина точка «додати завдання» на екрані: плаваюча «+» (Layout System v2.4 — і на планшеті). */
  const openAddTask = useCallback(() => setShowAdd(true), []);
  const handleToggleTask = useCallback((task: Task) => toggleTask(task.id), [toggleTask]);

  /**
   * Масові дії (BulkActionBar). Кожна — ТІ САМІ операції, що й з одного
   * рядка (toggleTask / правила deleteTask), лише над набором: права ролі
   * проєкту, зупинка таймера й undo працюють так само.
   */
  const bulkMarkDone = useCallback(() => {
    for (const id of bulkIds) {
      const task = tasksRef.current.find(t => t.id === id);
      if (task && task.status === 'active') toggleTask(id);
    }
    clearBulk();
  }, [bulkIds, toggleTask, clearBulk]);

  const deleteTasksBulk = useCallback((ids: readonly string[]) => {
    // Contract §4.1 — та сама перевірка, що в deleteTask: проєктні задачі
    // видаляє лише лід; решту вибору тихо пропускаємо.
    const doomed = tasksRef.current.filter(t => ids.includes(t.id)
      && !(t.projectId && !isLead(projectRoles[t.projectId] ?? 'owner')));
    if (doomed.length === 0) return;
    Alert.alert(
      tr.deletePermanently,
      doomed.length === 1 ? `«${doomed[0].title}»\n${tr.cannotUndo}` : `${doomed.length} × ${tr.tasks}\n${tr.cannotUndo}`,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.delete,
          style: 'destructive',
          onPress: () => {
            const doomedIds = new Set(doomed.map(t => t.id));
            for (const t of doomed) if (getTimerForTask(t.id)) pendingTimerStops.current.push(t.id);
            setTasks(p => p.filter(t => !doomedIds.has(t.id)));
            setSelected(prev => (prev && doomedIds.has(prev.id) ? null : prev));
            clearBulk();
            showUndo(tr.taskDeleted, () => {
              setTasks(prev => [...prev, ...doomed.filter(t => !prev.some(x => x.id === t.id))]);
            });
          },
        },
      ],
    );
  }, [projectRoles, tr, getTimerForTask, setTasks, clearBulk, showUndo]);

  const bulkActions = useMemo(() => {
    const ids = [...bulkIds];
    const one = ids.length === 1 ? tasks.find(t => t.id === ids[0]) : undefined;
    return [
      { key: 'done', label: tr.completed, icon: 'checkmark.circle.fill' as const, onPress: bulkMarkDone, testID: 'bulk-done' },
      ...(one ? [{ key: 'copy', label: tr.copyTask, icon: 'doc.on.doc' as const, onPress: () => { copyTask(one); clearBulk(); }, testID: 'bulk-copy' }] : []),
      { key: 'delete', label: tr.delete, icon: 'trash.fill' as const, tone: 'danger' as const, onPress: () => deleteTasksBulk(ids), testID: 'bulk-delete' },
    ];
  }, [bulkIds, tasks, tr.completed, tr.copyTask, tr.delete, bulkMarkDone, copyTask, clearBulk, deleteTasksBulk]);

  /** Свайп рядка вліво (телефон і планшет): «В архів» = виконано, «Видалити». */
  const swipeActionsFor = useCallback((task: Task) => [
    ...(task.status === 'active'
      ? [{ key: 'archive', label: tr.archive, icon: 'archivebox.fill' as const, tone: 'success' as const, onPress: () => toggleTask(task.id) }]
      : []),
    { key: 'delete', label: tr.delete, icon: 'trash.fill' as const, tone: 'danger' as const, onPress: () => deleteTask(task.id, task.title) },
  ], [tr.archive, tr.delete, toggleTask, deleteTask]);

  /**
   * Застосувати правку картки. Картка править на місці, по одному полю, але
   * правила запису ті самі, що були у формі: проєкт тягне за собою спринт,
   * колонку й виконавця, статус — еквівалент у ВЛАСНОМУ проєкті, done —
   * зупинку таймера. Тому правка йде через чернетку: `initial` — задача як є,
   * `draft` — з однією зміною, і editedDraftFields бачить рівно її. Пишуться
   * лише змінені поля — паралельна правка з вебу іншого поля не відкочується.
   */
  const applyDraftEdit = useCallback((taskId: string, initial: TaskDraft, draft: TaskDraft) => {
    const edited = editedDraftFields(initial, draft);
    if (edited.size === 0) return;
    // Порожня назва не пишеться: задача без назви в списку — дірка.
    if (edited.has('title') && !draft.title.trim()) return;
    const estimatedMinutes = draftEstimatedMinutes(draft);
    const recurrence = draftRecurrence(draft);
    const column = taskStatuses.find(item => item.id === draft.statusId) ?? taskStatuses[0];
    // Вибір done-статусу в редакторі — теж завершення завдання, і таймер на
    // ньому далі йти не має.
    if (edited.has('status') && column.isDone && getTimerForTask(taskId)) {
      pendingTimerStops.current.push(taskId);
    }

    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      // Спринт зникає разом зі зміною проєкту — див. retargetTaskProject.
      // Проєкт застосовується разом з рештою форми, а не миттєво при виборі:
      // інакше «Скасувати» повертало б усе, крім нього.
      let next: Task = edited.has('project')
        ? { ...retargetTaskProject(t, draft.projectId ?? undefined), projectId: draft.projectId ?? undefined }
        : { ...t };
      // §3.7 review finding — createdByAfterProjectChange (utils/taskUtils.ts).
      if (edited.has('project')) {
        next.createdBy = createdByAfterProjectChange(next, user?.id);
        // Перенесену в проєкт задачу без виконавця призначаємо мені — інакше
        // вона зникла б з особистого простору (isMyTask: лише призначене мені).
        if (!edited.has('assignee') && next.projectId && !next.assigneeId) {
          next.assigneeId = assigneeForPersonalProjectTask(next, user?.id);
        }
      }
      if (edited.has('title')) next.title = draft.title.trim();
      if (edited.has('desc')) next.description = draft.desc.trim();
      // Dual-write: priorityLevel + валідне легасі для старих клієнтів.
      if (edited.has('priority')) next = { ...next, ...priorityFields(draft.priorityLevel) };
      if (edited.has('status')) {
        // Пікер форми — ОСОБИСТІ статуси; задачі проєкту пишемо еквівалент
        // у ВЛАСНОМУ проєкті (інакше особистий id, якого немає на дошці
        // проєкту, і на інших пристроях задача «падала» в «До роботи»).
        const target = projectEquivalentColumn(column, storedTaskStatuses, next.projectId) ?? column;
        next.status = target.isDone ? 'done' : 'active';
        next.kanbanColumnId = target.id;
      } else if (edited.has('project') && t.kanbanColumnId) {
        // Змінився простір — колонку старого зводимо до нового: спершу до
        // особистої «за змістом», далі до еквівалента в новому проєкті.
        const personalView = personalDisplayColumn(t, storedTaskStatuses);
        const target = projectEquivalentColumn(personalView, storedTaskStatuses, next.projectId) ?? personalView;
        next.kanbanColumnId = target.id;
        next.status = target.isDone ? 'done' : 'active';
      }
      if (edited.has('estimate')) next.estimatedMinutes = estimatedMinutes;
      if (edited.has('deadline')) next.deadline = draft.deadline ?? undefined;
      if (edited.has('recurrence')) next.recurrence = recurrence;
      // §4.5 — null (у формі: «Без виконавця») пишемо явно, а не пропускаємо:
      // призначення треба вміти й ЗНЯТИ, а не лише поставити.
      if (edited.has('assignee')) next.assigneeId = draft.assigneeId ?? null;
      next.history = appendHistory(t, 'edited');
      // Поле «Спринт»: без змін — задача лишається де була (навіть у закритому
      // спринті); інакше assignTaskToSprint або беклог (ключ видаляється).
      if (edited.has('project') || edited.has('sprint')) {
        next = applyFormSprint(next, sprints, draft.sprintId);
      }
      return closeSubtasksOnDone(t, next);
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [taskStatuses, storedTaskStatuses, getTimerForTask, sprints, setTasks, user]);

  /** Одне поле картки → правка через чернетку (див. applyDraftEdit). */
  const editTaskFields = useCallback((taskId: string, part: Partial<TaskDraft>) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    // Contract §4.1: глядач не редагує проєктну задачу — і тут, а не лише в UI.
    if (!canEditProjectItem(task.projectId, projectRoles)) return;
    const initial = taskToDraft(task, personalDisplayColumn(task, storedTaskStatusesRef.current).id);
    applyDraftEdit(taskId, initial, { ...initial, ...part });
  }, [applyDraftEdit, projectRoles]);

  /** Поля поза чернеткою (дата початку) — прямий запис з подією історії. */
  const patchTaskDirect = useCallback((taskId: string, fields: Partial<Task>) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task || !canEditProjectItem(task.projectId, projectRoles)) return;
    const patch = (t: Task): Task => t.id !== taskId ? t : { ...t, ...fields, history: appendHistory(t, 'edited') };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [projectRoles, setTasks]);

  /** Поставити нагадування задачі або підзавдання на конкретну мить. */
  const setTaskReminder = useCallback(async (taskId: string, subtaskId: string | undefined, moment: Date) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task) return;
    const isoDate = moment.toISOString();
    const name = subtaskId
      ? task.subtasks.find(s => s.id === subtaskId)?.title ?? task.title
      : task.title;
    await scheduleReminder({ type: subtaskId ? 'subtask' : 'task', taskId, subtaskId, title: name }, moment);
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      if (subtaskId) {
        return { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, reminderAt: isoDate } : s) };
      }
      return { ...t, reminderAt: isoDate };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks]);

  const removeReminder = useCallback(async (taskId: string, subtaskId?: string) => {
    await cancelReminder(taskId, subtaskId);
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      if (subtaskId) {
        return { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, reminderAt: undefined } : s) };
      }
      const { reminderAt: _, ...rest } = t;
      return rest as Task;
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks]);

  const showSubtaskActions = useCallback((taskId: string, sub: SubTask, idx: number, total: number) => {
    const buttons: any[] = [
      { text: tr.editAction, onPress: () => { setEditingSubId(sub.id); setEditingSubText(sub.title); } },
      { text: tr.subtaskDuplicate, onPress: () => duplicateSubtask(taskId, sub) },
      ...(idx > 0 ? [{ text: lang === 'uk' ? 'Перемістити вгору' : 'Move up', onPress: () => moveSubtask(taskId, sub.id, 'up') }] : []),
      ...(idx < total - 1 ? [{ text: lang === 'uk' ? 'Перемістити вниз' : 'Move down', onPress: () => moveSubtask(taskId, sub.id, 'down') }] : []),
      { text: sub.reminderAt ? `${tr.reminderAtLabel}: ${new Date(sub.reminderAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : tr.reminderDate, onPress: () => setSubReminder({ taskId, subtaskId: sub.id }) },
      ...(sub.reminderAt ? [{ text: lang === 'uk' ? 'Видалити нагадування' : 'Delete reminder', onPress: () => removeReminder(taskId, sub.id) }] : []),
      { text: tr.delete, style: 'destructive' as const, onPress: () => deleteSubtask(taskId, sub.id) },
      { text: tr.cancel, style: 'cancel' as const },
    ];
    Alert.alert(sub.title, undefined, buttons);
  }, [duplicateSubtask, moveSubtask, deleteSubtask, removeReminder, tr, lang]);

  const startTimer = useCallback(() => {
    if (!selected) return;
    // Беремо свіжу копію: у `selected` лежить знімок на момент відкриття, а
    // стору важливі саме поточні колонка і статус — від них залежить, чи
    // переїде завдання в «У процесі».
    const task = tasksRef.current.find(t => t.id === selected.id) ?? selected;
    void startTaskTimer({
      id: task.id,
      title: task.title,
      kanbanColumnId: task.kanbanColumnId,
      status: task.status,
      projectId: task.projectId,
    });
  }, [selected, startTaskTimer]);

  // Дзеркалення сесії в 'time_entries' і дозапис у timeEntries завдання робить
  // стор — однаково для деталі завдання, вкладки часу і fullscreen-сітки.
  const stopTimer = useCallback(() => {
    if (!selected) return;
    void stopTimerForTask(selected.id);
  }, [selected, stopTimerForTask]);

  const clearAllFilters = useCallback(() => {
    setFilter('active');
    setSort('status');
    setFilterProject(null);
    setFilterPriorities([]);
    setDateFilter(null);
    setSearch('');
    setNoDeadline(false);
  }, []);

  // Мемоізовано: палітра йде пропом у кожну картку списку, і новий об'єкт
  // щорендеру ламав би React.memo на них — а рендери тут часті, бо тік
  // таймера смикає екран щосекунди.
  const c = useMemo(() => ({
    bg1:    t.bg.canvas,
    bg2:    t.bg.canvas,
    card:   glassOf(t).surface,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    // DS v2.1: акцент «Завдань» — lavender (ink на склі ≥ 4.5:1 в обох темах).
    accent: dsGlass(isDark).accent.lavender.ink,
    dim:    glassOf(t).surfaceSubtle,
    sheet:  glassOf(t).sheet,
    /** Головна дія / вибраний сегмент (action.primary) і текст на ній. */
    primary:   t.action.primary,
    onPrimary: t.text.onAction,
    danger:    t.status.danger,
  }), [isDark, t]);

  // Три календарі — фільтр, дедлайн нового завдання, дедлайн у редагуванні —
  // будували сітку місяця трьома однаковими копіями. Тепер monthGrid.
  const calWeeks    = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);

  // Календаря на цьому екрані більше немає (рішення власника, п. 1): місяць
  // із дедлайнами, зустрічами й спринтами — окремий екран /calendar, сюди
  // веде кнопка в шапці.

  // Лише сьогоднішні: завтрашні події тут відволікали від того, що треба
  // зробити зараз. Повний список — на екрані зустрічей.
  //
  // РАЗОМ з екземплярами повторів: раніше секція брала сирий масив, і
  // щоденний стендап, створений учора, сьогодні просто не з'являвся.
  // Порядок (CONTRACT §C.3): поточні й майбутні за часом, минулі — в кінці.
  // «Зараз» береться на рендері, як і раніше: memo на [meetings, today]
  // заморозив би фази до наступної зміни даних.
  const todayMeetings2 = orderTodayMeetings(todayMeetings, new Date());
  const visibleTodayMeetings = showAllTodayMeetings
    ? todayMeetings2
    : todayMeetings2.slice(0, TODAY_MEETINGS_PREVIEW);

  // ─── Meeting CRUD ────────────────────────────────────────────────────────────
  const openEditMeeting = useCallback((m: Meeting) => {
    setMeetingFormInitial({ id: m.id, title: m.title, date: m.date, time: m.time,
      durationMinutes: m.durationMinutes, location: m.location, link: m.link,
      notes: m.notes, color: m.color, recurrence: m.recurrence, projectId: m.projectId });
    setMeetingFormPreset(undefined);
    setShowMeetingForm(true);
  }, []);

  const handleMeetingSave = useCallback((data: MeetingFormData) => {
    if (data.id) {
      // Проєкт — рівень серії (лише оригінал); порожній — ключ видаляється.
      const id = data.id;
      mutateMeetings(p => p.map(m => m.id !== id ? m : withMeetingProject({
        ...m, title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location,
        link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }, data.projectId)));
    } else {
      const created = withMeetingProject<Meeting>({
        id: Date.now().toString(), title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location,
        link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }, data.projectId);
      mutateMeetings(p => [...p, created]);
    }
    setShowMeetingForm(false);
  }, [mutateMeetings]);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert(tr.deleteMeeting, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      // Явне видалення користувачем — фільтруємо СВІЖИЙ масив зі сховища.
      { text: tr.delete, style: 'destructive', onPress: () => mutateMeetings(p => p.filter(m => m.id !== id)) },
    ]);
  }, [tr, mutateMeetings]);

  const selectedTask = selected ? tasks.find(t => t.id === selected.id) ?? selected : null;
  // Коментарі (contract §4.4) — лише для задач проєкту: колекція `comments`
  // існує лише в потоці проєкту, особисті задачі коментарів не мають.
  const selectedTaskRole = useProjectRole(selectedTask?.projectId);
  const meetingFormRole = useProjectRole(meetingFormInitial?.projectId);
  // Contract §4.1: глядач читає задачу, але не редагує, не видаляє й не
  // відмічає — ✎/✕-кнопки й чекбокс у деталі ховаються (review finding:
  // спільний редактор `(tabs)/index.tsx` раніше не питав роль ВЗАГАЛІ, тож
  // виконував будь-яку дію ще ДО того, як сервер устигав її відхилити).
  const selectedRights = selectedTask?.projectId ? taskRights(selectedTask, selectedTaskRole, String(user?.id ?? '')) : null;
  const canEditSelectedTask = !selectedRights || selectedRights.execute;
  // Планування (назва, опис, пріоритет, дедлайн, проєкт, повторення) — лід або
  // автор-виконавець (utils/teamwork.ts taskRights.plan); особиста задача — завжди.
  const canPlanSelectedTask = !selectedRights || selectedRights.plan;
  // Вкладка «Команда» — лише задача проєкту з учасниками (або вже з командними даними).
  const selectedMembers = useProjectMembers(selectedTask?.projectId);
  const showTeamTab = !!selectedTask && hasTeamContext(selectedTask, selectedMembers.length);
  const effectiveDetailTab: TaskDetailTab = detailTab === 'team' && !showTeamTab ? 'main' : detailTab;

  // Спринт задачі проєкту: у «Команді», а для соло-проєкту зі спринтами — у «Деталях».
  const selectedSprintSlot = selectedTask?.projectId
    && sprintFieldVisible(sprints, selectedTask.projectId, selectedTask.sprintId ?? null) ? (
      <OptionField
        icon="flag.checkered"
        label={tr.sprintField}
        options={sprintOptionsForTask(sprints, selectedTask.projectId, selectedTask.sprintId ?? null).map(option => ({
          id: option.id,
          label: sprintOptionLabel(option, { closedSuffix: tr.sprintClosedSuffix, foreign: tr.sprintForeignProject }),
          icon: 'flag' as const,
        }))}
        value={selectedTask.sprintId ?? null}
        onChange={id => editTaskFields(selectedTask.id, { sprintId: id })}
        emptyOption={{ label: tr.sprintBacklog, icon: 'tray' }}
        disabled={!canPlanSelectedTask}
        colors={c}
        isDark={isDark}
      />
    ) : null;

  // Липкий низ картки (DetailPane footer, P2 аудиту 2026-10): «Видалити /
  // Виконано» під прокруткою, а не в її кінці, де лист різав їх навпіл.
  const detailFooter = selectedTask && canEditSelectedTask && (!selectedTask.projectId || isLead(selectedTaskRole)) ? (
          // Contract §4.1: глядач читає, але не видаляє/не відмічає — кнопок просто немає.
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => deleteTask(selectedTask.id, selectedTask.title)}
              accessibilityRole="button"
              style={[s.btn, { flex: 1, backgroundColor: c.danger + '14' }]}>
              <IconSymbol name="trash" size={15} color={c.danger} />
              <Text style={{ color: c.danger, fontFamily: fontFamily.semibold, marginLeft: 5 }}>{tr.delete}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => toggleTask(selectedTask.id)}
              accessibilityRole="button"
              style={[s.btn, { flex: 2, backgroundColor: selectedTask.status === 'done' ? glassOf(t).surfaceSubtle : c.primary }]}>
              <Text style={{ color: selectedTask.status === 'done' ? t.action.secondaryText : c.onPrimary, fontFamily: fontFamily.semibold }}>{selectedTask.status === 'done' ? tr.restore : tr.completed}</Text>
            </TouchableOpacity>
          </View>
        ) : null;

  // Вміст картки. Однаковий для модалки й для колонки — різниться лише
  // обрамлення, див. DetailPane. Окремого режиму редагування немає: кожне поле
  // — рядок, що відкриває свій аркуш і пише одразу (editTaskFields).
  const detailBody = selectedTask ? (
    effectiveDetailTab === 'details' ? (
      <TaskCardDetails
        // Ключ на задачу: недописаний опис комітиться при розмонтуванні у
        // СВОЮ задачу, а не в ту, яку щойно вибрали в списку (планшет).
        key={selectedTask.id}
        description={selectedTask.description ?? ''}
        onDescription={text => editTaskFields(selectedTask.id, { desc: text })}
        estimate={selectedTask.estimatedMinutes}
        onEstimate={minutes => editTaskFields(selectedTask.id, estimateDraft(minutes))}
        startDate={selectedTask.startDate}
        onStartDate={iso => patchTaskDirect(selectedTask.id, { startDate: iso ?? undefined })}
        recurrence={selectedTask.recurrence}
        onRecurrence={rule => editTaskFields(selectedTask.id, recurrenceDraft(rule))}
        reminderAt={selectedTask.reminderAt}
        onSetReminder={moment => { void setTaskReminder(selectedTask.id, undefined, moment); }}
        onRemoveReminder={() => { void removeReminder(selectedTask.id); }}
        createdAt={selectedTask.createdAt}
        hasDeadline={!!selectedTask.deadline}
        sprintSlot={showTeamTab ? null : selectedSprintSlot}
        canExecute={canEditSelectedTask}
        canPlan={canPlanSelectedTask}
        today={today}
        colors={c}
        isDark={isDark}
        locale={locale}
      />
    ) : effectiveDetailTab === 'team' && selectedTask.projectId ? (
      <TeamTaskPanel
        key={selectedTask.id}
        task={selectedTask}
        role={selectedTaskRole}
        sprintSlot={selectedSprintSlot}
        colors={c}
        isDark={isDark}
      />
    ) : effectiveDetailTab === 'activity' ? (
      <TaskCardActivity
        colors={c}
        timerSlot={
          <TaskTimerTab
            task={selectedTask}
            running={isTimerRunning}
            activeStartedAt={activeTimer?.startedAt}
            onStart={startTimer}
            onStop={stopTimer}
            colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
            tr={tr}
            locale={locale}
            fmtClock={formatClock}
            fmtDur={fmtDurLocal}
          />
        }
        historySlot={
          <TaskHistoryTab
            events={selectedTask.history ?? []}
            textColor={c.text}
            subColor={c.sub}
            tr={tr}
            locale={locale}
          />
        }
        // Коментарі (contract §4.4) — лише задача проєкту.
        commentsSlot={selectedTask.projectId ? (
          <CommentsSection
            projectId={selectedTask.projectId}
            targetType="task"
            targetId={selectedTask.id}
            isOwner={selectedTaskRole === 'owner'}
            currentUserId={user?.id ? String(user.id) : null}
            colors={c}
            isDark={isDark}
            locale={locale}
            tr={tr}
          />
        ) : undefined}
      />
    ) : (
      <TaskCardMain
        status={{
          options: statusOptions,
          value: personalDisplayColumn(selectedTask, storedTaskStatuses).id,
          onChange: id => setTaskColumn(selectedTask.id, id),
        }}
        priority={normalizePriority(selectedTask)}
        onPriority={level => editTaskFields(selectedTask.id, { priorityLevel: level })}
        deadline={selectedTask.deadline}
        overdue={isOverdue(selectedTask)}
        onDeadline={iso => editTaskFields(selectedTask.id, { deadline: iso })}
        project={{
          options: projectOptions,
          value: selectedTask.projectId ?? null,
          // Підпис шукається в ПОВНОМУ списку: проєкт могли заархівувати вже
          // після того, як у нього поклали задачу.
          selectedLabel: projects.find(p => p.id === selectedTask.projectId)?.name ?? null,
          onChange: id => editTaskFields(selectedTask.id, { projectId: id, sprintId: null }),
          createOption: projectCreateOption(id => editTaskFields(selectedTask.id, { projectId: id, sprintId: null })),
        }}
        canExecute={canEditSelectedTask}
        canPlan={canPlanSelectedTask}
        today={today}
        colors={c}
        isDark={isDark}
        locale={locale}
        subtasksSlot={
          <>
                    <TaskSubtasks
                      task={selectedTask}
                      progressPercent={getProgress(selectedTask)}
                      editingId={editingSubId}
                      editingText={editingSubText}
                      onChangeEditingText={setEditingSubText}
                      onSaveEdit={(subId, text) => saveSubEdit(selectedTask.id, subId, text)}
                      onToggle={subId => toggleSubtask(selectedTask.id, subId)}
                      onCopy={copySubtask}
                      onShowActions={(sub, idx) => showSubtaskActions(selectedTask.id, sub, idx, selectedTask.subtasks.length)}
                      onOpenAll={() => {
                        setSelected(null);
                        setEditingSubId(null);
                        router.push({ pathname: '/subtasks', params: { taskId: selectedTask.id } });
                      }}
                      newText={newSubtask}
                      onChangeNewText={setNewSubtask}
                      onAdd={() => addSubtask(selectedTask.id)}
                      onFocusInput={() => setTimeout(() => detailScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                      colors={c}
                      isDark={isDark}
                      tr={tr}
                    />
            <ReminderSheet
              visible={!!subReminder && subReminder.taskId === selectedTask.id}
              title={selectedTask.subtasks.find(sub => sub.id === subReminder?.subtaskId)?.title ?? tr.reminderAtLabel}
              reminderAt={selectedTask.subtasks.find(sub => sub.id === subReminder?.subtaskId)?.reminderAt}
              onSave={moment => { if (subReminder) void setTaskReminder(subReminder.taskId, subReminder.subtaskId, moment); }}
              onRemove={() => { if (subReminder) void removeReminder(subReminder.taskId, subReminder.subtaskId); }}
              onClose={() => setSubReminder(null)}
              today={today}
              colors={c}
              isDark={isDark}
            />
          </>
        }
      />
    )
  ) : null;

  /**
   * Закриття картки (× у шапці, бекдроп, свайп). Правки картки пишуться
   * одразу, тож питати «відкинути зміни?» більше нема про що; незбережений
   * текст у полі, що лишилось у фокусі, поля дописують самі при демонтажі.
   */
  const closeTaskDetail = useCallback((alsoMeeting: boolean) => {
    setSelected(null);
    if (alsoMeeting) setSelectedMeeting(null);
  }, []);

  // Липка шапка картки: назва (правиться тапом), ✕ і вкладки стоять поза
  // прокруткою DetailPane — гортається лише тіло. Пріоритет — рядок
  // «Основного», а не бейдж у шапці: другий показ того самого значення.
  const taskDetailHeader = selectedTask ? (
    <TaskDetailHeader
      title={selectedTask.title}
      externalSource={selectedTask.integration}
      leading={
        <AnimatedCheck
          checked={selectedTask.status === 'done'}
          color={t.status.success}
          borderColor={c.border}
          size={22}
          radius={7}
          onPress={canEditSelectedTask ? () => toggleTask(selectedTask.id) : undefined}
          hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
        />
      }
      tab={effectiveDetailTab}
      onTabChange={setDetailTab}
      showTeam={showTeamTab}
      timerRunning={isTimerRunning}
      // Старт таймера — у шапці під назвою: видно на кожній вкладці.
      timerSlot={selectedTask.status === 'active' && canEditSelectedTask ? (
        <TaskTimerButton
          task={selectedTask}
          running={isTimerRunning}
          activeStartedAt={activeTimer?.startedAt}
          onStart={startTimer}
          onStop={stopTimer}
          tr={tr}
        />
      ) : null}
      onRename={canPlanSelectedTask ? title => editTaskFields(selectedTask.id, { title }) : undefined}
      onClose={() => closeTaskDetail(false)}
      onCopy={() => copyTask(selectedTask)}
      // Ручку малює нижній аркуш (BottomSheet), панель планшета її не має.
      showHandle={false}
      colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent }}
      tr={tr}
    />
  ) : null;

  // ─── Перегляд зустрічі ────────────────────────────────────────────────────
  // Оригінал шукаємо в сховищному масиві; екземпляр — оригінал із датою,
  // яку людина натиснула (для повторів вона відрізняється від date оригіналу).
  const viewedMeetingOrig = selectedMeeting
    ? meetings.find(m => m.id === selectedMeeting.origId) ?? null
    : null;
  const viewedMeeting: Meeting | null = viewedMeetingOrig && selectedMeeting
    ? (selectedMeeting.date === viewedMeetingOrig.date
        ? viewedMeetingOrig
        : { ...viewedMeetingOrig, id: `${viewedMeetingOrig.id}_${selectedMeeting.date}`, date: selectedMeeting.date, _origId: viewedMeetingOrig.id })
    : null;
  const viewedMeetingTimer = viewedMeetingOrig ? findTimerForMeeting(activeTimers, viewedMeetingOrig.id) : undefined;

  /**
   * Тап по зустрічі відкриває ПЕРЕГЛЯД, а не форму: раніше подивитися
   * посилання чи нотатки без ризику щось зачепити було нічим.
   * `fromModal` — тап прийшов із модалки (попап дня календаря): на телефоні
   * iOS не покаже другу модалку, поки перша не зникла, звідси пауза.
   */
  const openMeetingView = useCallback((mtg: Meeting, fromModal = false) => {
    const orig = resolveOriginalMeeting(mtg, meetings);
    const target = { origId: orig.id, date: mtg.date };
    const open = () => {
      setSelected(null);
      setSelectedMeeting(target);
    };
    if (fromModal && !showDetailColumn) setTimeout(open, 300);
    else open();
  }, [meetings, showDetailColumn]);

  const closeMeetingView = useCallback(() => setSelectedMeeting(null), []);

  /**
   * Останній `openMeetingView` — у ref, бо сам колбек міняє ідентичність на
   * кожну зміну списку зустрічей.
   *
   * У deps ефекту нижче його ставити не можна: `openMeetingView` викликає
   * `setSelected(null)`, від чого змінюється `selected`, від чого змінюється
   * сам колбек — і поки параметр маршруту ще не згас, ефект зациклився б.
   * Раніше це вирішував eslint-disable, від якого React Compiler переставав
   * оптимізувати весь екран (PERF-2).
   */
  const openMeetingViewRef = useRef(openMeetingView);
  useEffect(() => { openMeetingViewRef.current = openMeetingView; }, [openMeetingView]);

  // ?meeting=<origId>&meetingDate= — перегляд зустрічі з вкладки «Сьогодні»
  // (екземпляр повтору адресується датою; редагування/таймер — оригінал).
  useEffect(() => {
    if (!meetingParam || !meetingsInit) return;
    const orig = meetings.find(m => m.id === meetingParam);
    if (orig) {
      const date = typeof meetingDateParam === 'string' && meetingDateParam ? meetingDateParam : orig.date;
      openMeetingViewRef.current({ ...orig, date, _origId: orig.id });
    }
    router.setParams({ meeting: '', meetingDate: '' });
  }, [meetingParam, meetingDateParam, meetingsInit, router, meetings]);

  const editViewedMeeting = useCallback(() => {
    if (!viewedMeetingOrig) return;
    const orig = viewedMeetingOrig;
    // Колонка планшета лишається на місці — форма відкривається одразу.
    // На телефоні перегляд — модалка, тож спершу закриваємо її.
    if (showDetailColumn) { openEditMeeting(orig); return; }
    setSelectedMeeting(null);
    setTimeout(() => openEditMeeting(orig), 300);
  }, [viewedMeetingOrig, showDetailColumn, openEditMeeting]);

  const toggleViewedMeetingTimer = useCallback(() => {
    if (!viewedMeetingOrig) return;
    // Таймер завжди адресує ОРИГІНАЛ (meeting:<origId>).
    if (viewedMeetingTimer) void stopTimerById(viewedMeetingTimer.id);
    else void startMeetingTimer({ id: viewedMeetingOrig.id, title: viewedMeetingOrig.title, projectId: viewedMeetingOrig.projectId });
  }, [viewedMeetingOrig, viewedMeetingTimer, stopTimerById, startMeetingTimer]);

  const meetingDetailColors = { text: c.text, sub: c.sub, border: c.border, dim: c.dim };
  const meetingDetailHeader = viewedMeeting && viewedMeetingOrig ? (
    <MeetingDetailHeader
      meeting={viewedMeeting}
      original={viewedMeetingOrig}
      onEdit={editViewedMeeting}
      onClose={closeMeetingView}
      isExpanded={showDetailColumn}
      colors={meetingDetailColors}
      tr={tr}
    />
  ) : null;
  const meetingDetailBody = viewedMeeting && viewedMeetingOrig ? (
    <MeetingDetailBody
      meeting={viewedMeeting}
      original={viewedMeetingOrig}
      project={meetingProject(viewedMeetingOrig, projects)}
      timer={viewedMeetingTimer}
      onToggleTimer={toggleViewedMeetingTimer}
      onEdit={editViewedMeeting}
      colors={meetingDetailColors}
      tr={tr}
      locale={locale}
    />
  ) : null;

  // ─── Рендер списку ────────────────────────────────────────────────────────
  // Стабільні колбеки замість інлайнових стрілок: SectionList інакше
  // перемальовує кожен рядок на кожен рендер екрана (а тік таймера смикає
  // його щосекунди).
  /**
   * Колонка «Сьогодні» (TasksTodayPane): зустрічі дня + графік активності.
   * Завдань там немає — вони в списку ліворуч. Джерела відстеженого часу —
   * лише МОЄ (isMyTask), як і статистика над списком; memo — щоб тік таймера
   * щосекунди не перебудовував графік.
   */
  const todayPaneActivity = useMemo(() => ({
    tasks: user?.id === undefined ? tasks : tasks.filter(t => isMyTask(t, user.id, projectRoles)),
    meetings,
    timers: activeTimers,
  }), [tasks, user?.id, projectRoles, meetings, activeTimers]);

  const renderTaskCard = useCallback((task: Task, index: number) => (
    <TaskListItem
      task={task}
      index={index}
      animate={shouldAnimateTask(task.id)}
      motion={motion}
      statusColumn={scopedTaskStatusColumn(task, storedTaskStatuses)}
      onPress={handleSelectTask}
      onToggle={handleToggleTask}
      onLongPress={handleLongPressTask}
      c={c}
      isDark={isDark}
      projects={projects}
      sprints={sprints}
      overdueLabel={tr.overdueSection}
      priorityLabel={priorityA11y(task)}
      subtasksLabel={tr.subtasks}
      assigneeLabel={assigneeLabelFor(task)}
      selected={bulkIds.has(task.id)}
      selectionMode={selectionMode}
      swipeActions={selectionMode ? undefined : swipeActionsFor(task)}
    />
  ), [shouldAnimateTask, motion, storedTaskStatuses, handleSelectTask, handleToggleTask, handleLongPressTask, c, isDark, projects, sprints, tr.overdueSection, tr.subtasks, priorityA11y, assigneeLabelFor, bulkIds, selectionMode, swipeActionsFor]);

  const renderTaskItem = useCallback(({ item, index }: SectionListRenderItemInfo<Task[], TaskSection>) => (
    <TaskCardRow columns={cardColumns}>
      {item.map((task, j) => <React.Fragment key={task.id}>{renderTaskCard(task, index * cardColumns + j)}</React.Fragment>)}
    </TaskCardRow>
  ), [renderTaskCard, cardColumns]);

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<Task[], TaskSection> }) => (
    <GroupHeader title={section.title} count={section.total} />
  ), []);

  const renderSectionFooter = useCallback(({ section }: { section: SectionListData<Task[], TaskSection> }) => (
    section.total > TASK_GROUP_LIMIT ? (
      <GroupShowAllButton
        groupKey={section.key}
        title={section.title}
        total={section.total}
        onPress={openGroup}
        color={c.accent}
        label={tr.groupShowAll}
        a11yLabel={tr.groupShowAllA11y}
      />
    ) : null
  ), [openGroup, c.accent, tr.groupShowAll, tr.groupShowAllA11y]);

  // Пошук, перемикач «Сьогодні / Тиждень / Всі» і чипи активних фільтрів.
  // На телефоні гортаються разом зі списком (ListHeaderComponent), на
  // планшеті стоять над списком нерухомо — «липкі» (рішення власника, п. 3):
  // у двоколонковій розкладці список довгий, а перемикач потрібен завжди.
  const filterBar = (
    <>
            {/* Скоуп: денна робота чи весь список. Окремо від чипів фільтрів
                і завжди на очах — це головний перемикач вкладки, а не одна з
                прихованих у шторці опцій.

                При найбільшому Dynamic Type (AX5) чип «Сьогодні N» колись
                виїжджав за правий край екрана (NAT-06) — тепер вкладки
                займають решту рядка (flex:1) і прокручуються вбік, а кнопка
                фільтрів лишається на місці. «Без дедлайну» — окремим рядком. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* Omni: вкладки розділу — pill-таби з іконками й лічильниками
                    (активна — чорна pill). Прокручуються вбік, коли при
                    великому Dynamic Type не вміщаються (NAT-06). */}
                <SectionTabs
                  tabs={[
                    { key: 'today' as const, label: tr.today, icon: 'sun.max', count: scopeCounts.today },
                    { key: 'week' as const, label: tr.tasksScopeWeek, icon: 'calendar', count: scopeCounts.week },
                    { key: 'all' as const, label: tr.allTasks, icon: 'list.bullet', count: scopeCounts.all },
                  ]}
                  value={scope}
                  onChange={key => { haptic.light(); selectScope(key); }}
                  accessibilityLabel={tr.tasks}
                  style={{ flex: 1, minWidth: 0 }}
                />

                {/* Фільтри й скидання — поруч із перемикачем, а не в хедері:
                    обидва органи керування звужують ОДИН набір завдань, і
                    розводити їх по різних кінцях екрана означало б змушувати
                    шукати причину, чому список порожній, у двох місцях.

                    Два стани в одній кнопці: відкрити фільтри або скинути їх.
                    Коли фільтри активні, короткий тап скидає, довгий — усе одно
                    відкриває налаштування, щоб доступ до них не зникав. */}
                <HeaderButton
                  onPress={() => (hasActiveFilters ? clearAllFilters() : setShowFilterSheet(true))}
                  onLongPress={() => setShowFilterSheet(true)}
                  accessibilityLabel={hasActiveFilters ? tr.resetAllFilters : tr.filters}
                  accessibilityHint={hasActiveFilters ? tr.filters : undefined}
                  style={{
                    marginLeft: 'auto',
                    backgroundColor: hasActiveFilters ? c.danger + '18' : c.card,
                  }}>
                  <IconSymbol
                    name={hasActiveFilters ? 'arrow.counterclockwise' : 'line.3.horizontal.decrease'}
                    size={17}
                    color={hasActiveFilters ? c.danger : c.sub}
                  />
                </HeaderButton>
              </View>

            {/* Search bar (Omni: під вкладками розділу) */}
            <View style={[s.searchBar, { marginTop: 10 }, { backgroundColor: c.card, ...glassRim(t, 'card') }]}>
              <IconSymbol name="magnifyingglass" size={15} color={c.sub} />
              <TextInput
                placeholder={tr.searchPlaceholder}
                placeholderTextColor={c.sub}
                value={search}
                onChangeText={setSearch}
                style={[s.searchInput, { color: c.text }]}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}
                  accessibilityRole="button"
                  accessibilityLabel={tr.clear}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
                </TouchableOpacity>
              )}
            </View>

            {/* «Без дедлайну» — лише в режимі «Всі»: особиста дошка
                типово показує завдання З дедлайном, а беклог без дати
                відкривається свідомо, цією кнопкою. */}
            {scope === 'all' && (
              <View style={{ flexDirection: 'row', marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => { haptic.light(); setNoDeadline(v => !v); }}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: noDeadline }}
                    accessibilityLabel={`${tr.withoutDeadline}, ${scopeCounts.noDeadline}`}
                    accessibilityHint={tr.tasksNoDeadlineA11y}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minHeight: 36, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: noDeadline ? c.primary : c.card }}>
                    <IconSymbol name="calendar" size={13} color={noDeadline ? c.onPrimary : c.sub} />
                    <Text numberOfLines={1} style={{ color: noDeadline ? c.onPrimary : c.sub, fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 }}>{tr.withoutDeadline}</Text>
                    <Text style={{ color: noDeadline ? c.onPrimary : c.sub, fontSize: 11, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>{scopeCounts.noDeadline}</Text>
                  </TouchableOpacity>
                  </View>
                )}

            {/* Active filter chips.
                keyboardShouldPersistTaps: ряд стоїть просто під полем пошуку,
                і з відкритою клавіатурою перший тап по чипу витрачався на її
                ховання — фільтр не скидався (CLAUDE.md, L3). */}
            {hasActiveFilters && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginTop: 10, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                  {filter !== 'active' && (
                    <TouchableOpacity
                      onPress={() => setFilter('active')}
                      accessibilityRole="button"
                      style={[s.activeChip, { backgroundColor: c.primary }]}>
                      <Text style={[s.activeChipText, { color: c.onPrimary }]}>
                        {filter === 'all' ? tr.allTasks : tr.allCompleted}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.onPrimary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  {sort !== 'status' && (
                    <TouchableOpacity
                      onPress={() => setSort('status')}
                      accessibilityRole="button"
                      style={[s.activeChip, { backgroundColor: c.primary }]}>
                      <IconSymbol name="arrow.up.arrow.down" size={10} color={c.onPrimary} />
                      <Text style={[s.activeChipText, { color: c.onPrimary, marginLeft: 4 }]}>
                        {SORT_OPTIONS.find(o => o.key === sort)?.label}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.onPrimary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  {filterProject && (() => {
                    const proj = projects.find(p => p.id === filterProject);
                    return proj ? (
                      <TouchableOpacity
                        onPress={() => setFilterProject(null)}
                        accessibilityRole="button"
                        style={[s.activeChip, { backgroundColor: proj.color + '20' }]}>
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: proj.color }} />
                        <Text style={[s.activeChipText, { color: proj.color, marginLeft: 4 }]}>{proj.name}</Text>
                        <IconSymbol name="xmark" size={10} color={proj.color} style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    ) : null;
                  })()}
                  {filterPriorities.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setFilterPriorities([])}
                      accessibilityRole="button"
                      accessibilityLabel={`${tr.priority}: ${filterPriorities.map(l => priorityLevelLabel(l)).join(', ')}. ${tr.priorityFilterReset}`}
                      style={[s.activeChip, { backgroundColor: c.dim, gap: 4 }]}>
                      {filterPriorities.map(l => <PriorityBadge key={l} level={l} />)}
                      <IconSymbol name="xmark" size={10} color={c.sub} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                  {dateFilter && (
                    <TouchableOpacity
                      onPress={() => setDateFilter(null)}
                      accessibilityRole="button"
                      style={[s.activeChip, { backgroundColor: c.primary }]}>
                      <IconSymbol name="calendar" size={10} color={c.onPrimary} />
                      <Text style={[s.activeChipText, { color: c.onPrimary, marginLeft: 4 }]}>
                        {new Date(dateFilter).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.onPrimary} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={clearAllFilters}
                    accessibilityRole="button"
                    accessibilityLabel={tr.resetAllFilters}
                    style={[s.activeChip, { backgroundColor: c.danger + '18' }]}>
                    <Text style={[s.activeChipText, { color: c.danger }]}>{tr.resetAll}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

    </>
  );

  /**
   * Layout System v2.4: відкрита деталь (завдання чи зустріч). На планшеті з
   * вимкненою панеллю деталей (три крапки → «без деталей») панель не
   * показується, навіть коли щось вибране.
   */
  const detailOpen = (!!selectedTask || !!viewedMeeting) && (!showDetailColumn || zoneState.panels.dynamic);
  // Статична зона «Сьогодні» (зустрічі дня + активність) поруч зі списком —
  // лише на дуже широкому вікні; інакше зустрічі дня показує картка в списку
  // (а повний контекст — вкладка «Сьогодні»).
  const staticShown = zoneWidths({ windowWidth: width, screenWidth, wide: isWide, wantStatic: zoneState.panels.static, wantDynamic: detailOpen }).showStatic;
  /**
   * Режим «Колонки»: ті самі відфільтровані завдання, що й у списку, по
   * колонках статусу в порядку дошки. Колонка задачі проєкту — її особистий
   * відповідник (personalDisplayColumn), як і бейдж статусу на картці.
   */
  const kanbanColumns = useMemo(() => {
    if (zoneState.view !== 'columns') return [] as (KanbanColumn & { tasks: Task[] })[];
    const cols = [...taskStatuses].sort((a, b) => a.position - b.position);
    const byCol = new Map<string, Task[]>(cols.map(col => [col.id, []]));
    for (const task of filtered) {
      const col = personalDisplayColumn(task, storedTaskStatuses);
      const bucket = byCol.get(col.id);
      if (bucket) bucket.push(task);
    }
    return cols.map(col => ({ key: col.id, title: col.name, color: col.color, count: byCol.get(col.id)?.length ?? 0, tasks: byCol.get(col.id) ?? [] }));
  }, [zoneState.view, taskStatuses, filtered, storedTaskStatuses]);

  const listHeader = (
    <>
            {!isWide && filterBar}

            {/* Skeleton — перший завантаження */}
            {!initialized && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}

            {/* Прогрес дня. Самі числа (активні / виконано / ефективність)
                переїхали в KPI шапки (Omni); тут лишається те, чого там немає:
                підзавдання сьогоднішніх завдань — сегментним прогресом. */}
            <View style={{ marginTop: hasActiveFilters ? 12 : 16, marginBottom: 16, gap: 8 }}>
              {totalSubtasks > 0 && (
                <BentoCard
                  compact
                  title={tr.subtasksToday}
                  icon="list.bullet.circle.fill"
                  accent="lavender"
                  headerRight={
                    <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
                      {doneSubtasks}/{totalSubtasks}
                    </Text>
                  }>
                  <SegmentedProgress
                    value={doneSubtasks / totalSubtasks}
                    showValue
                    accessibilityLabel={`${tr.subtasksToday}: ${doneSubtasks}/${totalSubtasks}`}
                  />
                </BentoCard>
              )}
              {dueTodayTasks.length === 0 && (
                <View style={[s.subtaskStatRow, { backgroundColor: t.surface.card, justifyContent: 'center' }]}>
                  <IconSymbol name="checkmark.seal" size={13} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginLeft: 6 }}>{tr.noTasksToday}</Text>
                </View>
              )}
            </View>

            {/* ── Зустрічі дня. На expanded їх показує колонка «Сьогодні»
                праворуч (TasksTodayPane) — другий такий самий список зліва
                був би дублем. ── */}
            {/* Одне правило створення (рішення власника, п. 3): у групи
                «Зустрічі» немає власного «+» і інлайн-поля «Додати зустріч» —
                зустріч додається з Календаря. Порожня група не показується. */}
            {!staticShown && todayMeetings2.length > 0 && (
              // Omni: картка з шапкою «icon-chip + назва», лічильник і ↗ у
              // календар праворуч. Рядки зустрічей — вкладені (surface.subtle):
              // скляна підкладка на білій картці не видна.
              <BentoCard
                compact
                title={tr.meetings}
                icon="calendar"
                accent="info"
                style={{ marginBottom: 20 }}
                headerRight={
                  <>
                    <View style={{ backgroundColor: t.surface.subtle, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{todayMeetings2.length}</Text>
                    </View>
                    <BentoArrowButton
                      onPress={() => router.push('/calendar' as never)}
                      accessibilityLabel={tr.meetings}
                    />
                  </>
                }>
                <View style={{ gap: 4 }}>
                    {visibleTodayMeetings.map(({ meeting: mtg, phase }) => {
                      // Фазу рахує orderTodayMeetings — той самий розрахунок,
                      // що задав порядок; друга копія тут розійшлася б із ним.
                      const isPast = phase === 'past';
                      const isNow = phase === 'current';
                      const dFmt = tr.today;
                      const dur = mtg.durationMinutes >= 60
                        ? `${Math.floor(mtg.durationMinutes / 60)}г${mtg.durationMinutes % 60 ? ` ${mtg.durationMinutes % 60}хв` : ''}`
                        : `${mtg.durationMinutes} хв`;
                      return (
                        <TouchableOpacity key={mtg.id} onPress={() => openMeetingView(mtg)} activeOpacity={0.75}>
                          <View style={{ borderRadius: Atlas.radius.large, paddingVertical: 8, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden', opacity: isPast ? 0.5 : 1, backgroundColor: t.surface.subtle }}>
                            {/* Accent bar */}
                            <View style={{ width: 2.5, alignSelf: 'stretch', backgroundColor: mtg.color, borderRadius: 2, marginLeft: 0, minHeight: 36 }} />
                            {/* Time + day */}
                            <View style={{ alignItems: 'center', minWidth: 44 }}>
                              <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, letterSpacing: -0.3, fontVariant: ['tabular-nums'] }}>{mtg.time || '--:--'}</Text>
                              <Text style={{ color: c.sub, fontSize: 10, fontFamily: fontFamily.medium, marginTop: 1 }}>{dFmt}</Text>
                            </View>
                            {/* Divider */}
                            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: mtg.color + '30', marginVertical: 4 }} />
                            {/* Info */}
                            <View style={{ flex: 1, gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                {isNow && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mtg.color }} />}
                                <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.bold, flex: 1 }} numberOfLines={1}>{mtg.title}</Text>
                                <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr.copyText} onPress={event => { event.stopPropagation(); void copyMeeting(mtg, locale.startsWith('en')); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><IconSymbol name="doc.on.doc" size={15} color={c.sub} /></TouchableOpacity>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <MeetingProjectChip project={meetingProject(mtg, projects)} textColor={c.text} maxWidth={120} />
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                  <IconSymbol name="clock" size={9} color={c.sub} />
                                  <Text style={{ color: c.sub, fontSize: 10 }}>{dur}</Text>
                                </View>
                                {mtg.location ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <IconSymbol name="mappin" size={9} color={c.sub} />
                                    <Text style={{ color: c.sub, fontSize: 10 }} numberOfLines={1}>{mtg.location}</Text>
                                  </View>
                                ) : null}
                                {mtg.link ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <IconSymbol name="link" size={9} color={c.accent} />
                                    <Text style={{ color: c.accent, fontSize: 10, fontFamily: fontFamily.semibold }}>Join</Text>
                                  </View>
                                ) : null}
                                {mtg.notes ? (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <IconSymbol name="note.text" size={9} color={c.sub} />
                                    <Text style={{ color: c.sub, fontSize: 10 }} numberOfLines={1}>{mtg.notes}</Text>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                    {/* Розгортання на місці, а не перехід на екран зустрічей:
                        людина хоче лише доглянути решту сьогоднішнього дня. */}
                    {todayMeetings2.length > TODAY_MEETINGS_PREVIEW && (
                      <TouchableOpacity
                        onPress={() => setShowAllTodayMeetings(v => !v)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: showAllTodayMeetings }}
                        hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8 }}>
                        <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold }}>
                          {showAllTodayMeetings
                            ? tr.collapseList
                            : tr.showAllCount.replace('{count}', String(todayMeetings2.length))}
                        </Text>
                        <IconSymbol name={showAllTodayMeetings ? 'chevron.up' : 'chevron.down'} size={11} color={c.text} />
                      </TouchableOpacity>
                    )}
                  </View>
              </BentoCard>
            )}

            {/* Порожній день — окрема гілка, і вона НЕ про фільтри. Стандартний
                порожній стан радив би «додати завдання» або «скинути фільтри»,
                тоді як насправді робота є: вона просто не на сьогодні. Тому
                тут єдина осмислена дія — показати весь список. */}
            {todayEmpty && (
              <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                <IconSymbol name="checkmark.seal" size={40} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontFamily: fontFamily.semibold }}>{tr.noTasksToday}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{tr.noTasksTodayHint}</Text>
                <TouchableOpacity
                  onPress={() => selectScope(emptyTodayTarget.scope, emptyTodayTarget.noDeadline)}
                  accessibilityRole="button"
                  accessibilityLabel={`${emptyTodayTarget.label}, ${emptyTodayTarget.count}`}
                  style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, minHeight: 44, borderRadius: 999, backgroundColor: glassOf(t).surfaceSubtle, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="list.bullet" size={15} color={c.text} />
                  <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 14, fontVariant: ['tabular-nums'] }}>{emptyTodayTarget.label} · {emptyTodayTarget.count}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty state */}
            {!todayEmpty && filtered.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                <IconSymbol name="checklist" size={40} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontFamily: fontFamily.semibold }}>
                  {search.trim() ? tr.nothingFound : hasFiltersBesidesSearch ? tr.noTasksMatchFilters : scope === 'week' ? tr.noTasksWeekTitle : tr.noTasks}
                </Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                  {search.trim() ? tr.tryAnotherQuery : hasFiltersBesidesSearch ? tr.noTasksMatchFiltersHint
                    // «Всі» з дедлайном порожні, а без дедлайну є — сказати, де
                    // вони, інакше людина вирішить, що задачі зникли.
                    : scope === 'all' && !noDeadline && scopeCounts.noDeadline > 0 ? tr.noDatedTasksHint
                    : tr.pressToAdd}
                </Text>
                {/* Дія має вести до виходу з глухого кута. Коли список порожній
                    через фільтри, кнопка «додати» безпорадна: нове завдання так
                    само не пройде фільтр, і людина вирішить, що воно не
                    створилося. Тому там пропонується скинути фільтри. */}
                {!search.trim() && (hasFiltersBesidesSearch ? (
                  <TouchableOpacity
                    onPress={clearAllFilters}
                    accessibilityRole="button"
                    accessibilityLabel={tr.resetAllFilters}
                    style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, minHeight: 44, borderRadius: 999, backgroundColor: glassOf(t).surfaceSubtle, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="arrow.clockwise" size={15} color={c.text} />
                    <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.resetAllFilters}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={openAddTask}
                    accessibilityRole="button"
                    accessibilityLabel={tr.addTask}
                    style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, minHeight: 44, borderRadius: 999, backgroundColor: c.primary, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="plus" size={15} color={c.onPrimary} />
                    <Text style={{ color: c.onPrimary, fontFamily: fontFamily.semibold, fontSize: 14 }}>{tr.addTask}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Overdue section (list view, active/all filter) */}
            {overdueItems.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <GroupHeader title={tr.overdueSection} count={overdueItems.length} tone="danger" />
                <View style={{ gap: 6 }}>
                  {chunkRows(overdueLimited.visible, cardColumns).map((row, r) => (
                    <TaskCardRow key={row.map(t => t.id).join('|')} columns={cardColumns}>
                      {row.map((task, j) => {
                        const i = r * cardColumns + j;
                        const animEntering = motion.entering(FadeInDown.duration(200).delay(Math.min(i, 10) * 40));
                        const animExiting  = motion.entering(FadeOutUp.duration(150));
                        const animLayout   = motion.entering(LinearTransition.springify());
                        return (
                          <Animated.View
                            key={task.id}
                            entering={animEntering}
                            exiting={animExiting}
                            layout={animLayout}>
                            <SwipeRow actions={swipeActionsFor(task)} enabled={!selectionMode} radius={radius.nested}>
                              {a11y => (
                                <TaskCompactCard
                                  task={task}
                                  statusColumn={scopedTaskStatusColumn(task, storedTaskStatuses)}
                                  onPress={handleSelectTask}
                                  onToggle={handleToggleTask}
                                  onLongPress={handleLongPressTask}
                                  c={c}
                                  isDark={isDark}
                                  projects={projects}
                                  sprints={sprints}
                                  overdueLabel={tr.overdueSection}
                                  priorityLabel={priorityA11y(task)}
                                  subtasksLabel={tr.subtasks}
                                  assigneeLabel={assigneeLabelFor(task)}
                                  selected={bulkIds.has(task.id)}
                                  selectionMode={selectionMode}
                                  rowAccessibilityActions={selectionMode ? undefined : a11y.accessibilityActions}
                                  onRowAccessibilityAction={selectionMode ? undefined : a11y.onAccessibilityAction}
                                />
                              )}
                            </SwipeRow>
                          </Animated.View>
                        );
                      })}
                    </TaskCardRow>
                  ))}
                </View>
                {overdueLimited.hasMore ? (
                  <GroupShowAllButton
                    groupKey={OVERDUE_GROUP_KEY}
                    title={tr.overdueSection}
                    total={overdueLimited.total}
                    onPress={openGroup}
                    color={c.danger}
                    label={tr.groupShowAll}
                    a11yLabel={tr.groupShowAllA11y}
                  />
                ) : null}
              </View>
            )}

    </>
  );

  // ─── KPI дня (Omni: великі тонкі числа в шапці) ─────────────────────────────
  // Ті самі три числа, що раніше стояли рядком-статистикою над списком
  // (дедлайн сьогодні, лише МОЄ). Зустрічі дня тут не дублюються — їх показує
  // картка «Зустрічі» нижче (телефон/портрет) або колонка «Сьогодні» (expanded).
  // До першого читання — нічого: нуль до завантаження збрехав би.
  const headerKpis = initialized ? (
    <>
      <KpiCounter
        value={activeCount}
        label={tr.active}
        delta={overdueMineCount > 0 ? `${overdueMineCount} ${tr.todayOverdue}` : undefined}
        deltaTone="down"
      />
      <KpiCounter value={doneCount} label={tr.done} />
      <KpiCounter value={`${efficiency}%`} label={tr.efficiency} />
    </>
  ) : undefined;

  // Плаваюча «+» — у правому нижньому куті головної зони (Layout System
  // v2.4: і на телефоні, і на планшеті). Поки показаний тост «Скасувати» чи
  // панель масового вибору, вона ховається — інакше «+» стирчав би поверх.
  const fab = !undoVisible && !selectionMode ? (
    <AddTaskFab label={tr.addTask} onPress={openAddTask} color={c.accent} bottom={tabBarInset + 20} />
  ) : null;

  const stickyFilters = (
    <View style={[s.stickyFilters, { borderBottomColor: c.border }]}>{filterBar}</View>
  );

  // Головна зона: шапка + «Список» або «Колонки».
  const mainZone = (
      <View style={{ flex: 1 }}>

        {/* Fixed Header — Omni (DS v2.2): AppHeader поверх <ScreenHeader (верхній
            інсет, стеля Dynamic Type): ☰ · дзвіник · акаунт на телефоні, рядок
            інструментів на планшеті, KPI дня праворуч від H1 / стрічкою. */}
        <AppHeader
          title={tr.tasks}
          kpis={headerKpis}
          // Планшет: «Список / Колонки» — у смузі інструментів шапки;
          // телефон — унизу шухляди ☰ (SidebarDrawer).
          viewSwitch={isWide ? { value: zoneState.view, onChange: zoneState.setView } : undefined}
          actions={
            <>
              {/* Шапка тримає ОДНУ кнопку дій «⋯» (рішення власника, п. 5):
                  Календар, Архів, Фільтри й сортування, Проєкти, Нотатки —
                  у меню. Створення — плаваюча «+» (Layout System v2.4). */}
              {/* Кнопки фільтрів у хедері немає навмисно: вона переїхала в рядок
                  із перемикачем «Сьогодні / Усі». Все, що звужує НАБІР
                  завдань, стоїть в одному рядку — і перемикач, і фільтри. */}
              <HeaderButton
                onPress={() => setShowOptionsMenu(v => !v)}
                accessibilityLabel={tr.a11yOptions}
                style={{ backgroundColor: hasActiveFilters ? c.primary : c.card }}>
                <IconSymbol name="ellipsis" size={17} color={hasActiveFilters ? c.onPrimary : c.sub} />
              </HeaderButton>
            </>
          }>
          <MonthPicker
            month={activeMonth}
            onChange={m => { setActiveMonth(m); setDateFilter(null); }}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={c.accent}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
        </AppHeader>
        {/* кінець шапки (AppHeader → </ScreenHeader>) */}

        {/* Планшет (і «Колонки» на телефоні): пошук і перемикач скоупу —
            нерухомо над списком/дошкою. */}
        {(isWide || zoneState.view === 'columns') && stickyFilters}

        {zoneState.view === 'columns' ? (
          <KanbanPager
            testID="tasks-kanban"
            columns={kanbanColumns}
            paging={!isWide}
            contentBottom={tabBarInset + FAB_LIST_CLEARANCE}
            renderColumn={col => (col.tasks.length > 0
              ? col.tasks.map((task, i) => <React.Fragment key={task.id}>{renderTaskCard(task, i)}</React.Fragment>)
              : <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.medium, textAlign: 'center', paddingVertical: 24 }}>{tr.noTasks}</Text>)}
          />
        ) : (
        <SectionList
          sections={sections}
          keyExtractor={row => row.map(task => task.id).join('|')}
          // Місце під плаваючу «+» (52 + відступ 20) із запасом — бейдж
          // пріоритету стоїть у правому нижньому куті картки, рівно під FAB,
          // і без запасу останній P# ховався за «+».
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: isWide ? 12 : 0, paddingBottom: tabBarInset + FAB_LIST_CLEARANCE }}
          showsVerticalScrollIndicator={false}
          // Заголовки груп не липкі — так було й до віртуалізації.
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          ListHeaderComponent={listHeader}
          ListFooterComponent={tasks.length >= 10 ? <AdSlot slot="M2" hidden={showAdd || showMeetingForm || showFilterSheet} /> : null}
          renderSectionHeader={renderSectionHeader}
          renderSectionFooter={renderSectionFooter}
          ItemSeparatorComponent={TaskItemSeparator}
          renderItem={renderTaskItem}
        />
        )}
      </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <MeshBackground />
      {/*
        Layout System v2.4 — зони: [статична «Сьогодні» (≥1280)] [головна]
        [деталі — панель праворуч з ✕ / нижній аркуш ~60% на телефоні].
        Три крапки під списком (планшет) вмикають/вимикають статичну зону й
        панель деталей.
      */}
      <ZoneLayout
        testID="tasks-zones"
        main={mainZone}
        dynamic={selectedTask ? detailBody : meetingDetailBody}
        dynamicOpen={detailOpen}
        onCloseDynamic={() => closeTaskDetail(true)}
        dynamicHeader={selectedTask ? taskDetailHeader : meetingDetailHeader}
        dynamicFooter={selectedTask ? detailFooter : undefined}
        dynamicLabel={selectedTask ? selectedTask.title : viewedMeeting?.title}
        dynamicScrollRef={detailScrollRef}
        // ✕ і вкладки дає сама шапка картки (TaskDetailHeader / MeetingDetailHeader).
        dynamicChrome={false}
        static={
          <TasksTodayPane
            today={today}
            locale={locale}
            meetings={todayMeetings2}
            activitySources={todayPaneActivity}
            onOpenMeeting={openMeetingView}
            onOpenCalendar={() => router.push('/calendar' as never)}
            // dim — суцільний surface.subtle: графік стоїть на білій картці.
            colors={{ text: c.text, sub: c.sub, border: c.border, dim: t.surface.subtle, accent: c.accent }}
            tr={tr}
          />
        }
        showStatic={zoneState.panels.static}
        panels={isWide ? zoneState.panels : undefined}
        onTogglePanel={zoneState.togglePanel}
        fab={fab}
        overlay={
          <BulkActionBar
            testID="tasks-bulk-bar"
            count={bulkIds.size}
            actions={bulkActions}
            onClear={clearBulk}
            bottom={tabBarInset + 16}
          />
        }
      />

      <MeetingFormSheet
        visible={showMeetingForm}
        initial={meetingFormInitial}
        presetDate={meetingFormPreset}
        onClose={() => setShowMeetingForm(false)}
        onSave={handleMeetingSave}
        onDelete={meetingFormInitial?.id ? () => { deleteMeeting(meetingFormInitial!.id!); setShowMeetingForm(false); } : undefined}
        isDark={isDark}
        lang={lang}
        tr={tr}
        projects={projects}
        currentUserId={user?.id ? String(user.id) : null}
        isProjectOwner={meetingFormRole === 'owner'}
      />

      {projectTaskSheet}

      {/* ─── Options Dropdown ─── */}
      <Modal visible={showOptionsMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowOptionsMenu(false)}>
        <Pressable accessible={false}
          style={{ flex: 1, backgroundColor: t.surface.overlay }}
          onPress={() => setShowOptionsMenu(false)}>
          <View
            style={[{
              position: 'absolute',
              top: topInset + 62,
              right: 16,
              borderRadius: Atlas.radius.xlarge,
              overflow: 'hidden',
              minWidth: 238,
              // DS v2: поповер — surface.elevated + shadow.popover, без рамки.
              ...shadow[isDark ? 'dark' : 'light'].popover,
            }, { backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong') }]}>
              <OverlayMaterial isDark={isDark} />
            {/* Meetings */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/calendar' as never); }}
              accessibilityRole="menuitem"
              accessibilityLabel={tr.calendar}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: c.accent + '20' }]}>
                <IconSymbol name="calendar.circle.fill" size={15} color={c.accent} />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.calendar}</Text>
              {meetings.length > 0 && (
                <View style={{ backgroundColor: c.dim, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginRight: 4 }}>
                  <Text style={{ color: c.text, fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{meetings.length}</Text>
                </View>
              )}
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Archive */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/archive'); }}
              accessibilityRole="menuitem"
              accessibilityLabel={tr.archive}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: t.status.success + '20' }]}>
                <IconSymbol name="archivebox.fill" size={15} color={t.status.success} />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.archive}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Filters */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); setShowFilterSheet(true); }}
              accessibilityRole="menuitem"
              accessibilityLabel={tr.filtersAndSort}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: hasActiveFilters ? t.accent.amber + '26' : c.dim }]}>
                <IconSymbol name="line.3.horizontal.decrease" size={15} color={hasActiveFilters ? t.accent.amber : c.sub} />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.filtersAndSort}</Text>
              {hasActiveFilters
                ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent.amber }} />
                : <IconSymbol name="chevron.right" size={12} color={c.sub} />}
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Projects */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/projects'); }}
              accessibilityRole="menuitem"
              accessibilityLabel={tr.projects}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: t.status.info + '20' }]}>
                <IconSymbol name="folder.fill" size={15} color={t.status.info} />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.projects}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Notes */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/notes'); }}
              accessibilityRole="menuitem"
              accessibilityLabel={tr.notes}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: t.accent.amber + '26' }]}>
                <IconSymbol name="note.text" size={15} color={t.accent.amber} />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.notes}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ─── Filter & Sort Bottom Sheet ─── */}
      <Modal visible={showFilterSheet} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowFilterSheet(false)}>
        <Pressable accessible={false} style={s.overlay} onPress={() => setShowFilterSheet(false)}>
          <Pressable onPress={e => e.stopPropagation()} accessible={false} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
            <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRim(t, 'strong') }]}>
              <OverlayMaterial isDark={isDark} />
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowFilterSheet(false)}
                      accessibilityRole="button" accessibilityLabel={tr.close}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Скидання поруч із заголовком, а не в кінці списку: раніше
                    до нього треба було прокрутити всі секції — тобто саме тоді,
                    коли фільтрів багато, дістатись до скидання найважче. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 10 }}>
                  <Text style={[s.sheetTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>{tr.filtersAndSort}</Text>
                  {hasActiveFilters && (
                    <TouchableOpacity
                      onPress={clearAllFilters}
                      accessibilityRole="button"
                      accessibilityLabel={tr.resetAllFilters}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.danger + '14' }}>
                      <IconSymbol name="arrow.counterclockwise" size={12} color={c.danger} />
                      <Text style={{ color: c.danger, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.resetAll}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Calendar filter */}
                <Text style={[s.label, { color: c.sub }]}>{tr.creationDate}</Text>
                <TouchableOpacity
                  onPress={() => { setShowFilterSheet(false); setShowCal(true); }}
                  style={[s.filterActionBtn, { backgroundColor: c.dim, borderColor: dateFilter ? c.text : 'transparent' }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.text : c.sub} />
                  <Text style={{ color: dateFilter ? c.text : c.sub, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1, marginLeft: 10 }}>
                    {dateFilter
                      ? new Date(dateFilter).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                      : tr.select}
                  </Text>
                  {dateFilter && (
                    <TouchableOpacity onPress={() => setDateFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* Status filter */}
                <Text style={[s.label, { color: c.sub }]}>{tr.status}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['all', 'active', 'done'] as Filter[]).map(f => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setFilter(f)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: filter === f, checked: filter === f }}
                      accessibilityLabel={f === 'all' ? tr.allTasks : f === 'active' ? tr.allActive : tr.allCompleted}
                      style={[s.filterSegBtn, { flex: 1, backgroundColor: filter === f ? c.primary : c.dim }]}>
                      <IconSymbol
                        name={f === 'all' ? 'tray.full' : f === 'active' ? 'circle.dotted' : 'checkmark.circle.fill'}
                        size={14}
                        color={filter === f ? c.onPrimary : c.sub}
                      />
                      <Text style={{ color: filter === f ? c.onPrimary : c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 4 }}>
                        {f === 'all' ? tr.allTasks : f === 'active' ? tr.allActive : tr.allCompleted}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Priority filter */}
                <Text style={[s.label, { color: c.sub }]}>{tr.priority}</Text>
                <PriorityFilterChips
                  value={filterPriorities}
                  onChange={setFilterPriorities}
                  colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
                />

                {/* Project filter */}
                {pickableProjects.length > 0 && (
                  <>
                    <Text style={[s.label, { color: c.sub }]}>{tr.project}</Text>
                    {/* Чипи замість повноширинних рядків: при 5 проєктах це
                        економить пів екрана і дає побачити всі варіанти одразу. */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                      <TouchableOpacity
                        onPress={() => setFilterProject(null)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: !filterProject }}
                        style={[s.sortChip, { minHeight: 36, backgroundColor: !filterProject ? c.primary : c.dim }]}>
                        <Text style={{ color: !filterProject ? c.onPrimary : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.allProjects}</Text>
                      </TouchableOpacity>
                      {pickableProjects.map(proj => {
                        const on = filterProject === proj.id;
                        return (
                          <TouchableOpacity
                            key={proj.id}
                            onPress={() => setFilterProject(on ? null : proj.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            style={[s.sortChip, { minHeight: 36, maxWidth: 190, backgroundColor: on ? proj.color + '22' : c.dim, borderWidth: 1.5, borderColor: on ? proj.color : 'transparent' }]}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: proj.color, marginRight: 6 }} />
                            <Text numberOfLines={1} style={{ color: on ? proj.color : c.text, fontSize: 12, fontFamily: fontFamily.semibold, flexShrink: 1 }}>{proj.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Sort */}
                <Text style={[s.label, { color: c.sub }]}>{tr.sorting}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                  {SORT_OPTIONS.map(opt => {
                    const on = sort === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => setSort(opt.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={[s.sortChip, { minHeight: 36, backgroundColor: on ? c.primary : c.dim }]}>
                        <IconSymbol name={opt.icon as any} size={13} color={on ? c.onPrimary : c.sub} />
                        <Text style={{ color: on ? c.onPrimary : c.text, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 6 }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Готово — головна дія шита. Скидання перенесено нагору,
                    поруч із заголовком. */}
                <TouchableOpacity
                  onPress={() => setShowFilterSheet(false)}
                  accessibilityRole="button"
                  style={[s.btn, { marginTop: 22, backgroundColor: c.primary }]}>
                  <Text style={{ color: c.onPrimary, fontFamily: fontFamily.semibold }}>{tr.applyFilters}</Text>
                </TouchableOpacity>

                <View style={{ height: 8 }} />
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar filter Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} accessible={false} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <View style={[s.sheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRim(t, 'strong') }]}>
                <OverlayMaterial isDark={isDark} />
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)}
                      accessibilityRole="button" accessibilityLabel={tr.close}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>
                <CalendarGrid
                  year={calYear} month={calMonth}
                  markedDays={markedDays}
                  selectedDate={dateFilter}
                  todayDate={today}
                  weeks={calWeeks}
                  months={MONTHS_UA}
                  weekdays={WEEKDAYS_SHORT}
                  onPrevMonth={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                  onNextMonth={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                  onSelectDay={(dayDate) => { setDateFilter(dayDate.toDateString() === dateFilter ? null : dayDate.toDateString()); setShowCal(false); }}
                  c={c}
                />
                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { backgroundColor: c.dim }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 5 }}>{tr.resetFilter}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Швидке створення: назва + дедлайн/пріоритет/проєкт; решта — «Детальніше» ─── */}
      {/* handle="inside": ручка і ✕ — всередині короткої картки, а не
          окремим рядком над нею на бекдропі (P2: рядок «висів у повітрі» і
          стрибав разом із клавіатурою). */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)} handle="inside">
        <View style={[s.detailSheet, { maxHeight: height * 0.88, backgroundColor: c.sheet, ...glassRim(t, 'strong') }]}>
          <OverlayMaterial isDark={isDark} />
          <SheetHandle />
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TaskQuickCreate
              editor={composer}
              pickableProjects={pickableProjects}
              projects={projects}
              projectCreateOption={projectCreateOption(id => composer.patch({ projectId: id, sprintId: null }))}
              sprints={sprints}
              today={today}
              onSave={addTask}
              onMore={createAndOpen}
              colors={c}
              isDark={isDark}
              locale={locale}
            />
          </ScrollView>
        </View>
      </SheetModal>


      {/* Undo-тост */}
      {undoElement}
    </View>
  );
}

// ─── Compact Card ────────────────────────────────────────────────────────────

/**
 * Рядок списку: анімаційна обгортка навколо картки.
 *
 * Окремий компонент, щоб renderItem не створював елементи анімації
 * заново — і щоб memo нижче мала що порівнювати.
 */
const TaskListItem = React.memo(function TaskListItem({
  task, index, animate, motion, statusColumn, onPress, onToggle, onLongPress,
  c, isDark, projects, sprints, overdueLabel, priorityLabel, subtasksLabel, assigneeLabel,
  selected, selectionMode, swipeActions,
}: {
  task: Task;
  index: number;
  animate: boolean;
  motion: ReturnType<typeof useMotion>;
  statusColumn: TaskStatusColumn;
  onPress: (task: Task) => void;
  onToggle: (task: Task) => void;
  onLongPress: (task: Task) => void;
  c: any;
  isDark: boolean;
  projects: Project[];
  sprints: Sprint[];
  overdueLabel: string;
  priorityLabel: string;
  subtasksLabel: string;
  assigneeLabel?: string | null;
  selected?: boolean;
  selectionMode?: boolean;
  /** Дії свайпу вліво (Layout System v2.4); undefined — свайпу немає (режим вибору). */
  swipeActions?: SwipeAction[];
}) {
  return (
    <Animated.View
      entering={animate ? motion.entering(FadeInDown.duration(200).delay(Math.min(index, 10) * 40)) : undefined}
      exiting={motion.entering(FadeOutUp.duration(150))}
      layout={motion.entering(LinearTransition.springify())}>
      <SwipeRow actions={swipeActions ?? []} enabled={!!swipeActions} radius={radius.nested}>
        {a11y => (
          <TaskCompactCard
            task={task}
            statusColumn={statusColumn}
            onPress={onPress}
            onToggle={onToggle}
            onLongPress={onLongPress}
            c={c}
            isDark={isDark}
            projects={projects}
            sprints={sprints}
            overdueLabel={overdueLabel}
            priorityLabel={priorityLabel}
            subtasksLabel={subtasksLabel}
            assigneeLabel={assigneeLabel}
            selected={selected}
            selectionMode={selectionMode}
            rowAccessibilityActions={swipeActions ? a11y.accessibilityActions : undefined}
            onRowAccessibilityAction={swipeActions ? a11y.onAccessibilityAction : undefined}
          />
        )}
      </SwipeRow>
    </Animated.View>
  );
});

/** Розбити список на ряди по `size` (картки в кілька колонок). */
function chunkRows<T>(items: readonly T[], size: number): T[][] {
  if (size <= 1) return items.map(item => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Ряд карток. В одну колонку — просто обгортка; у дві — рівні колонки, а
 * неповний останній ряд добивається порожнім місцем, щоб самотня картка не
 * розтягувалась на всю ширину і стояла під своєю колонкою.
 */
function TaskCardRow({ columns, children }: { columns: number; children: React.ReactNode }) {
  if (columns <= 1) return <>{children}</>;
  const cells = React.Children.toArray(children);
  return (
    <View style={s.cardRow}>
      {cells.map((cell, i) => <View key={i} style={s.cardCell}>{cell}</View>)}
      {Array.from({ length: Math.max(0, columns - cells.length) }, (_, i) => (
        <View key={`pad-${i}`} style={s.cardCell} />
      ))}
    </View>
  );
}

/** Секція списку: `data` — ряди видимих карток (до ліміту), `total` — скільки в групі всього. */
interface TaskSection {
  key: string;
  title: string;
  total: number;
}

/** Відступ між картками. Модульний компонент — не нова функція щорендера. */
/**
 * Заголовок групи списку в стилі колонки Omni-канбану: кільце статусу +
 * назва + лічильник у pill. «Прострочені» — тоном danger (червоне кільце й
 * лічильник), решта — нейтральні. Сам текст — text.primary/secondary, тож
 * контраст ≥ 4.5:1 в обох темах; колір несе лише кільце.
 */
const GroupHeader = React.memo(function GroupHeader({ title, count, tone = 'neutral' }: {
  title: string; count?: number; tone?: 'neutral' | 'danger';
}) {
  const { t } = useDSTheme();
  const ring = tone === 'danger' ? t.status.danger : t.text.secondary;
  return (
    <View style={s.groupHead} accessibilityRole="header" accessible accessibilityLabel={count != null ? `${title}, ${count}` : title}>
      <View style={[s.groupRing, { borderColor: ring }]} />
      <Text numberOfLines={1} style={[s.groupHeadText, { color: tone === 'danger' ? t.status.danger : t.text.primary }]}>{title}</Text>
      {count != null ? (
        <View style={[s.groupCount, { backgroundColor: tone === 'danger' ? t.status.danger + '1F' : t.surface.subtle }]}>
          <Text style={[s.groupCountText, { color: tone === 'danger' ? t.status.danger : t.text.secondary }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
});

function TaskItemSeparator() {
  return <View style={s.itemSeparator} />;
}

/** «Всі (N)» під групою, у якій завдань більше за TASK_GROUP_LIMIT. */
const GroupShowAllButton = React.memo(function GroupShowAllButton({
  groupKey, title, total, onPress, color, label, a11yLabel,
}: {
  groupKey: string;
  title: string;
  total: number;
  onPress: (key: string, title: string) => void;
  color: string;
  /** «Всі ({count})» */
  label: string;
  /** «Показати всі завдання групи «{name}»: {count}» */
  a11yLabel: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onPress(groupKey, title)}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel.replace('{name}', title).replace('{count}', String(total))}
      style={[s.groupShowAll, { backgroundColor: color + '12' }]}>
      <Text style={{ color, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>
        {label.replace('{count}', String(total))}
      </Text>
      <IconSymbol name="chevron.right" size={12} color={color} />
    </TouchableOpacity>
  );
});

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  searchBar:      { flexDirection: 'row', alignItems: 'center', borderRadius: 999, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 0 },
  searchInput:    { flex: 1, fontSize: 14, fontFamily: fontFamily.regular, marginLeft: 8, paddingVertical: 0 },
  activeChip:     { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, minHeight: 32 },
  activeChipText: { fontSize: 11, fontFamily: fontFamily.semibold },
  subtaskStatRow: { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.large, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, overflow: 'hidden' },
  sortChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  sortLabel:      { fontSize: 12, fontFamily: fontFamily.semibold },
  groupHead:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 10, minHeight: 24 },
  groupRing:      { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  groupHeadText:  { fontSize: 14, fontFamily: fontFamily.semibold, flexShrink: 1 },
  groupCount:     { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  groupCountText: { fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  taskCard:       { borderRadius: Atlas.radius.xlarge, padding: 16, overflow: 'hidden' },
  boardCard:      { borderRadius: Atlas.radius.large, padding: 12, overflow: 'hidden' },
  taskTitle:      { fontSize: 14, fontFamily: fontFamily.semibold },
  checkbox:       { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot:            { width: 8, height: 8, borderRadius: 4 },
  colorDot:       { width: 12, height: 12, borderRadius: 4 },
  badge:          { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  // tabular-nums: без них ширина «7%» і «71%» різна, і прогрес-рядок сіпається
  // при кожній зміні.
  pct:            { fontSize: 11, fontFamily: fontFamily.semibold, minWidth: 30, fontVariant: ['tabular-nums'] },
  colLabel:       { fontSize: 12, fontFamily: fontFamily.semibold, letterSpacing: 0.2 },
  emptyCol:       { borderRadius: Atlas.radius.medium, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 24, alignItems: 'center' },
  overlay:        { flex: 1, backgroundColor: 'rgba(17,17,19,0.40)', justifyContent: 'flex-end' },
  sheetWrapper:   { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:          { borderRadius: Atlas.radius.xxlarge, padding: 24, overflow: 'hidden' },
  detailSheet:    { borderRadius: Atlas.radius.xxlarge, padding: 24, overflow: 'hidden' },
  inlineCalendar: { borderRadius: Atlas.radius.large, padding: 12, marginBottom: 8 },
  reminderPickerBox: { borderRadius: Atlas.radius.large, padding: 12, marginTop: 8 },
  handleRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:         { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:     { fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 18 },
  detailTitle:    { fontSize: 20, fontFamily: fontFamily.semibold, lineHeight: 26 },
  detailDesc:     { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 8 },
  input:          { borderRadius: Atlas.radius.medium, minHeight: 44, padding: 13, fontSize: 14, fontFamily: fontFamily.regular },
  label:          { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 16 },
  priorityBtn:    { flex: 1, paddingVertical: 9, borderRadius: Atlas.radius.medium, borderWidth: 1.5, alignItems: 'center' },
  btn:            { paddingVertical: 13, minHeight: 48, borderRadius: 999, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  subRow:         { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.medium, padding: 10 },
  subCheck:       { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  subTitle:       { fontSize: 13, fontFamily: fontFamily.medium },
  addSubRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.medium, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 10 },
  subInput:       { fontFamily: fontFamily.regular, fontSize: 13, paddingVertical: 0 },
  navBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:        { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  daydot:         { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, minHeight: 44, borderRadius: 999 },
  // Filter sheet
  filterActionBtn:{ flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.medium, borderWidth: 1.5, minHeight: 44, paddingHorizontal: 14, paddingVertical: 11 },
  filterSegBtn:   { paddingVertical: 11, borderRadius: Atlas.radius.large, alignItems: 'center', justifyContent: 'center', gap: 4 },
  viewAllBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 11 },
  itemSeparator:  { height: 6 },
  cardRow:        { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  cardCell:       { flex: 1, minWidth: 0 },
  stickyFilters:  { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  groupShowAll:   { flexDirection: 'row', alignItems: 'center', borderRadius: 999, minHeight: 44, paddingHorizontal: 14, paddingVertical: 11, marginTop: 6 },
  dropdownBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: Atlas.radius.medium, paddingHorizontal: 14, paddingVertical: 11 },
  dropdownList:   { borderRadius: Atlas.radius.medium, marginTop: 6, overflow: 'hidden' },
  dropdownItem:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, minHeight: 48 },
  menuIconBox:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuItemLabel:  { fontSize: 14, fontFamily: fontFamily.semibold, flex: 1 },
  menuPill:       { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  menuPillText:   { fontSize: 11, fontFamily: fontFamily.semibold },
  menuDivider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
});
