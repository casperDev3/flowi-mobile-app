/**
 * components/tasks/TasksHeaderMenu.tsx — кнопка «⋯» у шапці + її меню.
 *
 * Один патерн для особистих і проєктних екранів завдань (рішення власника,
 * п. 5): у шапці видно лише створення (планшет) і цю кнопку; календар, архів,
 * вигляд, групування, фільтри — пункти меню. Пункт-перемикач (вигляд,
 * «лише мої») показує галочку й озвучується як `checked`.
 *
 * Меню — випадне вікно під кнопкою (Modal fade, BlurView), як і раніше на
 * екрані Завдань: позиція `top: верхній інсет + 62, right: 16`.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HeaderButton } from '@/components/shared/ScreenHeader';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import { useTopInset } from '@/hooks/use-top-inset';
import { useResponsive } from '@/hooks/use-responsive';

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
  return (
    <HeaderButton
      onPress={onPress}
      accessibilityLabel={label}
      style={{ backgroundColor: active ? c.accent : c.dim, borderColor: active ? c.accent : c.border }}>
      <IconSymbol name="ellipsis" size={17} color={active ? '#fff' : c.sub} />
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
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={{ flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.22)' }}
        onPress={onClose}>
        <BlurView
          intensity={isDark ? 55 : 75}
          tint={isDark ? 'dark' : 'light'}
          style={[st.menu, {
            top: topInset + 62,
            borderColor: c.border,
            maxHeight: Math.max(240, height - topInset - 96),
            ...(Platform.OS === 'android' ? { backgroundColor: isDark ? '#1C1A2E' : '#F2EFFF' } : null),
          }]}>
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
                  <View style={[st.iconBox, { backgroundColor: (item.color ?? c.sub) + '20' }]}>
                    <IconSymbol name={item.icon} size={15} color={item.color ?? c.sub} />
                  </View>
                  <Text numberOfLines={1} style={[st.label, { color: item.checked ? c.accent : c.text }]}>{item.label}</Text>
                  {item.badge ? (
                    <View style={[st.badge, { backgroundColor: (item.color ?? c.accent) + '20' }]}>
                      <Text style={{ color: item.color ?? c.accent, fontSize: 11, fontWeight: '700' }}>{item.badge}</Text>
                    </View>
                  ) : null}
                  {item.checked === undefined
                    ? <IconSymbol name="chevron.right" size={12} color={c.sub} />
                    : item.checked
                      ? <IconSymbol name="checkmark" size={14} color={c.accent} />
                      : <View style={{ width: 14 }} />}
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </BlurView>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  menu: {
    position: 'absolute',
    right: 16,
    borderRadius: Atlas.radius.xlarge,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 238,
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 14,
  },
  item: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, gap: 10 },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: Atlas.radius.small, paddingHorizontal: 7, paddingVertical: 2 },
  divider: { marginHorizontal: 14 },
});
