/**
 * components/tasks/PriorityFilterChips.tsx
 *
 * Мультивибір пріоритетів для фільтра списків завдань: P0…P5 + «Скинути»,
 * коли щось вибрано. Порожній вибір = без фільтра (matchesPriorityFilter).
 *
 * `PriorityFilterSelect` — той самий мультивибір для ряду FilterBar на
 * планшеті (Filters v2.5): «Пріоритет: Усі ⌄» з чекбоксами P0…P5.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { FilterSelect } from '@/components/ds/filters';
import { useI18n } from '@/store/i18n';
import {
  PRIORITY_LEVELS,
  priorityBadgeBg,
  priorityColor,
  priorityLabel,
  type PriorityLevel,
} from '@/utils/taskUtils';
import { fontFamily, radius } from '@/constants/theme';

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
                // DS v2: pill; невибраний — subtle-тло без рамки, вибраний — колір пріоритету.
                borderColor: selected ? color : 'transparent',
                backgroundColor: selected ? (priorityBadgeBg(level) as string) : (c.dim ?? 'transparent'),
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
          style={[s.chip, s.reset, { borderColor: 'transparent', backgroundColor: c.dim ?? 'transparent' }]}>
          <Text style={[s.text, { color: c.sub, fontFamily: fontFamily.semibold }]}>{tr.priorityFilterReset}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/** Планшет: мультивибір пріоритету в ряду FilterBar. */
export function PriorityFilterSelect({ value, onChange, testID }: {
  value: readonly PriorityLevel[];
  onChange: (next: PriorityLevel[]) => void;
  testID?: string;
}) {
  const { tr } = useI18n();
  return (
    // FilterSelect працює з рядковими значеннями — рівень як рядок «0»…«5».
    <FilterSelect<string>
      testID={testID}
      label={tr.priority}
      multiple
      value={value.map(String)}
      searchable={false}
      resetLabel={tr.priorityFilterReset}
      // Порядок завжди P0→P5, як у togglePriorityLevel.
      onChange={next => onChange(PRIORITY_LEVELS.filter(l => next.includes(String(l))))}
      options={PRIORITY_LEVELS.map(level => ({
        value: String(level),
        label: priorityLabel(level),
        color: priorityColor(level) as string,
      }))}
    />
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  chip: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reset: { borderWidth: 1 },
  text: { fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
});
