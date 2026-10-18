/**
 * components/notes/NoteConvertSheet.tsx — «Нотатка → задача / зустріч».
 *
 * Самодостатній аркуш: сам читає проєкти, ролі й автора, тож його можна
 * відкрити з будь-якого екрана (нотатки, швидкий запис, деталь задачі).
 *
 *  - Задача: назва з нотатки, опис — тіло без чек-листа, пункти «- [ ]» →
 *    підзадачі (стан «зроблено» зберігається); дедлайн і пріоритет — тут.
 *  - Зустріч: дата/час із фрази в тексті («завтра о 15:00», «пт 14:00») або
 *    наступна повна година; 30 хв; пункти списку → порядок денний, решта →
 *    нотатки зустрічі.
 *  - Чип проєкту: за замовчуванням — проєкт нотатки (або «Особисті»). Задача
 *    чи зустріч народжується в обраному місці, а нотатка лишається, де була,
 *    і лише отримує звʼязок (`linkedTaskId` / `linkedMeetingId`).
 *
 * Правила перетворення — у спільному блоці utils/notes.ts (паритет із вебом).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { Atlas } from '@/constants/atlas';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import {
  noteToMeetingDraft,
  noteToTaskDraft,
  type Note,
  type NoteDraftPriority,
} from '@/utils/notes';
import { uuidV4 } from '@/utils/uuid';

import { createMeetingFromNote, createTaskFromNote, readAuthUserId } from './noteActions';
import { notesPalette } from './notesTheme';
import { useWritableProjects } from './useNoteTargets';

export type NoteConvertMode = 'task' | 'meeting';

export interface NoteConvertResult {
  kind: NoteConvertMode;
  /** id створеної задачі чи зустрічі. */
  id: string;
  projectId?: string;
  /** Нотатка вже зі звʼязком. */
  note: Note;
}

export interface NoteConvertSheetProps {
  visible: boolean;
  onClose: () => void;
  mode: NoteConvertMode;
  /** Нотатка, ВЖЕ збережена в сховищі (звʼязок пишеться на неї). */
  note: Note | null;
  isDark?: boolean;
  onDone?: (result: NoteConvertResult) => void;
}

const pad = (value: number) => String(value).padStart(2, '0');
const ymd = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DURATIONS = [15, 30, 45, 60, 90];
const PRIORITIES: NoteDraftPriority[] = [null, 0, 1, 2, 3, 4, 5];

function validDate(value: string): boolean {
  const match = DATE_RE.exec(value.trim());
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

type DeadlinePreset = 'none' | 'today' | 'tomorrow' | 'week';
function deadlineIso(preset: DeadlinePreset): string | undefined {
  if (preset === 'none') return undefined;
  const now = new Date();
  const days = preset === 'today' ? 0 : preset === 'tomorrow' ? 1 : 7;
  // Локальна північ дня — так само, як дедлайн із календаря задачі.
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString();
}

export function NoteConvertSheet({ visible, onClose, mode, note, isDark: isDarkProp, onDone }: NoteConvertSheetProps) {
  const scheme = useColorScheme();
  const isDark = isDarkProp ?? scheme === 'dark';
  const c = notesPalette(isDark);
  const { tr } = useI18n();
  const projects = useWritableProjects(mode);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState<DeadlinePreset>('none');
  const [priority, setPriority] = useState<NoteDraftPriority>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(visible);
  const result = useRef<NoteConvertResult | null>(null);
  const lock = useRef(false);

  const taskPreview = useMemo(() => note ? noteToTaskDraft(note, { id: 'preview', now: new Date().toISOString() }) : null, [note]);
  const meetingPreview = useMemo(() => note ? noteToMeetingDraft(note, new Date(), { id: 'preview' }) : null, [note]);

  // Кожне відкриття — свіжа чернетка з нотатки.
  useEffect(() => {
    if (!visible || !note) return;
    setOpen(true);
    result.current = null;
    setError(''); setBusy(false);
    setTitle(mode === 'task' ? taskPreview?.title ?? '' : meetingPreview?.title ?? '');
    setProjectId(note.projectId ?? null);
    setDeadline('none'); setPriority(null);
    setDate(meetingPreview?.date ?? ''); setTime(meetingPreview?.time ?? ''); setDuration(meetingPreview?.durationMinutes ?? 30);
  }, [visible, note, mode, taskPreview, meetingPreview]);

  // Проєкт нотатки, куди писати не можна (глядач, архів) — пропонуємо «Особисті».
  const chosen = projectId && projects.some(project => project.id === projectId) ? projectId : null;

  const create = async () => {
    if (!note || lock.current) return;
    if (!title.trim()) { setError(tr.notesConvertTitleRequired); return; }
    if (mode === 'meeting' && (!validDate(date) || !TIME_RE.test(time.trim()))) { setError(tr.notesConvertInvalidDate); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (mode === 'task') {
        const userId = chosen ? await readAuthUserId() : null;
        const created = await createTaskFromNote(note, {
          projectId: chosen, title, deadline: deadlineIso(deadline), priorityLevel: priority, userId,
        });
        result.current = { kind: 'task', id: created.task.id, projectId: created.task.projectId, note: created.note };
      } else {
        const id = uuidV4();
        const draft = noteToMeetingDraft(note, new Date(), { id, projectId: chosen, durationMinutes: duration });
        const [h, m] = time.trim().split(':');
        const created = await createMeetingFromNote(note, {
          ...draft, title: title.trim(), date: date.trim(), time: `${pad(Number(h))}:${m}`, durationMinutes: duration,
        });
        result.current = { kind: 'meeting', id: created.meetingId, projectId: draft.projectId, note: created.note };
      }
      setOpen(false);
    } catch (err) {
      if (__DEV__) console.warn('[notes] convert failed', err);
      setError(tr.notesConvertError);
    } finally {
      lock.current = false; setBusy(false);
    }
  };

  const chip = (id: string, label: string, active: boolean, onPress: () => void, color?: string) => (
    <TouchableOpacity key={id} testID={id} accessibilityRole="button" accessibilityState={{ selected: active }}
      onPress={onPress} style={[s.chip, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.dim : 'transparent' }]}>
      {color && <View style={[s.dot, { backgroundColor: color }]} />}
      <Text numberOfLines={1} style={{ color: active ? c.accentText : c.text, fontWeight: active ? '700' : '500' }}>{label}</Text>
    </TouchableOpacity>
  );
  const label = (text: string) => <Text style={[s.label, { color: c.sub }]}>{text}</Text>;
  const preview = (items: { id: string; text: string; done: boolean }[]) => items.length > 0 && (
    <View style={s.preview}>
      {items.slice(0, 6).map(item => (
        <Text key={item.id} numberOfLines={1} style={{ color: item.done ? c.sub : c.text, fontSize: 14 }}>
          {item.done ? '☑' : '☐'} {item.text}
        </Text>
      ))}
      {items.length > 6 && <Text style={{ color: c.sub, fontSize: 13 }}>+{items.length - 6}</Text>}
    </View>
  );
  const nowDate = new Date();
  const today = ymd(nowDate);
  const tomorrow = ymd(new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1));

  return (
    <SheetModal visible={visible && open} onClose={() => {
      const done = result.current; result.current = null;
      onClose();
      if (done) {
        onDone?.(done);
        Alert.alert(done.kind === 'task' ? tr.notesConvertTaskDone : tr.notesConvertMeetingDone, title.trim());
      }
    }}>
      <View testID="notes-convert-sheet" style={[s.card, { backgroundColor: c.panel }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
          <Text accessibilityRole="header" style={[s.title, { color: c.text }]}>
            {mode === 'task' ? tr.notesConvertTaskTitle : tr.notesConvertMeetingTitle}
          </Text>
          <TextInput testID="notes-convert-title" accessibilityLabel={tr.titlePlaceholder} placeholder={tr.titlePlaceholder}
            placeholderTextColor={c.sub} value={title} onChangeText={value => { setTitle(value); setError(''); }}
            style={[s.input, { color: c.text, borderColor: c.border }]} />

          {label(tr.notesConvertProject)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
            {chip('notes-convert-project-personal', tr.notesPersonal, chosen === null, () => setProjectId(null))}
            {projects.map(project => chip(`notes-convert-project-${project.id}`, project.name, chosen === project.id,
              () => setProjectId(project.id), project.color))}
          </ScrollView>

          {mode === 'task' ? (
            <>
              {label(tr.deadline)}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
                {chip('notes-convert-deadline-none', tr.notesConvertNoDeadline, deadline === 'none', () => setDeadline('none'))}
                {chip('notes-convert-deadline-today', tr.today, deadline === 'today', () => setDeadline('today'))}
                {chip('notes-convert-deadline-tomorrow', tr.tomorrow, deadline === 'tomorrow', () => setDeadline('tomorrow'))}
                {chip('notes-convert-deadline-week', tr.notesConvertNextWeek, deadline === 'week', () => setDeadline('week'))}
              </ScrollView>
              {label(tr.priority)}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
                {PRIORITIES.map(level => chip(`notes-convert-priority-${level ?? 'none'}`,
                  level === null ? tr.notesConvertNoPriority : `P${level}`, priority === level, () => setPriority(level)))}
              </ScrollView>
              {taskPreview && taskPreview.subtasks.length > 0 && (
                <>
                  {label(`${tr.notesConvertSubtasks} · ${taskPreview.subtasks.length}`)}
                  {preview(taskPreview.subtasks.map(item => ({ id: item.id, text: item.title, done: item.done })))}
                </>
              )}
              {taskPreview?.description ? (
                <>
                  {label(tr.notesConvertDescription)}
                  <Text numberOfLines={3} style={{ color: c.sub, fontSize: 14 }}>{taskPreview.description}</Text>
                </>
              ) : null}
            </>
          ) : (
            <>
              <View style={s.row}>
                <View style={{ flex: 3 }}>
                  {label(tr.notesConvertDate)}
                  <TextInput testID="notes-convert-date" accessibilityLabel={tr.notesConvertDate} value={date}
                    onChangeText={value => { setDate(value); setError(''); }} keyboardType="numbers-and-punctuation"
                    placeholder="2026-10-25" placeholderTextColor={c.sub} style={[s.input, { color: c.text, borderColor: c.border }]} />
                </View>
                <View style={{ flex: 2 }}>
                  {label(tr.notesConvertTime)}
                  <TextInput testID="notes-convert-time" accessibilityLabel={tr.notesConvertTime} value={time}
                    onChangeText={value => { setTime(value); setError(''); }} keyboardType="numbers-and-punctuation"
                    placeholder="15:00" placeholderTextColor={c.sub} style={[s.input, { color: c.text, borderColor: c.border }]} />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
                {chip('notes-convert-date-today', tr.today, date === today, () => setDate(today))}
                {chip('notes-convert-date-tomorrow', tr.tomorrow, date === tomorrow, () => setDate(tomorrow))}
              </ScrollView>
              {label(tr.notesConvertDuration)}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.chips}>
                {DURATIONS.map(value => chip(`notes-convert-duration-${value}`, `${value} ${tr.min}`, duration === value, () => setDuration(value)))}
              </ScrollView>
              {meetingPreview && meetingPreview.agenda.length > 0 && (
                <>
                  {label(`${tr.notesConvertAgenda} · ${meetingPreview.agenda.length}`)}
                  {preview(meetingPreview.agenda)}
                </>
              )}
              {meetingPreview?.notes ? (
                <>
                  {label(tr.notesConvertMeetingNotes)}
                  <Text numberOfLines={3} style={{ color: c.sub, fontSize: 14 }}>{meetingPreview.notes}</Text>
                </>
              ) : null}
            </>
          )}

          <Text style={{ color: c.sub, fontSize: 12 }}>{tr.notesConvertNoteStays}</Text>
          {error ? <Text accessibilityRole="alert" testID="notes-convert-error" style={{ color: c.danger }}>{error}</Text> : null}
          <TouchableOpacity testID="notes-convert-create" accessibilityRole="button" accessibilityState={{ disabled: busy }}
            disabled={busy || !note} onPress={() => { void create(); }}
            style={[s.primary, { backgroundColor: c.accentStrong, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={c.onAccent} /> : (
              <Text style={{ color: c.onAccent, fontWeight: '700', fontSize: 16 }}>
                {mode === 'task' ? tr.notesConvertCreateTask : tr.notesConvertCreateMeeting}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const s = StyleSheet.create({
  card: { borderTopLeftRadius: Atlas.radius.xxlarge, borderTopRightRadius: Atlas.radius.xxlarge, borderRadius: Atlas.radius.xxlarge, padding: 16, maxHeight: 640 },
  title: { fontSize: 19, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  input: { minHeight: Atlas.controlHeight, borderWidth: StyleSheet.hairlineWidth, borderRadius: Atlas.radius.xlarge, paddingHorizontal: 12, fontSize: 16 },
  chips: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: Atlas.controlHeight, paddingHorizontal: 14, borderRadius: Atlas.radius.xxlarge, borderWidth: 1, maxWidth: 220 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', gap: 10 },
  preview: { gap: 4 },
  primary: { minHeight: 50, borderRadius: Atlas.radius.xlarge, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
