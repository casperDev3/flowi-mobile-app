import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { setProjectArchived } from '@/utils/projectUtils';
import { useContentWidth } from '@/hooks/use-content-width';

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /**
   * Момент архівації. Стан ЯВНИЙ, а не похідний із задач: інакше проєкт із
   * незавершеними задачами неможливо заморозити, а порожній проєкт (0 із 0)
   * довелося б рахувати виконаним на 100%.
   *
   * Поле живе у вільному JSON запису синку, тож ані сервер, ані контракт
   * синхронізації міняти не треба. Веб уже його виставляє.
   */
  archivedAt?: string;
}

interface Task { id: string; projectId?: string; status: string; }

/** Скільки задач у проєкті — всього, активних, виконаних. */
interface ProjectCounts { total: number; active: number; done: number; }

const EMPTY_COUNTS: ProjectCounts = { total: 0, active: 0, done: 0 };

const PROJECT_COLORS = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

interface ProjectCardProps {
  project: Project;
  counts: ProjectCounts;
  isDark: boolean;
  borderColor: string;
  textColor: string;
  subColor: string;
  onPress: (project: Project) => void;
  onDelete: (id: string) => void;
}

/**
 * Картка мемоізована: без цього кожен рендер екрана (наприклад, набір
 * тексту в модалці) перемальовує BlurView для всіх проєктів.
 */
const ProjectCard = React.memo(function ProjectCard({
  project, counts, isDark, borderColor, textColor, subColor, onPress, onDelete,
}: ProjectCardProps) {
  const pct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={() => onPress(project)}>
      <BlurView
        intensity={isDark ? 20 : 40}
        tint={isDark ? 'dark' : 'light'}
        style={[st.card, { borderColor }]}>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: counts.total > 0 ? 12 : 0 }}>
          <View style={[st.colorBadge, { backgroundColor: project.color + '25', borderColor: project.color + '60' }]}>
            <View style={[st.colorDot, { backgroundColor: project.color }]} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: textColor, fontSize: 15, fontWeight: '700' }}>{project.name}</Text>
            <Text style={{ color: subColor, fontSize: 12, marginTop: 2 }}>
              {counts.total === 0 ? 'Немає завдань' : `${counts.active} активних · ${counts.done} виконано`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onDelete(project.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ padding: 4 }}>
            <IconSymbol name="trash" size={16} color={subColor} />
          </TouchableOpacity>
        </View>

        {counts.total > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={[st.progressBg, { flex: 1 }]}>
              <View style={[st.progressFill, { width: `${pct}%`, backgroundColor: project.color }]} />
            </View>
            <Text style={{ color: subColor, fontSize: 10, fontWeight: '700' }}>{pct}%</Text>
          </View>
        )}
      </BlurView>
    </TouchableOpacity>
  );
});

export default function ProjectsScreen() {
  const contentWidth = useContentWidth();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [showArchived, setShowArchived] = useState(false);

  const loadAll = useCallback(async () => {
    const [p, t] = await Promise.all([
      loadData<Project[]>('projects', []),
      loadData<Task[]>('tasks', []),
    ]);
    setProjects(p);
    setTasks(t);
  }, []);

  // Архівні ховаються зі списку, але лишаються в даних: стан явний
  // (archivedAt), тож проєкт із незавершеними задачами теж можна заморозити.
  const liveProjects = useMemo(() => projects.filter(p => !p.archivedAt), [projects]);
  const archivedProjects = useMemo(() => projects.filter(p => !!p.archivedAt), [projects]);
  const visibleProjects = showArchived ? archivedProjects : liveProjects;

  /**
   * Один прохід по задачах замість трьох на кожен проєкт: раніше екран
   * робив O(проєкти × задачі) фільтрувань на кожному рендері.
   */
  const countsByProject = useMemo(() => {
    const map = new Map<string, ProjectCounts>();
    tasks.forEach(t => {
      if (!t.projectId) return;
      const cur = map.get(t.projectId) ?? { total: 0, active: 0, done: 0 };
      cur.total += 1;
      if (t.status === 'active') cur.active += 1;
      else if (t.status === 'done') cur.done += 1;
      map.set(t.projectId, cur);
    });
    return map;
  }, [tasks]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll().finally(() => setRefreshing(false));
  }, [loadAll]);

  useEffect(() => {
    loadAll().then(() => setInitialized(true));
  }, []);

  useEffect(() => {
    if (initialized) void saveSynced('projects', projects);
  }, [projects, initialized]);

  const openAdd = useCallback(() => {
    setEditing(null);
    setName('');
    setColor(PROJECT_COLORS[0]);
    setShowModal(true);
  }, []);

  const openEdit = useCallback((p: Project) => {
    setEditing(p);
    setName(p.name);
    setColor(p.color);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => setShowModal(false), []);

  const save = () => {
    if (!name.trim()) return;
    if (editing) {
      setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, name: name.trim(), color } : p));
    } else {
      setProjects(prev => [...prev, { id: Date.now().toString(), name: name.trim(), color, createdAt: new Date().toISOString() }]);
    }
    closeModal();
  };

  const toggleArchive = (project: Project) => {
    const archiving = !project.archivedAt;
    const apply = () => setProjects(prev =>
      prev.map(p => (p.id === project.id ? setProjectArchived(p, archiving) : p)));

    const activeLeft = tasks.filter(t => t.projectId === project.id && t.status !== 'done').length;
    if (archiving && activeLeft > 0) {
      Alert.alert(
        'Архівувати проект?',
        `У «${project.name}» ще ${activeLeft} незавершених — вони залишаться активними в задачах, просто проект зникне зі списку.`,
        [{ text: 'Скасувати', style: 'cancel' }, { text: 'Архівувати', onPress: apply }],
      );
      return;
    }
    apply();
  };

  const deleteProject = useCallback((id: string) => {
    Alert.alert('Видалити проект?', "Завдання проекту залишаться, але без прив'язки.", [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => setProjects(prev => prev.filter(p => p.id !== id)) },
    ]);
  }, []);

  // Палітра стабільна між рендерами — інакше React.memo на картці не спрацює.
  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  }), [isDark]);

  // Шапка їде разом зі списком, як і раніше, — тому вона ListHeaderComponent,
  // а не окремий фіксований блок над FlatList.
  const listHeader = (
    <>
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

      {/* Живі / Архів. З'являється лише коли архів не порожній —
          інакше це кнопка, яка нікуди не веде. */}
      {archivedProjects.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 7, marginBottom: 18 }}>
          {([
            { key: false, label: 'Живі', count: liveProjects.length },
            { key: true, label: 'Архів', count: archivedProjects.length },
          ] as const).map(opt => (
            <TouchableOpacity
              key={String(opt.key)}
              onPress={() => setShowArchived(opt.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: showArchived === opt.key }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingHorizontal: 13, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                backgroundColor: showArchived === opt.key ? c.accent + '18' : c.dim,
                borderColor: showArchived === opt.key ? c.accent : c.border,
              }}>
              <Text style={{ color: showArchived === opt.key ? c.accent : c.sub, fontWeight: '700', fontSize: 13 }}>
                {opt.label}
              </Text>
              <Text style={{ color: c.sub, fontSize: 12 }}>{opt.count}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <FlatList
          data={visibleProjects}
          keyExtractor={project => project.id}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.accent} />}
          ListHeaderComponent={listHeader}
          renderItem={({ item }) => (
            <ProjectCard
              project={item}
              counts={countsByProject.get(item.id) ?? EMPTY_COUNTS}
              isDark={isDark}
              borderColor={c.border}
              textColor={c.text}
              subColor={c.sub}
              onPress={openEdit}
              onDelete={deleteProject}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 64 }}>
              <View style={[st.emptyIcon, { backgroundColor: c.accent + '18' }]}>
                <IconSymbol name="folder" size={32} color={c.accent} />
              </View>
              <Text style={{ color: c.text, fontSize: 16, marginTop: 18, fontWeight: '700' }}>{tr.noProjects}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 6, textAlign: 'center' }}>
                {tr.pressToAdd}
              </Text>
              <TouchableOpacity
                onPress={openAdd}
                accessibilityRole="button"
                accessibilityLabel={tr.newProject}
                style={{ marginTop: 18, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <IconSymbol name="plus" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{tr.newProject}</Text>
              </TouchableOpacity>
            </View>
          }
        />
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

                {editing && (
                  <TouchableOpacity
                    onPress={() => { const target = editing; closeModal(); toggleArchive(target); }}
                    accessibilityRole="button"
                    style={[st.btn, { marginTop: 18, backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>
                      {editing.archivedAt ? 'Повернути з архіву' : 'Архівувати'}
                    </Text>
                  </TouchableOpacity>
                )}

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
