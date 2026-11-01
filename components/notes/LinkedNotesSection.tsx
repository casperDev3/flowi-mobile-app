/**
 * components/notes/LinkedNotesSection.tsx — секція «Нотатки» в деталі
 * задачі й зустрічі: усі нотатки з `linkedTaskId` / `linkedMeetingId` цього
 * запису (їх може бути багато) + «+ Нотатка».
 *
 * «+ Нотатка» відкриває міні-аркуш швидкого запису ПРЯМО тут (вкладеним
 * модалом, а не кореневим GlobalNoteCapture): деталь на телефоні — сама
 * модал, і кореневий аркуш iOS під нею не показав би. Нова нотатка завжди
 * особиста (без projectId), навіть із проєктної задачі чи зустрічі, — вона
 * лише отримує звʼязок.
 *
 * Тап по нотатці → `/notes?open=<id>` (повний редактор). Коли деталь —
 * модал, спершу її треба закрити (`beforeOpen`), інакше екран нотаток
 * відкриється під нею.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { fontFamily } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import { loadDataResult, subscribeToStorage } from '@/store/storage';
import {
  checklistProgress,
  isNoteArchived,
  noteBody,
  notePreview,
  notesLinkedTo,
  noteStamp,
  noteTitle,
  normalizeNotes,
  type Note,
  type NoteLinkTarget,
} from '@/utils/notes';

import { navigateTo } from './noteActions';
import { NoteCaptureSheet } from './NoteCaptureSheet';
import { notesPalette } from './notesTheme';

export interface LinkedNotesSectionProps {
  target: NoteLinkTarget;
  /** Без пропа — системна тема (useColorScheme). */
  isDark?: boolean;
  /** Кольори картки-господаря (текст, підписи, рамки) — секція не має виглядати чужою. */
  colors?: { text: string; sub: string; border: string; dim: string };
  /** Закрити модал деталі перед переходом у редактор нотатки. */
  beforeOpen?: () => void;
  /** Показувати «+ Нотатка» (типово так: особиста нотатка не потребує прав на запис). */
  canAdd?: boolean;
  /** Без заголовка секції — коли господар уже підписав місце (вкладка «Нотатки»). */
  hideTitle?: boolean;
  /**
   * Власна обробка «+ Нотатка» замість вкладеного аркуша — для господаря, поверх
   * якого другий модал на iOS не показується надійно (MeetingFormSheet): він
   * закривається сам і просить кореневий аркуш (requestNoteCapture з links).
   */
  onAdd?: () => void;
}

/** Затримка переходу після закриття модала деталі (анімація ~300 мс, NEW-02). */
const AFTER_CLOSE_MS = 320;

function shortDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

export function LinkedNotesSection({ target, isDark: isDarkProp, colors, beforeOpen, canAdd = true, hideTitle, onAdd }: LinkedNotesSectionProps) {
  const { tr, lang } = useI18n();
  const scheme = useColorScheme();
  const isDark = isDarkProp ?? scheme === 'dark';
  const locale = lang === 'en' ? 'en-US' : 'uk-UA';
  const p = notesPalette(isDark);
  const c = colors ?? { text: p.text, sub: p.sub, border: p.border, dim: p.dim };
  const [notes, setNotes] = useState<Note[]>([]);
  const [capturing, setCapturing] = useState(false);

  const taskId = 'taskId' in target ? target.taskId : undefined;
  const meetingId = 'meetingId' in target ? target.meetingId : undefined;

  const reload = useCallback(async () => {
    const result = await loadDataResult<unknown>('notes', []);
    // Не прочиталось — лишаємо, що було: «не прочиталось» ≠ «порожньо» (ERR-01).
    if (!result.ok) return;
    setNotes(normalizeNotes(result.value));
  }, []);

  useEffect(() => {
    void reload();
    return subscribeToStorage(key => { if (key === 'notes') void reload(); });
  }, [reload]);

  const linked = useMemo(
    () => notesLinkedTo(notes, taskId ? { taskId } : { meetingId: meetingId ?? '' }),
    [notes, taskId, meetingId],
  );

  const open = (note: Note) => {
    const href = `/notes?open=${encodeURIComponent(note.id)}`;
    if (beforeOpen) {
      beforeOpen();
      setTimeout(() => navigateTo(href), AFTER_CLOSE_MS);
    } else {
      navigateTo(href);
    }
  };

  return (
    <View testID="linked-notes-section" style={st.wrap}>
      <View style={st.headRow}>
        {hideTitle ? <View style={{ flex: 1 }} /> : (
          <Text accessibilityRole="header" style={[st.title, { color: c.sub }]}>
            {tr.notesLinkedTitle}{linked.length ? ` · ${linked.length}` : ''}
          </Text>
        )}
        {canAdd ? (
          <TouchableOpacity
            testID="linked-notes-add"
            accessibilityRole="button"
            accessibilityLabel={tr.notesAddLinked}
            onPress={() => { if (onAdd) onAdd(); else setCapturing(true); }}
            style={[st.addBtn, { backgroundColor: p.subtle }]}>
            <Text style={{ color: p.text, fontFamily: fontFamily.semibold, fontSize: 13 }}>{tr.notesAddLinked}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {linked.length === 0 ? (
        <Text style={[st.empty, { color: c.sub }]}>{tr.notesLinkedEmpty}</Text>
      ) : (
        <View style={[st.list, { backgroundColor: p.subtle }]}>
          {linked.map((note, index) => {
            const title = noteTitle(note) || notePreview(note) || tr.untitled;
            const preview = noteTitle(note) ? notePreview(note) : '';
            const progress = checklistProgress(noteBody(note));
            const archived = isNoteArchived(note);
            const files = note.attachments?.length ?? 0;
            const meta = [
              shortDate(noteStamp(note), locale),
              progress.total ? `☑ ${progress.done}/${progress.total}` : '',
              files ? `${tr.notesAttachments} ${files}` : '',
              archived ? tr.notesArchived : '',
            ].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                key={note.id}
                testID={`linked-note-${note.id}`}
                accessibilityRole="button"
                accessibilityLabel={tr.notesLinkedOpenA11y.replace('{title}', title)}
                onPress={() => open(note)}
                style={[st.row, index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : null,
                  archived ? { opacity: 0.6 } : null]}>
                <View style={[st.icon, { backgroundColor: p.dim }]}>
                  <IconSymbol name={archived ? 'archivebox' : 'note.text'} size={14} color={p.accentText} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[st.rowTitle, { color: c.text }]}>{title}</Text>
                  {preview ? <Text numberOfLines={2} style={[st.preview, { color: c.sub }]}>{preview}</Text> : null}
                  {meta ? <Text numberOfLines={1} style={[st.meta, { color: c.sub }]}>{meta}</Text> : null}
                </View>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {canAdd && !onAdd ? (
        <NoteCaptureSheet
          visible={capturing}
          isDark={isDark}
          initialLinks={taskId ? { taskId } : { meetingId }}
          onSaved={() => { void reload(); }}
          onExpand={noteId => open({ id: noteId } as Note)}
          onClose={() => setCapturing(false)}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  // Підпис групи — sentence case (DS: без uppercase і розрідженого трекінгу).
  title: { flex: 1, fontSize: 13, fontFamily: fontFamily.medium, marginLeft: 2 },
  addBtn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  empty: { fontSize: 13, fontFamily: fontFamily.regular, marginLeft: 2 },
  list: { borderRadius: Atlas.radius.large, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 52 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontFamily: fontFamily.semibold },
  preview: { fontSize: 12, lineHeight: 17, fontFamily: fontFamily.regular, marginTop: 2 },
  meta: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 4 },
});
