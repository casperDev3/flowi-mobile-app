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
import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TimerDial } from '@/components/time/dials/TimerDial';
import { fontFamily, radius } from '@/constants/theme';
import { CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { dsTokens } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { DIALS, type DialId } from '@/utils/timerDials';
import { useGlassStyles } from '@/components/finance/finPalette';
import { OverlayMaterial } from '@/components/ds';

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
  /**
   * Глобальний типовий циферблат (синхронізований, timer_dial_prefs). Разом із
   * onMakeDefault вмикає «Зробити типовим»: кнопку для циферблата цього
   * таймера і довге натискання на будь-якій клітинці.
   */
  defaultDial?: DialId;
  onMakeDefault?: (id: DialId) => void;
  colors: DialPickerColors;
  isDark: boolean;
  tr: Translations;
}

export function DialPicker({
  visible, dial, timerLabel, onSelect, onClose, defaultDial, onMakeDefault, colors: c, isDark, tr,
}: DialPickerProps) {
  const canMakeDefault = Boolean(onMakeDefault);
  const dialIsDefault = defaultDial !== undefined && dial === defaultDial;
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();
  const t = dsTokens(isDark);
  const gs = useGlassStyles();

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[st.backdrop, { backgroundColor: t.surface.overlay }]} onPress={onClose} accessibilityRole="button" />

      <View
        style={[
          st.sheet,
          { ...gs.strong, backgroundColor: c.sheet, paddingBottom: insets.bottom + 16 },
          isWide && { maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
        ]}>
        <OverlayMaterial isDark={isDark} radius={{ borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card }} />
        <View style={[st.handle, { backgroundColor: t.text.muted }]} />

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
                onLongPress={canMakeDefault ? () => onMakeDefault?.(meta.id) : undefined}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityHint={canMakeDefault ? tr.dialMakeDefaultHint : undefined}
                style={{ width: cellWidth }}>
                {/* Вибраний — 2px рамка action.primary (товщина стала: прозора у спокої). */}
                <View
                  style={[
                    st.cell,
                    {
                      backgroundColor: (gs.subtle.backgroundColor as string),
                      borderColor: active ? t.action.primary : 'transparent',
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
                    style={[st.name, { color: active ? t.text.primary : t.text.secondary, fontFamily: active ? fontFamily.semibold : fontFamily.medium }]}>
                    {String(tr[meta.labelKey])}
                  </Text>
                  {canMakeDefault && meta.id === defaultDial && (
                    <View style={[st.defaultTag, { backgroundColor: t.accent.amber }]}>
                      <IconSymbol name="star.fill" size={10} color={t.text.onAccent} />
                      <Text style={[st.defaultTagText, { color: t.text.onAccent }]}>{tr.dialIsDefault}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {canMakeDefault && (
          // Дія над циферблатом ЦЬОГО таймера: обрати вигляд тапом по клітинці,
          // а тоді зробити його типовим для всіх таймерів без власного вибору.
          <Pressable
            onPress={() => { if (!dialIsDefault) onMakeDefault?.(dial); }}
            disabled={dialIsDefault}
            accessibilityRole="button"
            accessibilityState={{ disabled: dialIsDefault }}
            style={({ pressed }) => [
              st.makeDefault,
              {
                backgroundColor: dialIsDefault ? t.state.disabledBg : t.action.primary,
                opacity: pressed ? 0.7 : 1,
              },
            ]}>
            <IconSymbol name="star.fill" size={12} color={dialIsDefault ? t.state.disabledText : t.text.onAction} />
            <Text numberOfLines={1} style={[st.makeDefaultText, { color: dialIsDefault ? t.text.secondary : t.text.onAction }]}>
              {dialIsDefault
                ? `${tr.dialIsDefault}: ${String(tr[DIALS.find(d => d.id === dial)?.labelKey ?? 'dialDigits'])}`
                : `${tr.dialMakeDefault}: ${String(tr[DIALS.find(d => d.id === dial)?.labelKey ?? 'dialDigits'])}`}
            </Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '82%',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  head:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 2 },
  title:  { fontSize: 18, fontFamily: fontFamily.semibold },
  subtitle: { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 },
  cell: {
    borderRadius: radius.nested,
    borderWidth: 2,
    overflow: 'hidden',
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  preview: { height: PREVIEW_SIZE + 24, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 12 },
  defaultTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2,
  },
  defaultTagText: { fontSize: 10, fontFamily: fontFamily.semibold },
  makeDefault: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 48, borderRadius: radius.pill, marginTop: 10, paddingHorizontal: 16,
  },
  makeDefaultText: { fontSize: 14, fontFamily: fontFamily.semibold },
});
