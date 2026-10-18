/**
 * components/notes/NotesWorkspace.tsx — робочий простір нотаток.
 *
 * Обидва маршрути (`/notes` — усі нотатки, `/project/[id]/notes` — нотатки
 * проєкту) редагують ОДНУ колекцію `notes`; фільтр ніколи не стає записом-
 * заміною (запис іде різницею через `saveSyncedChanges`).
 *
 * Тут лише стан екрана й компонування:
 *  - список (NotesList: «Список» / «Сітка», вибір памʼятає пристрій);
 *  - редактор (NoteEditor: один режим, автозбереження);
 *  - лист перетворення (NoteConvertSheet).
 * Широке вікно (iPad, ландшафт) — список і редактор поруч.
 *
 * Кольори — лише з токенів (`getScreenColors('notes')` → notesTheme.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdSlot } from '@/components/advertising/Advertising';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData, loadDataResult, retryStorageRead, saveData, subscribeToStorage } from '@/store/storage';
import {
  canEditNote,
  collectNoteTags,
  filterNotesByScope,
  groupNotesByProject,
  normalizeNotes,
  selectNotes,
  tagKey,
  type Note,
  type NoteScope,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

import { moveNoteRecord, NOTES_VIEW_MODE_KEY, readAuthUserId, type NotesViewMode } from './noteActions';
import { flushAttachmentMoves } from './noteAttachmentsApi';
import { NoteConvertSheet, type NoteConvertMode } from './NoteConvertSheet';
import { NoteEditor, type NoteLinkOption } from './NoteEditor';
import { NotesList, type NotesSection } from './NotesList';
import { notesPalette } from './notesTheme';
import { useNoteProjects, useWritableProjects } from './useNoteTargets';

export type { Note } from '@/utils/notes';

/** Мінімум, потрібний для підпису звʼязку — повні типи тут не потрібні. */
interface LinkTarget { id?: unknown; title?: unknown; projectId?: unknown }

function linkOptions(items: readonly LinkTarget[]): NoteLinkOption[] {
  return items
    .map(item => ({
      id: typeof item?.id === 'string' ? item.id : '',
      label: (typeof item?.title === 'string' && item.title.trim()) || '—',
      ...(typeof item?.projectId === 'string' && item.projectId ? { projectId: item.projectId } : {}),
    }))
    .filter(option => option.id.length > 0);
}

export function NotesWorkspace({ projectId, isDark, createRequested, onCreateHandled, openRequested, onOpenHandled }: {
  projectId?: string;
  isDark: boolean;
  /** Відкрити редактор нової нотатки, щойно сховище прочитане (`/notes?create=1`). */
  createRequested?: boolean;
  /** Запит виконано — маршрут має прибрати параметр, щоб не повторити. */
  onCreateHandled?: () => void;
  /** Відкрити наявну нотатку за id (`/notes?open=<id>`, «Розгорнути» зі швидкого запису). */
  openRequested?: string;
  onOpenHandled?: () => void;
}) {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isExpanded, isWide, width } = useResponsive();
  /**
   * Список + редактор поруч. На expanded — завжди; на портреті iPad (medium,
   * ≥720pt вікна) — теж, але лише в особистих нотатках: там сайдбар — рейка
   * (76pt), і редактору лишається ~400pt. У проєкті сайдбар повний (232pt) —
   * редактор вийшов би вужчим за телефонний, тож там як на телефоні.
   */
  const split = isExpanded || (!!isWide && !projectId && (width ?? 0) >= 720);
  const listWidth = !isExpanded ? 280 : (width ?? 0) >= 1180 ? 360 : 320;
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const roles = useProjectRoles();
  const c = useMemo(() => notesPalette(isDark), [isDark]);
  const projectRows = useNoteProjects();
  const writable = useWritableProjects('note');

  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<NoteLinkOption[]>([]);
  const [meetings, setMeetings] = useState<NoteLinkOption[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [readError, setReadError] = useState(false);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<NoteScope>('all');
  const [archive, setArchive] = useState(false);
  const [sort, setSort] = useState<'newest' | 'oldest' | 'title'>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NotesViewMode>('list');
  const [selected, setSelected] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [convert, setConvert] = useState<{ mode: NoteConvertMode; note: Note } | null>(null);
  const mounted = useRef(true);
  const readVersion = useRef(0);

  const canEditProject = useCallback((id: string) => canEditProjectItem(id, roles), [roles]);
  const canCreate = canEditNote(projectId ? { projectId } : null, canEditProject);

  const reload = useCallback(async (retry = false) => {
    const version = ++readVersion.current;
    const result = await (retry ? retryStorageRead : loadDataResult)<unknown>('notes', []);
    if (!mounted.current || version !== readVersion.current) return;
    // Помилка — лише коли сховище не прочиталось або там не масив. Окремий
    // пошкоджений запис пропускає normalizeNotes.
    const valid = result.ok && Array.isArray(result.value);
    setReadError(!valid);
    setReady(true);
    if (valid) setNotes(normalizeNotes(result.value));
  }, []);

  useEffect(() => {
    mounted.current = true;
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
      const id = await readAuthUserId();
      if (mounted.current) setUserId(id);
    };
    const readViewMode = async () => {
      try {
        const value = await loadData<unknown>(NOTES_VIEW_MODE_KEY, 'list');
        if (mounted.current && (value === 'list' || value === 'grid')) setViewMode(value);
      } catch { /* лишаємо «Список» */ }
    };
    void reload(); void readLinks(); void readUser(); void readViewMode();
    void flushAttachmentMoves();
    const off = subscribeToStorage(key => {
      if (key === 'notes') void reload();
      if (key === 'tasks' || key === 'meetings') void readLinks();
      if (key === 'auth_user') void readUser();
    });
    return () => { mounted.current = false; off(); };
  }, [reload]);

  const changeViewMode = (mode: NotesViewMode) => {
    setViewMode(mode);
    void saveData(NOTES_VIEW_MODE_KEY, mode).catch(() => {});
  };

  const projectNames = useMemo(() => Object.fromEntries(projectRows.map(p => [p.id, p.name])), [projectRows]);
  const projectLabel = (note: Note) => note.projectId ? projectNames[note.projectId] ?? tr.project : tr.notesPersonal;

  const open = (note: Note, fresh = false) => {
    if (selected?.id === note.id && !fresh) return;
    setSelected(note); setIsNew(fresh);
  };
  const closeEditor = () => { setSelected(null); setIsNew(false); };

  const add = () => {
    if (!canCreate || !ready || readError) return;
    const now = new Date().toISOString();
    setArchive(false);
    open({ id: uuidV4(), title: '', body: '', createdAt: now, updatedAt: now, ...(projectId ? { projectId } : {}) }, true);
  };

  // Запит «нова нотатка» з маршруту — лише коли сховище прочитане і раз на запит.
  const addRef = useRef(add);
  useEffect(() => { addRef.current = add; });
  const createHandled = useRef(false);
  useEffect(() => {
    if (!createRequested) { createHandled.current = false; return; }
    if (!ready || createHandled.current) return;
    createHandled.current = true;
    addRef.current();
    onCreateHandled?.();
  }, [createRequested, ready, onCreateHandled]);

  // Запит «відкрити нотатку» — коли вона вже є в прочитаній колекції.
  const openHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!openRequested) { openHandled.current = null; return; }
    if (!ready || openHandled.current === openRequested) return;
    const target = notes.find(note => note.id === openRequested);
    if (!target) return;
    openHandled.current = openRequested;
    setArchive(target.archived === true);
    setSelected(target); setIsNew(false);
    onOpenHandled?.();
  }, [openRequested, ready, notes, onOpenHandled]);

  const scoped = useMemo(() => (projectId
    ? notes.filter(n => n.projectId === projectId)
    : filterNotesByScope(notes, scope)),
  [notes, projectId, scope]);
  const archiveMode = archive ? 'archived' as const : 'active' as const;
  const tagChips = useMemo(() => collectNoteTags(selectNotes(scoped, { archived: archiveMode }), locale), [scoped, archiveMode, locale]);
  const sections: NotesSection[] = useMemo(() => groupNotesByProject(
    selectNotes(scoped, { search: query, sort, tag: tagFilter, locale, archived: archiveMode }), projectNames, locale)
    .map(group => ({
      key: group.projectId ?? '',
      title: group.projectId ? group.name ?? `${tr.project} · ${group.projectId.slice(0, 8)}` : tr.notesPersonal,
      data: group.notes,
    })), [scoped, query, sort, tagFilter, projectNames, tr, locale, archiveMode]);

  // Обраний тег міг зникнути разом з останньою нотаткою, що його несла.
  useEffect(() => {
    if (tagFilter && !tagChips.some(chip => tagKey(chip.tag) === tagKey(tagFilter))) setTagFilter(null);
  }, [tagChips, tagFilter]);

  const live = selected ? notes.find(note => note.id === selected.id) ?? null : null;
  const current = live ?? selected;
  const canEdit = !!current && canEditNote(current, canEditProject);
  const moveTargets = useMemo(() => [
    { id: null, name: tr.notesPersonal },
    ...writable.map(project => ({ id: project.id, name: project.name, color: project.color })),
  ], [writable, tr]);

  const moveSelected = async (note: Note, target: string | null) => {
    try {
      const moved = await moveNoteRecord(note, target);
      if (!mounted.current) return;
      // У просторі проєкту нотатка, що пішла з нього, зникає з екрана.
      if (projectId && moved.projectId !== projectId) { closeEditor(); return; }
      setSelected(moved); setIsNew(false);
    } catch {
      Alert.alert(tr.error, tr.notesMoveError);
    }
  };

  const chip = (id: string, label: string, active: boolean, onPress: () => void, disabled = false) => (
    <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress}
      style={[s.chip, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.dim : 'transparent', opacity: disabled ? 0.45 : 1 }]}>
      <Text numberOfLines={1} style={{ color: active ? c.accentText : c.text, fontWeight: active ? '700' : '500' }}>{label}</Text>
    </TouchableOpacity>
  );
  const iconButton = (id: string, icon: string, label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      onPress={onPress} style={[s.iconButton, { backgroundColor: active ? c.dim : 'transparent' }]}>
      <IconSymbol name={icon} size={18} color={active ? c.accentText : c.sub} />
    </TouchableOpacity>
  );

  const editorPane = selected ? (
    <NoteEditor
      // Ключ із проєктом: після переміщення редактор стартує з новим записом,
      // інакше автозбереження від старої копії повернуло б нотатку назад.
      key={`${selected.id}|${current?.projectId ?? ''}`}
      note={selected}
      isNew={isNew}
      live={live}
      canEdit={canEdit && !readError}
      colors={c}
      isDark={isDark}
      compact={!split}
      projectLabel={projectLabel(current ?? selected)}
      tasks={tasks}
      meetings={meetings}
      moveTargets={moveTargets}
      userId={userId}
      onClose={closeEditor}
      onSaved={(next, all) => {
        if (!mounted.current) return;
        if (all) setNotes(all);
        setSelected(prev => (prev && prev.id === next.id ? next : prev));
      }}
      onDeleted={all => { if (!mounted.current) return; if (all) setNotes(all); closeEditor(); }}
      onConvert={(mode, note) => setConvert({ mode, note })}
      onMove={(note, target) => { void moveSelected(note, target); }}
    />
  ) : split ? (
    <View style={[s.empty, { borderColor: c.border }]}>
      <IconSymbol name="note.text" size={36} color={c.accent} />
      <Text style={{ color: c.sub, textAlign: 'center' }}>{tr.notesSelectHint}</Text>
    </View>
  ) : null;

  const columns = split ? 1 : (width ?? 0) >= 900 ? 3 : 2;
  const emptyText = !ready ? tr.loading : readError ? '' : query || tagFilter ? tr.notesNoResults : archive ? tr.notesNoArchived : tr.noNotes;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { backgroundColor: c.bg }]}>
      {readError && <View accessibilityRole="alert" style={{ padding: 12, gap: 8 }}>
        <Text style={{ color: c.text }}>{tr.notesReadError}</Text>
        {chip('notes-retry', tr.notesRetry, false, () => { void reload(true); })}
      </View>}
      <View style={[s.panes, { flexDirection: split ? 'row' : 'column', paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
        {(split || !selected) && <View testID="notes-list" style={split ? { width: listWidth } : s.list}>
          <View style={s.searchRow}>
            <View style={[s.search, { borderColor: c.border, backgroundColor: c.card }]}>
              <IconSymbol name="magnifyingglass" size={16} color={c.sub} />
              <TextInput testID="notes-search" accessibilityLabel={tr.notesSearch} placeholder={tr.notesSearch}
                placeholderTextColor={c.sub} value={query} onChangeText={setQuery}
                style={{ flex: 1, color: c.text, fontSize: 16, minHeight: Atlas.controlHeight }} />
            </View>
            {canCreate && (
              <TouchableOpacity testID="notes-add" accessibilityRole="button" accessibilityLabel={tr.addNote}
                accessibilityState={{ disabled: !ready || readError }} disabled={!ready || readError} onPress={add}
                style={[s.addButton, { backgroundColor: c.accentStrong, opacity: !ready || readError ? 0.45 : 1 }]}>
                <IconSymbol name="plus" size={20} color={c.onAccent} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            accessibilityLabel={tr.notesFilterLabel} contentContainerStyle={s.chips}>
            {!projectId && (['all', 'personal', 'projects'] as const).map(value => chip(`notes-scope-${value}`,
              value === 'all' ? tr.all : value === 'personal' ? tr.notesPersonal : tr.projects,
              scope === value && !archive, () => { setScope(value); setArchive(false); }))}
            {chip('notes-archive-filter', tr.notesArchiveFilter, archive, () => setArchive(value => !value))}
            {chip('notes-sort', sort === 'title' ? tr.notesSortTitle : sort === 'oldest' ? tr.sortOldest : tr.sortNewest, false,
              () => setSort(v => v === 'newest' ? 'oldest' : v === 'oldest' ? 'title' : 'newest'))}
            <View style={s.toggle}>
              {iconButton('notes-view-list', 'list.bullet', tr.notesViewList, viewMode === 'list', () => changeViewMode('list'))}
              {iconButton('notes-view-grid', 'square.grid.2x2', tr.notesViewGrid, viewMode === 'grid', () => changeViewMode('grid'))}
            </View>
          </ScrollView>
          {tagChips.length > 0 && (
            <ScrollView testID="notes-tag-filter" horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
              {chip('notes-tag-all', tr.notesTagsAll, tagFilter === null, () => setTagFilter(null))}
              {tagChips.map(tagChip => chip(`notes-tag-${tagChip.tag}`, `#${tagChip.tag} · ${tagChip.count}`,
                tagFilter !== null && tagKey(tagFilter) === tagKey(tagChip.tag), () => setTagFilter(tagChip.tag)))}
            </ScrollView>
          )}
          <NotesList sections={readError ? [] : sections} mode={viewMode} columns={columns} colors={c}
            selectedId={selected?.id ?? null} locale={locale} emptyText={emptyText}
            footer={notes.length >= 10 && !selected ? <AdSlot slot="M2" /> : null}
            onOpen={note => open(note)} />
        </View>}
        {editorPane}
      </View>
      <NoteConvertSheet visible={!!convert} mode={convert?.mode ?? 'task'} note={convert?.note ?? null} isDark={isDark}
        onClose={() => setConvert(null)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  panes: { flex: 1, gap: 16 },
  list: { flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: Atlas.radius.xlarge },
  addButton: { width: Atlas.controlHeight + 4, height: Atlas.controlHeight + 4, borderRadius: Atlas.radius.xlarge, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 8 },
  chip: { minHeight: Atlas.controlHeight, paddingHorizontal: 14, justifyContent: 'center', borderRadius: Atlas.radius.xxlarge, borderWidth: 1, maxWidth: 220 },
  toggle: { flexDirection: 'row', gap: 2, marginLeft: 4 },
  iconButton: { minWidth: Atlas.controlHeight, minHeight: Atlas.controlHeight, alignItems: 'center', justifyContent: 'center', borderRadius: Atlas.radius.xlarge },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, borderWidth: StyleSheet.hairlineWidth, borderRadius: Atlas.radius.xxlarge, borderStyle: 'dashed' },
});
