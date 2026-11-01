import * as Notifications from 'expo-notifications';
import { Stack, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
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
// Omni (DS v2.2): AppHeader — це ScreenHeader + 🔔 і аватар (інсет і «Назад» дає ScreenHeader).
import { AppHeader } from '@/components/shared/AppHeader';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissions } from '@/store/notifications';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { isSameDay } from '@/utils/dateUtils';
import { formatDuration } from '@/utils/durationFormat';
import { Layout } from '@/constants/tokens';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { LoadErrorNotice } from '@/components/health/HealthNotices';
import { getHealthDSColors } from '@/components/health/palette';
import { fontFamily, shadow } from '@/constants/theme';
import { dsTokens, glassTokens, useDS } from '@/hooks/use-ds';
import { glassStyles } from '@/components/finance/finPalette';
import { BentoCard, HatchedBars, KpiCounter, MeshBackground, SectionTabs } from '@/components/ds';
import { FilterBar, Segmented, useFiltersV25 } from '@/components/ds/filters';

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
  /**
   * Групові тренування (training-module.md §4.3, §7.2): закрита сесія групи
   * пише сюди звичайний Workout із посиланням на сесію й групу. Поля
   * опційні — старі записи читаються як були, а цей екран їх лише показує.
   */
  sessionId?: string;
  groupId?: string;
  distanceKm?: number;
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

const TABS = [
  { key: 'workouts' as const, label: 'Тренування', icon: 'figure.run' as const },
  { key: 'exercises' as const, label: 'Вправи', icon: 'dumbbell.fill' as const },
  { key: 'programs' as const, label: 'Програми', icon: 'list.bullet.clipboard' as const },
];

// Одиниці вшиті українською, як і решта рядків цього екрана (див. звіт);
// сама ж форма тривалості береться зі спільної утиліти, щоб екран не
// розходився з рештою застосунку через власну копію тих самих трьох гілок.
const DURATION_UNITS = { hour: 'г', hourLong: 'год', minute: 'хв' };

const fmtDuration = (min: number) => formatDuration(min * 60, DURATION_UNITS);

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
  const { tr } = useI18n();
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
    backgroundColor: c.subtle,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
    color: c.text, fontSize: 15, fontFamily: fontFamily.regular,
  } as const;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg1 }}>
        <MeshBackground />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
              style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
            <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, flex: 1 }}>
              {exercise ? 'Редагувати вправу' : 'Нова вправа'}
            </Text>
            <TouchableOpacity onPress={save} style={{ backgroundColor: c.action, borderRadius: 999, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 8 }}>
              <Text style={{ color: c.onAction, fontFamily: fontFamily.semibold, fontSize: 14 }}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Text style={sectionLabel(c)}>Назва вправи *</Text>
            <TextInput style={inp} value={name} onChangeText={setName} placeholder="Наприклад: Жим лежачи" placeholderTextColor={c.muted} />

            <Text style={[sectionLabel(c), { marginTop: 16 }]}>Група м&apos;язів</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 4 }}>
                {MUSCLE_GROUPS.map(mg => (
                  <TouchableOpacity
                    key={mg}
                    onPress={() => setMuscleGroup(mg === muscleGroup ? '' : mg)}
                    style={{
                      paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', borderRadius: 999,
                      backgroundColor: muscleGroup === mg ? c.action : c.subtle,
                    }}>
                    <Text style={{ color: muscleGroup === mg ? c.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{mg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Підходи</Text>
                <TextInput style={inp} value={sets} onChangeText={setSets} keyboardType="number-pad" placeholder="3" placeholderTextColor={c.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Повтори</Text>
                <TextInput style={inp} value={reps} onChangeText={setReps} keyboardType="number-pad" placeholder="10" placeholderTextColor={c.muted} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Вага (кг)</Text>
                <TextInput style={inp} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={c.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={sectionLabel(c)}>Відпочинок (сек)</Text>
                <TextInput style={inp} value={rest} onChangeText={setRest} keyboardType="number-pad" placeholder="60" placeholderTextColor={c.muted} />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
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
  const { tr } = useI18n();
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
    backgroundColor: c.subtle,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
    color: c.text, fontSize: 15, fontFamily: fontFamily.regular,
  } as const;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg1 }}>
        <MeshBackground />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
              style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
            <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, flex: 1 }}>
              {program ? 'Редагувати програму' : 'Нова програма'}
            </Text>
            <TouchableOpacity onPress={save} style={{ backgroundColor: c.action, borderRadius: 999, minHeight: 44, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 8 }}>
              <Text style={{ color: c.onAction, fontFamily: fontFamily.semibold, fontSize: 14 }}>Зберегти</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <Text style={sectionLabel(c)}>Назва програми *</Text>
            <TextInput style={inp} value={name} onChangeText={setName} placeholder="Наприклад: Силовий день А" placeholderTextColor={c.muted} />

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
                    borderColor: c.card,
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
                    borderRadius: 14, marginBottom: 8, minHeight: 48,
                    backgroundColor: c.subtle,
                  }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: selectedEx.includes(ex.id) ? c.action : 'transparent',
                    borderWidth: selectedEx.includes(ex.id) ? 0 : 1.5,
                    borderColor: c.sub, alignItems: 'center', justifyContent: 'center', marginRight: 12,
                  }}>
                    {selectedEx.includes(ex.id) && <IconSymbol name="checkmark" size={12} color={c.onAction} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{ex.name}</Text>
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
              backgroundColor: c.subtle,
              borderRadius: 16, padding: 16,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: remOn ? 14 : 0 }}>
                <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>Увімкнути нагадування</Text>
                <TouchableOpacity
                  onPress={() => setRemOn(!remOn)}
                  style={{
                    width: 44, height: 26, borderRadius: 13,
                    backgroundColor: remOn ? c.action : c.border,
                    justifyContent: 'center', paddingHorizontal: 4,
                  }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: remOn ? c.onAction : c.card,
                    transform: [{ translateX: remOn ? 18 : 0 }],
                  }} />
                </TouchableOpacity>
              </View>

              {remOn && <>
                <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginBottom: 8 }}>Дні тижня</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {DAY_LABELS.map((label, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => toggleDay(idx)}
                      style={{
                        flex: 1, minHeight: 36, justifyContent: 'center', borderRadius: 999, alignItems: 'center',
                        backgroundColor: remDays.includes(idx) ? c.action : c.card,
                      }}>
                      <Text style={{ color: remDays.includes(idx) ? c.onAction : c.sub, fontSize: 12, fontFamily: fontFamily.semibold }}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginBottom: 8 }}>Час</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput style={[inp, { flex: 1, textAlign: 'center' }]} value={remHour} onChangeText={setRemHour}
                    keyboardType="number-pad" maxLength={2} placeholder="09" placeholderTextColor={c.muted} />
                  <Text style={{ color: c.text, fontSize: 20, fontFamily: fontFamily.semibold }}>:</Text>
                  <TextInput style={[inp, { flex: 1, textAlign: 'center' }]} value={remMin} onChangeText={setRemMin}
                    keyboardType="number-pad" maxLength={2} placeholder="00" placeholderTextColor={c.muted} />
                </View>
              </>}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
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
  const { tr } = useI18n();
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
    <Modal visible={visible} animationType="fade" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.bg1 }}>
        <MeshBackground />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 }}>
            <Text style={{ color: c.text, fontSize: 32, fontFamily: fontFamily.medium, flex: 1, letterSpacing: -0.32 }}>Статистика</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={tr.close}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconSymbol name="xmark" size={18} color={c.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            {/* Key metrics */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
              {([
                { label: 'Всього', value: workouts.length, sub: 'тренувань' },
                { label: 'Цього тижня', value: thisWeek.length, sub: 'тренувань' },
                { label: 'Стрік', value: streak, sub: 'днів' },
              ] as const).map(item => (
                <View key={item.label} style={{ ...c.solid, borderRadius: 16, flex: 1, padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 6 }} numberOfLines={1}>{item.label}</Text>
                  <Text style={{ color: c.text, fontSize: 40, lineHeight: 44, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.8 }}>{item.value}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{item.sub}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <View
                style={{ ...c.solid, flex: 1, borderRadius: 16, padding: 20, alignItems: 'center' }}>
                <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 6 }} numberOfLines={1}>Загальний час</Text>
                <Text style={{ color: c.text, fontSize: 28, lineHeight: 32, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.56 }}>{fmtDuration(totalMin)}</Text>
              </View>
              {totalCal > 0 && (
                <View
                  style={{ ...c.solid, flex: 1, borderRadius: 16, padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 6 }} numberOfLines={1}>Ккал спалено</Text>
                  <Text style={{ color: c.text, fontSize: 28, lineHeight: 32, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.56 }}>{totalCal}</Text>
                </View>
              )}
            </View>

            {/* 7-day chart */}
            <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Активність за 7 днів</Text>
            <View
              style={{ ...c.solid, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 72 }}>
                {last7.map((item, idx) => (
                  <View key={idx} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                    <View style={{
                      width: '100%', borderRadius: 4,
                      height: Math.max((item.count / max7) * 50, item.count > 0 ? 8 : 4),
                      // Один акцент на графік: сьогодні — корал модуля, решта днів — нейтральні кроки.
                      backgroundColor: item.count === 0 ? c.subtle : idx === last7.length - 1 ? c.g.accent.coral.fill : c.muted,
                    }} />
                    <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium }}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* By type */}
            {byType.length > 0 && <>
              <Text style={[sectionLabel(c), { marginBottom: 10 }]}>За типом</Text>
              <View
                style={{ ...c.solid, borderRadius: 16, marginBottom: 16 }}>
                {byType.map((wt, idx) => (
                  <View key={wt.key} style={{
                    flexDirection: 'row', alignItems: 'center', padding: 16,
                    borderBottomWidth: idx < byType.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: c.border,
                  }}>
                    <View style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <IconSymbol name={wt.icon as any} size={16} color={c.coral} />
                    </View>
                    <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, flex: 1 }}>{wt.label}</Text>
                    <Text style={{ color: c.text, fontSize: 22, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.44 }}>{wt.count}</Text>
                  </View>
                ))}
              </View>
            </>}

            {/* This month */}
            <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Цього місяця</Text>
            <View
              style={{ ...c.solid, borderRadius: 16, padding: 20 }}>
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontSize: 40, lineHeight: 44, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.8 }}>{thisMonth.length}</Text>
                  <Text style={{ color: c.sub, fontSize: 12 }}>тренувань</Text>
                </View>
                <View style={{ width: 1, backgroundColor: c.border }} />
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: c.text, fontSize: 28, lineHeight: 32, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.56 }}>
                    {fmtDuration(thisMonth.reduce((s, w) => s + w.durationMin, 0))}
                  </Text>
                  <Text style={{ color: c.sub, fontSize: 12 }}>загалом</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Половина проміжку між картками сітки (поля комірки + відʼємні поля рядка). */
const GRID_HALF_GAP = 6;

/**
 * Комірка сітки FlatList(numColumns): ширина — частка рядка, а не flex:1,
 * інакше неповний останній рядок розтягнув би картку на всю ширину.
 */
function gridCell(cols: number, node: React.ReactElement): React.ReactElement {
  if (cols <= 1) return node;
  return <View style={{ width: `${100 / cols}%`, paddingHorizontal: GRID_HALF_GAP }}>{node}</View>;
}

/** Палітра екрана — токени Design System v2 (docs/design-system-v2.md). */
function makeColors(isDark: boolean, reduceTransparency = false) {
  const t = dsTokens(isDark);
  const g = glassTokens(isDark);
  // DS v2.1: mesh-основа, скляні картки (gl), акцент модуля — coral.
  return {
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    gl:     glassStyles(isDark, reduceTransparency),
    g,
    coral:  g.accent.coral.ink,
    coralTint: g.accent.coral.tint,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    /** Лише placeholder / декор. */
    muted:  t.text.muted,
    card:   reduceTransparency ? g.solid.card : g.surface,
    /**
     * Omni (DS v2.2): вміст лежить на суцільних bento-картках (surface.card +
     * м'яка тінь), скло лишається функціональному шару (шапка, модалки).
     */
    solid:  { backgroundColor: t.surface.card, ...shadow[isDark ? 'dark' : 'light'].card },
    nested: t.surface.subtle,
    subtle: g.surfaceSubtle,
    action: t.action.primary,
    onAction: t.text.onAction,
    danger: t.status.danger,
    lime:   t.accent.lime,
    amber:  t.accent.amber,
    isDark,
  };
}

function sectionLabel(c: ReturnType<typeof makeColors>) {
  return {
    color: c.sub,
    fontSize: 12,
    fontFamily: fontFamily.medium,
    marginBottom: 6,
  };
}

// ─── Рядки списків ────────────────────────────────────────────────────────────
// Історія тренувань і бібліотека вправ ростуть без стелі, тож вони їдуть
// через FlatList. Рядки винесені й мемоізовані: без цього віртуалізація
// нічого не дає — кожен рендер екрана однаково перемальовував би всі видимі
// картки, бо JSX всередині .map створюється заново.

type Colors = ReturnType<typeof makeColors>;

const WorkoutRow = React.memo(function WorkoutRow({ w, c, isDark, lastInGroup, onDelete }: {
  w: Workout; c: Colors; isDark: boolean; lastInGroup: boolean; onDelete: (id: string) => void;
}) {
  const { tr } = useI18n();
  const cfg = WORKOUT_TYPES.find(t => t.key === w.type) ?? WORKOUT_TYPES[6];
  return (
    <View
      style={{ ...c.solid, borderRadius: 16, padding: 20, marginBottom: lastInGroup ? 24 : 8, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <IconSymbol name={cfg.icon as any} size={16} color={c.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{w.title}</Text>
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
          {fmtDuration(w.durationMin)}{w.calories ? ` · ${w.calories} ккал` : ''}
          {w.groupId ? ` · ${tr.tgGroupBadge}` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={() => onDelete(w.id)} accessibilityRole="button" accessibilityLabel={`${tr.delete}: ${w.title}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <IconSymbol name="xmark" size={14} color={c.sub} />
      </TouchableOpacity>
    </View>
  );
});

const ExerciseRow = React.memo(function ExerciseRow({ ex, c, isDark, onEdit, onDelete }: {
  ex: Exercise; c: Colors; isDark: boolean;
  onEdit: (ex: Exercise) => void; onDelete: (id: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <View
      style={{ ...c.solid, borderRadius: 16, padding: 20, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <IconSymbol name="dumbbell.fill" size={16} color={c.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold }}>{ex.name}</Text>
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
        onPress={() => onEdit(ex)}
        accessibilityRole="button" accessibilityLabel={`${tr.edit}: ${ex.name}`}
        style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <IconSymbol name="pencil" size={16} color={c.sub} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDelete(ex.id)} accessibilityRole="button" accessibilityLabel={`${tr.delete}: ${ex.name}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <IconSymbol name="trash" size={16} color={c.danger} />
      </TouchableOpacity>
    </View>
  );
});

const ProgramShortcut = React.memo(function ProgramShortcut({ prog, exercises, c, onStart }: {
  prog: WorkoutProgram; exercises: Exercise[]; c: Colors; onStart: (p: WorkoutProgram) => void;
}) {
  const progExs = exercises.filter(e => prog.exerciseIds.includes(e.id));
  return (
    <TouchableOpacity
      onPress={() => onStart(prog)}
      activeOpacity={0.75}
      style={{
        flexDirection: 'row', alignItems: 'center',
        padding: 16, borderRadius: 16, marginBottom: 8,
        backgroundColor: c.nested,
      }}>
      <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: prog.color + '28', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <IconSymbol name="dumbbell.fill" size={16} color={prog.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold, marginBottom: 4 }}>{prog.name}</Text>
        <Text style={{ color: c.sub, fontSize: 12 }}>
          {progExs.length > 0
            ? progExs.slice(0, 3).map(e => e.name).join(', ') + (progExs.length > 3 ? ` +${progExs.length - 3}` : '')
            : `${prog.exerciseIds.length} вправ`}
        </Text>
      </View>
      <View style={{ backgroundColor: c.action, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ color: c.onAction, fontSize: 13, fontFamily: fontFamily.semibold }}>Старт</Text>
      </View>
    </TouchableOpacity>
  );
});

const ProgramCard = React.memo(function ProgramCard({ prog, exercises, c, isDark, onEdit, onDelete, onStart }: {
  prog: WorkoutProgram; exercises: Exercise[]; c: Colors; isDark: boolean;
  onEdit: (p: WorkoutProgram) => void; onDelete: (p: WorkoutProgram) => void; onStart: (p: WorkoutProgram) => void;
}) {
  const { tr } = useI18n();
  const progExs = exercises.filter(e => prog.exerciseIds.includes(e.id));
  return (
    <View
      style={{ ...c.solid, borderRadius: 16, marginBottom: 12 }}>
      <View style={{ padding: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: prog.color + '25', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <IconSymbol name="dumbbell.fill" size={16} color={prog.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{prog.name}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
              {prog.exerciseIds.length} вправ
              {prog.reminderEnabled && prog.reminderDays.length > 0
                ? ` · ${prog.reminderDays.map(d => DAY_LABELS[d]).join(', ')} о ${prog.reminderTime}`
                : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onEdit(prog)}
            accessibilityRole="button" accessibilityLabel={`${tr.edit}: ${prog.name}`}
            style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconSymbol name="pencil" size={16} color={c.sub} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onDelete(prog)} accessibilityRole="button" accessibilityLabel={`${tr.delete}: ${prog.name}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <IconSymbol name="trash" size={16} color={c.danger} />
          </TouchableOpacity>
        </View>

        {progExs.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {progExs.map((ex, idx) => (
              <View key={ex.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, width: 18 }}>{idx + 1}.</Text>
                <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>{ex.name}</Text>
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
          onPress={() => onStart(prog)}
          style={{ marginTop: 16, minHeight: 44, justifyContent: 'center', padding: 10, borderRadius: 999, backgroundColor: c.action, alignItems: 'center' }}>
          <Text style={{ color: c.onAction, fontSize: 14, fontFamily: fontFamily.semibold }}>Розпочати тренування</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

// Рядок списку однієї з трьох вкладок — тип вибирає, що малювати.
type Row =
  | { kind: 'dateLabel'; key: string; date: string }
  | { kind: 'workout'; key: string; w: Workout; lastInGroup: boolean }
  | { kind: 'exercise'; key: string; ex: Exercise }
  | { kind: 'program'; key: string; prog: WorkoutProgram };

const rowKey = (r: Row) => r.key;

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WorkoutsScreen() {
  /*
   * Планшет (рішення 6): бібліотека вправ і програм — сіткою карток (2 колонки,
   * 3 від ~900pt екрана), стеля «широкого» вмісту. Стрічка тренувань лишається
   * однією колонкою: там заголовки днів ідуть упереміш із картками, і сітка
   * розірвала б день на шматки.
   */
  const { isWide } = useResponsive();
  const screenWidth = Math.min(useScreenWidth(), Layout.wideMaxWidth);
  const contentWidth = useMemo(
    () => (isWide ? { width: '100%' as const, maxWidth: Layout.wideMaxWidth, alignSelf: 'center' as const } : {}),
    [isWide],
  );
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  // Палітра мусить бути стабільним обʼєктом: інакше кожен рендер екрана
  // віддавав би мемоізованим рядкам нове посилання, і React.memo не спрацює.
  const { reduceTransparency } = useDS();
  const c = useMemo(() => makeColors(isDark, reduceTransparency), [isDark, reduceTransparency]);
  const { tr, lang } = useI18n();
  // Плашка помилки читання спільна для всіх екранів; їй потрібна палітра
  // здоровʼя, а не локальна палітра тренувань.
  const noticeColors = useMemo(() => getHealthDSColors(isDark), [isDark]);

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [programs, setPrograms] = useState<WorkoutProgram[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ERR-01: читання провалилось — показуємо це, а не порожній список.
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'workouts' | 'exercises' | 'programs'>('workouts');
  const v25 = useFiltersV25();

  // Modals
  const [showStats, setShowStats] = useState(false);
  const [showExModal, setShowExModal] = useState(false);
  const [editingEx, setEditingEx] = useState<Exercise | null>(null);
  const [showProgModal, setShowProgModal] = useState(false);
  const [editingProg, setEditingProg] = useState<WorkoutProgram | null>(null);

  /**
   * ERR-01. Три колекції читаються разом, тож і невдача спільна: досить
   * одного провалу, щоб автозапис нижче переписав УСІ ТРИ ключі зі свого
   * (порожнього) стану — саме це й знищувало дані. Тепер провал не вмикає
   * initialized і показує плашку з повтором.
   */
  const load = useCallback(async () => {
    const [w, e, p] = await Promise.all([
      loadDataResult<Workout[]>('workouts', []),
      loadDataResult<Exercise[]>('exercises', []),
      loadDataResult<WorkoutProgram[]>('workout_programs', []),
    ]);
    if (!w.ok || !e.ok || !p.ok) { setLoadFailed(true); return false; }
    setWorkouts(w.value); setExercises(e.value); setPrograms(p.value);
    setLoadFailed(false);
    return true;
  }, []);

  const retryLoad = useCallback(async () => {
    const [w, e, p] = await Promise.all([
      retryStorageRead<Workout[]>('workouts', []),
      retryStorageRead<Exercise[]>('exercises', []),
      retryStorageRead<WorkoutProgram[]>('workout_programs', []),
    ]);
    if (!w.ok || !e.ok || !p.ok) return;
    setWorkouts(w.value); setExercises(e.value); setPrograms(p.value);
    setLoadFailed(false); setInitialized(true);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => { load().then(ok => { if (ok) setInitialized(true); }); }, [load]);

  useEffect(() => {
    if (!initialized) return;
    const warn = (key: string) => (e: unknown) => { if (__DEV__) console.warn(`[workouts] save ${key} failed:`, e); };
    void saveSynced('workouts', workouts).catch(warn('workouts'));
    void saveSynced('exercises', exercises).catch(warn('exercises'));
    void saveSynced('workout_programs', programs).catch(warn('workout_programs'));
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
            title: 'Час тренуватись',
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

  const todayStats = useMemo(() => {
    const now = new Date();
    const items = workouts.filter(w => isSameDay(new Date(w.date), now));
    return {
      count: items.length,
      minutes: items.reduce((s, w) => s + w.durationMin, 0),
      calories: items.reduce((s, w) => s + (w.calories ?? 0), 0),
    };
  }, [workouts]);

  /** Omni: хвилини за останні 7 днів (сьогодні — останній, активний стовпець). */
  const week = useMemo(() => {
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
      return { d, minutes: 0 };
    });
    for (const w of workouts) {
      const wd = new Date(w.date);
      const slot = days.find(x => isSameDay(x.d, wd));
      if (slot) slot.minutes += w.durationMin;
    }
    return days.map(x => ({ label: DAY_LABELS[x.d.getDay()], value: x.minutes, display: fmtDuration(x.minutes) }));
  }, [workouts]);
  const weekTotal = useMemo(() => week.reduce((sum, d) => sum + d.value, 0), [week]);

  // Групування історії по днях (новіші згори) за один прохід. Попередня
  // версія на кожен запис шукала свою групу через grouped.find, тобто
  // квадратично від довжини історії — на кількох сотнях тренувань це
  // помітно на кожному рендері.
  const grouped = useMemo(() => {
    const byDate = new Map<string, Workout[]>();
    [...workouts]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .forEach(w => {
        const d = new Date(w.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const bucket = byDate.get(key);
        if (bucket) bucket.push(w);
        else byDate.set(key, [w]);
      });
    return [...byDate].map(([date, items]) => ({ date, items }));
  }, [workouts]);

  const saveExercise = useCallback((e: Exercise) => {
    setExercises(p => {
      const idx = p.findIndex(x => x.id === e.id);
      return idx >= 0 ? p.map(x => x.id === e.id ? e : x) : [...p, e];
    });
    setShowExModal(false); setEditingEx(null);
  }, []);

  const editExercise = useCallback((ex: Exercise) => {
    setEditingEx(ex); setShowExModal(true);
  }, []);

  const deleteExercise = useCallback((id: string) => {
    Alert.alert('Видалити вправу?', 'Вправу буде видалено з усіх програм.', [
      { text: 'Скасувати', style: 'cancel' },
      {
        text: 'Видалити', style: 'destructive', onPress: () => {
          setExercises(p => p.filter(x => x.id !== id));
          setPrograms(p => p.map(prog => ({ ...prog, exerciseIds: prog.exerciseIds.filter(eid => eid !== id) })));
        },
      },
    ]);
  }, []);

  const saveProgram = useCallback(async (p: WorkoutProgram) => {
    const ids = await scheduleNotifs(p);
    const saved = ids.length ? { ...p, notificationIds: ids } : p;
    setPrograms(prev => {
      const idx = prev.findIndex(x => x.id === p.id);
      return idx >= 0 ? prev.map(x => x.id === p.id ? saved : x) : [...prev, saved];
    });
    setShowProgModal(false); setEditingProg(null);
  }, [scheduleNotifs]);

  const editProgram = useCallback((prog: WorkoutProgram) => {
    setEditingProg(prog); setShowProgModal(true);
  }, []);

  const deleteProgram = useCallback((prog: WorkoutProgram) => {
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
  }, []);

  const deleteWorkout = useCallback((id: string) => {
    setWorkouts(p => p.filter(x => x.id !== id));
  }, []);

  const startFromProgram = useCallback((prog: WorkoutProgram) => {
    setWorkouts(p => [{
      id: Date.now().toString(),
      type: 'gym', title: prog.name, durationMin: 45,
      date: new Date().toISOString(), programId: prog.id,
    }, ...p]);
    setTab('workouts');
  }, []);

  const openNewExercise = useCallback(() => { setEditingEx(null); setShowExModal(true); }, []);
  const openNewProgram = useCallback(() => { setEditingProg(null); setShowProgModal(true); }, []);
  const goToPrograms = useCallback(() => setTab('programs'), []);
  const gridCols = isWide && tab !== 'workouts' ? (screenWidth >= 900 ? 3 : 2) : 1;

  // Пласкі рядки для FlatList: заголовок дня і картки одного дня йдуть
  // поспіль, тож віртуалізація бачить однорідний список, а не вкладені мапи.
  const rows = useMemo<Row[]>(() => {
    if (tab === 'exercises') return exercises.map(ex => ({ kind: 'exercise', key: ex.id, ex }));
    if (tab === 'programs') return programs.map(prog => ({ kind: 'program', key: prog.id, prog }));
    const out: Row[] = [];
    grouped.forEach(group => {
      out.push({ kind: 'dateLabel', key: `date_${group.date}`, date: group.date });
      group.items.forEach((w, idx) =>
        out.push({ kind: 'workout', key: w.id, w, lastInGroup: idx === group.items.length - 1 }));
    });
    return out;
  }, [tab, exercises, programs, grouped]);

  const renderRow = useCallback(({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'dateLabel':
        return (
          <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.semibold, marginBottom: 8 }}>
            {new Date(item.date + 'T00:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
          </Text>
        );
      case 'workout':
        return <WorkoutRow w={item.w} c={c} isDark={isDark} lastInGroup={item.lastInGroup} onDelete={deleteWorkout} />;
      case 'exercise':
        return gridCell(gridCols, <ExerciseRow ex={item.ex} c={c} isDark={isDark} onEdit={editExercise} onDelete={deleteExercise} />);
      case 'program':
        return gridCell(gridCols, (
          <ProgramCard prog={item.prog} exercises={exercises} c={c} isDark={isDark}
            onEdit={editProgram} onDelete={deleteProgram} onStart={startFromProgram} />
        ));
    }
  }, [c, isDark, exercises, deleteWorkout, editExercise, deleteExercise, editProgram, deleteProgram, startFromProgram, gridCols]);

  const listHeader = useMemo(() => {
    if (tab === 'exercises') {
      return (
        <TouchableOpacity
          onPress={openNewExercise}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 16, minHeight: 48, borderRadius: 999, marginBottom: 16,
            backgroundColor: c.action,
          }}>
          <IconSymbol name="plus" size={16} color={c.onAction} />
          <Text style={{ color: c.onAction, fontSize: 14, fontFamily: fontFamily.semibold }}>Нова вправа</Text>
        </TouchableOpacity>
      );
    }
    if (tab === 'programs') {
      return (
        <TouchableOpacity
          onPress={openNewProgram}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: 16, minHeight: 48, borderRadius: 999, marginBottom: 16,
            backgroundColor: c.action,
          }}>
          <IconSymbol name="plus" size={16} color={c.onAction} />
          <Text style={{ color: c.onAction, fontSize: 14, fontFamily: fontFamily.semibold }}>Нова програма</Text>
        </TouchableOpacity>
      );
    }
    return (
      <>
        {/* Сьогоднішні лічильники переїхали в KPI шапки (Omni); тут — тиждень. */}
        {weekTotal > 0 && (
          <BentoCard title="Цей тиждень" icon="chart.bar.fill" accent="coral" style={{ marginBottom: 16 }}
            headerRight={<Text style={{ color: c.sub, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>{fmtDuration(weekTotal)}</Text>}>
            <HatchedBars data={week} activeIndex={6} height={110}
              accessibilityLabel={`Тренування за тиждень: ${fmtDuration(weekTotal)}`} />
          </BentoCard>
        )}

        {programs.length > 0 && (
          <BentoCard title="Мої програми" icon="list.bullet.clipboard" accent="coral" style={{ marginBottom: 20 }}>
            {programs.map(prog => (
              <ProgramShortcut key={prog.id} prog={prog} exercises={exercises} c={c} onStart={startFromProgram} />
            ))}
          </BentoCard>
        )}

        {grouped.length > 0 && (
          <Text style={[sectionLabel(c), { marginBottom: 10 }]}>Історія</Text>
        )}
      </>
    );
  }, [tab, c, week, weekTotal, programs, exercises, grouped.length, startFromProgram, openNewExercise, openNewProgram]);

  const listEmpty = useMemo(() => {
    if (tab === 'exercises') {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <IconSymbol name="dumbbell.fill" size={24} color={c.coral} />
          </View>
          <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, marginBottom: 6 }}>Немає вправ</Text>
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>Створи свою бібліотеку вправ</Text>
        </View>
      );
    }
    if (tab === 'programs') {
      return (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <IconSymbol name="list.bullet.clipboard" size={24} color={c.coral} />
          </View>
          <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, marginBottom: 6 }}>Немає програм</Text>
          <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>Створи програму з вправ та встанови нагадування</Text>
        </View>
      );
    }
    // Тренування додаються лише зі збереженої програми. Якщо жодної програми
    // ще немає, порожній екран був глухим кутом: підказка «додай вище»
    // вказувала на порожнє місце. Тому тут — прямий перехід до програм.
    const hasPrograms = programs.length > 0;
    return (
      <View style={{ alignItems: 'center', paddingVertical: 40 }}>
        <View style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: c.coralTint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <IconSymbol name="figure.run" size={24} color={c.coral} />
        </View>
        <Text style={{ color: c.text, fontSize: 16, fontFamily: fontFamily.semibold, marginBottom: 6 }}>Немає тренувань</Text>
        <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center' }}>
          {hasPrograms ? 'Додай перше тренування вище' : 'Створи програму — і тренування зʼявляться тут'}
        </Text>
        {!hasPrograms && (
          <TouchableOpacity
            onPress={goToPrograms}
            style={{
              marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, borderRadius: 999,
              backgroundColor: c.action,
            }}>
            <IconSymbol name="plus" size={16} color={c.onAction} />
            <Text style={{ color: c.onAction, fontSize: 14, fontFamily: fontFamily.semibold }}>Нова програма</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [tab, c, programs.length, goToPrograms]);

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет тепер рахує ScreenHeader через
          useTopInset() (CLAUDE.md), і разом із нативним краєм шапка з'їжджала
          б униз двічі — на висоту статус-бара. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Шапка й вкладки живуть у тій самій колонці, що й список: інакше на
            планшеті вони розтягуються на всю ширину, а картки стоять по центру. */}
        <View style={contentWidth}>
          {/* NAT-18: кнопка «Назад» була 20×20 у дереві доступності (з hitSlop
              8 — 36×36), найменша ціль у застосунку при нормі Apple 44×44, ще
              й без імені («Back» англійською). Спільний ScreenHeader дає й
              44×44, і переклад, і — головне — ховає стрілку на планшеті, де
              «Тренування» відкриваються прямо з сайдбара. */}
          <AppHeader
            title={tr.workoutsLabel}
            back={{ onPress: () => router.back(), label: tr.back, color: c.text }}
            kpis={initialized ? (
              <>
                <KpiCounter value={todayStats.count} label="тренувань сьогодні" />
                <KpiCounter value={fmtDuration(todayStats.minutes)} label="загалом сьогодні" />
                {todayStats.calories > 0 ? <KpiCounter value={todayStats.calories} label="ккал сьогодні" /> : null}
              </>
            ) : undefined}
            actions={
              <>
                {/* Групи тренувань (training-module.md §10.1): вхід у модуль груп. */}
                <HeaderButton
                  onPress={() => router.push('/training' as Href)}
                  accessibilityLabel={tr.tgGroupsButton}>
                  <IconSymbol name="person.2.fill" size={18} color={c.text} />
                </HeaderButton>
                <HeaderButton
                  onPress={() => setShowStats(true)}
                  accessibilityLabel={tr.statistics}>
                  <IconSymbol name="chart.bar.fill" size={18} color={c.text} />
                </HeaderButton>
              </>
            }>
            {/* Вкладки розділу — Omni SectionTabs (чорна pill = «ви тут»).
                «Мої програми» — щоб не плутались із груповими (§10.1). */}
            {v25 ? (
              <FilterBar
                label={tr.workoutsLabel}
                items={[{
                  id: 'tab', pinned: true, node: (
                    <Segmented
                      label={tr.workoutsLabel}
                      semantics="tablist"
                      value={tab}
                      onChange={setTab}
                      options={TABS.map(t => ({
                        value: t.key,
                        icon: t.icon,
                        label: t.key === 'programs' ? tr.tgPersonalProgramsTab : t.label,
                        count: !initialized ? undefined : t.key === 'exercises' ? exercises.length : t.key === 'programs' ? programs.length : undefined,
                      }))}
                    />
                  ),
                }]}
              />
            ) : (
              <SectionTabs
                tabs={TABS.map(t => ({
                  key: t.key,
                  icon: t.icon,
                  label: t.key === 'programs' ? tr.tgPersonalProgramsTab : t.label,
                  count: !initialized ? undefined : t.key === 'exercises' ? exercises.length : t.key === 'programs' ? programs.length : undefined,
                }))}
                value={tab}
                onChange={setTab}
                accessibilityLabel={tr.workoutsLabel}
              />
            )}
          </AppHeader>
        </View>

        <FlatList
          // numColumns не можна міняти «на льоту» — FlatList вимагає новий key.
          key={`cols-${gridCols}`}
          numColumns={gridCols}
          columnWrapperStyle={gridCols > 1 ? { marginHorizontal: -GRID_HALF_GAP } : undefined}
          data={rows}
          keyExtractor={rowKey}
          renderItem={renderRow}
          ListHeaderComponent={
            <>
              {loadFailed && <LoadErrorNotice lang={lang} c={noticeColors} isDark={isDark} onRetry={() => { void retryLoad(); }} />}
              {listHeader}
            </>
          }
          ListEmptyComponent={loadFailed ? null : listEmpty}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
        />
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
