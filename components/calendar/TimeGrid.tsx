/**
 * components/calendar/TimeGrid.tsx — погодинна сітка «Тиждень» / «День».
 *
 * Зверху — смуга «Весь день»: спринти (смуги кольору проєкту через кілька
 * днів) і дедлайни завдань (завдання не має часу — лише день). Нижче —
 * години 00–24 з нарадами, що стоять за часом і тривалістю; наради, що
 * перекриваються, діляться шириною колонки.
 *
 * Тап по порожній годині — створити запис на цей день і час. Перетягування
 * на мобільному немає навмисно (рішення власника): воно лише на вебі.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Translations } from '@/store/translations';
import type { Meeting } from '@/utils/meetings';
import type { Task } from '@/utils/taskUtils';

import {
  keyToDate, layoutDayMeetings, layoutSprintRow, type CalendarTaskItem, type SprintBar,
} from './calendarModel';
import { pct } from './MonthGrid';
import type { CalendarColors } from './palette';

const GUTTER = 48;
const HEADER_HEIGHT = 48;
const SPRINT_LANE = 18;

export interface TimeGridProps {
  days: readonly string[];
  todayKey: string;
  selectedKey: string;
  tasksByDay: Readonly<Record<string, CalendarTaskItem[]>>;
  meetingsByDay: Readonly<Record<string, Meeting[]>>;
  sprintBars: readonly SprintBar[];
  selectedMeetingKey?: string | null;
  onSelectDay: (day: string) => void;
  onMeetingPress: (m: Meeting) => void;
  onTaskPress: (task: Task) => void;
  onSlotPress: (day: string, hour: number) => void;
  onSprintPress?: (bar: SprintBar) => void;
  c: CalendarColors;
  tr: Translations;
  hourHeight?: number;
}

/**
 * З якої години відкрити сітку.
 *
 *   сьогодні в періоді й зараз робочий час (07–21) — година до «зараз»:
 *     видно лінію поточного часу й найближче;
 *   інакше — перша нарада періоду (щоб вона була в кадрі, а не за ним);
 *   нарад немає — 07:00: нічні години рідко потрібні першими.
 *
 * Стеля 18 — щоб унизу лишались години, а не порожнеча після 24:00.
 */
export function initialScrollHour(
  days: readonly string[],
  todayKey: string,
  meetingsByDay: Readonly<Record<string, readonly Pick<Meeting, 'time'>[]>>,
  now: Date,
): number {
  const clamp = (h: number) => Math.max(0, Math.min(h, 18));
  const nowHour = now.getHours();
  if (days.includes(todayKey) && nowHour >= 7 && nowHour < 21) return clamp(nowHour - 1);
  let first: number | null = null;
  for (const day of days) {
    for (const m of meetingsByDay[day] ?? []) {
      const h = Number.parseInt(String(m.time ?? '').slice(0, 2), 10);
      if (Number.isFinite(h) && (first === null || h < first)) first = h;
    }
  }
  return clamp(first ?? 7);
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function TimeGrid({
  days, todayKey, selectedKey, tasksByDay, meetingsByDay, sprintBars, selectedMeetingKey,
  onSelectDay, onMeetingPress, onTaskPress, onSlotPress, onSprintPress, c, tr, hourHeight = 52,
}: TimeGridProps) {
  const single = days.length === 1;
  const scrollRef = useRef<ScrollView | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Лінія «зараз» зсувається раз на хвилину — частіше нема сенсу.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Початкова прокрутка. Раніше scrollTo стояв у setTimeout(0) і часто
  // спрацьовував ДО того, як ScrollView розкладено, — сітка відкривалась на
  // 00:00, а ранкові наради лишались за кадром. Тепер ціль запам'ятовується
  // і застосовується, щойно ScrollView має розмір (onLayout) і вміст
  // (onContentSizeChange); `contentOffset` дає ту саму позицію ще на першому
  // кадрі там, де платформа його підтримує.
  const firstDay = days[0];
  // Наради підвантажуються асинхронно: коли вони приходять уже після першої
  // прокрутки, ціль перераховується один раз (false → true).
  const periodHasMeetings = days.some(d => (meetingsByDay[d] ?? []).length > 0);
  const initialHour = useMemo(
    () => initialScrollHour(days, todayKey, meetingsByDay, new Date()),
    // Лише при зміні показаного періоду, не на кожен ререндер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [firstDay, days.length, periodHasMeetings],
  );
  const pendingScrollY = useRef<number | null>(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const tryInitialScroll = useCallback(() => {
    const y = pendingScrollY.current;
    if (y == null || viewportHeight.current <= 0 || contentHeight.current <= 0) return;
    scrollRef.current?.scrollTo({ y, animated: false });
    pendingScrollY.current = null;
  }, []);
  useEffect(() => {
    pendingScrollY.current = initialHour * hourHeight;
    tryInitialScroll();
  }, [initialHour, hourHeight, tryInitialScroll]);

  const { segments } = useMemo(() => layoutSprintRow(sprintBars, days, 2), [sprintBars, days]);
  const lanesUsed = segments.reduce((m, s) => Math.max(m, s.lane + 1), 0);
  const maxTaskChips = single ? 6 : 3;
  const taskRows = Math.min(maxTaskChips, days.reduce((m, d) => Math.max(m, (tasksByDay[d] ?? []).length), 0));
  const hasOverflow = days.some(d => (tasksByDay[d] ?? []).length > maxTaskChips);
  const allDayHeight = (lanesUsed ? lanesUsed * (SPRINT_LANE + 2) + 4 : 0)
    + (taskRows ? taskRows * 22 + 4 : 0)
    + (hasOverflow ? 16 : 0);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = days.indexOf(todayKey);

  return (
    <View style={{ flex: 1 }}>
      {/* Шапка днів */}
      <View style={[st.headerRow, { borderBottomColor: c.grid }]}>
        <View style={{ width: GUTTER }} />
        {days.map(day => {
          const d = keyToDate(day);
          const isToday = day === todayKey;
          const isSel = day === selectedKey;
          return (
            <TouchableOpacity
              key={day}
              onPress={() => onSelectDay(day)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSel }}
              accessibilityLabel={`${tr.weekdaysFull[(d.getDay() + 6) % 7]}, ${d.getDate()} ${tr.monthsGenitive[d.getMonth()]}`}
              style={[st.dayHead, { flex: 1 }]}>
              <Text style={{ color: isToday ? c.accent : c.sub, fontSize: 11, fontWeight: '700' }}>
                {single ? tr.weekdaysFull[(d.getDay() + 6) % 7] : tr.weekdays[(d.getDay() + 6) % 7]}
              </Text>
              <View style={[st.dayNum, isToday && { backgroundColor: c.accent }, !isToday && isSel && { borderWidth: 1.5, borderColor: c.accent }]}>
                <Text style={{ color: isToday ? '#fff' : c.text, fontSize: 15, fontWeight: '800' }}>{d.getDate()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Весь день: спринти + дедлайни */}
      {allDayHeight > 0 && (
        <View style={[st.allDayRow, { borderBottomColor: c.grid }]}>
          <View style={[st.gutterCell, { width: GUTTER }]}>
            <Text style={{ color: c.sub, fontSize: 9, fontWeight: '700', textAlign: 'center' }}>{tr.calAllDay}</Text>
          </View>
          <View style={{ flex: 1, height: allDayHeight }}>
            {segments.map(seg => (
              <View
                key={seg.bar.sprint.id}
                style={{
                  position: 'absolute', top: 2 + seg.lane * (SPRINT_LANE + 2), height: SPRINT_LANE,
                  left: pct((seg.startCol / days.length) * 100), width: pct((seg.span / days.length) * 100), paddingHorizontal: 2,
                }}>
                <TouchableOpacity
                  onPress={() => onSprintPress?.(seg.bar)}
                  accessibilityRole="button"
                  accessibilityLabel={`${tr.calSprintA11y} ${seg.bar.number} · ${seg.bar.sprint.name} · ${seg.bar.project.name}`}
                  style={{
                    flex: 1, justifyContent: 'center', paddingHorizontal: 6,
                    backgroundColor: seg.bar.project.color + '33',
                    borderLeftWidth: seg.continuesLeft ? 0 : 3, borderLeftColor: seg.bar.project.color,
                    borderRadius: 4,
                  }}>
                  <Text numberOfLines={1} style={{ color: c.text, fontSize: 10, fontWeight: '700' }}>
                    №{seg.bar.number} · {seg.bar.sprint.name} · {seg.bar.project.name}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            <View style={{ position: 'absolute', left: 0, right: 0, top: lanesUsed ? lanesUsed * (SPRINT_LANE + 2) + 4 : 2, flexDirection: 'row' }}>
              {days.map(day => {
                const items = tasksByDay[day] ?? [];
                return (
                  <View key={day} style={{ flex: 1, paddingHorizontal: 2, gap: 2 }}>
                    {items.slice(0, maxTaskChips).map(item => (
                      <TouchableOpacity
                        key={item.task.id}
                        onPress={() => onTaskPress(item.task)}
                        accessibilityRole="button"
                        accessibilityLabel={`${tr.calA11yTask}: ${item.task.title}${item.done ? `, ${tr.done}` : ''}`}
                        hitSlop={{ top: 2, bottom: 2 }}
                        style={[st.taskChip, { borderLeftColor: item.color, backgroundColor: item.color + '1F', opacity: item.done ? 0.5 : 1 }]}>
                        <Text numberOfLines={1} style={{ color: c.text, fontSize: 10, fontWeight: '600', textDecorationLine: item.done ? 'line-through' : 'none' }}>
                          {item.task.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {items.length > maxTaskChips ? (
                      <TouchableOpacity onPress={() => onSelectDay(day)} accessibilityRole="button"
                        accessibilityLabel={`${tr.calMore} ${items.length - maxTaskChips}`}>
                        <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700', paddingHorizontal: 4 }}>+{items.length - maxTaskChips}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Години */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        contentOffset={{ x: 0, y: initialHour * hourHeight }}
        onLayout={e => { viewportHeight.current = e.nativeEvent.layout.height; tryInitialScroll(); }}
        onContentSizeChange={(_w, h) => { contentHeight.current = h; tryInitialScroll(); }}
        showsVerticalScrollIndicator={false}>
        {/* marginTop: підпис години стоїть на 6pt ВИЩЕ своєї лінії, і на
            стартовій прокрутці перша видима година (10:00) ховалась
            наполовину під рядком «весь день» (P2 аудиту 2026-10). */}
        <View style={{ flexDirection: 'row', height: 24 * hourHeight, marginTop: HOUR_LABEL_PAD }}>
          <View style={{ width: GUTTER }}>
            {Array.from({ length: 24 }, (_, h) => (
              <Text key={h} style={[st.hourLabel, { top: h * hourHeight - 6, color: c.sub }]}>{h === 0 ? '' : hourLabel(h)}</Text>
            ))}
          </View>
          {days.map((day, colIdx) => {
            const positioned = layoutDayMeetings(meetingsByDay[day] ?? []);
            return (
              <View key={day} style={{ flex: 1, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.grid }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <TouchableOpacity
                    key={h}
                    onPress={() => onSlotPress(day, h)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tr.calCreateAt} ${hourLabel(h)}`}
                    style={{ height: hourHeight, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.grid }}
                  />
                ))}
                {positioned.map(p => {
                  const top = (p.startMin / 60) * hourHeight;
                  const height = Math.max(20, ((p.endMin - p.startMin) / 60) * hourHeight - 2);
                  const m = p.meeting;
                  const sel = m.id === selectedMeetingKey;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => onMeetingPress(m)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={`${m.time || ''} ${m.title}`.trim()}
                      style={[st.event, {
                        top, height,
                        left: pct((p.col / p.cols) * 100),
                        width: pct((1 / p.cols) * 100),
                      }]}>
                      <View style={{
                        flex: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, overflow: 'hidden',
                        backgroundColor: m.color + (sel ? '55' : '2E'), borderLeftWidth: 3, borderLeftColor: m.color,
                      }}>
                        {/* Рядки рахуються від реальної висоти: 45-хвилинна
                            подія (≈37pt) раніше брала два рядки назви + рядок
                            часу, і час обрізався навпіл. */}
                        <Text numberOfLines={height < EVENT_STACK_MIN ? 1 : height < EVENT_TWO_LINE_MIN ? 1 : 2} style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>
                          {height < EVENT_STACK_MIN && m.time ? `${m.time} ` : ''}{m.title}
                        </Text>
                        {height >= EVENT_STACK_MIN && m.time ? (
                          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>{m.time}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
                {colIdx === todayIndex ? (
                  <View pointerEvents="none" style={[st.nowLine, { top: (nowMinutes / 60) * hourHeight }]}>
                    <View style={st.nowDot} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Відступ над сіткою годин, щоб підпис першої видимої години не різався. */
const HOUR_LABEL_PAD = 8;
/** Від цієї висоти події час іде окремим рядком під назвою (1 рядок назви + час). */
const EVENT_STACK_MIN = 32;
/** Від цієї висоти назва може зайняти два рядки над часом. */
const EVENT_TWO_LINE_MIN = 50;

const st = StyleSheet.create({
  headerRow: { flexDirection: 'row', height: HEADER_HEIGHT + 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  dayHead: { alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 2 },
  dayNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  allDayRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  gutterCell: { justifyContent: 'center', paddingHorizontal: 2 },
  taskChip: { height: 20, justifyContent: 'center', borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 4 },
  hourLabel: { position: 'absolute', right: 6, fontSize: 10, fontWeight: '600' },
  event: { position: 'absolute', paddingHorizontal: 1, paddingVertical: 1 },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#EF4444' },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
});
