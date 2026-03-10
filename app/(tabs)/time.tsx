import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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

type Shift = 'morning' | 'day' | 'evening' | 'night';

interface ShiftCfg { label: string; icon: IconSymbolName; color: string; hours: string; }

const SHIFTS: Record<Shift, ShiftCfg> = {
  morning: { label: 'Ранок',  icon: 'sun.horizon.fill', color: '#F59E0B', hours: '06–12' },
  day:     { label: 'День',   icon: 'sun.max.fill',     color: '#EF4444', hours: '12–18' },
  evening: { label: 'Вечір', icon: 'sunset.fill',      color: '#8B5CF6', hours: '18–24' },
  night:   { label: 'Ніч',   icon: 'moon.fill',        color: '#0EA5E9', hours: '00–06' },
};

interface TimeEntry { id: string; task: string; shift: Shift; duration: number; date: Date; }

const d = (daysAgo: number) => { const dt = new Date(); dt.setDate(dt.getDate() - daysAgo); return dt; };

const INITIAL: TimeEntry[] = [
  { id: '1', task: 'Розробка API',       shift: 'morning', duration: 7200, date: d(0) },
  { id: '2', task: 'Code review',        shift: 'day',     duration: 3600, date: d(0) },
  { id: '3', task: 'Планування спринту', shift: 'morning', duration: 2700, date: d(1) },
  { id: '4', task: 'Документація',       shift: 'evening', duration: 5400, date: d(1) },
  { id: '5', task: 'Тестування',         shift: 'day',     duration: 1800, date: d(3) },
];

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

const today = new Date();
const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
function groupLabel(date: Date) {
  if (date.toDateString() === today.toDateString()) return 'Сьогодні';
  if (date.toDateString() === yesterday.toDateString()) return 'Вчора';
  return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

export default function TimeScreen() {
  const isDark = useColorScheme() === 'dark';
  const [entries, setEntries] = useState<TimeEntry[]>(INITIAL);
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
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) { interval.current = setInterval(() => setElapsed(e => e + 1), 1000); }
    else { if (interval.current) clearInterval(interval.current); }
    return () => { if (interval.current) clearInterval(interval.current); };
  }, [running]);

  const toggle = () => {
    if (running) {
      if (elapsed > 0) setEntries(p => [{ id: Date.now().toString(), task: taskName.trim() || 'Без назви', shift: activeShift, duration: elapsed, date: new Date() }, ...p]);
      setElapsed(0); setRunning(false);
    } else setRunning(true);
  };

  const addManual = () => {
    const h = parseInt(manHours || '0', 10), m = parseInt(manMins || '0', 10);
    const dur = h * 3600 + m * 60;
    if (!dur || !manTask.trim()) return;
    setEntries(p => [{ id: Date.now().toString(), task: manTask.trim(), shift: manShift, duration: dur, date: new Date() }, ...p]);
    setManTask(''); setManHours(''); setManMins(''); setShowAdd(false);
  };

  const deleteEntry = (id: string) => { setEntries(p => p.filter(e => e.id !== id)); if (selected?.id === id) setSelected(null); };

  const total = entries.reduce((s, e) => s + e.duration, 0);
  const avg   = entries.length > 0 ? Math.round(total / entries.length) : 0;
  const byShift: Record<Shift, number> = { morning: 0, day: 0, evening: 0, night: 0 };
  entries.forEach(e => { byShift[e.shift] += e.duration; });

  // Group by date
  const groups = useMemo(() => {
    const map: Record<string, { label: string; items: TimeEntry[]; dayTotal: number }> = {};
    const order: string[] = [];
    entries.forEach(e => {
      const key = e.date.toDateString();
      if (!map[key]) { map[key] = { label: groupLabel(e.date), items: [], dayTotal: 0 }; order.push(key); }
      map[key].items.push(e);
      map[key].dayTotal += e.duration;
    });
    return order.map(k => map[k]);
  }, [entries]);

  const c = {
    bg1: isDark ? '#0A0C18' : '#EEF0FF',
    bg2: isDark ? '#121525' : '#E2E5FF',
    card: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text: isDark ? '#EEF0FF' : '#0D1033',
    sub: isDark ? 'rgba(238,240,255,0.45)' : 'rgba(13,16,51,0.45)',
    accent: running ? '#EF4444' : '#6366F1',
    indigo: '#6366F1',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(10,12,24,0.98)' : 'rgba(250,251,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 104 : 84 }} showsVerticalScrollIndicator={false}>

          <View style={{ marginTop: 10, marginBottom: 24 }}>
            <Text style={[s.pageTitle, { color: c.text }]}>Трекер часу</Text>
          </View>

          {/* Timer Card */}
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.timerCard, { borderColor: running ? c.accent + '70' : c.border }]}>
            <Text style={[s.clock, { color: running ? '#EF4444' : c.text }]}>{fmtClock(elapsed)}</Text>
            {!running
              ? <TextInput placeholder="Назва завдання..." placeholderTextColor={c.sub} value={taskName} onChangeText={setTaskName} style={[s.taskInput, { color: c.text, borderColor: c.border }]} textAlign="center" />
              : <Text style={[s.runLabel, { color: c.sub }]}>{taskName || 'Відстеження...'}</Text>
            }
            {!running ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 16 }}>
                {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                  const cfg = SHIFTS[sh]; const active = activeShift === sh;
                  return (
                    <TouchableOpacity key={sh} onPress={() => setActiveShift(sh)} style={[s.shiftPill, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                      <IconSymbol name={cfg.icon} size={14} color={active ? cfg.color : c.sub} />
                      <Text style={{ fontSize: 11, fontWeight: '600', marginLeft: 3, color: active ? cfg.color : c.sub }}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={[s.shiftBadge, { borderColor: SHIFTS[activeShift].color + '50', backgroundColor: SHIFTS[activeShift].color + '15', marginTop: 10, marginBottom: 14 }]}>
                <IconSymbol name={SHIFTS[activeShift].icon} size={13} color={SHIFTS[activeShift].color} />
                <Text style={{ color: SHIFTS[activeShift].color, fontSize: 12, fontWeight: '700', marginLeft: 5 }}>
                  {SHIFTS[activeShift].label} · {SHIFTS[activeShift].hours}
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={toggle} style={[s.timerBtn, { backgroundColor: c.accent }]} activeOpacity={0.85}>
              <IconSymbol name={running ? 'xmark' : 'timer'} size={15} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 6 }}>{running ? 'Зупинити' : 'Почати'}</Text>
            </TouchableOpacity>
          </BlurView>

          {/* Stats */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card, marginTop: 12 }]}>
            <StatCell value={total > 0 ? fmtDur(total) : '—'} label="Всього" color={c.indigo} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={String(entries.length)} label="Сесій" color="#10B981" sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={avg > 0 ? fmtDur(avg) : '—'} label="Середнє" color="#F59E0B" sub={c.sub} />
          </View>

          {/* Shift breakdown */}
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.breakCard, { borderColor: c.border, marginTop: 12 }]}>
            <Text style={[s.sectionTitle, { color: c.text, marginBottom: 14 }]}>По змінах</Text>
            {(Object.keys(SHIFTS) as Shift[]).map(sh => {
              const cfg = SHIFTS[sh]; const dur = byShift[sh]; const pct = total > 0 ? Math.round((dur / total) * 100) : 0;
              return (
                <View key={sh} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                    <IconSymbol name={cfg.icon} size={13} color={dur > 0 ? cfg.color : c.sub} />
                    <Text style={{ color: dur > 0 ? c.text : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 6, flex: 1 }}>{cfg.label}</Text>
                    <Text style={{ color: c.sub, fontSize: 10, marginRight: 8 }}>{cfg.hours}</Text>
                    <Text style={{ color: dur > 0 ? cfg.color : c.sub, fontSize: 12, fontWeight: '700' }}>{dur > 0 ? fmtDur(dur) : '—'}</Text>
                  </View>
                  <View style={s.progressBg}><View style={[s.progressFill, { width: `${pct}%`, backgroundColor: cfg.color }]} /></View>
                </View>
              );
            })}
          </BlurView>

          {/* History grouped by date */}
          <Text style={[s.sectionTitle, { color: c.text, marginTop: 20, marginBottom: 4 }]}>Історія</Text>

          {entries.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <IconSymbol name="clock.fill" size={36} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '500' }}>Ще немає записів</Text>
            </View>
          )}

          {groups.map(group => (
            <View key={group.label} style={{ marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, marginTop: 12 }}>
                <Text style={[s.groupLabel, { color: c.sub, flex: 1 }]}>{group.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <IconSymbol name="timer" size={11} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700' }}>{fmtDur(group.dayTotal)}</Text>
                </View>
              </View>
              <View style={{ gap: 7 }}>
                {group.items.map(entry => {
                  const cfg = SHIFTS[entry.shift];
                  return (
                    <TouchableOpacity key={entry.id} activeOpacity={0.7} onPress={() => setSelected(entry)}>
                      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.entryCard, { borderColor: c.border }]}>
                        <View style={[s.shiftIcon, { backgroundColor: cfg.color + '20' }]}>
                          <IconSymbol name={cfg.icon} size={17} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
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

      {/* Add Manual */}
      <Modal visible={showAdd} transparent animationType="fade" statusBarTranslucent>
        <Pressable style={s.overlay} onPress={() => setShowAdd(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <Text style={[s.sheetTitle, { color: c.text }]}>Ручний запис</Text>
              <TextInput placeholder="Назва завдання" placeholderTextColor={c.sub} value={manTask} onChangeText={setManTask} style={[s.input, { backgroundColor: c.dim, color: c.text }]} />
              <Text style={[s.label, { color: c.sub }]}>Тривалість</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput placeholder="Год" placeholderTextColor={c.sub} value={manHours} onChangeText={setManHours} keyboardType="number-pad" style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]} />
                <TextInput placeholder="Хвил" placeholderTextColor={c.sub} value={manMins} onChangeText={setManMins} keyboardType="number-pad" style={[s.input, { backgroundColor: c.dim, color: c.text, flex: 1, textAlign: 'center' }]} />
              </View>
              <Text style={[s.label, { color: c.sub }]}>Зміна</Text>
              <View style={{ flexDirection: 'row', gap: 7 }}>
                {(Object.keys(SHIFTS) as Shift[]).map(sh => {
                  const cfg = SHIFTS[sh]; const active = manShift === sh;
                  return (
                    <TouchableOpacity key={sh} onPress={() => setManShift(sh)} style={[s.shiftOption, { borderColor: active ? cfg.color : c.border, backgroundColor: active ? cfg.color + '20' : 'transparent' }]}>
                      <IconSymbol name={cfg.icon} size={16} color={active ? cfg.color : c.sub} />
                      <Text style={{ color: active ? cfg.color : c.sub, fontSize: 10, fontWeight: '600', marginTop: 3 }}>{cfg.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                <TouchableOpacity onPress={() => setShowAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                  <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addManual} style={[s.btn, { flex: 2, backgroundColor: c.indigo }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Зберегти</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSelected(null)}>
        <Pressable style={s.overlay} onPress={() => setSelected(null)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            {selected && (() => {
              const cfg = SHIFTS[selected.shift];
              return (
                <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ alignItems: 'center', marginBottom: 20 }}>
                    <View style={[s.detailIcon, { backgroundColor: cfg.color + '20' }]}>
                      <IconSymbol name={cfg.icon} size={28} color={cfg.color} />
                    </View>
                    <Text style={[s.detailDur, { color: cfg.color, marginTop: 12 }]}>{fmtDur(selected.duration)}</Text>
                    <Text style={[s.detailTask, { color: c.text }]}>{selected.task}</Text>
                  </View>
                  <View style={[s.infoBlock, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <InfoRow icon="sun.max.fill" label="Зміна" value={`${cfg.label} · ${cfg.hours}`} text={c.text} sub={c.sub} border={c.border} last={false} />
                    <InfoRow icon="timer" label="Тривалість" value={fmtDur(selected.duration)} text={c.text} sub={c.sub} border={c.border} last={false} />
                    <InfoRow icon="calendar" label="Дата" value={selected.date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })} text={c.text} sub={c.sub} border={c.border} last />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 18 }}>
                    <TouchableOpacity onPress={() => deleteEntry(selected.id)} style={[s.btn, { flex: 1, backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)', borderWidth: 1 }]}>
                      <IconSymbol name="trash" size={15} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '600', marginLeft: 5 }}>Видалити</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setSelected(null)} style={[s.btn, { flex: 2, backgroundColor: c.indigo }]}>
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Закрити</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, value, text, sub, border, last }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', padding: 12 }, !last && { borderBottomWidth: 1, borderBottomColor: border }]}>
      <IconSymbol name={icon as IconSymbolName} size={14} color={sub} style={{ width: 20 }} />
      <Text style={{ color: sub, fontSize: 12, fontWeight: '600', width: 78, marginLeft: 8 }}>{label}</Text>
      <Text style={{ color: text, fontSize: 13, fontWeight: '600', flex: 1 }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  timerCard: { borderRadius: 20, borderWidth: 1, padding: 20, overflow: 'hidden', alignItems: 'center' },
  clock: { fontSize: 50, fontWeight: '200', letterSpacing: -2 },
  taskInput: { fontSize: 14, fontWeight: '500', borderBottomWidth: 1, paddingVertical: 6, minWidth: 220, textAlign: 'center', marginTop: 6 },
  runLabel: { fontSize: 13, fontWeight: '500', marginTop: 4 },
  shiftPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  shiftBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 28, paddingVertical: 11, borderRadius: 13 },
  statsRow: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  breakCard: { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  progressBg: { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  groupLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  entryCard: { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  shiftIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  entryTask: { fontSize: 13, fontWeight: '600' },
  entryMeta: { fontSize: 11, marginTop: 1 },
  entryDur: { fontSize: 13, fontWeight: '800' },
  fab: { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 104 : 84, width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#6366F1', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet: { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  input: { borderRadius: 12, padding: 13, fontSize: 14, fontWeight: '500' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  shiftOption: { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 10, alignItems: 'center' },
  btn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  detailIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  detailDur: { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  detailTask: { fontSize: 15, fontWeight: '600', marginTop: 3 },
  infoBlock: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
});
