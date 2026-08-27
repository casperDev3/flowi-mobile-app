/**
 * components/shared/NavSidebar.tsx
 *
 * Постійна бічна навігація для широкого екрана.
 *
 * Замінює нижні таби, а не доповнює їх: два конкурентні набори навігації
 * на одному екрані змушують щоразу вирішувати, яким користуватися.
 * На вузькому екрані сайдбар не рендериться взагалі — там таби.
 */
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { NAV_GROUPS, isRouteActive } from '@/constants/nav';
import { useI18n } from '@/store/i18n';

/** Ширина підібрана під найдовшу назву українською («Планування бюджету»). */
export const SIDEBAR_WIDTH = 232;

export function NavSidebar({ pathname, isDark }: { pathname: string; isDark: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tr } = useI18n();

  const c = {
    bg:       isDark ? '#0E0C1A' : '#F4F0FF',
    border:   isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,58,237,0.14)',
    text:     isDark ? '#F0EEFF' : '#1A1433',
    sub:      isDark ? 'rgba(240,238,255,0.55)' : 'rgba(26,20,51,0.52)',
    accent:   isDark ? '#A78BFA' : '#7C3AED',
    activeBg: isDark ? 'rgba(167,139,250,0.14)' : 'rgba(124,58,237,0.10)',
  };

  return (
    <View
      style={[st.root, { width: SIDEBAR_WIDTH, backgroundColor: c.bg, borderRightColor: c.border, paddingTop: insets.top + 14 }]}
      accessibilityRole="menu">
      <Text style={[st.brand, { color: c.accent }]}>Flowi</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        {NAV_GROUPS.map((group, gi) => (
          <View key={gi} style={{ marginBottom: 14 }}>
            {group.titleKey && (
              <Text style={[st.groupTitle, { color: c.sub }]}>
                {String(tr[group.titleKey]).toUpperCase()}
              </Text>
            )}

            {group.items.map(item => {
              const active = isRouteActive(item.route, pathname);
              return (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => router.push(item.route as never)}
                  activeOpacity={0.7}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  style={[st.row, active && { backgroundColor: c.activeBg }]}>
                  <IconSymbol name={item.icon} size={19} color={active ? c.accent : c.sub} />
                  <Text
                    numberOfLines={1}
                    style={[st.label, { color: active ? c.accent : c.text, fontWeight: active ? '700' : '500' }]}>
                    {String(tr[item.labelKey])}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  root:       { borderRightWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10 },
  brand:      { fontSize: 20, fontWeight: '800', paddingHorizontal: 10, marginBottom: 18 },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 10, marginBottom: 6 },
  // 44 — мінімальний тач-таргет за HIG; на планшеті промахуються частіше,
  // бо палець тягнеться через увесь екран.
  row:        { flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44, paddingHorizontal: 10, borderRadius: 10 },
  label:      { fontSize: 14, flex: 1 },
});
