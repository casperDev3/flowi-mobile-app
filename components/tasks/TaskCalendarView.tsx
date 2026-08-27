/**
 * components/tasks/TaskCalendarView.tsx
 *
 * Календарний режим екрана завдань: тиждень, місяць, квартал або рік.
 *
 * Який період показано й як між ними ходити — знає useCalendarNav; тут
 * лише малювання. Завдання приходять уже згрупованими за днями, бо
 * групування потрібне не тільки календарю.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BlurView } from 'expo-blur';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { CalSpan, useCalendarNav } from '@/hooks/use-calendar-nav';
import type { Translations } from '@/store/translations';
import { monthGrid } from '@/utils/dateUtils';

export interface CalendarTask {
  id: string;
  title: string;
  status: 'active' | 'done';
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
  projectId?: string;
  subtasks: { done: boolean }[];
}

export interface TaskCalendarViewProps<T extends CalendarTask> {
  nav: ReturnType<typeof useCalendarNav>;
  /** Завдання за днями; ключ — Date.toDateString(). */
  tasksByDate: Record<string, T[]>;
  /** Усі завдання — місячна й річна сітки рахують по них підсумки. */
  tasks: T[];
  /** Зустрічі за днями; ключ — YYYY-MM-DD. */
  meetingsByDate: Record<string, { id: string; title: string; time?: string }[]>;
  projects: { id: string; name: string; color: string }[];
  today: Date;
  weekdays: string[];
  months: string[];
  priorityMeta: Record<'high' | 'medium' | 'low', { label: string; color: string }>;
  /** Прогрес завдання у відсотках — рахує екран, бо це його правило. */
  getProgress: (task: T) => number;
  isOverdue: (task: T) => boolean;
  onSelectTask: (task: T) => void;
  onToggleTask: (taskId: string) => void;
  /** Тап по дню в місячній чи квартальній сітці. */
  onOpenDay: (date: Date) => void;
  colors: any;
  isDark: boolean;
  tr: Translations;
  locale: string;
}

export function TaskCalendarView<T extends CalendarTask>({
  nav, tasksByDate, tasks, meetingsByDate, projects, today, weekdays: WEEKDAYS_SHORT,
  months: MONTHS_UA, priorityMeta: PRIORITY, getProgress, isOverdue,
  onSelectTask, onToggleTask, onOpenDay, colors: c, isDark, tr, locale,
}: TaskCalendarViewProps<T>) {
  return (
          <View>
            {/* Span selector */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
              {(['week', 'month', 'quarter', 'year'] as CalSpan[]).map(span => (
                <TouchableOpacity
                  key={span}
                  onPress={() => { nav.setSpan(span); if (span === 'week') nav.setViewDate(nav.weekDay); }}
                  style={[st.sortChip, {
                    flex: 1, justifyContent: 'center',
                    backgroundColor: nav.span === span ? c.accent + '20' : c.dim,
                    borderColor: nav.span === span ? c.accent : c.border,
                  }]}>
                  <Text style={{ color: nav.span === span ? c.accent : c.sub, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>
                    {span === 'week' ? tr.week : span === 'month' ? tr.month : span === 'quarter' ? tr.quarter : tr.year}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Nav header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <TouchableOpacity onPress={nav.prev} style={st.navBtn}>
                <IconSymbol name="chevron.left" size={18} color={c.sub} />
              </TouchableOpacity>
              <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 15, fontWeight: '700' }}>{nav.headerLabel}</Text>
              <TouchableOpacity onPress={nav.next} style={st.navBtn}>
                <IconSymbol name="chevron.right" size={18} color={c.sub} />
              </TouchableOpacity>
            </View>

            {/* WEEK */}
            {nav.span === 'week' && (() => {
              const weekDayTasks = tasksByDate[nav.weekDay.toDateString()] ?? [];
              const weekActiveTasks = weekDayTasks.filter(t => t.status === 'active');
              const weekDoneTasks = weekDayTasks.filter(t => t.status === 'done');
              return (
                <View>
                  {/* 7-day strip */}
                  <View style={{ flexDirection: 'row', gap: 3, marginBottom: 20 }}>
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = new Date(nav.weekMonday); d.setDate(d.getDate() + i);
                      const dayTasks = tasksByDate[d.toDateString()] ?? [];
                      const isToday = d.toDateString() === today.toDateString();
                      const isSel = d.toDateString() === nav.weekDay.toDateString();
                      const cnt = dayTasks.length;
                      const hasActive = dayTasks.some(t => t.status === 'active');
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => nav.setWeekDay(d)}
                          activeOpacity={0.75}
                          style={{
                            flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16,
                            backgroundColor: isSel ? c.accent : isToday ? c.accent + '18' : c.dim,
                            borderWidth: 1,
                            borderColor: isSel ? c.accent : isToday ? c.accent + '60' : c.border,
                          }}>
                          <Text style={{
                            fontSize: 10, fontWeight: '600', marginBottom: 4,
                            color: isSel ? 'rgba(255,255,255,0.75)' : isToday ? c.accent : c.sub,
                          }}>
                            {WEEKDAYS_SHORT[i]}
                          </Text>
                          <Text style={{
                            fontSize: 15, fontWeight: '800', lineHeight: 18,
                            color: isSel ? '#fff' : isToday ? c.accent : c.text,
                          }}>
                            {d.getDate()}
                          </Text>
                          <View style={{ marginTop: 6, height: 5, alignItems: 'center', justifyContent: 'center' }}>
                            {cnt > 0 && (
                              <View style={{
                                width: cnt > 3 ? 14 : cnt * 5,
                                height: 5, borderRadius: 3,
                                backgroundColor: isSel
                                  ? 'rgba(255,255,255,0.55)'
                                  : hasActive ? c.accent : '#10B981',
                              }} />
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Selected day header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', flex: 1, textTransform: 'capitalize' }}>
                      {nav.weekDay.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </Text>
                    {weekDayTasks.length > 0 && (
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {weekActiveTasks.length > 0 && (
                          <View style={{ backgroundColor: c.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>{weekActiveTasks.length} {tr.active}</Text>
                          </View>
                        )}
                        {weekDoneTasks.length > 0 && (
                          <View style={{ backgroundColor: '#10B98120', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700' }}>{weekDoneTasks.length} {tr.done}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Task list for selected day */}
                  {weekDayTasks.length === 0 ? (
                    <View style={{ alignItems: 'center', paddingVertical: 32, borderRadius: 16, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }}>
                      <IconSymbol name="calendar.badge.checkmark" size={28} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginTop: 8 }}>{tr.noTasksForDay}</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {weekDayTasks.map(task => {
                        const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
                        const prog = getProgress(task);
                        const overdue = isOverdue(task);
                        const prioColor = PRIORITY[task.priority].color;
                        return (
                          <TouchableOpacity
                            key={task.id}
                            onPress={() => onSelectTask(task)}
                            activeOpacity={0.75}>
                            <BlurView
                              intensity={isDark ? 18 : 35}
                              tint={isDark ? 'dark' : 'light'}
                              style={{
                                borderRadius: 16, borderWidth: 1,
                                borderColor: task.status === 'done' ? c.border : overdue ? '#EF444450' : c.border,
                                padding: 13, overflow: 'hidden',
                              }}>
                              {/* Priority stripe */}
                              <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: task.status === 'done' ? '#10B981' : prioColor, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }} />
                              <View style={{ marginLeft: 8 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                                  <AnimatedCheck
                                    checked={task.status === 'done'}
                                    color="#10B981"
                                    borderColor={c.border}
                                    size={22}
                                    radius={7}
                                    onPress={() => onToggleTask(task.id)}
                                    hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                                    style={{ marginTop: 1, flexShrink: 0 }}
                                  />
                                  <Text style={{ flex: 1, color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 20, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }}>
                                    {task.title}
                                  </Text>
                                </View>

                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, marginLeft: 32 }}>
                                  <View style={[st.badge, { backgroundColor: prioColor + '18', borderColor: prioColor + '40' }]}>
                                    <View style={[st.dot, { backgroundColor: prioColor, width: 6, height: 6 }]} />
                                    <Text style={{ color: prioColor, fontSize: 10, fontWeight: '700', marginLeft: 3 }}>{PRIORITY[task.priority].label}</Text>
                                  </View>
                                  {proj && (
                                    <View style={[st.badge, { backgroundColor: proj.color + '18', borderColor: proj.color + '45' }]}>
                                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: proj.color }} />
                                      <Text style={{ color: proj.color, fontSize: 10, fontWeight: '600', marginLeft: 3 }}>{proj.name}</Text>
                                    </View>
                                  )}
                                  {task.subtasks.length > 0 && (
                                    <View style={[st.badge, { backgroundColor: c.dim, borderColor: c.border }]}>
                                      <IconSymbol name="list.bullet" size={9} color={c.sub} />
                                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginLeft: 3 }}>{task.subtasks.filter(s => st.done).length}/{task.subtasks.length}</Text>
                                    </View>
                                  )}
                                </View>

                                {(prog > 0 || task.subtasks.length > 0) && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginLeft: 32 }}>
                                    <View style={[st.progressBg, { flex: 1 }]}>
                                      <View style={[st.progressFill, { width: `${prog}%`, backgroundColor: task.status === 'done' ? '#10B981' : c.accent }]} />
                                    </View>
                                    <Text style={[st.pct, { color: c.sub }]}>{prog}%</Text>
                                  </View>
                                )}
                              </View>
                            </BlurView>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* MONTH */}
            {nav.span === 'month' && (() => {
              const yr = nav.viewDate.getFullYear();
              const mo = nav.viewDate.getMonth();
              const weeks = monthGrid(yr, mo);
              return (
                <View>
                  <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                    {WEEKDAYS_SHORT.map(d => (
                      <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                    ))}
                  </View>
                  {weeks.map((week, wi) => (
                    <View key={wi} style={{ flexDirection: 'row', marginBottom: 6 }}>
                      {week.map((day, di) => {
                        if (!day) return <View key={di} style={{ flex: 1 }} />;
                        const d = new Date(yr, mo, day);
                        const dayTasks = tasksByDate[d.toDateString()] ?? [];
                        const dayMeets = meetingsByDate[d.toISOString().slice(0, 10)] ?? [];
                        const isToday = d.toDateString() === today.toDateString();
                        const cnt = dayTasks.length;
                        const activeCnt = dayTasks.filter(t => t.status === 'active').length;
                        const hasMeet = dayMeets.length > 0;
                        const hasAny = cnt > 0 || hasMeet;
                        return (
                          <TouchableOpacity
                            key={di}
                            onPress={() => hasAny ? onOpenDay(d) : undefined}
                            activeOpacity={hasAny ? 0.7 : 1}
                            style={{ flex: 1, alignItems: 'center' }}>
                            <View style={[
                              { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
                              isToday && { backgroundColor: c.accent },
                              hasAny && !isToday && { backgroundColor: c.accent + '1A' },
                            ]}>
                              <Text style={{ color: isToday ? '#fff' : hasAny ? c.accent : c.text, fontSize: 13, fontWeight: isToday || hasAny ? '700' : '400' }}>{day}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 2, marginTop: 2, minHeight: 10 }}>
                              {cnt > 0 && <View style={{ backgroundColor: activeCnt > 0 ? c.accent : '#10B981', borderRadius: 3, paddingHorizontal: 3, minWidth: 12, alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{cnt}</Text>
                              </View>}
                              {hasMeet && <View style={{ backgroundColor: '#6366F1', borderRadius: 3, paddingHorizontal: 3, minWidth: 12, alignItems: 'center' }}>
                                <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{dayMeets.length}</Text>
                              </View>}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* QUARTER */}
            {nav.span === 'quarter' && (() => {
              const yr = nav.viewDate.getFullYear();
              const qStart = Math.floor(nav.viewDate.getMonth() / 3) * 3;
              return (
                <View style={{ gap: 24 }}>
                  {[0, 1, 2].map(offset => {
                    const mo = qStart + offset;
                    const weeks = monthGrid(yr, mo);
                    return (
                      <View key={mo}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginBottom: 6 }}>{MONTHS_UA[mo]}</Text>
                        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {WEEKDAYS_SHORT.map(d => (
                            <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{d}</Text>
                          ))}
                        </View>
                        {weeks.map((week, wi) => (
                          <View key={wi} style={{ flexDirection: 'row', marginBottom: 2 }}>
                            {week.map((day, di) => {
                              if (!day) return <View key={di} style={{ flex: 1 }} />;
                              const d = new Date(yr, mo, day);
                              const dayTasks = tasksByDate[d.toDateString()] ?? [];
                              const isToday = d.toDateString() === today.toDateString();
                              const cnt = dayTasks.length;
                              return (
                                <TouchableOpacity
                                  key={di}
                                  onPress={() => cnt > 0 ? onOpenDay(d) : undefined}
                                  activeOpacity={cnt > 0 ? 0.7 : 1}
                                  style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                                  <View style={[
                                    { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
                                    isToday && { backgroundColor: c.accent },
                                    cnt > 0 && !isToday && { backgroundColor: c.accent + '1A' },
                                  ]}>
                                    <Text style={{ color: isToday ? '#fff' : cnt > 0 ? c.accent : c.text, fontSize: 10, fontWeight: cnt > 0 || isToday ? '700' : '400' }}>{day}</Text>
                                  </View>
                                  {cnt > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: c.accent, marginTop: 1 }} />}
                                  {cnt === 0 && <View style={{ height: 5 }} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* YEAR */}
            {nav.span === 'year' && (() => {
              const yr = nav.viewDate.getFullYear();
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {MONTHS_UA.map((mName, mo) => {
                    const monthTasks = tasks.filter(t => {
                      if (!t.deadline) return false;
                      const d = new Date(t.deadline);
                      return d.getFullYear() === yr && d.getMonth() === mo;
                    });
                    const cnt = monthTasks.length;
                    const activeCnt = monthTasks.filter(t => t.status === 'active').length;
                    const isCurrent = today.getFullYear() === yr && today.getMonth() === mo;
                    return (
                      <TouchableOpacity
                        key={mo}
                        onPress={() => { nav.setSpan('month'); nav.setViewDate(new Date(yr, mo, 1)); }}
                        activeOpacity={0.75}
                        style={{
                          width: '30.5%',
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: isCurrent ? c.accent : c.border,
                          backgroundColor: isCurrent ? c.accent + '14' : c.dim,
                          paddingVertical: 14,
                          paddingHorizontal: 10,
                          alignItems: 'center',
                          gap: 5,
                        }}>
                        <Text style={{ color: isCurrent ? c.accent : c.text, fontSize: 12, fontWeight: '700' }}>{mName.slice(0, 3)}</Text>
                        {cnt > 0 ? (
                          <View style={{ backgroundColor: activeCnt > 0 ? c.accent : '#10B981', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, minWidth: 20, alignItems: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{cnt}</Text>
                          </View>
                        ) : (
                          <Text style={{ color: c.sub, fontSize: 11, opacity: 0.5 }}>—</Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}
          </View>
  );
}

const st = StyleSheet.create({
  sortChip:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  badge:        { flexDirection: 'row', alignItems: 'center', borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3 },
  progressBg:   { height: 3, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  pct:          { fontSize: 11, fontWeight: '600', minWidth: 30, fontVariant: ['tabular-nums'] },
  navBtn:       { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  done:         { textDecorationLine: 'line-through' },
});
