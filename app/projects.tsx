import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
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

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

interface Task { id: string; projectId?: string; status: string; }

const PROJECT_COLORS = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

export default function ProjectsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  useEffect(() => {
    Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Task[]>('tasks', []),
    ]).then(([p, t]) => {
      setProjects(p);
      setTasks(t);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('projects', projects);
  }, [projects, initialized]);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setColor(PROJECT_COLORS[0]);
    setShowModal(true);
  };

  const openEdit = (p: Project) => {
    setEditing(p);
    setName(p.name);
    setColor(p.color);
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const save = () => {
    if (!name.trim()) return;
    if (editing) {
      setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, name: name.trim(), color } : p));
    } else {
      setProjects(prev => [...prev, { id: Date.now().toString(), name: name.trim(), color, createdAt: new Date().toISOString() }]);
    }
    closeModal();
  };

  const deleteProject = (id: string) => {
    Alert.alert('Видалити проект?', "Завдання проекту залишаться, але без прив'язки.", [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => setProjects(prev => prev.filter(p => p.id !== id)) },
    ]);
  };

  const taskCount = (projectId: string) => tasks.filter(t => t.projectId === projectId).length;
  const activeCount = (projectId: string) => tasks.filter(t => t.projectId === projectId && t.status === 'active').length;
  const doneCount = (projectId: string) => tasks.filter(t => t.projectId === projectId && t.status === 'done').length;

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 14, marginBottom: 28, flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[st.headerBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
              <IconSymbol name="chevron.left" size={17} color={c.sub} />
            </TouchableOpacity>
            <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Проекти</Text>
            <TouchableOpacity
              onPress={openAdd}
              style={[st.headerBtn, { backgroundColor: c.accent, borderColor: c.accent }]}>
              <IconSymbol name="plus" size={17} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Empty */}
          {projects.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
                <IconSymbol name="folder" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>Немає проектів</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                Натисніть + щоб створити перший проект
              </Text>
            </View>
          )}

          {/* Project cards */}
          <View style={{ gap: 10 }}>
            {projects.map(project => {
              const total = taskCount(project.id);
              const active = activeCount(project.id);
              const done = doneCount(project.id);
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <TouchableOpacity key={project.id} activeOpacity={0.75} onPress={() => openEdit(project)}>
                  <BlurView
                    intensity={isDark ? 20 : 40}
                    tint={isDark ? 'dark' : 'light'}
                    style={[st.card, { borderColor: c.border }]}>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: total > 0 ? 12 : 0 }}>
                      <View style={[st.colorBadge, { backgroundColor: project.color + '25', borderColor: project.color + '60' }]}>
                        <View style={[st.colorDot, { backgroundColor: project.color }]} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{project.name}</Text>
                        <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                          {total === 0 ? 'Немає завдань' : `${active} активних · ${done} виконано`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => deleteProject(project.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 4 }}>
                        <IconSymbol name="trash" size={16} color={c.sub} />
                      </TouchableOpacity>
                    </View>

                    {total > 0 && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={[st.progressBg, { flex: 1 }]}>
                          <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: project.color }]} />
                        </View>
                        <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700' }}>{pct}%</Text>
                      </View>
                    )}
                  </BlurView>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="fade" statusBarTranslucent onRequestClose={closeModal}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={closeModal}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView
                intensity={isDark ? 50 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={st.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[st.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={closeModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[st.sheetTitle, { color: c.text }]}>
                  {editing ? 'Редагувати проект' : 'Новий проект'}
                </Text>

                <TextInput
                  placeholder="Назва проекту"
                  placeholderTextColor={c.sub}
                  value={name}
                  onChangeText={setName}
                  style={[st.input, { backgroundColor: c.dim, color: c.text }]}
                  autoFocus
                />

                <Text style={[st.label, { color: c.sub }]}>Колір проекту</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map(col => (
                    <TouchableOpacity
                      key={col}
                      onPress={() => setColor(col)}
                      style={[
                        st.colorChip,
                        { backgroundColor: col },
                        color === col && { borderWidth: 3, borderColor: '#fff' },
                      ]}>
                      {color === col && <IconSymbol name="checkmark" size={14} color="#fff" />}
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 22, marginBottom: 4 }}>
                  <TouchableOpacity onPress={closeModal} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={save} style={[st.btn, { flex: 2, backgroundColor: c.accent }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {editing ? 'Зберегти' : 'Створити'}
                    </Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyIcon:   { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card:        { borderRadius: 16, borderWidth: 1, padding: 14, overflow: 'hidden' },
  colorBadge:  { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorDot:    { width: 20, height: 20, borderRadius: 6 },
  progressBg:  { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: '90%' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, marginTop: 16 },
  colorChip:   { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
