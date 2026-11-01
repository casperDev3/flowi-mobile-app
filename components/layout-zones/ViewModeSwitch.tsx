/**
 * components/layout-zones/ViewModeSwitch.tsx — перемикач «Список / Колонки»
 * (Layout System v2.4).
 *
 * Сегментований pill-перемикач: активний сегмент — чорна pill action.primary
 * + text.onAction («ви тут», як SectionTabs і таб-бар). Де стоїть:
 *   • планшет — у тонкій смузі шапки (AppHeader `viewSwitch`);
 *   • телефон — унизу шухляди сайдбара (SidebarDrawer) для розділу в фокусі.
 * Ролі: radiogroup / radio + checked. Ціль дотику — 44pt (сегмент 36 + hitSlop).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { fontFamily, radius } from '@/constants/theme';
import type { ZoneView } from '@/hooks/use-zone-state';

import { useZoneStrings } from './strings';

export function ViewModeSwitch({ value, onChange, compact, fullWidth, style, testID }: {
  value: ZoneView;
  onChange: (v: ZoneView) => void;
  /** Лише іконки (вузька смуга шапки). Підпис лишається для озвучення. */
  compact?: boolean;
  /** Розтягнути на всю ширину (низ шухляди). */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t, rt } = useDSTheme();
  const s = useZoneStrings();
  const items: { key: ZoneView; label: string; icon: 'list.bullet' | 'rectangle.3.group' }[] = [
    { key: 'list', label: s.viewList, icon: 'list.bullet' },
    { key: 'columns', label: s.viewColumns, icon: 'rectangle.3.group' },
  ];
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={s.viewSwitch}
      style={[
        st.track,
        { backgroundColor: rt ? t.surface.card : t.surface.subtle, borderColor: t.border.hairline },
        fullWidth ? { alignSelf: 'stretch' } : null,
        style,
      ]}>
      {items.map(it => {
        const on = it.key === value;
        const fg = on ? t.text.onAction : t.text.secondary;
        return (
          <Pressable
            key={it.key}
            testID={testID ? `${testID}-${it.key}` : undefined}
            onPress={() => { if (!on) onChange(it.key); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on, selected: on }}
            accessibilityLabel={it.label}
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              st.seg,
              fullWidth ? { flex: 1 } : null,
              on ? { backgroundColor: t.action.primary } : null,
              pressed && !on ? { opacity: 0.7 } : null,
            ]}>
            <IconSymbol name={it.icon} size={14} color={fg} />
            {compact ? null : (
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[st.label, { color: fg }]}>{it.label}</Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  track: {
    flexDirection: 'row', alignItems: 'center', gap: 2, padding: 2,
    borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, alignSelf: 'flex-start',
  },
  seg: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 36, minWidth: 44, paddingHorizontal: 12, borderRadius: radius.pill,
  },
  label: { fontSize: 13, fontFamily: fontFamily.semibold },
});
