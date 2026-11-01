/**
 * components/notes/NotesWorkspace.tsx — робочий простір нотаток.
 *
 * Обидва маршрути (`/notes` — усі нотатки, `/project/[id]/notes` — нотатки
 * проєкту) редагують ОДНУ колекцію `notes`; фільтр ніколи не стає записом-
 * заміною (запис іде різницею через `saveSyncedChanges`).
 *
 * Тут лише стан екрана й компонування:
 *  - список (NotesList: «Список» / «Сітка», вибір памʼятає пристрій; рядки
 *    «Списку» свайпаються — «Закріпити/Відкріпити», «Видалити»);
 *  - редактор (NoteEditor: один режим, автозбереження);
 *  - аркуш перетворення (NoteConvertSheet: нотатка → задача / зустріч).
 *
 * Layout System v2.4 (зони): список — ГОЛОВНА зона, редактор — ДИНАМІЧНА
 * панель праворуч на iPad (коли вміщається поруч), статична зона — контекст
 * (дата, KPI, закріплені, нещодавні, теги). Телефон і вузький iPad —
 * редактор на весь екран. Відкрита нотатка — у параметрі `?note=<id>`.
 * Стани зони: скелет під час читання, «Повторити» при збої, порожньо.
 *
 * Кольори — лише з токенів DS v2 (notesTheme.ts).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdSlot } from '@/components/advertising/Advertising';
import { Chip } from '@/components/ds/Chip';
import { FilterBar, FilterSearch, FilterSelect, Segmented, useFiltersV25 } from '@/components/ds/filters';
import { KpiCounter, PageHeader } from '@/components/ds/PageHeader';
import { ZoneEmpty, ZoneLayout, ZoneSkeleton, useZoneState, zoneWidths, type SwipeAction, type ZonePanel } from '@/components/layout-zones';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { fontFamily, shadow } from '@/constants/theme';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData, loadDataResult, retryStorageRead, saveData, subscribeToStorage } from '@/store/storage';
import {
  canEditNote,
  collectNoteTags,
  filterNotesByScope,
  groupNotesByProject,
  normalizeNotes,
  patchNote,
  selectNotes,
  tagKey,
  type Note,
  type NoteScope,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

import {
  deleteNoteRecord, linkedHref, moveNoteRecord, navigateTo, NOTES_VIEW_MODE_KEY, persistNote, readAuthUserId, type NotesViewMode,
} from './noteActions';
import { flushAttachmentMoves } from './noteAttachmentsApi';
import { NoteConvertSheet, type NoteConvertMode, type NoteConvertResult } from './NoteConvertSheet';
import { createNoteEditorSession, NoteEditor, type NoteEditorSession, type NoteLinkOption } from './NoteEditor';
import { NotesList, type NotesSection } from './NotesList';
import { notesPalette } from './notesTheme';
import { useNotesZoneStrings } from './notesZoneStrings';
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

type SortMode = 'newest' | 'oldest' | 'title';

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
  const zs = useNotesZoneStrings();
  const { isWide, width } = useResponsive();
  const screenWidth = useScreenWidth();
  /**
   * Редактор — панель поруч зі списком, коли вона вміщається (zoneWidths —
   * те саме правило, що в ZoneLayout); інакше — на весь екран.
   */
  const split = !!isWide && zoneWidths({
    windowWidth: width ?? 0, screenWidth: screenWidth ?? width ?? 0, wide: !!isWide, wantStatic: false, wantDynamic: true,
  }).dynamicMode === 'panel';
  // Відкрита нотатка — у параметрі маршруту `?note=` (Layout System v2.4).
  const zone = useZoneState({ section: projectId ? 'project-notes' : 'notes', selectedParam: 'note' });
  const v25 = useFiltersV25();
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const roles = useProjectRoles();
  const c = useMemo(() => notesPalette(isDark), [isDark]);
  const cardShadow = shadow[isDark ? 'dark' : 'light'].card;
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
  const [sort, setSort] = useState<SortMode>('newest');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NotesViewMode>('list');
  const [selected, setSelected] = useState<Note | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [convert, setConvert] = useState<{ mode: NoteConvertMode; note: Note } | null>(null);
  /** Планшет: щойно створена з нотатки задача/зустріч — смуга «Відкрити». */
  const [created, setCreated] = useState<{ kind: NoteConvertMode; id: string; title: string; projectId?: string } | null>(null);
  /** Планшет: `?note=<id>`, якого немає в сховищі — стан «не знайдено» в панелі. */
  const [missingId, setMissingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  /** Чернетка відкритої нотатки — переживає перенос редактора між зонами (поворот iPad). */
  const session = useRef<{ id: string; value: NoteEditorSession } | null>(null);

  const canEditProject = useCallback((id: string) => canEditProjectItem(id, roles), [roles]);
  const canCreate = canEditNote(projectId ? { projectId } : null, canEditProject);

  const reload = useCallback(async (retry = false) => {
    const version = ++readVersion.current;
    const result = await (retry ? retryStorageRead : loadDataResult)<unknown>('notes', []);
    if (!mounted.current || version !== readVersion.current) return;
    // Помилка — лише коли сховище не прочиталось або там не масив. Окремий
    // пошкоджений запис пропускає normalizeNotes, і через одну стару нотатку
    // весь екран більше не гасне.
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
    setMissingId(null);
    // Панель деталей вимкнена трьома крапками — відкриття запису вмикає її
    // назад (як useZoneState.select): інакше тап по рядку «нічого не робив» би.
    if (split && !zone.panels.dynamic) zone.setPanel('dynamic', true);
    if (selected?.id === note.id && !fresh) return;
    session.current = { id: note.id, value: createNoteEditorSession(note, fresh) };
    setSelected(note); setIsNew(fresh);
  };
  const closeEditor = () => { setSelected(null); setIsNew(false); session.current = null; };

  const add = () => {
    if (!canCreate || !ready || readError) return;
    const now = new Date().toISOString();
    setArchive(false);
    open({ id: uuidV4(), title: '', body: '', createdAt: now, updatedAt: now, ...(projectId ? { projectId } : {}) }, true);
  };

  // Запит «нова нотатка» з маршруту — лише коли сховище прочитане (інакше
  // `add` мовчки нічого не зробить) і лише раз на запит.
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

  // Запит «відкрити нотатку» (`?open=<id>`) — коли вона вже є в прочитаній колекції.
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; });
  const openHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!openRequested) { openHandled.current = null; return; }
    if (!ready || openHandled.current === openRequested) return;
    const target = notes.find(note => note.id === openRequested);
    if (!target) return;
    openHandled.current = openRequested;
    setArchive(target.archived === true);
    openRef.current(target);
    onOpenHandled?.();
  }, [openRequested, ready, notes, onOpenHandled]);

  // `?note=<id>` (Layout System): щойно сховище прочитане — відкрити нотатку
  // з адреси (один раз); далі відкрита ЗБЕРЕЖЕНА нотатка дзеркалиться в адресу
  // (нова — ні: її ще немає в сховищі, і посилання на неї нікуди б не вело).
  const zoneSelect = zone.select;
  const noteParamConsumed = useRef(false);
  useEffect(() => {
    if (!ready || noteParamConsumed.current) return;
    noteParamConsumed.current = true;
    const target = zone.selectedId ? notes.find(n => n.id === zone.selectedId) : undefined;
    if (target && !selected) { setArchive(target.archived === true); openRef.current(target); }
    // Планшет: посилання на нотатку, якої вже немає, — пояснення в панелі.
    else if (!target && zone.selectedId && isWide && !readError) setMissingId(zone.selectedId);
    // Лише на перше прочитання сховища.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const mirrorId = selected && !isNew ? selected.id : null;
  useEffect(() => {
    if (!noteParamConsumed.current) return;
    zoneSelect(mirrorId);
  }, [mirrorId, zoneSelect]);

  const scoped = useMemo(() => (projectId
    ? notes.filter(n => n.projectId === projectId)
    : filterNotesByScope(notes, scope)),
  [notes, projectId, scope]);
  const archiveMode = archive ? 'archived' as const : 'active' as const;
  const activeScoped = useMemo(() => selectNotes(scoped, { archived: 'active' }), [scoped]);
  const tagChips = useMemo(() => collectNoteTags(selectNotes(scoped, { archived: archiveMode }), locale), [scoped, archiveMode, locale]);
  const sections: NotesSection[] = useMemo(() => groupNotesByProject(
    selectNotes(scoped, { search: query, sort, tag: tagFilter, locale, archived: archiveMode }), projectNames, locale)
    .map(group => ({
      key: group.projectId ?? '',
      title: group.projectId ? group.name ?? `${tr.project} · ${group.projectId.slice(0, 8)}` : tr.notesPersonal,
      data: group.notes,
    })), [scoped, query, sort, tagFilter, projectNames, tr, locale, archiveMode]);

  // Обраний тег міг зникнути разом з останньою нотаткою, що його несла —
  // інакше список лишився б порожнім без жодного видимого фільтра.
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
      session.current = { id: moved.id, value: createNoteEditorSession(moved, false) };
      setSelected(moved); setIsNew(false);
    } catch {
      Alert.alert(tr.error, tr.notesMoveError);
    }
  };

  /**
   * Свайп рядка (Layout System v2.4): закріпити/відкріпити і видалити — без
   * відкриття нотатки. Той самий запис, що й з редактора (persistNote /
   * deleteNoteRecord), ті самі права (canEditNote). Відкрита в редакторі
   * нотатка не свайпається: її чернетка важливіша.
   */
  const lockRun = async (job: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await job(); } catch { Alert.alert(tr.error, tr.notesSaveError); } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const quickPin = (note: Note) => lockRun(async () => {
    const all = await persistNote(note, patchNote(note, { pinned: !(note.pinned === true) }, new Date().toISOString()));
    if (mounted.current && all) setNotes(all);
  });
  const quickRemove = (note: Note) => {
    Alert.alert(tr.delete, tr.notesDeleteConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => lockRun(async () => {
        const all = await deleteNoteRecord(note);
        if (mounted.current && all) setNotes(all);
      }) },
    ]);
  };
  const swipeActionsFor = (note: Note): SwipeAction[] => {
    if (!ready || readError || busy || !canEditNote(note, canEditProject) || selected?.id === note.id) return [];
    return [
      { key: 'pin', label: note.pinned ? tr.notesUnpin : tr.notesPin, icon: 'star.fill', onPress: () => { void quickPin(note); }, testID: `note-swipe-pin-${note.id}` },
      { key: 'delete', label: tr.delete, icon: 'trash.fill', tone: 'danger', onPress: () => quickRemove(note), testID: `note-swipe-delete-${note.id}` },
    ];
  };

  /** Перетворення: на планшеті підтвердження — смуга «Відкрити», на телефоні — системне. */
  const onConverted = (result: NoteConvertResult) => {
    if (!mounted.current) return;
    if (isWide) setCreated({ kind: result.kind, id: result.id, title: result.title, ...(result.projectId ? { projectId: result.projectId } : {}) });
  };

  const button = (label: string, onPress: () => void, id: string, disabled = false, active = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress}
      style={[s.button, active || id === 'notes-add'
        ? { backgroundColor: c.accentStrong }
        : { backgroundColor: c.card }, { opacity: disabled ? 0.45 : 1 }]}>
      {id === 'notes-add' ? <IconSymbol name="plus" size={14} color={c.onAccent} /> : null}
      <Text style={{ color: active || id === 'notes-add' ? c.onAccent : c.text, fontFamily: fontFamily.semibold, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
  const iconButton = (id: string, icon: string, label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      onPress={onPress} style={[s.iconButton, { backgroundColor: active ? c.accentStrong : c.card }]}>
      <IconSymbol name={icon} size={16} color={active ? c.onAccent : c.sub} />
    </TouchableOpacity>
  );

  const editor = (embedded: boolean) => selected ? (
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
      compact={!embedded}
      embedded={embedded}
      session={session.current?.id === selected.id ? session.current.value : undefined}
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
      onConvert={(mode, note) => { setCreated(null); setConvert({ mode, note }); }}
      onMove={(note, target) => { void moveSelected(note, target); }}
    />
  ) : null;

  const convertSheet = (
    <NoteConvertSheet visible={!!convert} mode={convert?.mode ?? 'task'} note={convert?.note ?? null} isDark={isDark}
      confirm={isWide ? 'none' : 'alert'} onDone={onConverted}
      onClose={() => setConvert(null)} />
  );

  const readErrorBlock = readError ? (
    // Помилка всередині зони: зрозумілий текст + «Повторити» (Layout System v2.4).
    <View accessibilityRole="alert" style={{ padding: 12, gap: 8 }}>
      <Text style={{ color: c.text, fontFamily: fontFamily.regular }}>{tr.notesReadError}</Text>
      {button(tr.notesRetry, () => { void reload(true); }, 'notes-retry')}
    </View>
  ) : null;

  // Телефон / вузький iPad: редактор на весь екран (список ховається);
  // чернетка живе в сесії й переживає поворот екрана.
  if (selected && !split) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.root, { backgroundColor: c.bg }]}>
        {readErrorBlock}
        <View style={[s.panes, { paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
          {editor(false)}
        </View>
        {convertSheet}
      </KeyboardAvoidingView>
    );
  }

  /**
   * Статична зона (планшет, ≥ 1280pt вікна): контекст, незалежний від вибору —
   * дата, KPI, закріплені, нещодавні, теги (як статична зона нотаток вебу).
   * Поки вона на екрані, KPI не дублюються над списком.
   */
  const staticShown = isWide && zoneWidths({
    windowWidth: width ?? 0, screenWidth: screenWidth ?? width ?? 0, wide: true,
    wantStatic: zone.panels.static, wantDynamic: !!selected || !!missingId,
  }).showStatic;
  const pinnedNotes = activeScoped.filter(n => n.pinned).slice(0, 5);
  const recentNotes = [...activeScoped].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
  const shortcutList = (title: string, items: Note[], id: string) => items.length ? (
    <View style={s.staticBlock}>
      <Text accessibilityRole="header" style={[s.staticHeading, { color: c.sub }]}>{title}</Text>
      {items.map(note => (
        <TouchableOpacity key={note.id} testID={`${id}-${note.id}`} accessibilityRole="button"
          accessibilityLabel={note.title || tr.untitled} accessibilityState={{ selected: selected?.id === note.id }}
          onPress={() => { setArchive(false); open(note); }}
          style={[s.staticRow, selected?.id === note.id ? { backgroundColor: c.subtle } : null]}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: selected?.id === note.id ? fontFamily.semibold : fontFamily.medium }}>
            {note.title || tr.untitled}
          </Text>
          <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] }}>
            {new Date(note.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;
  const staticZone = isWide && ready && !readError ? (
    <View testID="notes-static" style={s.staticRoot}>
      <View>
        <Text accessibilityRole="header" style={[s.staticTitle, { color: c.text }]}>{zs.staticToday}</Text>
        <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular }}>
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>
      {activeScoped.length > 0 ? (
        <View style={s.staticKpis}>
          <KpiCounter value={activeScoped.length} label={tr.notes} />
          <KpiCounter value={activeScoped.filter(n => n.pinned).length} label={tr.notesPinned} />
        </View>
      ) : null}
      {shortcutList(zs.staticPinned, pinnedNotes, 'notes-static-pinned')}
      {shortcutList(zs.staticRecent, recentNotes, 'notes-static-recent')}
      {tagChips.length > 0 ? (
        <View style={s.staticBlock}>
          <Text accessibilityRole="header" style={[s.staticHeading, { color: c.sub }]}>{zs.staticTags}</Text>
          <View style={s.staticTags}>
            {[...tagChips].sort((a, b) => b.count - a.count).slice(0, 10).map(chip => {
              const active = tagFilter !== null && tagKey(tagFilter) === tagKey(chip.tag);
              return (
                <React.Fragment key={tagKey(chip.tag)}>
                  {button(`#${chip.tag} · ${chip.count}`, () => setTagFilter(active ? null : chip.tag), `notes-static-tag-${chip.tag}`, false, active)}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  ) : undefined;

  /** Три крапки (планшет): вимкнення панелі деталей закриває відкриту нотатку (чернетку пише автозбереження). */
  const togglePanel = (panel: ZonePanel) => {
    if (panel === 'dynamic' && zone.panels.dynamic && (selected || missingId)) {
      closeEditor(); setMissingId(null); zone.setPanel('dynamic', false);
      return;
    }
    zone.togglePanel(panel);
  };
  const closeMissing = () => { setMissingId(null); zoneSelect(null); };
  const missingBlock = missingId && !selected ? (
    <ZoneEmpty
      testID="notes-missing"
      details
      icon="magnifyingglass"
      title={zs.notFound}
      caption={zs.notFoundHint}
      actionLabel={zs.close}
      onAction={closeMissing}
    />
  ) : null;

  /** Смуга після перетворення (планшет): посилання на створену задачу чи зустріч. */
  const createdBanner = isWide && created ? (
    <View testID="notes-task-created" accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[s.banner, { backgroundColor: c.card }, cardShadow]}>
      <IconSymbol name="checkmark.circle.fill" size={18} color={c.accent} />
      <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.regular }}>
        {created.kind === 'task' ? zs.taskCreated(created.title) : zs.meetingCreated(created.title)}
      </Text>
      {button(created.kind === 'task' ? zs.openTask : zs.openMeeting, () => {
        const href = linkedHref(created.kind, created.id, created.projectId);
        setCreated(null);
        navigateTo(href);
      }, 'notes-open-task')}
      <TouchableOpacity testID="notes-task-created-dismiss" accessibilityRole="button" accessibilityLabel={zs.dismiss}
        onPress={() => setCreated(null)} style={s.bannerClose}>
        <IconSymbol name="xmark" size={14} color={c.sub} />
      </TouchableOpacity>
    </View>
  ) : null;

  const columns = split ? 1 : (width ?? 0) >= 900 ? 3 : 2;
  const filtered = !!query || tagFilter !== null;
  const emptyNode = !ready
    // Стани головної зони (Layout System v2.4): скелет у формі списку…
    ? <ZoneSkeleton variant="list" rows={4} />
    : readError ? null
      // …і порожньо з однією дією: скинути пошук/тег, якщо вони звузили
      // список; інакше дія — «Створити нотатку» вгорі.
      : <ZoneEmpty
          testID="notes-empty"
          icon={archive ? 'archivebox' : 'note.text'}
          title={filtered ? tr.notesNoResults : archive ? tr.notesNoArchived : tr.noNotes}
          actionLabel={filtered ? tr.resetFilter : undefined}
          onAction={filtered ? () => { setQuery(''); setTagFilter(null); } : undefined}
        />;
  const sortLabel = sort === 'title' ? tr.notesSortTitle : sort === 'oldest' ? tr.sortOldest : tr.sortNewest;
  const addDisabled = !ready || readError || busy;

  const listZone = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { backgroundColor: c.bg }]}>
      {readErrorBlock}
      <View style={[s.panes, { paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
        <View testID="notes-list" style={s.list}>
          {createdBanner}
          {/* Omni KPI — з уже прочитаних нотаток цього зрізу (без архіву). */}
          {ready && !readError && activeScoped.length > 0 && !staticShown ? (
            <PageHeader
              style={{ paddingTop: 4, paddingBottom: 4 }}
              kpis={
                <>
                  <KpiCounter value={activeScoped.length} label={tr.notes} />
                  <KpiCounter value={activeScoped.filter(n => n.pinned).length} label={tr.notesPinned} />
                  {tagChips.length > 0 ? <KpiCounter value={tagChips.length} label={tr.notesTagsLabel} /> : null}
                </>
              }
            />
          ) : null}
          {v25 ? (
            <FilterBar
              testID="notes-filter-bar"
              label={tr.notesFilterLabel}
              overflowLabel={tr.filters}
              resetLabel={tr.reset}
              style={{ marginBottom: 8 }}
              search={<FilterSearch testID="notes-search" label={tr.notesSearch} placeholder={tr.notesSearch}
                value={query} onChangeText={setQuery} />}
              items={[
                ...(!projectId ? [{
                  id: 'scope', pinned: true, node: (
                    <Segmented<NoteScope> label={tr.notes} value={scope} onChange={value => { setScope(value); setArchive(false); }}
                      options={[
                        { value: 'all', label: tr.all, testID: 'notes-scope-all' },
                        { value: 'personal', label: tr.notesPersonal, testID: 'notes-scope-personal' },
                        { value: 'projects', label: tr.projects, testID: 'notes-scope-projects' },
                      ]} />
                  ),
                }] : []),
                {
                  id: 'archive', active: archive, node: (
                    <Chip testID="notes-archive-filter" label={tr.notesArchiveFilter} icon="archivebox"
                      selected={archive} onPress={() => setArchive(value => !value)} />
                  ),
                },
                {
                  id: 'sort', active: sort !== 'newest', node: (
                    <FilterSelect<SortMode> testID="notes-sort" label={tr.sorting} value={sort}
                      neutralValue="newest" onChange={v => setSort(v ?? 'newest')}
                      options={[
                        { value: 'newest', label: tr.sortNewest },
                        { value: 'oldest', label: tr.sortOldest },
                        { value: 'title', label: tr.notesSortTitle },
                      ]} />
                  ),
                },
                ...(tagChips.length > 0 ? [{
                  id: 'tag', active: tagFilter !== null, menuLabel: tr.notesTagsLabel, node: (
                    <FilterSelect testID="notes-tag-filter" label={tr.notesTagsLabel}
                      value={tagFilter === null ? null : tagChips.find(chip => tagKey(chip.tag) === tagKey(tagFilter))?.tag ?? tagFilter}
                      emptyOption={{ label: tr.notesTagsAll }} allLabel={tr.notesTagsAll}
                      onChange={v => setTagFilter(v)}
                      options={tagChips.map(chip => ({ value: chip.tag, label: `#${chip.tag}`, count: chip.count }))} />
                  ),
                }] : []),
                {
                  id: 'view', pinned: true, menuLabel: tr.notesViewList, node: (
                    <Segmented<NotesViewMode> label={`${tr.notesViewList} / ${tr.notesViewGrid}`} value={viewMode} onChange={changeViewMode}
                      iconOnly semantics="pressed"
                      options={[
                        { value: 'list', label: tr.notesViewList, icon: 'list.bullet', testID: 'notes-view-list' },
                        { value: 'grid', label: tr.notesViewGrid, icon: 'square.grid.2x2', testID: 'notes-view-grid' },
                      ]} />
                  ),
                },
              ]}
              onReset={() => { setSort('newest'); setTagFilter(null); setArchive(false); }}
              actions={canCreate ? button(tr.addNote, add, 'notes-add', addDisabled) : undefined}
            />
          ) : (
            <>
              <View style={s.toolbar}>
                {canCreate && button(tr.addNote, add, 'notes-add', addDisabled)}
                {button(sortLabel, () => setSort(v => v === 'newest' ? 'oldest' : v === 'oldest' ? 'title' : 'newest'), 'notes-sort')}
                <View style={{ flex: 1 }} />
                {iconButton('notes-view-list', 'list.bullet', tr.notesViewList, viewMode === 'list', () => changeViewMode('list'))}
                {iconButton('notes-view-grid', 'square.grid.2x2', tr.notesViewGrid, viewMode === 'grid', () => changeViewMode('grid'))}
              </View>
              <TextInput testID="notes-search" accessibilityLabel={tr.notesSearch} placeholder={tr.notesSearch}
                placeholderTextColor={c.sub} value={query} onChangeText={setQuery}
                style={[s.search, { color: c.text, backgroundColor: c.card }]} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                accessibilityLabel={tr.notesFilterLabel} contentContainerStyle={s.tagRow}>
                {!projectId && (['all', 'personal', 'projects'] as const).map(value => (
                  <React.Fragment key={value}>
                    {button(value === 'all' ? tr.all : value === 'personal' ? tr.notesPersonal : tr.projects,
                      () => { setScope(value); setArchive(false); }, `notes-scope-${value}`, false, scope === value && !archive)}
                  </React.Fragment>
                ))}
                {button(tr.notesArchiveFilter, () => setArchive(value => !value), 'notes-archive-filter', false, archive)}
              </ScrollView>
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
            </>
          )}
          <NotesList sections={readError ? [] : sections} mode={viewMode} columns={columns} colors={c} isDark={isDark}
            selectedId={selected?.id ?? null} locale={locale} emptyText="" emptyNode={emptyNode}
            footer={notes.length >= 10 && !selected ? <AdSlot slot="M2" /> : null}
            swipeActionsFor={swipeActionsFor}
            onOpen={note => open(note)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <>
      <ZoneLayout
        testID="notes-zones"
        main={listZone}
        dynamic={editor(true) ?? missingBlock}
        dynamicOpen={!!selected || !!missingBlock}
        onCloseDynamic={() => (missingBlock ? closeMissing() : closeEditor())}
        dynamicLabel={current ? current.title || tr.untitled : missingBlock ? zs.notFound : tr.notes}
        // «Закрити» вже є в шапці редактора.
        dynamicChrome={false}
        // Планшет: статична зона (контекст) і три крапки під списком, як у «Завданнях».
        static={staticZone}
        showStatic={zone.panels.static}
        panels={isWide ? zone.panels : undefined}
        onTogglePanel={togglePanel}
      />
      {convertSheet}
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  panes: { flex: 1, gap: 16 },
  list: { flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 8 },
  tagRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 8 },
  // Omni: кнопки-фільтри — pill; вибрана — чорна (action.primary).
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 16, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 999 },
  iconButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 999 },
  search: { minHeight: 48, paddingHorizontal: 16, borderRadius: 999, fontSize: 16, fontFamily: fontFamily.regular },
  // Статична зона планшета.
  staticRoot: { gap: 20, paddingHorizontal: 16 },
  staticTitle: { fontSize: 20, fontFamily: fontFamily.semibold },
  staticKpis: { flexDirection: 'row', gap: 16 },
  staticBlock: { gap: 4 },
  staticHeading: { fontSize: 12, fontFamily: fontFamily.medium, paddingBottom: 4 },
  staticRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: Atlas.radius.medium },
  staticTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingLeft: 16, borderRadius: Atlas.radius.large, marginTop: 4, marginBottom: 8 },
  bannerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
