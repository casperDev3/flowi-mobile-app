/**
 * components/calendar/CalendarSearch.tsx — режим пошуку «Календаря».
 *
 * Кнопка-лупа в шапці замінює панель виду цим рядком пошуку і списком
 * збігів, згрупованих за датою: спершу «Найближчі» (сьогодні й далі), далі
 * «Історія» — минулі зустрічі теж шукаються. Повторювана серія — один рядок
 * (див. searchCalendar). Тап по зустрічі відкриває її деталь на її дні, по
 * завданню — картку завдання.
 */
import React, { useDeferredValue, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { MeetingChipProject } from '@/components/meetings/MeetingProjectChip';
import { MeetingProjectChip } from '@/components/meetings/MeetingProjectChip';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';
import type { Task } from '@/utils/taskUtils';

import { keyToDate, searchCalendar, type CalendarSearchGroup, type CalendarTaskItem } from './calendarModel';
import { MeetingCard } from './MeetingCard';
import type { CalendarColors } from './palette';
import { fontFamily, radius } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';

export interface CalendarSearchProps {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  meetingsByDay: Readonly<Record<string, readonly Meeting[]>>;
  tasksByDay: Readonly<Record<string, readonly CalendarTaskItem[]>>;
  todayKey: string;
  meetingProject: (m: Meeting) => MeetingChipProject | null;
  onMeetingPress: (m: Meeting) => void;
  onTaskPress: (task: Task) => void;
  isDark: boolean;
  c: CalendarColors;
  tr: Translations;
  bottomPad: number;
}

export function CalendarSearch({
  query, onQueryChange, onClose, meetingsByDay, tasksByDay, todayKey, meetingProject,
  onMeetingPress, onTaskPress, isDark, c, tr, bottomPad,
}: CalendarSearchProps) {
  // Відкладене значення: поле вводу оновлюється одразу, а перебір усіх
  // екземплярів повторів — коли React має час (не на кожне натискання).
  const deferredQuery = useDeferredValue(query);
  const result = useMemo(
    () => searchCalendar(deferredQuery, meetingsByDay, tasksByDay, todayKey),
    [deferredQuery, meetingsByDay, tasksByDay, todayKey],
  );

  const dayLabel = (day: string) => {
    if (day === todayKey) return tr.today;
    const d = keyToDate(day);
    return `${tr.weekdays[(d.getDay() + 6) % 7]}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]} ${d.getFullYear()}`;
  };

  const renderGroup = (g: CalendarSearchGroup) => (
    <View key={g.day} style={{ gap: 6 }}>
      <Text style={[st.dayLabel, { color: c.sub }]}>{dayLabel(g.day)}</Text>
      {g.meetings.map(m => (
        <MeetingCard
          key={m.id}
          mtg={m}
          c={c}
          isDark={isDark}
          isRecurring={!!m._origId}
          project={meetingProject(m)}
          onPress={onMeetingPress}
          deleteLabel={tr.delete}
          recordLabel={tr.calRecordAudio}
        />
      ))}
      {g.tasks.map(item => (
        <TouchableOpacity
          key={item.task.id}
          onPress={() => onTaskPress(item.task)}
          accessibilityRole="button"
          accessibilityLabel={`${tr.calA11yTask}: ${item.task.title}${item.done ? `, ${tr.done}` : ''}`}
          style={[st.row, { backgroundColor: c.card, opacity: item.done ? 0.55 : 1 }]}>
          <IconSymbol name={item.done ? 'checkmark.circle.fill' : 'circle'} size={18} color={item.done ? dsTokens(isDark).status.success : item.color} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.medium, textDecorationLine: item.done ? 'line-through' : 'none' }} numberOfLines={2}>
              {item.task.title}
            </Text>
            {item.project ? <MeetingProjectChip project={item.project} textColor={c.text} /> : null}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const trimmed = query.trim();

  return (
    <View style={{ flex: 1 }}>
      <View style={st.barRow}>
        <View style={[st.inputBox, { backgroundColor: c.card }]}>
          <IconSymbol name="magnifyingglass" size={15} color={c.sub} />
          <TextInput
            testID="calendar-search-input"
            autoFocus
            value={query}
            onChangeText={onQueryChange}
            placeholder={tr.calSearchPlaceholder}
            placeholderTextColor={c.muted}
            accessibilityLabel={tr.calSearch}
            returnKeyType="search"
            autoCorrect={false}
            style={{ flex: 1, color: c.text, fontSize: 15, fontFamily: fontFamily.regular, paddingVertical: 0 }}
          />
          {query ? (
            <TouchableOpacity onPress={() => onQueryChange('')} accessibilityRole="button" accessibilityLabel={tr.calSearchClear}
              style={st.clearBtn}>
              <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.cancel} style={st.cancelBtn}>
          <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad, gap: 16 }}
        showsVerticalScrollIndicator={false}>
        {!trimmed ? (
          <View style={st.empty}>
            <IconSymbol name="magnifyingglass" size={26} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 8, textAlign: 'center' }}>{tr.calSearchHint}</Text>
          </View>
        ) : result.total === 0 ? (
          <View style={st.empty}>
            <IconSymbol name="magnifyingglass" size={26} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.regular, marginTop: 8, textAlign: 'center' }}>{tr.calSearchEmpty}</Text>
          </View>
        ) : (
          <>
            {result.upcoming.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={[st.section, { color: c.text }]}>{tr.calSearchUpcoming}</Text>
                {result.upcoming.map(renderGroup)}
              </View>
            ) : null}
            {result.past.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text accessibilityRole="header" style={[st.section, { color: c.text }]}>{tr.calSearchPast}</Text>
                {result.past.map(renderGroup)}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  inputBox: {
    flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: radius.pill, paddingLeft: 16,
  },
  clearBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  section: { fontSize: 16, fontFamily: fontFamily.semibold },
  dayLabel: { fontSize: 12, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: radius.nested, paddingHorizontal: 16, paddingVertical: 12,
  },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
});
