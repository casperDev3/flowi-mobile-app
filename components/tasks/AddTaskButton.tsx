import { Atlas } from '@/constants/atlas';
/**
 * components/tasks/AddTaskButton.tsx — ЄДИНА кнопка «додати завдання» екрана.
 *
 * Рішення власника (п. 3): жодних «+» у кожній групі/колонці й інлайн-полів —
 * одна головна дія на екран. Де саме вона стоїть, залежить від ширини:
 *
 *   телефон (compact)    — FAB у правому нижньому куті (палець, одна рука)
 *   планшет/веб (wide)   — підписана кнопка в шапці екрана: FAB над
 *                          двоколонковою розкладкою перекривав би картку
 *                          праворуч, а в шапці її видно одразу.
 *
 * Обидва варіанти — ціль ≥44pt і мають підпис для VoiceOver.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/shared/PressableScale';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { haptic } from '@/utils/haptics';

/** Підписана кнопка для шапки (планшет/веб). */
export function AddTaskHeaderButton({
  label, onPress, color,
}: {
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => { haptic.light(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      // 40 намальовано + 4 згори й знизу = 44 (шапка вища за кнопку, тож
      // hitSlop тут не впирається в межі предка — A11Y-08).
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={[st.header, { backgroundColor: color }]}>
      <IconSymbol name="plus" size={15} color="#fff" />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={st.headerLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Розмір FAB і його відступ над таб-баром (bottom = tabBarInset + FAB_GAP). */
export const FAB_SIZE = 52;
export const FAB_GAP = 20;
/**
 * Нижній відступ списку під FAB (додається до tabBarInset): кнопка + відступ
 * + 40pt запасу. Бейдж пріоритету картки стоїть у правому нижньому куті —
 * рівно там, де FAB, — і з меншим запасом останній P# ховався під «+».
 */
export const FAB_LIST_CLEARANCE = FAB_SIZE + FAB_GAP + 40;

/** Плаваюча кнопка (телефон). `bottom` — над таб-баром/нижнім краєм екрана. */
export function AddTaskFab({
  label, onPress, color, bottom, style,
}: {
  label: string;
  onPress: () => void;
  color: string;
  bottom: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      onPress={() => { haptic.medium(); onPress(); }}
      scaleTo={0.92}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.fab, { bottom, backgroundColor: color }, style]}>
      <IconSymbol name="plus" size={26} color="#fff" />
    </PressableScale>
  );
}

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 40, paddingHorizontal: 14, borderRadius: Atlas.radius.medium,
  },
  headerLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 20, width: FAB_SIZE, height: FAB_SIZE, borderRadius: Atlas.radius.large,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
});
