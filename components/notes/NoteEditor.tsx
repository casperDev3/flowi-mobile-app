/**
 * components/notes/NoteEditor.tsx — редактор нотатки в ОДНОМУ режимі.
 *
 * Немає «Редагувати» / «Зберегти»: назва — завжди поле, текст показується
 * відформатованим (живі чек-бокси), а тап по рядку відкриває поле вводу саме
 * на цьому рядку. Усе зберігається само: через ~600 мс після останньої правки,
 * при втраті фокусу і при виході з нотатки (розмонтування). Тому й питання
 * «відкинути незбережене?» більше немає.
 *
 * ЗБЕРЕЖЕННЯ ЯК РІЗНИЦЯ. `saveSyncedChanges` пише в сховище лише ті поля, що
 * змінились між «було» і «стало». «Було» — останній ЗБЕРЕЖЕНИЙ нами запис
 * (`saved`), а не свіжий зі сховища: так правка назви тут не затирає текст,
 * який щойно приїхав синком з іншого пристрою.
 *
 * Негайні дії (закріпити, архів, звʼязки, вкладення) спершу дописують
 * чернетку, а потім змінюють СВІЖУ копію зі сховища — `commit`.
 *
 * Права: без права правки (глядач проєкту) — лише читання, жодних полів.
 */
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Alert, Keyboard, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
  type NativeSyntheticEvent, type TextInputSelectionChangeEventData,
} from 'react-native';

import { NoteMarkdown } from '@/components/notes/NoteMarkdown';
import { PickerField, type PickerOption } from '@/components/shared/PickerField';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { fontFamily, shadow } from '@/constants/theme';
import { useI18n } from '@/store/i18n';
import { saveSyncedChanges } from '@/store/synced-storage';
import {
  formatTagsInput,
  isNoteArchived,
  isNoteDraftDirty,
  lineIndexAt,
  linkNote,
  noteTags,
  noteTaskDraft,
  parseTagsInput,
  patchNote,
  setNoteArchived,
  toggleChecklistAt,
  toggleLineFormat,
  wrapSelection,
  writeNote,
  type Note,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

import { deleteNoteRecord, linkedHref, navigateTo, persistNote, readNoteById } from './noteActions';
import { NoteAttachmentsSection, type NoteAttachmentsHandle } from './NoteAttachments';
import { NOTE_TOOLBAR_ID, NoteFormatAccessory, NoteFormatToolbar, type NoteToolbarAction } from './NoteFormatToolbar';
import { NoteMoreSheet, type NoteTargetOption } from './NoteMoreSheet';
import { markdownColorsFor, pickerColorsFor, type NotesPalette } from './notesTheme';

export const NOTE_AUTOSAVE_MS = 600;

/** Варіант звʼязку: задача чи зустріч, з проєктом — щоб відкрити в правильному місці. */
export interface NoteLinkOption extends PickerOption {
  projectId?: string;
}

/**
 * Чернетка й останній збережений запис, що живуть ПОЗА редактором (у
 * робочому просторі). Поворот iPad переносить редактор між повноекранним
 * режимом і панеллю зон — це нове монтування; без спільної сесії нова копія
 * почала б з порожньої чернетки й не знала б, що нотатку вже записано.
 */
export interface NoteEditorSession {
  saved: { current: Note | null };
  draft: { current: { title: string; body: string; tags: string } };
  /** Поле тексту було відкрите — нова копія відкриває його теж. */
  bodyOpen: { current: boolean };
}

export function createNoteEditorSession(note: Note, isNew: boolean): NoteEditorSession {
  return {
    saved: { current: isNew ? null : note },
    draft: { current: { title: note.title, body: note.body, tags: formatTagsInput(note.tags) } },
    bodyOpen: { current: false },
  };
}

export interface NoteEditorHandle {
  /** Дописати чернетку на диск зараз. null — нотатки ще немає (порожня нова). */
  flush: () => Promise<Note | null>;
}

export interface NoteEditorProps {
  note: Note;
  isNew: boolean;
  /** Свіжа копія зі сховища (синк міг її оновити), null — ще не збережена. */
  live: Note | null;
  canEdit: boolean;
  colors: NotesPalette;
  isDark: boolean;
  /** Телефон: кнопка «Назад» до списку. Широке вікно: «Закрити». */
  compact: boolean;
  projectLabel: string;
  tasks: readonly NoteLinkOption[];
  meetings: readonly NoteLinkOption[];
  moveTargets: readonly NoteTargetOption[];
  userId: string | null;
  onClose: () => void;
  onSaved: (note: Note, all: Note[] | null) => void;
  onDeleted: (all: Note[] | null) => void;
  /** Перетворення: нотатка вже збережена, лист відкриває екран. */
  onConvert: (mode: 'task' | 'meeting', note: Note) => void;
  onMove: (note: Note, projectId: string | null) => void;
  /** Спільна сесія (див. NoteEditorSession); без неї — власна. */
  session?: NoteEditorSession;
  /**
   * У динамічній зоні (панель iPad): картку й прокрутку дає зона, тож без
   * власної рамки й вкладеного ScrollView з flex:1 (у прокрутці він схлопується).
   */
  embedded?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type Selection = { start: number; end: number };

/** Позиція кінця рядка `line` у тексті (-1 — кінець тексту). */
function lineEndOffset(body: string, line: number): number {
  if (line < 0) return body.length;
  const lines = body.split('\n');
  let offset = 0;
  for (let index = 0; index < lines.length && index <= line; index += 1) {
    offset += lines[index].length + (index < line ? 1 : 0);
  }
  return Math.min(offset, body.length);
}

function lineStartOffset(body: string, line: number): number {
  const lines = body.split('\n');
  let offset = 0;
  for (let index = 0; index < line && index < lines.length; index += 1) offset += lines[index].length + 1;
  return offset;
}

const LIST_CONTINUE = /^(\s*)([-*] \[[ xX]\] |[-*] |(\d+)([.)]) )(.*)$/;

/**
 * Enter у пункті списку продовжує список (`- [ ] ` / `- ` / `2. `); Enter у
 * ПОРОЖНЬОМУ пункті знімає маркер — так список і закінчують.
 */
export function continueListOnEnter(prev: string, next: string, cursor: number): { text: string; cursor: number } | null {
  if (next.length !== prev.length + 1 || next[cursor] !== '\n') return null;
  if (next.slice(0, cursor) !== prev.slice(0, cursor)) return null;
  const lineStart = next.lastIndexOf('\n', cursor - 1) + 1;
  const line = next.slice(lineStart, cursor);
  const match = LIST_CONTINUE.exec(line);
  if (!match) return null;
  const [, indent, marker, number, punct, rest] = match;
  if (!rest.trim()) {
    // Порожній пункт: прибрати маркер і сам перенос.
    const text = next.slice(0, lineStart) + next.slice(cursor + 1);
    return { text, cursor: lineStart };
  }
  const prefix = marker.startsWith('- [') || marker.startsWith('* [')
    ? `${indent}- [ ] `
    : number ? `${indent}${Number(number) + 1}${punct} ` : `${indent}${marker}`;
  const at = cursor + 1;
  return { text: next.slice(0, at) + prefix + next.slice(at), cursor: at + prefix.length };
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(props, ref) {
  const {
    note, isNew, live, canEdit, colors: c, isDark, compact, projectLabel, tasks, meetings, moveTargets, userId,
    onClose, onSaved, onDeleted, onConvert, onMove, session, embedded = false,
  } = props;
  const { tr } = useI18n();
  const ownSaved = useRef<Note | null>(isNew ? null : (live ?? note));
  const ownDraft = useRef({ title: note.title, body: note.body, tags: formatTagsInput(note.tags) });
  const saved = session?.saved ?? ownSaved;
  const draft = session?.draft ?? ownDraft;
  const [title, setTitle] = useState(draft.current.title);
  const [body, setBody] = useState(draft.current.body);
  const [tagsInput, setTagsInput] = useState(draft.current.tags);
  const [bodyEditing, setBodyEditing] = useState(session?.bodyOpen.current ?? false);
  const [focused, setFocused] = useState<'title' | 'body' | 'tags' | null>(null);
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [details, setDetails] = useState(false);
  const [more, setMore] = useState(false);
  const [shown, setShown] = useState<Note>(live ?? saved.current ?? note);

  const selection = useRef<Selection>({ start: draft.current.body.length, end: draft.current.body.length });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);
  const bodyInput = useRef<TextInput>(null);
  const titleInput = useRef<TextInput>(null);
  const attachments = useRef<NoteAttachmentsHandle>(null);
  const callbacks = useRef({ onSaved, onDeleted });
  callbacks.current = { onSaved, onDeleted };

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // saved/draft — стабільні на весь час монтування (власні або сесії), тож у залежностях нижче вони нічого не перезапускають.
  const dirtyAgainst = useCallback((base: Note) => isNoteDraftDirty(base, {
    title: draft.current.title,
    body: draft.current.body,
    tags: parseTagsInput(draft.current.tags),
    pinned: base.pinned === true,
    linkedTaskId: base.linkedTaskId ?? null,
    linkedMeetingId: base.linkedMeetingId ?? null,
  }), [draft]);

  /** Один запис за раз: наступний чекає попередній (порядок правок зберігається). */
  const enqueue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const run = chain.current.then(job, job);
    chain.current = run.catch(() => undefined);
    return run;
  }, []);

  const flushNow = useCallback((): Promise<Note | null> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!canEdit) return Promise.resolve(saved.current);
    return enqueue(async () => {
      const base = saved.current;
      const { title: t, body: b, tags } = draft.current;
      if (!base && !t.trim() && !b.trim()) return null;
      if (base && !dirtyAgainst(base)) return base;
      const next = writeNote(base ?? note, { title: t, body: b, tags: parseTagsInput(tags), now: new Date().toISOString() });
      if (mounted.current) setStatus('saving');
      try {
        const all = await persistNote(base, next);
        saved.current = next;
        if (mounted.current) { setStatus('saved'); setShown(next); }
        callbacks.current.onSaved(next, all);
        return next;
      } catch (error) {
        if (__DEV__) console.warn('[notes] autosave failed', error);
        if (mounted.current) setStatus('error');
        throw error;
      }
    });
  }, [canEdit, enqueue, note, dirtyAgainst, draft, saved]);

  const flush = useCallback(() => flushNow().catch(() => saved.current), [flushNow, saved]);
  useImperativeHandle(ref, () => ({ flush }), [flush]);

  const schedule = useCallback(() => {
    if (!canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; void flush(); }, NOTE_AUTOSAVE_MS);
  }, [canEdit, flush]);

  // Вихід з нотатки (інша нотатка, назад, закриття екрана) — дописати чернетку.
  useEffect(() => () => { void flush(); }, [flush]);

  // Синк оновив нотатку, а тут нічого не правлять — показати свіже.
  useEffect(() => {
    if (!live) return;
    const base = saved.current;
    if (!base) return;
    if (live === base || (live.updatedAt === base.updatedAt && live.body === base.body && live.title === base.title)) {
      setShown(live);
      return;
    }
    if (timer.current || dirtyAgainst(base)) { setShown(live); return; }
    saved.current = live;
    draft.current = { title: live.title, body: live.body, tags: formatTagsInput(live.tags) };
    setTitle(live.title); setBody(live.body); setTagsInput(formatTagsInput(live.tags)); setShown(live);
  }, [live, dirtyAgainst, draft, saved]);

  const changeTitle = (value: string) => { draft.current.title = value; setTitle(value); schedule(); };
  const changeTags = (value: string) => { draft.current.tags = value; setTagsInput(value); schedule(); };
  const setBodyText = (value: string, cursor?: number) => {
    draft.current.body = value; setBody(value);
    if (cursor !== undefined) {
      selection.current = { start: cursor, end: cursor };
      setForcedSelection({ start: cursor, end: cursor });
    }
    schedule();
  };
  const changeBody = (value: string) => {
    const continued = continueListOnEnter(draft.current.body, value, selection.current.start);
    if (continued) setBodyText(continued.text, continued.cursor);
    else setBodyText(value);
  };
  const onSelection = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selection.current = event.nativeEvent.selection;
    if (forcedSelection) setForcedSelection(undefined);
  };

  /** Негайна зміна запису: спершу чернетка, потім свіжа копія зі сховища. */
  const commit = useCallback(async (transform: (base: Note) => Note): Promise<Note | null> => {
    if (!canEdit) return null;
    const current = await flush();
    if (!current) return null;
    return enqueue(async () => {
      const base = (await readNoteById(current.id)) ?? current;
      const next = transform(base);
      try {
        const all = await persistNote(base, next);
        saved.current = next;
        if (mounted.current) { setShown(next); setStatus('saved'); }
        callbacks.current.onSaved(next, all);
        return next;
      } catch {
        if (mounted.current) setStatus('error');
        Alert.alert(tr.error, tr.notesSaveError);
        return null;
      }
    });
  }, [canEdit, enqueue, flush, tr, saved]);

  // ── Тіло: показ ↔ поле вводу ──────────────────────────────────────────────
  const startBodyEdit = (line: number) => {
    if (!canEdit) return;
    const cursor = lineEndOffset(draft.current.body, line);
    selection.current = { start: cursor, end: cursor };
    setForcedSelection({ start: cursor, end: cursor });
    setBodyEditing(true);
  };
  useEffect(() => {
    if (bodyEditing) {
      const id = setTimeout(() => bodyInput.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [bodyEditing]);
  const toggleCheck = (line: number) => {
    const next = toggleChecklistAt(draft.current.body, line);
    if (next === draft.current.body) return;
    draft.current.body = next; setBody(next);
    void flush();
  };

  // ── Панель форматування ──────────────────────────────────────────────────
  const ensureBodyEditing = () => {
    if (!bodyEditing) {
      const end = draft.current.body.length;
      selection.current = { start: end, end };
      setBodyEditing(true);
    }
  };
  const convert = async (mode: 'task' | 'meeting') => {
    Keyboard.dismiss();
    const current = await flush();
    if (current) onConvert(mode, current);
  };
  const onToolbar = (action: NoteToolbarAction) => {
    const text = draft.current.body;
    const { start, end } = selection.current;
    switch (action) {
      case 'todo': case 'bullet': case 'heading': {
        ensureBodyEditing();
        const line = lineIndexAt(text, start);
        const lineStart = lineStartOffset(text, line);
        const before = (text.split('\n')[line] ?? '').length;
        const next = toggleLineFormat(text, line, action);
        const after = (next.split('\n')[line] ?? '').length;
        const cursor = Math.min(lineStart + after, Math.max(lineStart, start + (after - before)));
        setBodyText(next, cursor);
        return;
      }
      case 'bold': {
        ensureBodyEditing();
        const wrapped = wrapSelection(text, start, end);
        draft.current.body = wrapped.text; setBody(wrapped.text);
        selection.current = { start: wrapped.start, end: wrapped.end };
        setForcedSelection({ start: wrapped.start, end: wrapped.end });
        schedule();
        return;
      }
      case 'tag': {
        ensureBodyEditing();
        const at = Math.min(start, text.length);
        const prefix = at > 0 && !/\s/.test(text[at - 1]) ? ' #' : '#';
        setBodyText(text.slice(0, at) + prefix + text.slice(end), at + prefix.length);
        return;
      }
      case 'attach':
        Keyboard.dismiss();
        attachments.current?.openPicker();
        return;
      case 'task': void convert('task'); return;
      case 'meeting': void convert('meeting'); return;
      case 'dismiss':
        Keyboard.dismiss(); bodyInput.current?.blur(); titleInput.current?.blur();
        return;
    }
  };

  // ── Рядок → задача (як і раніше: нотатка не змінюється) ───────────────────
  const createTaskFromLine = async (line: number) => {
    const source = draft.current.body;
    const draftTask = noteTaskDraft(
      { projectId: shown.projectId },
      source.split('\n')[line] ?? '',
      { id: uuidV4(), now: new Date().toISOString() },
    );
    if (!draftTask) return;
    try {
      const owned = draftTask.projectId && userId ? { ...draftTask, createdBy: userId } : draftTask;
      await saveSyncedChanges('tasks', [], [owned], { checked: true });
      Alert.alert(tr.notesTaskCreated, draftTask.title);
    } catch {
      Alert.alert(tr.error, tr.notesTaskCreateError);
    }
  };

  const remove = () => {
    Alert.alert(tr.delete, tr.notesDeleteConfirm, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: async () => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const target = saved.current;
        if (!target) { onClose(); return; }
        try {
          const all = await enqueue(async () => deleteNoteRecord((await readNoteById(target.id)) ?? target));
          saved.current = null;
          // Чернетку більше не пишемо: нотатку видалено.
          draft.current = { title: '', body: '', tags: '' };
          callbacks.current.onDeleted(all);
        } catch {
          Alert.alert(tr.error, tr.notesSaveError);
        }
      } },
    ]);
  };

  const archived = isNoteArchived(shown);
  const hasContent = !!saved.current || !!title.trim() || !!body.trim();
  const tags = noteTags({ ...shown, title, body, tags: parseTagsInput(tagsInput) });
  const taskLink = shown.linkedTaskId ? tasks.find(option => option.id === shown.linkedTaskId) : undefined;
  const meetingLink = shown.linkedMeetingId ? meetings.find(option => option.id === shown.linkedMeetingId) : undefined;
  const pickerColors = useMemo(() => pickerColorsFor(c), [c]);
  const mdColors = useMemo(() => markdownColorsFor(c), [c]);
  const bodyInputShown = canEdit && ((isNew && !saved.current) || bodyEditing);
  if (session) session.bodyOpen.current = bodyInputShown;
  const inlineToolbar = canEdit && Platform.OS !== 'ios' && (Platform.OS === 'web' || focused !== null);

  const headerButton = (id: string, icon: string, label: string, onPress: () => void, active = false, disabled = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress}
      style={[s.headerButton, { opacity: disabled ? 0.4 : 1 }]}>
      <IconSymbol name={icon} size={20} color={active ? c.accentText : c.text} />
    </TouchableOpacity>
  );
  const badge = (id: string, label: string, onPress?: () => void, tone: 'accent' | 'plain' = 'accent') => (
    <TouchableOpacity key={id} testID={id} accessibilityRole={onPress ? 'link' : 'text'} disabled={!onPress} onPress={onPress}
      style={[s.badge, { backgroundColor: tone === 'accent' ? c.dim : c.subtle }]}>
      <Text numberOfLines={1} style={{ color: tone === 'accent' ? c.accentText : c.sub, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
    </TouchableOpacity>
  );
  const statusText = status === 'saving' ? tr.notesSaving : status === 'saved' ? tr.notesSaved : '';

  const toolbar = (
    <NoteFormatToolbar colors={c} onAction={onToolbar} showDismiss={Platform.OS !== 'web'} canAttach={hasContent} canConvert={hasContent} />
  );

  return (
    <View testID="notes-editor" style={embedded ? s.embedded : [s.editor, { backgroundColor: c.panel }, shadow[isDark ? 'dark' : 'light'].card]}>
      <View style={s.header}>
        {headerButton('notes-close', compact ? 'chevron.left' : 'xmark', compact ? tr.back : tr.close, () => { void flush(); onClose(); })}
        <View style={{ flex: 1, minWidth: 0 }}>
          {status === 'error' ? (
            <TouchableOpacity testID="notes-save-retry" accessibilityRole="button" onPress={() => { void flush(); }}>
              <Text style={{ color: c.danger, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.notesSaveFailed}</Text>
            </TouchableOpacity>
          ) : (
            <Text testID="notes-save-status" accessibilityLiveRegion="polite" numberOfLines={1} style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular }}>
              {canEdit ? statusText : tr.notesReadOnly}
            </Text>
          )}
        </View>
        {canEdit && headerButton('notes-pin', 'pin.fill', shown.pinned ? tr.notesUnpin : tr.notesPin,
          () => { void commit(base => patchNote(base, { pinned: !(base.pinned === true) }, new Date().toISOString())); },
          shown.pinned === true, !hasContent)}
        {canEdit && headerButton('notes-to-task', 'checklist', tr.notesToTask, () => { void convert('task'); }, false, !hasContent)}
        {canEdit && headerButton('notes-to-meeting', 'calendar.badge.plus', tr.notesToMeeting, () => { void convert('meeting'); }, false, !hasContent)}
        {canEdit && headerButton('notes-more', 'ellipsis', tr.notesMore, () => { Keyboard.dismiss(); setMore(true); })}
      </View>

      {Platform.OS === 'web' && canEdit && toolbar}

      <Scroller embedded={embedded}>
        <View style={s.badges}>
          {badge('notes-project-badge', projectLabel, undefined, 'plain')}
          {archived && badge('notes-archived-badge', tr.notesArchived, undefined, 'plain')}
          {shown.linkedTaskId && badge('notes-task-badge', `${tr.notesToTask}${taskLink ? `: ${taskLink.label}` : ` · ${tr.notesLinkLost}`}`,
            taskLink ? () => navigateTo(linkedHref('task', taskLink.id, taskLink.projectId)) : undefined)}
          {shown.linkedMeetingId && badge('notes-meeting-badge', `${tr.notesToMeeting}${meetingLink ? `: ${meetingLink.label}` : ` · ${tr.notesLinkLost}`}`,
            meetingLink ? () => navigateTo(linkedHref('meeting', meetingLink.id, meetingLink.projectId)) : undefined)}
        </View>

        {canEdit ? (
          <TextInput ref={titleInput} testID="notes-title" accessibilityLabel={tr.titlePlaceholder} placeholder={tr.titlePlaceholder}
            placeholderTextColor={c.sub} value={title} onChangeText={changeTitle} autoFocus={isNew}
            onFocus={() => setFocused('title')} onBlur={() => { setFocused(null); void flush(); }}
            returnKeyType="next" blurOnSubmit={false} onSubmitEditing={() => startBodyEdit(-1)}
            inputAccessoryViewID={NOTE_TOOLBAR_ID} multiline={false}
            style={[s.title, { color: c.text }]} />
        ) : (
          <Text testID="notes-read-title" accessibilityRole="header" style={[s.title, { color: c.text }]}>{shown.title || tr.untitled}</Text>
        )}

        {tags.length > 0 && !details && (
          <Text testID="notes-tag-line" style={{ color: c.accentText, fontSize: 13, paddingBottom: 6 }}>{tags.map(tag => `#${tag}`).join('  ')}</Text>
        )}

        {canEdit && (
          <TouchableOpacity testID="notes-details" accessibilityRole="button" accessibilityState={{ expanded: details }}
            onPress={() => setDetails(value => !value)} style={s.detailsToggle}>
            <IconSymbol name={details ? 'chevron.up' : 'chevron.down'} size={12} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.semibold }}>{tr.notesDetails}</Text>
          </TouchableOpacity>
        )}
        {canEdit && details && (
          <View style={s.detailsBox}>
            <TextInput testID="notes-tags" accessibilityLabel={tr.notesTagsLabel} placeholder={tr.notesTagsPlaceholder}
              placeholderTextColor={c.sub} value={tagsInput} onChangeText={changeTags} autoCapitalize="none"
              onFocus={() => setFocused('tags')} onBlur={() => { setFocused(null); void flush(); }}
              style={[s.tagsInput, { color: c.text, borderColor: c.border }]} />
            <View style={s.links}>
              <View style={s.link}>
                <PickerField label={tr.notesLinkTask} options={[...tasks]} value={shown.linkedTaskId ?? null}
                  onSelect={id => { void commit(base => linkNote(base, { taskId: id }, new Date().toISOString())); }}
                  emptyOption={{ label: tr.notesLinkNone }}
                  selectedLabel={shown.linkedTaskId && !taskLink ? tr.notesLinkLost : null}
                  alwaysSearch colors={pickerColors} isDark={isDark} tr={tr} />
              </View>
              <View style={s.link}>
                <PickerField label={tr.notesLinkMeeting} options={[...meetings]} value={shown.linkedMeetingId ?? null}
                  onSelect={id => { void commit(base => linkNote(base, { meetingId: id }, new Date().toISOString())); }}
                  emptyOption={{ label: tr.notesLinkNone }}
                  selectedLabel={shown.linkedMeetingId && !meetingLink ? tr.notesLinkLost : null}
                  alwaysSearch colors={pickerColors} isDark={isDark} tr={tr} />
              </View>
            </View>
            <Text style={[s.hint, { color: c.sub }]}>{tr.notesMarkdownHint}</Text>
          </View>
        )}

        {bodyInputShown ? (
          <TextInput ref={bodyInput} testID="notes-body" accessibilityLabel={tr.noteBodyPlaceholder} placeholder={tr.noteBodyPlaceholder}
            placeholderTextColor={c.sub} value={body} onChangeText={changeBody}
            selection={forcedSelection} onSelectionChange={onSelection}
            onFocus={() => { setFocused('body'); setBodyEditing(true); }}
            onBlur={() => { setFocused(null); setBodyEditing(false); void flush(); }}
            inputAccessoryViewID={NOTE_TOOLBAR_ID}
            multiline scrollEnabled={false} textAlignVertical="top" style={[s.body, { color: c.text }]} />
        ) : (
          <View testID="notes-reader" style={s.rendered}>
            <NoteMarkdown body={canEdit ? body : shown.body} colors={mdColors}
              emptyLabel={canEdit ? tr.noteBodyPlaceholder : tr.notesEmptyBody}
              createTaskLabel={tr.notesCreateTask}
              onToggle={canEdit ? toggleCheck : undefined}
              onCreateTask={canEdit && saved.current ? line => { void createTaskFromLine(line); } : undefined}
              onTapLine={canEdit ? startBodyEdit : undefined}
              editLabel={tr.edit} />
          </View>
        )}

        <NoteAttachmentsSection ref={attachments} note={shown} canEdit={canEdit} colors={c}
          ensureSaved={flush} commit={commit} />
      </Scroller>

      {inlineToolbar && Platform.OS !== 'web' && toolbar}
      {canEdit && <NoteFormatAccessory colors={c} onAction={onToolbar} canAttach={hasContent} canConvert={hasContent} />}

      <NoteMoreSheet visible={more} onClose={() => setMore(false)} colors={c}
        archived={archived} canArchive={hasContent}
        moveTargets={hasContent ? moveTargets : []} currentProjectId={shown.projectId ?? null}
        onArchive={() => { void commit(base => setNoteArchived(base, !isNoteArchived(base), new Date().toISOString())); }}
        onMove={projectId => { void flush().then(current => { if (current) onMove(current, projectId); }); }}
        onDelete={remove} />
    </View>
  );
});

const s = StyleSheet.create({
  editor: { flex: 1, minWidth: 0, borderRadius: Atlas.radius.xxlarge, overflow: 'hidden' },
  embedded: { minWidth: 0, marginHorizontal: -12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingTop: 4 },
  headerButton: { minWidth: Atlas.controlHeight, minHeight: Atlas.controlHeight, alignItems: 'center', justifyContent: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 12, minHeight: 28, justifyContent: 'center', maxWidth: '100%' },
  title: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.semibold, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, minHeight: 48 },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 36 },
  detailsBox: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  tagsInput: { minHeight: Atlas.controlHeight, fontSize: 15, fontFamily: fontFamily.regular, borderBottomWidth: StyleSheet.hairlineWidth },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  link: { flexGrow: 1, flexShrink: 1, minWidth: 140 },
  hint: { fontSize: 12, fontFamily: fontFamily.regular },
  body: { minHeight: 220, fontSize: 17, lineHeight: 26, fontFamily: fontFamily.regular, paddingHorizontal: 16, paddingTop: 8 },
  rendered: { minHeight: 220, paddingHorizontal: 16, paddingTop: 8 },
});

/** Прокрутка редактора: власна — на весь екран; у зоні — від зони (без вкладеного ScrollView). */
function Scroller({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <View style={{ paddingBottom: 24 }}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}
