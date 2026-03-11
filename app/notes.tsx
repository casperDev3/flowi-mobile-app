import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
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

interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

function relativeDate(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'щойно';
  if (minutes < 60) return `${minutes} хв тому`;
  if (hours < 24) return `${hours} год тому`;
  if (days === 1) return 'вчора';
  if (days < 7) return `${days} дн тому`;
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
}

export default function NotesScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [notes, setNotes] = useState<Note[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [selected, setSelected] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    loadData<Note[]>('notes', []).then(data => {
      setNotes(data);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('notes', notes);
  }, [notes, initialized]);

  const openNew = () => {
    setEditTitle('');
    setEditBody('');
    setIsNew(true);
    setSelected({ id: Date.now().toString(), title: '', body: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  };

  const openEdit = (note: Note) => {
    setEditTitle(note.title);
    setEditBody(note.body);
    setIsNew(false);
    setSelected(note);
  };

  const saveNote = () => {
    if (!editTitle.trim() && !editBody.trim()) {
      setSelected(null);
      return;
    }
    const now = new Date().toISOString();
    if (isNew) {
      const newNote: Note = {
        id: selected!.id,
        title: editTitle.trim(),
        body: editBody.trim(),
        createdAt: now,
        updatedAt: now,
      };
      setNotes(prev => [newNote, ...prev]);
    } else {
      setNotes(prev => prev.map(n =>
        n.id === selected!.id
          ? { ...n, title: editTitle.trim(), body: editBody.trim(), updatedAt: now }
          : n
      ));
    }
    setSelected(null);
  };

  const deleteNote = (id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
    setSelected(null);
  };

  const c = {
    bg1:    isDark ? '#100D08' : '#FFFBF4',
    bg2:    isDark ? '#1A1510' : '#FFF3DC',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(245,158,11,0.2)',
    text:   isDark ? '#FFF8E7' : '#1C1209',
    sub:    isDark ? 'rgba(255,248,231,0.45)' : 'rgba(28,18,9,0.45)',
    accent: '#F59E0B',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(16,13,8,0.98)' : 'rgba(255,251,245,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[ns.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={18} color={c.accent} />
          </TouchableOpacity>
          <Text style={[ns.pageTitle, { color: c.text, flex: 1, marginLeft: 12 }]}>Нотатки</Text>
          {notes.length > 0 && (
            <View style={[ns.countBadge, { backgroundColor: c.accent + '20', borderColor: c.accent + '50' }]}>
              <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{notes.length}</Text>
            </View>
          )}
        </View>

        {/* Sort */}
        {notes.length > 1 && (
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 8 }}>
            {([
              { key: 'newest', label: 'Нові',  icon: 'arrow.down.circle' },
              { key: 'oldest', label: 'Старі', icon: 'arrow.up.circle' },
              { key: 'title',  label: 'А–Я',   icon: 'textformat.abc' },
            ] as const).map(opt => (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setSort(opt.key)}
                style={[ns.sortChip, {
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
        )}

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}>

          {notes.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 72 }}>
              <IconSymbol name="note.text" size={44} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 16, fontWeight: '600' }}>Немає нотаток</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 5, opacity: 0.7 }}>Натисніть + щоб створити</Text>
            </View>
          )}

          <View style={{ gap: 10 }}>
            {[...notes].sort((a, b) => {
              if (sort === 'newest') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
              if (sort === 'oldest') return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
              return (a.title || 'Без назви').localeCompare(b.title || 'Без назви', 'uk');
            }).map(note => (
              <TouchableOpacity key={note.id} activeOpacity={0.75} onPress={() => openEdit(note)}>
                <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[ns.noteCard, { borderColor: c.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: note.body ? 7 : 0 }}>
                    <Text style={[ns.noteTitle, { color: c.text, flex: 1 }]} numberOfLines={1}>
                      {note.title || 'Без назви'}
                    </Text>
                    <Text style={[ns.noteDate, { color: c.sub }]}>{relativeDate(note.updatedAt)}</Text>
                  </View>
                  {note.body ? (
                    <Text style={[ns.noteBody, { color: c.sub }]} numberOfLines={3}>{note.body}</Text>
                  ) : null}
                </BlurView>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity
        onPress={openNew}
        style={[ns.fab, { backgroundColor: c.accent }]}
        activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ─── Edit / Create Modal ─── */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={saveNote}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={ns.overlay} onPress={saveNote}>
            <Pressable onPress={e => e.stopPropagation()} style={ns.sheetWrapper}>
              <BlurView
                intensity={isDark ? 50 : 70}
                tint={isDark ? 'dark' : 'light'}
                style={[ns.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={ns.handleRow}>
                  <View style={{ flex: 1 }}>
                    {!isNew && (
                      <TouchableOpacity
                        onPress={() => selected && deleteNote(selected.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="trash" size={17} color="#EF4444" />
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[ns.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={saveNote} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={{ color: c.accent, fontSize: 15, fontWeight: '700' }}>
                        {isNew ? 'Створити' : 'Зберегти'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <TextInput
                  placeholder="Заголовок..."
                  placeholderTextColor={c.sub}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  style={[ns.titleInput, { color: c.text }]}
                  returnKeyType="next"
                />
                <View style={[ns.divider, { backgroundColor: c.border }]} />
                <ScrollView
                  style={{ maxHeight: Dimensions.get('window').height * 0.38 }}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  <TextInput
                    placeholder="Текст нотатки..."
                    placeholderTextColor={c.sub}
                    value={editBody}
                    onChangeText={setEditBody}
                    multiline
                    style={[ns.bodyInput, { color: c.text }]}
                    textAlignVertical="top"
                  />
                </ScrollView>

              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const ns = StyleSheet.create({
  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  sortChip:    { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  backBtn:     { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  countBadge:  { borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  noteCard:    { borderRadius: 16, borderWidth: 1, padding: 16, overflow: 'hidden' },
  noteTitle:   { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  noteDate:    { fontSize: 11, fontWeight: '500', marginLeft: 10 },
  noteBody:    { fontSize: 13, lineHeight: 19 },
  fab:         { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 48 : 28, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.82 },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  divider:     { height: 1, marginVertical: 12 },
  titleInput:  { fontSize: 22, fontWeight: '700', paddingVertical: 4 },
  bodyInput:   { fontSize: 15, lineHeight: 22, minHeight: 120, paddingVertical: 4 },
});
