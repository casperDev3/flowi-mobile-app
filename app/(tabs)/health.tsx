import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
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

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData, saveData } from '@/store/storage';

type EntryType = 'water' | 'sleep' | 'mood';

interface HealthEntry {
  id: string;
  type: EntryType;
  value: number; // ml for water, minutes for sleep, 1–5 for mood
  date: string;  // ISO
}

const WATER_GOAL = 2000;

const MOODS = [
  { value: 1, emoji: '😞', label: 'Погано',    color: '#EF4444' },
  { value: 2, emoji: '😕', label: 'Так собі',  color: '#F97316' },
  { value: 3, emoji: '😐', label: 'Нормально', color: '#F59E0B' },
  { value: 4, emoji: '🙂', label: 'Добре',     color: '#22C55E' },
  { value: 5, emoji: '😄', label: 'Чудово',    color: '#10B981' },
];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const fmtSleep = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
};

export default function HealthScreen() {
  const isDark = useColorScheme() === 'dark';

  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [showAddSleep, setShowAddSleep] = useState(false);
  const [sleepHours, setSleepHours] = useState('');
  const [sleepMins, setSleepMins] = useState('');

  useEffect(() => {
    loadData<HealthEntry[]>('health_entries', []).then(data => {
      setEntries(data);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (initialized) saveData('health_entries', entries);
  }, [entries, initialized]);

  const now = new Date();

  const todayEntries = useMemo(
    () => entries.filter(e => isSameDay(new Date(e.date), now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries],
  );

  const todayWater = useMemo(
    () => todayEntries.filter(e => e.type === 'water').reduce((s, e) => s + e.value, 0),
    [todayEntries],
  );

  const todaySleep = useMemo(() => {
    const arr = todayEntries.filter(e => e.type === 'sleep');
    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [todayEntries]);

  const todayMood = useMemo(() => {
    const arr = todayEntries.filter(e => e.type === 'mood');
    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [todayEntries]);

  const addWater = (ml: number) =>
    setEntries(p => [{ id: Date.now().toString(), type: 'water', value: ml, date: new Date().toISOString() }, ...p]);

  const resetTodayWater = () => {
    const ds = now.toDateString();
    setEntries(p => p.filter(e => !(e.type === 'water' && new Date(e.date).toDateString() === ds)));
  };

  const addSleep = () => {
    const mins = (parseInt(sleepHours || '0', 10)) * 60 + (parseInt(sleepMins || '0', 10));
    if (!mins) return;
    setEntries(p => [{ id: Date.now().toString(), type: 'sleep', value: mins, date: new Date().toISOString() }, ...p]);
    setSleepHours(''); setSleepMins(''); setShowAddSleep(false);
  };

  const setMood = (val: number) => {
    const ds = now.toDateString();
    setEntries(p => [
      { id: Date.now().toString(), type: 'mood', value: val, date: new Date().toISOString() },
      ...p.filter(e => !(e.type === 'mood' && new Date(e.date).toDateString() === ds)),
    ]);
  };

  const waterPct = Math.min(todayWater / WATER_GOAL, 1);
  const moodCfg = todayMood ? MOODS.find(m => m.value === todayMood) : null;

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text:   isDark ? '#EEF0FF' : '#0D1033',
    sub:    isDark ? 'rgba(238,240,255,0.45)' : 'rgba(13,16,51,0.45)',
    accent: '#10B981',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(12,12,20,0.98)' : 'rgba(244,242,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Fixed Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
          <Text style={[s.pageTitle, { color: c.text }]}>Здоров'я</Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}>

          {/* Stats row */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
            <StatCell
              value={todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)}л` : `${todayWater}мл`}
              label="Вода" color={c.accent} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell
              value={todaySleep ? fmtSleep(todaySleep) : '—'}
              label="Сон" color="#6366F1" sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell
              value={moodCfg ? moodCfg.emoji : '—'}
              label="Настрій" color="#F59E0B" sub={c.sub} />
          </View>

          {/* ─── Water ─── */}
          <SectionHeader title="Вода" icon="drop.fill" color={c.accent} textColor={c.text} />
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 }}>
              <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>
                {todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)} л` : `${todayWater} мл`}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, marginLeft: 6, marginBottom: 3 }}>/ {WATER_GOAL} мл</Text>
              {todayWater >= WATER_GOAL && (
                <View style={[s.badge, { backgroundColor: c.accent + '20', borderColor: c.accent + '40', marginLeft: 'auto' as any }]}>
                  <Text style={{ color: c.accent, fontSize: 11, fontWeight: '700' }}>Ціль!</Text>
                </View>
              )}
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)' }]}>
              <View style={[s.progressFill, { width: `${Math.round(waterPct * 100)}%` as any, backgroundColor: c.accent }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 6, marginBottom: 16 }}>
              {Math.round(waterPct * 100)}% від денної норми {WATER_GOAL} мл
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[150, 250, 350, 500].map(ml => (
                <TouchableOpacity
                  key={ml}
                  onPress={() => addWater(ml)}
                  style={[s.waterBtn, { borderColor: c.accent + '50', backgroundColor: c.accent + '12' }]}>
                  <IconSymbol name="drop.fill" size={12} color={c.accent} />
                  <Text style={{ color: c.accent, fontSize: 13, fontWeight: '700', marginTop: 3 }}>+{ml}</Text>
                  <Text style={{ color: c.accent, fontSize: 10, opacity: 0.7 }}>мл</Text>
                </TouchableOpacity>
              ))}
            </View>
            {todayWater > 0 && (
              <TouchableOpacity onPress={resetTodayWater} style={{ marginTop: 12, alignSelf: 'flex-end' }}>
                <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>Скинути</Text>
              </TouchableOpacity>
            )}
          </BlurView>

          {/* ─── Sleep ─── */}
          <SectionHeader title="Сон" icon="moon.fill" color="#6366F1" textColor={c.text} />
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {todaySleep ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.iconBox, { backgroundColor: '#6366F120' }]}>
                  <IconSymbol name="moon.fill" size={22} color="#6366F1" />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{fmtSleep(todaySleep)}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                    {todaySleep >= 420 ? 'Добре! Рекомендована норма' : todaySleep >= 360 ? 'Трохи мало, норма 7–9 год' : 'Замало для відновлення'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowAddSleep(true)}
                  style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <IconSymbol name="pencil" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowAddSleep(true)}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="moon.fill" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>Записати сон</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

          {/* ─── Mood ─── */}
          <SectionHeader title="Настрій" icon="heart.fill" color="#F59E0B" textColor={c.text} />
          <BlurView intensity={isDark ? 25 : 45} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <Text style={{ color: c.sub, fontSize: 12, marginBottom: 12 }}>Як ти почуваєшся сьогодні?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {MOODS.map(mood => {
                const active = todayMood === mood.value;
                return (
                  <TouchableOpacity
                    key={mood.value}
                    onPress={() => setMood(mood.value)}
                    style={[s.moodBtn, {
                      borderColor: active ? mood.color : c.border,
                      backgroundColor: active ? mood.color + '20' : 'transparent',
                    }]}>
                    <Text style={{ fontSize: 22 }}>{mood.emoji}</Text>
                    <Text style={{ color: active ? mood.color : c.sub, fontSize: 9, fontWeight: '600', marginTop: 3, textAlign: 'center' }}>
                      {mood.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>

          {/* ─── History ─── */}
          {entries.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 10 }]}>Останні записи</Text>
              <View style={{ gap: 8 }}>
                {entries.slice(0, 12).map(entry => {
                  const d = new Date(entry.date);
                  const dayStr = isSameDay(d, now) ? 'Сьогодні' : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
                  const timeStr = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

                  let icon: 'drop.fill' | 'moon.fill' | 'heart.fill', color: string, valueStr: string;
                  if (entry.type === 'water') {
                    icon = 'drop.fill'; color = c.accent;
                    valueStr = entry.value >= 1000 ? `${(entry.value / 1000).toFixed(1)} л` : `+${entry.value} мл`;
                  } else if (entry.type === 'sleep') {
                    icon = 'moon.fill'; color = '#6366F1';
                    valueStr = fmtSleep(entry.value);
                  } else {
                    const m = MOODS.find(m => m.value === entry.value);
                    icon = 'heart.fill'; color = m?.color ?? '#F59E0B';
                    valueStr = `${m?.emoji} ${m?.label}`;
                  }
                  return (
                    <BlurView key={entry.id} intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
                      style={[s.historyCard, { borderColor: c.border }]}>
                      <View style={[s.iconBox, { backgroundColor: color + '20', width: 38, height: 38, borderRadius: 11 }]}>
                        <IconSymbol name={icon} size={16} color={color} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{valueStr}</Text>
                        <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{dayStr} · {timeStr}</Text>
                      </View>
                    </BlurView>
                  );
                })}
              </View>
            </>
          )}

          {entries.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <IconSymbol name="heart.fill" size={42} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 15, marginTop: 14, fontWeight: '600' }}>Починай відстежувати</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, opacity: 0.7, textAlign: 'center' }}>
                {'Записуй воду, сон та настрій\nдля кращого самопочуття'}
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* ─── Sleep Modal ─── */}
      <Modal visible={showAddSleep} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowAddSleep(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setShowAddSleep(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
                style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setShowAddSleep(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[s.sheetTitle, { color: c.text }]}>Записати сон</Text>

                <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ СНУ</Text>
                <View style={[s.durBlock, { backgroundColor: '#6366F112', borderColor: '#6366F130' }]}>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      placeholder="7"
                      placeholderTextColor={c.sub}
                      value={sleepHours}
                      onChangeText={setSleepHours}
                      keyboardType="number-pad"
                      style={{ color: '#6366F1', fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                    />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>год</Text>
                  </View>
                  <Text style={{ color: c.sub, fontSize: 28, fontWeight: '200', alignSelf: 'center', marginBottom: 16 }}>:</Text>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <TextInput
                      placeholder="30"
                      placeholderTextColor={c.sub}
                      value={sleepMins}
                      onChangeText={setSleepMins}
                      keyboardType="number-pad"
                      style={{ color: '#6366F1', fontSize: 36, fontWeight: '700', textAlign: 'center', letterSpacing: -1 }}
                    />
                    <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>хвил</Text>
                  </View>
                </View>

                <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[360, 420, 480, 540].map(mins => (
                    <TouchableOpacity
                      key={mins}
                      onPress={() => { setSleepHours(String(Math.floor(mins / 60))); setSleepMins(''); }}
                      style={[s.presetBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{Math.floor(mins / 60)}г</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
                  <TouchableOpacity onPress={() => setShowAddSleep(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>Скасувати</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={addSleep} style={[s.btn, { flex: 2, backgroundColor: '#6366F1' }]}>
                    <IconSymbol name="moon.fill" size={15} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 6 }}>Зберегти</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SectionHeader({ title, icon, color, textColor }: { title: string; icon: any; color: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10, gap: 9 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={14} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 17, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: value.length > 4 ? 14 : 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:     { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  statsRow:      { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle:  { fontSize: 17, fontWeight: '800' },
  card:          { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: 4 },
  waterBtn:      { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 10, alignItems: 'center' },
  iconBox:       { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badge:         { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  emptyRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
  iconBtnSm:     { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  moodBtn:       { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 10, alignItems: 'center' },
  historyCard:   { borderRadius: 14, borderWidth: 1, padding: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:  { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:         { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden', maxHeight: Dimensions.get('window').height * 0.85 },
  handleRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:        { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:    { fontSize: 20, fontWeight: '800', marginBottom: 16 },
  label:         { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  durBlock:      { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start' },
  presetBtn:     { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  btn:           { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
