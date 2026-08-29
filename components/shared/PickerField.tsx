/**
 * components/shared/PickerField.tsx — поле вибору одного зі списку.
 *
 * Один компонент замість двох різних способів вибирати, які були в деталі
 * завдання поруч: статус — розсипом чипів, проєкт — інлайн-списком, що
 * розсовував вміст. Обидва мали ту саму ваду: список рос разом із кількістю
 * варіантів, і при десятку статусів чипи займали пів екрана, а список
 * витісняв підзавдання за межу видимого.
 *
 * Вибір відкривається аркушем, а не розкривається на місці. Це не стильова
 * примха: аркуш не рухає те, на що людина дивиться, має власну висоту під
 * довгий список і однаково поводиться в колонці деталі завширшки 380pt на
 * планшеті та на весь екран телефона.
 *
 * Пошук зʼявляється лише коли варіантів справді багато (SEARCH_THRESHOLD).
 * Поле пошуку над трьома рядками — це зайвий елемент і зайвий фокус
 * клавіатури там, де все видно й так.
 */
import { BlurView } from 'expo-blur';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { haptic } from '@/utils/haptics';

/** Понад стільки варіантів — показуємо пошук. */
export const SEARCH_THRESHOLD = 5;

export interface PickerOption {
  id: string;
  label: string;
  /** Кольорова крапка перед назвою. Без неї крапки просто немає. */
  color?: string;
}

export interface PickerFieldColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
  sheet: string;
}

export interface PickerFieldProps {
  /** Підпис над полем, уже великими літерами не робимо — стиль зробить сам. */
  label: string;
  icon?: IconSymbolName;
  options: PickerOption[];
  /** id обраного. null — нічого не обрано. */
  value: string | null;
  onSelect: (id: string | null) => void;
  /**
   * Дозволити «нічого». Для проєкту це «Без проєкту», для статусу — ні:
   * завдання завжди десь на дошці лежить.
   */
  emptyOption?: { label: string };
  colors: PickerFieldColors;
  isDark: boolean;
  tr: Translations;
}

export function PickerField({
  label, icon, options, value, onSelect, emptyOption, colors: c, isDark, tr,
}: PickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();

  const selected = options.find(option => option.id === value) ?? null;
  const withSearch = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(option => option.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const choose = (id: string | null) => {
    haptic.light();
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={{ marginTop: 12 }}>
      <View style={st.labelRow}>
        {icon ? <IconSymbol name={icon} size={12} color={c.sub} /> : null}
        <Text style={[st.label, { color: c.sub, marginLeft: icon ? 5 : 0 }]}>{label}</Text>
      </View>

      {/* 44pt — мінімальний тач-таргет за HIG. Попередній чип на 36pt
          промахувався саме на планшеті, де палець іде через увесь екран. */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? emptyOption?.label ?? ''}`}
        style={[st.trigger, { backgroundColor: c.dim, borderColor: open ? c.accent : c.border }]}>
        {selected?.color ? <View style={[st.dot, { backgroundColor: selected.color }]} /> : null}
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: '600',
            color: selected ? (selected.color ?? c.text) : c.sub,
          }}>
          {selected?.label ?? emptyOption?.label ?? ''}
        </Text>
        <IconSymbol name="chevron.down" size={14} color={c.sub} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setOpen(false)}>
        <Pressable
          style={[st.backdrop, { backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.25)' }]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
        />
        <View
          style={[
            st.sheet,
            { backgroundColor: c.sheet, paddingBottom: insets.bottom + 14 },
            // На планшеті аркуш на всю ширину дав би рядки завдовжки з екран.
            isWide && { maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
          ]}>
          <View style={[st.handle, { backgroundColor: c.border }]} />
          <Text style={[st.sheetTitle, { color: c.text }]}>{label}</Text>

          {withSearch && (
            <TextInput
              placeholder={tr.pickerSearch}
              placeholderTextColor={c.sub}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              style={[st.search, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]}
            />
          )}

          <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 10 }}>
            {emptyOption && !query.trim() && (
              <Row
                label={emptyOption.label}
                active={value === null}
                colors={c}
                isDark={isDark}
                onPress={() => choose(null)}
              />
            )}

            {visible.map(option => (
              <Row
                key={option.id}
                label={option.label}
                color={option.color}
                active={option.id === value}
                colors={c}
                isDark={isDark}
                onPress={() => choose(option.id)}
              />
            ))}

            {visible.length === 0 && (
              <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>
                {tr.pickerNothingFound}
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, color, active, colors: c, isDark, onPress }: {
  label: string;
  color?: string;
  active: boolean;
  colors: PickerFieldColors;
  isDark: boolean;
  onPress: () => void;
}) {
  const accent = color ?? c.accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={st.rowWrap}>
      <BlurView
        intensity={isDark ? 16 : 32}
        tint={isDark ? 'dark' : 'light'}
        style={[st.row, {
          borderColor: active ? accent : c.border,
          backgroundColor: active ? accent + '14' : 'transparent',
        }]}>
        {color ? <View style={[st.dot, { backgroundColor: color }]} /> : null}
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 14, fontWeight: active ? '700' : '500', color: active ? accent : c.text }}>
          {label}
        </Text>
        {/* Галочка, а не лише колір: вибраний стан не має триматись
            виключно на кольорі. */}
        {active && <IconSymbol name="checkmark" size={14} color={accent} />}
      </BlurView>
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  labelRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  label:      { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  trigger:    { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, gap: 9 },
  dot:        { width: 10, height: 10, borderRadius: 5 },
  backdrop:   { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '76%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle:     { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  search:     { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  rowWrap:    { marginBottom: 7 },
  row:        { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, gap: 9, overflow: 'hidden' },
});
