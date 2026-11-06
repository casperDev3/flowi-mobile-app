/**
 * components/clients/ClientChips.tsx — вибір клієнта рядком чипів.
 *
 * Чипи, а не PickerField: поле живе всередині форм, що самі є модалками, а
 * друга модалка поверх першої на iOS показується ненадійно (той самий вибір,
 * що й у полі «Проєкт» форми зустрічі).
 *
 * `lockedId` — клієнт, виведений із проєкту: чипи тоді лише показують його,
 * вибору немає (зустріч і нотатка проєкту беруть клієнта з проєкту, власного
 * clientId у потоці проєкту сервер не зберігає).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { fontFamily, radius } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { useI18n } from '@/store/i18n';
import { pickableClients, type Client } from '@/utils/clients';

export interface ClientChipsProps {
  clients: readonly Client[];
  value: string | null | undefined;
  onChange: (clientId: string | null) => void;
  isDark: boolean;
  /** Клієнт іде з проєкту — показати його без вибору. */
  lockedId?: string | null;
  /** Підпис над чипами; null — без підпису. */
  label?: string | null;
  /** Підказка під чипами. */
  hint?: string;
  disabled?: boolean;
  testID?: string;
}

export function ClientChips({
  clients, value, onChange, isDark, lockedId, label, hint, disabled, testID,
}: ClientChipsProps) {
  const { tr } = useI18n();
  const t = dsTokens(isDark);
  const locked = lockedId !== undefined;
  const current = locked ? lockedId ?? null : value ?? null;
  const options = locked
    ? clients.filter(c => c.id === current)
    : pickableClients(clients, current);
  const known = !!current && clients.some(c => c.id === current);
  const title = label === undefined ? tr.clientsUi.field : label;

  const chip = (id: string | null, name: string, color: string | null) => {
    const on = id ? id === current : !known;
    return (
      <TouchableOpacity
        key={id ?? '__none'}
        disabled={disabled || locked}
        onPress={() => onChange(id)}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: disabled || locked }}
        accessibilityLabel={`${tr.clientsUi.field}: ${name}`}
        testID={testID ? `${testID}-${id ?? 'none'}` : undefined}
        style={[st.chip, {
          backgroundColor: on ? (color ?? t.text.secondary) + '22' : t.surface.subtle,
          borderColor: on ? (color ?? t.text.secondary) : 'transparent',
          opacity: disabled ? 0.5 : 1,
        }]}>
        {color ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
        <Text numberOfLines={1} style={[st.text, { color: on ? t.text.primary : t.text.secondary }]}>{name}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View testID={testID}>
      {title ? <Text style={[st.label, { color: t.text.secondary }]}>{title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={st.row}>
          {locked
            ? (options.length ? options.map(c => chip(c.id, c.name, c.color)) : chip(null, tr.clientsUi.none, null))
            : [chip(null, tr.clientsUi.none, null), ...options.map(c => chip(c.id, c.name, c.color))]}
        </View>
      </ScrollView>
      {hint ? <Text style={[st.hint, { color: t.text.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, borderWidth: 1,
    minHeight: 36, paddingHorizontal: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontFamily: fontFamily.semibold, maxWidth: 160 },
  hint: { fontSize: 11, fontFamily: fontFamily.regular, marginTop: 6 },
});
