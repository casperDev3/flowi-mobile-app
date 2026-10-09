/**
 * components/calendar/MonthGrid.tsx — місячна сітка календаря.
 *
 * Два режими клітинки:
 *   dots   — телефон: число, тонкі смуги спринтів і крапки (зустрічі/завдання);
 *            вміст дня читається у списку під сіткою.
 *   labels — планшет: у клітинці видно перші записи дня текстом.
 *
 * Смуги спринтів малюються ПОВЕРХ рядка тижня (абсолютно), а не в кожній
 * клітинці окремо: інакше спринт, що тягнеться через тиждень, розпадався б
 * на сім шматочків із розривами між клітинками.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Atlas } from '@/constants/atlas';
import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';

import { keyToDate, layoutSprintRow, type CalendarTaskItem, type SprintBar } from './calendarModel';
import type { CalendarColors } from './palette';

export interface MonthGridProps {
  rows: string[][];
  /** Місяць, що показано (0–11): дні сусідніх місяців приглушені. */
  month: number;
  todayKey: string;
  selectedKey: string;
  tasksByDay: Readonly<Record<string, CalendarTaskItem[]>>;
  meetingsByDay: Readonly<Record<string, Meeting[]>>;
  sprintBars: readonly SprintBar[];
  onSelectDay: (key: string) => void;
  mode: 'dots' | 'labels';
  c: CalendarColors;
  tr: Translations;
}

const DOT_ROW_HEIGHT = 56;
const LABEL_ROW_HEIGHT = 112;
const DATE_BOX = 26;

export function MonthGrid({
  rows, month, todayKey, selectedKey, tasksByDay, meetingsByDay, sprintBars, onSelectDay, mode, c, tr,
}: MonthGridProps) {
  const labels = mode === 'labels';
  const rowHeight = labels ? LABEL_ROW_HEIGHT : DOT_ROW_HEIGHT;
  const laneHeight = labels ? 15 : 4;
  const laneGap = labels ? 2 : 2;
  const maxLanes = labels ? 2 : 3;

  return (
    <View accessibilityRole="none">
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {tr.weekdays.map((w, i) => (
          <Text key={w} style={{ flex: 1, textAlign: 'center', color: i >= 5 ? c.accent : c.sub, fontSize: 11, fontWeight: '700' }}>{w}</Text>
        ))}
      </View>
      {rows.map(week => {
        const { segments, overflow } = layoutSprintRow(sprintBars, week, maxLanes);
        const lanesUsed = segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
        const sprintTop = DATE_BOX + 4;
        const contentTop = sprintTop + lanesUsed * (laneHeight + laneGap);
        // Під смугами спринтів текстових рядків влазить менше.
        const maxLines = labels ? 3 - Math.min(lanesUsed, 1) : 0;
        return (
          <View key={week[0]} style={{ height: rowHeight, flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.grid }}>
            {week.map((day, col) => {
              const d = keyToDate(day);
              const inMonth = d.getMonth() === month;
              const isToday = day === todayKey;
              const isSel = day === selectedKey;
              const tasks = tasksByDay[day] ?? [];
              const meetings = meetingsByDay[day] ?? [];
              const total = tasks.length + meetings.length;
              const a11y = `${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}, ${tr.calA11yTasks} ${tasks.length}, ${tr.calA11yMeetings} ${meetings.length}${overflow[col] ? `, ${tr.calA11ySprints} ${overflow[col]}+` : ''}`;
              return (
                <TouchableOpacity
                  key={day}
                  onPress={() => onSelectDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={a11y}
                  accessibilityState={{ selected: isSel }}
                  style={[st.cell, { opacity: inMonth ? 1 : 0.4, backgroundColor: isSel && labels ? c.accent + '12' : 'transparent' }]}>
                  <View style={[st.dateBox, isSel && !labels && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }, isSel && labels && { borderWidth: 1.5, borderColor: c.accent }]}>
                    <Text style={{ color: isSel && !labels ? '#fff' : isToday ? c.accent : c.text, fontSize: 13, fontWeight: isToday || isSel ? '800' : '500' }}>
                      {d.getDate()}
                    </Text>
                  </View>
                  {labels ? (
                    <View style={{ position: 'absolute', top: contentTop, left: 3, right: 3, gap: 2 }}>
                      {meetings.slice(0, maxLines).map(m => (
                        <Text key={m.id} numberOfLines={1} style={[st.label, { color: c.text, backgroundColor: m.color + '22', borderLeftColor: m.color }]}>
                          {m.time ? `${m.time} ` : ''}{m.title}
                        </Text>
                      ))}
                      {tasks.slice(0, Math.max(0, maxLines - Math.min(maxLines, meetings.length))).map(t => (
                        <Text key={t.task.id} numberOfLines={1} style={[st.label, { color: c.text, opacity: t.done ? 0.5 : 1, textDecorationLine: t.done ? 'line-through' : 'none', borderLeftColor: t.color }]}>
                          {t.task.title}
                        </Text>
                      ))}
                      {total > maxLines ? <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700' }}>+{total - maxLines}</Text> : null}
                    </View>
                  ) : (
                    <View style={[st.dots, { top: contentTop }]}>
                      {meetings.length > 0 && <View style={[st.dot, { backgroundColor: c.accent }]} />}
                      {uniqueColors(tasks).slice(0, 3).map(color => (
                        <View key={color} style={[st.dotSquare, { backgroundColor: color }]} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
            {segments.map(seg => (
              <View
                key={seg.bar.sprint.id}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: sprintTop + seg.lane * (laneHeight + laneGap),
                  left: pct((seg.startCol / 7) * 100),
                  width: pct((seg.span / 7) * 100),
                  height: laneHeight,
                  paddingHorizontal: 1,
                }}>
                <View style={{
                  flex: 1,
                  backgroundColor: labels ? seg.bar.project.color + '33' : seg.bar.project.color,
                  borderLeftWidth: labels && !seg.continuesLeft ? 3 : 0,
                  borderLeftColor: seg.bar.project.color,
                  borderTopLeftRadius: seg.continuesLeft ? 0 : 4,
                  borderBottomLeftRadius: seg.continuesLeft ? 0 : 4,
                  borderTopRightRadius: seg.continuesRight ? 0 : 4,
                  borderBottomRightRadius: seg.continuesRight ? 0 : 4,
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}>
                  {labels ? (
                    <Text numberOfLines={1} style={{ color: c.text, fontSize: 10, fontWeight: '700' }}>
                      №{seg.bar.number} · {seg.bar.sprint.name}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Відсоток для left/width: шаблонний рядок TS не звужує до `${number}%`. */
export function pct(n: number): `${number}%` {
  return `${n}%` as `${number}%`;
}

function uniqueColors(tasks: readonly CalendarTaskItem[]): string[] {
  const seen = new Set<string>();
  for (const t of tasks) if (!t.done) seen.add(t.color);
  if (seen.size === 0 && tasks.length) seen.add(tasks[0].color + '80');
  return [...seen];
}

const st = StyleSheet.create({
  cell: { flex: 1, alignItems: 'center', paddingTop: 3, borderRadius: Atlas.radius.small },
  dateBox: { width: DATE_BOX, height: DATE_BOX, borderRadius: DATE_BOX / 2, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', flexDirection: 'row', gap: 3, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSquare: { width: 6, height: 6, borderRadius: 1.5 },
  label: { fontSize: 10, fontWeight: '600', paddingHorizontal: 3, paddingVertical: 1, borderLeftWidth: 2, borderRadius: 3, overflow: 'hidden' },
});
