import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthPicker } from '@/components/shared/MonthPicker';
import { MeetingFormSheet, MeetingFormData, RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { cancelReminder, scheduleReminder } from '@/store/notifications';
import { filterTasksByMonth } from '@/utils/taskUtils';
import type { Project } from '../projects';

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';
type SortBy = 'priority' | 'newest' | 'oldest' | 'name' | 'deadline';
type Filter = 'all' | 'active' | 'done';
type ViewMode = 'list' | 'calendar';
type CalSpan = 'week' | 'month' | 'quarter' | 'year';
type CardDetail = 'compact' | 'detailed';

interface SubTask { id: string; title: string; done: boolean; reminderAt?: string; }

interface TaskTimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number; // seconds
}

type HistoryEventType = 'created' | 'edited' | 'done' | 'active' | 'timer_start' | 'timer_stop' | 'subtask_add' | 'subtask_done' | 'subtask_undone';

interface TaskHistoryEvent {
  id: string;
  at: string;
  type: HistoryEventType;
  note?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  subtasks: SubTask[];
  createdAt: string;
  estimatedMinutes?: number;
  deadline?: string;
  projectId?: string;
  reminderAt?: string;
  timeEntries?: TaskTimeEntry[];
  history?: TaskHistoryEvent[];
  recurrence?: RecurrenceRule;
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

function deadlineDiff(iso: string): number {
  const d = new Date(iso); d.setHours(23, 59, 59, 999);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function deadlineColor(task: Task, fallback: string): string {
  if (!task.deadline || task.status === 'done') return fallback;
  const diff = deadlineDiff(task.deadline);
  if (diff < 0) return '#EF4444';
  if (diff <= 1) return '#F59E0B';
  return fallback;
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

function getActiveTimerEntry(task: Task): TaskTimeEntry | undefined {
  return (task.timeEntries ?? []).find(e => !e.endedAt);
}

function calcElapsedSeconds(task: Task): number {
  return (task.timeEntries ?? []).reduce((acc, e) => {
    if (e.endedAt) return acc + e.duration;
    return acc + Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 1000);
  }, 0);
}

function getTotalTrackedSeconds(task: Task): number {
  return (task.timeEntries ?? []).reduce((acc, e) => acc + (e.endedAt ? e.duration : 0), 0);
}

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


function historyEventIcon(type: HistoryEventType): string {
  switch (type) {
    case 'created':        return 'plus.circle.fill';
    case 'edited':         return 'pencil.circle.fill';
    case 'done':           return 'checkmark.circle.fill';
    case 'active':         return 'arrow.counterclockwise.circle.fill';
    case 'timer_start':    return 'play.circle.fill';
    case 'timer_stop':     return 'stop.circle.fill';
    case 'subtask_add':    return 'plus.square.fill';
    case 'subtask_done':   return 'checkmark.square.fill';
    case 'subtask_undone': return 'square.dashed';
  }
}

function historyEventColor(type: HistoryEventType): string {
  switch (type) {
    case 'created':        return '#10B981';
    case 'edited':         return '#F59E0B';
    case 'done':           return '#10B981';
    case 'active':         return '#6366F1';
    case 'timer_start':    return '#6366F1';
    case 'timer_stop':     return '#EF4444';
    case 'subtask_add':    return '#0EA5E9';
    case 'subtask_done':   return '#10B981';
    case 'subtask_undone': return '#F59E0B';
  }
}

export default function TasksScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

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
  const HISTORY_LABELS: Record<HistoryEventType, string> = {
    created:        lang === 'uk' ? 'Завдання створено'     : 'Task created',
    edited:         lang === 'uk' ? 'Завдання відредаговано': 'Task edited',
    done:           lang === 'uk' ? 'Завдання виконано'     : 'Task completed',
    active:         lang === 'uk' ? 'Завдання відновлено'   : 'Task restored',
    timer_start:    lang === 'uk' ? 'Таймер запущено'       : 'Timer started',
    timer_stop:     lang === 'uk' ? 'Таймер зупинено'       : 'Timer stopped',
    subtask_add:    lang === 'uk' ? 'Підзавдання додано'    : 'Subtask added',
    subtask_done:   lang === 'uk' ? 'Підзавдання виконано'  : 'Subtask completed',
    subtask_undone: lang === 'uk' ? 'Підзавдання відновлено': 'Subtask restored',
  };

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortBy>('deadline');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [cardDetail, setCardDetail] = useState<CardDetail>('compact');

  // Search & extra filters
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newEstHours, setNewEstHours] = useState('');
  const [newEstMins, setNewEstMins] = useState('');
  const [newDeadline, setNewDeadline] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [showNewProjectDropdown, setShowNewProjectDropdown] = useState(false);
  const [showDetailProjectDropdown, setShowDetailProjectDropdown] = useState(false);
  const [showDeadlineCal, setShowDeadlineCal] = useState(false);
  const [deadlineCalYear, setDeadlineCalYear] = useState(today.getFullYear());
  const [deadlineCalMonth, setDeadlineCalMonth] = useState(today.getMonth());

  // Recurrence for add task
  const [newRepeat, setNewRepeat] = useState(false);
  const [newRepeatFreq, setNewRepeatFreq] = useState<RecurrenceRule['freq']>('weekly');
  const [newRepeatInterval, setNewRepeatInterval] = useState(1);
  const [newRepeatDays, setNewRepeatDays] = useState<number[]>([]);
  const [newRepeatEndType, setNewRepeatEndType] = useState<'never' | 'until'>('never');
  const [newRepeatUntil, setNewRepeatUntil] = useState('');

  const [selected, setSelected] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');
  const detailScrollRef = useRef<ScrollView>(null);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  // Calendar view state
  const [calSpan, setCalSpan] = useState<CalSpan>('month');
  const [calViewDate, setCalViewDate] = useState<Date>(new Date());
  const [calPopupDate, setCalPopupDate] = useState<Date | null>(null);
  const [calWeekDay, setCalWeekDay] = useState<Date>(new Date());

  // Meetings state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsInit, setMeetingsInit] = useState(false);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingFormInitial, setMeetingFormInitial] = useState<MeetingFormData | null>(null);
  const [meetingFormPreset, setMeetingFormPreset] = useState<string | undefined>(undefined);

  // Inline subtask editing (no nested Modal — prevents iOS freeze)
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubText, setEditingSubText] = useState('');

  // Task editing state
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('medium');
  const [editEstHours, setEditEstHours] = useState('');
  const [editEstMins, setEditEstMins] = useState('');
  const [editDeadline, setEditDeadline] = useState<string | null>(null);
  const [showEditDeadlineCal, setShowEditDeadlineCal] = useState(false);
  const [editDeadlineCalYear, setEditDeadlineCalYear] = useState(today.getFullYear());
  const [editDeadlineCalMonth, setEditDeadlineCalMonth] = useState(today.getMonth());
  const [showEditProjectDropdown, setShowEditProjectDropdown] = useState(false);

  // Recurrence for edit task
  const [editRepeat, setEditRepeat] = useState(false);
  const [editRepeatFreq, setEditRepeatFreq] = useState<RecurrenceRule['freq']>('weekly');
  const [editRepeatInterval, setEditRepeatInterval] = useState(1);
  const [editRepeatDays, setEditRepeatDays] = useState<number[]>([]);
  const [editRepeatEndType, setEditRepeatEndType] = useState<'never' | 'until'>('never');
  const [editRepeatUntil, setEditRepeatUntil] = useState('');

  // Reminder picker state (shown inline in detail modal)
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [reminderPickerTarget, setReminderPickerTarget] = useState<{ taskId: string; subtaskId?: string } | null>(null);
  const [reminderHours, setReminderHours] = useState('');
  const [reminderMins, setReminderMins] = useState('');
  const [reminderDate, setReminderDate] = useState<string | null>(null);

  // Detail tab + timer display
  const [detailTab, setDetailTab] = useState<'info' | 'timer' | 'history'>('info');
  const [timerTick, setTimerTick] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async () => {
    const [t, p, m] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Project[]>('projects', []),
      loadData<Meeting[]>('meetings', []),
    ]);
    setTasks(t);
    setProjects(p);
    setMeetings(m);
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

  // Save to storage
  useEffect(() => {
    if (initialized) saveData('tasks', tasks);
  }, [tasks, initialized]);

  useEffect(() => {
    if (meetingsInit) saveData('meetings', meetings);
  }, [meetings, meetingsInit]);

  // Reset detail tab when opening a different task
  useEffect(() => {
    setDetailTab('info');
    setShowReminderPicker(false);
  }, [selected?.id]);

  // AppState listener — refresh timer display when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTimerTick(t => t + 1);
    });
    return () => sub.remove();
  }, []);

  // Timer interval — run while selected task has active timer entry
  const selectedTaskForTimer = selected ? tasks.find(t => t.id === selected.id) : null;
  const isTimerRunning = selectedTaskForTimer ? !!getActiveTimerEntry(selectedTaskForTimer) : false;

  useEffect(() => {
    if (isTimerRunning) {
      timerIntervalRef.current = setInterval(() => setTimerTick(t => t + 1), 1000);
    } else {
      if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    }
    return () => { if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; } };
  }, [isTimerRunning]);

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
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
      }
      if (filterProject && t.projectId !== filterProject) return false;
      if (filterPriority && t.priority !== filterPriority) return false;
      return true;
    });
  }, [sorted, activeMonth, filter, dateFilter, search, filterProject, filterPriority]);

  const groups = useMemo(() => {
    const map: Record<string, { label: string; tasks: Task[] }> = {};
    const order: string[] = [];
    filtered.forEach(t => {
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
  }, [filtered, sort]);

  const hasActiveFilters = filter !== 'active' || sort !== 'deadline' || !!dateFilter || !!filterProject || !!filterPriority || !!search.trim();

  const addTask = useCallback(() => {
    if (!newTitle.trim()) return;
    const estH = parseInt(newEstHours || '0', 10);
    const estM = parseInt(newEstMins || '0', 10);
    const estimatedMinutes = estH * 60 + estM || undefined;
    const recurrence: RecurrenceRule | undefined = newRepeat ? {
      freq: newRepeatFreq,
      interval: newRepeatInterval,
      daysOfWeek: newRepeatFreq === 'weekly' && newRepeatDays.length > 0 ? newRepeatDays : undefined,
      until: newRepeatEndType === 'until' && newRepeatUntil ? newRepeatUntil : undefined,
    } : undefined;
    setTasks(p => [{
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      priority: newPriority,
      status: 'active',
      subtasks: [],
      createdAt: new Date().toISOString(),
      estimatedMinutes,
      deadline: newDeadline ?? undefined,
      projectId: newProjectId ?? undefined,
      timeEntries: [],
      history: [makeHistoryEvent('created')],
      recurrence,
    }, ...p]);
    setNewTitle(''); setNewDesc(''); setNewPriority('medium');
    setNewEstHours(''); setNewEstMins(''); setNewDeadline(null);
    setNewProjectId(null); setShowDeadlineCal(false); setShowNewProjectDropdown(false); setShowAdd(false);
    setNewRepeat(false); setNewRepeatFreq('weekly'); setNewRepeatInterval(1);
    setNewRepeatDays([]); setNewRepeatEndType('never'); setNewRepeatUntil('');
  }, [newTitle, newDesc, newPriority, newEstHours, newEstMins, newDeadline, newProjectId,
      newRepeat, newRepeatFreq, newRepeatInterval, newRepeatDays, newRepeatEndType, newRepeatUntil]);

  const deleteTask = useCallback((id: string) => {
    setTasks(p => p.filter(t => t.id !== id));
    if (selected?.id === id) { setSelected(null); setShowDetailProjectDropdown(false); }
  }, [selected]);

  const toggleTask = useCallback((id: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
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
        ...t, status,
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
  }, []);

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

  const saveTaskEdit = useCallback(() => {
    if (!editTitle.trim() || !selected) return;
    const estH = parseInt(editEstHours || '0', 10);
    const estM = parseInt(editEstMins || '0', 10);
    const estimatedMinutes = estH * 60 + estM || undefined;
    const recurrence: RecurrenceRule | undefined = editRepeat ? {
      freq: editRepeatFreq,
      interval: editRepeatInterval,
      daysOfWeek: editRepeatFreq === 'weekly' && editRepeatDays.length > 0 ? editRepeatDays : undefined,
      until: editRepeatEndType === 'until' && editRepeatUntil ? editRepeatUntil : undefined,
    } : undefined;
    const patch = (t: Task): Task => t.id !== selected.id ? t : {
      ...t,
      title: editTitle.trim(),
      description: editDesc.trim(),
      priority: editPriority,
      estimatedMinutes,
      deadline: editDeadline ?? undefined,
      recurrence,
      history: [...(t.history ?? []), makeHistoryEvent('edited')],
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === selected.id ? patch(prev) : prev);
    setIsEditingTask(false);
    setShowEditDeadlineCal(false);
    setShowEditProjectDropdown(false);
  }, [editTitle, editDesc, editPriority, editEstHours, editEstMins, editDeadline, selected,
      editRepeat, editRepeatFreq, editRepeatInterval, editRepeatDays, editRepeatEndType, editRepeatUntil]);

  const openReminderPicker = useCallback((taskId: string, subtaskId?: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const existing = subtaskId
      ? task.subtasks.find(s => s.id === subtaskId)?.reminderAt
      : task.reminderAt;
    if (existing) {
      const d = new Date(existing);
      setReminderHours(String(d.getHours()).padStart(2, '0'));
      setReminderMins(String(d.getMinutes()).padStart(2, '0'));
      setReminderDate(existing);
    } else {
      const now = new Date();
      now.setMinutes(now.getMinutes() + 30, 0, 0);
      setReminderHours(String(now.getHours()).padStart(2, '0'));
      setReminderMins(String(now.getMinutes()).padStart(2, '0'));
      setReminderDate(now.toISOString());
    }
    setReminderPickerTarget({ taskId, subtaskId });
    setShowReminderPicker(true);
  }, [tasks]);

  const saveReminder = useCallback(async () => {
    if (!reminderPickerTarget) return;
    const { taskId, subtaskId } = reminderPickerTarget;
    const h = Math.max(0, Math.min(23, parseInt(reminderHours || '0', 10)));
    const m = Math.max(0, Math.min(59, parseInt(reminderMins || '0', 10)));
    const base = reminderDate ? new Date(reminderDate) : new Date();
    base.setHours(h, m, 0, 0);
    if (base <= new Date()) {
      base.setDate(base.getDate() + 1);
    }
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
    setTasks(p => p.map(t => {
      if (t.id !== selected.id) return t;
      const timeEntries = (t.timeEntries ?? []).map(e => {
        if (e.endedAt) return e;
        const duration = Math.max(0, Math.floor((now.getTime() - new Date(e.startedAt).getTime()) / 1000));
        return { ...e, endedAt: now.toISOString(), duration };
      });
      return { ...t, timeEntries, history: [...(t.history ?? []), evt] };
    }));
  }, [selected]);

  const clearAllFilters = useCallback(() => {
    setFilter('active');
    setSort('deadline');
    setFilterProject(null);
    setFilterPriority(null);
    setDateFilter(null);
    setSearch('');
  }, []);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  // Calendar helpers (filter calendar)
  const firstDay = (() => { const d = new Date(calYear, calMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) calCells.push(i);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calWeeks = chunk(calCells, 7);

  // Deadline calendar helpers
  const dlFirstDay = (() => { const d = new Date(deadlineCalYear, deadlineCalMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const dlDaysInMonth = new Date(deadlineCalYear, deadlineCalMonth + 1, 0).getDate();
  const dlCells: (number | null)[] = [];
  for (let i = 0; i < dlFirstDay; i++) dlCells.push(null);
  for (let i = 1; i <= dlDaysInMonth; i++) dlCells.push(i);
  while (dlCells.length % 7 !== 0) dlCells.push(null);
  const dlWeeks = chunk(dlCells, 7);

  // Edit deadline calendar helpers
  const editDlFirstDay = (() => { const d = new Date(editDeadlineCalYear, editDeadlineCalMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const editDlDaysInMonth = new Date(editDeadlineCalYear, editDeadlineCalMonth + 1, 0).getDate();
  const editDlCells: (number | null)[] = [];
  for (let i = 0; i < editDlFirstDay; i++) editDlCells.push(null);
  for (let i = 1; i <= editDlDaysInMonth; i++) editDlCells.push(i);
  while (editDlCells.length % 7 !== 0) editDlCells.push(null);
  const editDlWeeks = chunk(editDlCells, 7);

  // ─── Calendar View helpers ──────────────────────────────────────────────────
  const weekMonday = useMemo(() => {
    const d = new Date(calViewDate);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
  }, [calViewDate]);

  const calHeaderLabel = useMemo(() => {
    if (calSpan === 'week') {
      const d = new Date(weekMonday);
      const end = new Date(d); end.setDate(d.getDate() + 6);
      const fmt = (dt: Date) => dt.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' });
      return `${fmt(d)} – ${fmt(end)}`;
    }
    if (calSpan === 'month') return `${MONTHS_UA[calViewDate.getMonth()]} ${calViewDate.getFullYear()}`;
    if (calSpan === 'quarter') {
      const q = Math.floor(calViewDate.getMonth() / 3) + 1;
      return `${ ['I','II','III','IV'][q-1] } квартал ${calViewDate.getFullYear()}`;
    }
    return String(calViewDate.getFullYear());
  }, [calSpan, calViewDate, weekMonday]);

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

  const calPrev = useCallback(() => {
    setCalViewDate(d => {
      const nd = new Date(d);
      if (calSpan === 'week') nd.setDate(nd.getDate() - 7);
      else if (calSpan === 'month') nd.setMonth(nd.getMonth() - 1);
      else if (calSpan === 'quarter') nd.setMonth(nd.getMonth() - 3);
      else nd.setFullYear(nd.getFullYear() - 1);
      return nd;
    });
    if (calSpan === 'week') setCalWeekDay(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 7); return nd; });
  }, [calSpan]);

  const calNext = useCallback(() => {
    setCalViewDate(d => {
      const nd = new Date(d);
      if (calSpan === 'week') nd.setDate(nd.getDate() + 7);
      else if (calSpan === 'month') nd.setMonth(nd.getMonth() + 1);
      else if (calSpan === 'quarter') nd.setMonth(nd.getMonth() + 3);
      else nd.setFullYear(nd.getFullYear() + 1);
      return nd;
    });
    if (calSpan === 'week') setCalWeekDay(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 7); return nd; });
  }, [calSpan]);

  // ─── Meetings computed ──────────────────────────────────────────────────────
  const meetingsByDate = useMemo(() => {
    const map: Record<string, Meeting[]> = {};
    meetings.forEach(m => {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    });
    return map;
  }, [meetings]);

  const upcomingMeetings = useMemo(() => {
    const todayStr = today.toISOString().slice(0, 10);
    const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    return meetings
      .filter(m => m.date === todayStr || m.date === tomorrowStr)
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

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.tasks}</Text>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <TouchableOpacity
                onPress={() => setViewMode(v => v === 'list' ? 'calendar' : 'list')}
                style={[s.headerBtn, { backgroundColor: viewMode === 'calendar' ? c.accent + '20' : c.dim, borderColor: viewMode === 'calendar' ? c.accent : c.border }]}>
                <IconSymbol name={viewMode === 'list' ? 'calendar' : 'list.bullet'} size={17} color={viewMode === 'calendar' ? c.accent : c.sub} />
              </TouchableOpacity>
              {viewMode === 'list' && (
                <TouchableOpacity
                  onPress={() => setCardDetail(v => v === 'detailed' ? 'compact' : 'detailed')}
                  style={[s.headerBtn, { backgroundColor: cardDetail === 'detailed' ? c.accent + '20' : c.dim, borderColor: cardDetail === 'detailed' ? c.accent : c.border }]}>
                  <IconSymbol name={cardDetail === 'detailed' ? 'rectangle.stack.fill' : 'rectangle.stack'} size={17} color={cardDetail === 'detailed' ? c.accent : c.sub} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setShowOptionsMenu(v => !v)}
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

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          }>

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
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginBottom: 2 }}>
              Сьогодні · {today.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long' })}
            </Text>
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
                <IconSymbol name="calendar.circle.fill" size={16} color="#6366F1" />
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginLeft: 6, flex: 1 }}>{tr.meetings}</Text>
                {upcomingMeetings.length > 0 && (
                  <View style={{ backgroundColor: '#6366F120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 }}>
                    <Text style={{ color: '#6366F1', fontSize: 11, fontWeight: '700' }}>{upcomingMeetings.length}</Text>
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => openAddMeeting()}
                  style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: '#6366F118', borderWidth: 1, borderColor: '#6366F130', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="plus" size={14} color="#6366F1" />
                </TouchableOpacity>
              </View>

              {upcomingMeetings.length === 0 ? (
                <TouchableOpacity onPress={() => openAddMeeting()} activeOpacity={0.7}
                  style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 10, gap: 8 }}>
                  <IconSymbol name="calendar.badge.plus" size={16} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500' }}>{tr.addMeeting}</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ gap: 4 }}>
                  {upcomingMeetings.map(mtg => {
                    const todayStr2 = today.toISOString().slice(0, 10);
                    const tomorrowStr2 = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
                    const isMtgToday = mtg.date === todayStr2;
                    const mtgDateObj = new Date(`${mtg.date}T${mtg.time || '00:00'}`);
                    const isPast = isMtgToday && mtgDateObj < new Date();
                    const isNow = mtgDateObj <= new Date() && new Date(mtgDateObj.getTime() + mtg.durationMinutes * 60000) > new Date();
                    const dFmt = isMtgToday ? tr.today : mtg.date === tomorrowStr2 ? tr.tomorrow : mtgDateObj.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' });
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
                {search.trim() ? tr.nothingFound : tr.noTasks}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>
                {search.trim() ? tr.tryAnotherQuery : tr.pressToAdd}
              </Text>
            </View>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && groups.map(group => (
            <View key={group.label}>
              <Text style={[s.groupLabel, { color: c.sub }]}>{group.label}</Text>
              <View style={{ gap: cardDetail === 'compact' ? 6 : 10 }}>
                {group.tasks.map(task => {
                  if (cardDetail === 'compact') {
                    return (
                      <CompactCard
                        key={task.id}
                        task={task}
                        onPress={() => setSelected(task)}
                        onToggle={() => toggleTask(task.id)}
                        c={c}
                        isDark={isDark}
                        projects={projects}
                        todayLabel={tr.today}
                        yesterdayLabel={tr.yesterday}
                        tomorrowLabel={tr.tomorrow}
                        locale={locale}
                      />
                    );
                  }
                  const prog = getProgress(task);
                  const overdue = isOverdue(task);
                  const dlColor = deadlineColor(task, c.sub);
                  const dlBg = task.deadline && task.status !== 'done'
                    ? (overdue ? '#EF444418' : deadlineDiff(task.deadline) <= 1 ? '#F59E0B18' : c.dim)
                    : c.dim;
                  const dlBorder = task.deadline && task.status !== 'done'
                    ? (overdue ? '#EF444440' : deadlineDiff(task.deadline) <= 1 ? '#F59E0B40' : c.border)
                    : c.border;
                  const cardBorder = overdue ? '#EF444450'
                    : (task.deadline && task.status !== 'done' && deadlineDiff(task.deadline) <= 1) ? '#F59E0B50'
                    : c.border;
                  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                  const prioColor = PRIORITY[task.priority].color;
                  return (
                    <TouchableOpacity key={task.id} activeOpacity={0.75} onPress={() => setSelected(task)}>
                      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[s.taskCard, { borderColor: cardBorder }]}>
                        {/* Priority accent stripe */}
                        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: task.status === 'done' ? '#10B981' : prioColor, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />

                        <View style={{ marginLeft: 8 }}>
                          {/* Row 1: checkbox + title */}
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 }}>
                            <TouchableOpacity
                              onPress={e => { e.stopPropagation(); toggleTask(task.id); }}
                              style={[s.checkbox, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent', marginTop: 1 }]}>
                              {task.status === 'done' && <IconSymbol name="checkmark" size={12} color="#fff" />}
                            </TouchableOpacity>
                            <Text style={[s.taskTitle, { color: c.text, flex: 1, marginLeft: 10, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none', lineHeight: 20 }]}>
                              {task.title}
                            </Text>
                          </View>

                          {/* Row 2: meta badges */}
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 32, marginBottom: 9 }}>
                            {/* Priority */}
                            <View style={[s.badge, { backgroundColor: prioColor + '18', borderColor: prioColor + '40' }]}>
                              <View style={[s.dot, { backgroundColor: prioColor, width: 6, height: 6 }]} />
                              <Text style={{ color: prioColor, fontSize: 10, fontWeight: '700', marginLeft: 4 }}>{PRIORITY[task.priority].label}</Text>
                            </View>
                            {/* Project */}
                            {proj && (
                              <View style={[s.badge, { backgroundColor: proj.color + '18', borderColor: proj.color + '45' }]}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proj.color }} />
                                <Text style={{ color: proj.color, fontSize: 10, fontWeight: '600', marginLeft: 4 }}>{proj.name}</Text>
                              </View>
                            )}
                            {/* Deadline */}
                            {task.deadline && (
                              <View style={[s.badge, { backgroundColor: dlBg, borderColor: dlBorder }]}>
                                <IconSymbol name={overdue ? 'exclamationmark.circle' : 'calendar'} size={10} color={dlColor} />
                                <Text style={{ color: dlColor, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                                  {deadlineLabel(task.deadline!, tr.today, tr.yesterday, tr.tomorrow, locale)}
                                </Text>
                              </View>
                            )}
                            {/* Estimated time */}
                            {task.estimatedMinutes && (
                              <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                                <IconSymbol name="timer" size={10} color={c.sub} />
                                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                                  {task.estimatedMinutes >= 60
                                    ? `${Math.floor(task.estimatedMinutes / 60)}г ${task.estimatedMinutes % 60 > 0 ? `${task.estimatedMinutes % 60}хв` : ''}`
                                    : `${task.estimatedMinutes}хв`}
                                </Text>
                              </View>
                            )}
                            {/* Recurrence badge */}
                            {task.recurrence && (
                              <View style={[s.badge, { backgroundColor: c.accent + '15', borderColor: c.accent + '35' }]}>
                                <IconSymbol name="repeat" size={10} color={c.accent} />
                              </View>
                            )}
                          </View>

                          {/* Row 3: progress */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 32 }}>
                            <View style={[s.progressBg, { flex: 1 }]}>
                              <View style={[s.progressFill, { width: `${prog}%`, backgroundColor: task.status === 'done' ? '#10B981' : c.accent }]} />
                            </View>
                            <Text style={[s.pct, { color: c.sub }]}>{prog}%</Text>
                            {task.subtasks.length > 0 && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                <IconSymbol name="list.bullet" size={11} color={c.sub} />
                                <Text style={[s.pct, { color: c.sub }]}>{task.subtasks.filter(x => x.done).length}/{task.subtasks.length}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* CALENDAR VIEW */}
          {viewMode === 'calendar' && (
            <View>
              {/* Span selector */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                {(['week', 'month', 'quarter', 'year'] as CalSpan[]).map(span => (
                  <TouchableOpacity
                    key={span}
                    onPress={() => { setCalSpan(span); if (span === 'week') setCalViewDate(calWeekDay); }}
                    style={[s.sortChip, {
                      flex: 1, justifyContent: 'center',
                      backgroundColor: calSpan === span ? c.accent + '20' : c.dim,
                      borderColor: calSpan === span ? c.accent : c.border,
                    }]}>
                    <Text style={{ color: calSpan === span ? c.accent : c.sub, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>
                      {span === 'week' ? tr.week : span === 'month' ? tr.month : span === 'quarter' ? tr.quarter : tr.year}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Nav header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TouchableOpacity onPress={calPrev} style={s.navBtn}>
                  <IconSymbol name="chevron.left" size={18} color={c.sub} />
                </TouchableOpacity>
                <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '700' }}>{calHeaderLabel}</Text>
                <TouchableOpacity onPress={calNext} style={s.navBtn}>
                  <IconSymbol name="chevron.right" size={18} color={c.sub} />
                </TouchableOpacity>
              </View>

              {/* WEEK */}
              {calSpan === 'week' && (() => {
                const weekDayTasks = tasksByDate[calWeekDay.toDateString()] ?? [];
                const weekActiveTasks = weekDayTasks.filter(t => t.status === 'active');
                const weekDoneTasks = weekDayTasks.filter(t => t.status === 'done');
                return (
                  <View>
                    {/* 7-day strip */}
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 20 }}>
                      {Array.from({ length: 7 }, (_, i) => {
                        const d = new Date(weekMonday); d.setDate(d.getDate() + i);
                        const dayTasks = tasksByDate[d.toDateString()] ?? [];
                        const isToday = d.toDateString() === today.toDateString();
                        const isSel = d.toDateString() === calWeekDay.toDateString();
                        const cnt = dayTasks.length;
                        const hasActive = dayTasks.some(t => t.status === 'active');
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => setCalWeekDay(d)}
                            activeOpacity={0.75}
                            style={{
                              flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16,
                              backgroundColor: isSel ? c.accent : isToday ? c.accent + '18' : c.dim,
                              borderWidth: 1,
                              borderColor: isSel ? c.accent : isToday ? c.accent + '60' : c.border,
                            }}>
                            <Text style={{
                              fontSize: 10, fontWeight: '600', marginBottom: 4,
                              color: isSel ? 'rgba(255,255,255,0.75)' : isToday ? c.accent : c.sub,
                            }}>
                              {WEEKDAYS_SHORT[i]}
                            </Text>
                            <Text style={{
                              fontSize: 15, fontWeight: '800', lineHeight: 18,
                              color: isSel ? '#fff' : isToday ? c.accent : c.text,
                            }}>
                              {d.getDate()}
                            </Text>
                            <View style={{ marginTop: 6, height: 5, alignItems: 'center', justifyContent: 'center' }}>
                              {cnt > 0 && (
                                <View style={{
                                  width: cnt > 3 ? 14 : cnt * 5,
                                  height: 5, borderRadius: 3,
                                  backgroundColor: isSel
                                    ? 'rgba(255,255,255,0.55)'
                                    : hasActive ? c.accent : '#10B981',
                                }} />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Selected day header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1, textTransform: 'capitalize' }}>
                        {calWeekDay.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </Text>
                      {weekDayTasks.length > 0 && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {weekActiveTasks.length > 0 && (
                            <View style={{ backgroundColor: c.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{weekActiveTasks.length} {tr.active}</Text>
                            </View>
                          )}
                          {weekDoneTasks.length > 0 && (
                            <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>{weekDoneTasks.length} {tr.done}</Text>
                            </View>
                          )}
                        </View>
                      )}
                    </View>

                    {/* Task list for selected day */}
                    {weekDayTasks.length === 0 ? (
                      <View style={{ alignItems: 'center', paddingVertical: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }}>
                        <IconSymbol name="calendar.badge.checkmark" size={28} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginTop: 8 }}>{tr.noTasksForDay}</Text>
                      </View>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {weekDayTasks.map(task => {
                          const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                          const prog = getProgress(task);
                          const overdue = isOverdue(task);
                          const prioColor = PRIORITY[task.priority].color;
                          return (
                            <TouchableOpacity
                              key={task.id}
                              onPress={() => setSelected(task)}
                              activeOpacity={0.75}>
                              <BlurView
                                intensity={isDark ? 18 : 35}
                                tint={isDark ? 'dark' : 'light'}
                                style={{
                                  borderRadius: 16, borderWidth: 1,
                                  borderColor: task.status === 'done' ? c.border : overdue ? '#EF444450' : c.border,
                                  padding: 13, overflow: 'hidden',
                                }}>
                                {/* Priority stripe */}
                                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: task.status === 'done' ? '#10B981' : prioColor, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
                                <View style={{ marginLeft: 8 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                    <TouchableOpacity
                                      onPress={e => { e.stopPropagation(); toggleTask(task.id); }}
                                      style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent', marginTop: 1, flexShrink: 0 }}>
                                      {task.status === 'done' && <IconSymbol name="checkmark" size={12} color="#fff" />}
                                    </TouchableOpacity>
                                    <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 20, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }}>
                                      {task.title}
                                    </Text>
                                  </View>

                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 32 }}>
                                    <View style={[s.badge, { backgroundColor: prioColor + '18', borderColor: prioColor + '40' }]}>
                                      <View style={[s.dot, { backgroundColor: prioColor, width: 6, height: 6 }]} />
                                      <Text style={{ color: prioColor, fontSize: 10, fontWeight: '700', marginLeft: 3 }}>{PRIORITY[task.priority].label}</Text>
                                    </View>
                                    {proj && (
                                      <View style={[s.badge, { backgroundColor: proj.color + '18', borderColor: proj.color + '45' }]}>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proj.color }} />
                                        <Text style={{ color: proj.color, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>{proj.name}</Text>
                                      </View>
                                    )}
                                    {task.subtasks.length > 0 && (
                                      <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                                        <IconSymbol name="list.bullet" size={9} color={c.sub} />
                                        <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>{task.subtasks.filter(s => s.done).length}/{task.subtasks.length}</Text>
                                      </View>
                                    )}
                                  </View>

                                  {(prog > 0 || task.subtasks.length > 0) && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 32 }}>
                                      <View style={[s.progressBg, { flex: 1 }]}>
                                        <View style={[s.progressFill, { width: `${prog}%`, backgroundColor: task.status === 'done' ? '#10B981' : c.accent }]} />
                                      </View>
                                      <Text style={[s.pct, { color: c.sub }]}>{prog}%</Text>
                                    </View>
                                  )}
                                </View>
                              </BlurView>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* MONTH */}
              {calSpan === 'month' && (() => {
                const yr = calViewDate.getFullYear();
                const mo = calViewDate.getMonth();
                const fd = (() => { const d = new Date(yr, mo, 1).getDay(); return d === 0 ? 6 : d - 1; })();
                const dim = new Date(yr, mo + 1, 0).getDate();
                const cells: (number | null)[] = [];
                for (let i = 0; i < fd; i++) cells.push(null);
                for (let i = 1; i <= dim; i++) cells.push(i);
                while (cells.length % 7 !== 0) cells.push(null);
                const weeks = chunk(cells, 7);
                return (
                  <View>
                    <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                      {WEEKDAYS_SHORT.map(d => (
                        <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                      ))}
                    </View>
                    {weeks.map((week, wi) => (
                      <View key={wi} style={{ flexDirection: 'row', marginBottom: 6 }}>
                        {week.map((day, di) => {
                          if (!day) return <View key={di} style={{ flex: 1 }} />;
                          const d = new Date(yr, mo, day);
                          const dayTasks = tasksByDate[d.toDateString()] ?? [];
                          const dayMeets = meetingsByDate[d.toISOString().slice(0, 10)] ?? [];
                          const isToday = d.toDateString() === today.toDateString();
                          const cnt = dayTasks.length;
                          const activeCnt = dayTasks.filter(t => t.status === 'active').length;
                          const hasMeet = dayMeets.length > 0;
                          const hasAny = cnt > 0 || hasMeet;
                          return (
                            <TouchableOpacity
                              key={di}
                              onPress={() => hasAny ? setCalPopupDate(d) : undefined}
                              activeOpacity={hasAny ? 0.7 : 1}
                              style={{ flex: 1, alignItems: 'center' }}>
                              <View style={[
                                { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
                                isToday && { backgroundColor: c.accent },
                                hasAny && !isToday && { backgroundColor: c.accent + '1A' },
                              ]}>
                                <Text style={{ color: isToday ? '#fff' : hasAny ? c.accent : c.text, fontSize: 13, fontWeight: isToday || hasAny ? '700' : '400' }}>{day}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 2, marginTop: 2, minHeight: 10 }}>
                                {cnt > 0 && <View style={{ backgroundColor: activeCnt > 0 ? c.accent : '#10B981', borderRadius: 3, paddingHorizontal: 3, minWidth: 12, alignItems: 'center' }}>
                                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{cnt}</Text>
                                </View>}
                                {hasMeet && <View style={{ backgroundColor: '#6366F1', borderRadius: 3, paddingHorizontal: 3, minWidth: 12, alignItems: 'center' }}>
                                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{dayMeets.length}</Text>
                                </View>}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                );
              })()}

              {/* QUARTER */}
              {calSpan === 'quarter' && (() => {
                const yr = calViewDate.getFullYear();
                const qStart = Math.floor(calViewDate.getMonth() / 3) * 3;
                return (
                  <View style={{ gap: 24 }}>
                    {[0, 1, 2].map(offset => {
                      const mo = qStart + offset;
                      const fd = (() => { const d = new Date(yr, mo, 1).getDay(); return d === 0 ? 6 : d - 1; })();
                      const dim = new Date(yr, mo + 1, 0).getDate();
                      const cells: (number | null)[] = [];
                      for (let i = 0; i < fd; i++) cells.push(null);
                      for (let i = 1; i <= dim; i++) cells.push(i);
                      while (cells.length % 7 !== 0) cells.push(null);
                      const weeks = chunk(cells, 7);
                      return (
                        <View key={mo}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{MONTHS_UA[mo]}</Text>
                          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                            {WEEKDAYS_SHORT.map(d => (
                              <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{d}</Text>
                            ))}
                          </View>
                          {weeks.map((week, wi) => (
                            <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
                              {week.map((day, di) => {
                                if (!day) return <View key={di} style={{ flex: 1 }} />;
                                const d = new Date(yr, mo, day);
                                const dayTasks = tasksByDate[d.toDateString()] ?? [];
                                const isToday = d.toDateString() === today.toDateString();
                                const cnt = dayTasks.length;
                                return (
                                  <TouchableOpacity
                                    key={di}
                                    onPress={() => cnt > 0 ? setCalPopupDate(d) : undefined}
                                    activeOpacity={cnt > 0 ? 0.7 : 1}
                                    style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                                    <View style={[
                                      { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
                                      isToday && { backgroundColor: c.accent },
                                      cnt > 0 && !isToday && { backgroundColor: c.accent + '1A' },
                                    ]}>
                                      <Text style={{ color: isToday ? '#fff' : cnt > 0 ? c.accent : c.text, fontSize: 10, fontWeight: cnt > 0 || isToday ? '700' : '400' }}>{day}</Text>
                                    </View>
                                    {cnt > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 1 }} />}
                                    {cnt === 0 && <View style={{ height: 5 }} />}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ))}
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              {/* YEAR */}
              {calSpan === 'year' && (() => {
                const yr = calViewDate.getFullYear();
                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {MONTHS_UA.map((mName, mo) => {
                      const monthTasks = tasks.filter(t => {
                        if (!t.deadline) return false;
                        const d = new Date(t.deadline);
                        return d.getFullYear() === yr && d.getMonth() === mo;
                      });
                      const cnt = monthTasks.length;
                      const activeCnt = monthTasks.filter(t => t.status === 'active').length;
                      const isCurrent = today.getFullYear() === yr && today.getMonth() === mo;
                      return (
                        <TouchableOpacity
                          key={mo}
                          onPress={() => { setCalSpan('month'); setCalViewDate(new Date(yr, mo, 1)); }}
                          activeOpacity={0.75}
                          style={{
                            width: '30.5%',
                            borderRadius: 14,
                            borderWidth: 1,
                            borderColor: isCurrent ? c.accent : c.border,
                            backgroundColor: isCurrent ? c.accent + '14' : c.dim,
                            paddingVertical: 14,
                            paddingHorizontal: 10,
                            alignItems: 'center',
                            gap: 5,
                          }}>
                          <Text style={{ color: isCurrent ? c.accent : c.text, fontSize: 12, fontWeight: '700' }}>{mName.slice(0, 3)}</Text>
                          {cnt > 0 ? (
                            <View style={{ backgroundColor: activeCnt > 0 ? c.accent : '#10B981', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center' }}>
                              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{cnt}</Text>
                            </View>
                          ) : (
                            <Text style={{ color: c.sub, fontSize: 11, opacity: 0.5 }}>—</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.fab, { backgroundColor: c.accent }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

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
                style={{ maxHeight: Dimensions.get('window').height * 0.5 }}
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
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
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
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.filtersAndSort}</Text>

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
                {projects.length > 0 && (
                  <>
                    <Text style={[s.label, { color: c.sub }]}>{tr.project}</Text>
                    <View style={{ gap: 7 }}>
                      <TouchableOpacity
                        onPress={() => setFilterProject(null)}
                        style={[s.filterActionBtn, { backgroundColor: !filterProject ? c.accent + '15' : c.dim, borderColor: !filterProject ? c.accent + '50' : c.border }]}>
                        <IconSymbol name="tray" size={14} color={!filterProject ? c.accent : c.sub} />
                        <Text style={{ color: !filterProject ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>{tr.allProjects}</Text>
                        {!filterProject && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                      </TouchableOpacity>
                      {projects.map(proj => (
                        <TouchableOpacity
                          key={proj.id}
                          onPress={() => setFilterProject(filterProject === proj.id ? null : proj.id)}
                          style={[s.filterActionBtn, { backgroundColor: filterProject === proj.id ? proj.color + '15' : c.dim, borderColor: filterProject === proj.id ? proj.color + '50' : c.border }]}>
                          <View style={[s.colorDot, { backgroundColor: proj.color }]} />
                          <Text style={{ color: filterProject === proj.id ? proj.color : c.text, fontSize: 13, fontWeight: '600', marginLeft: 10, flex: 1 }}>{proj.name}</Text>
                          {filterProject === proj.id && <IconSymbol name="checkmark" size={13} color={proj.color} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Sort */}
                <Text style={[s.label, { color: c.sub }]}>{tr.sorting}</Text>
                <View style={{ gap: 7 }}>
                  {SORT_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => setSort(opt.key)}
                      style={[s.filterActionBtn, { backgroundColor: sort === opt.key ? c.accent + '15' : c.dim, borderColor: sort === opt.key ? c.accent + '50' : c.border }]}>
                      <IconSymbol name={opt.icon as any} size={15} color={sort === opt.key ? c.accent : c.sub} />
                      <Text style={{ color: sort === opt.key ? c.accent : c.text, fontSize: 13, fontWeight: '600', marginLeft: 10, flex: 1 }}>{opt.label}</Text>
                      {sort === opt.key && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Clear all */}
                <TouchableOpacity
                  onPress={() => { clearAllFilters(); setShowFilterSheet(false); }}
                  style={[s.btn, { marginTop: 20, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' }]}>
                  <IconSymbol name="xmark.circle" size={15} color="#EF4444" />
                  <Text style={{ color: '#EF4444', fontWeight: '700', marginLeft: 7 }}>{tr.resetAllFilters}</Text>
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
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
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
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.detailSheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={[s.sheetTitle, { color: c.text }]}>{tr.newTask}</Text>

                  <TextInput
                    placeholder={tr.taskNamePlaceholder}
                    placeholderTextColor={c.sub}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />
                  <TextInput
                    placeholder={tr.taskDescPlaceholder}
                    placeholderTextColor={c.sub}
                    value={newDesc}
                    onChangeText={setNewDesc}
                    style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]}
                  />

                  {/* Priority */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.priority}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {(['high', 'medium', 'low'] as Priority[]).map(p => (
                      <TouchableOpacity key={p} onPress={() => setNewPriority(p)} style={[s.priorityBtn, { borderColor: PRIORITY[p].color, backgroundColor: newPriority === p ? PRIORITY[p].color : 'transparent' }]}>
                        <Text style={{ color: newPriority === p ? '#fff' : PRIORITY[p].color, fontSize: 12, fontWeight: '600' }}>{PRIORITY[p].label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Project */}
                  {projects.length > 0 && (
                    <>
                      <Text style={[s.label, { color: c.sub }]}>{tr.project}</Text>
                      {/* Dropdown trigger */}
                      <TouchableOpacity
                        onPress={() => setShowNewProjectDropdown(v => !v)}
                        style={[s.dropdownBtn, { backgroundColor: c.dim, borderColor: showNewProjectDropdown ? c.accent : c.border }]}>
                        {(() => {
                          const sel = projects.find(p => p.id === newProjectId);
                          return sel ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sel.color }} />
                              <Text style={{ color: sel.color, fontSize: 13, fontWeight: '600', flex: 1 }}>{sel.name}</Text>
                            </View>
                          ) : (
                            <Text style={{ color: c.sub, fontSize: 13, fontWeight: '500', flex: 1 }}>{tr.noProject}</Text>
                          );
                        })()}
                        <IconSymbol name={showNewProjectDropdown ? 'chevron.up' : 'chevron.down'} size={14} color={c.sub} />
                      </TouchableOpacity>
                      {showNewProjectDropdown && (
                        <View style={[s.dropdownList, { borderColor: c.border, backgroundColor: c.dim }]}>
                          <TouchableOpacity
                            onPress={() => { setNewProjectId(null); setShowNewProjectDropdown(false); }}
                            style={[s.dropdownItem, { borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: !newProjectId ? c.accent + '12' : 'transparent' }]}>
                            <Text style={{ color: !newProjectId ? c.accent : c.sub, fontSize: 13, fontWeight: '600', flex: 1 }}>{tr.noProject}</Text>
                            {!newProjectId && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                          </TouchableOpacity>
                          {projects.map((p, i) => (
                            <TouchableOpacity
                              key={p.id}
                              onPress={() => { setNewProjectId(p.id); setShowNewProjectDropdown(false); }}
                              style={[s.dropdownItem, { borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: c.border, backgroundColor: newProjectId === p.id ? p.color + '12' : 'transparent' }]}>
                              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color, marginRight: 8 }} />
                              <Text style={{ color: newProjectId === p.id ? p.color : c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{p.name}</Text>
                              {newProjectId === p.id && <IconSymbol name="checkmark" size={13} color={p.color} />}
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}

                  {/* Estimated time */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.timeEstimate}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      placeholder={tr.hoursPlaceholder}
                      placeholderTextColor={c.sub}
                      value={newEstHours}
                      onChangeText={setNewEstHours}
                      keyboardType="number-pad"
                      style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                    />
                    <TextInput
                      placeholder={tr.minutesPlaceholder}
                      placeholderTextColor={c.sub}
                      value={newEstMins}
                      onChangeText={setNewEstMins}
                      keyboardType="number-pad"
                      style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                    />
                  </View>

                  {/* Deadline */}
                  <Text style={[s.label, { color: c.sub }]}>{tr.deadline}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 7 }}>
                      {DEADLINE_PRESETS.map(preset => {
                        const d = new Date(); d.setDate(d.getDate() + preset.days);
                        const iso = d.toISOString();
                        const isSelected = newDeadline && new Date(newDeadline).toDateString() === d.toDateString();
                        return (
                          <TouchableOpacity
                            key={preset.label}
                            onPress={() => setNewDeadline(isSelected ? null : iso)}
                            style={[s.sortChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                            <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{preset.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => { Keyboard.dismiss(); setShowDeadlineCal(v => !v); }}
                        style={[s.sortChip, { backgroundColor: showDeadlineCal ? c.accent + '20' : c.dim, borderColor: showDeadlineCal ? c.accent : c.border }]}>
                        <IconSymbol name="calendar" size={13} color={showDeadlineCal ? c.accent : c.sub} />
                        <Text style={{ color: showDeadlineCal ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{tr.select}</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>

                  {newDeadline && (
                    <View style={[s.badge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50', alignSelf: 'flex-start', marginBottom: 8 }]}>
                      <IconSymbol name="calendar" size={11} color={c.accent} />
                      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                        {new Date(newDeadline).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long' })}
                      </Text>
                      <TouchableOpacity onPress={() => setNewDeadline(null)} style={{ marginLeft: 6 }}>
                        <IconSymbol name="xmark" size={11} color={c.accent} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {showDeadlineCal && (
                    <View style={[s.inlineCalendar, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <CalendarGrid
                        year={deadlineCalYear} month={deadlineCalMonth}
                        markedDays={new Set()}
                        selectedDate={newDeadline ? new Date(newDeadline).toDateString() : null}
                        todayDate={today}
                        weeks={dlWeeks}
                        months={MONTHS_UA}
                        weekdays={WEEKDAYS_SHORT}
                        onPrevMonth={() => { if (deadlineCalMonth === 0) { setDeadlineCalMonth(11); setDeadlineCalYear(y => y - 1); } else setDeadlineCalMonth(m => m - 1); }}
                        onNextMonth={() => { if (deadlineCalMonth === 11) { setDeadlineCalMonth(0); setDeadlineCalYear(y => y + 1); } else setDeadlineCalMonth(m => m + 1); }}
                        onSelectDay={(d) => { setNewDeadline(d.toISOString()); setShowDeadlineCal(false); }}
                        c={c}
                      />
                    </View>
                  )}

                  {/* Recurrence */}
                  <TouchableOpacity
                    onPress={() => setNewRepeat(v => !v)}
                    style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
                      paddingHorizontal: 11, paddingVertical: 9, marginTop: 8,
                      borderColor: newRepeat ? c.accent + '55' : c.border,
                      backgroundColor: newRepeat ? c.accent + '10' : c.dim }}>
                    <IconSymbol name="repeat" size={13} color={newRepeat ? c.accent : c.sub} />
                    <Text style={{ color: newRepeat ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                      {tr.repeat ?? 'Повторювати'}
                    </Text>
                    <View style={{ width: 36, height: 22, borderRadius: 11, backgroundColor: newRepeat ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: newRepeat ? 'flex-end' : 'flex-start' }} />
                    </View>
                  </TouchableOpacity>

                  {newRepeat && (
                    <View style={{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 7,
                      borderColor: c.accent + '40', backgroundColor: c.accent + '08' }}>
                      <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10 }}>
                        {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(f => {
                          const labels = { daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця', yearly: 'Щороку' };
                          const on = newRepeatFreq === f;
                          return (
                            <TouchableOpacity key={f} onPress={() => { setNewRepeatFreq(f); if (f !== 'weekly') setNewRepeatDays([]); }}
                              style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                                backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                              <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{labels[f]}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>Кожні</Text>
                        <TouchableOpacity onPress={() => setNewRepeatInterval(i => Math.max(1, i - 1))}
                          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>−</Text>
                        </TouchableOpacity>
                        <Text style={{ color: c.accent, fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{newRepeatInterval}</Text>
                        <TouchableOpacity onPress={() => setNewRepeatInterval(i => Math.min(99, i + 1))}
                          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>+</Text>
                        </TouchableOpacity>
                        <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>
                          {newRepeatFreq === 'daily' ? (newRepeatInterval === 1 ? 'день' : 'дн.') :
                           newRepeatFreq === 'weekly' ? (newRepeatInterval === 1 ? 'тиждень' : 'тиж.') :
                           newRepeatFreq === 'monthly' ? (newRepeatInterval === 1 ? 'місяць' : 'міс.') : 'рік'}
                        </Text>
                      </View>
                      {newRepeatFreq === 'weekly' && (
                        <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                          {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map((d, i) => {
                            const on = newRepeatDays.includes(i);
                            return (
                              <TouchableOpacity key={i} onPress={() => setNewRepeatDays(prev => on ? prev.filter(x => x !== i) : [...prev, i])}
                                style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8,
                                  backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                                <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{d}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', gap: 7 }}>
                        {(['never', 'until'] as const).map(type => {
                          const labels = { never: 'Ніколи', until: 'До дати' };
                          const on = newRepeatEndType === type;
                          return (
                            <TouchableOpacity key={type} onPress={() => setNewRepeatEndType(type)}
                              style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                                backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                              <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{labels[type]}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {newRepeatEndType === 'until' && (
                        <View style={{ marginTop: 8 }}>
                          <TouchableOpacity onPress={() => {}}
                            style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
                              paddingHorizontal: 11, paddingVertical: 9,
                              borderColor: newRepeatUntil ? c.accent + '55' : c.border,
                              backgroundColor: newRepeatUntil ? c.accent + '10' : c.dim }}>
                            <IconSymbol name="calendar" size={13} color={newRepeatUntil ? c.accent : c.sub} />
                            <TextInput
                              placeholder="YYYY-MM-DD"
                              placeholderTextColor={c.sub}
                              value={newRepeatUntil}
                              onChangeText={setNewRepeatUntil}
                              style={{ color: newRepeatUntil ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1, padding: 0 }}
                            />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={addTask} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.add}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selectedTask} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {selectedTask && (
                <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.detailSheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                  <ScrollView ref={detailScrollRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.handleRow}>
                      <View style={{ flex: 1 }}>
                        {!isEditingTask && detailTab === 'info' && (
                          <TouchableOpacity
                            onPress={() => {
                              setEditTitle(selectedTask.title);
                              setEditDesc(selectedTask.description);
                              setEditPriority(selectedTask.priority);
                              const h = selectedTask.estimatedMinutes ? Math.floor(selectedTask.estimatedMinutes / 60) : 0;
                              const m = selectedTask.estimatedMinutes ? selectedTask.estimatedMinutes % 60 : 0;
                              setEditEstHours(h > 0 ? String(h) : '');
                              setEditEstMins(m > 0 ? String(m) : '');
                              setEditDeadline(selectedTask.deadline ?? null);
                              setEditDeadlineCalYear(today.getFullYear());
                              setEditDeadlineCalMonth(today.getMonth());
                              setShowEditDeadlineCal(false);
                              setShowEditProjectDropdown(false);
                              const rec = selectedTask.recurrence;
                              setEditRepeat(!!rec);
                              setEditRepeatFreq(rec?.freq ?? 'weekly');
                              setEditRepeatInterval(rec?.interval ?? 1);
                              setEditRepeatDays(rec?.daysOfWeek ?? []);
                              setEditRepeatEndType(rec?.until ? 'until' : 'never');
                              setEditRepeatUntil(rec?.until ?? '');
                              setIsEditingTask(true);
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="pencil" size={17} color={c.sub} />
                          </TouchableOpacity>
                        )}
                      </View>
                      <View style={[s.handle, { backgroundColor: c.border }]} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <TouchableOpacity onPress={() => { setSelected(null); setIsEditingTask(false); setShowEditDeadlineCal(false); setShowEditProjectDropdown(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <IconSymbol name="xmark" size={17} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Tab Switcher */}
                    {!isEditingTask && (
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
                    {!isEditingTask && detailTab === 'timer' && (
                      <View>
                        {/* Elapsed display */}
                        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' }}>
                            {isTimerRunning ? tr.currentSession : tr.trackedTime}
                          </Text>
                          <Text style={{ color: c.text, fontSize: 44, fontWeight: '800', letterSpacing: -1 }}>
                            {timerTick >= 0 && fmtClock(isTimerRunning ? calcElapsedSeconds(selectedTask) : getTotalTrackedSeconds(selectedTask))}
                          </Text>
                          {isTimerRunning && (() => {
                            const ae = getActiveTimerEntry(selectedTask);
                            return ae ? (
                              <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>
                                Почато о {new Date(ae.startedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                              </Text>
                            ) : null;
                          })()}
                          {!isTimerRunning && (selectedTask.timeEntries?.length ?? 0) > 0 && (
                            <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>
                              {(selectedTask.timeEntries ?? []).filter(e => e.endedAt).length} {lang === 'uk' ? 'сесій' : 'sessions'}
                            </Text>
                          )}
                        </View>

                        {/* Start / Stop button */}
                        {selectedTask.status === 'active' && (
                          <TouchableOpacity
                            onPress={isTimerRunning ? stopTimer : startTimer}
                            style={[s.btn, { backgroundColor: isTimerRunning ? '#EF4444' : '#6366F1' }]}>
                            <IconSymbol name={isTimerRunning ? 'stop.fill' : 'play.fill'} size={15} color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
                              {isTimerRunning ? tr.stopTimer : tr.startTimer}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {/* Sessions list */}
                        {(selectedTask.timeEntries?.length ?? 0) > 0 && (
                          <View style={{ marginTop: 18 }}>
                            <Text style={[s.label, { color: c.sub }]}>{tr.sessions}</Text>
                            {[...(selectedTask.timeEntries ?? [])].reverse().map((entry) => (
                              <View key={entry.id} style={[s.subRow, { borderColor: !entry.endedAt ? '#6366F140' : c.border, backgroundColor: !entry.endedAt ? '#6366F108' : c.dim, marginBottom: 7 }]}>
                                <IconSymbol name="timer" size={14} color={!entry.endedAt ? '#6366F1' : c.sub} />
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>
                                    {!entry.endedAt
                                      ? fmtClock(Math.max(0, Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 1000)))
                                      : fmtDur(entry.duration)}
                                  </Text>
                                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                                    {new Date(entry.startedAt).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })}
                                    {' · '}
                                    {new Date(entry.startedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                    {entry.endedAt ? ` → ${new Date(entry.endedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                  </Text>
                                </View>
                                {!entry.endedAt && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366F1' }} />}
                              </View>
                            ))}
                          </View>
                        )}

                        {(selectedTask.timeEntries?.length ?? 0) === 0 && selectedTask.status === 'active' && (
                          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                            {lang === 'uk' ? 'Натисніть «Запустити» щоб почати відстежувати час' : 'Press \'Start\' to begin tracking time'}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* ─── History Tab ─── */}
                    {!isEditingTask && detailTab === 'history' && (
                      <View>
                        {!(selectedTask.history?.length) ? (
                          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                            {lang === 'uk' ? 'Немає записів в історії' : 'No history records'}
                          </Text>
                        ) : (
                          [...(selectedTask.history ?? [])].reverse().map((event) => (
                            <View key={event.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 10 }}>
                              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: historyEventColor(event.type) + '20', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                                <IconSymbol name={historyEventIcon(event.type) as any} size={14} color={historyEventColor(event.type)} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{HISTORY_LABELS[event.type]}</Text>
                                {event.note ? <Text style={{ color: c.sub, fontSize: 12, marginTop: 1 }} numberOfLines={2}>{event.note}</Text> : null}
                                <Text style={{ color: c.sub, fontSize: 11, marginTop: 3 }}>
                                  {new Date(event.at).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short' })}
                                  {' · '}
                                  {new Date(event.at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                              </View>
                            </View>
                          ))
                        )}
                      </View>
                    )}

                    {isEditingTask ? (
                      <>
                        <Text style={[s.sheetTitle, { color: c.text }]}>{tr.editTask}</Text>

                        <TextInput
                          placeholder={tr.taskNamePlaceholder}
                          placeholderTextColor={c.sub}
                          value={editTitle}
                          onChangeText={setEditTitle}
                          style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                        />
                        <TextInput
                          placeholder={tr.taskDescPlaceholder}
                          placeholderTextColor={c.sub}
                          value={editDesc}
                          onChangeText={setEditDesc}
                          style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]}
                        />

                        <Text style={[s.label, { color: c.sub }]}>{tr.priority}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          {(['high', 'medium', 'low'] as Priority[]).map(p => (
                            <TouchableOpacity key={p} onPress={() => setEditPriority(p)} style={[s.priorityBtn, { borderColor: PRIORITY[p].color, backgroundColor: editPriority === p ? PRIORITY[p].color : 'transparent' }]}>
                              <Text style={{ color: editPriority === p ? '#fff' : PRIORITY[p].color, fontSize: 12, fontWeight: '600' }}>{PRIORITY[p].label}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {projects.length > 0 && (
                          <>
                            <Text style={[s.label, { color: c.sub }]}>{tr.project}</Text>
                            <TouchableOpacity
                              onPress={() => setShowEditProjectDropdown(v => !v)}
                              style={[s.dropdownBtn, { backgroundColor: c.dim, borderColor: showEditProjectDropdown ? c.accent : c.border }]}>
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
                              <IconSymbol name={showEditProjectDropdown ? 'chevron.up' : 'chevron.down'} size={14} color={c.sub} />
                            </TouchableOpacity>
                            {showEditProjectDropdown && (
                              <View style={[s.dropdownList, { borderColor: c.border, backgroundColor: c.dim }]}>
                                <TouchableOpacity
                                  onPress={() => { updateTaskProject(selectedTask.id, null); setShowEditProjectDropdown(false); }}
                                  style={[s.dropdownItem, { borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: !selectedTask.projectId ? c.accent + '12' : 'transparent' }]}>
                                  <Text style={{ color: !selectedTask.projectId ? c.accent : c.sub, fontSize: 13, fontWeight: '600', flex: 1 }}>{tr.noProject}</Text>
                                  {!selectedTask.projectId && <IconSymbol name="checkmark" size={13} color={c.accent} />}
                                </TouchableOpacity>
                                {projects.map((proj, i) => (
                                  <TouchableOpacity
                                    key={proj.id}
                                    onPress={() => { updateTaskProject(selectedTask.id, proj.id); setShowEditProjectDropdown(false); }}
                                    style={[s.dropdownItem, { borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: c.border, backgroundColor: selectedTask.projectId === proj.id ? proj.color + '12' : 'transparent' }]}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: proj.color, marginRight: 8 }} />
                                    <Text style={{ color: selectedTask.projectId === proj.id ? proj.color : c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{proj.name}</Text>
                                    {selectedTask.projectId === proj.id && <IconSymbol name="checkmark" size={13} color={proj.color} />}
                                  </TouchableOpacity>
                                ))}
                              </View>
                            )}
                          </>
                        )}

                        <Text style={[s.label, { color: c.sub }]}>{tr.timeEstimate}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TextInput
                            placeholder={tr.hoursPlaceholder}
                            placeholderTextColor={c.sub}
                            value={editEstHours}
                            onChangeText={setEditEstHours}
                            keyboardType="number-pad"
                            style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                          />
                          <TextInput
                            placeholder={tr.minutesPlaceholder}
                            placeholderTextColor={c.sub}
                            value={editEstMins}
                            onChangeText={setEditEstMins}
                            keyboardType="number-pad"
                            style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                          />
                        </View>

                        <Text style={[s.label, { color: c.sub }]}>{tr.deadline}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', gap: 7 }}>
                            {DEADLINE_PRESETS.map(preset => {
                              const d = new Date(); d.setDate(d.getDate() + preset.days);
                              const iso = d.toISOString();
                              const isSelected = editDeadline && new Date(editDeadline).toDateString() === d.toDateString();
                              return (
                                <TouchableOpacity
                                  key={preset.label}
                                  onPress={() => setEditDeadline(isSelected ? null : iso)}
                                  style={[s.sortChip, { backgroundColor: isSelected ? c.accent : c.dim, borderColor: isSelected ? c.accent : c.border }]}>
                                  <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{preset.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                            <TouchableOpacity
                              onPress={() => { Keyboard.dismiss(); setShowEditDeadlineCal(v => !v); }}
                              style={[s.sortChip, { backgroundColor: showEditDeadlineCal ? c.accent + '20' : c.dim, borderColor: showEditDeadlineCal ? c.accent : c.border }]}>
                              <IconSymbol name="calendar" size={13} color={showEditDeadlineCal ? c.accent : c.sub} />
                              <Text style={{ color: showEditDeadlineCal ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{tr.select}</Text>
                            </TouchableOpacity>
                          </View>
                        </ScrollView>

                        {editDeadline && (
                          <View style={[s.badge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50', alignSelf: 'flex-start', marginBottom: 8 }]}>
                            <IconSymbol name="calendar" size={11} color={c.accent} />
                            <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                              {new Date(editDeadline).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'long' })}
                            </Text>
                            <TouchableOpacity onPress={() => setEditDeadline(null)} style={{ marginLeft: 6 }}>
                              <IconSymbol name="xmark" size={11} color={c.accent} />
                            </TouchableOpacity>
                          </View>
                        )}

                        {showEditDeadlineCal && (
                          <View style={[s.inlineCalendar, { borderColor: c.border, backgroundColor: c.dim }]}>
                            <CalendarGrid
                              year={editDeadlineCalYear} month={editDeadlineCalMonth}
                              markedDays={new Set()}
                              selectedDate={editDeadline ? new Date(editDeadline).toDateString() : null}
                              todayDate={today}
                              weeks={editDlWeeks}
                              months={MONTHS_UA}
                              weekdays={WEEKDAYS_SHORT}
                              onPrevMonth={() => { if (editDeadlineCalMonth === 0) { setEditDeadlineCalMonth(11); setEditDeadlineCalYear(y => y - 1); } else setEditDeadlineCalMonth(m => m - 1); }}
                              onNextMonth={() => { if (editDeadlineCalMonth === 11) { setEditDeadlineCalMonth(0); setEditDeadlineCalYear(y => y + 1); } else setEditDeadlineCalMonth(m => m + 1); }}
                              onSelectDay={(d) => { setEditDeadline(d.toISOString()); setShowEditDeadlineCal(false); }}
                              c={c}
                            />
                          </View>
                        )}

                        {/* Recurrence (edit) */}
                        <TouchableOpacity
                          onPress={() => setEditRepeat(v => !v)}
                          style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
                            paddingHorizontal: 11, paddingVertical: 9, marginTop: 8,
                            borderColor: editRepeat ? c.accent + '55' : c.border,
                            backgroundColor: editRepeat ? c.accent + '10' : c.dim }}>
                          <IconSymbol name="repeat" size={13} color={editRepeat ? c.accent : c.sub} />
                          <Text style={{ color: editRepeat ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 6, flex: 1 }}>
                            {tr.repeat ?? 'Повторювати'}
                          </Text>
                          <View style={{ width: 36, height: 22, borderRadius: 11, backgroundColor: editRepeat ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 2 }}>
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', alignSelf: editRepeat ? 'flex-end' : 'flex-start' }} />
                          </View>
                        </TouchableOpacity>

                        {editRepeat && (
                          <View style={{ borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 7,
                            borderColor: c.accent + '40', backgroundColor: c.accent + '08' }}>
                            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10 }}>
                              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(f => {
                                const labels = { daily: 'Щодня', weekly: 'Щотижня', monthly: 'Щомісяця', yearly: 'Щороку' };
                                const on = editRepeatFreq === f;
                                return (
                                  <TouchableOpacity key={f} onPress={() => { setEditRepeatFreq(f); if (f !== 'weekly') setEditRepeatDays([]); }}
                                    style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                                      backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                                    <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{labels[f]}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>Кожні</Text>
                              <TouchableOpacity onPress={() => setEditRepeatInterval(i => Math.max(1, i - 1))}
                                style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>−</Text>
                              </TouchableOpacity>
                              <Text style={{ color: c.accent, fontSize: 16, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{editRepeatInterval}</Text>
                              <TouchableOpacity onPress={() => setEditRepeatInterval(i => Math.min(99, i + 1))}
                                style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ color: c.text, fontSize: 16, fontWeight: '600', lineHeight: 20 }}>+</Text>
                              </TouchableOpacity>
                              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>
                                {editRepeatFreq === 'daily' ? (editRepeatInterval === 1 ? 'день' : 'дн.') :
                                 editRepeatFreq === 'weekly' ? (editRepeatInterval === 1 ? 'тиждень' : 'тиж.') :
                                 editRepeatFreq === 'monthly' ? (editRepeatInterval === 1 ? 'місяць' : 'міс.') : 'рік'}
                              </Text>
                            </View>
                            {editRepeatFreq === 'weekly' && (
                              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
                                {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map((d, i) => {
                                  const on = editRepeatDays.includes(i);
                                  return (
                                    <TouchableOpacity key={i} onPress={() => setEditRepeatDays(prev => on ? prev.filter(x => x !== i) : [...prev, i])}
                                      style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8,
                                        backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                                      <Text style={{ color: on ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{d}</Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', gap: 7 }}>
                              {(['never', 'until'] as const).map(type => {
                                const labels = { never: 'Ніколи', until: 'До дати' };
                                const on = editRepeatEndType === type;
                                return (
                                  <TouchableOpacity key={type} onPress={() => setEditRepeatEndType(type)}
                                    style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 9,
                                      backgroundColor: on ? c.accent : c.dim, borderWidth: on ? 0 : 1, borderColor: c.border }}>
                                    <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{labels[type]}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            {editRepeatEndType === 'until' && (
                              <View style={{ marginTop: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 11, borderWidth: 1,
                                  paddingHorizontal: 11, paddingVertical: 9,
                                  borderColor: editRepeatUntil ? c.accent + '55' : c.border,
                                  backgroundColor: editRepeatUntil ? c.accent + '10' : c.dim }}>
                                  <IconSymbol name="calendar" size={13} color={editRepeatUntil ? c.accent : c.sub} />
                                  <TextInput
                                    placeholder="YYYY-MM-DD"
                                    placeholderTextColor={c.sub}
                                    value={editRepeatUntil}
                                    onChangeText={setEditRepeatUntil}
                                    style={{ color: editRepeatUntil ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5, flex: 1, padding: 0 }}
                                  />
                                </View>
                              </View>
                            )}
                          </View>
                        )}

                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 8 }}>
                          <TouchableOpacity onPress={() => { setIsEditingTask(false); setShowEditDeadlineCal(false); setShowEditProjectDropdown(false); }} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                            <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={saveTaskEdit} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    ) : detailTab === 'info' ? (
                    <>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                      <TouchableOpacity
                        onPress={() => toggleTask(selectedTask.id)}
                        style={[s.checkbox, { borderColor: selectedTask.status === 'done' ? '#10B981' : c.border, backgroundColor: selectedTask.status === 'done' ? '#10B981' : 'transparent', marginTop: 2 }]}>
                        {selectedTask.status === 'done' && <IconSymbol name="checkmark" size={12} color="#fff" />}
                      </TouchableOpacity>
                      <Text style={[s.detailTitle, { color: c.text, flex: 1, marginHorizontal: 10 }]}>{selectedTask.title}</Text>
                      <View style={[s.prioBadge, { backgroundColor: PRIORITY[selectedTask.priority].color + '22' }]}>
                        <View style={[s.dot, { backgroundColor: PRIORITY[selectedTask.priority].color }]} />
                        <Text style={{ color: PRIORITY[selectedTask.priority].color, fontSize: 11, fontWeight: '700', marginLeft: 4 }}>
                          {PRIORITY[selectedTask.priority].label}
                        </Text>
                      </View>
                    </View>

                    {selectedTask.description ? <Text style={[s.detailDesc, { color: c.sub }]}>{selectedTask.description}</Text> : null}

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
                    <View style={{ marginTop: 7 }}>
                      <TouchableOpacity
                        onPress={() => {
                          if (showReminderPicker && reminderPickerTarget?.taskId === selectedTask.id && !reminderPickerTarget.subtaskId) {
                            setShowReminderPicker(false);
                          } else {
                            openReminderPicker(selectedTask.id);
                          }
                        }}
                        style={[s.badge, { backgroundColor: selectedTask.reminderAt ? '#F59E0B20' : c.dim, borderColor: selectedTask.reminderAt ? '#F59E0B50' : c.border, alignSelf: 'flex-start' }]}>
                        <IconSymbol name="bell" size={11} color={selectedTask.reminderAt ? '#F59E0B' : c.sub} />
                        <Text style={{ color: selectedTask.reminderAt ? '#F59E0B' : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                          {selectedTask.reminderAt
                            ? `Нагадування: ${new Date(selectedTask.reminderAt).toLocaleString(lang === 'uk' ? 'uk-UA' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                            : tr.reminderDate}
                        </Text>
                        {selectedTask.reminderAt && (
                          <TouchableOpacity
                            onPress={(e) => { e.stopPropagation(); removeReminder(selectedTask.id); }}
                            style={{ marginLeft: 6 }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <IconSymbol name="xmark" size={10} color="#F59E0B" />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {showReminderPicker && reminderPickerTarget?.taskId === selectedTask.id && !reminderPickerTarget.subtaskId && (
                        <View style={[s.reminderPickerBox, { borderColor: c.border, backgroundColor: c.dim }]}>
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 8 }}>{tr.reminderDate}</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                            <View style={{ flexDirection: 'row', gap: 7 }}>
                              {[{ label: tr.dateToday, days: 0 }, { label: tr.dateTomorrow, days: 1 }, { label: tr.datePlus2, days: 2 }, { label: tr.datePlus7, days: 7 }].map(preset => {
                                const d = new Date(); d.setDate(d.getDate() + preset.days);
                                const iso = d.toISOString();
                                const isSelected = reminderDate && new Date(reminderDate).toDateString() === d.toDateString();
                                return (
                                  <TouchableOpacity
                                    key={preset.label}
                                    onPress={() => {
                                      const nd = new Date(d);
                                      nd.setHours(parseInt(reminderHours || '0', 10), parseInt(reminderMins || '0', 10), 0, 0);
                                      setReminderDate(nd.toISOString());
                                    }}
                                    style={[s.sortChip, { backgroundColor: isSelected ? '#F59E0B' : c.dim, borderColor: isSelected ? '#F59E0B' : c.border }]}>
                                    <Text style={{ color: isSelected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{preset.label}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </ScrollView>
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 8 }}>{tr.timeLabel}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                            <TextInput
                              value={reminderHours}
                              onChangeText={v => setReminderHours(v.replace(/\D/g, '').slice(0, 2))}
                              keyboardType="number-pad"
                              placeholder={lang === 'uk' ? 'ГГ' : 'HH'}
                              placeholderTextColor={c.sub}
                              style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                            />
                            <Text style={{ color: c.sub, fontSize: 18, fontWeight: '700' }}>:</Text>
                            <TextInput
                              value={reminderMins}
                              onChangeText={v => setReminderMins(v.replace(/\D/g, '').slice(0, 2))}
                              keyboardType="number-pad"
                              placeholder={lang === 'uk' ? 'ХХ' : 'MM'}
                              placeholderTextColor={c.sub}
                              style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                            />
                          </View>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity onPress={() => setShowReminderPicker(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                              <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={saveReminder} style={[s.btn, { flex: 2, backgroundColor: '#F59E0B' }]}>
                              <IconSymbol name="bell" size={14} color="#fff" />
                              <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{tr.setReminder}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>

                    {/* Project changer */}
                    {projects.length > 0 && (
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
                            {projects.map((proj, i) => (
                              <TouchableOpacity
                                key={proj.id}
                                onPress={() => { updateTaskProject(selectedTask.id, proj.id); setShowDetailProjectDropdown(false); }}
                                style={[s.dropdownItem, { borderBottomWidth: i < projects.length - 1 ? 1 : 0, borderBottomColor: c.border, backgroundColor: selectedTask.projectId === proj.id ? proj.color + '12' : 'transparent' }]}>
                                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: proj.color, marginRight: 8 }} />
                                <Text style={{ color: selectedTask.projectId === proj.id ? proj.color : c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{proj.name}</Text>
                                {selectedTask.projectId === proj.id && <IconSymbol name="checkmark" size={13} color={proj.color} />}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Subtasks section */}
                    <View style={{ marginTop: 14, borderRadius: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderWidth: 1, borderColor: c.border, padding: 12 }}>

                    {selectedTask.subtasks.length > 0 && (
                      <View style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                          <IconSymbol name="list.bullet" size={13} color={c.sub} />
                          <Text style={[s.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0, flex: 1 }]}>
                            {tr.subtasks} · {selectedTask.subtasks.filter(x => x.done).length}/{selectedTask.subtasks.length}
                          </Text>
                          <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{getProgress(selectedTask)}%</Text>
                        </View>
                        <View style={s.progressBg}>
                          <View style={[s.progressFill, { width: `${getProgress(selectedTask)}%`, backgroundColor: selectedTask.status === 'done' ? '#10B981' : c.accent }]} />
                        </View>
                      </View>
                    )}

                    {!selectedTask.subtasks.length && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <IconSymbol name="list.bullet" size={13} color={c.sub} />
                        <Text style={[s.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0 }]}>{tr.subtasks}</Text>
                      </View>
                    )}

                    {(() => {
                      // completed subtasks go to end
                      const sortedSubs = [...selectedTask.subtasks].sort((a, b) => Number(a.done) - Number(b.done));
                      const LIMIT = 4;
                      const hasMore = sortedSubs.length > LIMIT;
                      const displaySubs = hasMore ? sortedSubs.slice(0, LIMIT) : sortedSubs;
                      return (
                        <View style={{ gap: 7 }}>
                          {displaySubs.map((sub) => {
                            const originalIdx = selectedTask.subtasks.findIndex(s => s.id === sub.id);
                            if (editingSubId === sub.id) {
                              return (
                                <View key={sub.id} style={[s.subRow, { backgroundColor: c.dim, borderColor: c.accent + '80' }]}>
                                  <View style={[s.subCheck, { borderColor: c.accent, backgroundColor: 'transparent' }]} />
                                  <TextInput
                                    value={editingSubText}
                                    onChangeText={setEditingSubText}
                                    autoFocus
                                    onSubmitEditing={() => saveSubEdit(selectedTask.id, sub.id, editingSubText)}
                                    returnKeyType="done"
                                    style={[s.subTitle, { color: c.text, flex: 1, marginHorizontal: 10 }]}
                                  />
                                  <TouchableOpacity onPress={() => saveSubEdit(selectedTask.id, sub.id, editingSubText)}>
                                    <IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} />
                                  </TouchableOpacity>
                                </View>
                              );
                            }
                            return (
                              <TouchableOpacity
                                key={sub.id}
                                activeOpacity={0.7}
                                onPress={() => toggleSubtask(selectedTask.id, sub.id)}
                                onLongPress={() => showSubtaskActions(selectedTask.id, sub, originalIdx, selectedTask.subtasks.length)}
                                delayLongPress={350}
                                style={[s.subRow, { backgroundColor: c.dim, borderColor: sub.done ? '#10B98130' : c.border }]}>
                                <View style={[s.subCheck, { borderColor: sub.done ? '#10B981' : c.border, backgroundColor: sub.done ? '#10B981' : 'transparent' }]}>
                                  {sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                                </View>
                                <Text style={[s.subTitle, { color: sub.done ? c.sub : c.text, textDecorationLine: sub.done ? 'line-through' : 'none', flex: 1, marginHorizontal: 10 }]}>{sub.title}</Text>
                                <TouchableOpacity onPress={() => showSubtaskActions(selectedTask.id, sub, originalIdx, selectedTask.subtasks.length)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <IconSymbol name="ellipsis" size={14} color={c.sub} />
                                </TouchableOpacity>
                              </TouchableOpacity>
                            );
                          })}

                          {hasMore && (
                            <TouchableOpacity
                              onPress={() => {
                                setSelected(null);
                                setEditingSubId(null);
                                router.push({ pathname: '/subtasks', params: { taskId: selectedTask.id } });
                              }}
                              style={[s.viewAllBtn, { backgroundColor: c.accent + '12', borderColor: c.accent + '40' }]}>
                              <IconSymbol name="list.bullet" size={14} color={c.accent} />
                              <Text style={{ color: c.accent, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 8 }}>
                                {lang === 'uk' ? 'Переглянути всі' : 'View all'} · {selectedTask.subtasks.length}
                              </Text>
                              <IconSymbol name="chevron.right" size={12} color={c.accent} />
                            </TouchableOpacity>
                          )}

                          <View style={[s.addSubRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                            <IconSymbol name="plus" size={15} color={c.sub} />
                            <TextInput
                              placeholder={tr.addSubtask}
                              placeholderTextColor={c.sub}
                              value={newSubtask}
                              onChangeText={setNewSubtask}
                              onSubmitEditing={() => addSubtask(selectedTask.id)}
                              returnKeyType="done"
                              onFocus={() => setTimeout(() => detailScrollRef.current?.scrollToEnd({ animated: true }), 300)}
                              style={[s.subInput, { color: c.text, flex: 1, marginLeft: 8 }]}
                            />
                            {newSubtask.trim() ? (
                              <TouchableOpacity onPress={() => addSubtask(selectedTask.id)}>
                                <IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}

                    </View>{/* end subtasks block */}

                    {/* Quick timer launch from info tab */}
                    {selectedTask.status === 'active' && (
                      <TouchableOpacity
                        onPress={() => { setDetailTab('timer'); if (!isTimerRunning) startTimer(); }}
                        style={[s.btn, { marginTop: 14, backgroundColor: isTimerRunning ? '#6366F120' : '#6366F1EE', borderWidth: isTimerRunning ? 1 : 0, borderColor: '#6366F150' }]}>
                        <IconSymbol name={isTimerRunning ? 'timer' : 'play.fill'} size={15} color={isTimerRunning ? '#6366F1' : '#fff'} />
                        <Text style={{ color: isTimerRunning ? '#6366F1' : '#fff', fontWeight: '700', marginLeft: 7 }}>
                          {isTimerRunning ? `${lang === 'uk' ? 'Таймер' : 'Timer'}: ${fmtClock(calcElapsedSeconds(selectedTask))}` : (lang === 'uk' ? 'Запустити таймер' : 'Start timer')}
                        </Text>
                        {isTimerRunning && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#6366F1', marginLeft: 6 }} />}
                      </TouchableOpacity>
                    )}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => deleteTask(selectedTask.id)}
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
                  </ScrollView>
                </BlurView>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

// ─── Compact Card ────────────────────────────────────────────────────────────
function CompactCard({ task, onPress, onToggle, c, isDark, projects, todayLabel, yesterdayLabel, tomorrowLabel, locale }: {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
  c: any;
  isDark: boolean;
  projects: Project[];
  todayLabel: string;
  yesterdayLabel: string;
  tomorrowLabel: string;
  locale: string;
}) {
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={s.compactCard}>
        <TouchableOpacity
          onPress={e => { e.stopPropagation(); onToggle(); }}
          style={[s.subCheck, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent' }]}>
          {task.status === 'done' && <IconSymbol name="checkmark" size={10} color="#fff" />}
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginHorizontal: 10, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>
          {task.title}
        </Text>
        {task.deadline && (
          <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 10, fontWeight: '600', marginRight: 8 }}>
            {deadlineLabel(task.deadline!, todayLabel, yesterdayLabel, tomorrowLabel, locale)}
          </Text>
        )}
        {/* Grouped dots: priority + project */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[s.dot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
          {proj && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: proj.color }} />}
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

// ─── Board Card ─────────────────────────────────────────────────────────────
function BoardCard({ task, onPress, onToggle, c, isDark, todayLabel, yesterdayLabel, tomorrowLabel, locale }: {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
  c: any;
  isDark: boolean;
  todayLabel: string;
  yesterdayLabel: string;
  tomorrowLabel: string;
  locale: string;
}) {
  const overdue = isOverdue(task);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ marginBottom: 8 }}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={s.boardCard}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7 }}>
          <TouchableOpacity
            onPress={e => { e.stopPropagation(); onToggle(); }}
            style={[s.subCheck, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent', marginTop: 1 }]}>
            {task.status === 'done' && <IconSymbol name="checkmark" size={10} color="#fff" />}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={3} style={{ color: c.text, fontSize: 12, fontWeight: '600', lineHeight: 17, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }}>
              {task.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 7, gap: 5 }}>
              <View style={[s.dot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
              {task.deadline && (
                <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 10, fontWeight: '500' }}>
                  {deadlineLabel(task.deadline!, todayLabel, yesterdayLabel, tomorrowLabel, locale)}
                </Text>
              )}
            </View>
          </View>
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

// ─── Calendar Grid ───────────────────────────────────────────────────────────
function CalendarGrid({ year, month, markedDays, selectedDate, todayDate, weeks, onPrevMonth, onNextMonth, onSelectDay, c, months, weekdays }: {
  year: number; month: number; markedDays: Set<string>; selectedDate: string | null;
  todayDate: Date; weeks: (number | null)[][]; onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDay: (d: Date) => void; c: any;
  months: string[]; weekdays: string[];
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity onPress={onPrevMonth} style={s.navBtn}>
          <IconSymbol name="chevron.left" size={20} color={c.sub} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
          {months[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={s.navBtn}>
          <IconSymbol name="chevron.right" size={20} color={c.sub} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {weekdays.map(d => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
          {week.map((day, di) => {
            if (!day) return <View key={di} style={{ flex: 1 }} />;
            const dayDate = new Date(year, month, day);
            const keyStr = `${year}-${month}-${day}`;
            const isToday = dayDate.toDateString() === todayDate.toDateString();
            const isSel = selectedDate === dayDate.toDateString();
            const hasMark = markedDays.has(keyStr);
            return (
              <TouchableOpacity
                key={di}
                onPress={() => onSelectDay(dayDate)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                <View style={[s.dayCell, isSel && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }]}>
                  <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                </View>
                {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.accent }]} />}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </>
  );
}

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
  compactCard:    { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  boardCard:      { borderRadius: 13, padding: 11, overflow: 'hidden' },
  taskTitle:      { fontSize: 14, fontWeight: '600' },
  checkbox:       { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot:            { width: 8, height: 8, borderRadius: 4 },
  colorDot:       { width: 12, height: 12, borderRadius: 4 },
  badge:          { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  progressBg:     { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:   { height: '100%', borderRadius: 2 },
  pct:            { fontSize: 10, fontWeight: '600', minWidth: 26 },
  colLabel:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  emptyCol:       { borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 24, alignItems: 'center' },
  fab:            { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 108 : 88, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:   { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:          { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
  detailSheet:    { borderRadius: 24, borderWidth: 1, padding: 20, maxHeight: Dimensions.get('window').height * 0.88, overflow: 'hidden' },
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
