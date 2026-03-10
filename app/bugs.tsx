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

type Severity = 'critical' | 'major' | 'minor';

interface Bug {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  fixed: boolean;
  createdAt: string;
}

const SEVERITY: Record<Severity, { label: string; color: string; icon: string }> = {
  critical: { label: 'Критичний', color: '#EF4444', icon: 'exclamationmark.triangle.fill' },
  major:    { label: 'Важливий',  color: '#F59E0B', icon: 'exclamationmark.circle.fill' },
  minor:    { label: 'Незначний', color: '#6366F1', icon: 'info.circle.fill' },
};

export default function BugsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [bugs, setBugs] = useState<Bug[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'fixed'>('all');

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSeverity, setNewSeverity] = useState<Severity>('major');

  const c = {
    bg1:    isDark ? '#0C0C14' : '#FFF5F5',
    bg2:    isDark ? '#14121E' : '#FFE8E8',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    accent: '#EF4444',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(255,250,250,0.98)',
  };

  useEffect(() => {
    loadData<Bug[]>('bugs', []).then(data => {
      setBugs(data);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('bugs', bugs);
  }, [bugs, initialized]);

  const filtered = bugs.filter(b => {
    if (filter === 'open') return !b.fixed;
    if (filter === 'fixed') return b.fixed;
    return true;
  });

  const openCount  = bugs.filter(b => !b.fixed).length;
  const fixedCount = bugs.filter(b => b.fixed).length;

  const addBug = useCallback(() => {
    if (!newTitle.trim()) return;
    const bug: Bug = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      description: newDesc.trim(),
      severity: newSeverity,
      fixed: false,
      createdAt: new Date().toISOString(),
    };
    setBugs(p => [bug, ...p]);
    setNewTitle('');
    setNewDesc('');
    setNewSeverity('major');
    setShowAdd(false);
  }, [newTitle, newDesc, newSeverity]);

  const toggleFixed = useCallback((id: string) => {
    setBugs(p => p.map(b => b.id === id ? { ...b, fixed: !b.fixed } : b));
  }, []);

  const deleteBug = useCallback((id: string) => {
    Alert.alert('Видалити баг?', 'Цю дію не можна скасувати.', [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Видалити', style: 'destructive', onPress: () => setBugs(p => p.filter(b => b.id !== id)) },
    ]);
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 }}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[st.pageTitle, { color: c.text, flex: 1, marginLeft: 8 }]}>Список багів</Text>
          <TouchableOpacity onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: c.accent }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginBottom: 14, marginTop: 6 }}>
          <View style={[st.statCard, { backgroundColor: '#EF444418', borderColor: '#EF444430' }]}>
            <Text style={{ color: '#EF4444', fontSize: 20, fontWeight: '800' }}>{openCount}</Text>
            <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Відкритих</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: '#10B98118', borderColor: '#10B98130' }]}>
            <Text style={{ color: '#10B981', fontSize: 20, fontWeight: '800' }}>{fixedCount}</Text>
            <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '600', marginTop: 2 }}>Виправлених</Text>
          </View>
          <View style={[st.statCard, { backgroundColor: c.dim, borderColor: c.border, flex: 1 }]}>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{bugs.length}</Text>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginTop: 2 }}>Всього</Text>
          </View>
        </View>

        {/* Filter */}
        <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[st.filterRow, { borderColor: c.border }]}>
            {(['all', 'open', 'fixed'] as const).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                style={[st.filterBtn, filter === f && { backgroundColor: c.accent }]}>
                <Text style={[st.filterLabel, { color: filter === f ? '#fff' : c.sub }]}>
                  {f === 'all' ? 'Всі' : f === 'open' ? 'Відкриті' : 'Виправлені'}
                </Text>
              </TouchableOpacity>
            ))}
          </BlurView>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, gap: 10 }}
          showsVerticalScrollIndicator={false}>

          {filtered.length === 0 && (
            <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
              <IconSymbol name="ladybug.fill" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, fontWeight: '600' }}>
                {filter === 'fixed' ? 'Немає виправлених' : filter === 'open' ? 'Немає відкритих багів' : 'Список порожній'}
              </Text>
              {filter !== 'fixed' && (
                <Text style={{ color: c.sub, fontSize: 13, opacity: 0.7 }}>Натисніть + щоб додати баг</Text>
              )}
            </View>
          )}

          {filtered.map(bug => {
            const sv = SEVERITY[bug.severity];
            return (
              <TouchableOpacity
                key={bug.id}
                activeOpacity={0.8}
                onPress={() => toggleFixed(bug.id)}>
                <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[st.bugCard, { borderColor: bug.fixed ? '#10B98130' : sv.color + '40', opacity: bug.fixed ? 0.7 : 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    {/* Fixed checkbox */}
                    <TouchableOpacity
                      onPress={() => toggleFixed(bug.id)}
                      style={[st.check, { borderColor: bug.fixed ? '#10B981' : sv.color, backgroundColor: bug.fixed ? '#10B981' : 'transparent' }]}>
                      {bug.fixed && <IconSymbol name="checkmark" size={11} color="#fff" />}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={[st.severityBadge, { backgroundColor: sv.color + '20', borderColor: sv.color + '40' }]}>
                          <IconSymbol name={sv.icon as any} size={10} color={sv.color} />
                          <Text style={{ color: sv.color, fontSize: 10, fontWeight: '700', marginLeft: 3 }}>{sv.label}</Text>
                        </View>
                        {bug.fixed && (
                          <View style={[st.severityBadge, { backgroundColor: '#10B98120', borderColor: '#10B98140' }]}>
                            <Text style={{ color: '#10B981', fontSize: 10, fontWeight: '700' }}>Виправлено</Text>
                          </View>
                        )}
                      </View>

                      <Text style={[st.bugTitle, { color: c.text, textDecorationLine: bug.fixed ? 'line-through' : 'none' }]}>
                        {bug.title}
                      </Text>
                      {bug.description ? (
                        <Text style={[st.bugDesc, { color: c.sub }]} numberOfLines={2}>
                          {bug.description}
                        </Text>
                      ) : null}
                      <Text style={{ color: c.sub, fontSize: 10, marginTop: 6 }}>
                        {new Date(bug.createdAt).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>

                    <TouchableOpacity onPress={() => deleteBug(bug.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <IconSymbol name="trash" size={15} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* Add Bug Modal */}
      <Modal visible={showAdd} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
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

                  <Text style={[st.sheetTitle, { color: c.text }]}>Новий баг</Text>

                  <Text style={[st.label, { color: c.sub }]}>НАЗВА</Text>
                  <TextInput
                    placeholder="Опис помилки..."
                    placeholderTextColor={c.sub}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    autoFocus
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>ДЕТАЛІ (необов'язково)</Text>
                  <TextInput
                    placeholder="Де виникає, як відтворити..."
                    placeholderTextColor={c.sub}
                    value={newDesc}
                    onChangeText={setNewDesc}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    style={[st.input, { color: c.text, backgroundColor: c.dim, borderColor: c.border, minHeight: 72 }]}
                  />

                  <Text style={[st.label, { color: c.sub }]}>КРИТИЧНІСТЬ</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                    {(Object.entries(SEVERITY) as [Severity, typeof SEVERITY[Severity]][]).map(([key, sv]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setNewSeverity(key)}
                        style={[st.severityBtn, {
                          backgroundColor: newSeverity === key ? sv.color + '20' : c.dim,
                          borderColor: newSeverity === key ? sv.color : c.border,
                          borderWidth: newSeverity === key ? 1.5 : 1,
                        }]}>
                        <Text style={{ color: newSeverity === key ? sv.color : c.sub, fontSize: 12, fontWeight: '600' }}>
                          {sv.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addBug}
                      disabled={!newTitle.trim()}
                      style={[st.btn, { flex: 2, backgroundColor: newTitle.trim() ? c.accent : c.dim }]}>
                      <IconSymbol name="ladybug.fill" size={15} color={newTitle.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: newTitle.trim() ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>
                        Додати баг
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
  pageTitle:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  backBtn:      { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  addBtn:       { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  statCard:     { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  filterRow:    { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 3, overflow: 'hidden' },
  filterBtn:    { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  filterLabel:  { fontSize: 12, fontWeight: '600' },
  bugCard:      { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden' },
  bugTitle:     { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  bugDesc:      { fontSize: 12, lineHeight: 17, marginTop: 3, opacity: 0.8 },
  check:        { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  severityBadge:{ flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  severityBtn:  { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:   { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:        { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500', borderWidth: 1 },
  btn:          { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
