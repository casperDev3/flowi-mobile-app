/**
 * components/shared/TimeSlotPicker.tsx — вибір часу зустрічі слотами по 30 хв.
 *
 * Замість набору часу з клавіатури: сітка 00:00…23:30 (4 у ряд) у власній
 * прокрутці фіксованої висоти, що одразу стоїть на вибраному часі, а без
 * нього — на поточному. Живе всередині аркушів (форма зустрічі, «Інша
 * дата…»), тому прокрутка вкладена (nestedScrollEnabled для Android).
 *
 * Час не з сітки (09:15 зі старих даних чи з Google) не губиться: він
 * показаний у полі над пікером, у сітці просто нічого не підсвічено.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Atlas } from '@/constants/atlas';
import { fontFamily } from '@/constants/theme';
import { dsTheme as dsTokens, glassOf } from '@/components/shared/dsTheme';
import { MEETING_TIME_SLOTS, slotIndexFor } from '@/utils/meetingReschedule';

const COLS = 4;
const ROW_H = 40;
const GAP = 6;

export interface TimeSlotPickerProps {
  /** 'HH:MM' або '' (без часу). */
  value: string;
  onChange: (time: string) => void;
  isDark: boolean;
  /** Висота видимої частини; типово ~5 рядів. */
  height?: number;
  /** Підпис опції «Без часу»; не передано — опції немає. */
  noTimeLabel?: string;
  testID?: string;
}

export function TimeSlotPicker({ value, onChange, isDark, height = 5 * (ROW_H + GAP), noTimeLabel, testID }: TimeSlotPickerProps) {
  const t = dsTokens(isDark);
  const dim = glassOf(t).surfaceSubtle;
  const scrollRef = useRef<ScrollView | null>(null);

  // Ряд, з якого почати: вибраний — другим рядом згори (видно й сусідів),
  // без вибору — поточна година.
  const startY = useMemo(() => {
    const row = Math.floor(slotIndexFor(value) / COLS);
    return Math.max(0, (row - 1) * (ROW_H + GAP));
    // Лише при відкритті: прокрутка не стрибає під пальцем після кожного тапу.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scrolled = useRef(false);
  const onLayout = useCallback(() => {
    if (scrolled.current) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: startY, animated: false });
  }, [startY]);

  const rows: string[][] = [];
  for (let i = 0; i < MEETING_TIME_SLOTS.length; i += COLS) rows.push(MEETING_TIME_SLOTS.slice(i, i + COLS) as string[]);

  return (
    <View testID={testID}>
      {noTimeLabel ? (
        <TouchableOpacity
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityState={{ selected: !value }}
          style={[st.noTime, { backgroundColor: !value ? t.action.primary : dim }]}>
          <Text style={{ color: !value ? t.text.onAction : t.text.secondary, fontSize: 12, fontFamily: fontFamily.semibold }}>{noTimeLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <ScrollView
        ref={scrollRef}
        style={{ height }}
        contentOffset={{ x: 0, y: startY }}
        onLayout={onLayout}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: GAP }}>
          {rows.map(row => (
            <View key={row[0]} style={{ flexDirection: 'row', gap: GAP }}>
              {row.map(slot => {
                const on = slot === value;
                return (
                  <TouchableOpacity
                    key={slot}
                    onPress={() => onChange(slot)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={slot}
                    style={[st.slot, { backgroundColor: on ? t.action.primary : dim }]}>
                    <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
                      {slot}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  slot: { flex: 1, height: ROW_H, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  noTime: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', marginBottom: GAP },
});
