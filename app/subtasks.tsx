import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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

type Priority = 'high' | 'medium' | 'low';
type Status = 'active' | 'done';
interface SubTask { id: string; title: string; done: boolean; }
interface Task {
  id: string; title: string; description: string;
  priority: Priority; status: Status; subtasks: SubTask[];
  createdAt: string; estimatedMinutes?: number; deadline?: string; projectId?: string;
}

export default function SubtasksScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { taskId } = useLocalSearchParams<{ taskId: string }>();

  const [task, setTask] = useState<Task | null>(null);
  const [newSubtask, setNewSubtask] = useState('');

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  useEffect(() => {
    loadData<Task[]>('tasks', []).then(tasks => {
      const found = tasks.find(t => t.id === taskId);
      if (found) setTask(found);
    });
  }, [taskId]);

  const persistTask = useCallback(async (updated: Task) => {
    setTask(updated);
    const tasks = await loadData<Task[]>('tasks', []);
    await saveData('tasks', tasks.map(t => t.id === updated.id ? updated : t));
  }, []);

  const toggleSubtask = useCallback(async (subId: string) => {
    if (!task) return;
    const subtasks = task.subtasks.map(s => s.id === subId ? { ...s, done: !s.done } : s);
    const status: Status = subtasks.length > 0 && subtasks.every(s => s.done) ? 'done' : 'active';
    await persistTask({ ...task, subtasks, status });
  }, [task, persistTask]);

  const deleteSubtask = useCallback(async (subId: string) => {
    if (!task) return;
    await persistTask({ ...task, subtasks: task.subtasks.filter(s => s.id !== subId) });
  }, [task, persistTask]);

  const addSubtask = useCallback(async () => {
    if (!task || !newSubtask.trim()) return;
    const sub: SubTask = { id: Date.now().toString(), title: newSubtask.trim(), done: false };
    await persistTask({ ...task, subtasks: [...task.subtasks, sub] });
    setNewSubtask('');
  }, [task, newSubtask, persistTask]);

  // completed subtasks go to end
  const sortedSubs = task ? [...task.subtasks].sort((a, b) => Number(a.done) - Number(b.done)) : [];
  const doneCount = task ? task.subtasks.filter(s => s.done).length : 0;
  const total = task ? task.subtasks.length : 0;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={[st.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={18} color={c.accent} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 }} numberOfLines={1}>
              {task?.title ?? 'Підзавдання'}
            </Text>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{doneCount}/{total} виконано</Text>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">

            {/* Progress bar */}
            {total > 0 && (
              <View style={{ marginBottom: 20 }}>
                <View style={st.progressBg}>
                  <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: c.accent }]} />
                </View>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 5 }}>{pct}% виконано</Text>
              </View>
            )}

            <View style={{ gap: 8 }}>
              {sortedSubs.map(sub => (
                <TouchableOpacity
                  key={sub.id}
                  activeOpacity={0.7}
                  onPress={() => toggleSubtask(sub.id)}
                  style={[st.subRow, { backgroundColor: c.dim, borderColor: sub.done ? '#10B98130' : c.border }]}>
                  <View style={[st.subCheck, { borderColor: sub.done ? '#10B981' : c.border, backgroundColor: sub.done ? '#10B981' : 'transparent' }]}>
                    {sub.done && <IconSymbol name="checkmark" size={10} color="#fff" />}
                  </View>
                  <Text style={{
                    color: sub.done ? c.sub : c.text,
                    textDecorationLine: sub.done ? 'line-through' : 'none',
                    flex: 1, marginHorizontal: 12, fontSize: 14, fontWeight: '500',
                  }}>
                    {sub.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() => deleteSubtask(sub.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="trash" size={14} color={c.sub} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}

              {/* Add subtask */}
              <View style={[st.addSubRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="plus" size={15} color={c.sub} />
                <TextInput
                  placeholder="Додати підзавдання..."
                  placeholderTextColor={c.sub}
                  value={newSubtask}
                  onChangeText={setNewSubtask}
                  onSubmitEditing={addSubtask}
                  returnKeyType="done"
                  style={{ color: c.text, flex: 1, marginLeft: 10, fontSize: 14, paddingVertical: 0 }}
                />
                {newSubtask.trim() ? (
                  <TouchableOpacity onPress={addSubtask}>
                    <IconSymbol name="checkmark.circle.fill" size={22} color={c.accent} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  backBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  progressBg:  { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },
  subRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  subCheck:    { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  addSubRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 13 },
});
