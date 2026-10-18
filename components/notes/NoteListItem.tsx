/**
 * components/notes/NoteListItem.tsx — нотатка в списку (рядок) і в сітці (картка).
 *
 * Обидва вигляди показують те саме: назву, початок тексту, дату, теги,
 * звʼязки («→ Задача» / «→ Зустріч»), прогрес чек-листа, закріплення й
 * кількість вкладень. Різниця — лише в щільності: рядок тримає 2 рядки
 * тексту, картка сітки — до 8.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useI18n } from '@/store/i18n';
import {
  checklistProgress,
  isNoteArchived,
  normalizeAttachments,
  noteTags,
  parseNoteMarkdown,
  stripInline,
  type Note,
} from '@/utils/notes';

import type { NotesPalette } from './notesTheme';

/** Кілька перших рядків тексту як простий текст (для прев'ю). */
export function notePreviewText(note: Note, maxLines: number): string {
  const lines: string[] = [];
  for (const block of parseNoteMarkdown(note.body)) {
    if (block.kind === 'empty' || !block.text) continue;
    const text = stripInline(block.text);
    lines.push(block.kind === 'todo' ? `${block.done ? '✓' : '○'} ${text}` : block.kind === 'bullet' ? `• ${text}` : text);
    if (lines.length >= maxLines) break;
  }
  return lines.join('\n');
}

export function NoteListItem({ note, variant, colors: c, selected, locale, onPress }: {
  note: Note;
  variant: 'row' | 'card';
  colors: NotesPalette;
  selected: boolean;
  locale: string;
  onPress: () => void;
}) {
  const { tr } = useI18n();
  const checklist = checklistProgress(note.body);
  const tags = noteTags(note);
  const files = normalizeAttachments(note.attachments).length;
  const preview = notePreviewText(note, variant === 'row' ? 2 : 8);
  const archived = isNoteArchived(note);
  const badge = (id: string, label: string) => (
    <View key={id} testID={id} style={[s.badge, { backgroundColor: c.dim }]}>
      <Text numberOfLines={1} style={{ color: c.accentText, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );

  return (
    <TouchableOpacity accessibilityRole="button" testID={`note-${note.id}`}
      accessibilityLabel={`${note.pinned ? `${tr.notesPinned}, ` : ''}${note.title || tr.untitled}`}
      accessibilityState={{ selected }} onPress={onPress}
      style={[variant === 'row' ? s.row : s.card, {
        backgroundColor: variant === 'card' ? c.panel : selected ? c.dim : c.card,
        borderColor: selected ? c.accent : c.border,
      }]}>
      <View style={s.head}>
        {note.pinned && <View testID={`note-pin-${note.id}`}><IconSymbol name="pin.fill" size={13} color={c.accentText} /></View>}
        <Text numberOfLines={2} style={[s.title, { color: c.text }]}>{note.title || tr.untitled}</Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>{new Date(note.updatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Text>
      </View>
      {preview ? <Text numberOfLines={variant === 'row' ? 2 : 8} style={[s.preview, { color: c.sub }]}>{preview}</Text> : null}
      {tags.length > 0 && (
        <Text numberOfLines={1} style={{ color: c.accentText, fontSize: 12, marginTop: 6 }}>{tags.map(tag => `#${tag}`).join(' ')}</Text>
      )}
      {(note.linkedTaskId || note.linkedMeetingId || checklist.total > 0 || files > 0 || archived) && (
        <View style={s.foot}>
          {note.linkedTaskId && badge(`note-task-link-${note.id}`, tr.notesToTask)}
          {note.linkedMeetingId && badge(`note-meeting-link-${note.id}`, tr.notesToMeeting)}
          {archived && badge(`note-archived-${note.id}`, tr.notesArchived)}
          {checklist.total > 0 && (
            <View testID={`note-checklist-${note.id}`} style={s.meta}>
              <IconSymbol name="checkmark.square" size={13} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 12 }}>{checklist.done}/{checklist.total}</Text>
            </View>
          )}
          {files > 0 && (
            <View testID={`note-files-${note.id}`} style={s.meta}>
              <IconSymbol name="paperclip" size={13} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 12 }}>{files}</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Atlas.radius.xlarge, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Atlas.radius.xxlarge, padding: 14, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1, fontWeight: '700', fontSize: 16, lineHeight: 21 },
  preview: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  foot: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  badge: { borderRadius: Atlas.radius.xxlarge, paddingHorizontal: 8, paddingVertical: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
