/**
 * components/ds/SectionHeader.tsx — заголовок секції з акцентною крапкою.
 * Крапка — accent.fill (≥ 3:1), текст — text.primary; праворуч — необов'язкова дія.
 */
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useResolvedAccent } from '@/components/ds/AccentContext';
import { space, type, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type SectionHeaderProps = {
  title: string;
  accent?: GlassAccent;
  /** Підпис дії праворуч («Усі», «Додати»). */
  actionLabel?: string;
  onAction?: () => void;
  actionTestID?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({ title, accent, actionLabel, onAction, actionTestID, testID, style }: SectionHeaderProps) {
  const { t, g } = useDS();
  const a = g.accent[useResolvedAccent(accent)];
  return (
    <View testID={testID} style={[{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 32 }, style]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: a.fill }} />
      <Text accessibilityRole="header" style={[type.h2, { color: t.text.primary, flex: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          testID={actionTestID}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text style={[type.label, { fontSize: 13, color: a.ink }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
