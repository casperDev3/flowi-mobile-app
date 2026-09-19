import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
import { PressableScale } from '@/components/shared/PressableScale';
import { SheetModal } from '@/components/shared/SheetModal';
import { SkeletonRow } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { RecordingClock } from '@/components/shared/RecordingClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
import { TaskDetailHeader } from '@/components/tasks/TaskDetailHeader';
import { CommentsSection } from '@/components/shared/CommentsSection';
import { loadData } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { cancelReminder, scheduleReminder } from '@/store/notifications';
import {
  assigneeDisplayName,
  createdByAfterProjectChange,
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
  OVERDUE_GROUP_KEY,
  type GroupLabels,
  type TaskListGroup,
  type TaskListQuery,
} from '@/utils/taskListView';
import { TaskCompactCard } from '@/components/tasks/TaskCompactCard';
import { copyTextToClipboard } from '@/utils/clipboard';
import { taskMarkdownLabels, taskToMarkdown } from '@/utils/taskMarkdown';
import { isTodayTask } from '@/utils/taskToday';
import {
  ACTIVE_COLUMN_ID, DONE_COLUMN_ID, mergeTaskStatusColumns, projectEquivalentColumn,
  scopedColumnFor, scopedTaskStatusColumn, subtaskToggleTransition, taskColumnId, taskStatusColumn,
} from '@/utils/taskStatuses';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { haptic } from '@/utils/haptics';
import { nextProjectColor } from '@/utils/projectColors';
import { projectQuickAction } from '@/utils/projectQuickCreate';
import { applyProjectQuickAction, type ProjectQuickApplyResult } from '@/utils/projectQuickApply';
import type { Project } from '../projects';
import { projectRoute } from '@/constants/projectNav';
import { applyFormSprint, retargetTaskProject, type Sprint } from '@/utils/sprintUtils';
import { useResponsive } from '@/hooks/use-responsive';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useTopInset } from '@/hooks/use-top-inset';
import { useToday } from '@/hooks/use-today';
import { useCalendarNav, type CalSpan } from '@/hooks/use-calendar-nav';
import { draftEstimatedMinutes, draftRecurrence, editedDraftFields, useTaskEditor } from '@/hooks/use-task-editor';
import { useAllProjectMembers, useProjectMembers } from '@/hooks/use-project-members';
import type { MemberOut } from '@/store/project-team';
import { useProjectRole } from '@/hooks/use-project-role';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { DetailPane } from '@/components/shared/DetailPane';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { PickerField, type PickerCreateOption } from '@/components/shared/PickerField';
import { TaskHistoryTab, type HistoryEventType, type TaskHistoryEvent } from '@/components/tasks/TaskHistoryTab';
import { TaskTimerTab } from '@/components/tasks/TaskTimerTab';
import { TaskEditForm } from '@/components/tasks/TaskEditForm';
import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { TaskReminderRow } from '@/components/tasks/TaskReminderRow';
import { TaskSubtasks } from '@/components/tasks/TaskSubtasks';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { totalSecondsIncludingActive } from '@/utils/taskTimer';
import { monthGrid } from '@/utils/dateUtils';
import { initialReminderDraft, resolveReminderMoment } from '@/utils/reminderTime';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { formatClock, formatDuration, formatDurationShort } from '@/utils/durationFormat';

// ─── expo-av conditional (install with: npx expo install expo-av) ────────────
let AVAudio: any = null;
try { AVAudio = require('expo-av').Audio; } catch {}

type ViewMode = 'list' | 'calendar';

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


function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}



function getProgress(t: Task) {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

// ─── Timer helpers ────────────────────────────────────────────────────────────




function makeHistoryEvent(type: HistoryEventType, note?: string): TaskHistoryEvent {
  return { id: Date.now().toString() + Math.random().toString(36).slice(2), at: new Date().toISOString(), type, note };
}

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
  const { height, isExpanded, isWide } = useResponsive();
  // Деталь стає колонкою лише на expanded (≥840). На medium сайдбар уже
  // займає 232pt, і колонка вийшла б вужчою за 260pt — гірше, ніж на
  // весь екран. Там деталь лишається модалкою.
  const showDetailColumn = isExpanded;
  const isDark = useColorScheme() === 'dark';
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
  const DEADLINE_PRESETS = [
    { label: tr.dateToday,   days: 0 },
    { label: tr.dateTomorrow, days: 1 },
    { label: tr.datePlus3,   days: 3 },
    { label: tr.datePlus7,   days: 7 },
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
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  /**
   * Що показує вкладка: денну роботу чи весь список.
   *
   * Стан навмисно НЕ зберігається між сесіями. «Сьогодні за замовчуванням» має
   * означати саме це: людина, яка одного разу зазирнула в увесь беклог, не
   * мусить назавжди отримати його при кожному відкритті вкладки.
   */
  const [scope, setScope] = useState<TaskListScope>('today');

  // Search & extra filters
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  // Мультивибір P0…P5; порожній = без фільтра.
  const [filterPriorities, setFilterPriorities] = useState<PriorityLevel[]>([]);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const [showAdd, setShowAdd] = useState(false);

  // Recurrence for add task

  const [selected, setSelected] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const detailScrollRef = useRef<ScrollView>(null);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  // Calendar view state
  const [calPopupDate, setCalPopupDate] = useState<Date | null>(null);

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

  // Форма редагування завдання — цілісний стан, див. use-task-editor.
  const editor = useTaskEditor(ACTIVE_COLUMN_ID, today);
  // Створення нового завдання користується тією самою формою й тим самим
  // станом, що й редагування — це той самий набір полів.
  const composer = useTaskEditor(ACTIVE_COLUMN_ID, today);
  // Учасники проєкту, обраного ПРОСТО ЗАРАЗ у кожній з двох форм (контракт
  // §4.5) — пікер «Виконавець» у TaskEditForm; порожній список ховає поле.
  const editorMembers = useProjectMembers(editor.draft.projectId);
  const composerMembers = useProjectMembers(composer.draft.projectId);
  // Увесь кеш команд одразу (не один проєкт) — картки списку показують
  // завдання з РІЗНИХ проєктів одночасно, підпис виконавця (§4.5) шукається
  // по projectId кожного окремого завдання.
  const allProjectMembers = useAllProjectMembers();
  const assigneeLabelFor = useCallback((task: Task): string | null => {
    if (!task.projectId) return null; // особисте завдання — виконавця нема
    const members = allProjectMembers[task.projectId] ?? EMPTY_MEMBERS_LIST;
    return assigneeDisplayName(task.assigneeId, members, user?.id, tr.taskAssigneeMe);
  }, [allProjectMembers, user?.id, tr.taskAssigneeMe]);

  // Reminder picker state (shown inline in detail modal)
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderPickerTarget, setReminderPickerTarget] = useState<{ taskId: string; subtaskId?: string } | null>(null);
  const [reminderHours, setReminderHours] = useState('');
  const [reminderMins, setReminderMins] = useState('');
  const [reminderDate, setReminderDate] = useState<string | null>(null);

  // Recording
  const [recordingTaskId, setRecordingTaskId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  // Мітка старту запису, а не лічильник секунд: цокає RecordingClock, і
  // екран не перемальовується щосекунди.
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const recordingRef = useRef<any>(null);
  const soundRef = useRef<any>(null);

  // Detail tab + timer display
  const [detailTab, setDetailTab] = useState<'info' | 'timer' | 'history' | 'comments'>('info');

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
    meeting: meetingParam, meetingDate: meetingDateParam,
  } = useLocalSearchParams<{
    create?: string; open?: string; projectId?: string; sprintId?: string;
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

  useEffect(() => {
    if (createParam === '1') {
      if (projectParam) {
        composer.reset(ACTIVE_COLUMN_ID, { projectId: projectParam, sprintId: sprintParam || null });
        setReturnToProject(projectParam);
      }
      setShowAdd(true);
      router.setParams({ create: '', projectId: '', sprintId: '' });
    }
    // composer навмисно поза deps: реагуємо лише на прихід параметра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createParam, projectParam, sprintParam, router]);

  // Open task details when navigated with ?open=<taskId> (e.g. from Today rows)
  useEffect(() => {
    if (!openParam || !initialized) return;
    const t = tasks.find(x => x.id === openParam);
    if (t) {
      setSelected(t);
      if (t.projectId) setReturnToProject(t.projectId);
    }
    router.setParams({ open: '' });
    // tasks навмисно поза deps: реагуємо лише на прихід параметра після ініціалізації
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, initialized, router]);

  // Сам перехід назад — щойно ОБИДВІ модалки, які могли прийти з проєкту,
  // знову закриті. `router.back()`, коли можна: цей екран стоїть у стеку
  // ПОВЕРХ `/project/{id}/tasks` (routing — push, не replace), і повернення
  // назад лишає скрол/стан того екрана як був; `router.replace` — запасний
  // шлях, якщо стека раптом нема (наприклад, deep link).
  useEffect(() => {
    if (!returnToProject || selected || showAdd) return;
    const target = returnToProject;
    setReturnToProject(null);
    if (router.canGoBack()) router.back();
    else router.replace(projectRoute(target, 'tasks') as never);
  }, [returnToProject, selected, showAdd, router]);

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

  // Undo-тост (таб — над таб-баром)
  const { show: showUndo, element: undoElement } = useUndoToast(true);

  // Reset detail tab when opening a different task
  useEffect(() => {
    setDetailTab('info');
    setShowReminderPicker(false);
    // Панель деталі одна на задачу й зустріч: відкрита задача витісняє зустріч.
    if (selected) setSelectedMeeting(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Джерело правди про «йде» — реєстр активних таймерів у сторі. Читання
  // синхронне, але реактивне: стор оновлює стан разом із ref, тож цей рендер
  // уже бачить актуальний запис.
  const activeTimer = selected ? getTimerForTask(selected.id) : undefined;
  const isTimerRunning = !!activeTimer;

  const todayStr = today.toDateString();
  // Tasks due today (deadline = today) — both done and not done
  const dueTodayTasks   = tasks.filter(t => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  const doneCount       = dueTodayTasks.filter(t => t.status === 'done').length;
  const activeCount     = dueTodayTasks.filter(t => t.status === 'active').length;
  // Efficiency based on subtasks (if task has subtasks, count subtask progress; otherwise count task status)
  const effTotalUnits   = dueTodayTasks.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.length : 1), 0);
  const effDoneUnits    = dueTodayTasks.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.filter(s => s.done).length : (t.status === 'done' ? 1 : 0)), 0);
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
  // Subtasks of tasks due today
  const totalSubtasks   = dueTodayTasks.reduce((acc, t) => acc + t.subtasks.length, 0);
  const doneSubtasks    = dueTodayTasks.reduce((acc, t) => acc + t.subtasks.filter(s => s.done).length, 0);

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
  }), [filter, sort, scope, search, filterProject, filterPriorities, dateFilter, activeMonth, user?.id]);

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
    () => overdueForList(filtered, filter, viewMode === 'list'),
    [filtered, filter, viewMode],
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

  const addTask = useCallback(() => {
    const draft = composer.draft;
    if (!draft.title.trim()) return;
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
      // §4.5 — виконавець; має сенс лише для завдання проєкту.
      assigneeId: draft.projectId ? draft.assigneeId ?? undefined : undefined,
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
    if (!isTodayTask(created, storedTaskStatuses, today)) setScope('all');
    composer.reset(ACTIVE_COLUMN_ID);
    setShowAdd(false);
    haptic.success();
  }, [composer, taskStatuses, storedTaskStatuses, today, sprints, setTasks, user]);

  const deleteTask = useCallback((id: string, title?: string) => {
    const taskToDelete = tasksRef.current.find(t => t.id === id);
    // Contract §4.1: глядач не видаляє проєктні задачі. Перевірка ТУТ, а не
    // лише прихованою кнопкою (review finding): та сама функція викликається
    // з деталі задачі, з рядків «Сьогодні»/Завдань і з дошки/списку проєкту —
    // один захист замість дублювання в кожному місці виклику.
    if (!canEditProjectItem(taskToDelete?.projectId, projectRoles)) return;
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

  // ─── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async (taskId: string) => {
    if (!AVAudio) { Alert.alert('Потрібен пакет', 'Встановіть: npx expo install expo-av'); return; }
    try {
      const { granted } = await AVAudio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Немає дозволу', 'Дозвольте доступ до мікрофону в налаштуваннях.'); return; }
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await AVAudio.Recording.createAsync(AVAudio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setRecordingTaskId(taskId);
      setIsRecording(true);
      setRecordingStartedAt(Date.now());
    } catch (e: any) {
      if (__DEV__) console.warn('[record] start error:', e);
      Alert.alert('Помилка запису', e?.message);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      setRecordingStartedAt(null);
      if (uri && recordingTaskId) {
        setTasks(prev => prev.map(t => t.id === recordingTaskId
          ? { ...t, recordings: [...(t.recordings ?? []), uri] }
          : t
        ));
      }
      setRecordingTaskId(null);
    } catch (e: any) {
      setRecordingStartedAt(null);
      if (__DEV__) console.warn('[record] stop error:', e);
    }
  }, [recordingTaskId, setTasks]);

  const playRecording = useCallback(async (uri: string) => {
    if (!AVAudio) return;
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; setPlayingUri(null); }
      if (playingUri === uri) return;
      const { sound } = await AVAudio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setPlayingUri(uri);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) { setPlayingUri(null); sound.unloadAsync(); soundRef.current = null; }
      });
    } catch (e: any) {
      if (__DEV__) console.warn('[record] play error:', e);
    }
  }, [playingUri]);

  const deleteRecording = useCallback((taskId: string, uri: string) => {
    Alert.alert('Видалити запис?', '', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => {
        setTasks(prev => prev.map(t => t.id === taskId
          ? { ...t, recordings: (t.recordings ?? []).filter(r => r !== uri) }
          : t
        ));
      }},
    ]);
  }, [setTasks]);

  // Cleanup recording on unmount
  useEffect(() => () => {
    recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    soundRef.current?.unloadAsync().catch(() => {});
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Переносить завдання в іншу колонку статусу.
   *
   * Доти статус можна було змінити лише чекбоксом (готово ↔ активне) або
   * увійшовши в режим редагування. Тобто перевести завдання з «В роботі» в
   * будь-який інший кастомний статус із деталей було неможливо.
   */
  const setTaskColumn = useCallback((id: string, columnId: string) => {
    const chosen = taskStatuses.find(item => item.id === columnId);
    if (!chosen) return;
    // Contract §4.1: глядач не рухає проєктну задачу по статусах.
    if (!canEditProjectItem(tasksRef.current.find(t => t.id === id)?.projectId, projectRoles)) return;
    haptic.light();
    // Перенесення в колонку «готово» — така сама зупинка таймера, як і
    // чекбокс: інакше відлік лишався б на завершеному завданні, а кнопку
    // «Стоп» у деталі до нього вже не показують. `chosen.isDone` не залежить
    // від проєкту (§3.3: копії проєкту зберігають isDone 1-в-1), тож рахувати
    // це до резолюції по конкретному завданню — безпечно.
    if (chosen.isDone && getTimerForTask(id)) pendingTimerStops.current.push(id);
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      // Пікер пропонує ОСОБИСТІ статуси незалежно від проєкту задачі (§3.7
      // «Особисте агрегує» — спільна деталь для всіх завдань); еквівалент у
      // ВЛАСНОМУ проєкті задачі — інакше вибір «У процесі» ставив би
      // особистий id, якого немає серед колонок дошки цього проєкту.
      const column = projectEquivalentColumn(chosen, storedTaskStatuses, t.projectId) ?? chosen;
      if (scopedTaskStatusColumn(t, storedTaskStatuses).id === column.id) return t;
      const status: Status = column.isDone ? 'done' : 'active';
      return {
        ...t,
        status,
        kanbanColumnId: column.id,
        // Назва колонки в нотатці: інакше в історії видно лише «активне», без
        // того, КУДИ саме перенесли завдання.
        history: [...(t.history ?? []), makeHistoryEvent(column.isDone ? 'done' : 'active', column.name)],
      };
    }));
  }, [taskStatuses, storedTaskStatuses, getTimerForTask, setTasks, projectRoles]);

  const toggleTask = useCallback((id: string) => {
    // Знімок поточного стану задачі для undo
    const prevTask = tasksRef.current.find(t => t.id === id);
    // Contract §4.1: глядач не відмічає проєктну задачу готовою.
    if (!canEditProjectItem(prevTask?.projectId, projectRoles)) return;
    haptic.light();
    const becomingDone = prevTask?.status === 'active';

    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
      // Скоуп за ВЛАСНИМ проєктом задачі (§3.7): без цього чекбокс завжди
      // ставив особистий status-active/status-done, і задача проєкту після
      // відмітки «готово» лишалась у своїй дошці в колонці «todo» назавжди
      // (review finding: «quick-toggle changes status but not kanbanColumnId»).
      const kanbanColumnId = scopedColumnFor(storedTaskStatuses, t.projectId, status === 'done' ? 'done' : 'todo')?.id
        ?? (status === 'done' ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID);
      const histType: HistoryEventType = status === 'done' ? 'done' : 'active';
      // timeEntries тут не чіпаємо: завершену сесію допише стор при зупинці —
      // він єдиний знає, коли вона почалась.
      return {
        ...t, status, kanbanColumnId,
        subtasks: t.subtasks.map(s => ({ ...s, done: status === 'done' })),
        history: [...(t.history ?? []), makeHistoryEvent(histType)],
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
        history: [...(t.history ?? []), makeHistoryEvent('active')],
      };
      showUndo(tr.taskMarkedDone, () => {
        setTasks(prev => prev.map(restore));
        setSelected(prev => prev?.id === id ? restore(prev) : prev);
      });
    }
  }, [showUndo, tr.taskMarkedDone, getTimerForTask, setTasks, storedTaskStatuses, projectRoles]);

  const addSubtask = useCallback((taskId: string) => {
    if (!newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    const patch = (t: Task): Task => t.id === taskId ? {
      ...t,
      subtasks: [...t.subtasks, sub],
      history: [...(t.history ?? []), makeHistoryEvent('subtask_add', sub.title)],
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
    const transition = current ? subtaskToggleTransition(current, nextSubs) : null;
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
        history: [...(t.history ?? []), makeHistoryEvent(histType, targetSub?.title)],
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

  const updateTaskProject = useCallback((taskId: string, projectId: string | null) => {
    // retargetTaskProject, а не просто підміна поля: разом із проєктом задача
    // виходить зі спринта, бо спринт належав старому проєкту.
    const patch = (t: Task): Task => t.id !== taskId ? t : retargetTaskProject(t, projectId ?? undefined);
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, [setTasks]);

  // Стабільні посилання: інакше React.memo на картках нічого не дає.
  const sections = useMemo(
    // key, а не позиція в масиві: групи зʼявляються й зникають разом зі своїм
    // вмістом, і без стабільного ключа заголовки перемонтовувались би на
    // кожній зміні складу.
    // Секція показує не більше TASK_GROUP_LIMIT завдань; решту відкриває
    // «Всі (N)» у футері секції — окремий екран лише цієї групи.
    () => groups.map(group => {
      const { visible, total } = limitGroupTasks(group.tasks);
      return { key: group.key, title: group.label, data: visible, total };
    }),
    [groups],
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
  const showTaskCardMenu = useCallback((task: Task) => {
    haptic.light();
    Alert.alert(task.title, undefined, [
      { text: tr.copyTask, onPress: () => copyTask(task) },
      { text: tr.cancel, style: 'cancel' },
    ]);
  }, [tr, copyTask]);

  /**
   * Скільки роботи припадає на сьогодні. Рахується від НАБОРУ до денного
   * скоупу, а не від побудованих секцій: у режимі «Усі» секції містять увесь
   * список, і підрахунок по них показував би на тумблері «Сьогодні» його ж
   * число. Прострочене входить сюди само — воно сьогоднішнє за правилом.
   */
  const todayCount = useMemo(
    () => filteredAll.filter(t => isTodayTask(t, storedTaskStatuses, today)).length,
    [filteredAll, storedTaskStatuses, today],
  );
  /** Скільки роботи лишається поза сьогоднішнім днем — число на тумблері «Усі». */
  const beyondTodayCount = filteredAll.length - todayCount;
  /**
   * Порожній день при непорожньому списку. Пошук виключено навмисно: у нього
   * власна гілка порожнього стану, і пропонувати «показати всі» людині, яка
   * просто нічого не знайшла за запитом, означало б відповідати не на те питання.
   */
  const todayEmpty = scope === 'today' && !search.trim() && todayCount === 0 && beyondTodayCount > 0;

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

  const handleSelectTask = useCallback((task: Task) => setSelected(task), []);
  const handleToggleTask = useCallback((task: Task) => toggleTask(task.id), [toggleTask]);

  const saveTaskEdit = useCallback(() => {
    if (!editor.draft.title.trim() || !selected) return;
    const draft = editor.draft;
    // Лише поля, які людина змінила в цій формі: поки форма була відкрита,
    // завдання могли змінити деінде (веб, інший пристрій), і список уже показує
    // ті зміни. Незмінене поле форми — це старе значення, писати його назад
    // означало б відкотити чужу правку.
    const edited = editedDraftFields(editor.initial, draft);
    const estimatedMinutes = draftEstimatedMinutes(draft);
    const recurrence = draftRecurrence(draft);
    const column = taskStatuses.find(item => item.id === draft.statusId) ?? taskStatuses[0];
    // Вибір done-статусу в редакторі — теж завершення завдання, і таймер на
    // ньому далі йти не має.
    if (edited.has('status') && column.isDone && getTimerForTask(selected.id)) {
      pendingTimerStops.current.push(selected.id);
    }

    const patch = (t: Task): Task => {
      if (t.id !== selected.id) return t;
      // Спринт зникає разом зі зміною проєкту — див. retargetTaskProject.
      // Проєкт застосовується разом з рештою форми, а не миттєво при виборі:
      // інакше «Скасувати» повертало б усе, крім нього.
      let next: Task = edited.has('project')
        ? { ...retargetTaskProject(t, draft.projectId ?? undefined), projectId: draft.projectId ?? undefined }
        : { ...t };
      // §3.7 review finding — createdByAfterProjectChange (utils/taskUtils.ts).
      if (edited.has('project')) {
        next.createdBy = createdByAfterProjectChange(next, user?.id);
      }
      if (edited.has('title')) next.title = draft.title.trim();
      if (edited.has('desc')) next.description = draft.desc.trim();
      // Dual-write: priorityLevel + валідне легасі для старих клієнтів.
      if (edited.has('priority')) next = { ...next, ...priorityFields(draft.priorityLevel) };
      if (edited.has('status')) {
        next.status = column.isDone ? 'done' : 'active';
        next.kanbanColumnId = draft.statusId;
      }
      if (edited.has('estimate')) next.estimatedMinutes = estimatedMinutes;
      if (edited.has('deadline')) next.deadline = draft.deadline ?? undefined;
      if (edited.has('recurrence')) next.recurrence = recurrence;
      // §4.5 — null (у формі: «Без виконавця») пишемо явно, а не пропускаємо:
      // призначення треба вміти й ЗНЯТИ, а не лише поставити.
      if (edited.has('assignee')) next.assigneeId = draft.assigneeId ?? null;
      next.history = [...(t.history ?? []), makeHistoryEvent('edited')];
      // Поле «Спринт»: без змін — задача лишається де була (навіть у закритому
      // спринті); інакше assignTaskToSprint або беклог (ключ видаляється).
      if (edited.has('project') || edited.has('sprint')) {
        next = applyFormSprint(next, sprints, draft.sprintId);
      }
      return next;
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === selected.id ? patch(prev) : prev);
    editor.finish();
    // Чернетка тепер один об'єкт, тож і залежність одна замість тринадцяти.
  }, [editor, selected, taskStatuses, getTimerForTask, sprints, setTasks, user]);

  const openReminderPicker = useCallback((taskId: string, subtaskId?: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const existing = subtaskId
      ? task.subtasks.find(s => s.id === subtaskId)?.reminderAt
      : task.reminderAt;
    const draft = initialReminderDraft(existing);
    setReminderHours(draft.hours);
    setReminderMins(draft.mins);
    setReminderDate(draft.date);
    setReminderPickerTarget({ taskId, subtaskId });
    setShowReminderPicker(true);
  }, [tasks]);

  const saveReminder = useCallback(async () => {
    if (!reminderPickerTarget) return;
    const { taskId, subtaskId } = reminderPickerTarget;
    const base = resolveReminderMoment({ date: reminderDate, hours: reminderHours, mins: reminderMins });
    const isoDate = base.toISOString();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const name = subtaskId
      ? task.subtasks.find(s => s.id === subtaskId)?.title ?? task.title
      : task.title;
    await scheduleReminder({ type: subtaskId ? 'subtask' : 'task', taskId, subtaskId, title: name }, base);
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      if (subtaskId) {
        return { ...t, subtasks: t.subtasks.map(s => s.id === subtaskId ? { ...s, reminderAt: isoDate } : s) };
      }
      return { ...t, reminderAt: isoDate };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setShowReminderPicker(false);
    setReminderPickerTarget(null);
  }, [reminderPickerTarget, reminderHours, reminderMins, reminderDate, tasks, setTasks]);

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
      { text: sub.reminderAt ? `Нагадування: ${new Date(sub.reminderAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : tr.reminderDate, onPress: () => openReminderPicker(taskId, sub.id) },
      ...(sub.reminderAt ? [{ text: lang === 'uk' ? 'Видалити нагадування' : 'Delete reminder', onPress: () => removeReminder(taskId, sub.id) }] : []),
      { text: tr.delete, style: 'destructive' as const, onPress: () => deleteSubtask(taskId, sub.id) },
      { text: tr.cancel, style: 'cancel' as const },
    ];
    Alert.alert(sub.title, undefined, buttons);
  }, [duplicateSubtask, moveSubtask, deleteSubtask, openReminderPicker, removeReminder, tr, lang]);

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
  }, []);

  // Мемоізовано: палітра йде пропом у кожну картку списку, і новий об'єкт
  // щорендеру ламав би React.memo на них — а рендери тут часті, бо тік
  // таймера смикає екран щосекунди.
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  }), [isDark]);

  // Три календарі — фільтр, дедлайн нового завдання, дедлайн у редагуванні —
  // будували сітку місяця трьома однаковими копіями. Тепер monthGrid.
  const calWeeks    = useMemo(() => monthGrid(calYear, calMonth), [calYear, calMonth]);
  const dlWeeks     = useMemo(() => monthGrid(composer.calYear, composer.calMonth), [composer.calYear, composer.calMonth]);
  const editDlWeeks = useMemo(() => monthGrid(editor.calYear, editor.calMonth), [editor.calYear, editor.calMonth]);

  // ─── Календар ─────────────────────────────────────────────────────────────
  const calendarLabels = useMemo(
    () => ({ locale, months: MONTHS_UA, quarters: tr.quarters }),
    [locale, MONTHS_UA, tr.quarters],
  );
  const cal = useCalendarNav(calendarLabels);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      if (!t.deadline) return;
      const key = new Date(t.deadline).toDateString();
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [tasks]);

  // ─── Meetings computed ──────────────────────────────────────────────────────
  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach(m => {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    });
    return map;
  }, [meetings]);

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
  const openAddMeeting = useCallback((presetDate?: string) => {
    setMeetingFormInitial(null);
    setMeetingFormPreset(presetDate);
    setShowMeetingForm(true);
  }, []);

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
  const canEditSelectedTask = canEditProjectItem(selectedTask?.projectId, projectRoles);

  // Вміст деталі. Однаковий для модалки й для колонки — різниться
  // лише обрамлення, див. DetailPane.
  const detailBody = selectedTask ? (
    <>
                    {/* ─── Timer Tab ─── */}
                    {!editor.editing && detailTab === 'timer' && (
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
                    )}

                    {/* ─── History Tab ─── */}
                    {!editor.editing && detailTab === 'history' && (
                      <TaskHistoryTab
                        events={selectedTask.history ?? []}
                        textColor={c.text}
                        subColor={c.sub}
                        tr={tr}
                        locale={locale}
                      />
                    )}

                    {/* ─── Comments Tab (contract §4.4) ─── */}
                    {!editor.editing && detailTab === 'comments' && selectedTask.projectId && (
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
                    )}

                    {editor.editing ? (
                      <TaskEditForm
                        submitLabel={tr.save}
                        editor={editor}
                        taskStatuses={taskStatuses}
                        pickableProjects={pickableProjects}
                        projects={projects}
                        projectCreateOption={projectCreateOption(id => editor.patch({ projectId: id, sprintId: null }))}
                        sprints={sprints}
                        members={editorMembers}
                        myUserId={user?.id}
                        deadlineWeeks={editDlWeeks}
                        months={MONTHS_UA}
                        weekdays={WEEKDAYS_SHORT}
                        deadlinePresets={DEADLINE_PRESETS}
                        today={today}
                        onSave={saveTaskEdit}
                        onCancel={editor.finish}
                        colors={c}
                        isDark={isDark}
                        tr={tr}
                        locale={locale}
                      />
                    ) : detailTab === 'info' ? (
                    <>
                    {selectedTask.description ? <Text style={[s.detailDesc, { color: c.sub }]}>{selectedTask.description}</Text> : null}

                    {/* Статус і проєкт — однакове поле вибору: обидва
                        відкривають аркуш зі списком. Раніше тут стояли два
                        різні способи вибирати поруч — розсип чипів і
                        інлайн-список, що розсовував вміст.
                        Різниця лише в пошуку: статусів скінченна жменя, а
                        проєкти накопичуються роками, тож у них пошук стоїть
                        завжди (alwaysSearch), а не з шостого рядка. */}
                    <PickerField
                      label={tr.status}
                      icon="rectangle.3.group"
                      options={statusOptions}
                      value={taskStatusColumn(selectedTask, taskStatuses).id}
                      onSelect={id => { if (id) setTaskColumn(selectedTask.id, id); }}
                      colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet }}
                      isDark={isDark}
                      tr={tr}
                    />

                    {/* Meta badges */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 2 }}>
                      <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                        <IconSymbol name="calendar" size={11} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500', marginLeft: 4 }}>
                          {new Date(selectedTask.createdAt).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long' })}
                        </Text>
                      </View>
                      {selectedTask.deadline && (
                        <View style={[s.badge, { backgroundColor: isOverdue(selectedTask) ? '#EF444420' : c.dim, borderColor: isOverdue(selectedTask) ? '#EF444440' : c.border }]}>
                          <IconSymbol name="flag" size={11} color={isOverdue(selectedTask) ? '#EF4444' : c.sub} />
                          <Text style={{ color: isOverdue(selectedTask) ? '#EF4444' : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                            Дедлайн: {new Date(selectedTask.deadline).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long' })}
                          </Text>
                        </View>
                      )}
                      {selectedTask.estimatedMinutes && (
                        <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                          <IconSymbol name="timer" size={11} color={c.sub} />
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                            {selectedTask.estimatedMinutes >= 60
                              ? `${Math.floor(selectedTask.estimatedMinutes / 60)}г ${selectedTask.estimatedMinutes % 60 > 0 ? `${selectedTask.estimatedMinutes % 60}хв` : ''}`
                              : `${selectedTask.estimatedMinutes}хв`}
                          </Text>
                        </View>
                      )}
                      {selectedTask.recurrence && (
                        <View style={[s.badge, { backgroundColor: c.accent + '15', borderColor: c.accent + '35' }]}>
                          <IconSymbol name="repeat" size={11} color={c.accent} />
                          <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                            {selectedTask.recurrence.freq === 'daily' ? 'Щодня' :
                             selectedTask.recurrence.freq === 'weekly' ? 'Щотижня' :
                             selectedTask.recurrence.freq === 'monthly' ? 'Щомісяця' : 'Щороку'}
                            {selectedTask.recurrence.interval > 1 ? ` ×${selectedTask.recurrence.interval}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Reminder row */}
                    <TaskReminderRow
                      reminderAt={selectedTask.reminderAt}
                      open={showReminderPicker && reminderPickerTarget?.taskId === selectedTask.id && !reminderPickerTarget.subtaskId}
                      draft={{ date: reminderDate, hours: reminderHours, mins: reminderMins }}
                      onToggleOpen={() => {
                        if (showReminderPicker && reminderPickerTarget?.taskId === selectedTask.id && !reminderPickerTarget.subtaskId) {
                          setShowReminderPicker(false);
                        } else {
                          openReminderPicker(selectedTask.id);
                        }
                      }}
                      onChangeDraft={part => {
                        if (part.date !== undefined) setReminderDate(part.date);
                        if (part.hours !== undefined) setReminderHours(part.hours);
                        if (part.mins !== undefined) setReminderMins(part.mins);
                      }}
                      onSave={saveReminder}
                      onRemove={() => removeReminder(selectedTask.id)}
                      onCancel={() => setShowReminderPicker(false)}
                      colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
                      tr={tr}
                      locale={locale}
                    />

                    {/* Поле показується ЗАВЖДИ, навіть коли живих проєктів
                        немає. Раніше воно ховалося за `pickableProjects.length > 0`,
                        і в порожньому застосунку перший проєкт із деталі задачі
                        завести було нічим — а саме тут його найчастіше й
                        заводять. */}
                    <PickerField
                      label={lang === 'uk' ? 'Проєкт' : 'Project'}
                      icon="folder"
                      options={projectOptions}
                      value={selectedTask.projectId ?? null}
                      onSelect={id => updateTaskProject(selectedTask.id, id)}
                      emptyOption={{ label: tr.noProject }}
                      // Підпис шукається в ПОВНОМУ списку, а не в звуженому:
                      // проєкт задачі могли заархівувати вже після того, як
                      // її туди поклали, і без цього поле показувало б
                      // «Без проєкту» на задачі, у якої проєкт є.
                      selectedLabel={
                        projects.find(p => p.id === selectedTask.projectId)?.name ?? null
                      }
                      alwaysSearch
                      createOption={projectCreateOption(id => updateTaskProject(selectedTask.id, id))}
                      colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.sheet }}
                      isDark={isDark}
                      tr={tr}
                    />

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

                    {/* Quick timer launch from info tab */}
                    {selectedTask.status === 'active' && (
                      <TouchableOpacity
                        onPress={() => { setDetailTab('timer'); if (!isTimerRunning) startTimer(); }}
                        style={[s.btn, { marginTop: 14, backgroundColor: isTimerRunning ? '#6366F120' : '#6366F1EE', borderWidth: isTimerRunning ? 1 : 0, borderColor: '#6366F150' }]}>
                        <IconSymbol name={isTimerRunning ? 'timer' : 'play.fill'} size={15} color={isTimerRunning ? '#6366F1' : '#fff'} />
                        {/* Годинник — СУСІД підпису, а не вкладений у нього <Text>.
                            На iOS вкладений текст не є окремою в'юхою: він згортається
                            в атрибутований рядок батька, тож перемальовування дочірнього
                            компонента саме по собі нічого на екрані не змінює — число
                            оновлювалося б лише тоді, коли перемальовується батьківський
                            <Text>. Саме так годинник і завмирав на планшеті, де панель
                            деталі висить постійно й перемальовувати її нема з чого. */}
                        <Text style={{ color: isTimerRunning ? '#6366F1' : '#fff', fontWeight: '700', marginLeft: 7 }}>
                          {activeTimer ? `${tr.timerLabel}: ` : tr.startTimerAction}
                        </Text>
                        {activeTimer && (
                          <ElapsedClock
                            running
                            seconds={now => totalSecondsIncludingActive(selectedTask, activeTimer.startedAt, now)}
                            format={formatClock}
                            style={{ color: '#6366F1', fontWeight: '700' }}
                          />
                        )}
                        {isTimerRunning && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#6366F1', marginLeft: 6 }} />}
                      </TouchableOpacity>
                    )}

                    {/* Contract §4.1: глядач читає, але не редагує/видаляє/
                        відмічає — кнопки просто зникають, а не диз'юнктивно
                        no-op'ляться (review finding). */}
                    {canEditSelectedTask && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => deleteTask(selectedTask.id, selectedTask.title)}
                        style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                        <IconSymbol name="trash" size={15} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>{tr.delete}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleTask(selectedTask.id)}
                        style={[s.btn, { flex: 2, backgroundColor: selectedTask.status === 'done' ? '#374151' : c.accent }]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{selectedTask.status === 'done' ? tr.restore : tr.completed}</Text>
                      </TouchableOpacity>
                    </View>
                    )}
                    </>
                    ) : null}
    </>
  ) : null;

  // Поточний пріоритет у шапці (P0–P5). Завдання без пріоритету (напр. створені
  // з деталі проєкту старими збірками) — без бейджа.
  const selectedPriority = selectedTask ? normalizePriority(selectedTask) : null;

  // Липка шапка деталі: ✎, назва з пріоритетом, ✕ і вкладки стоять поза
  // прокруткою DetailPane — гортається лише тіло.
  const taskDetailHeader = selectedTask ? (
    <TaskDetailHeader
      title={selectedTask.title}
      leading={
        <AnimatedCheck
          checked={selectedTask.status === 'done'}
          color="#10B981"
          borderColor={c.border}
          size={22}
          radius={7}
          onPress={canEditSelectedTask ? () => toggleTask(selectedTask.id) : undefined}
          hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
        />
      }
      badge={selectedPriority !== null ? <PriorityBadge level={selectedPriority} size="md" /> : null}
      editing={editor.editing}
      tab={detailTab}
      onTabChange={setDetailTab}
      timerRunning={isTimerRunning}
      onEdit={canEditSelectedTask ? () => editor.begin(selectedTask, taskColumnId(selectedTask, taskStatuses)) : undefined}
      onClose={() => { setSelected(null); editor.finish(); }}
      onCopy={() => copyTask(selectedTask)}
      showHandle={!showDetailColumn}
      showComments={!!selectedTask.projectId}
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
      editor.finish();
      setSelectedMeeting(target);
    };
    // На планшеті колонка деталі може бути в режимі редагування задачі, а
    // список зустрічей лишається доступним. Мовчки викинути введене людиною
    // не можна — питаємо. (Без відкритої задачі editing — лише залишок
    // закритої панелі, і питати нема про що.)
    const guarded = () => {
      if (!(editor.editing && selected)) { open(); return; }
      Alert.alert(tr.discardTaskEditTitle, tr.discardTaskEditMsg, [
        { text: tr.cancel, style: 'cancel' },
        { text: tr.discardChanges, style: 'destructive', onPress: open },
      ]);
    };
    if (fromModal && !showDetailColumn) setTimeout(guarded, 300);
    else guarded();
  }, [meetings, editor, showDetailColumn, selected, tr]);

  const closeMeetingView = useCallback(() => setSelectedMeeting(null), []);

  // ?meeting=<origId>&meetingDate= — перегляд зустрічі з вкладки «Сьогодні»
  // (екземпляр повтору адресується датою; редагування/таймер — оригінал).
  useEffect(() => {
    if (!meetingParam || !meetingsInit) return;
    const orig = meetings.find(m => m.id === meetingParam);
    if (orig) {
      const date = typeof meetingDateParam === 'string' && meetingDateParam ? meetingDateParam : orig.date;
      openMeetingView({ ...orig, date, _origId: orig.id });
    }
    router.setParams({ meeting: '', meetingDate: '' });
    // meetings/openMeetingView навмисно поза deps: реагуємо лише на прихід параметра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingParam, meetingDateParam, meetingsInit, router]);

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
    else void startMeetingTimer({ id: viewedMeetingOrig.id, title: viewedMeetingOrig.title });
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
  const renderTaskItem = useCallback(({ item, index }: SectionListRenderItemInfo<Task, TaskSection>) => (
    <TaskListItem
      task={item}
      index={index}
      animate={shouldAnimateTask(item.id)}
      motion={motion}
      statusColumn={scopedTaskStatusColumn(item, storedTaskStatuses)}
      onPress={handleSelectTask}
      onToggle={handleToggleTask}
      onLongPress={showTaskCardMenu}
      c={c}
      isDark={isDark}
      projects={projects}
      sprints={sprints}
      overdueLabel={tr.overdueSection}
      priorityLabel={priorityA11y(item)}
      subtasksLabel={tr.subtasks}
      assigneeLabel={assigneeLabelFor(item)}
    />
  ), [shouldAnimateTask, motion, storedTaskStatuses, handleSelectTask, handleToggleTask, showTaskCardMenu, c, isDark, projects, sprints, tr.overdueSection, tr.subtasks, priorityA11y, assigneeLabelFor]);

  const renderSectionHeader = useCallback(({ section }: { section: SectionListData<Task, TaskSection> }) => (
    <Text style={[s.groupLabel, { color: c.sub }]}>{section.title}</Text>
  ), [c.sub]);

  const renderSectionFooter = useCallback(({ section }: { section: SectionListData<Task, TaskSection> }) => (
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

  // Шапка спільна для обох режимів; у списку вона стає ListHeaderComponent.
  const listHeader = (
    <>
            {/* Skeleton — перший завантаження */}
            {!initialized && (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            )}

            {/* Search bar */}
            <View style={[s.searchBar, { backgroundColor: c.dim, borderColor: c.border }]}>
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
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
                </TouchableOpacity>
              )}
            </View>

            {/* Скоуп: денна робота чи весь список. Окремо від чипів фільтрів
                і завжди на очах — це головний перемикач вкладки, а не одна з
                прихованих у шторці опцій. У календарі його немає: там місяць,
                і «сьогодні проти всього» нічого не означає. */}
            {viewMode === 'list' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <View style={{ flexDirection: 'row', gap: 6, backgroundColor: c.dim, borderRadius: 12, padding: 3, borderWidth: 1, borderColor: c.border }}>
                  {([
                    { key: 'today' as const, label: tr.today, count: todayCount },
                    { key: 'all' as const, label: tr.allTasks, count: filteredAll.length },
                  ]).map(option => {
                    const active = scope === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => { haptic.light(); setScope(option.key); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={`${option.label}, ${option.count}`}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: active ? c.accent : 'transparent' }}>
                        <Text style={{ color: active ? '#fff' : c.sub, fontSize: 13, fontWeight: '700' }}>{option.label}</Text>
                        <Text style={{ color: active ? 'rgba(255,255,255,0.75)' : c.sub, fontSize: 11, fontWeight: '600' }}>{option.count}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

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
                    backgroundColor: hasActiveFilters ? '#EF444418' : c.dim,
                    borderColor: hasActiveFilters ? '#EF444440' : c.border,
                  }}>
                  <IconSymbol
                    name={hasActiveFilters ? 'arrow.counterclockwise' : 'line.3.horizontal.decrease'}
                    size={17}
                    color={hasActiveFilters ? '#EF4444' : c.sub}
                  />
                </HeaderButton>
              </View>
            )}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                  {filter !== 'active' && (
                    <TouchableOpacity
                      onPress={() => setFilter('active')}
                      style={[s.activeChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
                      <Text style={[s.activeChipText, { color: c.accent }]}>
                        {filter === 'all' ? tr.allTasks : tr.allCompleted}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.accent} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  {sort !== 'status' && (
                    <TouchableOpacity
                      onPress={() => setSort('status')}
                      style={[s.activeChip, { backgroundColor: c.accent + '15', borderColor: c.accent + '40' }]}>
                      <IconSymbol name="arrow.up.arrow.down" size={10} color={c.accent} />
                      <Text style={[s.activeChipText, { color: c.accent, marginLeft: 4 }]}>
                        {SORT_OPTIONS.find(o => o.key === sort)?.label}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.accent} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  {filterProject && (() => {
                    const proj = projects.find(p => p.id === filterProject);
                    return proj ? (
                      <TouchableOpacity
                        onPress={() => setFilterProject(null)}
                        style={[s.activeChip, { backgroundColor: proj.color + '20', borderColor: proj.color + '50' }]}>
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
                      style={[s.activeChip, { backgroundColor: c.dim, borderColor: c.border, gap: 4 }]}>
                      {filterPriorities.map(l => <PriorityBadge key={l} level={l} />)}
                      <IconSymbol name="xmark" size={10} color={c.sub} style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                  {dateFilter && (
                    <TouchableOpacity
                      onPress={() => setDateFilter(null)}
                      style={[s.activeChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
                      <IconSymbol name="calendar" size={10} color={c.accent} />
                      <Text style={[s.activeChipText, { color: c.accent, marginLeft: 4 }]}>
                        {new Date(dateFilter).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={c.accent} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={clearAllFilters}
                    style={[s.activeChip, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                    <Text style={[s.activeChipText, { color: '#EF4444' }]}>{tr.resetAll}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            {/* Stats — today (deadline = today) */}
            <View style={{ marginTop: hasActiveFilters ? 12 : 16, marginBottom: 16, gap: 8 }}>
              <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
                <StatCell value={activeCount}          label={tr.active} color="#F59E0B" sub={c.sub} />
                <View style={{ width: 1, backgroundColor: c.border }} />
                <StatCell value={doneCount}            label={tr.done}           color="#10B981" sub={c.sub} />
                <View style={{ width: 1, backgroundColor: c.border }} />
                <StatCell value={todayMeetings.length} label={tr.meetings} color="#0EA5E9" sub={c.sub} />
                <View style={{ width: 1, backgroundColor: c.border }} />
                <StatCell value={`${efficiency}%`}    label={tr.efficiency}                                                         color={c.accent} sub={c.sub} />
              </View>
              {totalSubtasks > 0 && (
                <View style={[s.subtaskStatRow, { borderColor: c.border, backgroundColor: c.card }]}>
                  <IconSymbol name="list.bullet.circle.fill" size={14} color="#6366F1" />
                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500', marginLeft: 7 }}>{tr.subtasksToday}</Text>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <View style={[s.progressBg, { flex: 1 }]}>
                      <View style={[s.progressFill, { width: `${Math.round((doneSubtasks / totalSubtasks) * 100)}%`, backgroundColor: '#6366F1' }]} />
                    </View>
                  </View>
                  <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '700' }}>
                    {doneSubtasks}/{totalSubtasks}
                  </Text>
                </View>
              )}
              {dueTodayTasks.length === 0 && (
                <View style={[s.subtaskStatRow, { borderColor: c.border, backgroundColor: c.card, justifyContent: 'center' }]}>
                  <IconSymbol name="checkmark.seal" size={13} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500', marginLeft: 6 }}>{tr.noTasksToday}</Text>
                </View>
              )}
            </View>

            {/* ── Meetings section (list view only) ── */}
            {viewMode === 'list' && (
              <View style={{ marginBottom: 20 }}>
                {/* Header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <TouchableOpacity
                    onPress={() => router.push('/meetings')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={tr.meetings}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <IconSymbol name="calendar.circle.fill" size={16} color="#6366F1" />
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginLeft: 6 }}>{tr.meetings}</Text>
                    {/* Шеврон — інакше немає жодної підказки, що заголовок клікабельний */}
                    <IconSymbol name="chevron.right" size={12} color={c.sub} style={{ marginLeft: 2 }} />
                  </TouchableOpacity>
                  {todayMeetings2.length > 0 && (
                    <View style={{ backgroundColor: '#6366F120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 }}>
                      <Text style={{ color: '#6366F1', fontSize: 11, fontWeight: '700' }}>{todayMeetings2.length}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => openAddMeeting()}
                    style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#6366F118', borderWidth: 1, borderColor: '#6366F130', alignItems: 'center', justifyContent: 'center' }}>
                    <IconSymbol name="plus" size={14} color="#6366F1" />
                  </TouchableOpacity>
                </View>

                {todayMeetings2.length === 0 ? (
                  <TouchableOpacity onPress={() => openAddMeeting()} activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                    <IconSymbol name="calendar.badge.plus" size={16} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500' }}>{tr.addMeeting}</Text>
                  </TouchableOpacity>
                ) : (
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
                          <View style={{ borderRadius: 11, paddingVertical: 7, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden', opacity: isPast ? 0.5 : 1, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                            {/* Accent bar */}
                            <View style={{ width: 2.5, alignSelf: 'stretch', backgroundColor: mtg.color, borderRadius: 2, marginLeft: 0, minHeight: 36 }} />
                            {/* Time + day */}
                            <View style={{ alignItems: 'center', minWidth: 44 }}>
                              <Text style={{ color: mtg.color, fontSize: 13, fontWeight: '800', letterSpacing: -0.3 }}>{mtg.time || '--:--'}</Text>
                              <Text style={{ color: mtg.color, fontSize: 9, fontWeight: '600', opacity: 0.75, marginTop: 1 }}>{dFmt}</Text>
                            </View>
                            {/* Divider */}
                            <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: mtg.color + '30', marginVertical: 4 }} />
                            {/* Info */}
                            <View style={{ flex: 1, gap: 2 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                {isNow && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: mtg.color }} />}
                                <Text style={{ color: c.text, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>{mtg.title}</Text>
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
                                    <IconSymbol name="link" size={9} color={'#6366F1'} />
                                    <Text style={{ color: '#6366F1', fontSize: 10, fontWeight: '600' }}>Join</Text>
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
                        <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '700' }}>
                          {showAllTodayMeetings
                            ? tr.collapseList
                            : tr.showAllCount.replace('{count}', String(todayMeetings2.length))}
                        </Text>
                        <IconSymbol name={showAllTodayMeetings ? 'chevron.up' : 'chevron.down'} size={11} color="#6366F1" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Порожній день — окрема гілка, і вона НЕ про фільтри. Стандартний
                порожній стан радив би «додати завдання» або «скинути фільтри»,
                тоді як насправді робота є: вона просто не на сьогодні. Тому
                тут єдина осмислена дія — показати весь список. */}
            {todayEmpty && viewMode === 'list' && (
              <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                <IconSymbol name="checkmark.seal" size={40} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>{tr.noTasksToday}</Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7, textAlign: 'center' }}>{tr.noTasksTodayHint}</Text>
                <TouchableOpacity
                  onPress={() => setScope('all')}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.showAllTasks}, ${beyondTodayCount}`}
                  style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <IconSymbol name="list.bullet" size={15} color={c.accent} />
                  <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>{tr.showAllTasks} · {beyondTodayCount}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty state */}
            {!todayEmpty && filtered.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 56 }}>
                <IconSymbol name="checklist" size={40} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>
                  {search.trim() ? tr.nothingFound : hasFiltersBesidesSearch ? tr.noTasksMatchFilters : tr.noTasks}
                </Text>
                <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7, textAlign: 'center' }}>
                  {search.trim() ? tr.tryAnotherQuery : hasFiltersBesidesSearch ? tr.noTasksMatchFiltersHint : tr.pressToAdd}
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
                    style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.dim, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="arrow.clockwise" size={15} color={c.accent} />
                    <Text style={{ color: c.accent, fontWeight: '700', fontSize: 14 }}>{tr.resetAllFilters}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setShowAdd(true)}
                    accessibilityRole="button"
                    accessibilityLabel={tr.addTask}
                    style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <IconSymbol name="plus" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.addTask}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Overdue section (list view, active/all filter) */}
            {viewMode === 'list' && overdueItems.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
                  <Text style={[s.groupLabel, { color: '#EF4444', marginBottom: 0, marginTop: 0 }]}>{tr.overdueSection}</Text>
                  <View style={{ backgroundColor: '#EF444420', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>{overdueItems.length}</Text>
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  {overdueLimited.visible.map((task, i) => {
                    const animEntering = motion.entering(FadeInDown.duration(200).delay(Math.min(i, 10) * 40));
                    const animExiting  = motion.entering(FadeOutUp.duration(150));
                    const animLayout   = motion.entering(LinearTransition.springify());
                    return (
                      <Animated.View
                        key={task.id}
                        entering={animEntering}
                        exiting={animExiting}
                        layout={animLayout}>
                        <TaskCompactCard
                          task={task}
                          statusColumn={scopedTaskStatusColumn(task, storedTaskStatuses)}
                          onPress={handleSelectTask}
                          onToggle={handleToggleTask}
                          onLongPress={showTaskCardMenu}
                          c={c}
                          isDark={isDark}
                          projects={projects}
                          sprints={sprints}
                          overdueLabel={tr.overdueSection}
                          priorityLabel={priorityA11y(task)}
                          subtasksLabel={tr.subtasks}
                          assigneeLabel={assigneeLabelFor(task)}
                        />
                      </Animated.View>
                    );
                  })}
                </View>
                {overdueLimited.hasMore ? (
                  <GroupShowAllButton
                    groupKey={OVERDUE_GROUP_KEY}
                    title={tr.overdueSection}
                    total={overdueLimited.total}
                    onPress={openGroup}
                    color="#EF4444"
                    label={tr.groupShowAll}
                    a11yLabel={tr.groupShowAllA11y}
                  />
                ) : null}
              </View>
            )}

    </>
  );

  const calendarView = (
    <TaskCalendarView
      nav={cal}
      tasksByDate={tasksByDate}
      tasks={tasks}
      meetingsByDate={meetingsByDate}
      projects={projects}
      today={today}
      weekdays={WEEKDAYS_SHORT}
      months={MONTHS_UA}
      getProgress={getProgress}
      isOverdue={isOverdue}
      onSelectTask={handleSelectTask}
      onToggleTask={toggleTask}
      onOpenDay={setCalPopupDate}
      colors={c}
      isDark={isDark}
      tr={tr}
      locale={locale}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, flexDirection: 'row' }}>
      <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>

        {/* Fixed Header */}
        <ScreenHeader
          title={tr.tasks}
          color={c.text}
          actions={
            <>
              <HeaderButton
                onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')}
                accessibilityLabel={viewMode === 'list' ? tr.calendarMode : tr.listMode}
                style={{ backgroundColor: viewMode === 'calendar' ? c.accent + '20' : c.dim, borderColor: viewMode === 'calendar' ? c.accent : c.border }}>
                <IconSymbol name={viewMode === 'list' ? 'calendar' : 'list.bullet'} size={17} color={viewMode === 'calendar' ? c.accent : c.sub} />
              </HeaderButton>
              {/* Кнопки фільтрів у хедері немає навмисно: вона переїхала в рядок
                  із перемикачем «Сьогодні / Усі». Хедер лишається про режим
                  екрана (список чи календар) і меню, а все, що звужує НАБІР
                  завдань, стоїть в одному рядку — і перемикач, і фільтри. */}
              <HeaderButton
                onPress={() => setShowOptionsMenu(v => !v)}
                accessibilityLabel={tr.a11yOptions}
                style={{ backgroundColor: hasActiveFilters ? c.accent : c.dim, borderColor: hasActiveFilters ? c.accent : c.border }}>
                <IconSymbol name="ellipsis" size={17} color={hasActiveFilters ? '#fff' : c.sub} />
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
        </ScreenHeader>

        {viewMode === 'list' ? (
          <SectionList
            sections={sections}
            keyExtractor={task => task.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarInset + 24 }}
            showsVerticalScrollIndicator={false}
            // Заголовки груп не липкі — так було й до віртуалізації.
            stickySectionHeadersEnabled={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
            ListHeaderComponent={listHeader}
            renderSectionHeader={renderSectionHeader}
            renderSectionFooter={renderSectionFooter}
            ItemSeparatorComponent={TaskItemSeparator}
            renderItem={renderTaskItem}
          />
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarInset + 24 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}>
            {listHeader}
            {calendarView}
          </ScrollView>
        )}
      </View>

      {/* FAB */}
      <PressableScale onPress={() => { haptic.medium(); setShowAdd(true); }} scaleTo={0.92} style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>
      </View>

        <DetailPane
          open={!!selectedTask || !!viewedMeeting}
          wide={showDetailColumn}
          onClose={() => { setSelected(null); setSelectedMeeting(null); }}
          header={selectedTask ? taskDetailHeader : meetingDetailHeader}
          isDark={isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.88}
          scrollRef={detailScrollRef}
          empty={
            <>
              <IconSymbol name="checklist" size={40} color={c.sub} />
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginTop: 12 }}>{tr.detailEmptyTitle}</Text>
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 6 }}>{tr.detailEmptyHint}</Text>
            </>
          }>
          {selectedTask ? detailBody : meetingDetailBody}
        </DetailPane>
      </View>


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

      {/* ─── Calendar Day Popup ─── */}
      <Modal
        visible={calPopupDate !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setCalPopupDate(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'flex-end' }}
          onPress={() => setCalPopupDate(null)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? 'dark' : 'light'}
              style={{
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
                borderWidth: 1,
                borderBottomWidth: 0,
                borderColor: c.border,
                overflow: 'hidden',
                paddingBottom: Platform.OS === 'ios' ? 34 : 16,
                ...(Platform.OS === 'android' && { backgroundColor: isDark ? '#1C1A2E' : '#F4F2FF' }),
              }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 6 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.border }} />
              </View>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3, textTransform: 'capitalize' }}>
                    {calPopupDate?.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Text>
                  {calPopupDate && (() => {
                    const tCnt = (tasksByDate[calPopupDate.toDateString()] ?? []).length;
                    const mCnt = (meetingsByDate[calPopupDate.toISOString().slice(0, 10)] ?? []).length;
                    const parts = [];
                    if (tCnt > 0) parts.push(`${tCnt} завдань`);
                    if (mCnt > 0) parts.push(`${mCnt} зустрічей`);
                    return parts.length > 0 ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{parts.join(' · ')}</Text> : null;
                  })()}
                </View>
                <TouchableOpacity
                  onPress={() => setCalPopupDate(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark.circle.fill" size={24} color={c.sub} />
                </TouchableOpacity>
              </View>
              {/* Task + Meeting list */}
              <ScrollView
                style={{ maxHeight: height * 0.5 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 8 }}
                showsVerticalScrollIndicator={false}>

                {/* Meetings in popup */}
                {calPopupDate && (() => {
                  const dayMeetings = (meetingsByDate[calPopupDate.toISOString().slice(0, 10)] ?? [])
                    .sort((a, b) => a.time.localeCompare(b.time));
                  if (!dayMeetings.length) return null;
                  return (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <IconSymbol name="calendar.circle.fill" size={13} color="#6366F1" />
                        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{tr.meetings.toUpperCase()}</Text>
                      </View>
                      {dayMeetings.map(mtg => {
                        const durLabel = mtg.durationMinutes >= 60
                          ? `${Math.floor(mtg.durationMinutes / 60)}г${mtg.durationMinutes % 60 ? ` ${mtg.durationMinutes % 60}хв` : ''}`
                          : `${mtg.durationMinutes}хв`;
                        return (
                          <TouchableOpacity key={mtg.id} onPress={() => { setCalPopupDate(null); openMeetingView(mtg, true); }} activeOpacity={0.75}>
                            <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
                              style={{ borderRadius: 14, borderWidth: 1, borderColor: mtg.color + '40', padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: mtg.color, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />
                              <View style={{ marginLeft: 6, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 8, backgroundColor: mtg.color + '1A', alignItems: 'center', minWidth: 44 }}>
                                <Text style={{ color: mtg.color, fontSize: 12, fontWeight: '800' }}>{mtg.time || '--:--'}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{mtg.title}</Text>
                                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                                  {durLabel}{mtg.location ? ` · ${mtg.location}` : ''}
                                </Text>
                                {mtg.projectId ? (
                                  <View style={{ marginTop: 4 }}>
                                    <MeetingProjectChip project={meetingProject(mtg, projects)} textColor={c.text} maxWidth={180} />
                                  </View>
                                ) : null}
                              </View>
                              <IconSymbol name="chevron.right" size={12} color={c.sub} />
                            </BlurView>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => { setCalPopupDate(null); openAddMeeting(calPopupDate.toISOString().slice(0, 10)); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 }}>
                        <IconSymbol name="plus.circle" size={14} color="#6366F1" />
                        <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '600' }}>{tr.addMeetingForDay}</Text>
                      </TouchableOpacity>
                      {(tasksByDate[calPopupDate.toDateString()] ?? []).length > 0 && (
                        <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
                      )}
                    </>
                  );
                })()}

                {calPopupDate && (tasksByDate[calPopupDate.toDateString()] ?? []).length === 0
                  && (meetingsByDate[calPopupDate.toISOString().slice(0, 10)] ?? []).length === 0 && (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <IconSymbol name="calendar.badge.checkmark" size={32} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', marginTop: 10 }}>{tr.noTasksAndMeetings}</Text>
                  </View>
                )}
                {calPopupDate && (tasksByDate[calPopupDate.toDateString()] ?? []).length > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <IconSymbol name="checklist" size={13} color={c.accent} />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{tr.tasks}</Text>
                  </View>
                )}
                {calPopupDate && (tasksByDate[calPopupDate.toDateString()] ?? []).map(task => (
                  <TouchableOpacity
                    key={task.id}
                    onPress={() => { setCalPopupDate(null); setSelected(task); }}
                    activeOpacity={0.75}>
                    <BlurView
                      intensity={isDark ? 18 : 35}
                      tint={isDark ? 'dark' : 'light'}
                      style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation(); toggleTask(task.id); }}
                        style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent', flexShrink: 0 }}>
                        {task.status === 'done' && <IconSymbol name="checkmark" size={11} color="#fff" />}
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', opacity: task.status === 'done' ? 0.5 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>
                          {task.title}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <PriorityBadge level={normalizePriority(task)} />
                          {task.subtasks.length > 0 && (
                            <Text style={{ color: c.sub, fontSize: 11 }}>· {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</Text>
                          )}
                        </View>
                      </View>
                      <IconSymbol name="chevron.right" size={12} color={c.sub} />
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Options Dropdown ─── */}
      <Modal visible={showOptionsMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowOptionsMenu(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
          onPress={() => setShowOptionsMenu(false)}>
          <BlurView
            intensity={isDark ? 55 : 75}
            tint={isDark ? 'dark' : 'light'}
            style={{
              position: 'absolute',
              top: topInset + 62,
              right: 16,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: c.border,
              overflow: 'hidden',
              minWidth: 238,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.2,
              shadowRadius: 20,
              elevation: 14,
              ...(Platform.OS === 'android' && {
                backgroundColor: isDark ? '#1C1A2E' : '#F2EFFF',
              }),
            }}>
            {/* Notes */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/notes'); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: '#F59E0B20' }]}>
                <IconSymbol name="note.text" size={15} color="#F59E0B" />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.notes}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Filters */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); setShowFilterSheet(true); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: hasActiveFilters ? '#F59E0B20' : c.dim }]}>
                <IconSymbol name="line.3.horizontal.decrease" size={15} color={hasActiveFilters ? '#F59E0B' : c.sub} />
              </View>
              <Text style={[s.menuItemLabel, { color: hasActiveFilters ? '#F59E0B' : c.text }]}>{tr.filters}</Text>
              {hasActiveFilters
                ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#F59E0B' }} />
                : <IconSymbol name="chevron.right" size={12} color={c.sub} />}
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Projects */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/projects'); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: '#0EA5E920' }]}>
                <IconSymbol name="folder.fill" size={15} color="#0EA5E9" />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.projects}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Meetings */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/meetings'); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: '#6366F120' }]}>
                <IconSymbol name="calendar.circle.fill" size={15} color="#6366F1" />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.meetings}</Text>
              {meetings.length > 0 && (
                <View style={{ backgroundColor: '#6366F120', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4 }}>
                  <Text style={{ color: '#6366F1', fontSize: 11, fontWeight: '700' }}>{meetings.length}</Text>
                </View>
              )}
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Time Records */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/time-records'); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: '#6366F120' }]}>
                <IconSymbol name="timer" size={15} color="#6366F1" />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.timeRecords}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>

            <View style={[s.menuDivider, { backgroundColor: c.border }]} />

            {/* Archive */}
            <TouchableOpacity
              onPress={() => { setShowOptionsMenu(false); router.push('/archive'); }}
              style={s.menuItem}>
              <View style={[s.menuIconBox, { backgroundColor: '#10B98120' }]}>
                <IconSymbol name="archivebox.fill" size={15} color="#10B981" />
              </View>
              <Text style={[s.menuItemLabel, { color: c.text }]}>{tr.archive}</Text>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>
          </BlurView>
        </Pressable>
      </Modal>

      {/* ─── Filter & Sort Bottom Sheet ─── */}
      <Modal visible={showFilterSheet} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowFilterSheet(false)}>
        <Pressable style={s.overlay} onPress={() => setShowFilterSheet(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowFilterSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, backgroundColor: '#EF444414', borderColor: '#EF444438' }}>
                      <IconSymbol name="arrow.counterclockwise" size={12} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>{tr.resetAll}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Calendar filter */}
                <Text style={[s.label, { color: c.sub }]}>{tr.creationDate}</Text>
                <TouchableOpacity
                  onPress={() => { setShowFilterSheet(false); setShowCal(true); }}
                  style={[s.filterActionBtn, { backgroundColor: dateFilter ? c.accent + '20' : c.dim, borderColor: dateFilter ? c.accent + '60' : c.border }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.accent : c.sub} />
                  <Text style={{ color: dateFilter ? c.accent : c.sub, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 10 }}>
                    {dateFilter
                      ? new Date(dateFilter).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                      : tr.select}
                  </Text>
                  {dateFilter && (
                    <TouchableOpacity onPress={() => setDateFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <IconSymbol name="xmark.circle.fill" size={16} color={c.accent} />
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
                      style={[s.filterSegBtn, { flex: 1, backgroundColor: filter === f ? c.accent : c.dim, borderColor: filter === f ? c.accent : c.border }]}>
                      <IconSymbol
                        name={f === 'all' ? 'tray.full' : f === 'active' ? 'circle.dotted' : 'checkmark.circle.fill'}
                        size={14}
                        color={filter === f ? '#fff' : c.sub}
                      />
                      <Text style={{ color: filter === f ? '#fff' : c.sub, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
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
                        style={[s.sortChip, { minHeight: 36, backgroundColor: !filterProject ? c.accent + '18' : c.dim, borderColor: !filterProject ? c.accent : c.border }]}>
                        <Text style={{ color: !filterProject ? c.accent : c.sub, fontSize: 12, fontWeight: '600' }}>{tr.allProjects}</Text>
                      </TouchableOpacity>
                      {pickableProjects.map(proj => {
                        const on = filterProject === proj.id;
                        return (
                          <TouchableOpacity
                            key={proj.id}
                            onPress={() => setFilterProject(on ? null : proj.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            style={[s.sortChip, { minHeight: 36, maxWidth: 190, backgroundColor: on ? proj.color + '18' : c.dim, borderColor: on ? proj.color : c.border }]}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: proj.color, marginRight: 6 }} />
                            <Text numberOfLines={1} style={{ color: on ? proj.color : c.text, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{proj.name}</Text>
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
                        style={[s.sortChip, { minHeight: 36, backgroundColor: on ? c.accent + '18' : c.dim, borderColor: on ? c.accent : c.border }]}>
                        <IconSymbol name={opt.icon as any} size={13} color={on ? c.accent : c.sub} />
                        <Text style={{ color: on ? c.accent : c.text, fontSize: 12, fontWeight: '600', marginLeft: 6 }}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Готово — головна дія шита. Скидання перенесено нагору,
                    поруч із заголовком. */}
                <TouchableOpacity
                  onPress={() => setShowFilterSheet(false)}
                  accessibilityRole="button"
                  style={[s.btn, { marginTop: 22, backgroundColor: c.accent }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.applyFilters}</Text>
                </TouchableOpacity>

                <View style={{ height: 8 }} />
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar filter Modal ─── */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrapper, sheetColumnStyle(isWide)]}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
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
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>{tr.resetFilter}</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Task Modal ─── */}
      <SheetModal visible={showAdd} onClose={() => setShowAdd(false)}>
        <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.detailSheet, { maxHeight: height * 0.88, borderColor: c.border, backgroundColor: c.sheet }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TaskEditForm
              title={tr.newTask}
              submitLabel={tr.add}
              editor={composer}
              taskStatuses={taskStatuses}
              pickableProjects={pickableProjects}
              projects={projects}
              projectCreateOption={projectCreateOption(id => composer.patch({ projectId: id, sprintId: null }))}
              sprints={sprints}
              members={composerMembers}
              myUserId={user?.id}
              deadlineWeeks={dlWeeks}
              months={MONTHS_UA}
              weekdays={WEEKDAYS_SHORT}
              deadlinePresets={DEADLINE_PRESETS}
              today={today}
              onSave={addTask}
              onCancel={() => { composer.reset(ACTIVE_COLUMN_ID); setShowAdd(false); }}
              colors={c}
              isDark={isDark}
              tr={tr}
              locale={locale}
            />
          </ScrollView>
        </BlurView>
      </SheetModal>


      {/* ─── Recording Modal ─── */}
      <Modal visible={!!recordingTaskId} transparent animationType="fade" statusBarTranslucent
        onRequestClose={() => { if (isRecording) stopRecording(); else setRecordingTaskId(null); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => { if (!isRecording) setRecordingTaskId(null); }}>
          <Pressable onPress={e => e.stopPropagation()}
            style={{ backgroundColor: isDark ? '#12121E' : '#FFFFFF', borderRadius: 24, padding: 28,
              alignItems: 'center', width: 280, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: isRecording ? '#EF4444' + '20' : c.dim,
              alignItems: 'center', justifyContent: 'center', marginBottom: 20,
              borderWidth: 2, borderColor: isRecording ? '#EF4444' : c.border }}>
              <IconSymbol name={isRecording ? 'stop.fill' : 'mic.fill'} size={32} color={isRecording ? '#EF4444' : c.sub} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: isDark ? '#fff' : '#000', marginBottom: 6 }}>
              {isRecording ? 'Запис...' : 'Аудіозапис'}
            </Text>
            <RecordingClock
              startedAt={recordingStartedAt}
              style={{ fontSize: 28, fontWeight: '800', color: isRecording ? '#EF4444' : c.accent,
                letterSpacing: 2, marginBottom: 24, fontVariant: ['tabular-nums'] }}
            />
            {isRecording ? (
              <TouchableOpacity onPress={stopRecording}
                style={{ backgroundColor: '#EF4444', borderRadius: 16, paddingVertical: 14,
                  paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol name="stop.fill" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Зупинити</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => recordingTaskId && startRecording(recordingTaskId)}
                style={{ backgroundColor: c.accent, borderRadius: 16, paddingVertical: 14,
                  paddingHorizontal: 32, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <IconSymbol name="mic.fill" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Почати запис</Text>
              </TouchableOpacity>
            )}
            {/* Recordings list */}
            {(() => {
              const task = tasks.find(t => t.id === recordingTaskId);
              if (!task?.recordings?.length) return null;
              return (
                <View style={{ width: '100%', marginTop: 20, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: c.sub, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    ЗАПИСИ ({task.recordings.length})
                  </Text>
                  {task.recordings.map((uri, idx) => (
                    <View key={uri} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6,
                      backgroundColor: c.accent + '10', borderRadius: 10, padding: 8,
                      borderWidth: 1, borderColor: c.accent + '25' }}>
                      <IconSymbol name="waveform" size={14} color={c.accent} />
                      <Text style={{ flex: 1, fontSize: 13, color: isDark ? '#fff' : '#000', marginLeft: 8 }}>Запис {idx + 1}</Text>
                      <TouchableOpacity onPress={() => playRecording(uri)}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <IconSymbol name={playingUri === uri ? 'pause.fill' : 'play.fill'} size={11} color={c.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { deleteRecording(recordingTaskId!, uri); }}
                        style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                        <IconSymbol name="trash" size={11} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

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
}) {
  return (
    <Animated.View
      entering={animate ? motion.entering(FadeInDown.duration(200).delay(Math.min(index, 10) * 40)) : undefined}
      exiting={motion.entering(FadeOutUp.duration(150))}
      layout={motion.entering(LinearTransition.springify())}>
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
      />
    </Animated.View>
  );
});

/** Секція списку: `data` — лише видимі (до ліміту), `total` — скільки в групі всього. */
interface TaskSection {
  key: string;
  title: string;
  total: number;
}

/** Відступ між картками. Модульний компонент — не нова функція щорендера. */
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
      style={[s.groupShowAll, { backgroundColor: color + '12', borderColor: color + '40' }]}>
      <Text style={{ color, fontSize: 13, fontWeight: '600', flex: 1 }}>
        {label.replace('{count}', String(total))}
      </Text>
      <IconSymbol name="chevron.right" size={12} color={color} />
    </TouchableOpacity>
  );
});

// ─── Stat Cell ───────────────────────────────────────────────────────────────
function StatCell({ value, label, color, sub }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  searchBar:      { flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, marginBottom: 0 },
  searchInput:    { flex: 1, fontSize: 14, fontWeight: '400', marginLeft: 8, paddingVertical: 0 },
  activeChip:     { flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  activeChipText: { fontSize: 11, fontWeight: '600' },
  statsRow:       { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  subtaskStatRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  sortChip:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  sortLabel:      { fontSize: 12, fontWeight: '600' },
  groupLabel:     { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 6 },
  taskCard:       { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  boardCard:      { borderRadius: 13, padding: 11, overflow: 'hidden' },
  taskTitle:      { fontSize: 14, fontWeight: '600' },
  checkbox:       { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot:            { width: 8, height: 8, borderRadius: 4 },
  colorDot:       { width: 12, height: 12, borderRadius: 4 },
  badge:          { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  progressBg:     { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 2 },
  // tabular-nums: без них ширина «7%» і «71%» різна, і прогрес-рядок сіпається
  // при кожній зміні.
  pct:            { fontSize: 11, fontWeight: '600', minWidth: 30, fontVariant: ['tabular-nums'] },
  colLabel:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyCol:       { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 24, alignItems: 'center' },
  fab:            { position: 'absolute', right: 20, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:   { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:          { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  detailSheet:    { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  inlineCalendar: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 8 },
  reminderPickerBox: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 8 },
  handleRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:         { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:     { fontSize: 20, fontWeight: '800', marginBottom: 18 },
  detailTitle:    { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  detailDesc:     { fontSize: 13, lineHeight: 19, marginBottom: 8, opacity: 0.7 },
  input:          { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:          { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  priorityBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  btn:            { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  subRow:         { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10 },
  subCheck:       { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  subTitle:       { fontSize: 13, fontWeight: '500' },
  addSubRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 10 },
  subInput:       { fontSize: 13, paddingVertical: 0 },
  navBtn:         { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:        { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:         { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  // Filter sheet
  filterActionBtn:{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  filterSegBtn:   { paddingVertical: 11, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  viewAllBtn:     { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11 },
  itemSeparator:  { height: 6 },
  groupShowAll:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginTop: 6 },
  dropdownBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11 },
  dropdownList:   { borderRadius: 12, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  dropdownItem:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 11 },
  menuItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13 },
  menuIconBox:    { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  menuItemLabel:  { fontSize: 14, fontWeight: '600', flex: 1 },
  menuPill:       { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  menuPillText:   { fontSize: 11, fontWeight: '600' },
  menuDivider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
});
