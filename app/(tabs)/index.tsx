import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo, useState } from 'react';
import {
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

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';
type SortBy = 'priority' | 'newest' | 'oldest' | 'name';
type Filter = 'all' | 'active' | 'done';

interface SubTask { id: string; title: string; done: boolean; }

interface Task {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  subtasks: SubTask[];
  createdAt: Date;
}

const PRIORITY: Record<Priority, { label: string; color: string }> = {
  high:   { label: 'Високий', color: '#EF4444' },
  medium: { label: 'Середній', color: '#F59E0B' },
  low:    { label: 'Низький',  color: '#10B981' },
};

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'priority', label: 'Пріоритет' },
  { key: 'newest',   label: 'Нові' },
  { key: 'oldest',   label: 'Старі' },
  { key: 'name',     label: 'А–Я' },
];

const d = (daysAgo: number) => {
  const dt = new Date();
  dt.setDate(dt.getDate() - daysAgo);
  return dt;
};

const INITIAL: Task[] = [
  { id: '1', title: 'Розробити UI дизайн',      description: 'Макети для мобільного додатку', priority: 'high',   status: 'active', subtasks: [{ id: 's1', title: 'Головний екран', done: true }, { id: 's2', title: 'Екран профілю', done: false }], createdAt: d(0) },
  { id: '2', title: 'Написати документацію',     description: 'Описати API та архітектуру',    priority: 'medium', status: 'active', subtasks: [{ id: 's3', title: 'README', done: true }, { id: 's4', title: 'API довідник', done: false }],     createdAt: d(0) },
  { id: '3', title: 'Налаштувати CI/CD',         description: '',                              priority: 'low',    status: 'done',   subtasks: [],                                                                                                    createdAt: d(1) },
  { id: '4', title: 'Code review',               description: 'Перевірити pull request #42',   priority: 'high',   status: 'active', subtasks: [],                                                                                                    createdAt: d(1) },
  { id: '5', title: 'Планування спринту',        description: '',                              priority: 'medium', status: 'done',   subtasks: [{ id: 's5', title: 'Backlog grooming', done: true }],                                                 createdAt: d(3) },
];

const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];

function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

function getProgress(t: Task) {
  if (t.status === 'done') return 100;
  if (!t.subtasks.length) return 0;
  return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export default function TasksScreen() {
  const isDark = useColorScheme() === 'dark';
  const [tasks, setTasks] = useState<Task[]>(INITIAL);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortBy>('newest');
  const [dateFilter, setDateFilter] = useState<string | null>(null); // toDateString()

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');

  const [selected, setSelected] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear]  = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  // Derived
  const doneCount   = tasks.filter(t => t.status === 'done').length;
  const activeCount = tasks.filter(t => t.status === 'active').length;
  const efficiency  = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach(t => set.add(`${t.createdAt.getFullYear()}-${t.createdAt.getMonth()}-${t.createdAt.getDate()}`));
    return set;
  }, [tasks]);

  const sorted = useMemo(() => {
    const pOrd: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
    return [...tasks].sort((a, b) => {
      switch (sort) {
        case 'priority': return pOrd[a.priority] - pOrd[b.priority];
        case 'newest':   return b.createdAt.getTime() - a.createdAt.getTime();
        case 'oldest':   return a.createdAt.getTime() - b.createdAt.getTime();
        case 'name':     return a.title.localeCompare(b.title, 'uk');
      }
    });
  }, [tasks, sort]);

  const filtered = useMemo(() => {
    return sorted.filter(t => {
      if (filter !== 'all' && t.status !== filter) return false;
      if (dateFilter && t.createdAt.toDateString() !== dateFilter) return false;
      return true;
    });
  }, [sorted, filter, dateFilter]);

  // Group by date
  const groups = useMemo(() => {
    const map: Record<string, { label: string; tasks: Task[] }> = {};
    const order: string[] = [];
    filtered.forEach(t => {
      const key = t.createdAt.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(t.createdAt), tasks: [] }; order.push(key); }
      map[key].tasks.push(t);
    });
    return order.map(k => map[k]);
  }, [filtered]);

  // Actions
  const addTask = () => {
    if (!newTitle.trim()) return;
    setTasks(p => [{ id: Date.now().toString(), title: newTitle.trim(), description: newDesc.trim(), priority: newPriority, status: 'active', subtasks: [], createdAt: new Date() }, ...p]);
    setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setShowAdd(false);
  };

  const deleteTask = (id: string) => { setTasks(p => p.filter(t => t.id !== id)); if (selected?.id === id) setSelected(null); };

  const toggleTask = (id: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== id) return t;
      const status: Status = t.status === 'done' ? 'active' : 'done';
      return { ...t, status, subtasks: status === 'done' ? t.subtasks.map(s => ({ ...s, done: true })) : t.subtasks };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === id ? patch(prev) : prev);
  };

  const addSubtask = (taskId: string) => {
    if (!newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    const patch = (t: Task): Task => t.id === taskId ? { ...t, subtasks: [...t.subtasks, sub] } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
    setNewSubtask('');
  };

  const toggleSubtask = (taskId: string, subId: string) => {
    const patch = (t: Task): Task => {
      if (t.id !== taskId) return t;
      const subtasks = t.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
      return { ...t, subtasks, status: subtasks.length > 0 && subtasks.every(s => s.done) ? 'done' : 'active' };
    };
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  };

  const deleteSubtask = (taskId: string, subId: string) => {
    const patch = (t: Task): Task => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subId) } : t;
    setTasks(p => p.map(patch));
    setSelected(prev => prev?.id === taskId ? patch(prev) : prev);
  };

  const c = {
    bg1: isDark ? '#0C0C14' : '#F4F2FF',
    bg2: isDark ? '#14121E' : '#EAE6FF',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text: isDark ? '#F0EEFF' : '#1A1433',
    sub: isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  // Calendar helpers
  const firstDay = (() => { const d = new Date(calYear, calMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) calCells.push(i);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calWeeks = chunk(calCells, 7);

  const selectedTask = selected ? tasks.find(t => t.id === selected.id) ?? selected : null;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 104 : 84 }} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 10, marginBottom: 20, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>Завдання</Text>
            <TouchableOpacity onPress={() => setShowCal(true)} style={[s.headerBtn, { backgroundColor: dateFilter ? c.accent : c.dim, borderColor: dateFilter ? c.accent : c.border }]}>
              <IconSymbol name="calendar" size={17} color={dateFilter ? '#fff' : c.sub} />
            </TouchableOpacity>
          </View>

          {/* Date filter chip */}
          {dateFilter && (
            <TouchableOpacity
              onPress={() => setDateFilter(null)}
              style={[s.dateChip, { backgroundColor: c.accent + '20', borderColor: c.accent + '60' }]}>
              <IconSymbol name="calendar" size={13} color={c.accent} />
              <Text style={[{ color: c.accent, fontSize: 12, fontWeight: '600', marginLeft: 5 }]}>
                {new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
              </Text>
              <IconSymbol name="xmark" size={13} color={c.accent} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}

          {/* Stats */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
            <StatCell value={activeCount}   label="Активні"      color={c.accent} sub={c.sub} text={c.text} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={doneCount}     label="Виконані"     color="#10B981" sub={c.sub} text={c.text} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={`${efficiency}%`} label="Ефективність" color={c.accent} sub={c.sub} text={c.text} />
          </View>

          {/* Filter + Sort */}
          <View style={[s.filterRow, { backgroundColor: c.card, borderColor: c.border, marginTop: 12 }]}>
            {(['all', 'active', 'done'] as Filter[]).map(f => (
              <TouchableOpacity key={f} onPress={() => setFilter(f)} style={[s.filterBtn, filter === f && { backgroundColor: c.accent }]}>
                <Text style={[s.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? 'Всі' : f === 'active' ? 'Активні' : 'Виконані'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {SORT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setSort(opt.key)}
                  style={[s.sortChip, {
                    backgroundColor: sort === opt.key ? c.accent + '20' : c.dim,
                    borderColor: sort === opt.key ? c.accent : c.border,
                  }]}>
                  {sort === opt.key && <IconSymbol name="checkmark" size={11} color={c.accent} />}
                  <Text style={[s.sortLabel, { color: sort === opt.key ? c.accent : c.sub, marginLeft: sort === opt.key ? 4 : 0 }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Grouped task list */}
          {groups.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name="checklist" size={36} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '500' }}>Немає завдань</Text>
            </View>
          )}
          {groups.map(group => (
            <View key={group.label}>
              <Text style={[s.groupLabel, { color: c.sub }]}>{group.label}</Text>
              <View style={{ gap: 8 }}>
                {group.tasks.map(task => {
                  const prog = getProgress(task);
                  return (
                    <TouchableOpacity key={task.id} activeOpacity={0.7} onPress={() => setSelected(task)}>
                      <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[s.taskCard, { borderColor: c.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                          <TouchableOpacity
                            onPress={e => { e.stopPropagation(); toggleTask(task.id); }}
                            style={[s.checkbox, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent' }]}>
                            {task.status === 'done' && <IconSymbol name="checkmark" size={12} color="#fff" />}
                          </TouchableOpacity>
                          <Text style={[s.taskTitle, { color: c.text, flex: 1, marginHorizontal: 10, opacity: task.status === 'done' ? 0.5 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }]}>
                            {task.title}
                          </Text>
                          <View style={[s.dot, { backgroundColor: PRIORITY[task.priority].color }]} />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={[s.progressBg, { flex: 1 }]}>
                            <View style={[s.progressFill, { width: `${prog}%`, backgroundColor: task.status === 'done' ? '#10B981' : c.accent }]} />
                          </View>
                          <Text style={[s.pct, { color: c.sub }]}>{prog}%</Text>
                          {task.subtasks.length > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <IconSymbol name="list.bullet" size={12} color={c.sub} />
                              <Text style={[s.pct, { color: c.sub }]}>{task.subtasks.filter(x => x.done).length}/{task.subtasks.length}</Text>
                            </View>
                          )}
                        </View>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.fab, { backgroundColor: c.accent }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Calendar Modal */}
      <Modal visible={showCal} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={[s.handle, { backgroundColor: c.border }]} />

              {/* Month nav */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                  <IconSymbol name="chevron.left" size={20} color={c.sub} />
                </TouchableOpacity>
                <Text style={[{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }]}>
                  {MONTHS_UA[calMonth]} {calYear}
                </Text>
                <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
                  <IconSymbol name="chevron.right" size={20} color={c.sub} />
                </TouchableOpacity>
              </View>

              {/* Weekday headers */}
              <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                {WEEKDAYS_SHORT.map(d => (
                  <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                ))}
              </View>

              {/* Days */}
              {calWeeks.map((week, wi) => (
                <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                  {week.map((day, di) => {
                    if (!day) return <View key={di} style={{ flex: 1 }} />;
                    const dayDate = new Date(calYear, calMonth, day);
                    const keyStr = `${calYear}-${calMonth}-${day}`;
                    const isToday = dayDate.toDateString() === today.toDateString();
                    const isSelected = dateFilter === dayDate.toDateString();
                    const hasTask = markedDays.has(keyStr);
                    return (
                      <TouchableOpacity
                        key={di}
                        onPress={() => { setDateFilter(isSelected ? null : dayDate.toDateString()); setShowCal(false); }}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 5 }}>
                        <View style={[
                          s.dayCell,
                          isSelected && { backgroundColor: c.accent },
                          !isSelected && isToday && { borderWidth: 1.5, borderColor: c.accent },
                        ]}>
                          <Text style={{ color: isSelected ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSelected ? '700' : '400' }}>
                            {day}
                          </Text>
                        </View>
                        {hasTask && !isSelected && <View style={[s.daydot, { backgroundColor: c.accent }]} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              {dateFilter && (
                <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                  <IconSymbol name="xmark" size={13} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>Скинути фільтр</Text>
                </TouchableOpacity>
              )}
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Task Modal */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <Text style={[s.sheetTitle, { color: c.text }]}>Нове завдання</Text>
              <TextInput placeholder="Назва" placeholderTextColor={c.sub} value={newTitle} onChangeText={setNewTitle} style={[s.input, { backgroundColor: c.dim, color: c.text }]} />
              <TextInput placeholder="Опис (необов'язково)" placeholderTextColor={c.sub} value={newDesc} onChangeText={setNewDesc} style={[s.input, { backgroundColor: c.dim, color: c.text, marginTop: 8 }]} />
              <Text style={[s.label, { color: c.sub }]}>Пріоритет</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['high', 'medium', 'low'] as Priority[]).map(p => (
                  <TouchableOpacity key={p} onPress={() => setNewPriority(p)} style={[s.priorityBtn, { borderColor: PRIORITY[p].color, backgroundColor: newPriority === p ? PRIORITY[p].color : 'transparent' }]}>
                    <Text style={{ color: newPriority === p ? '#fff' : PRIORITY[p].color, fontSize: 12, fontWeight: '600' }}>{PRIORITY[p].label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addTask} style={[s.btn, { flex: 2, backgroundColor: c.accent }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Додати</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!selectedTask} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            {selectedTask && (
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.detailSheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={[s.handle, { backgroundColor: c.border, marginBottom: 16 }]} />

                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                    <TouchableOpacity onPress={() => toggleTask(selectedTask.id)} style={[s.checkbox, { borderColor: selectedTask.status === 'done' ? '#10B981' : c.border, backgroundColor: selectedTask.status === 'done' ? '#10B981' : 'transparent', marginTop: 2 }]}>
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

                  <Text style={[s.label, { color: c.sub, marginTop: 4, marginBottom: 4 }]}>
                    {new Date(selectedTask.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>

                  {selectedTask.subtasks.length > 0 && (
                    <View style={{ marginTop: 8, marginBottom: 4 }}>
                      <View style={[s.progressBg]}>
                        <View style={[s.progressFill, { width: `${getProgress(selectedTask)}%`, backgroundColor: selectedTask.status === 'done' ? '#10B981' : c.accent }]} />
                      </View>
                      <Text style={[s.label, { color: c.sub, marginTop: 4 }]}>{getProgress(selectedTask)}% виконано</Text>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 18, marginBottom: 10 }}>
                    <IconSymbol name="list.bullet" size={13} color={c.sub} />
                    <Text style={[s.label, { color: c.sub, marginLeft: 5 }]}>
                      ПІДЗАВДАННЯ · {selectedTask.subtasks.filter(x => x.done).length}/{selectedTask.subtasks.length}
                    </Text>
                  </View>

                  <View style={{ gap: 6 }}>
                    {selectedTask.subtasks.map(sub => (
                      <View key={sub.id} style={[s.subRow, { backgroundColor: c.dim, borderColor: c.border }]}>
                        <TouchableOpacity onPress={() => toggleSubtask(selectedTask.id, sub.id)} style={[s.subCheck, { borderColor: sub.done ? '#10B981' : c.border, backgroundColor: sub.done ? '#10B981' : 'transparent' }]}>
                          {sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                        </TouchableOpacity>
                        <Text style={[s.subTitle, { color: sub.done ? c.sub : c.text, textDecorationLine: sub.done ? 'line-through' : 'none', flex: 1, marginHorizontal: 10 }]}>{sub.title}</Text>
                        <TouchableOpacity onPress={() => deleteSubtask(selectedTask.id, sub.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <IconSymbol name="xmark" size={13} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={[s.addSubRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <IconSymbol name="plus" size={15} color={c.sub} />
                      <TextInput placeholder="Додати підзавдання..." placeholderTextColor={c.sub} value={newSubtask} onChangeText={setNewSubtask} onSubmitEditing={() => addSubtask(selectedTask.id)} returnKeyType="done" style={[s.subInput, { color: c.text, flex: 1, marginLeft: 8 }]} />
                      {newSubtask.trim() ? <TouchableOpacity onPress={() => addSubtask(selectedTask.id)}><IconSymbol name="checkmark.circle.fill" size={20} color={c.accent} /></TouchableOpacity> : null}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                    <TouchableOpacity onPress={() => deleteTask(selectedTask.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                      <IconSymbol name="trash" size={15} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>Видалити</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => toggleTask(selectedTask.id)} style={[s.btn, { flex: 2, backgroundColor: selectedTask.status === 'done' ? '#374151' : c.accent }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>{selectedTask.status === 'done' ? 'Відновити' : 'Виконано'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCell({ value, label, color, sub, text }: any) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ color, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dateChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  statsRow: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  filterRow: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 3 },
  filterBtn: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  sortChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  sortLabel: { fontSize: 12, fontWeight: '600' },
  groupLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 4 },
  taskCard: { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  taskTitle: { fontSize: 14, fontWeight: '600' },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progressBg: { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  pct: { fontSize: 10, fontWeight: '600', minWidth: 26 },
  fab: { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 104 : 84, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  detailSheet: { borderRadius: 24, borderWidth: 1, padding: 20, maxHeight: '88%', overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  detailTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  detailDesc: { fontSize: 13, lineHeight: 19, paddingLeft: 32, marginBottom: 4 },
  input: { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  priorityBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, alignItems: 'center' },
  prioBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10 },
  subCheck: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  subTitle: { fontSize: 13, fontWeight: '500' },
  addSubRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingVertical: 10 },
  subInput: { fontSize: 13, paddingVertical: 0 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
});
