import { useNavigation, usePreventRemove } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData, loadDataResult, retryStorageRead, subscribeToStorage } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import { uuidV4 } from '@/utils/uuid';

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  projectId?: string;
}

/** Both routes edit the same collection. Filtering never becomes a replacement write. */
export function NotesWorkspace({ projectId, isDark }: { projectId?: string; isDark: boolean }) {
  const { tr, lang } = useI18n();
  const { isExpanded } = useResponsive();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation();
  const roles = useProjectRoles();
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'personal' | 'projects'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [selected, setSelected] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const dirty = !!selected && (title !== selected.title || body !== selected.body);
  const canEdit = canEditProjectItem(selected?.projectId ?? projectId, roles);
  const c = isDark
    ? { bg: '#15131D', panel: '#201D29', text: '#F4F1FA', sub: '#B8B1C6', border: '#494151', accent: '#C4AAFF' }
    : { bg: '#FAF8FF', panel: '#FFFFFF', text: '#241C32', sub: '#655B73', border: '#D3CBDD', accent: '#6034A8' };

  const reload = useCallback(async (retry = false) => {
    const version = ++readVersion.current;
    const result = await (retry ? retryStorageRead : loadDataResult)<Note[]>('notes', []);
    if (!mounted.current || version !== readVersion.current) return;
    const valid = result.ok && Array.isArray(result.value) && result.value.every(n =>
      n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string' && typeof n.updatedAt === 'string');
    setReadError(!valid);
    setReady(true);
    if (valid) setNotes(result.value);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const readProjects = async () => {
      const values = await loadData<{ id: string; name: string }[]>('projects', []);
      if (mounted.current && Array.isArray(values)) setProjects(Object.fromEntries(values.map(p => [p.id, p.name])));
    };
    void reload(); void readProjects();
    const off = subscribeToStorage(key => {
      if (key === 'notes') void reload();
      if (key === 'projects') void readProjects();
    });
    return () => { mounted.current = false; off(); };
  }, [reload]);

  const confirmLeave = (next: () => void) => {
    if (busy.current) return;
    if (!dirty) { next(); return; }
    Alert.alert(tr.notesUnsavedTitle, tr.notesUnsavedBody, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.discardChanges, style: 'destructive', onPress: next },
    ]);
  };
  usePreventRemove(dirty || saving, ({ data }) => confirmLeave(() => navigation.dispatch(data.action)));

  const open = (note: Note, fresh = false) => confirmLeave(() => {
    setSelected(note); setIsNew(fresh); setTitle(note.title); setBody(note.body);
  });
  const add = () => {
    if (!canEditProjectItem(projectId, roles) || !ready || readError) return;
    const now = new Date().toISOString();
    open({ id: uuidV4(), title: '', body: '', createdAt: now, updatedAt: now, ...(projectId ? { projectId } : {}) }, true);
  };
  const save = async () => {
    if (!selected || !canEdit || busy.current || readError || !ready) return;
    if (!title.trim() && !body.trim()) { Alert.alert(tr.error, tr.notesEmptyError); return; }
    busy.current = true; setSaving(true);
    try {
      const next = { ...selected, title: title.trim(), body, updatedAt: new Date().toISOString() };
      const result = await saveSyncedChanges('notes', isNew ? [] : [selected], [next], { checked: true });
      if (mounted.current) {
        if (result) setNotes(result);
        setSelected(null); setTitle(''); setBody('');
      }
    } catch {
      Alert.alert(tr.error, tr.notesSaveError);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const remove = () => {
    if (!selected || isNew || !canEdit || busy.current || readError) return;
    Alert.alert(tr.delete, tr.notesDeleteConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: async () => {
        if (busy.current) return;
        busy.current = true; setSaving(true);
        try {
          const result = await saveSyncedChanges('notes', [selected], [], { checked: true });
          if (mounted.current) { if (result) setNotes(result); setSelected(null); setTitle(''); setBody(''); }
        } catch { Alert.alert(tr.error, tr.notesSaveError); }
        finally { busy.current = false; if (mounted.current) setSaving(false); }
      } },
    ]);
  };
  const sections = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    const grouped = new Map<string, Note[]>();
    notes.filter(n => (!projectId || n.projectId === projectId)
      && (projectId || scope === 'all' || (scope === 'personal' ? !n.projectId : !!n.projectId))
      && (!search || `${n.title}\n${n.body}`.toLocaleLowerCase().includes(search)))
      .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, lang) : sort === 'oldest' ? a.updatedAt.localeCompare(b.updatedAt) : b.updatedAt.localeCompare(a.updatedAt))
      .forEach(n => { const key = n.projectId ?? ''; grouped.set(key, [...(grouped.get(key) ?? []), n]); });
    return [...grouped].sort(([a], [b]) => a === '' ? -1 : b === '' ? 1 : (projects[a] ?? a).localeCompare(projects[b] ?? b))
      .map(([key, data]) => ({ key, title: key ? projects[key] ?? `${tr.project} · ${key.slice(0, 8)}` : tr.notesPersonal, data }));
  }, [notes, query, projectId, scope, sort, projects, tr, lang]);

  const button = (label: string, onPress: () => void, id: string, disabled = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={[s.button, { borderColor: c.border, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={{ color: c.accent, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const editor = selected ? (
    <View testID="notes-editor" style={[s.editor, { backgroundColor: c.panel, borderColor: c.border }]}>
      <View style={s.toolbar}>
        {button(tr.close, () => confirmLeave(() => { setSelected(null); setTitle(''); setBody(''); }), 'notes-close', saving)}
        {canEdit && !isNew && button(tr.delete, remove, 'notes-delete', saving || readError)}
        {canEdit && button(saving ? tr.loading : tr.save, () => { void save(); }, 'notes-save', saving || readError)}
      </View>
      <Text style={[s.context, { color: c.sub }]}>{selected.projectId ? projects[selected.projectId] ?? tr.project : tr.notesPersonal}</Text>
      {!canEdit && <Text style={{ color: c.sub, paddingBottom: 8 }}>{tr.notesReadOnly}</Text>}
      <TextInput testID="notes-title" accessibilityLabel={tr.titlePlaceholder} placeholder={tr.titlePlaceholder}
        placeholderTextColor={c.sub} value={title} onChangeText={setTitle} editable={canEdit && !saving}
        style={[s.title, { color: c.text, borderColor: c.border }]} />
      <TextInput testID="notes-body" accessibilityLabel={tr.noteBodyPlaceholder} placeholder={tr.noteBodyPlaceholder}
        placeholderTextColor={c.sub} value={body} onChangeText={setBody} editable={canEdit && !saving}
        multiline textAlignVertical="top" scrollEnabled style={[s.body, { color: c.text }]} />
    </View>
  ) : isExpanded ? <View style={s.empty}><Text style={{ color: c.sub }}>{tr.notesSelectHint}</Text></View> : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { backgroundColor: c.bg }]}>
      {readError && <View accessibilityRole="alert" style={{ padding: 12 }}>
        <Text style={{ color: c.text }}>{tr.notesReadError}</Text>
        {button(tr.notesRetry, () => { void reload(true); }, 'notes-retry')}
      </View>}
      <View style={[s.panes, { flexDirection: isExpanded ? 'row' : 'column', paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
        {(isExpanded || !selected) && <View testID="notes-list" style={isExpanded ? s.listWide : s.list}>
          <View style={s.toolbar}>
            {canEditProjectItem(projectId, roles) && button(tr.addNote, add, 'notes-add', !ready || readError || saving)}
            {button(sort === 'title' ? tr.notesSortTitle : sort === 'oldest' ? tr.sortOldest : tr.sortNewest, () => setSort(v => v === 'newest' ? 'oldest' : v === 'oldest' ? 'title' : 'newest'), 'notes-sort')}
          </View>
          <TextInput testID="notes-search" accessibilityLabel={tr.notesSearch} placeholder={tr.notesSearch}
            placeholderTextColor={c.sub} value={query} onChangeText={setQuery}
            style={[s.search, { color: c.text, borderColor: c.border, backgroundColor: c.panel }]} />
          {!projectId && <View style={s.toolbar}>{(['all', 'personal', 'projects'] as const).map(value => (
            <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: scope === value }}
              testID={`notes-scope-${value}`} onPress={() => setScope(value)} style={[s.button, { borderColor: scope === value ? c.accent : c.border }]}>
              <Text style={{ color: c.text }}>{value === 'all' ? tr.all : value === 'personal' ? tr.notesPersonal : tr.projects}</Text>
            </TouchableOpacity>
          ))}</View>}
          <SectionList sections={readError ? [] : sections} keyExtractor={n => n.id} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }} stickySectionHeadersEnabled={false}
            ListEmptyComponent={<Text style={{ padding: 20, color: c.sub }}>{!ready ? tr.loading : readError ? '' : query ? tr.notesNoResults : tr.noNotes}</Text>}
            renderSectionHeader={({ section }) => <Text style={[s.section, { color: c.sub }]}>{section.title} · {section.data.length}</Text>}
            renderItem={({ item }) => <TouchableOpacity accessibilityRole="button" testID={`note-${item.id}`}
              accessibilityLabel={item.title || tr.untitled} accessibilityState={{ selected: selected?.id === item.id }} onPress={() => open(item)}
              style={[s.card, { backgroundColor: c.panel, borderColor: selected?.id === item.id ? c.accent : c.border }]}>
              <Text numberOfLines={2} style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{item.title || tr.untitled}</Text>
              <Text numberOfLines={2} style={{ color: c.sub, marginTop: 6 }}>{item.body}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginTop: 8 }}>{new Date(item.updatedAt).toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US')}</Text>
            </TouchableOpacity>} />
        </View>}
        {editor}
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 }, panes: { flex: 1, gap: 16 }, list: { flex: 1 }, listWide: { width: 300 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  search: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 16 },
  section: { fontWeight: '600', paddingVertical: 12 }, card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  editor: { flex: 1, minWidth: 0, padding: 16, borderWidth: 1, borderRadius: 16 },
  context: { fontSize: 13, paddingVertical: 8 }, title: { fontSize: 24, fontWeight: '700', minHeight: 52, borderBottomWidth: 1 },
  body: { flex: 1, fontSize: 17, lineHeight: 26, paddingTop: 14 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
