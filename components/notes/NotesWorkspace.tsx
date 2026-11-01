import { Atlas } from '@/constants/atlas';
import { fontFamily, shadow } from '@/constants/theme';
import { KpiCounter, PageHeader } from '@/components/ds/PageHeader';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AdSlot } from '@/components/advertising/Advertising';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoteMarkdown } from '@/components/notes/NoteMarkdown';
import { PickerField, type PickerOption } from '@/components/shared/PickerField';
import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { SwipeRow, ZoneEmpty, ZoneLayout, ZoneSkeleton, useZoneState, zoneWidths, type SwipeAction, type ZonePanel } from '@/components/layout-zones';
import { NoteToTaskSheet, type NoteToTaskSubmit } from '@/components/notes/NoteToTaskSheet';
import { useNoteToTaskStrings } from '@/components/notes/noteToTaskStrings';
import { noteAfterConversion, noteTaskHref, noteTaskRecord } from '@/utils/noteToTask';
import { useRouter } from 'expo-router';
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
import { dsTheme, glassOf } from '@/components/shared/dsTheme';

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
 *
 * Layout System v2.4 (зони): список — ГОЛОВНА зона (завжди найширша), читалка
 * й редактор — ДИНАМІЧНА: панель праворуч з «Закрити» на iPad (коли
 * вміщається поруч зі списком), нижній аркуш ~60% → весь екран на телефоні
 * для читання. Редагування на телефоні (і на вузькому iPad) — на весь екран,
 * як і було: документ із клавіатурою в аркуші на 60% — тісно. Відкрита
 * нотатка — у параметрі `?note=<id>`. Рядки свайпаються вліво
 * («Закріпити/Відкріпити», «Видалити»; ті самі права й запис, що в читалці).
 * Стани зони: скелет під час читання, «Повторити» при збої, порожньо.
 */
export function NotesWorkspace({ projectId, isDark, createRequested, onCreateHandled }: {
  projectId?: string;
  isDark: boolean;
  /** Відкрити редактор нової нотатки, щойно сховище прочитане (`/notes?create=1`). */
  createRequested?: boolean;
  /** Запит виконано — маршрут має прибрати параметр, щоб не повторити. */
  onCreateHandled?: () => void;
}) {
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { isWide, width } = useResponsive();
  const screenWidth = useScreenWidth();
  /**
   * Читалка/редактор — панель поруч зі списком, коли вона вміщається і
   * список лишається найширшою зоною (zoneWidths — те саме правило, що в
   * ZoneLayout); інакше читання — нижній аркуш, редагування — на весь екран.
   */
  const split = !!isWide && zoneWidths({
    windowWidth: width ?? 0, screenWidth: screenWidth ?? width ?? 0, wide: !!isWide, wantStatic: false, wantDynamic: true,
  }).dynamicMode === 'panel';
  // Відкрита нотатка — у параметрі маршруту `?note=` (Layout System v2.4).
  const zone = useZoneState({ section: projectId ? 'project-notes' : 'notes', selectedParam: 'note' });
  const insets = useSafeAreaInsets();
  const tabBarInset = useTabBarInset();
  const navigation = useNavigation();
  const router = useRouter();
  const ns = useNoteToTaskStrings();
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
  const [emptyError, setEmptyError] = useState(false);
  const [body, setBody] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [pinned, setPinned] = useState(false);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedMeetingId, setLinkedMeetingId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Планшет: «Перетворити на задачу» — яку нотатку перетворюємо. */
  const [converting, setConverting] = useState<Note | null>(null);
  /** Планшет: щойно створена з нотатки задача — смуга «Відкрити задачу». */
  const [createdTask, setCreatedTask] = useState<{ id: string; title: string; projectId?: string } | null>(null);
  /** Планшет: `?note=<id>`, якого немає в сховищі — стан «не знайдено» в панелі. */
  const [missingId, setMissingId] = useState<string | null>(null);
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
  // Omni (DS v2.2): тло прозоре — під ним mesh екрана; картки нотаток і
  // редактор/читач — СУЦІЛЬНІ (surface.card + м'яка тінь, без обідка: скло
  // лишилось функціональному шару), акцент «Нотаток» — amber (ink). Вибрані
  // кнопки-фільтри — чорна pill action.primary, як вкладки Omni.
  const tk = dsTheme(isDark);
  const gl = glassOf(tk);
  const amber = gl.accent.amber;
  const cardShadow = shadow[isDark ? 'dark' : 'light'].card;
  const c = {
    bg: 'transparent',
    panel: tk.surface.card,
    panelStrong: tk.surface.card,
    text: tk.text.primary,
    sub: tk.text.secondary,
    border: gl.rim,
    accent: amber.ink,
    dim: amber.tint,
  };
  const pickerColors = { text: c.text, sub: c.sub, border: tk.border.hairline, dim: gl.surfaceSubtle, accent: c.accent, sheet: gl.sheet };

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
    setEmptyError(false);
    setTitle(note.title); setBody(note.body);
    setTagsInput(formatTagsInput(note.tags));
    setPinned(note.pinned === true);
    setLinkedTaskId(note.linkedTaskId ?? null);
    setLinkedMeetingId(note.linkedMeetingId ?? null);
    setPreview(false);
  };
  const open = (note: Note, fresh = false) => confirmLeave(() => {
    setMissingId(null);
    // Панель деталей вимкнена трьома крапками — відкриття запису вмикає її
    // назад (як useZoneState.select): інакше тап по рядку «нічого не робив» би.
    if (split && !zone.panels.dynamic) zone.setPanel('dynamic', true);
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
  // `?note=<id>`: щойно сховище прочитане — відкрити нотатку з адреси (один
  // раз); далі відкрита ЗБЕРЕЖЕНА нотатка дзеркалиться в адресу (нова — ні:
  // її ще немає в сховищі, і посилання на неї нікуди б не вело).
  const zoneSelect = zone.select;
  const noteParamConsumed = useRef(false);
  useEffect(() => {
    if (!ready || noteParamConsumed.current) return;
    noteParamConsumed.current = true;
    const target = zone.selectedId ? notes.find(n => n.id === zone.selectedId) : undefined;
    if (target && !selected) open(target);
    // Планшет: посилання на нотатку, якої вже немає, — пояснення в панелі
    // замість мовчазного нічого (Layout System: стани зони).
    else if (!target && zone.selectedId && isWide && !readError) setMissingId(zone.selectedId);
    // Лише на перше прочитання сховища.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  const mirrorId = selected && !isNew ? selected.id : null;
  useEffect(() => {
    if (!noteParamConsumed.current) return;
    zoneSelect(mirrorId);
  }, [mirrorId, zoneSelect]);

  /**
   * Свайп рядка (Layout System v2.4): закріпити/відкріпити і видалити — без
   * відкриття нотатки. Той самий запис, що й з читалки (`patchNote` /
   * `saveSyncedChanges`), ті самі права (canEditNote) і той самий замок `busy`.
   */
  const quickPatch = async (note: Note, change: { pinned?: boolean }) => {
    if (!canEditNote(note, canEditProject) || busy.current || readError || !ready) return;
    const next = patchNote(note, change, new Date().toISOString());
    busy.current = true; setSaving(true);
    try {
      const result = await saveSyncedChanges('notes', [note], [next], { checked: true });
      if (mounted.current && result) setNotes(normalizeNotes(result));
      if (mounted.current && selected?.id === note.id && mode === 'read') setSelected(next);
    } catch {
      Alert.alert(tr.error, tr.notesSaveError);
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  };
  const quickRemove = (note: Note) => {
    if (!canEditNote(note, canEditProject) || busy.current || readError) return;
    Alert.alert(tr.delete, tr.notesDeleteConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: async () => {
        if (busy.current) return;
        busy.current = true; setSaving(true);
        try {
          const result = await saveSyncedChanges('notes', [note], [], { checked: true });
          if (mounted.current) {
            if (result) setNotes(normalizeNotes(result));
            if (selected?.id === note.id) closeEditor();
          }
        } catch { Alert.alert(tr.error, tr.notesSaveError); }
        finally { busy.current = false; if (mounted.current) setSaving(false); }
      } },
    ]);
  };
  const swipeActionsFor = (note: Note): SwipeAction[] => {
    // Відкрита в редакторі нотатка не свайпається: чернетка важливіша.
    if (!ready || readError || !canEditNote(note, canEditProject) || (selected?.id === note.id && mode === 'edit')) return [];
    return [
      { key: 'pin', label: note.pinned ? tr.notesUnpin : tr.notesPin, icon: 'star.fill', onPress: () => { void quickPatch(note, { pinned: !note.pinned }); }, testID: `note-swipe-pin-${note.id}` },
      { key: 'delete', label: tr.delete, icon: 'trash.fill', tone: 'danger', onPress: () => quickRemove(note), testID: `note-swipe-delete-${note.id}` },
    ];
  };

  const save = async () => {
    if (!selected || !canEdit || busy.current || readError || !ready) return;
    if (!title.trim() && !body.trim()) { setEmptyError(true); Alert.alert(tr.error, tr.notesEmptyError); return; }
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

  /** Проєкти, у які можна створити задачу з нотатки (право правки). */
  const convertProjects = useMemo(
    () => Object.entries(projects)
      .filter(([id]) => canEditProjectItem(id, roles))
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, locale)),
    [projects, roles, locale],
  );
  /**
   * «Перетворити на задачу» (планшет; дзеркало `convertNote` вебу): задача —
   * тим самим шляхом даних, що й задача з рядка (`saveSyncedChanges('tasks')`).
   * Далі нотатка або видаляється (якщо людина так обрала), або отримує
   * зв'язок із задачею, коли зв'язку ще немає. Помилка запису задачі —
   * кидається в аркуш (він лишається відкритим і показує її).
   */
  const convertNote = async ({ fields, deleteNote }: NoteToTaskSubmit) => {
    const note = converting;
    // Аркуш чекає або закриття, або помилки — тихий return лишив би його «зайнятим».
    if (!note || busy.current) throw new Error(ns.createError);
    const now = new Date().toISOString();
    const task = noteTaskRecord(fields, { id: uuidV4(), now, userId });
    if (!task) throw new Error(ns.createError);
    busy.current = true; setSaving(true);
    try {
      try {
        await saveSyncedChanges('tasks', [], [task], { checked: true });
      } catch {
        throw new Error(ns.createError);
      }
      // Задача вже є — невдача з нотаткою її не скасовує, лише повідомляє.
      const after = noteAfterConversion(note, task.id, deleteNote, now);
      try {
        if (after.action === 'delete') {
          const result = await saveSyncedChanges('notes', [note], [], { checked: true });
          if (mounted.current) {
            if (result) setNotes(normalizeNotes(result));
            if (selected?.id === note.id) closeEditor();
          }
        } else if (after.action === 'link') {
          const result = await saveSyncedChanges('notes', [note], [after.next], { checked: true });
          if (mounted.current) {
            if (result) setNotes(normalizeNotes(result));
            if (selected?.id === note.id && mode === 'read') setSelected(after.next);
          }
        }
      } catch {
        Alert.alert(tr.error, ns.noteUpdateError);
      }
      if (mounted.current) {
        setConverting(null);
        setCreatedTask({ id: task.id, title: task.title, ...(task.projectId ? { projectId: task.projectId } : {}) });
      }
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
      style={[s.button, active || id === 'notes-add'
        ? { backgroundColor: tk.action.primary }
        : { backgroundColor: tk.surface.card }, { opacity: disabled ? 0.45 : 1 }]}>
      {id === 'notes-add' ? <IconSymbol name="plus" size={14} color={tk.text.onAction} /> : null}
      <Text style={{ color: active || id === 'notes-add' ? tk.text.onAction : tk.text.primary, fontFamily: fontFamily.semibold, fontSize: 13 }}>{label}</Text>
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

  /**
   * Редактор у динамічній зоні (панель iPad) чи на весь екран (телефон).
   * У зоні прокрутку дає сама зона, тож без вкладених ScrollView з flex:1
   * (у прокрутці вони схлопуються в нуль) — текст росте разом із вмістом.
   */
  const editorInZone = split;
  const reader = reading && current ? (
    // Читалка завжди в динамічній зоні: суцільна картка й прокрутка — від зони.
    <View testID="notes-reader" style={s.zoneDetail}>
      <View style={s.toolbar}>
        {button(tr.close, () => confirmLeave(closeEditor), 'notes-close', saving)}
        {canEdit && button(tr.edit, startEdit, 'notes-edit', saving || readError)}
        {canEdit && button(current.pinned ? tr.notesUnpin : tr.notesPin, () => { void patchRead({ pinned: !current.pinned }); },
          'notes-pin', saving || readError, current.pinned === true)}
        {canEdit && button(tr.delete, remove, 'notes-delete', saving || readError)}
        {/* Лише планшет: на телефоні панель інструментів читалки — як була. */}
        {isWide && canEdit && button(ns.convert, () => setConverting(current), 'notes-convert', saving || readError)}
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
      <View style={{ paddingVertical: 10 }}>
        <NoteMarkdown body={current.body} colors={{ text: c.text, sub: c.sub, border: tk.border.hairline, accent: c.accent, panel: c.panelStrong }}
          emptyLabel={tr.notesEmptyBody} createTaskLabel={tr.notesCreateTask}
          onToggle={canEdit && !saving && !readError ? toggleReadLine : undefined}
          onCreateTask={canEdit && !saving ? line => { void createTaskFromLine(line); } : undefined} />
      </View>
    </View>
  ) : null;

  const editor = selected && !reading ? (
    <View testID="notes-editor" style={editorInZone ? s.zoneDetail : [s.editor, { backgroundColor: c.panelStrong }, cardShadow]}>
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
        style={[s.title, { color: c.text, borderColor: emptyError && !title.trim() && !body.trim() ? '#EF4444' : tk.border.hairline }]} />
      <TextInput testID="notes-tags" accessibilityLabel={tr.notesTagsLabel} placeholder={tr.notesTagsPlaceholder}
        placeholderTextColor={c.sub} value={tagsInput} onChangeText={setTagsInput} editable={canEdit && !saving}
        autoCapitalize="none" style={[s.tagsInput, { color: c.text, borderColor: tk.border.hairline }]} />
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
        <ScrollView style={editorInZone ? null : s.previewPane} scrollEnabled={!editorInZone} contentContainerStyle={{ paddingVertical: 10 }} keyboardShouldPersistTaps="handled">
          <NoteMarkdown body={body} colors={{ text: c.text, sub: c.sub, border: tk.border.hairline, accent: c.accent, panel: c.panelStrong }}
            emptyLabel={tr.notesEmptyBody} createTaskLabel={tr.notesCreateTask}
            onToggle={canEdit && !saving ? line => setBody(current => toggleChecklistAt(current, line)) : undefined}
            onCreateTask={canEdit && !saving && !isNew ? line => { void createTaskFromLine(line); } : undefined} />
        </ScrollView>
      ) : (
        <TextInput testID="notes-body" accessibilityLabel={tr.noteBodyPlaceholder} placeholder={tr.noteBodyPlaceholder}
          placeholderTextColor={c.sub} value={body} onChangeText={setBody} editable={canEdit && !saving}
          multiline textAlignVertical="top" scrollEnabled={!editorInZone} style={[s.body, editorInZone ? s.bodyInZone : null, { color: c.text }, emptyError && !title.trim() && !body.trim() ? {borderWidth:1,borderColor:'#EF4444'} : null]} />
      )}
      <Text style={[s.hint, { color: c.sub }]}>{tr.notesMarkdownHint}</Text>
    </View>
  ) : null;

  const readErrorBlock = readError ? (
    // Помилка всередині зони: зрозумілий текст + «Повторити» (Layout System v2.4).
    <View accessibilityRole="alert" style={{ padding: 12 }}>
      <Text style={{ color: c.text }}>{tr.notesReadError}</Text>
      {button(tr.notesRetry, () => { void reload(true); }, 'notes-retry')}
    </View>
  ) : null;

  /**
   * Статична зона (планшет, ≥ 1280pt вікна): контекст, незалежний від вибору —
   * дата, KPI, закріплені, нещодавні, теги (як статична зона нотаток вебу).
   * Поки вона на екрані, KPI не дублюються над списком.
   */
  const staticShown = isWide && zoneWidths({
    windowWidth: width ?? 0, screenWidth: screenWidth ?? width ?? 0, wide: true,
    wantStatic: zone.panels.static, wantDynamic: !!selected || !!missingId,
  }).showStatic;
  const pinnedNotes = useMemo(() => scoped.filter(n => n.pinned).slice(0, 5), [scoped]);
  const recentNotes = useMemo(
    () => [...scoped].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5),
    [scoped],
  );
  const shortcutList = (title: string, items: Note[], id: string) => items.length ? (
    <View style={s.staticBlock}>
      <Text accessibilityRole="header" style={[s.staticHeading, { color: c.sub }]}>{title}</Text>
      {items.map(note => (
        <TouchableOpacity key={note.id} testID={`${id}-${note.id}`} accessibilityRole="button"
          accessibilityLabel={note.title || tr.untitled} accessibilityState={{ selected: selected?.id === note.id }}
          onPress={() => open(note)}
          style={[s.staticRow, selected?.id === note.id ? { backgroundColor: gl.surfaceSubtle } : null]}>
          <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: selected?.id === note.id ? fontFamily.semibold : fontFamily.medium }}>
            {note.title || tr.untitled}
          </Text>
          <Text style={{ color: c.sub, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {new Date(note.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  ) : null;
  const staticZone = isWide && ready && !readError ? (
    <View testID="notes-static" style={s.staticRoot}>
      <View>
        <Text accessibilityRole="header" style={[s.staticTitle, { color: c.text }]}>{ns.staticToday}</Text>
        <Text style={{ color: c.sub, fontSize: 13 }}>
          {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
      </View>
      {scoped.length > 0 ? (
        <View style={s.staticKpis}>
          <KpiCounter value={scoped.length} label={tr.notes} />
          <KpiCounter value={scoped.filter(n => n.pinned).length} label={tr.notesPinned} />
        </View>
      ) : null}
      {shortcutList(ns.staticPinned, pinnedNotes, 'notes-static-pinned')}
      {shortcutList(ns.staticRecent, recentNotes, 'notes-static-recent')}
      {tagChips.length > 0 ? (
        <View style={s.staticBlock}>
          <Text accessibilityRole="header" style={[s.staticHeading, { color: c.sub }]}>{ns.staticTags}</Text>
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

  /** Три крапки (планшет): вимкнення панелі деталей закриває відкриту нотатку. */
  const togglePanel = (panel: ZonePanel) => {
    if (panel === 'dynamic' && zone.panels.dynamic && (selected || missingId)) {
      confirmLeave(() => { closeEditor(); setMissingId(null); zone.setPanel('dynamic', false); });
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
      title={ns.notFound}
      caption={ns.notFoundHint}
      actionLabel={ns.close}
      onAction={closeMissing}
    />
  ) : null;

  /** Смуга після «Перетворити на задачу» (планшет): посилання на задачу. */
  const createdBanner = isWide && createdTask ? (
    <View testID="notes-task-created" accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[s.banner, { backgroundColor: tk.surface.card }, cardShadow]}>
      <IconSymbol name="checkmark.circle.fill" size={18} color={tk.status.success} />
      <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 14 }}>{ns.created(createdTask.title)}</Text>
      {button(ns.openTask, () => {
        const href = noteTaskHref(createdTask);
        setCreatedTask(null);
        router.push(href as never);
      }, 'notes-open-task')}
      <TouchableOpacity testID="notes-task-created-dismiss" accessibilityRole="button" accessibilityLabel={ns.dismiss}
        onPress={() => setCreatedTask(null)} style={s.bannerClose}>
        <IconSymbol name="xmark" size={14} color={c.sub} />
      </TouchableOpacity>
    </View>
  ) : null;

  // Телефон / вузький iPad: редагування — на весь екран (список ховається),
  // як і раніше; чернетка живе в стані й переживає поворот екрана.
  if (selected && !reading && !split) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[s.root, { backgroundColor: c.bg }]}>
        {readErrorBlock}
        <View style={[s.panes, { paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
          {editor}
        </View>
      </KeyboardAvoidingView>
    );
  }

  const listZone = (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.root, { backgroundColor: c.bg }]}>
      {readErrorBlock}
      <View style={[s.panes, { paddingBottom: Math.max(insets.bottom, projectId ? tabBarInset : 0, 12) }]}>
        <View testID="notes-list" style={s.list}>
          {/* Omni KPI — з уже прочитаних нотаток цього зрізу. */}
          {createdBanner}
          {ready && !readError && scoped.length > 0 && !staticShown ? (
            <PageHeader
              style={{ paddingTop: 4, paddingBottom: 4 }}
              kpis={
                <>
                  <KpiCounter value={scoped.length} label={tr.notes} />
                  <KpiCounter value={scoped.filter(n => n.pinned).length} label={tr.notesPinned} />
                  {tagChips.length > 0 ? <KpiCounter value={tagChips.length} label={tr.notesTagsLabel} /> : null}
                </>
              }
            />
          ) : null}
          <View style={s.toolbar}>
            {canCreate && button(tr.addNote, add, 'notes-add', !ready || readError || saving)}
            {button(sort === 'title' ? tr.notesSortTitle : sort === 'oldest' ? tr.sortOldest : tr.sortNewest, () => setSort(v => v === 'newest' ? 'oldest' : v === 'oldest' ? 'title' : 'newest'), 'notes-sort')}
          </View>
          <TextInput testID="notes-search" accessibilityLabel={tr.notesSearch} placeholder={tr.notesSearch}
            placeholderTextColor={c.sub} value={query} onChangeText={setQuery}
            style={[s.search, { color: c.text, backgroundColor: tk.surface.card }]} />
          {!projectId && <View style={s.toolbar}>{(['all', 'personal', 'projects'] as const).map(value => (
            <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: scope === value }}
              testID={`notes-scope-${value}`} onPress={() => setScope(value)} style={[s.button, scope === value
                ? { backgroundColor: tk.action.primary }
                : { backgroundColor: tk.surface.card }]}>
              <Text style={{ color: scope === value ? tk.text.onAction : tk.text.secondary, fontFamily: fontFamily.semibold, fontSize: 13 }}>{value === 'all' ? tr.all : value === 'personal' ? tr.notesPersonal : tr.projects}</Text>
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
            ListFooterComponent={notes.length >= 10 && !selected ? <AdSlot slot="M2" /> : null}
            ListEmptyComponent={!ready
              // Стани головної зони (Layout System v2.4): скелет у формі списку…
              ? <ZoneSkeleton variant="list" rows={4} />
              : readError ? null
                // …і порожньо з однією дією: скинути пошук/тег, якщо вони
                // звузили список; інакше дія — «Створити нотатку» вгорі.
                : <ZoneEmpty
                    testID="notes-empty"
                    icon="note.text"
                    title={query || tagFilter ? tr.notesNoResults : tr.noNotes}
                    actionLabel={query || tagFilter ? tr.resetFilter : undefined}
                    onAction={query || tagFilter ? () => { setQuery(''); setTagFilter(null); } : undefined}
                  />}
            renderSectionHeader={({ section }) => <Text style={[s.section, { color: c.sub }]}>{section.title} · {section.data.length}</Text>}
            renderItem={({ item }) => {
              const checklist = checklistProgress(item.body);
              const chips = noteTags(item);
              const swipe = swipeActionsFor(item);
              return <SwipeRow actions={swipe} radius={Atlas.radius.large}>{a11y => <TouchableOpacity accessibilityRole="button" testID={`note-${item.id}`}
                accessibilityActions={swipe.length ? a11y.accessibilityActions : undefined}
                onAccessibilityAction={swipe.length ? a11y.onAccessibilityAction : undefined}
                accessibilityLabel={`${item.pinned ? `${tr.notesPinned}, ` : ''}${item.title || tr.untitled}`}
                accessibilityState={{ selected: selected?.id === item.id }} onPress={() => open(item)}
                style={[s.card, { backgroundColor: c.panel, borderColor: selected?.id === item.id ? tk.action.primary : 'transparent' }, cardShadow]}>
                <View style={s.cardHead}>
                  {item.pinned && <View testID={`note-pin-${item.id}`}><IconSymbol name="pin.fill" size={16} color={c.sub} /></View>}
                  <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontFamily: fontFamily.semibold, fontSize: 16 }}>{item.title || tr.untitled}</Text>
                </View>
                <Text numberOfLines={2} style={{ color: c.sub, marginTop: 6 }}>{notePreview(item)}</Text>
                {chips.length > 0 && <Text numberOfLines={1} style={{ color: c.accent, fontSize: 12, marginTop: 6 }}>{chips.map(tag => `#${tag}`).join(' ')}</Text>}
                <View style={s.cardFoot}>
                  <Text style={{ color: c.sub, fontSize: 12 }}>{new Date(item.updatedAt).toLocaleDateString(locale)}</Text>
                  {checklist.total > 0 && <Text testID={`note-checklist-${item.id}`} style={{ color: c.sub, fontSize: 12 }}>
                    {tr.notesChecklist} {checklist.done}/{checklist.total}
                  </Text>}
                </View>
              </TouchableOpacity>}</SwipeRow>;
            }} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <ZoneLayout
      testID="notes-zones"
      main={listZone}
      dynamic={reader ?? editor ?? missingBlock}
      dynamicOpen={!!selected || !!missingBlock}
      onCloseDynamic={() => (missingBlock ? closeMissing() : confirmLeave(closeEditor))}
      dynamicLabel={current ? current.title || tr.untitled : missingBlock ? ns.notFound : tr.notes}
      // «Закрити» вже є в панелі інструментів читалки/редактора.
      dynamicChrome={false}
      // Планшет: статична зона (контекст) і три крапки під списком, як у «Завданнях».
      static={staticZone}
      showStatic={zone.panels.static}
      panels={isWide ? zone.panels : undefined}
      onTogglePanel={togglePanel}
      overlay={isWide ? (
        <NoteToTaskSheet
          note={converting}
          projects={convertProjects}
          onCancel={() => { if (!saving) setConverting(null); }}
          onSubmit={convertNote}
        />
      ) : undefined}
    />
  );
}
const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 }, panes: { flex: 1, gap: 16 }, list: { flex: 1 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
  tagRow: { flexDirection: 'row', gap: 8, paddingVertical: 4, paddingRight: 8 },
  // Omni: кнопки-фільтри — pill; вибрана — чорна (action.primary).
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 16, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', borderRadius: 999 },
  search: { minHeight: 48, paddingHorizontal: 16, borderRadius: 999, fontSize: 16 },
  section: { fontFamily: fontFamily.semibold, paddingVertical: 12 }, card: { borderWidth: 1.5, borderRadius: Atlas.radius.large, padding: 16, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 },
  editor: { flex: 1, minWidth: 0, padding: 20, borderRadius: Atlas.radius.large },
  // У динамічній зоні картку й поля дає сама зона (панель / нижній аркуш).
  zoneDetail: { minWidth: 0, paddingTop: 4 },
  context: { fontSize: 13, paddingVertical: 8 },
  readTitle: { fontSize: 24, fontFamily: fontFamily.semibold }, title: { fontSize: 24, fontFamily: fontFamily.semibold, minHeight: 52, borderBottomWidth: 1 },
  tagsInput: { minHeight: 44, fontSize: 15, borderBottomWidth: 1, paddingVertical: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 10 },
  link: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  previewPane: { flex: 1, paddingTop: 8 },
  body: { flex: 1, fontSize: 17, lineHeight: 26, paddingTop: 16 },
  bodyInZone: { flex: 0, minHeight: 320 },
  hint: { fontSize: 12, paddingTop: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  // Статична зона планшета.
  staticRoot: { gap: 20, paddingHorizontal: 16 },
  staticTitle: { fontSize: 20, fontFamily: fontFamily.semibold },
  staticKpis: { flexDirection: 'row', gap: 16 },
  staticBlock: { gap: 4 },
  staticHeading: { fontSize: 12, fontFamily: fontFamily.medium, paddingBottom: 4 },
  staticRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: Atlas.radius.medium },
  staticTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingLeft: 16, borderRadius: Atlas.radius.large, marginTop: 4, marginBottom: 8 },
  bannerClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
