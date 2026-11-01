/**
 * components/ds/Tag.tsx — пастельна мітка (Omni: «Wireframe Design»,
 * «UI Design») і прапорець пріоритету.
 *
 * Tag: тонована змивка акценту (tint) + текст ink (≥ 4.4:1 на склі/білому).
 * «Зменшити прозорість» — суцільна заливка solid + onSolid.
 * PriorityFlag: High — coral, Medium — amber, Low — text.secondary;
 * підпис передає екран (уже перекладений).
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useResolvedAccent } from '@/components/ds/AccentContext';
import { fontFamily, radius, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type TagProps = {
  label: string;
  accent?: GlassAccent;
  /** sm — у щільних картках канбану; md — за замовч. */
  size?: 'sm' | 'md';
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function Tag({ label, accent, size = 'md', testID, style }: TagProps) {
  const { g, reduceTransparency } = useDS();
  const a = g.accent[useResolvedAccent(accent)];
  return (
    <View
      testID={testID}
      style={[
        st.tag,
        size === 'sm' ? st.tagSm : null,
        { backgroundColor: reduceTransparency ? a.solid : a.tint },
        style,
      ]}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.6}
        style={[st.tagText, size === 'sm' ? st.tagTextSm : null, { color: reduceTransparency ? a.onSolid : a.ink }]}>
        {label}
      </Text>
    </View>
  );
}

export type Priority = 'high' | 'medium' | 'low';

export type PriorityFlagProps = {
  priority: Priority;
  /** Перекладений підпис («Високий»). Без нього — лише прапорець з a11y-підписом. */
  label?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function PriorityFlag({ priority, label, accessibilityLabel, style }: PriorityFlagProps) {
  const { t, g } = useDS();
  const color = priority === 'high' ? g.accent.coral.ink : priority === 'medium' ? g.accent.amber.ink : t.text.secondary;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[st.flag, style]}>
      <IconSymbol name="flag.fill" size={12} color={color} />
      {label ? <Text style={[st.flagText, { color }]} numberOfLines={1}>{label}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  tagSm: { paddingHorizontal: 10, paddingVertical: 3 },
  tagText: { fontSize: 13, lineHeight: 17, fontFamily: fontFamily.medium },
  tagTextSm: { fontSize: 12, lineHeight: 16 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  flagText: { fontSize: 13, fontFamily: fontFamily.medium },
});
