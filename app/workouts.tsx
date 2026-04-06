import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissions } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { isSameDay } from '@/utils/dateUtils';

const ACCENT = '#0EA5E9';
const ACCENT2 = '#6366F1';

type WorkoutType = 'run' | 'bike' | 'swim' | 'gym' | 'yoga' | 'walk' | 'other';

interface Workout {
  id: string;
  type: WorkoutType;
  title: string;
  durationMin: number;
  calories?: number;
  note?: string;
  date: string;
  programId?: string;
}

interface Exercise {
  id: string;
  name: string;
  muscleGroup?: string;
  sets?: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  restSec?: number;
}

interface WorkoutProgram {
  id: string;
  name: string;
  color: string;
  exerciseIds: string[];
  reminderEnabled: boolean;
  reminderDays: number[]; // 0=Sun..6=Sat
  reminderTime: string;   // "HH:MM"
  notificationIds?: string[];
}

const WORKOUT_TYPES: { key: WorkoutType; label: string; icon: string; color: string }[] = [
  { key: 'run',   label: 'Біг',         icon: 'figure.run',           color: '#F97316' },
  { key: 'bike',  label: 'Велосипед',   icon: 'figure.outdoor.cycle', color: '#0EA5E9' },
  { key: 'swim',  label: 'Плавання',    icon: 'figure.pool.swim',     color: '#6366F1' },
  { key: 'gym',   label: 'Тренажерний', icon: 'dumbbell.fill',        color: '#EF4444' },
  { key: 'yoga',  label: 'Йога',        icon: 'figure.mind.and.body', color: '#A78BFA' },
  { key: 'walk',  label: 'Прогулянка',  icon: 'figure.walk',          color: '#10B981' },
  { key: 'other', label: 'Інше',        icon: 'sportscourt.fill',     color: '#F59E0B' },
];

const MUSCLE_GROUPS = ['Груди', 'Спина', 'Плечі', 'Біцепс', 'Трицепс', 'Прес', 'Ноги', 'Сідниці', 'Кардіо', 'Розтяжка'];
const PROGRAM_COLORS = ['#EF4444', '#F97316', '#EAB308', '#10B981', '#0EA5E9', '#6366F1', '#A78BFA', '#EC4899'];
const DAY_LABELS = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
};

// ─── Exercise Modal ────────────────────────────────────────────────────────────
function ExerciseModal({
  visible, exercise, onSave, onClose, c, isDark,
}: {
  visible: boolean;
  exercise: Exercise | null;
  onSave: (e: Exercise) => void;
  onClose: () => void;
  c: ReturnType<typeof makeColors>;
  isDark: boolean;
}) {
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('');
  const [rest, setRest] = useState('60');

  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setMuscleGroup(exercise.muscleGroup ?? '');
      setSets(exercise.sets?.toString() ?? '3');
      setReps(exercise.reps?.toString() ?? '10');
      setWeight(exercise.weightKg?.toString() ?? '');
      setRest(exercise.restSec?.toString() ?? '60');
    } else {
      setName(''); setMuscleGroup(''); setSets('3'); setReps('10'); setWeight(''); setRest('60');
    }
  }, [exercise, visible]);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: exercise?.id ?? Date.now().toString(),
      name: name.trim(),
      muscleGroup: muscleGroup || undefined,
      sets: parseInt(sets) || undefined,
      reps: parseInt(reps) || undefined,
      weightKg: parseFloat(weight) || undefined,
      restSec: parseInt(rest) || undefined,
    });
  };

  const inp = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.border,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={[isDark ? '#0C0C14' : '#F4F2FF', isDark ? '#14121E' : '#EAE6FF']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', flex: 1 }}>
              {exercise ? 'Редагувати вправу' : 'Нова вправа'}
            </Text>
            <TouchableOpacity onPress={save} style={{ backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
            <Text style={sectionLabel(c)}>Назва вправи *</Text>
            <TextInput style={inp} value={name} onChangeText={setName} placeholder="Наприклад: Жим лежачи" placeholderTextColor={c.sub} />

            <Text style={[sectionLabel(c), { marginTop: 16 }]}>Група м'язів</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {MUSCLE_GROUPS.map(mg => (
                  <TouchableOpacity
                    key={mg}
                    onPress={() => setMuscleGroup(mg === muscleGroup ? '' : mg)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10,
                      backgroundColor: muscleGroup === mg ? ACCENT + '20' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                      borderWidth: 1, borderColor: muscleGroup === mg ? ACCENT + '60' : c.border,
                    }}>
                    <Text style={{ color: muscleGroup === mg ? ACCENT : c.sub, fontSize: 13, fontWeight: '600' }}>{mg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Підходи</Text>
                <TextInput style={inp} value={sets} onChangeText={setSets} keyboardType="number-pad" placeholder="3" placeholderTextColor={c.sub} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Повтори</Text>
                <TextInput style={inp} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="10" placeholderTextColor={c.sub} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Вага (кг)</Text>
                <TextInput style={inp} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.sub} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Відпочинок (сек)</Text>
                <TextInput style={inp} value={rest} onChangeText={setRest} keyboardType="number-pad" placeholder="60" placeholderTextColor={c.sub} />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ─── Program Modal ────────────────────────────────────────────────────────────
function ProgramModal({
  visible, program, exercises, onSave, onClose, c, isDark,
}: {
  visible: boolean;
  program: WorkoutProgram | null;
  exercises: Exercise[];
  onSave: (p: WorkoutProgram) => void;
  onClose: () => void;
  c: ReturnType<typeof makeColors>;
  isDark: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(PROGRAM_COLORS[4]);
  const [selectedEx, setSelectedEx] = useState<string[]>([]);
  const [remOn, setRemOn] = useState(false);
  const [remDays, setRemDays] = useState<number[]>([]);
  const [remHour, setRemHour] = useState('09');
  const [remMin, setRemMin] = useState('00');

  useEffect(() => {
    if (program) {
      setName(program.name); setColor(program.color); setSelectedEx(program.exerciseIds);
      setRemOn(program.reminderEnabled); setRemDays(program.reminderDays);
      const [h, m] = program.reminderTime.split(':');
      setRemHour(h); setRemMin(m);
    } else {
      setName(''); setColor(PROGRAM_COLORS[4]); setSelectedEx([]);
      setRemOn(false); setRemDays([]); setRemHour('09'); setRemMin('00');
    }
  }, [program, visible]);

  const toggleEx = (id: string) =>
    setSelectedEx(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const toggleDay = (d: number) =>
    setRemDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d].sort((a, b) => a - b));

  const save = () => {
    if (!name.trim()) return;
    onSave({
      id: program?.id ?? Date.now().toString(),
      name: name.trim(), color, exerciseIds: selectedEx,
      reminderEnabled: remOn, reminderDays: remDays,
      reminderTime: `${remHour.padStart(2, '0')}:${remMin.padStart(2, '0')}`,
    });
  };

  const inp = {
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: c.text, fontSize: 15, borderWidth: 1, borderColor: c.border,
  } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={[isDark ? '#0C0C14' : '#F4F2FF', isDark ? '#14121E' : '#EAE6FF']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', flex: 1 }}>
              {program ? 'Редагувати програму' : 'Нова програма'}
            </Text>
            <TouchableOpacity onPress={save} style={{ backgroundColor: ACCENT, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
            <Text style={sectionLabel(c)}>Назва програми *</Text>
            <TextInput style={inp} value={name} onChangeText={setName} placeholder="Наприклад: Силовий день А" placeholderTextColor={c.sub} />

            <Text style={[sectionLabel(c), { marginTop: 16 }]}>Колір</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
              {PROGRAM_COLORS.map(col => (
                <TouchableOpacity
                  key={col}
                  onPress={() => setColor(col)}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: col,
                    borderWidth: color === col ? 3 : 0,
                    borderColor: '#fff',
                    opacity: color === col ? 1 : 0.65,
                  }}
                />
              ))}
            </View>

            {exercises.length > 0 && <>
              <Text style={[sectionLabel(c), { marginTop: 16 }]}>Вправи</Text>
              {exercises.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  onPress={() => toggleEx(ex.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', padding: 12,
                    borderRadius: 12, marginBottom: 8,
                    backgroundColor: selectedEx.includes(ex.id) ? ACCENT + '15' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
                    borderWidth: 1, borderColor: selectedEx.includes(ex.id) ? ACCENT + '50' : c.border,
                  }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 6,
                    backgroundColor: selectedEx.includes(ex.id) ? ACCENT : 'transparent',
                    borderWidth: selectedEx.includes(ex.id) ? 0 : 1.5,
                    borderColor: c.sub, alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    {selectedEx.includes(ex.id) && <IconSymbol name="checkmark" size={12} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{ex.name}</Text>
                    {(ex.sets || ex.reps || ex.muscleGroup) && (
                      <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                        {[ex.muscleGroup, ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : null].filter(Boolean).join(' · ')}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </>}

            <Text style={[sectionLabel(c), { marginTop: 16 }]}>Нагадування</Text>
            <View style={{
              backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
              borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: remOn ? 14 : 0 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>Увімкнути нагадування</Text>
                <TouchableOpacity
                  onPress={() => setRemOn(!remOn)}
                  style={{
                    width: 44, height: 26, borderRadius: 13,
                    backgroundColor: remOn ? ACCENT : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'),
                    justifyContent: 'center', paddingHorizontal: 3,
                  }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: '#fff',
                    transform: [{ translateX: remOn ? 18 : 0 }],
                  }} />
                </TouchableOpacity>
              </View>

              {remOn && <>
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Дні тижня</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 14 }}>
                  {DAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => toggleDay(idx)}
                      style={{
                        flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
                        backgroundColor: remDays.includes(idx) ? ACCENT : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                      }}>
                      <Text style={{ color: remDays.includes(idx) ? '#fff' : c.sub, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>Час</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput style={[inp, { flex: 1, textAlign: 'center' }]} value={remHour} onChangeText={setRemHour}
                    keyboardType="number-pad" maxLength={2} placeholder="09" placeholderTextColor={c.sub} />
                  <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>:</Text>
                  <TextInput style={[inp, { flex: 1, textAlign: 'center' }]} value={remMin} onChangeText={setRemMin}
                    keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={c.sub} />
                </View>
              </>}
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ─── Stats Modal ───────────────────────────────────────────────────────────────
function StatsModal({
  visible, workouts, onClose, c, isDark,
}: {
  visible: boolean;
  workouts: Workout[];
  onClose: () => void;
  c: ReturnType<typeof makeColors>;
  isDark: boolean;
}) {
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisWeek = workouts.filter(w => new Date(w.date) >= startOfWeek);
  const thisMonth = workouts.filter(w => new Date(w.date) >= startOfMonth);
  const totalMin = workouts.reduce((s, w) => s + w.durationMin, 0);
  const totalCal = workouts.reduce((s, w) => s + (w.calories ?? 0), 0);

  let streak = 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    if (workouts.some(w => isSameDay(new Date(w.date), d))) streak++;
    else if (i > 0) break;
  }

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i)); d.setHours(0, 0, 0, 0);
    return { label: DAY_LABELS[d.getDay()], count: workouts.filter(w => isSameDay(new Date(w.date), d)).length };
  });
  const max7 = Math.max(...last7.map(x => x.count), 1);

  const byType = WORKOUT_TYPES.map(wt => ({
    ...wt, count: workouts.filter(w => w.type === wt.key).length,
  })).filter(x => x.count > 0).sort((a, b) => b.count - a.count);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <LinearGradient colors={[isDark ? '#0C0C14' : '#F4F2FF', isDark ? '#14121E' : '#EAE6FF']} style={{ flex: 1 }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', flex: 1, letterSpacing: -0.5 }}>Статистика</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }}>
            {/* Key metrics */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              {([
                { label: 'Всього', value: workouts.length, sub: 'тренувань' },
                { label: 'Цього тижня', value: thisWeek.length, sub: 'тренувань' },
                { label: 'Стрік', value: streak, sub: 'днів' },
              ] as const).map(item => (
                <BlurView key={item.label} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{item.label}</Text>
                  <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', letterSpacing: -1 }}>{item.value}</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{item.sub}</Text>
                </BlurView>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 14, alignItems: 'center' }}>
                <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Загальний час</Text>
                <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>{fmtDuration(totalMin)}</Text>
              </BlurView>
              {totalCal > 0 && (
                <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                  style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 14, alignItems: 'center' }}>
                  <Text style={{ color: c.sub, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Ккал спалено</Text>
                  <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>{totalCal}</Text>
                </BlurView>
              )}
            </View>

            {/* 7-day chart */}
            <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Активність за 7 днів</Text>
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 16, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 72 }}>
                {last7.map((item, idx) => (
                  <View key={idx} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: '100%', borderRadius: 6,
                      height: Math.max((item.count / max7) * 50, item.count > 0 ? 8 : 4),
                      backgroundColor: item.count > 0 ? ACCENT : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                    }} />
                    <Text style={{ color: c.sub, fontSize: 10, fontWeight: '600' }}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </BlurView>

            {/* By type */}
            {byType.length > 0 && <>
              <Text style={[sectionLabel(c), { marginBottom: 10 }]}>За типом</Text>
              <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 16 }}>
                {byType.map((wt, idx) => (
                  <View key={wt.key} style={{
                    flexDirection: 'row', alignItems: 'center', padding: 14,
                    borderBottomWidth: idx < byType.length - 1 ? 1 : 0, borderBottomColor: c.border,
                  }}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: wt.color + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <IconSymbol name={wt.icon as any} size={16} color={wt.color} />
                    </View>
                    <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{wt.label}</Text>
                    <Text style={{ color: wt.color, fontSize: 18, fontWeight: '800' }}>{wt.count}</Text>
                  </View>
                ))}
              </BlurView>
            </>}

            {/* This month */}
            <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Цього місяця</Text>
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
              style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 16 }}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -1 }}>{thisMonth.length}</Text>
                  <Text style={{ color: c.sub, fontSize: 12 }}>тренувань</Text>
                </View>
                <View style={{ width: 1, backgroundColor: c.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>
                    {fmtDuration(thisMonth.reduce((s, w) => s + w.durationMin, 0))}
                  </Text>
                  <Text style={{ color: c.sub, fontSize: 12 }}>загалом</Text>
                </View>
              </View>
            </BlurView>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeColors(isDark: boolean) {
  return {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
  };
}

function sectionLabel(c: ReturnType<typeof makeColors>) {
  return {
    color: c.sub,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
    marginBottom: 6,
  };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WorkoutsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const c = makeColors(isDark);

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'workouts' | 'exercises' | 'programs'>('workouts');

  // Modals
  const [showStats, setShowStats] = useState(false);
  const [showExModal, setShowExModal] = useState(false);
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [showProgModal, setShowProgModal] = useState(false);
  const [editingProg, setEditingProg] = useState<WorkoutProgram | null>(null);

  const load = useCallback(async () => {
    const [w, e, p] = await Promise.all([
      loadData<Workout[]>('workouts', []),
      loadData<Exercise[]>('exercises', []),
      loadData<WorkoutProgram[]>('workout_programs', []),
    ]);
    setWorkouts(w); setExercises(e); setPrograms(p);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load().then(() => setInitialized(true)); }, []);

  useEffect(() => {
    if (!initialized) return;
    saveData('workouts', workouts);
    saveData('exercises', exercises);
    saveData('workout_programs', programs);
  }, [workouts, exercises, programs, initialized]);

  const scheduleNotifs = useCallback(async (prog: WorkoutProgram): Promise<string[]> => {
    if (!prog.reminderEnabled || prog.reminderDays.length === 0) return [];
    const granted = await requestNotificationPermissions();
    if (!granted) return [];

    if (prog.notificationIds?.length) {
      await Promise.all(prog.notificationIds.map(id =>
        Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
      ));
    }

    const [hour, minute] = prog.reminderTime.split(':').map(Number);
    const ids: string[] = [];
    for (const day of prog.reminderDays) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Час тренуватись!',
            body: prog.name,
            sound: true,
            ...(Platform.OS === 'android' ? { channelId: 'flowi-reminders' } : {}),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day === 0 ? 1 : day + 1,
            hour,
            minute,
          } as any,
        });
        ids.push(id);
      } catch (err) {
        console.warn('Notification scheduling failed:', err);
      }
    }
    return ids;
  }, []);

  const now = new Date();
  const todayWorkouts = workouts.filter(w => isSameDay(new Date(w.date), now));
  const totalMinToday = todayWorkouts.reduce((s, w) => s + w.durationMin, 0);
  const totalCalToday = todayWorkouts.reduce((s, w) => s + (w.calories ?? 0), 0);

  // Group workouts by date (newest first)
  const grouped: { date: string; items: Workout[] }[] = [];
  const seen = new Set<string>();
  [...workouts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .forEach(w => {
      const d = new Date(w.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!seen.has(key)) { seen.add(key); grouped.push({ date: key, items: [] }); }
      grouped.find(g => g.date === key)!.items.push(w);
    });

  const saveExercise = (e: Exercise) => {
    setExercises(p => {
      const idx = p.findIndex(x => x.id === e.id);
      return idx >= 0 ? p.map(x => x.id === e.id ? e : x) : [...p, e];
    });
    setShowExModal(false); setEditingEx(null);
  };

  const deleteExercise = (id: string) => {
    Alert.alert('Видалити вправу?', 'Вправу буде видалено з усіх програм.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive', onPress: () => {
          setExercises(p => p.filter(x => x.id !== id));
          setPrograms(p => p.map(prog => ({ ...prog, exerciseIds: prog.exerciseIds.filter(eid => eid !== id) })));
        },
      },
    ]);
  };

  const saveProgram = async (p: WorkoutProgram) => {
    const ids = await scheduleNotifs(p);
    const saved = ids.length ? { ...p, notificationIds: ids } : p;
    setPrograms(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      return idx >= 0 ? prev.map(x => x.id === p.id ? saved : x) : [...prev, saved];
    });
    setShowProgModal(false); setEditingProg(null);
  };

  const deleteProgram = (prog: WorkoutProgram) => {
    Alert.alert('Видалити програму?', undefined, [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive', onPress: async () => {
          if (prog.notificationIds?.length) {
            await Promise.all(prog.notificationIds.map(id =>
              Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
            ));
          }
          setPrograms(p => p.filter(x => x.id !== prog.id));
        },
      },
    ]);
  };

  const startFromProgram = (prog: WorkoutProgram) => {
    setWorkouts(p => [{
      id: Date.now().toString(),
      type: 'gym', title: prog.name, durationMin: 45,
      date: new Date().toISOString(), programId: prog.id,
    }, ...p]);
    setTab('workouts');
  };

  const TABS = [
    { key: 'workouts' as const, label: 'Тренування' },
    { key: 'exercises' as const, label: 'Вправи' },
    { key: 'programs' as const, label: 'Програми' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 24, fontWeight: '800', color: c.text, letterSpacing: -0.5, flex: 1 }}>
            Тренування
          </Text>
          <TouchableOpacity
            onPress={() => setShowStats(true)}
            style={{
              width: 36, height: 36, borderRadius: 12,
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              alignItems: 'center', justifyContent: 'center',
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconSymbol name="chart.bar.fill" size={17} color={c.text} />
          </TouchableOpacity>
        </View>

        {/* Tab bar */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 12, gap: 6 }}>
          {TABS.map(t => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: tab === t.key ? ACCENT : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                borderWidth: 1, borderColor: tab === t.key ? ACCENT + '80' : c.border,
              }}>
              <Text style={{ color: tab === t.key ? '#fff' : c.sub, fontSize: 13, fontWeight: '700' }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* ── WORKOUTS TAB ── */}
          {tab === 'workouts' && <>
            {todayWorkouts.length > 0 && (
              <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 16, marginBottom: 16 }}>
                <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Сьогодні</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{todayWorkouts.length}</Text>
                    <Text style={{ color: c.sub, fontSize: 11 }}>тренувань</Text>
                  </View>
                  <View style={{ width: 1, backgroundColor: c.border }} />
                  <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{fmtDuration(totalMinToday)}</Text>
                    <Text style={{ color: c.sub, fontSize: 11 }}>загалом</Text>
                  </View>
                  {totalCalToday > 0 && <>
                    <View style={{ width: 1, backgroundColor: c.border }} />
                    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>{totalCalToday}</Text>
                      <Text style={{ color: c.sub, fontSize: 11 }}>ккал</Text>
                    </View>
                  </>}
                </View>
              </BlurView>
            )}

            {programs.length > 0 ? <>
              <Text style={[sectionLabel(c), { marginBottom: 10, marginTop: 4 }]}>Мої програми</Text>
              {programs.map(prog => {
                const progExs = exercises.filter(e => prog.exerciseIds.includes(e.id));
                return (
                  <TouchableOpacity
                    key={prog.id}
                    onPress={() => startFromProgram(prog)}
                    activeOpacity={0.75}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      padding: 14, borderRadius: 14, marginBottom: 10,
                      backgroundColor: prog.color + '12',
                      borderWidth: 1, borderColor: prog.color + '35',
                    }}>
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: prog.color + '28', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                      <IconSymbol name="dumbbell.fill" size={20} color={prog.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 15, fontWeight: '700', marginBottom: 3 }}>{prog.name}</Text>
                      <Text style={{ color: c.sub, fontSize: 12 }}>
                        {progExs.length > 0
                          ? progExs.slice(0, 3).map(e => e.name).join(', ') + (progExs.length > 3 ? ` +${progExs.length - 3}` : '')
                          : `${prog.exerciseIds.length} вправ`}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: prog.color + '20', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}>
                      <Text style={{ color: prog.color, fontSize: 12, fontWeight: '700' }}>Старт</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 8 }} />
            </> : null}

            {grouped.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: ACCENT + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <IconSymbol name="figure.run" size={26} color={ACCENT} />
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Немає тренувань</Text>
                <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>Додай перше тренування вище</Text>
              </View>
            ) : <>
              <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Історія</Text>
              {grouped.map(group => (
                <View key={group.date} style={{ marginBottom: 16 }}>
                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
                    {new Date(group.date + 'T00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                  </Text>
                  {group.items.map(w => {
                    const cfg = WORKOUT_TYPES.find(t => t.key === w.type) ?? WORKOUT_TYPES[6];
                    return (
                      <BlurView key={w.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                        style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                          <IconSymbol name={cfg.icon as any} size={20} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{w.title}</Text>
                          <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                            {fmtDuration(w.durationMin)}{w.calories ? ` · ${w.calories} ккал` : ''}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setWorkouts(p => p.filter(x => x.id !== w.id))}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <IconSymbol name="xmark" size={14} color={c.sub} />
                        </TouchableOpacity>
                      </BlurView>
                    );
                  })}
                </View>
              ))}
            </>}
          </>}

          {/* ── EXERCISES TAB ── */}
          {tab === 'exercises' && <>
            <TouchableOpacity
              onPress={() => { setEditingEx(null); setShowExModal(true); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 14, marginBottom: 16,
                backgroundColor: ACCENT2 + '15', borderWidth: 1, borderColor: ACCENT2 + '40',
              }}>
              <IconSymbol name="plus" size={16} color={ACCENT2} />
              <Text style={{ color: ACCENT2, fontSize: 14, fontWeight: '700' }}>Нова вправа</Text>
            </TouchableOpacity>

            {exercises.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: ACCENT2 + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <IconSymbol name="dumbbell.fill" size={26} color={ACCENT2} />
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Немає вправ</Text>
                <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>Створи свою бібліотеку вправ</Text>
              </View>
            ) : exercises.map(ex => (
              <BlurView key={ex.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                style={{ borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden', padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: ACCENT2 + '20', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <IconSymbol name="dumbbell.fill" size={18} color={ACCENT2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{ex.name}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                    {[
                      ex.muscleGroup,
                      ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : null,
                      ex.weightKg ? `${ex.weightKg} кг` : null,
                      ex.restSec ? `відпочинок ${ex.restSec}с` : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { setEditingEx(ex); setShowExModal(true); }}
                  style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name="pencil" size={15} color={c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteExercise(ex.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <IconSymbol name="trash" size={15} color="#EF4444" />
                </TouchableOpacity>
              </BlurView>
            ))}
          </>}

          {/* ── PROGRAMS TAB ── */}
          {tab === 'programs' && <>
            <TouchableOpacity
              onPress={() => { setEditingProg(null); setShowProgModal(true); }}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: 14, borderRadius: 14, marginBottom: 16,
                backgroundColor: ACCENT + '15', borderWidth: 1, borderColor: ACCENT + '40',
              }}>
              <IconSymbol name="plus" size={16} color={ACCENT} />
              <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '700' }}>Нова програма</Text>
            </TouchableOpacity>

            {programs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: ACCENT + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <IconSymbol name="list.bullet.clipboard" size={26} color={ACCENT} />
                </View>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>Немає програм</Text>
                <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>Створи програму з вправ та встанови нагадування</Text>
              </View>
            ) : programs.map(prog => {
              const progExs = exercises.filter(e => prog.exerciseIds.includes(e.id));
              return (
                <BlurView key={prog.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                  style={{ borderRadius: 16, borderWidth: 1, borderColor: c.border, overflow: 'hidden', marginBottom: 12 }}>
                  <View style={{ padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: prog.color + '25', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <IconSymbol name="dumbbell.fill" size={18} color={prog.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.text, fontSize: 15, fontWeight: '700' }}>{prog.name}</Text>
                        <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                          {prog.exerciseIds.length} вправ
                          {prog.reminderEnabled && prog.reminderDays.length > 0
                            ? ` · ${prog.reminderDays.map(d => DAY_LABELS[d]).join(', ')} о ${prog.reminderTime}`
                            : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => { setEditingProg(prog); setShowProgModal(true); }}
                        style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <IconSymbol name="pencil" size={15} color={c.sub} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteProgram(prog)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <IconSymbol name="trash" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    {progExs.length > 0 && (
                      <View style={{ marginTop: 12, gap: 6 }}>
                        {progExs.map((ex, idx) => (
                          <View key={ex.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600', width: 18 }}>{idx + 1}.</Text>
                            <Text style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1 }}>{ex.name}</Text>
                            <Text style={{ color: c.sub, fontSize: 12 }}>
                              {[
                                ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : null,
                                ex.weightKg ? `${ex.weightKg}кг` : null,
                              ].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <TouchableOpacity
                      onPress={() => startFromProgram(prog)}
                      style={{ marginTop: 14, padding: 10, borderRadius: 10, backgroundColor: prog.color + '20', alignItems: 'center' }}>
                      <Text style={{ color: prog.color, fontSize: 13, fontWeight: '700' }}>Розпочати тренування</Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              );
            })}
          </>}

        </ScrollView>
      </SafeAreaView>

      <ExerciseModal
        visible={showExModal}
        exercise={editingEx}
        onSave={saveExercise}
        onClose={() => { setShowExModal(false); setEditingEx(null); }}
        c={c} isDark={isDark}
      />
      <ProgramModal
        visible={showProgModal}
        program={editingProg}
        exercises={exercises}
        onSave={saveProgram}
        onClose={() => { setShowProgModal(false); setEditingProg(null); }}
        c={c} isDark={isDark}
      />
      <StatsModal
        visible={showStats}
        workouts={workouts}
        onClose={() => setShowStats(false)}
        c={c} isDark={isDark}
      />
    </View>
  );
}
