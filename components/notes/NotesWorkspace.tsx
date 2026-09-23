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
  canEditNote,
  checklistProgress,
  collectNoteTags,
  filterNotesByScope,
  formatTagsInput,
  groupNotesByProject,
  isNoteDraftDirty,
  noteLeaveDecision,
  noteTaskDraft,
  notePreview,
  noteTags,
  normalizeNotes,
  parseTagsInput,
  patchNote,
  selectNotes,
  tagKey,
  toggleChecklistAt,
  writeNote,
  type Note,
  type NoteScope,
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

/**
 * Both routes edit the same collection. Filtering never becomes a replacement write.
 *
 * Наявна нотатка відкривається в РЕЖИМІ ЧИТАННЯ (як у вебі): розмітка, живий
 * чек-бокс і закріплення зберігаються одразу (`patchNote` + `saveSyncedChanges`),
 * а текст правиться лише після «Редагувати». Нова нотатка — одразу редактор.
 */
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
  const [scope, setScope] = useState<NoteScope>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<Note | null>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
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
  const reading = !!selected && mode === 'read';
  // У читанні показуємо СВІЖИЙ запис зі сховища (синк міг його оновити), а не
  // знімок, зроблений у момент відкриття; редактор тримає власну чернетку.
  const current = reading ? notes.find(n => n.id === selected.id) ?? selected : selected;
  const dirty = !!selected && mode === 'edit' && isNoteDraftDirty(selected, {
    title, body, tags: parseTagsInput(tagsInput), pinned, linkedTaskId, linkedMeetingId,
  });
  const canEditProject = (id: string) => canEditProjectItem(id, roles);
  const canEdit = canEditNote(current ?? (projectId ? { projectId } : null), canEditProject);
  const canCreate = canEditNote(projectId ? { projectId } : null, canEditProject);
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
    const decision = noteLeaveDecision({ dirty, busy: busy.current });
    if (decision === 'stay') return;
    if (decision === 'leave') { next(); return; }
    Alert.alert(tr.notesUnsavedTitle, tr.notesUnsavedBody, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.discardChanges, style: 'destructive', onPress: next },
    ]);
  };
  usePreventRemove(dirty || saving, ({ data }) => confirmLeave(() => navigation.dispatch(data.action)));

  const closeEditor = () => {
    setSelected(null); setTitle(''); setBody(''); setTagsInput('');
    setPinned(false); setLinkedTaskId(null); setLinkedMeetingId(null); setPreview(false);
    setMode('read');
  };
  const fillDraft = (note: Note) => {
    setTitle(note.title); setBody(note.body);
    setTagsInput(formatTagsInput(note.tags));
    setPinned(note.pinned === true);
    setLinkedTaskId(note.linkedTaskId ?? null);
    setLinkedMeetingId(note.linkedMeetingId ?? null);
    setPreview(false);
  };
  const open = (note: Note, fresh = false) => confirmLeave(() => {
    setSelected(note); setIsNew(fresh);
    setMode(fresh ? 'edit' : 'read');
    fillDraft(note);
  });
  /** Читання → редактор: чернетка береться зі свіжого запису. */
  const startEdit = () => {
    if (!current || !canEdit || busy.current) return;
    setSelected(current); setIsNew(false);
    fillDraft(current);
    setMode('edit');
  };
  /** «Скасувати» в редакторі наявної нотатки — назад до читання, з питанням. */
  const cancelEdit = () => confirmLeave(() => {
    if (isNew) { closeEditor(); return; }
    if (selected) fillDraft(selected);
    setMode('read');
  });
  const add = () => {
    if (!canCreate || !ready || readError) return;
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
        // Як у вебі: після збереження — читання щойно збереженої нотатки.
        setSelected(next); setIsNew(false); setPreview(false);
        setMode('read');
      }
    } catch {
      Alert.alert(tr.error, tr.notesSaveError);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  /**
   * Тиха правка з читання (чек-бокс, закріплення) — одразу на диск і в синк,
   * без «Зберегти», так само як `patch` у вебі.
   */
  const patchRead = async (change: { body?: string; pinned?: boolean }) => {
    if (!current || mode !== 'read' || !canEdit || busy.current || readError || !ready) return;
    const next = patchNote(current, change, new Date().toISOString());
    busy.current = true; setSaving(true);
    try {
      const result = await saveSyncedChanges('notes', [current], [next], { checked: true });
      if (mounted.current) {
        if (result) setNotes(normalizeNotes(result));
        setSelected(next);
      }
    } catch {
      Alert.alert(tr.error, tr.notesSaveError);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const toggleReadLine = (line: number) => {
    if (!current) return;
    const nextBody = toggleChecklistAt(current.body, line);
    if (nextBody !== current.body) void patchRead({ body: nextBody });
  };
  const remove = () => {
    const target = current;
    if (!target || isNew || !canEdit || busy.current || readError) return;
    Alert.alert(tr.delete, tr.notesDeleteConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: async () => {
        if (busy.current) return;
        busy.current = true; setSaving(true);
        try {
          const result = await saveSyncedChanges('notes', [target], [], { checked: true });
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
    if (!canEdit || busy.current || !current) return;
    // У читанні джерело — збережений текст, у редакторі — чернетка, яку людина бачить.
    const source = mode === 'read' ? current.body : body;
    const draft = noteTaskDraft(
      { projectId: current.projectId ?? projectId },
      source.split('\n')[line] ?? '',
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

  const scoped = useMemo(() => (projectId
    ? notes.filter(n => n.projectId === projectId)
    : filterNotesByScope(notes, scope)),
  [notes, projectId, scope]);
  const tagChips = useMemo(() => collectNoteTags(scoped, locale), [scoped, locale]);
  const sections = useMemo(() => groupNotesByProject(selectNotes(scoped, { search: query, sort, tag: tagFilter, locale }), projects, locale)
    .map(group => ({
      key: group.projectId ?? '',
      title: group.projectId ? group.name ?? `${tr.project} · ${group.projectId.slice(0, 8)}` : tr.notesPersonal,
      data: group.notes,
    })), [scoped, query, sort, tagFilter, projects, tr, locale]);

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

  const projectLabel = (note: Note) => note.projectId ? projects[note.projectId] ?? tr.project : tr.notesPersonal;
  const linkLabel = (id: string | undefined, options: PickerOption[]) =>
    id ? options.find(option => option.id === id)?.label ?? tr.notesLinkLost : null;
  const readTags = current ? noteTags(current) : [];
  const readTask = current ? linkLabel(current.linkedTaskId, tasks) : null;
  const readMeeting = current ? linkLabel(current.linkedMeetingId, meetings) : null;

  const reader = reading && current ? (
    <View testID="notes-reader" style={[s.editor, { backgroundColor: c.panel, borderColor: c.border }]}>
      <View style={s.toolbar}>
        {button(tr.close, () => confirmLeave(closeEditor), 'notes-close', saving)}
        {canEdit && button(tr.edit, startEdit, 'notes-edit', saving || readError)}
        {canEdit && button(current.pinned ? tr.notesUnpin : tr.notesPin, () => { void patchRead({ pinned: !current.pinned }); },
          'notes-pin', saving || readError, current.pinned === true)}
        {canEdit && button(tr.delete, remove, 'notes-delete', saving || readError)}
      </View>
      <Text style={[s.context, { color: c.sub }]}>{projectLabel(current)}</Text>
      {!canEdit && <Text style={{ color: c.sub, paddingBottom: 8 }}>{tr.notesReadOnly}</Text>}
      <Text testID="notes-read-title" accessibilityRole="header" style={[s.readTitle, { color: c.text }]}>
        {current.title || tr.untitled}
      </Text>
      {readTags.length > 0 && <Text style={{ color: c.accent, fontSize: 13, paddingTop: 6 }}>
        {readTags.map(tag => `#${tag}`).join(' ')}
      </Text>}
      {(readTask || readMeeting) && <Text style={{ color: c.sub, fontSize: 13, paddingTop: 6 }}>
        {[readTask && `${tr.notesLinkTask}: ${readTask}`, readMeeting && `${tr.notesLinkMeeting}: ${readMeeting}`].filter(Boolean).join(' · ')}
      </Text>}
      <ScrollView style={s.previewPane} contentContainerStyle={{ paddingVertical: 10 }} keyboardShouldPersistTaps="handled">
        <NoteMarkdown body={current.body} colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent, panel: c.panel }}
          emptyLabel={tr.notesEmptyBody} createTaskLabel={tr.notesCreateTask}
          onToggle={canEdit && !saving && !readError ? toggleReadLine : undefined}
          onCreateTask={canEdit && !saving ? line => { void createTaskFromLine(line); } : undefined} />
      </ScrollView>
    </View>
  ) : null;

  const editor = selected && !reading ? (
    <View testID="notes-editor" style={[s.editor, { backgroundColor: c.panel, borderColor: c.border }]}>
      <View style={s.toolbar}>
        {button(tr.close, () => confirmLeave(closeEditor), 'notes-close', saving)}
        {!isNew && button(tr.cancel, cancelEdit, 'notes-cancel-edit', saving)}
        {button(preview ? tr.notesEditText : tr.notesPreview, () => setPreview(v => !v), 'notes-preview-toggle', false, preview)}
        {canEdit && button(pinned ? tr.notesUnpin : tr.notesPin, () => setPinned(v => !v), 'notes-pin', saving, pinned)}
        {canEdit && !isNew && button(tr.delete, remove, 'notes-delete', saving || readError)}
        {canEdit && button(saving ? tr.loading : tr.save, () => { void save(); }, 'notes-save', saving || readError)}
      </View>
      <Text style={[s.context, { color: c.sub }]}>{projectLabel(selected)}</Text>
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
  ) : reader ?? (isExpanded ? <View style={s.empty}><Text style={{ color: c.sub }}>{tr.notesSelectHint}</Text></View> : null);

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
            {canCreate && button(tr.addNote, add, 'notes-add', !ready || readError || saving)}
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
  context: { fontSize: 13, paddingVertical: 8 },
  readTitle: { fontSize: 24, fontWeight: '700' }, title: { fontSize: 24, fontWeight: '700', minHeight: 52, borderBottomWidth: 1 },
  tagsInput: { minHeight: 44, fontSize: 15, borderBottomWidth: 1, paddingVertical: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10 },
  link: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  previewPane: { flex: 1, paddingTop: 8 },
  body: { flex: 1, fontSize: 17, lineHeight: 26, paddingTop: 14 },
  hint: { fontSize: 12, paddingTop: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
