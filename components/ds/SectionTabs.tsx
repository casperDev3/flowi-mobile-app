/**
 * components/ds/SectionTabs.tsx — вкладки розділу Omni (pill-таби з іконками).
 *
 * Активна — суцільна pill action.primary (чорна; у темній — біла) з
 * text.onAction; неактивна — тиха subtle-pill з text.secondary (≥ 4.5:1).
 * Горизонтальна прокрутка, коли не вміщаються. Pill 36pt + hitSlop 4 = 44.
 * Ролі: контейнер tablist, пункт tab + selected.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type SectionTab<K extends string = string> = {
  key: K;
  label: string;
  icon?: IconSymbolName;
  count?: number;
  testID?: string;
};

export type SectionTabsProps<K extends string = string> = {
  tabs: readonly SectionTab<K>[];
  value: K;
  onChange: (key: K) => void;
  accessibilityLabel?: string;
  /** Поля прокрутки від краю до краю (як у PageHeader). */
  bleed?: number;
  style?: StyleProp<ViewStyle>;
};

export function SectionTabs<K extends string = string>({
  tabs, value, onChange, accessibilityLabel, bleed = 0, style,
}: SectionTabsProps<K>) {
  const { t, g, reduceTransparency } = useDS();
  const idle = reduceTransparency ? t.surface.subtle : g.surfaceSubtle;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[bleed ? { marginHorizontal: -bleed } : null, style]}
      contentContainerStyle={[st.row, bleed ? { paddingHorizontal: bleed } : null]}>
      {tabs.map(tab => {
        const active = tab.key === value;
        const fg = active ? t.text.onAction : t.text.secondary;
        return (
          <Pressable
            key={tab.key}
            testID={tab.testID}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.count != null ? `${tab.label}, ${tab.count}` : tab.label}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              st.pill,
              active
                ? { backgroundColor: t.action.primary }
                : { backgroundColor: idle, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline },
              pressed && !active ? { opacity: 0.7 } : null,
            ]}>
            {tab.icon ? <IconSymbol name={tab.icon} size={14} color={fg} /> : null}
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.label, { color: active ? t.text.onAction : t.text.secondary }]}>
              {tab.label}
            </Text>
            {tab.count != null ? (
              <View style={[st.count, { backgroundColor: active ? 'rgba(127,127,135,0.35)' : t.surface.card }]}>
                <Text style={[st.countText, { color: fg }]}>{tab.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 36, paddingHorizontal: 16, borderRadius: radius.pill,
  },
  label: { fontSize: 13, fontFamily: fontFamily.semibold },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
});
