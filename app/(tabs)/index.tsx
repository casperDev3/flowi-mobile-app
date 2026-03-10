import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';
import type { Project } from '../projects';

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';
type SortBy = 'priority' | 'newest' | 'oldest' | 'name' | 'deadline';
type Filter = 'all' | 'active' | 'done';
type ViewMode = 'list' | 'board';
type CardDetail = 'compact' | 'detailed';

interface SubTask { id: string; title: string; done: boolean; }

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
}

const PRIORITY: Record<Priority, { label: string; color: string }> = {
  high:   { label: 'Високий', color: '#EF4444' },
  medium: { label: 'Середній', color: '#F59E0B' },
  low:    { label: 'Низький',  color: '#10B981' },
};

const SORT_OPTIONS: { key: SortBy; label: string; icon: string }[] = [
  { key: 'deadline',  label: 'Дедлайн',   icon: 'flag' },
  { key: 'priority',  label: 'Пріоритет', icon: 'exclamationmark.circle' },
  { key: 'newest',    label: 'Нові',      icon: 'arrow.down.circle' },
  { key: 'oldest',    label: 'Старі',     icon: 'arrow.up.circle' },
  { key: 'name',      label: 'А–Я',       icon: 'textformat.abc' },
];

const DEADLINE_PRESETS = [
  { label: 'Сьогодні', days: 0 },
  { label: 'Завтра',   days: 1 },
  { label: '+3 дні',   days: 3 },
  { label: '+7 днів',  days: 7 },
];

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return 'Завтра';
  if (diff > 1 && diff <= 7) return date.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'short' });
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
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

function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  if (d.toDateString() === today.toDateString()) return 'Сьогодні';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчора';
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return 'Завтра';
  if (diff > 1 && diff <= 7) return `+${diff} дн`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export default function TasksScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { setPendingTask } = useTimerContext();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<SortBy>('deadline');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [cardDetail, setCardDetail] = useState<CardDetail>('detailed');

  // Search & extra filters
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newEstHours, setNewEstHours] = useState('');
  const [newEstMins, setNewEstMins] = useState('');
  const [newDeadline, setNewDeadline] = useState<string | null>(null);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [showDeadlineCal, setShowDeadlineCal] = useState(false);
  const [deadlineCalYear, setDeadlineCalYear] = useState(today.getFullYear());
  const [deadlineCalMonth, setDeadlineCalMonth] = useState(today.getMonth());

  const [selected, setSelected] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [dateFilter, setDateFilter] = useState<string | null>(null);

  // Subtask context menu
  const [subtaskMenu, setSubtaskMenu] = useState<{ taskId: string; sub: SubTask; idx: number; total: number } | null>(null);
  const [editSubState, setEditSubState] = useState<{ taskId: string; sub: SubTask; text: string } | null>(null);

  // Load from storage
  useEffect(() => {
    Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Project[]>('projects', []),
    ]).then(([t, p]) => {
      setTasks(t);
      setProjects(p);
      setInitialized(true);
    });
  }, []);

  // Save to storage
  useEffect(() => {
    if (initialized) saveData('tasks', tasks);
  }, [tasks, initialized]);

  const doneCount   = tasks.filter(t => t.status === 'done').length;
  const activeCount = tasks.filter(t => t.status === 'active').length;
  const efficiency  = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const totalSubtasks = tasks.reduce((acc, t) => acc + t.subtasks.length, 0);
  const doneSubtasks  = tasks.reduce((acc, t) => acc + t.subtasks.filter(s => s.done).length, 0);

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
    return sorted.filter(t => {
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
  }, [sorted, filter, dateFilter, search, filterProject, filterPriority]);

  const groups = useMemo(() => {
    const map: Record<string, { label: string; tasks: Task[] }> = {};
    const order: string[] = [];
    filtered.forEach(t => {
      let key: string;
      let label: string;
      if (sort === 'deadline') {
        if (!t.deadline) {
          key = '__no_deadline__';
          label = 'Без дедлайну';
        } else {
          const d = new Date(t.deadline);
          key = d.toDateString();
          label = groupLabel(d);
        }
      } else {
        const d = new Date(t.createdAt);
        key = d.toDateString();
        label = groupLabel(d);
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

  const hasActiveFilters = filter !== 'all' || dateFilter || filterProject || filterPriority || search.trim();

  const addTask = useCallback(() => {
    if (!newTitle.trim()) return;
    const estH = parseInt(newEstHours || '0', 10);
    const estM = parseInt(newEstMins || '0', 10);
    const estimatedMinutes = estH * 60 + estM || undefined;
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
    }, ...p]);
    setNewTitle(''); setNewDesc(''); setNewPriority('medium');
    setNewEstHours(''); setNewEstMins(''); setNewDeadline(null);
    setNewProjectId(null); setShowDeadlineCal(false); setShowAdd(false);
  }, [newTitle, newDesc, newPriority, newEstHours, newEstMins, newDeadline, newProjectId]);

  const deleteTask = useCallback((id: string) => {
    setTasks(p => p.filter(t => t.id !== id));
    if (selected?.id === id) setSelected(null);
  }, [selected]);

  const toggleTask = useCallback((id: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
      return { ...t, status, subtasks: status === 'done' ? t.subtasks.map(s => ({ ...s, done: true })) : t.subtasks };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === id ? patch(prev) : prev);
  }, []);

  const addSubtask = useCallback((taskId: string) => {
    if (!newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    const patch = (t: Task): Task => t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setNewSubtask('');
  }, [newSubtask]);

  const toggleSubtask = useCallback((taskId: string, subId: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
      return { ...t, subtasks, status: subtasks.length > 0 && subtasks.every(s => s.done) ? 'done' : 'active' };
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

  const confirmEditSub = useCallback(() => {
    if (!editSubState || !editSubState.text.trim()) return;
    const { taskId, sub, text } = editSubState;
    const patch = (t: Task): Task => t.id !== taskId ? t : {
      ...t, subtasks: t.subtasks.map(s => s.id !== sub.id ? s : { ...s, title: text.trim() }),
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setEditSubState(null);
  }, [editSubState]);

  const showSubtaskActions = useCallback((taskId: string, sub: SubTask, idx: number, total: number) => {
    setSubtaskMenu({ taskId, sub, idx, total });
  }, []);

  const updateTaskProject = useCallback((taskId: string, projectId: string | null) => {
    const patch = (t: Task): Task => t.id !== taskId ? t : { ...t, projectId: projectId ?? undefined };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  }, []);

  const startTracking = useCallback((task: Task) => {
    setPendingTask(task.title);
    setSelected(null);
    router.push('/(tabs)/time');
  }, [setPendingTask, router]);

  const clearAllFilters = useCallback(() => {
    setFilter('all');
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

  const selectedTask = selected ? tasks.find(t => t.id === selected.id) ?? selected : null;
  const activeTasks = filtered.filter(t => t.status === 'active');
  const doneTasks   = filtered.filter(t => t.status === 'done');

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>Завдання</Text>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <TouchableOpacity
                onPress={() => router.push('/projects')}
                style={[s.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name="folder" size={17} color={c.sub} />
              </TouchableOpacity>
              {viewMode === 'list' && (
                <TouchableOpacity
                  onPress={() => setCardDetail(v => v === 'detailed' ? 'compact' : 'detailed')}
                  style={[s.headerBtn, { backgroundColor: cardDetail === 'compact' ? c.accent + '20' : c.dim, borderColor: cardDetail === 'compact' ? c.accent : c.border }]}>
                  <IconSymbol name={cardDetail === 'detailed' ? 'rectangle.stack' : 'rectangle.stack.fill'} size={17} color={cardDetail === 'compact' ? c.accent : c.sub} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => setViewMode(v => v === 'list' ? 'board' : 'list')}
                style={[s.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
                <IconSymbol name={viewMode === 'list' ? 'square.grid.2x2' : 'list.bullet'} size={17} color={c.sub} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowFilterSheet(true)}
                style={[s.headerBtn, { backgroundColor: hasActiveFilters ? c.accent : c.dim, borderColor: hasActiveFilters ? c.accent : c.border }]}>
                <IconSymbol name="line.3.horizontal.decrease" size={17} color={hasActiveFilters ? '#fff' : c.sub} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Search bar */}
          <View style={[s.searchBar, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="magnifyingglass" size={15} color={c.sub} />
            <TextInput
              placeholder="Пошук завдань..."
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
                {filter !== 'all' && (
                  <TouchableOpacity
                    onPress={() => setFilter('all')}
                    style={[s.activeChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
                    <Text style={[s.activeChipText, { color: c.accent }]}>
                      {filter === 'active' ? 'Активні' : 'Виконані'}
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
                      {new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                    </Text>
                    <IconSymbol name="xmark" size={10} color={c.accent} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={clearAllFilters}
                  style={[s.activeChip, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                  <Text style={[s.activeChipText, { color: '#EF4444' }]}>Скинути все</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

          {/* Stats */}
          <View style={{ marginTop: hasActiveFilters ? 12 : 16, marginBottom: 16, gap: 8 }}>
            <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
              <StatCell value={activeCount}        label="Активні"      color={c.accent}  sub={c.sub} />
              <View style={{ width: 1, backgroundColor: c.border }} />
              <StatCell value={doneCount}          label="Виконані"     color="#10B981"   sub={c.sub} />
              <View style={{ width: 1, backgroundColor: c.border }} />
              <StatCell value={`${efficiency}%`}  label="Ефективність" color={c.accent}  sub={c.sub} />
            </View>
            {totalSubtasks > 0 && (
              <View style={[s.subtaskStatRow, { borderColor: c.border, backgroundColor: c.card }]}>
                <IconSymbol name="list.bullet.circle.fill" size={14} color="#6366F1" />
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '500', marginLeft: 7 }}>Підзавдання</Text>
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
          </View>

          {/* Empty state */}
          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <IconSymbol name="checklist" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>
                {search.trim() ? 'Нічого не знайдено' : 'Немає завдань'}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>
                {search.trim() ? 'Спробуйте інший запит' : 'Натисніть + щоб додати'}
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
                                  {deadlineLabel(task.deadline)}
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

          {/* BOARD VIEW */}
          {viewMode === 'board' && filtered.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.accent }} />
                  <Text style={[s.colLabel, { color: c.sub }]}>Активні · {activeTasks.length}</Text>
                </View>
                {activeTasks.map(task => (
                  <BoardCard key={task.id} task={task} onPress={() => setSelected(task)} onToggle={() => toggleTask(task.id)} c={c} isDark={isDark} />
                ))}
                {activeTasks.length === 0 && (
                  <View style={[s.emptyCol, { borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontSize: 11 }}>Порожньо</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#10B981' }} />
                  <Text style={[s.colLabel, { color: c.sub }]}>Виконані · {doneTasks.length}</Text>
                </View>
                {doneTasks.map(task => (
                  <BoardCard key={task.id} task={task} onPress={() => setSelected(task)} onToggle={() => toggleTask(task.id)} c={c} isDark={isDark} />
                ))}
                {doneTasks.length === 0 && (
                  <View style={[s.emptyCol, { borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontSize: 11 }}>Порожньо</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.fab, { backgroundColor: c.accent }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ─── Filter & Sort Bottom Sheet ─── */}
      <Modal visible={showFilterSheet} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowFilterSheet(false)}>
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
                <Text style={[s.sheetTitle, { color: c.text }]}>Фільтри та сортування</Text>

                {/* Calendar filter */}
                <Text style={[s.label, { color: c.sub }]}>Дата створення</Text>
                <TouchableOpacity
                  onPress={() => { setShowFilterSheet(false); setShowCal(true); }}
                  style={[s.filterActionBtn, { backgroundColor: dateFilter ? c.accent + '20' : c.dim, borderColor: dateFilter ? c.accent + '60' : c.border }]}>
                  <IconSymbol name="calendar" size={15} color={dateFilter ? c.accent : c.sub} />
                  <Text style={{ color: dateFilter ? c.accent : c.sub, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 10 }}>
                    {dateFilter
                      ? new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Вибрати дату'}
                  </Text>
                  {dateFilter && (
                    <TouchableOpacity onPress={() => setDateFilter(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <IconSymbol name="xmark.circle.fill" size={16} color={c.accent} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* Status filter */}
                <Text style={[s.label, { color: c.sub }]}>Статус</Text>
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
                        {f === 'all' ? 'Всі' : f === 'active' ? 'Активні' : 'Виконані'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Priority filter */}
                <Text style={[s.label, { color: c.sub }]}>Пріоритет</Text>
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
                    <Text style={[s.label, { color: c.sub }]}>Проект</Text>
                    <View style={{ gap: 7 }}>
                      <TouchableOpacity
                        onPress={() => setFilterProject(null)}
                        style={[s.filterActionBtn, { backgroundColor: !filterProject ? c.accent + '15' : c.dim, borderColor: !filterProject ? c.accent + '50' : c.border }]}>
                        <IconSymbol name="tray" size={14} color={!filterProject ? c.accent : c.sub} />
                        <Text style={{ color: !filterProject ? c.accent : c.sub, fontSize: 13, fontWeight: '600', marginLeft: 10 }}>Всі проекти</Text>
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
                <Text style={[s.label, { color: c.sub }]}>Сортування</Text>
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
                  <Text style={{ color: '#EF4444', fontWeight: '700', marginLeft: 7 }}>Скинути всі фільтри</Text>
                </TouchableOpacity>

                <View style={{ height: 8 }} />
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Calendar filter Modal ─── */}
      <Modal visible={showCal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
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
                  onPrevMonth={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                  onNextMonth={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                  onSelectDay={(dayDate) => { setDateFilter(dayDate.toDateString() === dateFilter ? null : dayDate.toDateString()); setShowCal(false); }}
                  c={c}
                />
                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>Скинути фільтр</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Task Modal ─── */}
      <Modal visible={showAdd} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
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
                  <Text style={[s.sheetTitle, { color: c.text }]}>Нове завдання</Text>

                  <TextInput
                    placeholder="Назва"
                    placeholderTextColor={c.sub}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />
                  <TextInput
                    placeholder="Опис (необов'язково)"
                    placeholderTextColor={c.sub}
                    value={newDesc}
                    onChangeText={setNewDesc}
                    style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]}
                  />

                  {/* Priority */}
                  <Text style={[s.label, { color: c.sub }]}>Пріоритет</Text>
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
                      <Text style={[s.label, { color: c.sub }]}>Проект</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 7 }}>
                          <TouchableOpacity
                            onPress={() => setNewProjectId(null)}
                            style={[s.sortChip, { backgroundColor: !newProjectId ? c.accent + '20' : c.dim, borderColor: !newProjectId ? c.accent : c.border }]}>
                            <Text style={{ color: !newProjectId ? c.accent : c.sub, fontSize: 12, fontWeight: '600' }}>Без проекту</Text>
                          </TouchableOpacity>
                          {projects.map(p => (
                            <TouchableOpacity
                              key={p.id}
                              onPress={() => setNewProjectId(p.id === newProjectId ? null : p.id)}
                              style={[s.sortChip, { backgroundColor: newProjectId === p.id ? p.color + '20' : c.dim, borderColor: newProjectId === p.id ? p.color : c.border }]}>
                              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: newProjectId === p.id ? p.color : c.sub }} />
                              <Text style={{ color: newProjectId === p.id ? p.color : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>{p.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </>
                  )}

                  {/* Estimated time */}
                  <Text style={[s.label, { color: c.sub }]}>Оцінка часу</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      placeholder="Год"
                      placeholderTextColor={c.sub}
                      value={newEstHours}
                      onChangeText={setNewEstHours}
                      keyboardType="number-pad"
                      style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                    />
                    <TextInput
                      placeholder="Хвил"
                      placeholderTextColor={c.sub}
                      value={newEstMins}
                      onChangeText={setNewEstMins}
                      keyboardType="number-pad"
                      style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]}
                    />
                  </View>

                  {/* Deadline */}
                  <Text style={[s.label, { color: c.sub }]}>Дедлайн</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
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
                        onPress={() => setShowDeadlineCal(v => !v)}
                        style={[s.sortChip, { backgroundColor: showDeadlineCal ? c.accent + '20' : c.dim, borderColor: showDeadlineCal ? c.accent : c.border }]}>
                        <IconSymbol name="calendar" size={13} color={showDeadlineCal ? c.accent : c.sub} />
                        <Text style={{ color: showDeadlineCal ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>Вибрати</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>

                  {newDeadline && (
                    <View style={[s.badge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50', alignSelf: 'flex-start', marginBottom: 8 }]}>
                      <IconSymbol name="calendar" size={11} color={c.accent} />
                      <Text style={{ color: c.accent, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                        {new Date(newDeadline).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
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
                        onPrevMonth={() => { if (deadlineCalMonth === 0) { setDeadlineCalMonth(11); setDeadlineCalYear(y => y - 1); } else setDeadlineCalMonth(m => m - 1); }}
                        onNextMonth={() => { if (deadlineCalMonth === 11) { setDeadlineCalMonth(0); setDeadlineCalYear(y => y + 1); } else setDeadlineCalMonth(m => m + 1); }}
                        onSelectDay={(d) => { setNewDeadline(d.toISOString()); setShowDeadlineCal(false); }}
                        c={c}
                      />
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={addTask} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Додати</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selectedTask} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {selectedTask && (
                <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.detailSheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.handleRow}>
                      <View style={{ flex: 1 }} />
                      <View style={[s.handle, { backgroundColor: c.border }]} />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <IconSymbol name="xmark" size={17} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10, marginBottom: 4 }}>
                      <View style={[s.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                        <IconSymbol name="calendar" size={11} color={c.sub} />
                        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '500', marginLeft: 4 }}>
                          {new Date(selectedTask.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                        </Text>
                      </View>
                      {selectedTask.deadline && (
                        <View style={[s.badge, { backgroundColor: isOverdue(selectedTask) ? '#EF444420' : c.dim, borderColor: isOverdue(selectedTask) ? '#EF444440' : c.border }]}>
                          <IconSymbol name="flag" size={11} color={isOverdue(selectedTask) ? '#EF4444' : c.sub} />
                          <Text style={{ color: isOverdue(selectedTask) ? '#EF4444' : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                            Дедлайн: {new Date(selectedTask.deadline).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
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
                    </View>

                    {/* Project changer */}
                    {projects.length > 0 && (
                      <View style={{ marginTop: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <IconSymbol name="folder" size={12} color={c.sub} />
                          <Text style={[s.label, { color: c.sub, marginLeft: 5, marginTop: 0, marginBottom: 0 }]}>ПРОЕКТ</Text>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: 'row', gap: 7 }}>
                            <TouchableOpacity
                              onPress={() => updateTaskProject(selectedTask.id, null)}
                              style={[s.sortChip, {
                                backgroundColor: !selectedTask.projectId ? c.accent + '20' : c.dim,
                                borderColor: !selectedTask.projectId ? c.accent : c.border,
                              }]}>
                              {!selectedTask.projectId && <IconSymbol name="checkmark" size={11} color={c.accent} />}
                              <Text style={{ color: !selectedTask.projectId ? c.accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: !selectedTask.projectId ? 4 : 0 }}>
                                Без проекту
                              </Text>
                            </TouchableOpacity>
                            {projects.map(proj => (
                              <TouchableOpacity
                                key={proj.id}
                                onPress={() => updateTaskProject(selectedTask.id, proj.id)}
                                style={[s.sortChip, {
                                  backgroundColor: selectedTask.projectId === proj.id ? proj.color + '20' : c.dim,
                                  borderColor: selectedTask.projectId === proj.id ? proj.color : c.border,
                                }]}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: selectedTask.projectId === proj.id ? proj.color : c.sub }} />
                                {selectedTask.projectId === proj.id && <IconSymbol name="checkmark" size={11} color={proj.color} style={{ marginLeft: 4 }} />}
                                <Text style={{ color: selectedTask.projectId === proj.id ? proj.color : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                                  {proj.name}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    )}

                    {selectedTask.subtasks.length > 0 && (
                      <View style={{ marginTop: 14, marginBottom: 4 }}>
                        <View style={s.progressBg}>
                          <View style={[s.progressFill, { width: `${getProgress(selectedTask)}%`, backgroundColor: selectedTask.status === 'done' ? '#10B981' : c.accent }]} />
                        </View>
                        <Text style={[s.label, { color: c.sub, marginTop: 5 }]}>{getProgress(selectedTask)}% виконано</Text>
                      </View>
                    )}

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
                      <IconSymbol name="list.bullet" size={13} color={c.sub} />
                      <Text style={[s.label, { color: c.sub, marginLeft: 5 }]}>
                        ПІДЗАВДАННЯ · {selectedTask.subtasks.filter(x => x.done).length}/{selectedTask.subtasks.length}
                      </Text>
                    </View>

                    <View style={{ gap: 7 }}>
                      {selectedTask.subtasks.map((sub, idx) => (
                        <TouchableOpacity
                          key={sub.id}
                          activeOpacity={0.7}
                          onPress={() => toggleSubtask(selectedTask.id, sub.id)}
                          onLongPress={() => showSubtaskActions(selectedTask.id, sub, idx, selectedTask.subtasks.length)}
                          delayLongPress={350}
                          style={[s.subRow, { backgroundColor: c.dim, borderColor: sub.done ? '#10B98130' : c.border }]}>
                          <View style={[s.subCheck, { borderColor: sub.done ? '#10B981' : c.border, backgroundColor: sub.done ? '#10B981' : 'transparent' }]}>
                            {sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                          </View>
                          <Text style={[s.subTitle, { color: sub.done ? c.sub : c.text, textDecorationLine: sub.done ? 'line-through' : 'none', flex: 1, marginHorizontal: 10 }]}>{sub.title}</Text>
                          <TouchableOpacity onPress={() => showSubtaskActions(selectedTask.id, sub, idx, selectedTask.subtasks.length)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <IconSymbol name="ellipsis" size={14} color={c.sub} />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                      <View style={[s.addSubRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                        <IconSymbol name="plus" size={15} color={c.sub} />
                        <TextInput
                          placeholder="Додати підзавдання..."
                          placeholderTextColor={c.sub}
                          value={newSubtask}
                          onChangeText={setNewSubtask}
                          onSubmitEditing={() => addSubtask(selectedTask.id)}
                          returnKeyType="done"
                          style={[s.subInput, { color: c.text, flex: 1, marginLeft: 8 }]}
                        />
                        {newSubtask.trim() ? (
                          <TouchableOpacity onPress={() => addSubtask(selectedTask.id)}>
                            <IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    {selectedTask.status === 'active' && (
                      <TouchableOpacity
                        onPress={() => startTracking(selectedTask)}
                        style={[s.btn, { marginTop: 18, backgroundColor: '#6366F1EE' }]}>
                        <IconSymbol name="timer" size={15} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 7 }}>Почати трекінг</Text>
                      </TouchableOpacity>
                    )}

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        onPress={() => deleteTask(selectedTask.id)}
                        style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                        <IconSymbol name="trash" size={15} color="#EF4444" />
                        <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>Видалити</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => toggleTask(selectedTask.id)}
                        style={[s.btn, { flex: 2, backgroundColor: selectedTask.status === 'done' ? '#374151' : c.accent }]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{selectedTask.status === 'done' ? 'Відновити' : 'Виконано'}</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </BlurView>
              )}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Subtask Context Menu ─── */}
      <Modal visible={!!subtaskMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSubtaskMenu(null)}>
        <Pressable style={[s.overlay, { justifyContent: 'flex-end' }]} onPress={() => setSubtaskMenu(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            {subtaskMenu && (
              <BlurView intensity={isDark ? 60 : 80} tint={isDark ? 'dark' : 'light'} style={[s.contextMenu, { borderColor: c.border, backgroundColor: c.sheet }]}>
                {/* Title */}
                <View style={[s.contextHeader, { borderBottomColor: c.border }]}>
                  <View style={[s.subCheck, { borderColor: subtaskMenu.sub.done ? '#10B981' : c.border, backgroundColor: subtaskMenu.sub.done ? '#10B981' : 'transparent' }]}>
                    {subtaskMenu.sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                  </View>
                  <Text style={[s.contextTitle, { color: c.text }]} numberOfLines={2}>{subtaskMenu.sub.title}</Text>
                </View>

                {/* Actions */}
                <View style={{ gap: 2 }}>
                  <ContextMenuItem
                    icon="pencil"
                    label="Редагувати"
                    color={c.text}
                    iconColor={c.accent}
                    bgColor={c.accent + '12'}
                    onPress={() => {
                      setSubtaskMenu(null);
                      setEditSubState({ taskId: subtaskMenu.taskId, sub: subtaskMenu.sub, text: subtaskMenu.sub.title });
                    }}
                    c={c}
                  />
                  <ContextMenuItem
                    icon="doc.on.doc"
                    label="Дублювати"
                    color={c.text}
                    iconColor="#6366F1"
                    bgColor="#6366F112"
                    onPress={() => {
                      duplicateSubtask(subtaskMenu.taskId, subtaskMenu.sub);
                      setSubtaskMenu(null);
                    }}
                    c={c}
                  />
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
                  <ContextMenuItem
                    icon="arrow.up"
                    label="Перемістити вгору"
                    color={c.text}
                    iconColor="#F59E0B"
                    bgColor="#F59E0B12"
                    disabled={subtaskMenu.idx === 0}
                    onPress={() => {
                      moveSubtask(subtaskMenu.taskId, subtaskMenu.sub.id, 'up');
                      setSubtaskMenu(prev => prev ? { ...prev, idx: prev.idx - 1 } : null);
                    }}
                    c={c}
                  />
                  <ContextMenuItem
                    icon="arrow.down"
                    label="Перемістити вниз"
                    color={c.text}
                    iconColor="#F59E0B"
                    bgColor="#F59E0B12"
                    disabled={subtaskMenu.idx === subtaskMenu.total - 1}
                    onPress={() => {
                      moveSubtask(subtaskMenu.taskId, subtaskMenu.sub.id, 'down');
                      setSubtaskMenu(prev => prev ? { ...prev, idx: prev.idx + 1 } : null);
                    }}
                    c={c}
                  />
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
                  <ContextMenuItem
                    icon="trash"
                    label="Видалити"
                    color="#EF4444"
                    iconColor="#EF4444"
                    bgColor="#EF444415"
                    onPress={() => {
                      deleteSubtask(subtaskMenu.taskId, subtaskMenu.sub.id);
                      setSubtaskMenu(null);
                    }}
                    c={c}
                  />
                </View>

                {/* Cancel */}
                <TouchableOpacity
                  onPress={() => setSubtaskMenu(null)}
                  style={[s.contextCancel, { backgroundColor: c.dim, borderColor: c.border }]}>
                  <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600' }}>Скасувати</Text>
                </TouchableOpacity>
              </BlurView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ─── Edit Subtask Modal ─── */}
      <Modal visible={!!editSubState} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setEditSubState(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setEditSubState(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <Text style={[s.sheetTitle, { color: c.text, marginBottom: 14 }]}>Редагувати підзавдання</Text>
                <TextInput
                  value={editSubState?.text ?? ''}
                  onChangeText={t => setEditSubState(prev => prev ? { ...prev, text: t } : null)}
                  placeholder="Назва підзавдання"
                  placeholderTextColor={c.sub}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={confirmEditSub}
                  style={[s.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border, borderWidth: 1 }]}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                  <TouchableOpacity onPress={() => setEditSubState(null)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmEditSub} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Context Menu Item ────────────────────────────────────────────────────────
function ContextMenuItem({ icon, label, color, iconColor, bgColor, onPress, disabled, c }: {
  icon: string; label: string; color: string; iconColor: string; bgColor: string;
  onPress: () => void; disabled?: boolean; c: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.65}
      style={[s.contextItem, { opacity: disabled ? 0.35 : 1 }]}>
      <View style={[s.contextIconWrap, { backgroundColor: bgColor }]}>
        <IconSymbol name={icon as any} size={16} color={iconColor} />
      </View>
      <Text style={{ color, fontSize: 15, fontWeight: '500', flex: 1, marginLeft: 13 }}>{label}</Text>
      <IconSymbol name="chevron.right" size={12} color={c.sub} style={{ opacity: 0.5 }} />
    </TouchableOpacity>
  );
}

// ─── Compact Card ────────────────────────────────────────────────────────────
function CompactCard({ task, onPress, onToggle, c, isDark, projects }: {
  task: Task; onPress: () => void; onToggle: () => void; c: any; isDark: boolean; projects: Project[];
}) {
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.compactCard, { borderColor: overdue ? '#EF444450' : c.border }]}>
        <TouchableOpacity
          onPress={e => { e.stopPropagation(); onToggle(); }}
          style={[s.subCheck, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent' }]}>
          {task.status === 'done' && <IconSymbol name="checkmark" size={10} color="#fff" />}
        </TouchableOpacity>
        <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginHorizontal: 10, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }} numberOfLines={1}>
          {task.title}
        </Text>
        {proj && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: proj.color, marginRight: 6 }} />}
        {task.deadline && (
          <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 10, fontWeight: '600', marginRight: 8 }}>
            {deadlineLabel(task.deadline)}
          </Text>
        )}
        <View style={[s.dot, { backgroundColor: PRIORITY[task.priority].color }]} />
      </BlurView>
    </TouchableOpacity>
  );
}

// ─── Board Card ─────────────────────────────────────────────────────────────
function BoardCard({ task, onPress, onToggle, c, isDark }: {
  task: Task; onPress: () => void; onToggle: () => void; c: any; isDark: boolean;
}) {
  const overdue = isOverdue(task);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={{ marginBottom: 8 }}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.boardCard, { borderColor: overdue ? '#EF444450' : c.border }]}>
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
              <View style={[s.dot, { backgroundColor: PRIORITY[task.priority].color }]} />
              {task.deadline && (
                <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 10, fontWeight: '500' }}>
                  {deadlineLabel(task.deadline)}
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
function CalendarGrid({ year, month, markedDays, selectedDate, todayDate, weeks, onPrevMonth, onNextMonth, onSelectDay, c }: {
  year: number; month: number; markedDays: Set<string>; selectedDate: string | null;
  todayDate: Date; weeks: (number | null)[][]; onPrevMonth: () => void; onNextMonth: () => void;
  onSelectDay: (d: Date) => void; c: any;
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <TouchableOpacity onPress={onPrevMonth} style={s.navBtn}>
          <IconSymbol name="chevron.left" size={20} color={c.sub} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
          {MONTHS_UA[month]} {year}
        </Text>
        <TouchableOpacity onPress={onNextMonth} style={s.navBtn}>
          <IconSymbol name="chevron.right" size={20} color={c.sub} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', marginBottom: 6 }}>
        {WEEKDAYS_SHORT.map(d => (
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
  compactCard:    { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  boardCard:      { borderRadius: 13, borderWidth: 1, padding: 11, overflow: 'hidden' },
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
  // Subtask context menu
  contextMenu:    { borderRadius: 24, borderWidth: 1, padding: 16, overflow: 'hidden' },
  contextHeader:  { flexDirection: 'row', alignItems: 'center', paddingBottom: 14, marginBottom: 10, borderBottomWidth: 1 },
  contextTitle:   { fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10, lineHeight: 20 },
  contextItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  contextIconWrap:{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  contextCancel:  { marginTop: 12, paddingVertical: 13, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
});
