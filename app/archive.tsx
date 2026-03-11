import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';

interface SubTask { id: string; title: string; done: boolean; }
interface Task {
  id: string; title: string; description: string; priority: Priority; status: Status;
  subtasks: SubTask[]; createdAt: string; estimatedMinutes?: number; deadline?: string; projectId?: string;
}

const PRIORITY: Record<Priority, { label: string; color: string }> = {
  high:   { label: 'Високий', color: '#EF4444' },
  medium: { label: 'Середній', color: '#F59E0B' },
  low:    { label: 'Низький',  color: '#10B981' },
};

function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
  if (d.toDateString() === now.toDateString()) return 'Сьогодні';
  if (diff === 1) return 'Завтра';
  if (diff < 0) return `${Math.abs(diff)} дн тому`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

type SortBy = 'newest' | 'oldest' | 'priority' | 'name';

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export default function ArchiveScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filterPriority, setFilterPriority] = useState<Priority | null>(null);
  const [sort, setSort] = useState<SortBy>('newest');

  useFocusEffect(useCallback(() => {
    loadData<Task[]>('tasks', []).then(setTasks);
  }, []));

  const done = tasks
    .filter(t => t.status === 'done' && (filterPriority === null || t.priority === filterPriority))
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return a.title.localeCompare(b.title, 'uk');
    });

  const restore = (id: string) => {
    const updated = tasks.map(t =>
      t.id === id
        ? { ...t, status: 'active' as Status, subtasks: t.subtasks.map(s => ({ ...s, done: false })) }
        : t
    );
    setTasks(updated);
    saveData('tasks', updated);
  };

  const deleteForever = (id: string) => {
    Alert.alert(
      'Видалити назавжди?',
      'Завдання буде видалено без можливості відновлення.',
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Видалити', style: 'destructive', onPress: () => {
          const updated = tasks.filter(t => t.id !== id);
          setTasks(updated);
          saveData('tasks', updated);
        }},
      ]
    );
  };

  const clearAll = () => {
    if (done.length === 0) return;
    Alert.alert(
      'Очистити архів?',
      `Видалити ${done.length} завдань назавжди?`,
      [
        { text: 'Скасувати', style: 'cancel' },
        { text: 'Очистити', style: 'destructive', onPress: () => {
          const updated = tasks.filter(t => t.status !== 'done');
          setTasks(updated);
          saveData('tasks', updated);
        }},
      ]
    );
  };

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#10B981',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[ar.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={18} color={c.accent} />
          </TouchableOpacity>
          <Text style={[ar.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Архів</Text>
          {done.length > 0 && (
            <>
              <View style={[ar.countBadge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50' }]}>
                <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{done.length}</Text>
              </View>
              <TouchableOpacity
                onPress={clearAll}
                style={[ar.clearBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', marginLeft: 8 }]}>
                <IconSymbol name="trash" size={14} color="#EF4444" />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Filter by priority */}
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
          {([null, 'high', 'medium', 'low'] as (Priority | null)[]).map(p => {
            const isActive = filterPriority === p;
            const color = p ? PRIORITY[p].color : c.accent;
            const label = p ? PRIORITY[p].label : 'Всі';
            return (
              <TouchableOpacity
                key={String(p)}
                onPress={() => setFilterPriority(p)}
                style={[ar.chip, {
                  backgroundColor: isActive ? color + '20' : c.dim,
                  borderColor: isActive ? color : c.border,
                }]}>
                {p && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginRight: 5 }} />}
                <Text style={{ color: isActive ? color : c.sub, fontSize: 11, fontWeight: '600' }}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Sort */}
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 12 }}>
          {([
            { key: 'newest',   label: 'Нові',      icon: 'arrow.down.circle' },
            { key: 'oldest',   label: 'Старі',     icon: 'arrow.up.circle' },
            { key: 'priority', label: 'Пріоритет', icon: 'exclamationmark.circle' },
            { key: 'name',     label: 'А–Я',       icon: 'textformat.abc' },
          ] as const).map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setSort(opt.key)}
              style={[ar.chip, {
                backgroundColor: sort === opt.key ? c.accent + '20' : c.dim,
                borderColor: sort === opt.key ? c.accent : c.border,
              }]}>
              <IconSymbol name={opt.icon as any} size={11} color={sort === opt.key ? c.accent : c.sub} />
              <Text style={{ color: sort === opt.key ? c.accent : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}>

          {done.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 72 }}>
              <View style={[ar.emptyIcon, { backgroundColor: c.accent + '15', borderColor: c.accent + '25' }]}>
                <IconSymbol name="archivebox.fill" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 18, fontWeight: '600' }}>Архів порожній</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 5, opacity: 0.7 }}>Виконані завдання з'являться тут</Text>
            </View>
          )}

          <View style={{ gap: 8 }}>
            {done.map(task => {
              const prioColor = PRIORITY[task.priority].color;
              return (
                <BlurView
                  key={task.id}
                  intensity={isDark ? 18 : 35}
                  tint={isDark ? 'dark' : 'light'}
                  style={[ar.card, { borderColor: c.border }]}>
                  {/* Green left stripe */}
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: c.accent, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />

                  <View style={{ marginLeft: 8, flex: 1 }}>
                    {/* Title row */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 }}>
                      <View style={ar.doneCheck}>
                        <IconSymbol name="checkmark" size={10} color="#fff" />
                      </View>
                      <Text
                        style={{ color: c.sub, fontSize: 13, fontWeight: '600', flex: 1, marginLeft: 9, textDecorationLine: 'line-through', lineHeight: 18 }}
                        numberOfLines={2}>
                        {task.title}
                      </Text>
                    </View>

                    {/* Badge row */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginLeft: 27 }}>
                      <View style={[ar.badge, { backgroundColor: prioColor + '18', borderColor: prioColor + '40' }]}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: prioColor }} />
                        <Text style={{ color: prioColor, fontSize: 10, fontWeight: '700', marginLeft: 4 }}>
                          {PRIORITY[task.priority].label}
                        </Text>
                      </View>
                      {task.subtasks.length > 0 && (
                        <View style={[ar.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                          <IconSymbol name="list.bullet" size={10} color={c.sub} />
                          <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                            {task.subtasks.filter(s => s.done).length}/{task.subtasks.length}
                          </Text>
                        </View>
                      )}
                      {task.deadline && (
                        <View style={[ar.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                          <IconSymbol name="calendar" size={10} color={c.sub} />
                          <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>
                            {deadlineLabel(task.deadline)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={{ flexDirection: 'row', gap: 6, marginLeft: 10 }}>
                    <TouchableOpacity
                      onPress={() => restore(task.id)}
                      style={[ar.iconBtn, { backgroundColor: c.accent + '18', borderColor: c.accent + '40' }]}>
                      <IconSymbol name="arrow.uturn.backward" size={14} color={c.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => deleteForever(task.id)}
                      style={[ar.iconBtn, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.28)' }]}>
                      <IconSymbol name="trash" size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </BlurView>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ar = StyleSheet.create({
  pageTitle:  { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  backBtn:    { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge: { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  clearBtn:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip:       { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  emptyIcon:  { width: 80, height: 80, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card:       { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  doneCheck:  { width: 18, height: 18, borderRadius: 5, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badge:      { flexDirection: 'row', alignItems: 'center', borderRadius: 7, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  iconBtn:    { width: 32, height: 32, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
