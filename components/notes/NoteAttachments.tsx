/**
 * components/notes/NoteAttachments.tsx — вкладення в редакторі нотатки.
 *
 * Список береться з метаданих самої нотатки (`attachments`), тож він видно
 * одразу й офлайн; байти тягнуться з сервера лише при відкритті. Додавання:
 * спершу нотатка гарантовано на диску (`ensureSaved`), потім файл на сервер,
 * і лише після успіху — метадані в нотатку (`commit`), щоб у записі не
 * лишалось посилань на файли, яких немає.
 */
import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { OfflineError } from '@/store/api';
import { useI18n } from '@/store/i18n';
import { addNoteAttachment, normalizeAttachments, removeNoteAttachment, type Note, type NoteAttachmentMeta } from '@/utils/notes';

import {
  AttachmentNotSyncedError,
  AttachmentQuotaError,
  AttachmentTooLargeError,
  attachmentsAvailable,
  deleteNoteAttachment,
  openNoteAttachment,
  pickNoteAttachment,
  toAttachmentMeta,
  uploadNoteAttachment,
  type AttachmentSource,
} from './noteAttachmentsApi';
import type { NotesPalette } from './notesTheme';

export interface NoteAttachmentsHandle {
  openPicker: () => void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export const NoteAttachmentsSection = forwardRef<NoteAttachmentsHandle, {
  note: Note;
  canEdit: boolean;
  colors: NotesPalette;
  ensureSaved: () => Promise<Note | null>;
  commit: (transform: (base: Note) => Note) => Promise<Note | null>;
}>(function NoteAttachmentsSection({ note, canEdit, colors: c, ensureSaved, commit }, ref) {
  const { tr } = useI18n();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const list = normalizeAttachments(note.attachments);

  useImperativeHandle(ref, () => ({ openPicker: () => setPicking(true) }), []);

  const explain = (error: unknown) => {
    const message = error instanceof AttachmentTooLargeError ? tr.notesAttachTooLarge
      : error instanceof AttachmentQuotaError ? tr.notesAttachQuota
      : error instanceof OfflineError ? tr.notesAttachOffline
        : error instanceof AttachmentNotSyncedError ? tr.notesAttachNotSynced
          : tr.notesAttachError;
    Alert.alert(tr.error, message);
  };

  const add = async (source: AttachmentSource) => {
    if (lock.current) return;
    setPicking(false);
    if (!attachmentsAvailable()) { Alert.alert(tr.error, tr.notesAttachOffline); return; }
    lock.current = true;
    try {
      const current = await ensureSaved();
      if (!current) return;
      const file = await pickNoteAttachment(source);
      if (!file) return;
      setBusy('upload');
      const row = await uploadNoteAttachment(current, file);
      const meta = toAttachmentMeta(row);
      await commit(base => addNoteAttachment(base, meta, new Date().toISOString()));
    } catch (error) {
      if (__DEV__) console.warn('[notes] attachment upload failed', error);
      explain(error);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const open = async (meta: NoteAttachmentMeta) => {
    if (lock.current) return;
    lock.current = true; setBusy(meta.id);
    try { await openNoteAttachment(note, meta); }
    catch (error) {
      if (__DEV__) console.warn('[notes] attachment open failed', error);
      Alert.alert(tr.error, error instanceof OfflineError ? tr.notesAttachOffline : tr.notesAttachOpenError);
    } finally { lock.current = false; setBusy(null); }
  };

  const remove = (meta: NoteAttachmentMeta) => {
    Alert.alert(tr.notesAttachDeleteConfirm, meta.name, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: async () => {
        if (lock.current) return;
        lock.current = true; setBusy(meta.id);
        try {
          await deleteNoteAttachment(note, meta.id);
          await commit(base => removeNoteAttachment(base, meta.id, new Date().toISOString()));
        } catch (error) { explain(error); }
        finally { lock.current = false; setBusy(null); }
      } },
    ]);
  };

  if (!list.length && !picking && busy !== 'upload') return null;

  const chip = (source: AttachmentSource, icon: string, label: string) => (
    <TouchableOpacity key={source} testID={`notes-attach-${source}`} accessibilityRole="button" accessibilityLabel={label}
      onPress={() => { void add(source); }} style={[s.chip, { borderColor: c.border, backgroundColor: c.dim }]}>
      <IconSymbol name={icon} size={16} color={c.accentText} />
      <Text style={{ color: c.accentText, fontWeight: '600' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View testID="notes-attachments" style={[s.section, { borderTopColor: c.border }]}>
      <Text accessibilityRole="header" style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
        {tr.notesAttachments}{list.length ? ` · ${list.length}` : ''}
      </Text>
      {list.map(meta => (
        <View key={meta.id} style={[s.row, { borderColor: c.border }]}>
          <TouchableOpacity testID={`notes-attachment-${meta.id}`} accessibilityRole="button" accessibilityLabel={`${tr.notesOpenLinked}: ${meta.name}`}
            onPress={() => { void open(meta); }} style={s.rowMain}>
            <IconSymbol name={meta.type.startsWith('image/') ? 'photo' : 'doc.fill'} size={18} color={c.accentText} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 15 }}>{meta.name}</Text>
              <Text style={{ color: c.sub, fontSize: 12 }}>{formatSize(meta.size)}</Text>
            </View>
            {busy === meta.id && <ActivityIndicator color={c.accent} />}
          </TouchableOpacity>
          {canEdit && (
            <TouchableOpacity testID={`notes-attachment-delete-${meta.id}`} accessibilityRole="button"
              accessibilityLabel={`${tr.delete}: ${meta.name}`} onPress={() => remove(meta)} style={s.icon}>
              <IconSymbol name="trash" size={18} color={c.sub} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      {busy === 'upload' && (
        <View style={s.rowMain}><ActivityIndicator color={c.accent} /><Text style={{ color: c.sub }}>{tr.notesAttachUploading}</Text></View>
      )}
      {canEdit && picking && (
        <View style={s.chips}>
          {chip('library', 'photo', tr.notesAttachPhoto)}
          {chip('camera', 'camera', tr.notesAttachCamera)}
          {chip('file', 'paperclip', tr.notesAttachFile)}
          <TouchableOpacity testID="notes-attach-cancel" accessibilityRole="button" accessibilityLabel={tr.cancel}
            onPress={() => setPicking(false)} style={s.icon}>
            <IconSymbol name="xmark" size={16} color={c.sub} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  section: { marginTop: 16, marginHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: Atlas.controlHeight },
  icon: { minWidth: Atlas.controlHeight, minHeight: Atlas.controlHeight, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: Atlas.controlHeight, paddingHorizontal: 12, borderRadius: Atlas.radius.xxlarge, borderWidth: StyleSheet.hairlineWidth },
});
