/**
 * components/tasks/PriorityFilterChips.tsx
 *
 * Мультивибір пріоритетів для фільтра списків завдань: P0…P5 + «Скинути»,
 * коли щось вибрано. Порожній вибір = без фільтра (matchesPriorityFilter).
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useI18n } from '@/store/i18n';
import {
  PRIORITY_LEVELS,
  priorityBadgeBg,
  priorityColor,
  priorityLabel,
  type PriorityLevel,
} from '@/utils/taskUtils';

export interface PriorityFilterChipsProps {
  value: readonly PriorityLevel[];
  onChange: (next: PriorityLevel[]) => void;
  colors: { text: string; sub: string; border: string; dim?: string };
}

/** Перемикання рівня у виборі; порядок завжди P0→P5. */
export function togglePriorityLevel(value: readonly PriorityLevel[], level: PriorityLevel): PriorityLevel[] {
  const set = new Set(value);
  if (set.has(level)) set.delete(level);
  else set.add(level);
  return PRIORITY_LEVELS.filter(l => set.has(l));
}

export function PriorityFilterChips({ value, onChange, colors: c }: PriorityFilterChipsProps) {
  const { tr } = useI18n();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.row}>
      {PRIORITY_LEVELS.map(level => {
        const selected = value.includes(level);
        const color = priorityColor(level) as string;
        const label = priorityLabel(level);
        return (
          <TouchableOpacity
            key={level}
            onPress={() => onChange(togglePriorityLevel(value, level))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={tr.priorityA11y.replace('{level}', label)}
            style={[
              s.chip,
              {
                borderColor: selected ? color : c.border,
                backgroundColor: selected ? (priorityBadgeBg(level) as string) : 'transparent',
              },
            ]}>
            <Text style={[s.text, { color }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChange([])}
          accessibilityRole="button"
          accessibilityLabel={tr.priorityFilterReset}
          style={[s.chip, s.reset, { borderColor: c.border, backgroundColor: c.dim ?? 'transparent' }]}>
          <Text style={[s.text, { color: c.sub, fontWeight: '600' }]}>{tr.priorityFilterReset}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chip: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reset: { borderWidth: 1 },
  text: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
