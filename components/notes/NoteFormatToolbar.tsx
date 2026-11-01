/**
 * components/notes/NoteFormatToolbar.tsx — панель форматування нотатки.
 *
 * Розмітка лишається форматом зберігання: кнопки не вмикають «стилі», а
 * дописують у ТЕКСТ ті самі маркери, що людина набрала б руками (`- [ ] `,
 * `- `, `# `, `**…**`, `#`). Самі правила — у спільному блоці utils/notes.ts
 * (`toggleLineFormat`, `wrapSelection`), однакові з вебом.
 *
 * iOS — над клавіатурою через InputAccessoryView (`NOTE_TOOLBAR_ID`, поле
 * підключається `inputAccessoryViewID`). Android/веб — редактор ставить ту
 * саму панель у свій низ (Android підіймає її разом із клавіатурою,
 * adjustResize) або вгору (веб).
 */
import React from 'react';
import { InputAccessoryView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily } from '@/constants/theme';
import { Atlas } from '@/constants/atlas';
import { useI18n } from '@/store/i18n';

import type { NotesPalette } from './notesTheme';

export const NOTE_TOOLBAR_ID = 'notes-format-toolbar';

export type NoteToolbarAction = 'todo' | 'bullet' | 'heading' | 'bold' | 'tag' | 'attach' | 'task' | 'meeting' | 'dismiss';

export function NoteFormatToolbar({ colors: c, onAction, canAttach = true, canConvert = true, showDismiss = true }: {
  colors: NotesPalette;
  onAction: (action: NoteToolbarAction) => void;
  canAttach?: boolean;
  canConvert?: boolean;
  showDismiss?: boolean;
}) {
  const { tr } = useI18n();
  const icon = (action: NoteToolbarAction, name: string, label: string, disabled = false) => (
    <TouchableOpacity key={action} testID={`notes-fmt-${action}`} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => onAction(action)}
      style={[s.icon, { opacity: disabled ? 0.4 : 1 }]}>
      <IconSymbol name={name} size={20} color={c.text} />
    </TouchableOpacity>
  );
  const chip = (action: NoteToolbarAction, label: string) => (
    <TouchableOpacity key={action} testID={`notes-fmt-${action}`} accessibilityRole="button" accessibilityLabel={label}
      hitSlop={{ top: 3, bottom: 3 }} onPress={() => onAction(action)} style={[s.chip, { backgroundColor: c.subtle }]}>
      <Text style={{ color: c.text, fontFamily: fontFamily.semibold, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View testID="notes-format-toolbar" style={[s.bar, { backgroundColor: c.panel, borderTopColor: c.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
        contentContainerStyle={s.row}>
        {icon('todo', 'checkmark.square', tr.notesFormatChecklist)}
        {icon('bullet', 'list.bullet', tr.notesFormatBullet)}
        {icon('heading', 'textformat.size', tr.notesFormatHeading)}
        {icon('bold', 'bold', tr.notesFormatBold)}
        {icon('tag', 'number', tr.notesFormatTag)}
        {icon('attach', 'paperclip', tr.notesAttach, !canAttach)}
        {canConvert && chip('task', tr.notesToTask)}
        {canConvert && chip('meeting', tr.notesToMeeting)}
      </ScrollView>
      {showDismiss && (
        <TouchableOpacity testID="notes-fmt-dismiss" accessibilityRole="button" accessibilityLabel={tr.notesFormatDone}
          onPress={() => onAction('dismiss')} style={s.icon}>
          <IconSymbol name="keyboard.chevron.compact.down" size={20} color={c.sub} />
        </TouchableOpacity>
      )}
    </View>
  );
}

/** iOS: панель над клавіатурою. На інших платформах нічого не малює. */
export function NoteFormatAccessory(props: React.ComponentProps<typeof NoteFormatToolbar>) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={NOTE_TOOLBAR_ID}>
      <NoteFormatToolbar {...props} />
    </InputAccessoryView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 8 },
  icon: { minWidth: Atlas.controlHeight, minHeight: Atlas.controlHeight, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: Atlas.controlHeight - 6, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', marginHorizontal: 4 },
});
