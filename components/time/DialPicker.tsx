/**
 * components/time/DialPicker.tsx — вибір циферблата.
 *
 * Кожен варіант показаний ЖИВИМ, а не назвою й іконкою: різниця між «Орбітою»
 * і «Дугою» словами не переказується, а вибирати доводиться саме за виглядом.
 * Усі передпогляди йдуть від одного startedAt і одного спільного тікера, тож
 * вони рухаються синхронно й порівнюються чесно.
 *
 * Передпогляд навмисно показує ЧАС ІЗ ХВИЛИНАМИ, а не нуль: циферблат із
 * порожньою дугою й «00:00» не дає зрозуміти, як він виглядатиме в роботі.
 */
import { BlurView } from 'expo-blur';
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimerDial } from '@/components/time/dials/TimerDial';
import { CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { DIALS, type DialId } from '@/utils/timerDials';

/** Скільки «пройшло» на передпогляді: 23 хвилини 41 секунда. */
const PREVIEW_SECONDS = 23 * 60 + 41;
const PREVIEW_SIZE = 96;

export interface DialPickerColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
  sheet: string;
}

export interface DialPickerProps {
  visible: boolean;
  dial: DialId;
  /** Назва таймера, якому обирають циферблат: вибір персональний, і аркуш
   *  мусить казати, для кого саме він відкритий. */
  timerLabel: string;
  onSelect: (id: DialId) => void;
  onClose: () => void;
  colors: DialPickerColors;
  isDark: boolean;
  tr: Translations;
}

export function DialPicker({ visible, dial, timerLabel, onSelect, onClose, colors: c, isDark, tr }: DialPickerProps) {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();

  // На планшеті аркуш на всю ширину дав би дві колонки по ~590pt під передпогляд
  // у 96pt — колонок стає більше, а сам аркуш звужується до читабельної смуги.
  const columns = isWide ? 4 : 2;
  const cellWidth = `${(100 - (columns - 1) * 2.5) / columns}%` as const;

  // Мітка старту фіксована на час життя аркуша: якби вона бралася від
  // Date.now() на кожному рендері, передпогляди скидалися б у нуль щосекунди.
  const startedAt = useMemo(
    () => new Date(Date.now() - PREVIEW_SECONDS * 1000).toISOString(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityRole="button" />

      <View
        style={[
          st.sheet,
          { backgroundColor: c.sheet, paddingBottom: insets.bottom + 16 },
          isWide && { maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
        ]}>
        <View style={[st.handle, { backgroundColor: c.border }]} />

        <View style={st.head}>
          <View style={{ flex: 1 }}>
            <Text style={[st.title, { color: c.text }]}>{tr.dialPicker}</Text>
            {timerLabel ? (
              <Text numberOfLines={1} style={[st.subtitle, { color: c.sub }]}>{timerLabel}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={tr.close}
            hitSlop={10}>
            <IconSymbol name="xmark" size={16} color={c.sub} />
          </Pressable>
        </View>

        <ScrollView
          horizontal={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={st.grid}>
          {DIALS.map(meta => {
            const active = meta.id === dial;
            return (
              <Pressable
                key={meta.id}
                onPress={() => { onSelect(meta.id); onClose(); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={{ width: cellWidth }}>
                <BlurView
                  intensity={isDark ? 20 : 40}
                  tint={isDark ? 'dark' : 'light'}
                  style={[
                    st.cell,
                    {
                      borderColor: active ? c.accent : c.border,
                      borderWidth: active ? 2 : StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <View style={st.preview}>
                    <TimerDial
                      dial={meta.id}
                      startedAt={startedAt}
                      size={PREVIEW_SIZE}
                      colors={{ text: c.text, sub: c.sub, border: c.border, accent: c.accent }}
                      isDark={isDark}
                      /* smooth тут не буває НІКОЛИ: аркуш монтує всі десять
                         циферблатів одночасно, і плавність перетворила б
                         відкриття вибору на десять анімацій по 60 Гц. */
                    />
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[st.name, { color: active ? c.accent : c.sub, fontWeight: active ? '700' : '600' }]}>
                    {String(tr[meta.labelKey])}
                  </Text>
                </BlurView>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  head:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
  title:  { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 },
  cell: {
    borderRadius: 18,
    overflow: 'hidden',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  preview: { height: PREVIEW_SIZE + 24, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 12 },
});
