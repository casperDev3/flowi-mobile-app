/**
 * components/notes/NoteCaptureSheet.tsx — швидкий запис нотатки (міні-аркуш).
 *
 * Одне поле з фокусом одразу; перший рядок — назва, решта — текст
 * (`captureTextToNote`). Будь-яке закриття — свайп, тап повз аркуш, ✕ —
 * ЗБЕРІГАЄ непорожній текст: «закрити» тут означає «готово», а не «скасувати».
 *
 * Дії: «→ Задача» / «→ Зустріч» (зберегти й відкрити лист перетворення),
 * «Розгорнути» (зберегти й відкрити повний редактор цієї нотатки).
 *
 * Нотатка зі швидкого запису ЗАВЖДИ особиста (без projectId) — навіть коли
 * відкрита з проєктної задачі чи зустрічі: тоді вона лише отримує звʼязок
 * (`initialLinks`).
 *
 * Наступний аркуш (перетворення) відкривається лише ПІСЛЯ анімації закриття
 * цього — інакше лишається невидимий шар, що з'їдає дотики (NEW-02).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { Atlas } from '@/constants/atlas';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { captureTextToNote, type Note } from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

import { navigateTo, persistNote } from './noteActions';
import { NoteConvertSheet, type NoteConvertMode, type NoteConvertResult } from './NoteConvertSheet';
import { notesPalette } from './notesTheme';

export interface NoteCaptureSheetProps {
  visible: boolean;
  /** Увесь потік завершено (аркуш і, якщо було, перетворення закрито). */
  onClose: () => void;
  /** Звʼязок нової нотатки з задачею / зустріччю («+ Нотатка» з деталі). */
  initialLinks?: { taskId?: string; meetingId?: string };
  isDark?: boolean;
  /** Нотатку збережено (для оновлення списків без чекання на подію сховища). */
  onSaved?: (note: Note) => void;
  /** «Розгорнути»: за замовчуванням — `/notes?open=<id>`. */
  onExpand?: (noteId: string) => void;
  /** Перетворення завершено. */
  onConverted?: (result: NoteConvertResult) => void;
}

type Pending = { kind: 'convert'; mode: NoteConvertMode; note: Note } | { kind: 'expand'; note: Note } | null;

export function NoteCaptureSheet({
  visible, onClose, initialLinks, isDark: isDarkProp, onSaved, onExpand, onConverted,
}: NoteCaptureSheetProps) {
  const scheme = useColorScheme();
  const isDark = isDarkProp ?? scheme === 'dark';
  const c = notesPalette(isDark);
  const { tr } = useI18n();
  const [text, setText] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [convert, setConvert] = useState<{ mode: NoteConvertMode; note: Note } | null>(null);
  const textRef = useRef('');
  const savedRef = useRef<Note | null>(null);
  const pending = useRef<Pending>(null);
  const idRef = useRef(uuidV4());

  useEffect(() => {
    if (!visible) return;
    // Новий запуск — нова нотатка.
    textRef.current = ''; setText('');
    savedRef.current = null; pending.current = null; inFlight.current = null; idRef.current = uuidV4();
    setConvert(null);
    setSheetOpen(true);
  }, [visible]);

  /**
   * Зберегти (один раз). null — нічого зберігати. Запис, що вже йде, спільний:
   * дія й свайп-закриття під час неї не створюють два записи з одним id.
   */
  const inFlight = useRef<Promise<Note | null> | null>(null);
  const save = (): Promise<Note | null> => {
    if (savedRef.current) return Promise.resolve(savedRef.current);
    if (inFlight.current) return inFlight.current;
    const run = saveOnce().finally(() => { inFlight.current = null; });
    inFlight.current = run;
    return run;
  };
  const saveOnce = async (): Promise<Note | null> => {
    const note = captureTextToNote(textRef.current, new Date().toISOString(), {
      id: idRef.current,
      linkedTaskId: initialLinks?.taskId,
      linkedMeetingId: initialLinks?.meetingId,
    });
    if (!note) return null;
    try {
      await persistNote(null, note);
      savedRef.current = note;
      onSaved?.(note);
      return note;
    } catch (error) {
      if (__DEV__) console.warn('[notes] capture save failed', error);
      Alert.alert(tr.error, tr.notesSaveError);
      return null;
    }
  };

  const act = async (kind: 'task' | 'meeting' | 'expand') => {
    const note = await save();
    if (!note) return;
    pending.current = kind === 'expand' ? { kind: 'expand', note } : { kind: 'convert', mode: kind, note };
    setSheetOpen(false);
  };

  const afterSheetClosed = async () => {
    const next = pending.current;
    pending.current = null;
    if (!next) {
      // Свайп / тап повз / ✕ — це «готово»: зберегти, якщо є що.
      await save();
      onClose();
      return;
    }
    if (next.kind === 'expand') {
      onClose();
      if (onExpand) onExpand(next.note.id);
      else navigateTo(`/notes?open=${encodeURIComponent(next.note.id)}`);
      return;
    }
    setConvert({ mode: next.mode, note: next.note });
  };

  const empty = !text.trim();
  const action = (id: string, label: string, onPress: () => void, primary = false) => (
    <TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: empty }} disabled={empty} onPress={onPress}
      style={[s.action, {
        borderColor: primary ? c.accentStrong : c.border,
        backgroundColor: primary ? c.accentStrong : c.dim,
        opacity: empty ? 0.45 : 1,
      }]}>
      <Text style={{ color: primary ? c.onAccent : c.accentText, fontWeight: '700' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <SheetModal visible={visible && sheetOpen} presentation="sheet" onClose={() => { void afterSheetClosed(); }}>
        <View testID="notes-capture-sheet" style={[s.card, { backgroundColor: c.panel }]}>
          <Text accessibilityRole="header" style={[s.title, { color: c.sub }]}>{tr.notesCaptureTitle}</Text>
          <TextInput testID="notes-capture-input" accessibilityLabel={tr.notesCaptureTitle}
            placeholder={tr.notesCapturePlaceholder} placeholderTextColor={c.sub}
            value={text} onChangeText={value => { textRef.current = value; setText(value); }}
            autoFocus multiline textAlignVertical="top" scrollEnabled
            style={[s.input, { color: c.text }]} />
          <View style={s.actions}>
            {action('notes-capture-task', tr.notesToTask, () => { void act('task'); })}
            {action('notes-capture-meeting', tr.notesToMeeting, () => { void act('meeting'); })}
            <View style={{ flex: 1 }} />
            {action('notes-capture-expand', tr.notesExpand, () => { void act('expand'); }, true)}
          </View>
        </View>
      </SheetModal>
      <NoteConvertSheet visible={visible && !!convert} mode={convert?.mode ?? 'task'} note={convert?.note ?? null}
        isDark={isDark} onDone={onConverted}
        onClose={() => { setConvert(null); onClose(); }} />
    </>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: Atlas.radius.xxlarge, padding: 16, gap: 10 },
  title: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { minHeight: 96, maxHeight: 260, fontSize: 17, lineHeight: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  action: { minHeight: Atlas.controlHeight, paddingHorizontal: 14, borderRadius: Atlas.radius.xxlarge, borderWidth: 1, justifyContent: 'center' },
});
