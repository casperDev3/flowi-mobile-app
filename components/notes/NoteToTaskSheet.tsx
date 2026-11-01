/**
 * components/notes/NoteToTaskSheet.tsx — «Перетворити на задачу» (планшет).
 *
 * Нативний відповідник вебового `note-to-task-dialog.tsx`: діалог з уже
 * заповненими полями (utils/noteToTask.ts noteTaskFields) — назва — назва
 * нотатки, опис — її текст, проєкт — проєкт нотатки. Людина може їх
 * поправити, обрати інший проєкт (лише той, де має право створювати) і
 * вирішити, чи видаляти нотатку після перетворення (за замовчуванням — ні).
 * Саме збереження робить викликач наявним шляхом даних.
 *
 * Оболонка — SheetModal (на планшеті — центрований діалог) із «брудним
 * склом» оверлею (OverlaySurface). Проєкт — рядок pill-кнопок, а не
 * PickerField: другий Modal поверх діалогу на iOS — відомий шлях до
 * «замерзлого» екрана (CLAUDE.md).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { OverlaySurface } from '@/components/ds/OverlaySurface';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import type { Note } from '@/utils/notes';
import { NOTE_TASK_TITLE_MAX, noteTaskFields, type NoteTaskFields } from '@/utils/noteToTask';

import { useNoteToTaskStrings } from './noteToTaskStrings';

export interface NoteToTaskSubmit {
  fields: NoteTaskFields;
  deleteNote: boolean;
}

export function NoteToTaskSheet({ note, projects, onCancel, onSubmit }: {
  /** Нотатка, яку перетворюємо; null — аркуш закритий. */
  note: Note | null;
  /** Проєкти, у які можна створити задачу (уже з правом правки). */
  projects: readonly { id: string; name: string }[];
  onCancel: () => void;
  /** Кидає помилку — аркуш лишається відкритим і показує її. */
  onSubmit: (request: NoteToTaskSubmit) => Promise<void>;
}) {
  return (
    <SheetModal visible={!!note} onClose={onCancel} presentation="dialog">
      {note ? <NoteToTaskForm key={note.id} note={note} projects={projects} onCancel={onCancel} onSubmit={onSubmit} /> : null}
    </SheetModal>
  );
}

function NoteToTaskForm({ note, projects, onCancel, onSubmit }: {
  note: Note;
  projects: readonly { id: string; name: string }[];
  onCancel: () => void;
  onSubmit: (request: NoteToTaskSubmit) => Promise<void>;
}) {
  const s = useNoteToTaskStrings();
  const { t } = useDS();
  const { height } = useWindowDimensions();
  const [initial] = useState(() => noteTaskFields(note));
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [projectId, setProjectId] = useState<string | null>(initial.projectId);
  const [deleteNote, setDeleteNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Проєкт нотатки, де людина вже не може створювати, лишається видимим
  // (як і на вебі) — інакше вибір мовчки «стрибнув» би на інший.
  const options = !initial.projectId || projects.some(p => p.id === initial.projectId)
    ? projects
    : [{ id: initial.projectId, name: s.noteProject }, ...projects];
  const titleMissing = !title.trim();

  const submit = async () => {
    if (titleMissing || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ fields: { title, description, projectId }, deleteNote });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : s.createError);
      setBusy(false);
    }
  };

  const field = { color: t.text.primary, borderColor: t.border.hairline, backgroundColor: t.surface.card };
  const projectPill = (id: string | null, label: string) => {
    const active = projectId === id;
    return (
      <Pressable
        key={id ?? '__none__'}
        testID={`note-to-task-project-${id ?? 'none'}`}
        onPress={() => setProjectId(id)}
        disabled={busy}
        accessibilityRole="radio"
        accessibilityState={{ checked: active, disabled: busy }}
        accessibilityLabel={label}
        hitSlop={{ top: 4, bottom: 4 }}
        style={[st.pill, active
          ? { backgroundColor: t.action.primary }
          : { backgroundColor: t.surface.subtle, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline }]}>
        <Text numberOfLines={1} style={[st.pillText, { color: active ? t.text.onAction : t.text.secondary }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <OverlaySurface radius={radius.card} style={{ maxHeight: height * 0.88 }} testID="note-to-task-sheet">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={st.body}>
        <View style={st.head}>
          <IconSymbol name="checklist" size={20} color={t.text.primary} />
          <Text accessibilityRole="header" style={[st.heading, { color: t.text.primary }]}>{s.convert}</Text>
        </View>
        <Text style={[st.intro, { color: t.text.secondary }]}>{s.convertIntro}</Text>

        <Text nativeID="note-to-task-title-label" style={[st.label, { color: t.text.primary }]}>{s.titleLabel} *</Text>
        <TextInput
          testID="note-to-task-title"
          accessibilityLabel={s.titleLabel}
          accessibilityLabelledBy="note-to-task-title-label"
          value={title}
          onChangeText={setTitle}
          maxLength={NOTE_TASK_TITLE_MAX}
          editable={!busy}
          placeholder={s.titlePlaceholder}
          placeholderTextColor={t.text.muted}
          returnKeyType="done"
          style={[st.input, field, titleMissing ? { borderColor: t.status.danger } : null]}
        />
        {/* Колір лише на рамці й гліфі: червоний дрібний текст не тягне AA. */}
        {titleMissing ? (
          <View accessibilityRole="alert" style={st.errorRow}>
            <IconSymbol name="exclamationmark.circle.fill" size={12} color={t.status.danger} />
            <Text style={[st.hint, st.errorText, { color: t.text.primary }]}>{s.titleRequired}</Text>
          </View>
        ) : null}

        <Text style={[st.label, { color: t.text.primary }]}>{s.descriptionLabel}</Text>
        <TextInput
          testID="note-to-task-description"
          accessibilityLabel={s.descriptionLabel}
          accessibilityHint={s.descriptionHint}
          value={description}
          onChangeText={setDescription}
          editable={!busy}
          multiline
          textAlignVertical="top"
          style={[st.input, st.textarea, field]}
        />
        <Text style={[st.hint, { color: t.text.secondary }]}>{s.descriptionHint}</Text>

        <Text style={[st.label, { color: t.text.primary }]}>{s.projectLabel}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          accessibilityRole="radiogroup" accessibilityLabel={s.projectLabel} contentContainerStyle={st.pills}>
          {projectPill(null, s.noProject)}
          {options.map(p => projectPill(p.id, p.name))}
        </ScrollView>

        {/* Уся смуга — ціль натискання (≥ 44pt), а не лише перемикач. */}
        <Pressable
          testID="note-to-task-delete"
          onPress={() => !busy && setDeleteNote(v => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: deleteNote, disabled: busy }}
          accessibilityLabel={s.deleteNote}
          accessibilityHint={deleteNote ? s.deleteNoteOn : s.deleteNoteOff}
          style={[st.deleteRow, { backgroundColor: t.surface.subtle }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[st.deleteTitle, { color: t.text.primary }]}>{s.deleteNote}</Text>
            <Text style={[st.hint, { color: t.text.secondary, paddingTop: 2 }]}>{deleteNote ? s.deleteNoteOn : s.deleteNoteOff}</Text>
          </View>
          <Switch value={deleteNote} onValueChange={setDeleteNote} disabled={busy}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        </Pressable>

        {error ? (
          <View accessibilityRole="alert" style={[st.errorRow, { paddingTop: 10 }]}>
            <IconSymbol name="exclamationmark.circle.fill" size={12} color={t.status.danger} />
            <Text style={[st.hint, st.errorText, { color: t.text.primary }]}>{error}</Text>
          </View>
        ) : null}

        <View style={st.actions}>
          <Pressable testID="note-to-task-cancel" onPress={onCancel} disabled={busy}
            accessibilityRole="button" accessibilityLabel={s.cancel} accessibilityState={{ disabled: busy }}
            style={[st.button, { backgroundColor: t.surface.subtle, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[st.buttonText, { color: t.text.primary }]}>{s.cancel}</Text>
          </Pressable>
          <Pressable testID="note-to-task-submit" onPress={() => { void submit(); }} disabled={titleMissing || busy}
            accessibilityRole="button" accessibilityLabel={busy ? s.saving : s.submit}
            accessibilityState={{ disabled: titleMissing || busy, busy }}
            style={[st.button, { backgroundColor: t.action.primary, opacity: titleMissing ? 0.45 : 1 }]}>
            {busy ? <ActivityIndicator size="small" color={t.text.onAction} /> : <IconSymbol name="checklist" size={16} color={t.text.onAction} />}
            <Text style={[st.buttonText, { color: t.text.onAction }]}>{busy ? s.saving : s.submit}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </OverlaySurface>
  );
}

const st = StyleSheet.create({
  body: { padding: 24, paddingBottom: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heading: { fontSize: 20, fontFamily: fontFamily.semibold, flexShrink: 1 },
  intro: { fontSize: 14, lineHeight: 20, paddingTop: 6, paddingBottom: 6 },
  label: { fontSize: 13, fontFamily: fontFamily.semibold, paddingTop: 16, paddingBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  textarea: { minHeight: 140, maxHeight: 260 },
  hint: { fontSize: 12, lineHeight: 16, paddingTop: 4 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  errorText: { paddingTop: 0, flexShrink: 1 },
  pills: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 16, borderRadius: radius.pill, maxWidth: 240 },
  pillText: { fontSize: 13, fontFamily: fontFamily.semibold },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.nested },
  deleteTitle: { fontSize: 15, fontFamily: fontFamily.medium },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10, paddingTop: 20 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 20, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 15, fontFamily: fontFamily.semibold },
});
