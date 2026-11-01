/**
 * components/tasks/TasksHeaderMenu.tsx — кнопка «⋯» у шапці + її меню.
 *
 * Один патерн для особистих і проєктних екранів завдань (рішення власника,
 * п. 5): у шапці видно лише створення (планшет) і цю кнопку; календар, архів,
 * вигляд, групування, фільтри — пункти меню. Пункт-перемикач (вигляд,
 * «лише мої») показує галочку й озвучується як `checked`.
 *
 * Меню — випадне вікно під кнопкою (Modal fade, непрозорий поповер DS v2), як і раніше на
 * екрані Завдань: позиція `top: верхній інсет + 62, right: 16`.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HeaderButton } from '@/components/shared/ScreenHeader';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useTopInset } from '@/hooks/use-top-inset';
import { useResponsive } from '@/hooks/use-responsive';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens, useDS } from '@/hooks/use-ds';
import { glassOf, glassRim } from '@/components/shared/dsTheme';
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';

export interface TasksMenuItem {
  key: string;
  icon: IconSymbolName;
  label: string;
  onPress: () => void;
  /** Колір іконки (за замовчуванням — приглушений). */
  color?: string;
  /** Перемикач: true/false — галочка й роль `checkbox`; undefined — звичайний перехід. */
  checked?: boolean;
  /** Число праворуч (напр. кількість зустрічей). */
  badge?: number;
  /** Розділювач ПЕРЕД пунктом — групує меню на смислові частини. */
  separatorBefore?: boolean;
}

export interface TasksMenuColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
}

/** Кнопка «⋯». `active` — підсвічена (є активні фільтри). */
export function TasksMenuButton({ onPress, label, active, colors: c }: {
  onPress: () => void;
  label: string;
  active?: boolean;
  colors: TasksMenuColors;
}) {
  const { t } = useDS();
  return (
    // 11.2026: проста іконка без кружка; є активні фільтри — крапка поруч.
    <HeaderButton
      onPress={onPress}
      accessibilityLabel={label}>
      <IconSymbol name="ellipsis" size={20} color={c.text} />
      {active ? <View style={{ position: 'absolute', top: 4, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: t.text.primary }} /> : null}
    </HeaderButton>
  );
}

export function TasksHeaderMenu({ visible, onClose, items, colors: c, isDark }: {
  visible: boolean;
  onClose: () => void;
  items: readonly TasksMenuItem[];
  colors: TasksMenuColors;
  isDark: boolean;
}) {
  const topInset = useTopInset();
  const { height } = useResponsive();
  const t = dsTokens(isDark);
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={{ flex: 1, backgroundColor: t.surface.overlay }}
        onPress={onClose}>
        {/* DS v2: непрозорий поповер surface.elevated + м'яка тінь, без блюру й рамки. */}
        <View
          style={[st.menu, shadow[isDark ? 'dark' : 'light'].popover, {
            top: topInset + 62,
            backgroundColor: glassOf(t).sheet, ...glassRim(t, 'strong'),
            maxHeight: Math.max(240, height - topInset - 96),
          }]}>
          {/* Layout System v2.4: «брудне скло» (блюр + зерно); тінь лишається на рамці. */}
          <OverlayMaterial isDark={isDark} radius={radius.cardCompact} />
          <ScrollView bounces={false} accessibilityRole="menu">
            {items.map((item, index) => (
              <View key={item.key}>
                {index > 0 ? (
                  <View style={[st.divider, { backgroundColor: c.border, marginVertical: item.separatorBefore ? 4 : 0, height: item.separatorBefore ? 1 : StyleSheet.hairlineWidth }]} />
                ) : null}
                <TouchableOpacity
                  onPress={() => { onClose(); item.onPress(); }}
                  accessibilityRole={item.checked === undefined ? 'menuitem' : 'checkbox'}
                  accessibilityState={item.checked === undefined ? undefined : { checked: item.checked }}
                  accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
                  style={st.item}>
                  <View style={[st.iconBox, { backgroundColor: glassOf(t).surfaceSubtle }]}>
                    <IconSymbol name={item.icon} size={16} color={item.color ?? c.sub} />
                  </View>
                  <Text numberOfLines={1} style={[st.label, { color: c.text, fontFamily: item.checked ? fontFamily.semibold : fontFamily.medium }]}>{item.label}</Text>
                  {item.badge ? (
                    <View style={[st.badge, { backgroundColor: glassOf(t).surfaceSubtle }]}>
                      <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{item.badge}</Text>
                    </View>
                  ) : null}
                  {item.checked === undefined
                    ? <IconSymbol name="chevron.right" size={12} color={c.sub} />
                    : item.checked
                      ? <IconSymbol name="checkmark" size={14} color={c.text} />
                      : <View style={{ width: 14 }} />}
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  menu: {
    position: 'absolute',
    right: 16,
    borderRadius: radius.cardCompact,
    paddingVertical: 6,
    minWidth: 238,
    maxWidth: 320,
  },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, gap: 10 },
  iconBox: { width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 15 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  divider: { marginHorizontal: 14 },
});
