/**
 * components/calendar/CalendarStaticPane.tsx — статична зона «Календаря» на
 * планшеті (Layout System v2.4, лише не compact; стоїть поруч від вікна
 * 1280pt — це вирішує ZoneLayout).
 *
 * Зверху — міні-місяць (сітка з крапками, як на телефоні) зі своїми
 * стрілками місяця: тап по дню переводить головну сітку на цей день. У виді
 * «Місяць» міні-місяця немає — головна зона й так місяць. Нижче — список
 * обраного дня лише для читання (тап по зустрічі відкриває деталі в
 * динамічній зоні, де живуть кошик і мікрофон).
 *
 * Суцільні картки surface.card на canvas — це вміст, не оверлей (DS: скло
 * лише функціональний шар).
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius } from '@/constants/theme';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';

import type { CalendarTaskItem, SprintBar } from './calendarModel';
import { MonthGrid } from './MonthGrid';
import type { CalendarColors } from './palette';
import { useCalendarZoneStrings } from './calendarZoneStrings';

export interface CalendarStaticPaneProps {
  /** Показати міні-місяць (у виді «Місяць» — ні). */
  showMiniMonth: boolean;
  monthTitle: string;
  monthRows: string[][];
  month: number;
  todayKey: string;
  selectedKey: string;
  tasksByDay: Readonly<Record<string, CalendarTaskItem[]>>;
  meetingsByDay: Readonly<Record<string, Meeting[]>>;
  sprintBars: readonly SprintBar[];
  onSelectDay: (key: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Список дня (DayAgenda readOnly) — його рендерить екран. */
  agenda: React.ReactNode;
  c: CalendarColors;
  tr: Translations;
}

export function CalendarStaticPane({
  showMiniMonth, monthTitle, monthRows, month, todayKey, selectedKey, tasksByDay, meetingsByDay, sprintBars,
  onSelectDay, onPrevMonth, onNextMonth, agenda, c, tr,
}: CalendarStaticPaneProps) {
  const s = useCalendarZoneStrings();
  return (
    <View testID="calendar-static-pane" accessibilityLabel={s.staticZone} style={st.root}>
      {showMiniMonth ? (
        <View testID="calendar-mini-month" accessibilityLabel={s.miniMonth} style={[st.card, { backgroundColor: c.card }]}>
          <View style={st.head}>
            <TouchableOpacity
              testID="calendar-mini-prev"
              onPress={onPrevMonth}
              accessibilityRole="button"
              accessibilityLabel={s.prevMonth}
              style={[st.navBtn, { backgroundColor: c.dim }]}>
              <IconSymbol name="chevron.left" size={14} color={c.sub} />
            </TouchableOpacity>
            <Text accessibilityRole="header" numberOfLines={1} style={[st.title, { color: c.text }]}>{monthTitle}</Text>
            <TouchableOpacity
              testID="calendar-mini-next"
              onPress={onNextMonth}
              accessibilityRole="button"
              accessibilityLabel={s.nextMonth}
              style={[st.navBtn, { backgroundColor: c.dim }]}>
              <IconSymbol name="chevron.right" size={14} color={c.sub} />
            </TouchableOpacity>
          </View>
          <MonthGrid
            rows={monthRows}
            month={month}
            todayKey={todayKey}
            selectedKey={selectedKey}
            tasksByDay={tasksByDay}
            meetingsByDay={meetingsByDay}
            sprintBars={sprintBars}
            onSelectDay={onSelectDay}
            mode="dots"
            c={c}
            tr={tr}
          />
        </View>
      ) : null}
      <View style={[st.card, st.agenda, { backgroundColor: c.card }]}>{agenda}</View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { gap: 12 },
  card: { borderRadius: radius.cardCompact, padding: 8 },
  agenda: { padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  title: { flex: 1, textAlign: 'center', fontSize: 15, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  navBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
