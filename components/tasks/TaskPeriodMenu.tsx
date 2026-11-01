/**
 * components/tasks/TaskPeriodMenu.tsx — фільтри головної зони «Завдань» на
 * ПЛАНШЕТІ: «Термінові» (першою) + випадний список періоду
 * Сьогодні / Завтра / Тиждень / Місяць / Всі / Без дедлайну.
 *
 * Filters v2.5 (docs/design-system-v2.md): обидва — елементи ОДНОГО ряду
 * FilterBar. Період — FilterSelect «Період: Сьогодні ⌄» (6 варіантів, з
 * лічильниками), «Термінові» — кнопка-перемикач тієї ж висоти (видимо 36pt,
 * рамка дотику 44pt — справжній розмір, не hitSlop). `TaskFilterPill` —
 * та сама pill для дій-фільтрів без меню (напр. «Дата створення» → календар).
 * Телефон цього компонента не бачить — там лишаються чипи
 * «Сьогодні · Тиждень · Всі» (+ «Без дедлайну»).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FILTER_CONTROL_H, FILTER_HIT_H, FilterSelect } from '@/components/ds/filters';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { TASK_PERIOD_ORDER, type TaskPeriod } from '@/utils/taskPeriods';

import { useTaskPeriodStrings } from './taskPeriodStrings';

const PERIOD_ICONS: Record<TaskPeriod, IconSymbolName> = {
  today: 'sun.max',
  tomorrow: 'sun.horizon.fill',
  week: 'calendar',
  month: 'calendar.circle.fill',
  all: 'list.bullet',
  undated: 'list.bullet.clipboard',
};

/**
 * Pill ряду фільтрів без меню: «Підпис: Значення» або перемикач.
 * `selected` — увімкнений перемикач (тло action.primary); `active` — фільтр
 * задано (рамка text.secondary), як у FilterSelect.
 */
export function TaskFilterPill({
  label, value, icon, selected, active, onPress, role = 'button', accessibilityLabel, accessibilityHint, testID,
}: {
  label: string;
  value?: string;
  icon?: IconSymbolName;
  selected?: boolean;
  active?: boolean;
  onPress: () => void;
  role?: 'button' | 'switch';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { t, g, rt } = useDSTheme();
  const idle = rt ? t.surface.subtle : g.surfaceSubtle;
  const fg = selected ? t.text.onAction : t.text.secondary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'switch' ? { checked: !!selected } : undefined}
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}: ${value}` : label)}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [st.hit, pressed && !selected ? { opacity: 0.7 } : null]}>
      <View
        style={[
          st.pill,
          selected
            ? { backgroundColor: t.action.primary, borderColor: t.action.primary }
            : { backgroundColor: idle, borderColor: active ? t.text.secondary : t.border.hairline },
        ]}>
        {icon ? <IconSymbol name={icon} size={14} color={fg} /> : null}
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.label, { flexShrink: 1 }]}>
          {value ? <Text style={{ color: t.text.secondary }}>{`${label}: `}</Text> : null}
          <Text style={{ color: value ? t.text.primary : selected ? t.text.onAction : t.text.secondary }}>{value ?? label}</Text>
        </Text>
      </View>
    </Pressable>
  );
}

export function UrgentFilterToggle({ value, onChange }: { value: boolean; onChange: (next: boolean) => void }) {
  const s = useTaskPeriodStrings();
  return (
    <TaskFilterPill
      testID="tasks-urgent-toggle"
      role="switch"
      label={s.urgent}
      icon="flame.fill"
      selected={value}
      onPress={() => onChange(!value)}
      accessibilityLabel={s.urgent}
      accessibilityHint={s.urgentHint}
    />
  );
}

export function TaskPeriodMenu({ value, counts, onChange }: {
  value: TaskPeriod;
  /** Скільки НЕзавершених задач у кожному пункті (taskPeriodCounts). */
  counts: Record<TaskPeriod, number>;
  onChange: (next: TaskPeriod) => void;
}) {
  const s = useTaskPeriodStrings();
  return (
    <FilterSelect<TaskPeriod>
      testID="tasks-period-trigger"
      label={s.period}
      icon={PERIOD_ICONS[value]}
      value={value}
      searchable={false}
      onChange={next => { if (next && next !== value) onChange(next); }}
      options={TASK_PERIOD_ORDER.map(period => ({
        value: period,
        label: s.periods[period],
        icon: PERIOD_ICONS[period],
        count: counts[period],
      }))}
    />
  );
}

const st = StyleSheet.create({
  hit: { height: FILTER_HIT_H, justifyContent: 'center', alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: FILTER_CONTROL_H,
    paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 13, fontFamily: fontFamily.medium },
});
