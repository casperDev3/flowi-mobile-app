import { copyMeeting } from '@/utils/meetingSharing';
/**
 * components/tasks/TasksTodayPane.tsx — права колонка екрана Завдань на
 * широкому вікні, коли жодне завдання не вибране (рішення власника, п. 3).
 *
 * Порожня колонка «Оберіть завдання» нічого не давала; тут замість неї —
 * «Сьогодні»: зустрічі дня і графік активності дня (зустрічі за часом +
 * відстежений таймерами час, лінія «зараз»). Завдань тут навмисно немає —
 * вони вже в списку ліворуч (рішення власника 2026-10-07). Тап по зустрічі
 * відкриває її перегляд.
 *
 * Зустрічі приходять уже вибраними й упорядкованими з екрана (ті самі, що в
 * статистиці «Сьогодні» над списком); сесії таймерів колонка збирає сама
 * (buildDayActivity) — щоб блок сесії, що йде, ріс разом із годинником.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DayActivityTimeline } from '@/components/tasks/DayActivityTimeline';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { ActiveTimer } from '@/utils/activeTimers';
import { isSameDay } from '@/utils/dateUtils';
import { buildDayActivity, trackedMinutes, type DayActivityInput } from '@/utils/dayActivity';
import { formatDuration } from '@/utils/durationFormat';
import type { Meeting, TodayMeetingPhase } from '@/utils/meetings';
import { fontFamily, radius, theme, type } from '@/constants/theme';
import { dsTokensForText } from '@/components/tasks/dsTokensForText';
import { glassOf, glassRim } from '@/components/shared/dsTheme';

export interface TasksTodayPaneProps {
  today: Date;
  locale: string;
  /** Зустрічі дня з фазою (orderTodayMeetings). */
  meetings: readonly { meeting: Meeting; phase: TodayMeetingPhase }[];
  /**
   * Джерела відстеженого часу для графіка: завдання і СИРІ зустрічі (з їхніми
   * timeEntries) та таймери, що йдуть.
   */
  activitySources: {
    tasks: DayActivityInput['tasks'];
    meetings: DayActivityInput['meetings'];
    timers: readonly ActiveTimer[];
  };
  onOpenMeeting: (meeting: Meeting) => void;
  onOpenCalendar: () => void;
  colors: { text: string; sub: string; border: string; dim: string; accent: string };
  tr: Translations;
  /** Лише для тестів: зафіксований «зараз». */
  now?: Date;
}

const MEETING_COLOR = theme.light.status.info;

/** «Зараз» з кроком у хвилину — частіше графіку оновлюватись нема сенсу. */
function useMinuteClock(fixed?: Date): Date {
  const [now, setNow] = useState(() => fixed ?? new Date());
  useEffect(() => {
    if (fixed) { setNow(fixed); return; }
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [fixed]);
  return now;
}

export function TasksTodayPane({
  today, locale, meetings, activitySources, onOpenMeeting, onOpenCalendar, colors: c, tr, now: fixedNow,
}: TasksTodayPaneProps) {
  const t = dsTokensForText(c.text);
  const units = { hour: tr.unitHour, hourLong: tr.unitHourLong, minute: tr.unitMinute };
  const dateLabel = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  const now = useMinuteClock(fixedNow);

  const { tasks: srcTasks, meetings: srcMeetings, timers } = activitySources;
  const activity = useMemo(
    () => buildDayActivity({ tasks: srcTasks, meetings: srcMeetings, timers, day: today, now }),
    [srcTasks, srcMeetings, timers, today, now],
  );
  const tracked = trackedMinutes(activity);
  const timelineMeetings = useMemo(() => meetings.map(r => r.meeting), [meetings]);
  const isToday = isSameDay(now, today);
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : null;

  return (
    <View style={st.root} testID="tasks-today-pane">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={st.content}>
        <Text accessibilityRole="header" style={[st.title, { color: c.text }]}>{tr.today}</Text>
        <Text style={[st.date, { color: c.sub }]}>{dateLabel}</Text>

        {/* ── Зустрічі дня ── */}
        <SectionTitle
          icon="calendar.circle.fill"
          color={MEETING_COLOR}
          label={tr.todayPaneMeetings}
          badge={meetings.length > 0 ? String(meetings.length) : undefined}
          textColor={c.text}
        />
        {meetings.length === 0 ? (
          <Text style={[st.empty, { color: c.sub, backgroundColor: c.dim }]}>{tr.todayPaneNoMeetings}</Text>
        ) : (
          <View style={{ gap: 6 }}>
            {meetings.map(({ meeting, phase }) => {
              const duration = formatDuration(Math.max(0, meeting.durationMinutes) * 60, units);
              return (
                <TouchableOpacity
                  key={meeting.id}
                  onPress={() => onOpenMeeting(meeting)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${meeting.time || ''} ${meeting.title}, ${duration}`.trim()}
                  style={[st.meetingRow, { backgroundColor: c.dim, opacity: phase === 'past' ? 0.5 : 1 }]}>
                  <View style={[st.meetingBar, { backgroundColor: meeting.color }]} />
                  <Text style={[st.meetingTime, { color: c.text }]}>{meeting.time || '--:--'}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      {phase === 'current' && <View style={[st.nowDot, { backgroundColor: t.accent.coral }]} />}
                      <Text numberOfLines={1} style={{ flex: 1, color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{meeting.title}</Text>
                      <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr.copyText} onPress={event => { event.stopPropagation(); void copyMeeting(meeting, locale.startsWith('en')); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><IconSymbol name="doc.on.doc" size={15} color={c.sub} /></TouchableOpacity>
                    </View>
                    <Text numberOfLines={1} style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                      {duration}{meeting.location ? ` · ${meeting.location}` : ''}
                    </Text>
                  </View>
                  <IconSymbol name="chevron.right" size={12} color={c.sub} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Графік активності дня ── */}
        <SectionTitle
          icon="chart.bar.fill"
          color={c.accent}
          label={tr.todayPaneActivity}
          badge={tracked > 0 ? `${tr.todayPaneTracked} ${formatDuration(Math.round(tracked) * 60, units)}` : undefined}
          textColor={c.text}
        />
        <DayActivityTimeline
          meetings={timelineMeetings}
          activity={activity}
          nowMin={nowMin}
          onOpenMeeting={onOpenMeeting}
          colors={c}
          tr={tr}
        />
        {activity.length === 0 && (
          <Text style={[st.trackHint, { color: c.sub }]}>{tr.todayPaneNoTracked}</Text>
        )}

        <TouchableOpacity
          onPress={onOpenCalendar}
          accessibilityRole="button"
          accessibilityLabel={tr.todayPaneOpenCalendar}
          style={[st.calendarBtn, { backgroundColor: glassOf(t).surfaceSubtle, ...glassRim(t, 'subtle') }]}>
          <IconSymbol name="calendar" size={15} color={t.action.secondaryText} />
          <Text style={{ color: t.action.secondaryText, fontSize: 14, fontFamily: fontFamily.semibold, flex: 1 }}>{tr.todayPaneOpenCalendar}</Text>
          <IconSymbol name="chevron.right" size={12} color={c.sub} />
        </TouchableOpacity>

        <Text style={[st.hint, { color: c.sub }]}>{tr.detailEmptyHint}</Text>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ icon, color, label, badge, textColor }: {
  icon: 'calendar.circle.fill' | 'chart.bar.fill';
  color: string;
  label: string;
  badge?: string;
  textColor: string;
}) {
  return (
    <View style={st.sectionTitle} accessibilityRole="header">
      <IconSymbol name={icon} size={15} color={color} />
      <Text style={[type.h2, { color: textColor, flex: 1 }]}>{label}</Text>
      {badge !== undefined && (
        // DS v2: бейдж значення — lime-pill з темним текстом.
        <View style={[st.countPill, { backgroundColor: theme.light.accent.lime }]}>
          <Text style={{ color: theme.light.text.onAccent, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  // DetailPane центрує порожній стан — колонці «Сьогодні» потрібна вся висота й ширина.
  root:        { flex: 1, alignSelf: 'stretch' },
  content:     { paddingBottom: 40 },
  title:       { fontSize: 28, fontFamily: fontFamily.medium, letterSpacing: -0.4 },
  date:        { fontSize: 13, fontFamily: fontFamily.regular, marginTop: 2, marginBottom: 6, textTransform: 'capitalize' },
  sectionTitle:{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18, marginBottom: 10 },
  countPill:   { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  empty:       { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', borderRadius: radius.nested, overflow: 'hidden', paddingVertical: 16, paddingHorizontal: 12 },
  meetingRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, borderRadius: radius.nested, paddingVertical: 8, paddingLeft: 14, paddingRight: 10, overflow: 'hidden' },
  meetingBar:  { width: 8, height: 8, borderRadius: 4 },
  meetingTime: { fontSize: 14, fontFamily: fontFamily.medium, minWidth: 42, fontVariant: ['tabular-nums'] },
  nowDot:      { width: 6, height: 6, borderRadius: 3 },
  calendarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, paddingHorizontal: 18, marginTop: 22 },
  trackHint:   { fontSize: 12, fontFamily: fontFamily.regular, marginTop: 6 },
  hint:        { fontSize: 12, fontFamily: fontFamily.regular, textAlign: 'center', marginTop: 16 },
});
