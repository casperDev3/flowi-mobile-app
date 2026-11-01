/**
 * components/calendar/WeekStrip.tsx — смуга тижня для телефона.
 *
 * Сім днів із позначками; вміст обраного дня — у списку під смугою. На
 * телефоні погодинна сітка на сім колонок дала б по ~45pt на день — назви
 * нарад не читались би, тож тут той самий підхід, що був у «Нарадах».
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';

import { keyToDate, sprintsOnDay, type CalendarTaskItem, type SprintBar } from './calendarModel';
import type { CalendarColors } from './palette';
import { fontFamily, radius } from '@/constants/theme';

export function WeekStrip({ days, todayKey, selectedKey, tasksByDay, meetingsByDay, sprintBars, onSelect, c, tr }: {
  days: readonly string[];
  todayKey: string;
  selectedKey: string;
  tasksByDay: Readonly<Record<string, CalendarTaskItem[]>>;
  meetingsByDay: Readonly<Record<string, Meeting[]>>;
  sprintBars: readonly SprintBar[];
  onSelect: (day: string) => void;
  c: CalendarColors;
  tr: Translations;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {days.map(day => {
        const d = keyToDate(day);
        const isSel = day === selectedKey;
        const isToday = day === todayKey;
        const meetings = meetingsByDay[day]?.length ?? 0;
        const tasks = tasksByDay[day] ?? [];
        const sprint = sprintsOnDay(sprintBars, day)[0];
        return (
          <TouchableOpacity
            key={day}
            onPress={() => onSelect(day)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={`${tr.weekdaysFull[(d.getDay() + 6) % 7]}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}, ${tr.calA11yTasks} ${tasks.length}, ${tr.calA11yMeetings} ${meetings}`}
            style={[st.day, {
              // DS v2: вибраний день — pill action.primary; «сьогодні» — тонка рамка акценту.
              ...(isSel ? { backgroundColor: c.select } : { backgroundColor: c.card }),
              borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: c.accent,
            }]}>
            <Text style={{ color: isSel ? c.onSelect : c.sub, opacity: isSel ? 0.75 : 1, fontSize: 10, fontFamily: fontFamily.semibold }}>
              {tr.weekdays[(d.getDay() + 6) % 7]}
            </Text>
            <Text style={{ color: isSel ? c.onSelect : isToday ? c.accent : c.text, fontSize: 17, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginTop: 2 }}>
              {d.getDate()}
            </Text>
            <View style={st.marks}>
              {meetings > 0 && <View style={[st.dot, { backgroundColor: isSel ? c.onSelect : c.accent }]} />}
              {tasks.length > 0 && <View style={[st.square, { backgroundColor: isSel ? c.onSelect : tasks[0].color }]} />}
            </View>
            {sprint ? <View style={[st.sprint, { backgroundColor: sprint.project.color }]} /> : <View style={st.sprintGap} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  // Omni: день — вертикальна капсула; вибраний — чорна pill (c.select).
  day: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 4, borderRadius: radius.pill, minHeight: 64, overflow: 'hidden' },
  marks: { flexDirection: 'row', gap: 3, height: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  square: { width: 6, height: 6, borderRadius: 1.5 },
  sprint: { height: 3, alignSelf: 'stretch', marginTop: 4, marginHorizontal: 4, borderRadius: 2 },
  sprintGap: { height: 3, marginTop: 4 },
});
