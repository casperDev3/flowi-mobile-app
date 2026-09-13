/**
 * components/tasks/PriorityBadge.tsx
 *
 * Бейдж пріоритету P0…P5 (CONTRACT §B.5): заокруглений квадрат із міткою в
 * кольорі пріоритету на ~15% фоні того ж кольору. Замінює кольорову крапку /
 * смужку всюди, де раніше показували пріоритет. «Без пріоритету» — нічого.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/store/i18n';
import {
  isPriorityLevel,
  priorityBadgeBg,
  priorityColor,
  priorityLabel,
  type TaskPriority,
} from '@/utils/taskUtils';

export interface PriorityBadgeProps {
  level: TaskPriority | undefined;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function PriorityBadge({ level, size = 'sm', style }: PriorityBadgeProps) {
  const { tr } = useI18n();
  if (!isPriorityLevel(level)) return null;
  const color = priorityColor(level) as string;
  const bg = priorityBadgeBg(level) as string;
  const label = priorityLabel(level);
  const md = size === 'md';
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={tr.priorityA11y.replace('{level}', label)}
      style={[s.badge, { height: md ? 22 : 18, backgroundColor: bg }, style]}>
      <Text style={[s.text, { color, fontSize: md ? 12 : 11 }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  text: {
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});
