/**
 * components/tasks/DayActivityTimeline.tsx — «графік активності дня» в
 * колонці «Сьогодні» (TasksTodayPane) на широкому вікні.
 *
 * Компактна погодинна сітка (типово 06:00–23:00, див. timelineHourRange):
 * ліва доріжка — зустрічі дня за часом і тривалістю (та сама розкладка
 * перекриттів, що в календарі, layoutDayMeetings), права — відстежений час
 * (сесії таймерів завдань і зустрічей, buildDayActivity). Лінія «зараз»
 * показує поточний момент.
 *
 * Повна сітка календаря (components/calendar/TimeGrid) тут не підходить: вона
 * має власну прокрутку, шапку днів і смугу «Весь день», а в колонці потрібна
 * статична картинка дня всередині спільного ScrollView.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { layoutDayMeetings } from '@/components/calendar/calendarModel';
import type { Translations } from '@/store/translations';
import { timelineHourRange, type DayActivityBlock } from '@/utils/dayActivity';
import type { Meeting } from '@/utils/meetings';
import { fontFamily, radius, theme } from '@/constants/theme';

const GUTTER = 44;
// DS v2: «зараз» — coral-тік, відстежений час — success, наради — info.
const NOW_COLOR = theme.light.accent.coral;
const TRACK_COLOR = theme.light.status.success;
const MEETING_COLOR = theme.light.status.info;

export interface DayActivityTimelineProps {
  meetings: readonly Meeting[];
  activity: readonly DayActivityBlock[];
  /** Хвилини від початку дня; null — лінію «зараз» не малювати. */
  nowMin: number | null;
  onOpenMeeting: (meeting: Meeting) => void;
  colors: { text: string; sub: string; border: string; dim: string };
  tr: Translations;
  hourHeight?: number;
}

function hh(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function DayActivityTimeline({
  meetings, activity, nowMin, onOpenMeeting, colors: c, tr, hourHeight = 36,
}: DayActivityTimelineProps) {
  const positioned = useMemo(() => layoutDayMeetings(meetings), [meetings]);
  const { startHour, endHour } = useMemo(
    () => timelineHourRange([...positioned, ...activity], nowMin),
    [positioned, activity, nowMin],
  );
  const hours = endHour - startHour;
  const height = hours * hourHeight;
  const y = (min: number) => ((min - startHour * 60) / 60) * hourHeight;

  return (
    <View testID="day-activity-timeline">
      <View style={st.legend}>
        <LegendDot color={MEETING_COLOR} label={tr.todayPaneMeetings} textColor={c.sub} />
        <LegendDot color={TRACK_COLOR} label={tr.todayPaneTracked} textColor={c.sub} />
      </View>
      <View style={[st.grid, { height, backgroundColor: c.dim }]}>
        {Array.from({ length: hours }, (_, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View pointerEvents="none" style={[st.hourLine, { top: i * hourHeight, backgroundColor: c.border }]} />}
            <Text style={[st.hourLabel, { top: i * hourHeight + 2, color: c.sub }]}>{hh((startHour + i) * 60)}</Text>
          </React.Fragment>
        ))}

        {/* Зустрічі: ліва доріжка, перекриття діляться шириною. */}
        <View style={[st.lane, { left: GUTTER, right: '34%' }]}>
          {positioned.map(p => {
            const top = y(p.startMin);
            const h = Math.max(14, y(p.endMin) - top);
            return (
              <TouchableOpacity
                key={`${p.meeting.id}:${p.meeting.date}`}
                testID="day-activity-meeting"
                onPress={() => onOpenMeeting(p.meeting)}
                accessibilityRole="button"
                accessibilityLabel={`${hh(p.startMin)}–${hh(p.endMin)} ${p.meeting.title}`}
                style={[st.block, {
                  top, height: h,
                  left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%`,
                }]}>
                <View style={[st.blockFill, { backgroundColor: p.meeting.color + '33' }]}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 10, fontFamily: fontFamily.semibold }}>{p.meeting.title}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Відстежений час: права доріжка. */}
        <View pointerEvents="none" style={[st.lane, { right: 4, width: '32%' }]}>
          {activity.map(b => {
            const top = y(b.startMin);
            const h = Math.max(3, y(b.endMin) - top);
            return (
              <View
                key={b.id}
                testID="day-activity-block"
                accessible
                accessibilityLabel={`${tr.todayPaneTracked}: ${hh(b.startMin)}–${hh(b.endMin)} ${b.label}`}
                style={[st.block, st.trackFill, {
                  top, height: h, left: 0, right: 0,
                  backgroundColor: TRACK_COLOR + (b.running ? '66' : '40'),
                }]}>
                {h >= 14 && <Text numberOfLines={1} style={{ color: c.text, fontSize: 9, fontFamily: fontFamily.semibold }}>{b.label}</Text>}
              </View>
            );
          })}
        </View>

        {nowMin != null && (
          <View
            pointerEvents="none"
            testID="day-activity-now"
            accessible
            accessibilityLabel={`${tr.todayPaneNow} ${hh(nowMin)}`}
            style={[st.nowLine, { top: y(nowMin) }]}>
            <View style={st.nowDot} />
            <View style={st.nowBar} />
          </View>
        )}
      </View>
    </View>
  );
}

function LegendDot({ color, label, textColor }: { color: string; label: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ color: textColor, fontSize: 12, fontFamily: fontFamily.regular }}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  legend:    { flexDirection: 'row', gap: 14, marginBottom: 8 },
  grid:      { borderRadius: radius.nested, overflow: 'hidden' },
  hourLabel: { position: 'absolute', left: 0, width: GUTTER, fontSize: 10, fontFamily: fontFamily.medium, textAlign: 'center', fontVariant: ['tabular-nums'] },
  hourLine:  { position: 'absolute', left: GUTTER, right: 0, height: StyleSheet.hairlineWidth },
  lane:      { position: 'absolute', top: 0, bottom: 0 },
  block:     { position: 'absolute', paddingHorizontal: 1, paddingVertical: 1 },
  blockFill: { flex: 1, borderRadius: 6, paddingHorizontal: 4, paddingTop: 1, overflow: 'hidden' },
  trackFill: { borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  nowLine:   { position: 'absolute', left: GUTTER - 4, right: 0, height: 8, marginTop: -4, flexDirection: 'row', alignItems: 'center' },
  nowDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: NOW_COLOR },
  nowBar:    { flex: 1, height: 1.5, backgroundColor: NOW_COLOR },
});
