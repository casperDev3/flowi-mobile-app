import { useNavigation, usePreventRemove } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoteMarkdown } from '@/components/notes/NoteMarkdown';
import { PickerField, type PickerOption } from '@/components/shared/PickerField';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData, loadDataResult, retryStorageRead, subscribeToStorage } from '@/store/storage';
import { saveSyncedChanges } from '@/store/synced-storage';
import {
  checklistProgress,
  collectNoteTags,
  formatTagsInput,
  noteTaskDraft,
  notePreview,
  noteTags,
  normalizeNotes,
  parseTagsInput,
  selectNotes,
  tagKey,
  toggleChecklistAt,
  writeNote,
  type Note,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

export type { Note } from '@/utils/notes';

/** Мінімум, потрібний для підпису звʼязку — повні типи тут не потрібні. */
interface LinkTarget { id?: unknown; title?: unknown; date?: unknown }

function linkOptions(items: readonly LinkTarget[]): PickerOption[] {
  return items
    .map(item => ({
      id: typeof item?.id === 'string' ? item.id : '',
      label: (typeof item?.title === 'string' && item.title.trim()) || '—',
    }))
    .filter(option => option.id.length > 0);
}

/** Both routes edit the same collection. Filtering never becomes a replacement write. */
export function NotesWorkspace({ projectId, isDark }: { projectId?: string; isDark: boolean }) {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isExpanded } = useResponsive();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation();
  const roles = useProjectRoles();
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<PickerOption[]>([]);
  const [meetings, setMeetings] = useState<PickerOption[]>([]);
  /**
   * Автор для задачі, створеної з рядка проєктної нотатки (§3.3 CONTRACT).
   * Читається з кешу сесії, а не з `useAuth()`: контекст авторизації тягне за
   * собою expo-router і push-нотифікації, а цьому екрану потрібен лише id.
   */
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'personal' | 'projects'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [pinned, setPinned] = useState(false);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedMeetingId, setLinkedMeetingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const sameTags = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index]);
  const dirty = !!selected && (
    title !== selected.title
    || body !== selected.body
    || !sameTags(parseTagsInput(tagsInput), selected.tags ?? [])
    || pinned !== (selected.pinned === true)
    || linkedTaskId !== (selected.linkedTaskId ?? null)
    || linkedMeetingId !== (selected.linkedMeetingId ?? null)
  );
  const canEdit = canEditProjectItem(selected?.projectId ?? projectId, roles);
  const c = isDark
    ? { bg: '#15131D', panel: '#201D29', text: '#F4F1FA', sub: '#B8B1C6', border: '#494151', accent: '#C4AAFF', dim: '#2A2634' }
    : { bg: '#FAF8FF', panel: '#FFFFFF', text: '#241C32', sub: '#655B73', border: '#D3CBDD', accent: '#6034A8', dim: '#F0ECF8' };
  const pickerColors = { text: c.text, sub: c.sub, border: c.border, dim: c.dim, accent: c.accent, sheet: c.panel };

  const reload = useCallback(async (retry = false) => {
    const version = ++readVersion.current;
    const result = await (retry ? retryStorageRead : loadDataResult)<unknown>('notes', []);
    if (!mounted.current || version !== readVersion.current) return;
    // Помилка — тільки те, що справді помилка: сховище не прочиталось або там
    // не масив. Окремий пошкоджений запис пропускає normalizeNotes, і через
    // одну стару нотатку весь екран більше не гасне.
    const valid = result.ok && Array.isArray(result.value);
    setReadError(!valid);
    setReady(true);
    if (valid) setNotes(normalizeNotes(result.value));
  }, []);

  useEffect(() => {
    mounted.current = true;
    const readProjects = async () => {
      const values = await loadData<{ id: string; name: string }[]>('projects', []);
      if (mounted.current && Array.isArray(values)) setProjects(Object.fromEntries(values.map(p => [p.id, p.name])));
    };
    const readLinks = async () => {
      const [taskRows, meetingRows] = await Promise.all([
        loadData<LinkTarget[]>('tasks', []),
        loadData<LinkTarget[]>('meetings', []),
      ]);
      if (!mounted.current) return;
      setTasks(linkOptions(Array.isArray(taskRows) ? taskRows : []));
      setMeetings(linkOptions(Array.isArray(meetingRows) ? meetingRows : []));
    };
    const readUser = async () => {
      const cached = await loadData<{ id?: unknown } | null>('auth_user', null);
      const id = cached && typeof cached === 'object' ? cached.id : undefined;
      if (mounted.current) setUserId(typeof id === 'string' || typeof id === 'number' ? String(id) : null);
    };
    void reload(); void readProjects(); void readLinks(); void readUser();
    const off = subscribeToStorage(key => {
      if (key === 'notes') void reload();
      if (key === 'projects') void readProjects();
      if (key === 'tasks' || key === 'meetings') void readLinks();
      if (key === 'auth_user') void readUser();
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

  const closeEditor = () => {
    setSelected(null); setTitle(''); setBody(''); setTagsInput('');
    setPinned(false); setLinkedTaskId(null); setLinkedMeetingId(null); setPreview(false);
  };
  const open = (note: Note, fresh = false) => confirmLeave(() => {
    setSelected(note); setIsNew(fresh);
    setTitle(note.title); setBody(note.body);
    setTagsInput(formatTagsInput(note.tags));
    setPinned(note.pinned === true);
    setLinkedTaskId(note.linkedTaskId ?? null);
    setLinkedMeetingId(note.linkedMeetingId ?? null);
    setPreview(false);
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
      const next = writeNote(selected, {
        title, body, now: new Date().toISOString(),
        tags: parseTagsInput(tagsInput), pinned,
        linkedTaskId, linkedMeetingId,
      });
      const result = await saveSyncedChanges('notes', isNew ? [] : [selected], [next], { checked: true });
      if (mounted.current) {
        if (result) setNotes(normalizeNotes(result));
        closeEditor();
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
          if (mounted.current) { if (result) setNotes(normalizeNotes(result)); closeEditor(); }
        } catch { Alert.alert(tr.error, tr.notesSaveError); }
        finally { busy.current = false; if (mounted.current) setSaving(false); }
      } },
    ]);
  };
  /**
   * Задача з рядка нотатки. Записується одразу, а сама нотатка лишається як
   * була: рядок — це джерело назви, а не місце, яке ми маємо переписати за
   * людиною. Текст задачі береться з ЧЕРНЕТКИ, тобто з того, що людина бачить.
   */
  const createTaskFromLine = async (line: number) => {
    if (!canEdit || busy.current || !selected) return;
    const draft = noteTaskDraft(
      { projectId: selected.projectId ?? projectId },
      body.split('\n')[line] ?? '',
      { id: uuidV4(), now: new Date().toISOString() },
    );
    if (!draft) return;
    busy.current = true; setSaving(true);
    try {
      const owned = draft.projectId && userId ? { ...draft, createdBy: userId } : draft;
      await saveSyncedChanges('tasks', [], [owned], { checked: true });
      Alert.alert(tr.notesTaskCreated, draft.title);
    } catch {
      Alert.alert(tr.error, tr.notesTaskCreateError);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };

  const scoped = useMemo(() => notes.filter(n => (!projectId || n.projectId === projectId)
    && (projectId || scope === 'all' || (scope === 'personal' ? !n.projectId : !!n.projectId))),
  [notes, projectId, scope]);
  const tagChips = useMemo(() => collectNoteTags(scoped, locale), [scoped, locale]);
  const sections = useMemo(() => {
    const grouped = new Map<string, Note[]>();
    selectNotes(scoped, { search: query, sort, tag: tagFilter, locale })
      .forEach(n => { const key = n.projectId ?? ''; grouped.set(key, [...(grouped.get(key) ?? []), n]); });
    return [...grouped].sort(([a], [b]) => a === '' ? -1 : b === '' ? 1 : (projects[a] ?? a).localeCompare(projects[b] ?? b, locale))
      .map(([key, data]) => ({ key, title: key ? projects[key] ?? `${tr.project} · ${key.slice(0, 8)}` : tr.notesPersonal, data }));
  }, [scoped, query, sort, tagFilter, projects, tr, locale]);

  // Обраний тег міг зникнути разом з останньою нотаткою, що його несла —
  // інакше список лишився б порожнім без жодного видимого фільтра.
  useEffect(() => {
    if (tagFilter && !tagChips.some(chip => tagKey(chip.tag) === tagKey(tagFilter))) setTagFilter(null);
  }, [tagChips, tagFilter]);

  const button = (label: string, onPress: () => void, id: string, disabled = false, active = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress}
      style={[s.button, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.dim : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
      <Text style={{ color: c.accent, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );
  const missingLink = (value: string | null, options: PickerOption[]) =>
    value && !options.some(option => option.id === value) ? tr.notesLinkLost : null;

  const editor = selected ? (
    <View testID="notes-editor" style={[s.editor, { backgroundColor: c.panel, borderColor: c.border }]}>
      <View style={s.toolbar}>
        {button(tr.close, () => confirmLeave(closeEditor), 'notes-close', saving)}
        {button(preview ? tr.notesEditText : tr.notesPreview, () => setPreview(v => !v), 'notes-preview-toggle', false, preview)}
        {canEdit && button(pinned ? tr.notesUnpin : tr.notesPin, () => setPinned(v => !v), 'notes-pin', saving, pinned)}
        {canEdit && !isNew && button(tr.delete, remove, 'notes-delete', saving || readError)}
        {canEdit && button(saving ? tr.loading : tr.save, () => { void save(); }, 'notes-save', saving || readError)}
      </View>
      <Text style={[s.context, { color: c.sub }]}>{selected.projectId ? projects[selected.projectId] ?? tr.project : tr.notesPersonal}</Text>
      {!canEdit && <Text style={{ color: c.sub, paddingBottom: 8 }}>{tr.notesReadOnly}</Text>}
      <TextInput testID="notes-title" accessibilityLabel={tr.titlePlaceholder} placeholder={tr.titlePlaceholder}
        placeholderTextColor={c.sub} value={title} onChangeText={setTitle} editable={canEdit && !saving}
        style={[s.title, { color: c.text, borderColor: c.border }]} />
      <TextInput testID="notes-tags" accessibilityLabel={tr.notesTagsLabel} placeholder={tr.notesTagsPlaceholder}
        placeholderTextColor={c.sub} value={tagsInput} onChangeText={setTagsInput} editable={canEdit && !saving}
        autoCapitalize="none" style={[s.tagsInput, { color: c.text, borderColor: c.border }]} />
      <View style={s.links}>
        <View style={s.link}>
          <PickerField label={tr.notesLinkTask} options={tasks} value={linkedTaskId}
            onSelect={id => canEdit && !saving && setLinkedTaskId(id)}
            emptyOption={{ label: tr.notesLinkNone }} selectedLabel={missingLink(linkedTaskId, tasks)}
            alwaysSearch colors={pickerColors} isDark={isDark} tr={tr} />
        </View>
        <View style={s.link}>
          <PickerField label={tr.notesLinkMeeting} options={meetings} value={linkedMeetingId}
            onSelect={id => canEdit && !saving && setLinkedMeetingId(id)}
            emptyOption={{ label: tr.notesLinkNone }} selectedLabel={missingLink(linkedMeetingId, meetings)}
            alwaysSearch colors={pickerColors} isDark={isDark} tr={tr} />
        </View>
      </View>
      {preview ? (
        <ScrollView style={s.previewPane} contentContainerStyle={{ paddingVertical: 10 }} keyboardShouldPersistTaps="handled">
          <NoteMarkdown body={body} colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent, panel: c.panel }}
            emptyLabel={tr.notesEmptyBody} createTaskLabel={tr.notesCreateTask}
            onToggle={canEdit && !saving ? line => setBody(current => toggleChecklistAt(current, line)) : undefined}
            onCreateTask={canEdit && !saving && !isNew ? line => { void createTaskFromLine(line); } : undefined} />
        </ScrollView>
      ) : (
        <TextInput testID="notes-body" accessibilityLabel={tr.noteBodyPlaceholder} placeholder={tr.noteBodyPlaceholder}
          placeholderTextColor={c.sub} value={body} onChangeText={setBody} editable={canEdit && !saving}
          multiline textAlignVertical="top" scrollEnabled style={[s.body, { color: c.text }]} />
      )}
      <Text style={[s.hint, { color: c.sub }]}>{tr.notesMarkdownHint}</Text>
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
          {tagChips.length > 0 && (
            <ScrollView testID="notes-tag-filter" horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.tagRow} keyboardShouldPersistTaps="handled">
              {button(tr.notesTagsAll, () => setTagFilter(null), 'notes-tag-all', false, tagFilter === null)}
              {tagChips.map(chip => (
                <React.Fragment key={tagKey(chip.tag)}>
                  {button(`#${chip.tag} · ${chip.count}`, () => setTagFilter(chip.tag), `notes-tag-${chip.tag}`, false,
                    tagFilter !== null && tagKey(tagFilter) === tagKey(chip.tag))}
                </React.Fragment>
              ))}
            </ScrollView>
          )}
          <SectionList sections={readError ? [] : sections} keyExtractor={n => n.id} keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 16 }} stickySectionHeadersEnabled={false}
            ListEmptyComponent={<Text style={{ padding: 20, color: c.sub }}>{!ready ? tr.loading : readError ? '' : query || tagFilter ? tr.notesNoResults : tr.noNotes}</Text>}
            renderSectionHeader={({ section }) => <Text style={[s.section, { color: c.sub }]}>{section.title} · {section.data.length}</Text>}
            renderItem={({ item }) => {
              const checklist = checklistProgress(item.body);
              const chips = noteTags(item);
              return <TouchableOpacity accessibilityRole="button" testID={`note-${item.id}`}
                accessibilityLabel={`${item.pinned ? `${tr.notesPinned}, ` : ''}${item.title || tr.untitled}`}
                accessibilityState={{ selected: selected?.id === item.id }} onPress={() => open(item)}
                style={[s.card, { backgroundColor: c.panel, borderColor: selected?.id === item.id ? c.accent : c.border }]}>
                <View style={s.cardHead}>
                  {item.pinned && <Text testID={`note-pin-${item.id}`} style={{ color: c.accent, fontSize: 15 }}>★</Text>}
                  <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontWeight: '700', fontSize: 16 }}>{item.title || tr.untitled}</Text>
                </View>
                <Text numberOfLines={2} style={{ color: c.sub, marginTop: 6 }}>{notePreview(item)}</Text>
                {chips.length > 0 && <Text numberOfLines={1} style={{ color: c.accent, fontSize: 12, marginTop: 6 }}>{chips.map(tag => `#${tag}`).join(' ')}</Text>}
                <View style={s.cardFoot}>
                  <Text style={{ color: c.sub, fontSize: 12 }}>{new Date(item.updatedAt).toLocaleDateString(locale)}</Text>
                  {checklist.total > 0 && <Text testID={`note-checklist-${item.id}`} style={{ color: c.sub, fontSize: 12 }}>
                    {tr.notesChecklist} {checklist.done}/{checklist.total}
                  </Text>}
                </View>
              </TouchableOpacity>;
            }} />
        </View>}
        {editor}
      </View>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 }, panes: { flex: 1, gap: 16 }, list: { flex: 1 }, listWide: { width: 300 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  tagRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 8 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, justifyContent: 'center', alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  search: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12, fontSize: 16 },
  section: { fontWeight: '600', paddingVertical: 12 }, card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 },
  editor: { flex: 1, minWidth: 0, padding: 16, borderWidth: 1, borderRadius: 16 },
  context: { fontSize: 13, paddingVertical: 8 }, title: { fontSize: 24, fontWeight: '700', minHeight: 52, borderBottomWidth: 1 },
  tagsInput: { minHeight: 44, fontSize: 15, borderBottomWidth: 1, paddingVertical: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10 },
  link: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  previewPane: { flex: 1, paddingTop: 8 },
  body: { flex: 1, fontSize: 17, lineHeight: 26, paddingTop: 14 },
  hint: { fontSize: 12, paddingTop: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
