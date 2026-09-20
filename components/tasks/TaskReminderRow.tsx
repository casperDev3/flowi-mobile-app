/**
 * components/tasks/TaskReminderRow.tsx
 *
 * Значок нагадування й форма його задання, що розкривається під ним.
 *
 * Форма — не модалка навмисно: у деталі завдання вона вже всередині
 * модального листа, а вкладена модалка на iOS підвішує обидві.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { ReminderDraft } from '@/utils/reminderTime';

const ACCENT = '#F59E0B';

export interface TaskReminderRowProps {
  /** Момент нагадування, якщо воно задане. */
  reminderAt?: string;
  open: boolean;
  draft: ReminderDraft;
  onToggleOpen: () => void;
  onChangeDraft: (part: Partial<ReminderDraft>) => void;
  onSave: () => void;
  onRemove: () => void;
  onCancel: () => void;
  colors: { text: string; sub: string; border: string; dim: string };
  tr: Translations;
  locale: string;
}

export function TaskReminderRow({
  reminderAt, open, draft, onToggleOpen, onChangeDraft, onSave, onRemove, onCancel,
  colors: c, tr, locale,
}: TaskReminderRowProps) {
  const presets = [
    { label: tr.dateToday,    days: 0 },
    { label: tr.dateTomorrow, days: 1 },
    { label: tr.datePlus2,    days: 2 },
    { label: tr.datePlus7,    days: 7 },
  ];

  return (
    <View style={{ marginTop: 7 }}>
      <TouchableOpacity
        onPress={onToggleOpen}
        accessibilityRole="button"
        style={[st.badge, {
          backgroundColor: reminderAt ? ACCENT + '20' : c.dim,
          borderColor: reminderAt ? ACCENT + '50' : c.border,
          alignSelf: 'flex-start',
        }]}>
        <IconSymbol name="bell" size={11} color={reminderAt ? ACCENT : c.sub} />
        <Text style={{ color: reminderAt ? ACCENT : c.sub, fontSize: 11, fontWeight: '600', marginLeft: 4 }}>
          {reminderAt
            ? `${tr.reminderAtLabel}: ${new Date(reminderAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
            : tr.reminderDate}
        </Text>
        {reminderAt && (
          <TouchableOpacity
            onPress={e => { e.stopPropagation(); onRemove(); }}
            accessibilityRole="button"
            accessibilityLabel={tr.delete}
            style={{ marginLeft: 6 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconSymbol name="xmark" size={10} color={ACCENT} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {open && (
        <View style={[st.box, { borderColor: c.border, backgroundColor: c.dim }]}>
          <Text style={[st.caption, { color: c.sub }]}>{tr.reminderDate}</Text>
          {/* keyboardShouldPersistTaps: поля годин/хвилин цієї ж форми тримають
              клавіатуру відкритою, а дефолтне 'never' витрачає перший тап по
              чипу на її ховання — вибір дня не застосовувався (CLAUDE.md,
              «Horizontal ScrollView with tappable children»). */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 7 }}>
              {presets.map(preset => {
                const day = new Date();
                day.setDate(day.getDate() + preset.days);
                const selected = !!draft.date && new Date(draft.date).toDateString() === day.toDateString();
                return (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      // День береться з пресета, час — з полів: інакше вибір
                      // «завтра» мовчки скинув би вже введену годину.
                      const next = new Date(day);
                      next.setHours(parseInt(draft.hours || '0', 10), parseInt(draft.mins || '0', 10), 0, 0);
                      onChangeDraft({ date: next.toISOString() });
                    }}
                    style={[st.chip, { backgroundColor: selected ? ACCENT : c.dim, borderColor: selected ? ACCENT : c.border }]}>
                    <Text style={{ color: selected ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>{preset.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <Text style={[st.caption, { color: c.sub }]}>{tr.timeLabel}</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <TextInput
              value={draft.hours}
              onChangeText={v => onChangeDraft({ hours: v.replace(/\D/g, '').slice(0, 2) })}
              keyboardType="number-pad"
              placeholder={tr.hoursShort}
              placeholderTextColor={c.sub}
              style={[st.input, { backgroundColor: c.dim, color: c.text }]}
            />
            <Text style={{ color: c.sub, fontSize: 18, fontWeight: '700' }}>:</Text>
            <TextInput
              value={draft.mins}
              onChangeText={v => onChangeDraft({ mins: v.replace(/\D/g, '').slice(0, 2) })}
              keyboardType="number-pad"
              placeholder={tr.minutesShort}
              placeholderTextColor={c.sub}
              style={[st.input, { backgroundColor: c.dim, color: c.text }]}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={onCancel} style={[st.btn, { flex: 1, backgroundColor: c.dim }]}>
              <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} style={[st.btn, { flex: 2, backgroundColor: ACCENT }]}>
              <IconSymbol name="bell" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>{tr.setReminder}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  badge:   { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  box:     { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 8 },
  caption: { fontSize: 11, fontWeight: '600', marginBottom: 8 },
  chip:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  input:   { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500', flex: 1, textAlign: 'center' },
  btn:     { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
