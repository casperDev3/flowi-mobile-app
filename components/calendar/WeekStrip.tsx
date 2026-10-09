/**
 * components/calendar/WeekStrip.tsx — смуга тижня для телефона.
 *
 * Сім днів із позначками; вміст обраного дня — у списку під смугою. На
 * телефоні погодинна сітка на сім колонок дала б по ~45pt на день — назви
 * нарад не читались би, тож тут той самий підхід, що був у «Нарадах».
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Atlas } from '@/constants/atlas';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';

import { keyToDate, sprintsOnDay, type CalendarTaskItem, type SprintBar } from './calendarModel';
import type { CalendarColors } from './palette';

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
              backgroundColor: isSel ? c.accent : isToday ? c.accent + '15' : c.dim,
              borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: c.accent,
            }]}>
            <Text style={{ color: isSel ? 'rgba(255,255,255,0.75)' : c.sub, fontSize: 10, fontWeight: '700' }}>
              {tr.weekdays[(d.getDay() + 6) % 7]}
            </Text>
            <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, fontSize: 16, fontWeight: '800', marginTop: 2 }}>
              {d.getDate()}
            </Text>
            <View style={st.marks}>
              {meetings > 0 && <View style={[st.dot, { backgroundColor: isSel ? '#fff' : c.accent }]} />}
              {tasks.length > 0 && <View style={[st.square, { backgroundColor: isSel ? '#fff' : tasks[0].color }]} />}
            </View>
            {sprint ? <View style={[st.sprint, { backgroundColor: sprint.project.color }]} /> : <View style={st.sprintGap} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  day: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 4, borderRadius: Atlas.radius.medium, minHeight: 64, overflow: 'hidden' },
  marks: { flexDirection: 'row', gap: 3, height: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  square: { width: 6, height: 6, borderRadius: 1.5 },
  sprint: { height: 3, alignSelf: 'stretch', marginTop: 4, marginHorizontal: 4, borderRadius: 2 },
  sprintGap: { height: 3, marginTop: 4 },
});
