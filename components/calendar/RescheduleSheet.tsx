/**
 * components/calendar/RescheduleSheet.tsx — «Перенести» зустріч без форми.
 *
 * Пресети: +30 хв, +1 год, Завтра в той самий час, Наступного тижня — тап
 * одразу переносить (і екран показує тост «Скасувати»). «Інша дата…»
 * розгортає місячну сітку й слоти по 30 хв і кнопку «Перенести».
 *
 * Для екземпляра повтору аркуш попереджає, що переноситься лише ця зустріч
 * серії: сам перенос пише виняток (utils/meetingReschedule.ts).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { glassRimFor } from '@/components/shared/dsTheme';
import { CalGrid } from '@/components/shared/MeetingFormSheet';
import { TimeSlotPicker } from '@/components/shared/TimeSlotPicker';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';
import {
  presetTarget, RESCHEDULE_PRESETS, type MeetingSlot, type ReschedulePreset,
} from '@/utils/meetingReschedule';

import { keyToDate } from './calendarModel';
import type { CalendarColors } from './palette';

export interface RescheduleSheetProps {
  /** Екземпляр, який людина бачила (розгорнутий, з _origId для повтору). */
  meeting: Meeting | null;
  onClose: () => void;
  onApply: (meeting: Meeting, target: MeetingSlot) => void;
  isDark: boolean;
  wide: boolean;
  lang: string;
  c: CalendarColors;
  tr: Translations;
  markedDays?: Set<string>;
}

const PRESET_ICON: Record<ReschedulePreset, IconSymbolName> = {
  plus30: 'clock',
  plus60: 'clock',
  tomorrow: 'sun.horizon.fill',
  nextWeek: 'calendar',
};

const NO_MARKS = new Set<string>();

/** «Пт, 7 лист. · 10:30» — куди саме переїде зустріч. */
export function slotLabel(slot: MeetingSlot, locale: string): string {
  const day = keyToDate(slot.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  return slot.time ? `${day} · ${slot.time}` : day;
}

export function RescheduleSheet({ meeting, onClose, onApply, isDark, wide, lang, c, tr, markedDays = NO_MARKS }: RescheduleSheetProps) {
  const insets = useSafeAreaInsets();
  // Стеля висоти — числом: відсоток від батька з height:auto Yoga не рахує (NAT-01).
  const { height: windowHeight } = useWindowDimensions();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const [other, setOther] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [calYear, setCalYear] = useState(0);
  const [calMonth, setCalMonth] = useState(0);

  useEffect(() => {
    if (!meeting) return;
    setOther(false);
    setDate(meeting.date);
    setTime(meeting.time ?? '');
    const d = keyToDate(meeting.date);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  }, [meeting]);

  const from = useMemo<MeetingSlot | null>(() => (meeting ? { date: meeting.date, time: meeting.time ?? '' } : null), [meeting]);
  const labels: Record<ReschedulePreset, string> = {
    plus30: tr.mtgReschedulePlus30,
    plus60: tr.mtgReschedulePlus60,
    tomorrow: tr.mtgRescheduleTomorrow,
    nextWeek: tr.mtgRescheduleNextWeek,
  };
  const recurring = !!meeting?._origId;
  const changed = !!from && (date !== from.date || time !== from.time);

  return (
    <Modal visible={!!meeting} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable
        accessible={false}
        style={[st.overlay, { backgroundColor: dsTokens(isDark).surface.overlay }, wide ? st.overlayCenter : { justifyContent: 'flex-end', paddingBottom: insets.bottom + 12 }]}
        onPress={onClose}>
        <Pressable
          accessible={false}
          onPress={e => e.stopPropagation()}
          accessibilityViewIsModal
          importantForAccessibility="yes"
          style={[wide ? { width: 440 } : { marginHorizontal: 12 }, { maxHeight: windowHeight * 0.86 }]}>
          <View style={[st.sheet, { backgroundColor: c.sheet, ...glassRimFor(c.sheet, 'strong') }, shadow[isDark ? 'dark' : 'light'].popover]}>
            <OverlayMaterial isDark={isDark} radius={radius.card} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text accessibilityRole="header" style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold }}>{tr.mtgReschedule}</Text>
                  {meeting && from ? (
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2 }}>
                      {meeting.title} · {slotLabel(from, locale)}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
                  style={[st.close, { backgroundColor: c.dim }]}>
                  <IconSymbol name="xmark" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>

              {recurring ? (
                <View style={[st.note, { backgroundColor: c.dim }]}>
                  <IconSymbol name="repeat" size={12} color={c.sub} />
                  <Text style={{ flex: 1, color: c.sub, fontSize: 12, fontFamily: fontFamily.medium }}>{tr.mtgRescheduleOnlyThis}</Text>
                </View>
              ) : null}

              <View style={{ gap: 8 }}>
                {meeting && from ? RESCHEDULE_PRESETS.map(preset => {
                  const target = presetTarget(preset, from);
                  if (!target) return null;
                  return (
                    <TouchableOpacity
                      key={preset}
                      testID={`reschedule-${preset}`}
                      onPress={() => onApply(meeting, target)}
                      accessibilityRole="button"
                      accessibilityLabel={`${labels[preset]}: ${slotLabel(target, locale)}`}
                      style={[st.option, { backgroundColor: c.dim }]}>
                      <IconSymbol name={PRESET_ICON[preset]} size={16} color={c.text} />
                      <Text style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{labels[preset]}</Text>
                      <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>{slotLabel(target, locale)}</Text>
                    </TouchableOpacity>
                  );
                }) : null}

                <TouchableOpacity
                  testID="reschedule-other"
                  onPress={() => setOther(v => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: other }}
                  style={[st.option, { backgroundColor: c.dim }]}>
                  <IconSymbol name="calendar.badge.clock" size={16} color={c.text} />
                  <Text style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.mtgRescheduleOther}</Text>
                  <IconSymbol name={other ? 'chevron.up' : 'chevron.down'} size={12} color={c.sub} />
                </TouchableOpacity>
              </View>

              {other && meeting ? (
                <View style={{ marginTop: 8 }}>
                  <CalGrid
                    year={calYear} month={calMonth} markedDays={markedDays}
                    selectedDate={date}
                    onPrevMonth={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                    onNextMonth={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                    onSelectDay={d => setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)}
                    accent={meeting.color} border={c.border} sub={c.sub} text={c.text} lang={lang}
                  />
                  <TimeSlotPicker
                    testID="reschedule-slots"
                    value={time}
                    onChange={setTime}
                    isDark={isDark}
                    height={4 * 46}
                    noTimeLabel={tr.mtgNoTime}
                  />
                  <TouchableOpacity
                    testID="reschedule-apply"
                    disabled={!changed}
                    onPress={() => onApply(meeting, { date, time })}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !changed }}
                    style={[st.apply, { backgroundColor: changed ? c.action : c.dim }]}>
                    <Text style={{ color: changed ? c.onAction : c.sub, fontSize: 14, fontFamily: fontFamily.semibold }}>
                      {tr.mtgReschedule}{changed ? ` · ${slotLabel({ date, time }, locale)}` : ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1 },
  overlayCenter: { alignItems: 'center', justifyContent: 'center' },
  sheet: { borderRadius: radius.card, padding: 20, overflow: 'hidden', flexShrink: 1 },
  option: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.nested, paddingHorizontal: 16, paddingVertical: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.nested, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  close: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  apply: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingHorizontal: 16 },
});
