import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';
import { useTimerContext } from '@/store/timer-context';

type Shift = 'morning' | 'day' | 'evening' | 'night';

interface ShiftCfg { label: string; icon: IconSymbolName; color: string; hours: string; }

const SHIFTS: Record<Shift, ShiftCfg> = {
  morning: { label: 'Ранок',  icon: 'sun.horizon.fill', color: '#F59E0B', hours: '06–12' },
  day:     { label: 'День',   icon: 'sun.max.fill',     color: '#EF4444', hours: '12–18' },
  evening: { label: 'Вечір',  icon: 'sunset.fill',      color: '#8B5CF6', hours: '18–24' },
  night:   { label: 'Ніч',    icon: 'moon.fill',        color: '#0EA5E9', hours: '00–06' },
};

interface TimeEntry { id: string; task: string; shift: Shift; duration: number; date: string; }

const MONTHS_UA = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WEEKDAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
};
const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
};

export default function TimeScreen() {
  const isDark = useColorScheme() === 'dark';
  const { pendingTask, setPendingTask } = useTimerContext();

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [activeShift, setActiveShift] = useState<Shift>('morning');
  const [taskName, setTaskName] = useState('');
  const [selected, setSelected] = useState<TimeEntry | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [manTask, setManTask] = useState('');
  const [manHours, setManHours] = useState('');
  const [manMins, setManMins] = useState('');
  const [manShift, setManShift] = useState<Shift>('morning');

  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from storage
  useEffect(() => {
    loadData<TimeEntry[]>('time_entries', []).then(data => {
      setEntries(data);
      setInitialized(true);
    });
  }, []);

  // Save to storage
  useEffect(() => {
    if (initialized) saveData('time_entries', entries);
  }, [entries, initialized]);

  // Pick up task from tasks screen
  useFocusEffect(useCallback(() => {
    if (pendingTask && !running) {
      setTaskName(pendingTask);
      setPendingTask('');
    }
  }, [pendingTask, running, setPendingTask]));

  useEffect(() => {
    if (running) {
      interval.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (interval.current) clearInterval(interval.current);
    }
    return () => { if (interval.current) clearInterval(interval.current); };
  }, [running]);

  const toggle = () => {
    if (running) {
      if (elapsed > 0) {
        setEntries(p => [{ id: Date.now().toString(), task: taskName.trim() || 'Без назви', shift: activeShift, duration: elapsed, date: new Date().toISOString() }, ...p]);
      }
      setElapsed(0); setRunning(false);
    } else {
      setRunning(true);
    }
  };

  const addManual = () => {
    const h = parseInt(manHours || '0', 10), m = parseInt(manMins || '0', 10);
    const dur = h * 3600 + m * 60;
    if (!dur || !manTask.trim()) return;
    setEntries(p => [{ id: Date.now().toString(), task: manTask.trim(), shift: manShift, duration: dur, date: new Date().toISOString() }, ...p]);
    setManTask(''); setManHours(''); setManMins(''); setShowAdd(false);
  };

  const deleteEntry = (id: string) => { setEntries(p => p.filter(e => e.id !== id)); if (selected?.id === id) setSelected(null); };

  const total = entries.reduce((s, e) => s + e.duration, 0);
  const avg   = entries.length > 0 ? Math.round(total / entries.length) : 0;
  const byShift: Record<Shift, number> = { morning: 0, day: 0, evening: 0, night: 0 };
  entries.forEach(e => { byShift[e.shift] += e.duration; });

  const filteredEntries = useMemo(() => {
    if (!dateFilter) return entries;
    return entries.filter(e => new Date(e.date).toDateString() === dateFilter);
  }, [entries, dateFilter]);

  const groups = useMemo(() => {
    const map: Record<string, { label: string; items: TimeEntry[]; dayTotal: number }> = {};
    const order: string[] = [];
    filteredEntries.forEach(e => {
      const d = new Date(e.date);
      const key = d.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(d), items: [], dayTotal: 0 }; order.push(key); }
      map[key].items.push(e);
      map[key].dayTotal += e.duration;
    });
    return order.map(k => map[k]);
  }, [filteredEntries]);

  // Calendar helpers
  const firstDay = (() => { const d = new Date(calYear, calMonth, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calCells.push(null);
  for (let i = 1; i <= daysInMonth; i++) calCells.push(i);
  while (calCells.length % 7 !== 0) calCells.push(null);
  const calWeeks = chunk(calCells, 7);

  const markedDays = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => {
      const d = new Date(e.date);
      set.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return set;
  }, [entries]);

  const c = {
    bg1:    isDark ? '#0A0C18' : '#EEF0FF',
    bg2:    isDark ? '#121525' : '#E2E5FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text:   isDark ? '#EEF0FF' : '#0D1033',
    sub:    isDark ? 'rgba(238,240,255,0.45)' : 'rgba(13,16,51,0.45)',
    accent: running ? '#EF4444' : '#6366F1',
    indigo: '#6366F1',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(10,12,24,0.98)' : 'rgba(250,251,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={{ marginTop: 14, marginBottom: 24, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>Трекер часу</Text>
            <TouchableOpacity
              onPress={() => setShowCal(true)}
              style={[s.headerBtn, { backgroundColor: dateFilter ? c.indigo : c.dim, borderColor: dateFilter ? c.indigo : c.border }]}>
              <IconSymbol name="calendar" size={17} color={dateFilter ? '#fff' : c.sub} />
            </TouchableOpacity>
          </View>

          {/* Date filter chip */}
          {dateFilter && (
            <TouchableOpacity
              onPress={() => setDateFilter(null)}
              style={[s.dateChip, { backgroundColor: c.indigo + '20', borderColor: c.indigo + '60' }]}>
              <IconSymbol name="calendar" size={13} color={c.indigo} />
              <Text style={{ color: c.indigo, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
                {new Date(dateFilter).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
              </Text>
              <IconSymbol name="xmark" size={13} color={c.indigo} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}

          {/* Timer Card */}
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.timerCard, { borderColor: running ? c.accent + '80' : c.border }]}>
            {taskName.trim() !== '' && (
              <View style={[s.activeTaskBanner, { backgroundColor: running ? '#EF444415' : c.indigo + '12', borderColor: running ? '#EF444430' : c.indigo + '30' }]}>
                <IconSymbol name={running ? 'record.circle' : 'timer'} size={13} color={running ? '#EF4444' : c.indigo} />
                <Text style={{ color: running ? '#EF4444' : c.indigo, fontSize: 12, fontWeight: '600', marginLeft: 6, flex: 1 }} numberOfLines={1}>
                  {taskName}
                </Text>
                {running && <View style={s.pulseDot} />}
              </View>
            )}

            <Text style={[s.clock, { color: running ? '#EF4444' : c.text, marginTop: taskName.trim() ? 16 : 0 }]}>{fmtClock(elapsed)}</Text>

            {!running ? (
              <TextInput
                placeholder="Назва завдання..."
                placeholderTextColor={c.sub}
                value={taskName}
                onChangeText={setTaskName}
                style={[s.taskInput, { color: c.text, borderColor: c.border }]}
                textAlign="center"
              />
            ) : (
              <Text style={[s.runLabel, { color: c.sub }]}>{taskName || 'Відстеження...'}</Text>
            )}

            {!running ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 18 }}>
                {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                  const cfg = SHIFTS[sh]; const active = activeShift === sh;
                  return (
                    <TouchableOpacity
                      key={sh}
                      onPress={() => setActiveShift(sh)}
                      style={[s.shiftPill, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                      <IconSymbol name={cfg.icon} size={14} color={active ? cfg.color : c.sub} />
                      <Text style={{ fontSize: 11, fontWeight: '600', marginLeft: 3, color: active ? cfg.color : c.sub }}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={[s.shiftBadge, { borderColor: SHIFTS[activeShift].color + '50', backgroundColor: SHIFTS[activeShift].color + '15', marginTop: 12, marginBottom: 18 }]}>
                <IconSymbol name={SHIFTS[activeShift].icon} size={13} color={SHIFTS[activeShift].color} />
                <Text style={{ color: SHIFTS[activeShift].color, fontSize: 12, fontWeight: '700', marginLeft: 5 }}>
                  {SHIFTS[activeShift].label} · {SHIFTS[activeShift].hours}
                </Text>
              </View>
            )}

            <TouchableOpacity onPress={toggle} style={[s.timerBtn, { backgroundColor: c.accent }]} activeOpacity={0.85}>
              <IconSymbol name={running ? 'stop.fill' : 'play.fill'} size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 7 }}>{running ? 'Зупинити' : 'Почати'}</Text>
            </TouchableOpacity>
          </BlurView>

          {/* Stats */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card, marginTop: 14 }]}>
            <StatCell value={total > 0 ? fmtDur(total) : '—'} label="Всього"  color={c.indigo} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={String(entries.length)}           label="Сесій"   color="#10B981" sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={avg > 0 ? fmtDur(avg) : '—'}     label="Середнє" color="#F59E0B" sub={c.sub} />
          </View>

          {/* Shift breakdown */}
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.breakCard, { borderColor: c.border, marginTop: 14 }]}>
            <Text style={[s.sectionTitle, { color: c.text, marginBottom: 16 }]}>По змінах</Text>
            {(Object.keys(SHIFTS) as Shift[]).map(sh => {
              const cfg = SHIFTS[sh]; const dur = byShift[sh]; const pct = total > 0 ? Math.round((dur / total) * 100) : 0;
              return (
                <View key={sh} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <IconSymbol name={cfg.icon} size={13} color={dur > 0 ? cfg.color : c.sub} />
                    <Text style={{ color: dur > 0 ? c.text : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 7, flex: 1 }}>{cfg.label}</Text>
                    <Text style={{ color: c.sub, fontSize: 10, marginRight: 10 }}>{cfg.hours}</Text>
                    <Text style={{ color: dur > 0 ? cfg.color : c.sub, fontSize: 12, fontWeight: '700' }}>{dur > 0 ? fmtDur(dur) : '—'}</Text>
                  </View>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                  </View>
                </View>
              );
            })}
          </BlurView>

          {/* History */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 4 }}>
            <Text style={[s.sectionTitle, { color: c.text, flex: 1 }]}>Історія</Text>
          </View>

          {filteredEntries.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <IconSymbol name="clock.fill" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>Ще немає записів</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7 }}>Натисніть + для ручного запису</Text>
            </View>
          )}

          {groups.map(group => (
            <View key={group.label} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 14 }}>
                <Text style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{group.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <IconSymbol name="timer" size={11} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>{fmtDur(group.dayTotal)}</Text>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                {group.items.map(entry => {
                  const cfg = SHIFTS[entry.shift];
                  return (
                    <TouchableOpacity key={entry.id} activeOpacity={0.75} onPress={() => setSelected(entry)}>
                      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.entryCard, { borderColor: c.border }]}>
                        <View style={[s.shiftIcon, { backgroundColor: cfg.color + '20' }]}>
                          <IconSymbol name={cfg.icon} size={17} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 13 }}>
                          <Text style={[s.entryTask, { color: c.text }]}>{entry.task}</Text>
                          <Text style={[s.entryMeta, { color: c.sub }]}>{cfg.label} · {cfg.hours}</Text>
                        </View>
                        <Text style={[s.entryDur, { color: cfg.color }]}>{fmtDur(entry.duration)}</Text>
                      </BlurView>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAdd(true)} style={[s.fab, { backgroundColor: c.indigo }]} activeOpacity={0.85}>
        <IconSymbol name="plus" size={26} color="#fff" />
      </TouchableOpacity>

      {/* ─── Calendar Modal ─── */}
      <Modal visible={showCal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowCal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowCal(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>

                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowCal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.left" size={20} color={c.sub} />
                  </TouchableOpacity>
                  <Text style={{ flex: 1, textAlign: 'center', color: c.text, fontSize: 16, fontWeight: '700' }}>
                    {MONTHS_UA[calMonth]} {calYear}
                  </Text>
                  <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} style={s.navBtn}>
                    <IconSymbol name="chevron.right" size={20} color={c.sub} />
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                  {WEEKDAYS_SHORT.map(d => (
                    <Text key={d} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 11, fontWeight: '600' }}>{d}</Text>
                  ))}
                </View>

                {calWeeks.map((week, wi) => (
                  <View key={wi} style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {week.map((day, di) => {
                      if (!day) return <View key={di} style={{ flex: 1 }} />;
                      const dayDate = new Date(calYear, calMonth, day);
                      const keyStr = `${calYear}-${calMonth}-${day}`;
                      const isToday = dayDate.toDateString() === today.toDateString();
                      const isSel = dateFilter === dayDate.toDateString();
                      const hasMark = markedDays.has(keyStr);
                      return (
                        <TouchableOpacity
                          key={di}
                          onPress={() => { setDateFilter(isSel ? null : dayDate.toDateString()); setShowCal(false); }}
                          style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
                          <View style={[s.dayCell, isSel && { backgroundColor: c.indigo }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.indigo }]}>
                            <Text style={{ color: isSel ? '#fff' : isToday ? c.indigo : c.text, fontSize: 13, fontWeight: isToday || isSel ? '700' : '400' }}>{day}</Text>
                          </View>
                          {hasMark && !isSel && <View style={[s.daydot, { backgroundColor: c.indigo }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {dateFilter && (
                  <TouchableOpacity onPress={() => { setDateFilter(null); setShowCal(false); }} style={[s.clearBtn, { borderColor: c.border }]}>
                    <IconSymbol name="xmark" size={13} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 5 }}>Скинути фільтр</Text>
                  </TouchableOpacity>
                )}
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Add Manual ─── */}
      <Modal visible={showAdd} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <View style={s.handleRow}>
                    <View style={{ flex: 1 }} />
                    <View style={[s.handle, { backgroundColor: c.border }]} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <TouchableOpacity onPress={() => setShowAdd(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <IconSymbol name="xmark" size={17} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={[s.sheetTitle, { color: c.text }]}>Ручний запис</Text>

                  {/* Task name */}
                  <Text style={[s.label, { color: c.sub }]}>ЗАВДАННЯ</Text>
                  <TextInput
                    placeholder="Назва завдання..."
                    placeholderTextColor={c.sub}
                    value={manTask}
                    onChangeText={setManTask}
                    style={[s.input, { backgroundColor: c.dim, color: c.text }]}
                  />

                  {/* Duration block */}
                  <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ</Text>
                  <View style={[s.durBlock, { backgroundColor: c.indigo + '12', borderColor: c.indigo + '30' }]}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={manHours}
                        onChangeText={setManHours}
                        keyboardType="number-pad"
                        style={{ color: c.indigo, fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                      />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>год</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 28, fontWeight: '200', alignSelf: 'center', marginBottom: 16 }}>:</Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput
                        placeholder="0"
                        placeholderTextColor={c.sub}
                        value={manMins}
                        onChangeText={setManMins}
                        keyboardType="number-pad"
                        style={{ color: c.indigo, fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                      />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>хвил</Text>
                    </View>
                  </View>

                  {/* Shift */}
                  <Text style={[s.label, { color: c.sub }]}>ЗМІНА</Text>
                  <View style={{ flexDirection: 'row', gap: 7 }}>
                    {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                      const cfg = SHIFTS[sh]; const active = manShift === sh;
                      return (
                        <TouchableOpacity
                          key={sh}
                          onPress={() => setManShift(sh)}
                          style={[s.shiftOption, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                          <IconSymbol name={cfg.icon} size={16} color={active ? cfg.color : c.sub} />
                          <Text style={{ color: active ? cfg.color : c.sub, fontSize: 10, fontWeight: '600', marginTop: 3 }}>{cfg.label}</Text>
                          <Text style={{ color: active ? cfg.color : c.sub, fontSize: 9, opacity: 0.7 }}>{cfg.hours}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                    <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={addManual}
                      disabled={!manTask.trim()}
                      style={[s.btn, { flex: 2, backgroundColor: manTask.trim() ? c.indigo : c.dim }]}>
                      <IconSymbol name="timer" size={15} color={manTask.trim() ? '#fff' : c.sub} />
                      <Text style={{ color: manTask.trim() ? '#fff' : c.sub, fontWeight: '700', marginLeft: 6 }}>Зберегти</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Detail Modal ─── */}
      <Modal visible={!!selected} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setSelected(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              {selected && (() => {
                const cfg = SHIFTS[selected.shift];
                return (
                  <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <View style={s.handleRow}>
                        <View style={{ flex: 1 }} />
                        <View style={[s.handle, { backgroundColor: c.border }]} />
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <IconSymbol name="xmark" size={17} color={c.sub} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {/* Hero */}
                      <View style={[s.detailHero, { backgroundColor: cfg.color + '12', borderColor: cfg.color + '25' }]}>
                        <View style={[s.detailIcon, { backgroundColor: cfg.color + '25' }]}>
                          <IconSymbol name={cfg.icon} size={30} color={cfg.color} />
                        </View>
                        <Text style={[s.detailDur, { color: cfg.color, marginTop: 12 }]}>{fmtDur(selected.duration)}</Text>
                        <Text style={[s.detailTask, { color: c.text, marginTop: 4, textAlign: 'center' }]}>{selected.task}</Text>
                        <View style={[s.shiftBadge, { borderColor: cfg.color + '50', backgroundColor: cfg.color + '20', marginTop: 10 }]}>
                          <IconSymbol name={cfg.icon} size={12} color={cfg.color} />
                          <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700', marginLeft: 5 }}>
                            {cfg.label} · {cfg.hours}
                          </Text>
                        </View>
                      </View>

                      <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim, marginTop: 14 }]}>
                        <InfoRow icon="timer"    label="Тривалість"  value={fmtDur(selected.duration)} text={c.text} sub={c.sub} border={c.border} last={false} />
                        <InfoRow icon="calendar" label="Дата"        value={new Date(selected.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} text={c.text} sub={c.sub} border={c.border} last />
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                        <TouchableOpacity
                          onPress={() => deleteEntry(selected.id)}
                          style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                          <IconSymbol name="trash" size={15} color="#EF4444" />
                          <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>Видалити</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 2, backgroundColor: c.indigo }]}>
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Закрити</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  </BlurView>
                );
              })()}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 13 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon as IconSymbolName} size={14} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 80, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:   { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  headerBtn:   { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dateChip:    { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 14 },
  timerCard:   { borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20, overflow: 'hidden', alignItems: 'center' },
  activeTaskBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'stretch' },
  pulseDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#EF4444' },
  clock:       { fontSize: 52, fontWeight: '200', letterSpacing: -2 },
  taskInput:   { fontSize: 14, fontWeight: '500', borderBottomWidth: 1, paddingVertical: 7, minWidth: 220, textAlign: 'center', marginTop: 8 },
  runLabel:    { fontSize: 13, fontWeight: '500', marginTop: 5 },
  shiftPill:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  shiftBadge:  { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  timerBtn:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 14 },
  statsRow:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  breakCard:   { borderRadius: 18, borderWidth: 1, padding: 18, overflow: 'hidden' },
  progressBg:  { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill:{ height: '100%', borderRadius: 2 },
  sectionTitle:{ fontSize: 17, fontWeight: '800' },
  groupLabel:  { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  entryCard:   { borderRadius: 14, borderWidth: 1, padding: 13, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  shiftIcon:   { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  entryTask:   { fontSize: 13, fontWeight: '600' },
  entryMeta:   { fontSize: 11, marginTop: 2 },
  entryDur:    { fontSize: 13, fontWeight: '800' },
  fab:         { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 108 : 88, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.88 },
  durBlock:    { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start', marginBottom: 4 },
  detailHero:  { borderRadius: 18, borderWidth: 1, padding: 20, alignItems: 'center' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  input:       { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label:       { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  shiftOption: { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 11, alignItems: 'center' },
  btn:         { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon:  { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  detailDur:   { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  detailTask:  { fontSize: 15, fontWeight: '600', marginTop: 4 },
  infoBlock:   { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  navBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dayCell:     { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  daydot:      { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  clearBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
});
