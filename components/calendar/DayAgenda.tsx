/**
 * components/calendar/DayAgenda.tsx — усе, що є в обраному дні.
 *
 * Три секції в порядку «що триває → що здати → куди піти»: спринти, що
 * покривають день, завдання з дедлайном цього дня, зустрічі. Показується під
 * місячною сіткою на телефоні, під смугою тижня і в правій колонці планшета,
 * коли не вибрано зустріч.
 *
 * Права колонка планшета — лише для читання: туди не передають
 * onMeetingDelete/onMeetingRecord, тап по рядку відкриває деталь, де ці дії
 * й живуть.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MeetingProjectChip, type MeetingChipProject } from '@/components/meetings/MeetingProjectChip';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Atlas } from '@/constants/atlas';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';
import { normalizePriority, type Task } from '@/utils/taskUtils';

import type { CalendarTaskItem, SprintBar } from './calendarModel';
import { keyToDate } from './calendarModel';
import { MeetingCard } from './MeetingCard';
import type { CalendarColors } from './palette';

const MIN_TOUCH = 44;

export interface DayAgendaProps {
  day: string;
  title: string;
  tasks: readonly CalendarTaskItem[];
  meetings: readonly Meeting[];
  sprints: readonly SprintBar[];
  c: CalendarColors;
  isDark: boolean;
  tr: Translations;
  selectedMeetingKey?: string | null;
  runningMeetingIds?: ReadonlySet<string>;
  meetingProject: (m: Meeting) => MeetingChipProject | null;
  onTaskPress: (task: Task) => void;
  onMeetingPress: (m: Meeting) => void;
  onMeetingDelete?: (m: Meeting) => void;
  onMeetingRecord?: (m: Meeting) => void;
  onSprintPress: (bar: SprintBar) => void;
  /**
   * «+» у заголовку дня. Не передано — кнопки немає: на телефоні «+» один
   * (FAB), на планшеті він у шапці екрана, і друга кнопка поруч лише
   * дублювала б його.
   */
  onAdd?: (day: string) => void;
  /** Компактний заголовок (у правій колонці планшета). */
  compactTitle?: boolean;
}

function shortDate(key: string): string {
  const d = keyToDate(key);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function DayAgenda({
  day, title, tasks, meetings, sprints, c, isDark, tr, selectedMeetingKey, runningMeetingIds,
  meetingProject, onTaskPress, onMeetingPress, onMeetingDelete, onMeetingRecord, onSprintPress, onAdd, compactTitle,
}: DayAgendaProps) {
  const empty = tasks.length === 0 && meetings.length === 0 && sprints.length === 0;

  return (
    <View style={{ gap: 12 }}>
      <View style={st.titleRow}>
        <Text
          accessibilityRole="header"
          style={{ flex: 1, color: c.text, fontSize: compactTitle ? 15 : 17, fontWeight: '800' }}
          numberOfLines={2}>
          {title}
        </Text>
        {onAdd ? (
          <TouchableOpacity
            onPress={() => onAdd(day)}
            accessibilityRole="button"
            accessibilityLabel={tr.calAddToDay}
            style={[st.addBtn, { borderColor: c.accent + '50', backgroundColor: c.accent + '14' }]}>
            <IconSymbol name="plus" size={16} color={c.accent} />
          </TouchableOpacity>
        ) : null}
      </View>

      {empty ? (
        <View style={[st.emptyBox, { borderColor: c.border }]}>
          <IconSymbol name="calendar.badge.checkmark" size={26} color={c.sub} />
          <Text style={{ color: c.sub, fontSize: 14, fontWeight: '600', marginTop: 8 }}>{tr.calNothingPlanned}</Text>
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{tr.calNothingPlannedHint}</Text>
        </View>
      ) : null}

      {sprints.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[st.section, { color: c.sub }]}>{tr.calSectionSprints}</Text>
          {sprints.map(bar => (
            <TouchableOpacity
              key={bar.sprint.id}
              onPress={() => onSprintPress(bar)}
              accessibilityRole="button"
              accessibilityLabel={`${tr.calSprintA11y} ${bar.number} · ${bar.sprint.name} · ${bar.project.name}`}
              style={[st.row, { backgroundColor: bar.project.color + '1A', borderColor: bar.project.color + '40' }]}>
              <View style={[st.sprintSwatch, { backgroundColor: bar.project.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
                  №{bar.number} · {bar.sprint.name}
                </Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {bar.project.name} · {shortDate(bar.start)}–{shortDate(bar.end)}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={12} color={c.sub} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {tasks.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={[st.section, { color: c.sub }]}>{tr.calSectionDeadlines}</Text>
          {tasks.map(item => (
            <TouchableOpacity
              key={item.task.id}
              onPress={() => onTaskPress(item.task)}
              accessibilityRole="button"
              accessibilityLabel={`${item.task.title}${item.done ? `, ${tr.done}` : ''}`}
              style={[st.row, { backgroundColor: c.card, borderColor: c.border, opacity: item.done ? 0.55 : 1 }]}>
              <IconSymbol
                name={item.done ? 'checkmark.circle.fill' : 'circle'}
                size={18}
                color={item.done ? '#10B981' : item.color} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={{ color: c.text, fontSize: 13, fontWeight: '600', textDecorationLine: item.done ? 'line-through' : 'none' }}
                  numberOfLines={2}>
                  {item.task.title}
                </Text>
                {item.project ? <MeetingProjectChip project={item.project} textColor={c.text} /> : null}
              </View>
              <PriorityBadge level={normalizePriority(item.task)} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {meetings.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[st.section, { color: c.sub }]}>{tr.calSectionMeetings}</Text>
          {meetings.map(m => (
            <MeetingCard
              key={m.id}
              mtg={m}
              c={c}
              isDark={isDark}
              isRecurring={!!m._origId}
              tracking={runningMeetingIds?.has(m._origId ?? m.id) ?? false}
              project={meetingProject(m)}
              selected={m.id === selectedMeetingKey}
              onPress={onMeetingPress}
              onDelete={onMeetingDelete}
              onRecord={onMeetingRecord}
              deleteLabel={tr.delete}
              recordLabel={tr.calRecordAudio}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  addBtn: { width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: Atlas.radius.medium, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9,
  },
  sprintSwatch: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 16, borderRadius: Atlas.radius.large, borderWidth: 1, borderStyle: 'dashed' },
});
