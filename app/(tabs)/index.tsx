import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { MonthPicker } from '@/components/shared/MonthPicker';
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useMotion } from '@/hooks/use-motion';
import { MeetingFormSheet, MeetingFormData, RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { PressableScale } from '@/components/shared/PressableScale';
import { SheetModal } from '@/components/shared/SheetModal';
import { SkeletonRow } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { cancelReminder, scheduleReminder } from '@/store/notifications';
import { filterTasksByMonth, taskMatchesSearch } from '@/utils/taskUtils';
import { ACTIVE_COLUMN_ID, DONE_COLUMN_ID, mergeTaskStatusColumns, taskColumnId, taskStatusColumn } from '@/utils/taskStatuses';
import type { TaskStatusColumn } from '@/utils/taskStatuses';
import { haptic } from '@/utils/haptics';
import type { Project } from '../projects';
import { useResponsive } from '@/hooks/use-responsive';
import { useCalendarNav, type CalSpan } from '@/hooks/use-calendar-nav';
import { draftEstimatedMinutes, draftRecurrence, useTaskEditor } from '@/hooks/use-task-editor';
import { TaskDetailPane } from '@/components/tasks/TaskDetailPane';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { TaskHistoryTab, type HistoryEventType, type TaskHistoryEvent } from '@/components/tasks/TaskHistoryTab';
import { TaskTimerTab } from '@/components/tasks/TaskTimerTab';
import { TaskEditForm } from '@/components/tasks/TaskEditForm';
import { CalendarGrid } from '@/components/tasks/CalendarGrid';
import { TaskReminderRow } from '@/components/tasks/TaskReminderRow';
import { TaskSubtasks } from '@/components/tasks/TaskSubtasks';
import { TaskCalendarView } from '@/components/tasks/TaskCalendarView';
import { getActiveTimerEntry, totalSecondsIncludingActive, totalTrackedSeconds } from '@/utils/taskTimer';
import { monthGrid } from '@/utils/dateUtils';
import { initialReminderDraft, resolveReminderMoment } from '@/utils/reminderTime';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';

// ─── expo-av conditional (install with: npx expo install expo-av) ────────────
let AVAudio: any = null;
try { AVAudio = require('expo-av').Audio; } catch {}

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';
type SortBy = 'priority' | 'newest' | 'oldest' | 'name' | 'deadline';
type Filter = 'all' | 'active' | 'done';
type ViewMode = 'list' | 'calendar';

interface SubTask { id: string; title: string; done: boolean; reminderAt?: string; }

interface TaskTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number; // seconds
}


interface Task {
  id: string;
  title: string;
  /** Опційний: веб-клієнт пише undefined замість порожнього рядка. */
  description?: string;
  priority: Priority;
  status: Status;
  kanbanColumnId?: string;
  subtasks: SubTask[];
  createdAt: string;
  startDate?: string;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  reminderAt?: string;
  timeEntries?: TaskTimeEntry[];
  history?: TaskHistoryEvent[];
  recurrence?: RecurrenceRule;
  recordings?: string[];
}

interface Meeting {
  id: string;
  title: string;
  date: string;          // 'YYYY-MM-DD'
  time: string;          // 'HH:MM'
  durationMinutes: number;
  location?: string;
  link?: string;
  notes?: string;
  color: string;
  recurrence?: RecurrenceRule;
}

const PRIORITY_COLORS: Record<Priority, string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#10B981',
};
const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function uaPlural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10  = Math.abs(n) % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function groupLabel(date: Date, todayLabel: string, yesterdayLabel: string, tomorrowLabel: string, locale: string) {
  if (date.toDateString() === today.toDateString()) return todayLabel;
  if (date.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return tomorrowLabel;
  if (diff > 1 && diff <= 7) return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
}

function getProgress(t: Task) {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

function isOverdue(task: Task): boolean {
  if (!task.deadline || task.status === 'done') return false;
  const d = new Date(task.deadline);
  d.setHours(23, 59, 59, 999);
  return d < today;
}

function deadlineLabel(iso: string, todayLabel: string, yesterdayLabel: string, tomorrowLabel: string, locale: string): string {
  const d = new Date(iso);
  if (d.toDateString() === today.toDateString()) return todayLabel;
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return tomorrowLabel;
  if (diff > 1 && diff <= 7) return `+${diff} ${locale === 'uk-UA' ? 'дн' : 'd'}`;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

// ─── Timer helpers ────────────────────────────────────────────────────────────
const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};
const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m || 0} хв`;
};




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




export default function TasksScreen() {
  const tabBarInset = useTabBarInset();
  const { height, isExpanded } = useResponsive();
  // Деталь стає колонкою лише на expanded (≥840). На medium сайдбар уже
  // займає 232pt, і колонка вийшла б вужчою за 260pt — гірше, ніж на
  // весь екран. Там деталь лишається модалкою.
  const showDetailColumn = isExpanded;
  const isDark = useColorScheme() === 'dark';
  useScreenView('tasks');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const motion = useMotion();

  const PRIORITY: Record<Priority, { label: string; color: string }> = {
    high:   { label: tr.priorityHigh,   color: PRIORITY_COLORS.high   },
    medium: { label: tr.priorityMedium, color: PRIORITY_COLORS.medium },
    low:    { label: tr.priorityLow,    color: PRIORITY_COLORS.low    },
  };
  const SORT_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Пікери показують лише ЖИВІ проєкти, а `projects` лишається повним.
  // Це навмисно: підпис обраного значення шукається в повному списку, тож
  // задача в архівному проєкті й далі показує його назву, а не порожнє поле.
  const pickableProjects = useMemo(
    () => projects.filter(p => !p.archivedAt),
    [projects],
  );
  const [storedTaskStatuses, setStoredTaskStatuses] = useState<TaskStatusColumn[]>([]);
  const taskStatuses = useMemo(() => mergeTaskStatusColumns(storedTaskStatuses), [storedTaskStatuses]);
  const [initialized, setInitialized] = useState(false);
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortBy>('deadline');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Search & extra filters
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [showDetailProjectDropdown, setShowDetailProjectDropdown] = useState(false);

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

  // Inline subtask editing (no nested Modal — prevents iOS freeze)
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState('');

  // Форма редагування завдання — цілісний стан, див. use-task-editor.
  const editor = useTaskEditor(ACTIVE_COLUMN_ID, today);
  // Створення нового завдання користується тією самою формою й тим самим
  // станом, що й редагування — це той самий набір полів.
  const composer = useTaskEditor(ACTIVE_COLUMN_ID, today);

  // Reminder picker state (shown inline in detail modal)
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderPickerTarget, setReminderPickerTarget] = useState<{ taskId: string; subtaskId?: string } | null>(null);
  const [reminderHours, setReminderHours] = useState('');
  const [reminderMins, setReminderMins] = useState('');
  const [reminderDate, setReminderDate] = useState<string | null>(null);

  // Recording
  const [recordingTaskId, setRecordingTaskId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const recordingRef = useRef<any>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<any>(null);

  // Detail tab + timer display
  const [detailTab, setDetailTab] = useState<'info' | 'timer' | 'history'>('info');

  const loadAll = useCallback(async () => {
    const [t, p, m, statuses] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Project[]>('projects', []),
      loadData<Meeting[]>('meetings', []),
      loadData<TaskStatusColumn[]>('task_statuses', []),
    ]);
    setTasks(t);
    setProjects(p);
    setMeetings(m);
    setStoredTaskStatuses(statuses);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // Load from storage (useFocusEffect refreshes when returning from subtasks screen)
  useFocusEffect(useCallback(() => {
    loadAll().then(() => { setInitialized(true); setMeetingsInit(true); });
  }, []));

  // Open create-task modal when navigated with ?create=1 (e.g. from Today quick actions)
  const { create: createParam, open: openParam } = useLocalSearchParams<{ create?: string; open?: string }>();
  useEffect(() => {
    if (createParam === '1') {
      setShowAdd(true);
      router.setParams({ create: '' });
    }
  }, [createParam, router]);

  // Open task details when navigated with ?open=<taskId> (e.g. from Today rows)
  useEffect(() => {
    if (!openParam || !initialized) return;
    const t = tasks.find(x => x.id === openParam);
    if (t) setSelected(t);
    router.setParams({ open: '' });
    // tasks навмисно поза deps: реагуємо лише на прихід параметра після ініціалізації
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openParam, initialized, router]);

  // Save to storage
  useEffect(() => {
    if (initialized) void saveSynced('tasks', tasks);
  }, [tasks, initialized]);

  useEffect(() => {
    if (meetingsInit) void saveSynced('meetings', meetings);
  }, [meetings, meetingsInit]);

  // Ref для синхронного читання поточних tasks (використовується в callbacks без deps)
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Undo-тост (таб — над таб-баром)
  const { show: showUndo, element: undoElement } = useUndoToast(true);

  // Reset detail tab when opening a different task
  useEffect(() => {
    setDetailTab('info');
    setShowReminderPicker(false);
  }, [selected?.id]);

  // Timer interval — run while selected task has active timer entry
  const selectedTaskForTimer = selected ? tasks.find(t => t.id === selected.id) : null;
  const isTimerRunning = selectedTaskForTimer ? !!getActiveTimerEntry(selectedTaskForTimer) : false;

  const todayStr = today.toDateString();
  // Tasks due today (deadline = today) — both done and not done
  const dueTodayTasks   = tasks.filter(t => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  const doneCount       = dueTodayTasks.filter(t => t.status === 'done').length;
  const activeCount     = dueTodayTasks.filter(t => t.status === 'active').length;
  // Efficiency based on subtasks (if task has subtasks, count subtask progress; otherwise count task status)
  const effTotalUnits   = dueTodayTasks.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.length : 1), 0);
  const effDoneUnits    = dueTodayTasks.reduce((acc, t) => acc + (t.subtasks.length > 0 ? t.subtasks.filter(s => s.done).length : (t.status === 'done' ? 1 : 0)), 0);
  // Today's meetings — past meetings count as completed units in efficiency
  const todayMeetings     = meetings.filter(m => m.date === localDateStr(today));
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

  const sorted = useMemo(() => {
    const pOrd: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => {
      switch (sort) {
        case 'deadline': {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        }
        case 'priority': return pOrd[a.priority] - pOrd[b.priority];
        case 'newest':   return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':   return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name':     return a.title.localeCompare(b.title, 'uk');
      }
    });
  }, [tasks, sort]);

  const filtered = useMemo(() => {
    const monthFiltered = filterTasksByMonth(sorted, activeMonth);
    return monthFiltered.filter(t => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (dateFilter) {
        const d = new Date(t.createdAt);
        if (d.toDateString() !== dateFilter) return false;
      }
      if (!taskMatchesSearch(t, search)) return false;
      if (filterProject && t.projectId !== filterProject) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    });
  }, [sorted, activeMonth, filter, dateFilter, search, filterProject, filterPriority]);

  // Overdue tasks pulled into a dedicated top section (list view, active/all filter only)
  const overdueItems = useMemo(
    () => (filter !== 'done' && viewMode === 'list')
      ? filtered.filter(t => isOverdue(t))
      : [],
    [filtered, filter, viewMode],
  );

  // For groups we exclude overdue tasks when the overdue section is shown
  const groupsSource = useMemo(
    () => overdueItems.length > 0 ? filtered.filter(t => !isOverdue(t)) : filtered,
    [filtered, overdueItems],
  );

  const groups = useMemo(() => {
    const map: Record<string, { label: string; tasks: Task[] }> = {};
    const order: string[] = [];
    groupsSource.forEach(t => {
      let key: string;
      let label: string;
      if (sort === 'deadline') {
        if (!t.deadline) {
          key = '__no_deadline__';
          label = tr.withoutDeadline;
        } else {
          const d = new Date(t.deadline);
          key = d.toDateString();
          label = groupLabel(d, tr.today, tr.yesterday, tr.tomorrow, locale);
        }
      } else {
        const d = new Date(t.createdAt);
        key = d.toDateString();
        label = groupLabel(d, tr.today, tr.yesterday, tr.tomorrow, locale);
      }
      if (!map[key]) { map[key] = { label, tasks: [] }; order.push(key); }
      map[key].tasks.push(t);
    });
    const noDeadlineIdx = order.indexOf('__no_deadline__');
    if (noDeadlineIdx > 0) {
      order.splice(noDeadlineIdx, 1);
      order.push('__no_deadline__');
    }
    return order.map(k => map[k]);
  }, [groupsSource, sort]);

  // Пошук навмисно не враховано: у нього власна гілка порожнього стану,
  // і змішувати їх означало б радити «скинути фільтри» людині, яка
  // просто нічого не знайшла за запитом.
  const hasFiltersBesidesSearch = filter !== 'active' || sort !== 'deadline' || !!dateFilter || !!filterProject || !!filterPriority;
  const hasActiveFilters = filter !== 'active' || sort !== 'deadline' || !!dateFilter || !!filterProject || !!filterPriority || !!search.trim();

  const addTask = useCallback(() => {
    const draft = composer.draft;
    if (!draft.title.trim()) return;
    const selectedStatus = taskStatuses.find(column => column.id === draft.statusId) ?? taskStatuses[0];
    setTasks(p => [{
      id: Date.now().toString(),
      title: draft.title.trim(),
      description: draft.desc.trim(),
      priority: draft.priority,
      status: selectedStatus.isDone ? 'done' : 'active',
      kanbanColumnId: selectedStatus.id,
      subtasks: [],
      createdAt: new Date().toISOString(),
      estimatedMinutes: draftEstimatedMinutes(draft),
      deadline: draft.deadline ?? undefined,
      projectId: draft.projectId ?? undefined,
      timeEntries: [],
      history: [makeHistoryEvent('created')],
      recurrence: draftRecurrence(draft),
    }, ...p]);
    composer.reset(ACTIVE_COLUMN_ID);
    setShowAdd(false);
    haptic.success();
  }, [composer, taskStatuses]);

  const deleteTask = useCallback((id: string, title?: string) => {
    const taskToDelete = tasksRef.current.find(t => t.id === id);
    Alert.alert(
      tr.deletePermanently,
      title ? `«${title}»\n${tr.cannotUndo}` : tr.cannotUndo,
      [
        { text: tr.cancel, style: 'cancel' },
        {
          text: tr.delete,
          style: 'destructive',
          onPress: () => {
            setTasks(p => p.filter(t => t.id !== id));
            if (selected?.id === id) { setSelected(null); setShowDetailProjectDropdown(false); }
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
  }, [selected, tr, showUndo]);

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
      setRecordingSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch (e: any) {
      if (__DEV__) console.warn('[record] start error:', e);
      Alert.alert('Помилка запису', e?.message);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    try {
      await recordingRef.current.stopAndUnloadAsync();
      await AVAudio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);
      if (uri && recordingTaskId) {
        setTasks(prev => prev.map(t => t.id === recordingTaskId
          ? { ...t, recordings: [...(t.recordings ?? []), uri] }
          : t
        ));
      }
      setRecordingTaskId(null);
      setRecordingSeconds(0);
    } catch (e: any) {
      if (__DEV__) console.warn('[record] stop error:', e);
    }
  }, [recordingTaskId]);

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
  }, []);

  // Cleanup recording on unmount
  useEffect(() => () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
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
    const column = taskStatuses.find(item => item.id === columnId);
    if (!column) return;
    haptic.light();
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (taskStatusColumn(t, taskStatuses).id === column.id) return t;
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
  }, [taskStatuses]);

  const toggleTask = useCallback((id: string) => {
    haptic.light();
    // Знімок поточного стану задачі для undo
    const prevTask = tasksRef.current.find(t => t.id === id);
    const becomingDone = prevTask?.status === 'active';

    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
      const kanbanColumnId = status === 'done' ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID;
      const histType: HistoryEventType = status === 'done' ? 'done' : 'active';
      // Also stop active timer if completing task
      const timeEntries = status === 'done'
        ? (t.timeEntries ?? []).map(e => {
            if (e.endedAt) return e;
            const now = new Date();
            return { ...e, endedAt: now.toISOString(), duration: Math.max(0, Math.floor((now.getTime() - new Date(e.startedAt).getTime()) / 1000)) };
          })
        : (t.timeEntries ?? []);
      return {
        ...t, status, kanbanColumnId,
        subtasks: t.subtasks.map(s => ({ ...s, done: status === 'done' })),
        timeEntries,
        history: [...(t.history ?? []), makeHistoryEvent(histType)],
      };
    };
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
            kanbanColumnId: ACTIVE_COLUMN_ID,
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
      showUndo(tr.taskMarkedDone, () => {
        setTasks(prev => prev.map(t => t.id === id ? snapshot : t));
        setSelected(prev => prev?.id === id ? snapshot : prev);
      });
    }
  }, [showUndo, tr.taskMarkedDone]);

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
  }, [newSubtask]);

  const toggleSubtask = useCallback((taskId: string, subId: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const targetSub = t.subtasks.find(s => s.id === subId);
      const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
      const histType: HistoryEventType = targetSub?.done ? 'subtask_undone' : 'subtask_done';
      return {
        ...t,
        subtasks,
        status: subtasks.length > 0 && subtasks.every(s => s.done) ? 'done' : 'active',
        kanbanColumnId: subtasks.length > 0 && subtasks.every(s => s.done) ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID,
        history: [...(t.history ?? []), makeHistoryEvent(histType, targetSub?.title)],
      };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, []);

  const deleteSubtask = useCallback((taskId: string, subId: string) => {
    const patch = (t: Task): Task => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subId) } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, []);

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
  }, []);

  const duplicateSubtask = useCallback((taskId: string, sub: SubTask) => {
    const copy: SubTask = { id: Date.now().toString(), title: sub.title + ' (копія)', done: false };
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const idx = t.subtasks.findIndex(s => s.id === sub.id);
      const newSubs = [...t.subtasks];
      newSubs.splice(idx + 1, 0, copy);
      return { ...t, subtasks: newSubs };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, []);

  const saveSubEdit = useCallback((taskId: string, subId: string, text: string) => {
    if (!text.trim()) { setEditingSubId(null); return; }
    const patch = (t: Task): Task => t.id !== taskId ? t : {
      ...t, subtasks: t.subtasks.map(s => s.id !== subId ? s : { ...s, title: text.trim() }),
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setEditingSubId(null);
  }, []);

  const updateTaskProject = useCallback((taskId: string, projectId: string | null) => {
    const patch = (t: Task): Task => t.id !== taskId ? t : { ...t, projectId: projectId ?? undefined };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, []);

  // Стабільні посилання: інакше React.memo на картках нічого не дає.
  const sections = useMemo(
    () => groups.map(group => ({ title: group.label, data: group.tasks })),
    [groups],
  );

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

  const handleSelectTask = useCallback((task: Task) => setSelected(task), []);
  const handleToggleTask = useCallback((task: Task) => toggleTask(task.id), [toggleTask]);

  const saveTaskEdit = useCallback(() => {
    if (!editor.draft.title.trim() || !selected) return;
    const estimatedMinutes = draftEstimatedMinutes(editor.draft);
    const recurrence = draftRecurrence(editor.draft);
    const patch = (t: Task): Task => t.id !== selected.id ? t : {
      ...t,
      title: editor.draft.title.trim(),
      description: editor.draft.desc.trim(),
      priority: editor.draft.priority,
      status: (taskStatuses.find(column => column.id === editor.draft.statusId) ?? taskStatuses[0]).isDone ? 'done' : 'active',
      kanbanColumnId: editor.draft.statusId,
      estimatedMinutes,
      deadline: editor.draft.deadline ?? undefined,
      // Проєкт застосовується разом з рештою форми, а не миттєво при
      // виборі: інакше «Скасувати» повертало б усе, крім нього.
      projectId: editor.draft.projectId ?? undefined,
      recurrence,
      history: [...(t.history ?? []), makeHistoryEvent('edited')],
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === selected.id ? patch(prev) : prev);
    editor.finish();
    // Чернетка тепер один об'єкт, тож і залежність одна замість тринадцяти.
  }, [editor, selected, taskStatuses]);

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
  }, [reminderPickerTarget, reminderHours, reminderMins, reminderDate, tasks]);

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
  }, []);

  const showSubtaskActions = useCallback((taskId: string, sub: SubTask, idx: number, total: number) => {
    const buttons: any[] = [
      { text: tr.editAction, onPress: () => { setEditingSubId(sub.id); setEditingSubText(sub.title); } },
      { text: lang === 'uk' ? 'Дублювати' : 'Duplicate', onPress: () => duplicateSubtask(taskId, sub) },
      ...(idx > 0 ? [{ text: lang === 'uk' ? 'Перемістити вгору' : 'Move up', onPress: () => moveSubtask(taskId, sub.id, 'up') }] : []),
      ...(idx < total - 1 ? [{ text: lang === 'uk' ? 'Перемістити вниз' : 'Move down', onPress: () => moveSubtask(taskId, sub.id, 'down') }] : []),
      { text: sub.reminderAt ? `Нагадування: ${new Date(sub.reminderAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : tr.reminderDate, onPress: () => openReminderPicker(taskId, sub.id) },
      ...(sub.reminderAt ? [{ text: lang === 'uk' ? 'Видалити нагадування' : 'Delete reminder', onPress: () => removeReminder(taskId, sub.id) }] : []),
      { text: tr.delete, style: 'destructive' as const, onPress: () => deleteSubtask(taskId, sub.id) },
      { text: tr.cancel, style: 'cancel' as const },
    ];
    Alert.alert(sub.title, undefined, buttons);
  }, [duplicateSubtask, moveSubtask, deleteSubtask, openReminderPicker, removeReminder]);

  const startTimer = useCallback(() => {
    if (!selected) return;
    const entry: TaskTimeEntry = { id: Date.now().toString(), startedAt: new Date().toISOString(), duration: 0 };
    const evt = makeHistoryEvent('timer_start');
    setTasks(p => p.map(t => t.id !== selected.id ? t : {
      ...t,
      timeEntries: [...(t.timeEntries ?? []), entry],
      history: [...(t.history ?? []), evt],
    }));
  }, [selected]);

  const stopTimer = useCallback(() => {
    if (!selected) return;
    const now = new Date();
    const evt = makeHistoryEvent('timer_stop');
    // sessionDuration is captured inside the setTasks updater (runs synchronously)
    // so we can read it immediately after setTasks returns.
    let sessionDuration = 0;

    setTasks(p => p.map(t => {
      if (t.id !== selected.id) return t;
      const timeEntries = (t.timeEntries ?? []).map(e => {
        if (e.endedAt) return e;
        const duration = Math.max(0, Math.floor((now.getTime() - new Date(e.startedAt).getTime()) / 1000));
        sessionDuration = duration; // capture for time_entries write
        return { ...e, endedAt: now.toISOString(), duration };
      });
      return { ...t, timeEntries, history: [...(t.history ?? []), evt] };
    }));

    // Mirror session to shared 'time_entries' so time-stats/time-records see it
    if (sessionDuration > 0) {
      const hour = now.getHours();
      const shift: 'morning' | 'day' | 'evening' | 'night' =
        hour >= 6 && hour < 12 ? 'morning'
        : hour >= 12 && hour < 18 ? 'day'
        : hour >= 18 ? 'evening'
        : 'night';
      type _TimeEntry = { id: string; task: string; shift: string; duration: number; date: string };
      const tEntry: _TimeEntry = { id: `task_${Date.now()}`, task: selected.title, shift, duration: sessionDuration, date: now.toISOString() };
      void loadData<_TimeEntry[]>('time_entries', []).then(existing =>
        saveSynced('time_entries', [tEntry, ...existing]),
      );
    }
  }, [selected]);

  const clearAllFilters = useCallback(() => {
    setFilter('active');
    setSort('deadline');
    setFilterProject(null);
    setFilterPriority(null);
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

  const todayMeetings2 = useMemo(() => {
    // Лише сьогоднішні: завтрашні події тут відволікали від того, що треба
    // зробити зараз. Повний список — на екрані зустрічей.
    //
    // localDateStr, а не toISOString().slice(0,10): друге дає дату в UTC, тож
    // біля півночі «сьогодні» зсувалось на добу.
    const todayStr = localDateStr(today);
    return meetings
      .filter(m => m.date === todayStr)
      .sort((a, b) => {
        const da = `${a.date}T${a.time || '00:00'}`;
        const db = `${b.date}T${b.time || '00:00'}`;
        return da.localeCompare(db);
      });
  }, [meetings]);

  // ─── Meeting CRUD ────────────────────────────────────────────────────────────
  const openAddMeeting = useCallback((presetDate?: string) => {
    setMeetingFormInitial(null);
    setMeetingFormPreset(presetDate);
    setShowMeetingForm(true);
  }, []);

  const openEditMeeting = useCallback((m: Meeting) => {
    setMeetingFormInitial({ id: m.id, title: m.title, date: m.date, time: m.time,
      durationMinutes: m.durationMinutes, location: m.location, link: m.link,
      notes: m.notes, color: m.color, recurrence: m.recurrence });
    setMeetingFormPreset(undefined);
    setShowMeetingForm(true);
  }, []);

  const handleMeetingSave = useCallback((data: MeetingFormData) => {
    if (data.id) {
      setMeetings(p => p.map(m => m.id !== data.id ? m : {
        ...m, title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location,
        link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }));
    } else {
      setMeetings(p => [...p, {
        id: Date.now().toString(), title: data.title, date: data.date, time: data.time,
        durationMinutes: data.durationMinutes, location: data.location,
        link: data.link, notes: data.notes, color: data.color, recurrence: data.recurrence,
      }]);
    }
    setShowMeetingForm(false);
  }, []);

  const deleteMeeting = useCallback((id: string) => {
    Alert.alert(tr.deleteMeeting, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => setMeetings(p => p.filter(m => m.id !== id)) },
    ]);
  }, [tr]);

  const selectedTask = selected ? tasks.find(t => t.id === selected.id) ?? selected : null;

  // Вміст деталі. Однаковий для модалки й для колонки — різниться
  // лише обрамлення, див. TaskDetailPane.
  const detailBody = selectedTask ? (
    <>
                    <View style={s.handleRow}>
                      <View style={{ flex: 1 }}>
                        {!editor.editing && detailTab === 'info' && (
                          <TouchableOpacity
                            onPress={() => {
                              editor.begin(selectedTask, taskColumnId(selectedTask, taskStatuses));
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="pencil" size={17} color={c.sub} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={[s.handle, { backgroundColor: c.border }]} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <TouchableOpacity onPress={() => { setSelected(null); editor.finish(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <IconSymbol name="xmark" size={17} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Tab Switcher */}
                    {!editor.editing && (
                      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 16, backgroundColor: c.dim, borderRadius: 12, padding: 4 }}>
                        {(['info', 'timer', 'history'] as const).map(tab => (
                          <TouchableOpacity
                            key={tab}
                            onPress={() => setDetailTab(tab)}
                            style={{ flex: 1, paddingVertical: 8, borderRadius: 9, backgroundColor: detailTab === tab ? c.accent : 'transparent', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
                            <IconSymbol
                              name={tab === 'info' ? 'list.bullet' : tab === 'timer' ? 'timer' : 'clock.arrow.circlepath'}
                              size={12}
                              color={detailTab === tab ? '#fff' : c.sub}
                            />
                            <Text style={{ color: detailTab === tab ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>
                              {tab === 'info' ? tr.details : tab === 'timer' ? tr.tracker : tr.history}
                            </Text>
                            {tab === 'timer' && isTimerRunning && (
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: detailTab === 'timer' ? '#fff' : '#6366F1' }} />
                            )}
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* ─── Timer Tab ─── */}
                    {!editor.editing && detailTab === 'timer' && (
                      <TaskTimerTab
                        task={selectedTask}
                        running={isTimerRunning}
                        onStart={startTimer}
                        onStop={stopTimer}
                        colors={{ text: c.text, sub: c.sub, border: c.border, dim: c.dim }}
                        tr={tr}
                        locale={locale}
                        fmtClock={fmtClock}
                        fmtDur={fmtDur}
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

                    {editor.editing ? (
                      <TaskEditForm
                        title={tr.editTask}
                        submitLabel={tr.save}
                        editor={editor}
                        taskStatuses={taskStatuses}
                        pickableProjects={pickableProjects}
                        projects={projects}
                        deadlineWeeks={editDlWeeks}
                        priorityMeta={PRIORITY}
                        months={MONTHS_UA}
                        weekdays={WEEKDAYS_SHORT}
                        deadlinePresets={DEADLINE_PRESETS}
                        today={today}
                        onSave={saveTaskEdit}
                        onCancel={editor.finish}
                        colors={c}
                        tr={tr}
                        locale={locale}
                      />
                    ) : detailTab === 'info' ? (
                    <>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                      <AnimatedCheck
                        checked={selectedTask.status === 'done'}
                        color="#10B981"
                        borderColor={c.border}
                        size={22}
                        radius={7}
                        onPress={() => toggleTask(selectedTask.id)}
                        hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={[s.detailTitle, { color: c.text, flex: 1, marginHorizontal: 10 }]}>{selectedTask.title}</Text>
                      <View style={[s.prioBadge, { backgroundColor: PRIORITY[selectedTask.priority].color + '22' }]}>
                        <View style={[s.dot, { backgroundColor: PRIORITY[selectedTask.priority].color }]} />
                        <Text style={{ color: PRIORITY[selectedTask.priority].color, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                          {PRIORITY[selectedTask.priority].label}
                        </Text>
                      </View>
                    </View>

                    {selectedTask.description ? <Text style={[s.detailDesc, { color: c.sub }]}>{selectedTask.description}</Text> : null}

                    {/* Статус: перенести завдання в іншу колонку прямо з деталей.
                        Раніше це вимагало входу в режим редагування, тож
                        перевести «В роботі» в інший статус було нікуди. */}
                    <View style={{ marginTop: 12 }}>
                      <Text style={[s.label, { color: c.sub }]}>{tr.status}</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {taskStatuses.map(column => {
                          const active = taskStatusColumn(selectedTask, taskStatuses).id === column.id;
                          return (
                            <TouchableOpacity
                              key={column.id}
                              onPress={() => setTaskColumn(selectedTask.id, column.id)}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                              accessibilityLabel={column.name}
                              style={{
                                minHeight: 36,
                                flexDirection: 'row',
                                alignItems: 'center',
                                borderRadius: 10,
                                borderWidth: 1,
                                paddingHorizontal: 11,
                                paddingVertical: 8,
                                backgroundColor: active ? column.color + '20' : c.dim,
                                borderColor: active ? column.color : c.border,
                              }}>
                              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: column.color, marginRight: 6 }} />
                              <Text style={{ color: active ? column.color : c.sub, fontSize: 12, fontWeight: active ? '700' : '600' }}>
                                {column.name}
                              </Text>
                              {/* Галочка, а не лише колір: вибраний стан не має
                                  триматись виключно на кольорі. */}
                              {active && <IconSymbol name="checkmark" size={11} color={column.color} style={{ marginLeft: 5 }} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

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

                    {/* Project changer */}
                    {pickableProjects.length > 0 && (
                      <View style={{ marginTop: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <IconSymbol name="folder" size={12} color={c.sub} />
                          <Text style={[s.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0 }]}>{lang === 'uk' ? 'ПРОЕКТ' : 'PROJECT'}</Text>
                        </View>
                        {/* Dropdown trigger */}
                        <TouchableOpacity
                          onPress={() => setShowDetailProjectDropdown(v => !v)}
                          style={[s.dropdownBtn, { backgroundColor: c.dim, borderColor: showDetailProjectDropdown ? c.accent : c.border }]}>
                          {(() => {
                            const sel = projects.find(p => p.id === selectedTask.projectId);
                            return sel ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sel.color }} />
                                <Text style={{ color: sel.color, fontSize: 13, fontWeight: '600', flex: 1 }}>{sel.name}</Text>
                              </View>
                            ) : (
                              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '500', flex: 1 }}>{tr.noProject}</Text>
                            );
                          })()}
                          <IconSymbol name={showDetailProjectDropdown ? 'chevron.up' : 'chevron.down'} size={14} color={c.sub} />
                        </TouchableOpacity>
                        {showDetailProjectDropdown && (
                          <View style={[s.dropdownList, { borderColor: c.border, backgroundColor: c.dim }]}>
                            <TouchableOpacity
                              onPress={() => { updateTaskProject(selectedTask.id, null); setShowDetailProjectDropdown(false); }}
                              style={[s.dropdownItem, { borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: !selectedTask.projectId ? c.accent + '12' : 'transparent' }]}>
                              <Text style={{ color: !selectedTask.projectId ? c.accent : c.sub, fontSize: 13, fontWeight: '600', flex: 1 }}>{tr.noProject}</Text>
                              {!selectedTask.projectId && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                            </TouchableOpacity>
                            {pickableProjects.map((proj, i) => (
                              <TouchableOpacity
                                key={proj.id}
                                onPress={() => { updateTaskProject(selectedTask.id, proj.id); setShowDetailProjectDropdown(false); }}
                                style={[s.dropdownItem, { borderBottomWidth: i < pickableProjects.length - 1 ? 1 : 0, borderBottomColor: c.border, backgroundColor: selectedTask.projectId === proj.id ? proj.color + '12' : 'transparent' }]}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: proj.color, marginRight: 8 }} />
                                <Text style={{ color: selectedTask.projectId === proj.id ? proj.color : c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{proj.name}</Text>
                                {selectedTask.projectId === proj.id && <IconSymbol name="checkmark" size={13} color={proj.color} />}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    <TaskSubtasks
                      task={selectedTask}
                      progressPercent={getProgress(selectedTask)}
                      editingId={editingSubId}
                      editingText={editingSubText}
                      onChangeEditingText={setEditingSubText}
                      onSaveEdit={(subId, text) => saveSubEdit(selectedTask.id, subId, text)}
                      onToggle={subId => toggleSubtask(selectedTask.id, subId)}
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
                        <Text style={{ color: isTimerRunning ? '#6366F1' : '#fff', fontWeight: '700', marginLeft: 7 }}>
                          {isTimerRunning ? `${lang === 'uk' ? 'Таймер' : 'Timer'}: ${fmtClock(totalSecondsIncludingActive(selectedTask))}` : (lang === 'uk' ? 'Запустити таймер' : 'Start timer')}
                        </Text>
                        {isTimerRunning && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#6366F1', marginLeft: 6 }} />}
                      </TouchableOpacity>
                    )}

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
                    </>
                    ) : null}
    </>
  ) : null;

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
                  {sort !== 'deadline' && (
                    <TouchableOpacity
                      onPress={() => setSort('deadline')}
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
                  {filterPriority && (
                    <TouchableOpacity
                      onPress={() => setFilterPriority(null)}
                      style={[s.activeChip, { backgroundColor: PRIORITY[filterPriority].color + '20', borderColor: PRIORITY[filterPriority].color + '50' }]}>
                      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: PRIORITY[filterPriority].color }} />
                      <Text style={[s.activeChipText, { color: PRIORITY[filterPriority].color, marginLeft: 4 }]}>
                        {PRIORITY[filterPriority].label}
                      </Text>
                      <IconSymbol name="xmark" size={10} color={PRIORITY[filterPriority].color} style={{ marginLeft: 4 }} />
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
                    {todayMeetings2.map(mtg => {
                      // Список відфільтрований по сьогодні, тож перевіряти дату
                      // повторно вже нема потреби.
                      const mtgDateObj = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
                      const isPast = mtgDateObj < new Date();
                      const isNow = mtgDateObj <= new Date() && new Date(mtgDateObj.getTime() + mtg.durationMinutes * 60000) > new Date();
                      const dFmt = tr.today;
                      const dur = mtg.durationMinutes >= 60
                        ? `${Math.floor(mtg.durationMinutes / 60)}г${mtg.durationMinutes % 60 ? ` ${mtg.durationMinutes % 60}хв` : ''}`
                        : `${mtg.durationMinutes} хв`;
                      return (
                        <TouchableOpacity key={mtg.id} onPress={() => openEditMeeting(mtg)} activeOpacity={0.75}>
                          <View style={{ borderRadius: 11, paddingVertical: 7, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden', opacity: isPast && !isNow ? 0.4 : 1, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
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
                  </View>
                )}
              </View>
            )}

            {/* Empty state */}
            {filtered.length === 0 && (
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
                  {overdueItems.map((task, i) => {
                    const animEntering = motion.entering(FadeInDown.duration(200).delay(Math.min(i, 10) * 40));
                    const animExiting  = motion.entering(FadeOutUp.duration(150));
                    const animLayout   = motion.entering(LinearTransition.springify());
                    return (
                      <Animated.View
                        key={task.id}
                        entering={animEntering}
                        exiting={animExiting}
                        layout={animLayout}>
                        <CompactCard
                          task={task}
                          statusColumn={taskStatusColumn(task, taskStatuses)}
                          onPress={handleSelectTask}
                          onToggle={handleToggleTask}
                          c={c}
                          isDark={isDark}
                          projects={projects}
                          overdueLabel={tr.overdueSection}
                          priorityLabel={PRIORITY[task.priority].label}
                          subtasksLabel={tr.subtasks}
                        />
                      </Animated.View>
                    );
                  })}
                </View>
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
      priorityMeta={PRIORITY}
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
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.tasks}</Text>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <TouchableOpacity
                onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={viewMode === 'list' ? tr.calendarMode : tr.listMode}
                style={[s.headerBtn, { backgroundColor: viewMode === 'calendar' ? c.accent + '20' : c.dim, borderColor: viewMode === 'calendar' ? c.accent : c.border }]}>
                <IconSymbol name={viewMode === 'list' ? 'calendar' : 'list.bullet'} size={17} color={viewMode === 'calendar' ? c.accent : c.sub} />
              </TouchableOpacity>
              {viewMode === 'list' && (
                <TouchableOpacity
                  onPress={() => (hasActiveFilters ? clearAllFilters() : setShowFilterSheet(true))}
                  onLongPress={() => setShowFilterSheet(true)}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={hasActiveFilters ? tr.resetAllFilters : tr.filters}
                  accessibilityHint={hasActiveFilters ? tr.filters : undefined}
                  style={[s.headerBtn, {
                    backgroundColor: hasActiveFilters ? '#EF444418' : c.dim,
                    borderColor: hasActiveFilters ? '#EF444440' : c.border,
                  }]}>
                  {/* Два стани в одній кнопці: відкрити фільтри або скинути їх.
                      Коли фільтри активні, короткий тап скидає, довгий — усе
                      одно відкриває налаштування, щоб доступ до них не зникав. */}
                  <IconSymbol
                    name={hasActiveFilters ? 'arrow.counterclockwise' : 'line.3.horizontal.decrease'}
                    size={17}
                    color={hasActiveFilters ? '#EF4444' : c.sub}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowOptionsMenu(v => !v)}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={tr.a11yOptions}
                style={[s.headerBtn, { backgroundColor: hasActiveFilters ? c.accent : c.dim, borderColor: hasActiveFilters ? c.accent : c.border }]}>
                <IconSymbol name="ellipsis" size={17} color={hasActiveFilters ? '#fff' : c.sub} />
              </TouchableOpacity>
            </View>
          </View>
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
        </View>

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
            renderSectionHeader={({ section }) => (
              <Text style={[s.groupLabel, { color: c.sub }]}>{section.title}</Text>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
            renderItem={({ item, index }) => (
              <TaskListItem
                task={item}
                index={index}
                animate={shouldAnimateTask(item.id)}
                motion={motion}
                statusColumn={taskStatusColumn(item, taskStatuses)}
                onPress={handleSelectTask}
                onToggle={handleToggleTask}
                c={c}
                isDark={isDark}
                projects={projects}
                overdueLabel={tr.overdueSection}
                priorityLabel={PRIORITY[item.priority].label}
                subtasksLabel={tr.subtasks}
              />
            )}
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
      </SafeAreaView>

      {/* FAB */}
      <PressableScale onPress={() => { haptic.medium(); setShowAdd(true); }} scaleTo={0.92} style={[s.fab, { bottom: tabBarInset + 20, backgroundColor: c.accent }]}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </PressableScale>
      </View>

        <TaskDetailPane
          open={!!selectedTask}
          wide={showDetailColumn}
          onClose={() => setSelected(null)}
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
          {detailBody}
        </TaskDetailPane>
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
        tr={{}}
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
                          <TouchableOpacity key={mtg.id} onPress={() => { setCalPopupDate(null); openEditMeeting(mtg); }} activeOpacity={0.75}>
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
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: PRIORITY[task.priority].color }} />
                          <Text style={{ color: c.sub, fontSize: 11 }}>{PRIORITY[task.priority].label}</Text>
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
              top: insets.top + 62,
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
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
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
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['high', 'medium', 'low'] as Priority[]).map(p => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setFilterPriority(filterPriority === p ? null : p)}
                      style={[s.filterSegBtn, { flex: 1, backgroundColor: filterPriority === p ? PRIORITY[p].color + '25' : c.dim, borderColor: filterPriority === p ? PRIORITY[p].color : c.border }]}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PRIORITY[p].color }} />
                      <Text style={{ color: filterPriority === p ? PRIORITY[p].color : c.sub, fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                        {PRIORITY[p].label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
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
              deadlineWeeks={dlWeeks}
              priorityMeta={PRIORITY}
              months={MONTHS_UA}
              weekdays={WEEKDAYS_SHORT}
              deadlinePresets={DEADLINE_PRESETS}
              today={today}
              onSave={addTask}
              onCancel={() => { composer.reset(ACTIVE_COLUMN_ID); setShowAdd(false); }}
              colors={c}
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
            <Text style={{ fontSize: 28, fontWeight: '800', color: isRecording ? '#EF4444' : c.accent,
              letterSpacing: 2, marginBottom: 24, fontVariant: ['tabular-nums'] }}>
              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
            </Text>
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
const AnimatedText = Animated.createAnimatedComponent(Text);

/**
 * Рядок списку: анімаційна обгортка навколо картки.
 *
 * Окремий компонент, щоб renderItem не створював елементи анімації
 * заново — і щоб memo нижче мала що порівнювати.
 */
const TaskListItem = React.memo(function TaskListItem({
  task, index, animate, motion, statusColumn, onPress, onToggle,
  c, isDark, projects, overdueLabel, priorityLabel, subtasksLabel,
}: {
  task: Task;
  index: number;
  animate: boolean;
  motion: ReturnType<typeof useMotion>;
  statusColumn: TaskStatusColumn;
  onPress: (task: Task) => void;
  onToggle: (task: Task) => void;
  c: any;
  isDark: boolean;
  projects: Project[];
  overdueLabel: string;
  priorityLabel: string;
  subtasksLabel: string;
}) {
  return (
    <Animated.View
      entering={animate ? motion.entering(FadeInDown.duration(200).delay(Math.min(index, 10) * 40)) : undefined}
      exiting={motion.entering(FadeOutUp.duration(150))}
      layout={motion.entering(LinearTransition.springify())}>
      <CompactCard
        task={task}
        statusColumn={statusColumn}
        onPress={onPress}
        onToggle={onToggle}
        c={c}
        isDark={isDark}
        projects={projects}
        overdueLabel={overdueLabel}
        priorityLabel={priorityLabel}
        subtasksLabel={subtasksLabel}
      />
    </Animated.View>
  );
});

/**
 * Мемоізована: у списку її примірників стільки ж, скільки завдань, а екран
 * перемальовується щосекунди, поки йде таймер. Щоб memo працювала,
 * колбеки приймають завдання аргументом — інакше виклик довелося б
 * загортати в стрілку, нову при кожному рендері.
 */
const CompactCard = React.memo(function CompactCard({ task, statusColumn, onPress, onToggle, c, isDark, projects, overdueLabel, priorityLabel, subtasksLabel }: {
  task: Task;
  statusColumn: TaskStatusColumn;
  /** Завдання приходить аргументом, щоб екран міг тримати колбек стабільним. */
  onPress: (task: Task) => void;
  onToggle: (task: Task) => void;
  c: any;
  isDark: boolean;
  projects: Project[];
  /** Для VoiceOver: стан «прострочено» інакше ніяк не озвучується. */
  overdueLabel: string;
  /** Те саме для пріоритету — він переданий лише кольоровою крапкою. */
  priorityLabel: string;
  /** Підпис до лічильника: «2/5» саме по собі нічого не означає. */
  subtasksLabel: string;
}) {
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  const isDone = task.status === 'done';
  const doneSubtasks = task.subtasks.filter(sub => sub.done).length;
  const allSubtasksDone = task.subtasks.length > 0 && doneSubtasks === task.subtasks.length;

  /* Animate text opacity when done state changes */
  const titleOpacity = useSharedValue(isDone ? 0.45 : 1);
  useEffect(() => {
    titleOpacity.value = withTiming(isDone ? 0.45 : 1, { duration: 250 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);
  const titleAnimStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  // Опис рядка для VoiceOver: інакше озвучувалась лише назва, а статус,
  // дедлайн, пріоритет і проєкт передавались виключно кольором.
  // Дата тут не озвучується, бо її не видно: опис має відповідати тому, що
  // на екрані. Прострочення лишається — це стан, а не дата, і саме воно
  // потребує уваги.
  const a11ySummary = [
    task.title,
    statusColumn.name,
    task.subtasks.length > 0 ? `${subtasksLabel}: ${doneSubtasks}/${task.subtasks.length}` : null,
    overdue ? overdueLabel : null,
    priorityLabel,
    proj?.name,
  ].filter(Boolean).join(', ');

  return (
    <PressableScale onPress={() => onPress(task)}>
      <BlurView
        intensity={isDark ? 18 : 35}
        tint={isDark ? 'dark' : 'light'}
        style={s.compactCard}
        accessibilityRole="button"
        accessibilityLabel={a11ySummary}>
        <AnimatedCheck
          checked={isDone}
          color="#10B981"
          borderColor={c.border}
          size={18}
          radius={5}
          onPress={() => onToggle(task)}
          hitSlop={{ top: 13, bottom: 13, left: 13, right: 13 }}
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}
          accessibilityState={{ checked: isDone }}
          style={{ marginTop: 1 }}
        />

        {/* Два рядки: назва зверху на всю ширину, статус і проєкт під нею.
            В один рядок назва змагалася за місце з рештою і обрізалась першою,
            хоча вона тут найважливіша. Дату свідомо не показуємо — компактний
            вигляд для швидкого перегляду списку, дедлайн видно в повному. */}
        <View style={{ flex: 1, marginHorizontal: 10, gap: 4 }}>
          <AnimatedText
            style={[{ color: c.text, fontSize: 14, fontWeight: '600', textDecorationLine: isDone ? 'line-through' : 'none' } as any, titleAnimStyle]}
            numberOfLines={2}>
            {task.title}
          </AnimatedText>

          <View
            style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}
            importantForAccessibility="no-hide-descendants">
            <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: statusColumn.color + '16' }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusColumn.color, marginRight: 4 }} />
              <Text numberOfLines={1} style={{ color: statusColumn.color, fontSize: 10, fontWeight: '700' }}>{statusColumn.name}</Text>
            </View>

            {proj && (
              <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: proj.color + '16' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: proj.color, marginRight: 4 }} />
                <Text numberOfLines={1} style={{ color: proj.color, fontSize: 10, fontWeight: '600', maxWidth: 110 }}>{proj.name}</Text>
              </View>
            )}

            {/* Виконані підзавдання. Показуємо лише коли вони є: «0/0» на
                завданні без підзавдань — це шум, а не інформація. */}
            {task.subtasks.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <IconSymbol
                  name={allSubtasksDone ? 'checkmark.circle.fill' : 'list.bullet'}
                  size={10}
                  color={allSubtasksDone ? '#10B981' : c.sub}
                />
                <Text style={{
                  color: allSubtasksDone ? '#10B981' : c.sub,
                  fontSize: 10, fontWeight: '600', fontVariant: ['tabular-nums'],
                }}>
                  {doneSubtasks}/{task.subtasks.length}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Лишається лише пріоритет: проєкт тепер підписаний словом нижче,
            тож друга безіменна крапка стала зайвою. */}
        <View style={{ alignItems: 'center', justifyContent: 'center' }} importantForAccessibility="no-hide-descendants">
          <View style={[s.dot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
        </View>
      </BlurView>
    </PressableScale>
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
  pageTitle:      { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:      { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
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
  // minHeight 44 — мінімальна ціль дотику (Apple HIG). Було ~38: рядок цілком
  // клікабельний, тож він мусить відповідати нормі, а не лише чекбокс у ньому.
  compactCard:    { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, overflow: 'hidden', flexDirection: 'row', alignItems: 'flex-start' },
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
  detailDesc:     { fontSize: 13, lineHeight: 19, paddingLeft: 32, marginBottom: 4, opacity: 0.7 },
  input:          { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:          { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  priorityBtn:    { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  prioBadge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
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
