import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { copyMeeting } from '@/utils/meetingSharing';
import { Atlas } from '@/constants/atlas';
import { useProjectRole } from '@/hooks/use-project-role';
import { useSyncedList } from '@/hooks/use-synced-list';
import { useI18n } from '@/store/i18n';
import { updateSynced } from '@/store/synced-storage';
import { changeAgenda, meetingAgendaHtml, type AgendaChange } from '@/utils/meetingWorkspace';
import { noteBody, noteTitle, type Note } from '@/utils/notes';
import type { Meeting } from '@/utils/meetings';
import { uuidV4 } from '@/utils/uuid';
import type { MeetingDetailColors } from './MeetingDetail';


export function MeetingWorkspace({ meeting, date, colors: c, section = "agenda" }: { meeting: Meeting; date: string; colors: MeetingDetailColors; section?: "agenda" | "notes" }) {
  const { lang } = useI18n();
  const en = lang === 'en';
  const t = (uk: string, english: string) => en ? english : uk;
  const canEdit = useProjectRole(meeting.projectId) !== 'viewer';
  const { items: notes } = useSyncedList<Note>('notes', { enabled: true });
  const [itemText, setItemText] = useState('');
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const scoped = notes.filter(note => (note.projectId || '') === (meeting.projectId || ''));
  const linked = scoped.filter(note => note.linkedMeetingId === meeting.id);
  const agenda = meeting.agenda ?? [];
  const run = async (action: () => Promise<unknown>, write = true) => {
    if (lock.current || (write && !canEdit)) return;
    lock.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : t('Не вдалося зберегти', 'Could not save')); }
    finally { lock.current = false; setBusy(false); }
  };
  const mutate = (change: AgendaChange) => updateSynced<Meeting>('meetings', fresh => {
    if (!fresh.some(item => item.id === meeting.id)) throw new Error(t('Зустріч видалено', 'Meeting was deleted'));
    return fresh.map(item => item.id === meeting.id ? { ...item, agenda: changeAgenda(item.agenda, change) } : item);
  });
  const attach = (id: string, linkedMeetingId?: string) => updateSynced<Note>('notes', fresh => {
    const note = fresh.find(item => item.id === id);
    if (!note || (note.projectId || '') !== (meeting.projectId || '') || (note.linkedMeetingId && note.linkedMeetingId !== meeting.id)) throw new Error(t('Нотатка більше недоступна', 'Note is no longer available'));
    return fresh.map(item => { if (item.id !== id) return item; const next = { ...item, linkedMeetingId }; if (!linkedMeetingId) delete next.linkedMeetingId; return next; });
  });
  const button = (label: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[st.button, { borderColor: c.border, backgroundColor: c.dim, opacity: disabled || busy ? 0.5 : 1 }]}><Text style={{ color: c.text, fontWeight: Atlas.type.headingWeight }}>{label}</Text></TouchableOpacity>;
  const print = () => void run(async () => {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html: meetingAgendaHtml({ ...meeting, date }, en), width: 595, height: 842 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    else await Print.printAsync({ uri });
  }, false);
  return <View style={{ gap: 8 }}>
    <View style={[st.actions, section !== "agenda" && { display: 'none' }]}>
      {button(t('Копіювати', 'Copy'), () => void copyMeeting({ ...meeting, date }, en, true))}
      {button('PDF', print)}
    </View>
    <View style={[st.section, { borderColor: c.border, display: section === "agenda" ? "flex" : "none" }]}>
      <View style={st.actions}><Text accessibilityRole="header" style={[st.heading, { color: c.text, flex: 1 }]}>{t('Порядок денний', 'Agenda')}</Text><Text style={{ color: c.sub }}>{agenda.filter(item => item.done).length} / {agenda.length}</Text></View>
      {!agenda.length ? <Text style={{ color: c.sub }}>{t('Додайте теми для обговорення.', 'Add topics to discuss.')}</Text> : null}
      <View>{agenda.map(item => <View key={item.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: item.done, disabled: !canEdit || busy }} accessibilityLabel={item.text} disabled={!canEdit || busy} onPress={() => void run(() => mutate({ kind: 'set', id: item.id, done: !item.done }))} style={{ flex: 1, flexDirection: 'row', gap: 10, minHeight: 44, alignItems: 'center' }}>
          <Text style={{ color: c.text, fontSize: 24 }}>{item.done ? '☑' : '☐'}</Text><Text style={{ color: item.done ? c.sub : c.text, flex: 1, textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.text}</Text>
        </TouchableOpacity>
        {canEdit ? button(t('Видалити', 'Remove'), () => void run(() => mutate({ kind: 'remove', id: item.id }))) : null}
      </View>)}</View>
      {canEdit ? <>
        <TextInput accessibilityLabel={t('Новий пункт порядку денного', 'New agenda item')} placeholder={t('Тема для обговорення', 'Topic to discuss')} placeholderTextColor={c.sub} value={itemText} onChangeText={setItemText} maxLength={2000} editable={!busy} style={[st.input, { color: c.text, borderColor: c.border }]} />
        {button(t('Додати пункт', 'Add item'), () => void run(async () => { await mutate({ kind: 'add', item: { id: uuidV4(), text: itemText, done: false } }); setItemText(''); }), !itemText.trim())}
      </> : null}
    </View>
    <View style={[st.section, { borderColor: c.border, display: section === "notes" ? "flex" : "none" }]}>
      <Text accessibilityRole="header" style={[st.heading, { color: c.text }]}>{t('Нотатки зустрічі', 'Meeting notes')}</Text>
      {linked.map(note => <View key={note.id} style={[st.section, { backgroundColor: c.dim, borderColor: c.border }]}>
        <Text style={[st.heading, { color: c.text }]}>{noteTitle(note)}</Text><Text selectable style={{ color: c.text }}>{noteBody(note)}</Text>
        {canEdit ? <View style={st.actions}>{button(t('Редагувати нотатку', 'Edit note'), () => { setEditing({ id: note.id, body: noteBody(note) }); setBody(noteBody(note)); }, !!body.trim())}{button(t('Відкріпити', 'Detach'), () => void run(() => attach(note.id)), editing?.id === note.id)}</View> : null}
      </View>)}
      {canEdit ? <>
        <TextInput accessibilityLabel={t('Нова нотатка зустрічі', 'New meeting note')} placeholder={t('Рішення, ідеї та наступні кроки…', 'Decisions, ideas and next steps…')} placeholderTextColor={c.sub} multiline textAlignVertical="top" value={body} onChangeText={setBody} editable={!busy} style={[st.input, { color: c.text, borderColor: c.border, minHeight: 110 }]} />
        {button(t('Зберегти нотатку', 'Save note'), () => void run(async () => {
          if (editing) {
            await updateSynced<Note>('notes', fresh => {
              const latest = fresh.find(note => note.id === editing.id);
              if (!latest || (latest.projectId || "") !== (meeting.projectId || "") || latest.linkedMeetingId !== meeting.id || noteBody(latest) !== editing.body) throw new Error(t('Нотатку змінено на іншому пристрої. Скопіюйте ваш текст перед оновленням.', 'This note changed on another device. Copy your draft before refreshing.'));
              return fresh.map(note => note.id === editing.id ? { ...note, body: body.trim() } : note);
            });
            setEditing(null); setBody(''); return;
          }
          const stamp = new Date().toISOString();
          const note: Note = { id: uuidV4(), title: body.trim().split('\n')[0].slice(0, 100), body: body.trim(), createdAt: stamp, updatedAt: stamp, ...(meeting.projectId ? { projectId: meeting.projectId } : {}), linkedMeetingId: meeting.id };
          await updateSynced<Note>('notes', fresh => [...fresh, note]); setBody('');
        }), !body.trim())}
        {editing ? button(t('Скасувати редагування', 'Cancel editing'), () => { setEditing(null); setBody(''); }) : null}
        {button(t('Прикріпити наявну нотатку', 'Attach existing note'), () => setPicking(!picking))}
        {picking ? <View style={{ gap: 8 }}>
          {scoped.filter(note => !note.linkedMeetingId).map(note => <View key={note.id}>{button(noteTitle(note), () => void run(async () => { await attach(note.id, meeting.id); setPicking(false); }))}</View>)}
          {!scoped.some(note => !note.linkedMeetingId) ? <Text style={{ color: c.sub }}>{t('У цьому просторі немає вільних нотаток.', 'No available notes in this space.')}</Text> : null}
        </View> : null}
      </> : !linked.length ? <Text style={{ color: c.sub }}>{t('Нотаток поки немає.', 'No notes yet.')}</Text> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={{ color: '#DE350B' }}>{error}</Text> : null}
  </View>;
}
const st = StyleSheet.create({
  section: { borderWidth: 1, borderRadius: Atlas.radius.large, padding: Atlas.space.s150, gap: 8 },
  heading: { fontSize: 15, fontWeight: Atlas.type.headingWeight },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  button: { minHeight: Atlas.controlHeight, paddingHorizontal: 12, paddingVertical: 10, borderRadius: Atlas.radius.medium, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: Atlas.radius.medium, minHeight: Atlas.controlHeight, padding: 12, fontSize: 14 },
});
