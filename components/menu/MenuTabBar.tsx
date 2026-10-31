/**
 * components/menu/MenuTabBar.tsx — вкладки «Меню · Звернення · Учасники ·
 * Група» одним сегментованим перемикачем, як FinanceTabBar на «Фінансах».
 *
 * Телефон: сегменти на всю ширину. Планшет: за вмістом, ліворуч під
 * заголовком. Лічильник звернень на розгляді — пігулкою в сегменті.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useI18n } from '@/store/i18n';

import type { MenuTab } from './model';
import type { MenuColors } from './theme';
import { fontFamily } from '@/constants/theme';
import { glassRimFor } from '@/components/shared/dsTheme';

const LABELS: Record<MenuTab, string> = {
  menu: 'Меню',
  requests: 'Звернення',
  members: 'Учасники',
  settings: 'Група',
};

// 40 + 3 + 3 у межах смуги (padding 3) = 46: ціль ≥44 без виходу за bounds батька (A11Y-08).
const SEG_HIT = { top: 3, bottom: 3, left: 1, right: 1 } as const;

export function MenuTabBar({
  tabs,
  active,
  onChange,
  pending,
  c,
  stretch,
}: {
  tabs: readonly MenuTab[];
  active: MenuTab;
  onChange: (tab: MenuTab) => void;
  /** Звернень на розгляді — лічильник на «Звернення». */
  pending: number;
  c: MenuColors;
  stretch: boolean;
}) {
  const { tr } = useI18n();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={tr.menu.tabsLabel}
      style={[
        st.bar,
        { backgroundColor: c.card, ...glassRimFor(c.card, 'card') },
        stretch ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' },
      ]}>
      {tabs.map((tab) => {
        const on = tab === active;
        const count = tab === 'requests' ? pending : 0;
        const label = LABELS[tab] + (count ? ' · ' + count : '');
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            hitSlop={SEG_HIT}
            style={[st.seg, stretch && st.segStretch, on && { backgroundColor: c.primary }]}>
            <Text numberOfLines={1} style={{ color: on ? c.onPrimary : c.sub, fontSize: 13, fontFamily: fontFamily.semibold }}>
              {LABELS[tab]}
            </Text>
            {count > 0 ? (
              <View style={[st.count, { backgroundColor: on ? c.onPrimary : c.primary }]}>
                <Text style={[st.countText, { color: on ? c.primary : c.onPrimary }]}>{count > 99 ? '99+' : count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', borderRadius: 999, padding: 4, gap: 2 },
  seg: {
    flexDirection: 'row',
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  segStretch: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingHorizontal: 6 },
  count: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 11, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
});
