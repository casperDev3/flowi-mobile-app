import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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

type IdeaPriority = 'high' | 'medium' | 'low';
type IdeaStatus = 'idea' | 'planned' | 'done';

interface Idea {
  id: string;
  title: string;
  description: string;
  priority: IdeaPriority;
  status: IdeaStatus;
  createdAt: string;
}

const PRIORITY: Record<IdeaPriority, { label: string; color: string; icon: string }> = {
  high:   { label: 'Важлива',  color: '#8B5CF6', icon: 'bolt.fill' },
  medium: { label: 'Звичайна', color: '#0EA5E9', icon: 'circle.fill' },
  low:    { label: 'Колись',   color: '#6B7280', icon: 'clock.fill' },
};

const STATUS_CYCLE: Record<IdeaStatus, IdeaStatus> = {
  idea: 'planned',
  planned: 'done',
  done: 'idea',
};

const STATUS_LABELS: Record<IdeaStatus, string> = {
  idea: 'Ідея',
  planned: 'В планах',
  done: 'Реалізовано',
};

export default function IdeasScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'idea' | 'planned' | 'done'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'priority'>('newest');

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<IdeaPriority>('medium');

  const [showEdit, setShowEdit] = useState(false);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPriority, setEditPriority] = useState<IdeaPriority>('medium');

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F0FF',
    bg2:    isDark ? '#14121E' : '#EDE8FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#8B5CF6',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  useEffect(() => {
    loadData<Idea[]>('ideas', []).then(data => {
      setIdeas(data);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('ideas', ideas);
  }, [ideas, initialized]);

  const PRIORITY_ORDER: Record<IdeaPriority, number> = { high: 0, medium: 1, low: 2 };

  const filtered = ideas
    .filter(i => filter === 'all' || i.status === filter)
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    });

  const ideaCount    = ideas.filter(i => i.status === 'idea').length;
  const plannedCount = ideas.filter(i => i.status === 'planned').length;
  const doneCount    = ideas.filter(i => i.status === 'done').length;

  const addIdea = useCallback(() => {
    if (!newTitle.trim()) return;
    const idea: Idea = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      priority: newPriority,
      status: 'idea',
      createdAt: new Date().toISOString(),
    };
    setIdeas(p => [idea, ...p]);
    setNewTitle(''); setNewDesc(''); setNewPriority('medium');
    setShowAdd(false);
  }, [newTitle, newDesc, newPriority]);

  const cycleStatus = useCallback((id: string) => {
    setIdeas(p => p.map(i => i.id === id ? { ...i, status: STATUS_CYCLE[i.status] } : i));
  }, []);

  const deleteIdea = useCallback((id: string) => {
    Alert.alert('Видалити ідею?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => setIdeas(p => p.filter(i => i.id !== id)) },
    ]);
  }, []);

  const openEdit = useCallback((idea: Idea) => {
    setEditingIdea(idea);
    setEditTitle(idea.title);
    setEditDesc(idea.description);
    setEditPriority(idea.priority);
    setShowEdit(true);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editTitle.trim() || !editingIdea) return;
    setIdeas(p => p.map(i => i.id === editingIdea.id
      ? { ...i, title: editTitle.trim(), description: editDesc.trim(), priority: editPriority }
      : i));
    setShowEdit(false);
    setEditingIdea(null);
  }, [editTitle, editDesc, editPriority, editingIdea]);

  const copyToClipboard = useCallback(async (idea: Idea) => {
    const text = idea.description ? `${idea.title}\n${idea.description}` : idea.title;
    await Clipboard.setStringAsync(text);
    Alert.alert('Скопійовано', 'Заголовок та опис скопійовано в буфер обміну.');
  }, []);

  const showIdeaActions = useCallback((idea: Idea) => {
    const nextLabel = STATUS_LABELS[STATUS_CYCLE[idea.status]];
    Alert.alert(idea.title, undefined, [
      { text: 'Редагувати', onPress: () => openEdit(idea) },
      { text: 'Копіювати текст', onPress: () => copyToClipboard(idea) },
      { text: `→ ${nextLabel}`, onPress: () => cycleStatus(idea.id) },
      { text: 'Видалити', style: 'destructive', onPress: () => deleteIdea(idea.id) },
      { text: 'Скасувати', style: 'cancel' },
    ]);
  }, [openEdit, copyToClipboard, cycleStatus, deleteIdea]);

  const STATUS_COLORS: Record<IdeaStatus, string> = {
    idea: '#8B5CF6',
    planned: '#0EA5E9',
    done: '#10B981',
  };

  const STATUS_ICONS: Record<IdeaStatus, string> = {
    idea: 'lightbulb',
    planned: 'calendar',
    done: 'checkmark',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 8 }]}>Ідеї</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: c.accent }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14, marginTop: 6 }}>
          <View style={[st.statCard, { backgroundColor: '#8B5CF618', borderColor: '#8B5CF630' }]}>
            <Text style={{ color: '#8B5CF6', fontSize: 20, fontWeight: '800' }}>{ideaCount}</Text>
            <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Ідей</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: '#0EA5E918', borderColor: '#0EA5E930' }]}>
            <Text style={{ color: '#0EA5E9', fontSize: 20, fontWeight: '800' }}>{plannedCount}</Text>
            <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '600', marginTop: 2 }}>В планах</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: '#10B98118', borderColor: '#10B98130', flex: 1 }]}>
            <Text style={{ color: '#10B981', fontSize: 20, fontWeight: '800' }}>{doneCount}</Text>
            <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Готово</Text>
          </View>
        </View>

        {/* Filter */}
        <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[st.filterRow, { borderColor: c.border }]}>
            {(['all', 'idea', 'planned', 'done'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[st.filterBtn, filter === f && { backgroundColor: c.accent }]}>
                <Text style={[st.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? 'Всі' : STATUS_LABELS[f]}
                </Text>
              </TouchableOpacity>
            ))}
          </BlurView>
        </View>

        {/* Sort */}
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 14 }}>
          {([
            { key: 'newest',   label: 'Нові',      icon: 'arrow.down.circle' },
            { key: 'oldest',   label: 'Старі',     icon: 'arrow.up.circle' },
            { key: 'priority', label: 'Пріоритет', icon: 'bolt' },
          ] as const).map(opt => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setSort(opt.key)}
              style={[st.sortChip, {
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
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, gap: 10 }}
          showsVerticalScrollIndicator={false}>

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
              <IconSymbol name="lightbulb.fill" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, fontWeight: '600' }}>Поки немає ідей</Text>
              <Text style={{ color: c.sub, fontSize: 13, opacity: 0.7 }}>Натисніть + щоб додати ідею</Text>
            </View>
          )}

          {filtered.map(idea => {
            const prio = PRIORITY[idea.priority];
            const statusColor = STATUS_COLORS[idea.status];
            const statusIcon = STATUS_ICONS[idea.status];
            const isDone = idea.status === 'done';
            return (
              <TouchableOpacity
                key={idea.id}
                activeOpacity={0.8}
                onPress={() => cycleStatus(idea.id)}
                onLongPress={() => showIdeaActions(idea)}
                delayLongPress={350}>
                <BlurView
                  intensity={isDark ? 18 : 35}
                  tint={isDark ? 'dark' : 'light'}
                  style={[st.ideaCard, { borderColor: isDone ? '#10B98130' : statusColor + '40', opacity: isDone ? 0.7 : 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    {/* Status checkbox */}
                    <TouchableOpacity
                      onPress={() => cycleStatus(idea.id)}
                      style={[st.check, { borderColor: statusColor, backgroundColor: isDone ? statusColor : 'transparent' }]}>
                      <IconSymbol name={statusIcon as any} size={11} color={isDone ? '#fff' : statusColor} />
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={[st.badge, { backgroundColor: statusColor + '20', borderColor: statusColor + '40' }]}>
                          <Text style={{ color: statusColor, fontSize: 10, fontWeight: '700' }}>{STATUS_LABELS[idea.status]}</Text>
                        </View>
                        <View style={[st.badge, { backgroundColor: prio.color + '18', borderColor: prio.color + '35' }]}>
                          <IconSymbol name={prio.icon as any} size={9} color={prio.color} />
                          <Text style={{ color: prio.color, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>{prio.label}</Text>
                        </View>
                      </View>

                      <Text style={[st.ideaTitle, { color: c.text, textDecorationLine: isDone ? 'line-through' : 'none' }]}>
                        {idea.title}
                      </Text>
                      {idea.description ? (
                        <Text style={[st.ideaDesc, { color: c.sub }]} numberOfLines={2}>
                          {idea.description}
                        </Text>
                      ) : null}
                      <Text style={{ color: c.sub, fontSize: 10, marginTop: 6 }}>
                        {new Date(idea.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    {/* Action buttons */}
                    <View style={{ flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation(); openEdit(idea); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[st.actionBtn, { backgroundColor: '#6366F115', borderColor: '#6366F130' }]}>
                        <IconSymbol name="pencil" size={13} color="#6366F1" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation(); copyToClipboard(idea); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[st.actionBtn, { backgroundColor: '#0EA5E915', borderColor: '#0EA5E930' }]}>
                        <IconSymbol name="doc.on.clipboard" size={13} color="#0EA5E9" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={e => { e.stopPropagation(); deleteIdea(idea.id); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={[st.actionBtn, { backgroundColor: '#EF444415', borderColor: '#EF444430' }]}>
                        <IconSymbol name="trash" size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* Add Idea Modal */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={st.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[st.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[st.sheetTitle, { color: c.text }]}>Нова ідея</Text>

                  <Text style={[st.label, { color: c.sub }]}>НАЗВА</Text>
                  <TextInput
                    placeholder="Ідея або функція..."
                    placeholderTextColor={c.sub}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    autoFocus
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>ДЕТАЛІ (необов'язково)</Text>
                  <TextInput
                    placeholder="Опис, мотивація, приклади..."
                    placeholderTextColor={c.sub}
                    value={newDesc}
                    onChangeText={setNewDesc}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border, minHeight: 72 }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>ПРІОРИТЕТ</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    {(Object.entries(PRIORITY) as [IdeaPriority, typeof PRIORITY[IdeaPriority]][]).map(([key, p]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setNewPriority(key)}
                        style={[st.priorityBtn, {
                          backgroundColor: newPriority === key ? p.color + '20' : c.dim,
                          borderColor: newPriority === key ? p.color : c.border,
                          borderWidth: newPriority === key ? 1.5 : 1,
                        }]}>
                        <Text style={{ color: newPriority === key ? p.color : c.sub, fontSize: 12, fontWeight: '600' }}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addIdea}
                      disabled={!newTitle.trim()}
                      style={[st.btn, { flex: 2, backgroundColor: newTitle.trim() ? c.accent : c.dim }]}>
                      <IconSymbol name="lightbulb.fill" size={15} color={newTitle.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: newTitle.trim() ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>Додати ідею</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Idea Modal */}
      <Modal visible={showEdit} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={st.overlay} onPress={() => setShowEdit(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={st.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[st.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={st.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[st.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={[st.sheetTitle, { color: c.text }]}>Редагувати ідею</Text>

                  <Text style={[st.label, { color: c.sub }]}>НАЗВА</Text>
                  <TextInput
                    placeholder="Ідея або функція..."
                    placeholderTextColor={c.sub}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    autoFocus
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>ДЕТАЛІ (необов'язково)</Text>
                  <TextInput
                    placeholder="Опис, мотивація, приклади..."
                    placeholderTextColor={c.sub}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border, minHeight: 72 }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>ПРІОРИТЕТ</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    {(Object.entries(PRIORITY) as [IdeaPriority, typeof PRIORITY[IdeaPriority]][]).map(([key, p]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setEditPriority(key as IdeaPriority)}
                        style={[st.priorityBtn, {
                          backgroundColor: editPriority === key ? p.color + '20' : c.dim,
                          borderColor: editPriority === key ? p.color : c.border,
                          borderWidth: editPriority === key ? 1.5 : 1,
                        }]}>
                        <Text style={{ color: editPriority === key ? p.color : c.sub, fontSize: 12, fontWeight: '600' }}>{p.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => setShowEdit(false)} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={saveEdit}
                      disabled={!editTitle.trim()}
                      style={[st.btn, { flex: 2, backgroundColor: editTitle.trim() ? c.accent : c.dim }]}>
                      <IconSymbol name="checkmark" size={15} color={editTitle.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: editTitle.trim() ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>Зберегти</Text>
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
  pageTitle:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  backBtn:     { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  addBtn:      { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  statCard:    { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  filterRow:   { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 3, overflow: 'hidden' },
  filterBtn:   { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  filterLabel: { fontSize: 12, fontWeight: '600' },
  sortChip:    { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  ideaCard:    { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden' },
  ideaTitle:   { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  ideaDesc:    { fontSize: 12, lineHeight: 17, marginTop: 3, opacity: 0.8 },
  check:       { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  badge:       { flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  priorityBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  actionBtn:   { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500', borderWidth: 1 },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
