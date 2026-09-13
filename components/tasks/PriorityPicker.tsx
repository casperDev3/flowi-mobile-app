/**
 * components/tasks/PriorityPicker.tsx
 *
 * Вибір пріоритету у формах завдання: сім чипів «—» (без пріоритету), P0…P5.
 * Одиничний вибір; стан живе згори (value/onChange).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/store/i18n';
import {
  PRIORITY_LEVELS,
  priorityBadgeBg,
  priorityColor,
  priorityLabel,
  type TaskPriority,
} from '@/utils/taskUtils';

export interface PriorityPickerProps {
  value: TaskPriority;
  onChange: (level: TaskPriority) => void;
  colors: { text: string; sub: string; border: string; dim?: string };
}

export function PriorityPicker({ value, onChange, colors: c }: PriorityPickerProps) {
  const { tr } = useI18n();
  const options: TaskPriority[] = [null, ...PRIORITY_LEVELS];
  return (
    <View style={s.row} accessibilityRole="radiogroup" accessibilityLabel={tr.priority}>
      {options.map(level => {
        const selected = value === level;
        const color = priorityColor(level) ?? c.sub;
        const label = level === null ? '—' : priorityLabel(level);
        return (
          <TouchableOpacity
            key={level === null ? 'none' : level}
            onPress={() => onChange(level)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={level === null ? tr.priorityNone : tr.priorityA11y.replace('{level}', label)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              s.chip,
              {
                borderColor: selected ? color : c.border,
                backgroundColor: selected ? (priorityBadgeBg(level) ?? (c.dim ?? c.border)) : 'transparent',
              },
            ]}>
            <Text style={[s.text, { color: selected ? color : (level === null ? c.sub : color) }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  chip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
