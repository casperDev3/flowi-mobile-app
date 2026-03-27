import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HK_AVAILABLE, HKDayData, fetchTodayData, initHealthKit } from '@/store/healthkit';
import { loadData, saveData } from '@/store/storage';
import { useI18n } from '@/store/i18n';

const { width: W } = Dimensions.get('window');

type EntryType = 'water' | 'sleep' | 'mood' | 'weight' | 'calories' | 'steps' | 'pulse';

interface HealthEntry {
  id: string;
  type: EntryType;
  value: number;
  note?: string;
  date: string;
}

const WATER_GOAL = 2000;
const CAL_GOAL = 2200;
const STEPS_GOAL = 10000;


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

const ACCENT        = '#10B981';
const ACCENT_CAL    = '#F97316';
const ACCENT_WEIGHT = '#8B5CF6';
const ACCENT_SLEEP  = '#6366F1';
const ACCENT_MOOD   = '#F59E0B';
const ACCENT_STEPS  = '#0EA5E9';
const ACCENT_PULSE  = '#EF4444';

type RadialKey = 'water' | 'calories' | 'weight' | 'steps' | 'pulse';

function MiniBarChart({ values, color, goal, height = 52 }: { values: number[]; color: string; goal?: number; height?: number }) {
  const max = Math.max(...values, goal ?? 0, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
          <View style={{
            height: Math.max(3, (v / max) * height),
            borderRadius: 4,
            backgroundColor: i === values.length - 1 ? color : color + '55',
          }} />
        </View>
      ))}
    </View>
  );
}

function RingCell({ pct, color, label, value }: { pct: number; color: string; label: string; value: string }) {
  const SIZE = 64, STROKE = 5;
  const angle = Math.min(pct, 1) * 360;
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: STROKE, borderColor: color + '22' }} />
        <View style={{
          position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: STROKE,
          borderTopColor: angle > 0 ? color : 'transparent',
          borderRightColor: angle > 90 ? color : 'transparent',
          borderBottomColor: angle > 180 ? color : 'transparent',
          borderLeftColor: angle > 270 ? color : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }} />
        <Text style={{ color, fontSize: 10, fontWeight: '800' }}>{Math.round(pct * 100)}%</Text>
      </View>
      <Text style={{ color, fontSize: 12, fontWeight: '800', marginTop: 5 }}>{value}</Text>
      <Text style={{ color: color + '99', fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function HealthScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const MOODS = [
    { value: 1, emoji: '😞', label: tr.moodBad,   color: '#EF4444' },
    { value: 2, emoji: '😕', label: tr.moodSoSo,  color: '#F97316' },
    { value: 3, emoji: '😐', label: tr.moodOk,    color: '#EAB308' },
    { value: 4, emoji: '🙂', label: tr.moodGood,  color: '#22C55E' },
    { value: 5, emoji: '😄', label: tr.moodGreat, color: '#10B981' },
  ];
  const RADIAL_ITEMS = [
    { key: 'water',    label: tr.water,    icon: 'drop.fill',           color: ACCENT },
    { key: 'calories', label: tr.calories, icon: 'flame.fill',          color: ACCENT_CAL },
    { key: 'weight',   label: tr.weight,   icon: 'scalemass.fill',      color: ACCENT_WEIGHT },
    { key: 'steps',    label: tr.steps,    icon: 'figure.walk',         color: ACCENT_STEPS },
    { key: 'pulse',    label: tr.pulse,    icon: 'waveform.path.ecg',   color: ACCENT_PULSE },
  ] as const;
  const DAYS_SHORT = tr.weekdays;

  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  // HealthKit
  const [hkAuthorized, setHkAuthorized] = useState(false);
  const [hkSyncing, setHkSyncing] = useState(false);
  const [hkData, setHkData] = useState<HKDayData | null>(null);
  const [hkLastSync, setHkLastSync] = useState<Date | null>(null);

  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  const [modal, setModal] = useState<RadialKey | null>(null);
  const [inputVal, setInputVal] = useState('');
  const [inputVal2, setInputVal2] = useState('');
  const [inputNote, setInputNote] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    loadData<HealthEntry[]>('health_entries_v2', []).then(data => {
      setEntries(data);
      setInitialized(true);
    });
    if (HK_AVAILABLE) {
      initHealthKit().then(ok => {
        setHkAuthorized(ok);
        if (ok) syncHealthKit();
      });
    }
  }, []);

  useEffect(() => {
    if (initialized) saveData('health_entries_v2', entries);
  }, [entries, initialized]);

  const syncHealthKit = async () => {
    if (!HK_AVAILABLE || hkSyncing) return;
    setHkSyncing(true);
    const data = await fetchTodayData();
    setHkData(data);
    setHkLastSync(new Date());
    // Merge HK data into entries (overwrite today's HK-sourced values)
    setEntries(prev => {
      const todayStr = new Date().toDateString();
      const filtered = prev.filter(e => {
        const isToday = new Date(e.date).toDateString() === todayStr;
        // keep manual entries that aren't from HK-synced types
        return !isToday || (e.note !== '__hk__');
      });
      const now = new Date().toISOString();
      const hkEntries: HealthEntry[] = [];
      if (data.steps > 0)
        hkEntries.push({ id: `hk_steps_${Date.now()}`, type: 'steps', value: data.steps, note: '__hk__', date: now });
      if (data.heartRateAvg)
        hkEntries.push({ id: `hk_pulse_${Date.now()}`, type: 'pulse', value: data.heartRateAvg, note: '__hk__', date: now });
      if (data.weight)
        hkEntries.push({ id: `hk_weight_${Date.now()}`, type: 'weight', value: data.weight, note: '__hk__', date: now });
      if (data.activeCalories > 0)
        hkEntries.push({ id: `hk_cal_${Date.now()}`, type: 'calories', value: data.activeCalories, note: '__hk__', date: now });
      if (data.sleepMinutes)
        hkEntries.push({ id: `hk_sleep_${Date.now()}`, type: 'sleep', value: data.sleepMinutes, note: '__hk__', date: now });
      return [...hkEntries, ...filtered];
    });
    setHkSyncing(false);
  };

  const now = useMemo(() => new Date(), []);

  const todayEntries = useMemo(
    () => entries.filter(e => isSameDay(new Date(e.date), now)),
    [entries, now],
  );

  const todayWater  = useMemo(() => todayEntries.filter(e => e.type === 'water').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todayCal    = useMemo(() => todayEntries.filter(e => e.type === 'calories').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todaySteps  = useMemo(() => todayEntries.filter(e => e.type === 'steps').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todayWeight = useMemo(() => { const a = todayEntries.filter(e => e.type === 'weight'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);
  const todaySleep  = useMemo(() => { const a = todayEntries.filter(e => e.type === 'sleep'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);
  const todayMood   = useMemo(() => { const a = todayEntries.filter(e => e.type === 'mood'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);
  const todayPulse  = useMemo(() => { const a = todayEntries.filter(e => e.type === 'pulse'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);

  const latestWeight = useMemo(() => {
    const all = entries.filter(e => e.type === 'weight');
    return all.length ? all[all.length - 1].value : null;
  }, [entries]);

  const last7 = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i)); return d;
  }), [now]);

  const chartData = (type: EntryType, aggregate: 'sum' | 'last') =>
    last7.map(day => {
      const de = entries.filter(e => e.type === type && isSameDay(new Date(e.date), day));
      if (!de.length) return 0;
      return aggregate === 'sum' ? de.reduce((s, e) => s + e.value, 0) : de[de.length - 1].value;
    });

  const waterChart  = useMemo(() => chartData('water', 'sum'), [entries]);
  const calChart    = useMemo(() => chartData('calories', 'sum'), [entries]);
  const weightChart = useMemo(() => chartData('weight', 'last'), [entries]);
  const stepsChart  = useMemo(() => chartData('steps', 'sum'), [entries]);

  const toggleFab = () => {
    const toVal = fabOpen ? 0 : 1;
    setFabOpen(!fabOpen);
    Animated.spring(fabAnim, { toValue: toVal, useNativeDriver: true, friction: 5, tension: 80 }).start();
  };

  const closeFab = () => {
    setFabOpen(false);
    Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, friction: 6 }).start();
  };

  const openModal = (key: RadialKey) => {
    closeFab();
    setInputVal(''); setInputVal2(''); setInputNote('');
    setModal(key);
  };

  const saveEntry = () => {
    if (modal === 'sleep') {
      const mins = parseInt(inputVal || '0', 10) * 60 + parseInt(inputVal2 || '0', 10);
      if (!mins) return;
      setEntries(p => [{ id: Date.now().toString(), type: 'sleep', value: mins, note: inputNote || undefined, date: new Date().toISOString() }, ...p]);
      setModal(null); return;
    }
    const v = parseFloat(inputVal.replace(',', '.'));
    if (!v || isNaN(v)) return;
    setEntries(p => [{ id: Date.now().toString(), type: modal!, value: v, note: inputNote || undefined, date: new Date().toISOString() }, ...p]);
    setModal(null);
  };

  const RADIUS = 112;
  const radialPositions = RADIAL_ITEMS.map((_, i) => {
    const total = RADIAL_ITEMS.length;
    const angle = Math.PI + (Math.PI * i) / (total - 1);
    return { x: Math.cos(angle) * RADIUS, y: -Math.abs(Math.sin(angle)) * RADIUS };
  });

  const last7Labels = last7.map(d => DAYS_SHORT[d.getDay() === 0 ? 6 : d.getDay() - 1]);
  const moodCfg = todayMood ? MOODS.find(m => m.value === todayMood) : null;
  const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const c = {
    bg1: isDark ? '#080F18' : '#EFF8F4',
    bg2: isDark ? '#0F1A2A' : '#E0F2EE',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(16,185,129,0.15)',
    text: isDark ? '#E8FFF7' : '#0A2018',
    sub: isDark ? 'rgba(232,255,247,0.42)' : 'rgba(10,32,24,0.45)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(8,15,24,0.98)' : 'rgba(239,248,244,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={[s.pageTitle, { color: c.text }]}>{tr.health}</Text>
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: '500', marginTop: 2 }}>
              {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setHistoryOpen(true)}
            style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="clock.fill" size={16} color={c.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 120 : 100 }}
          showsVerticalScrollIndicator={false}>

          {/* Apple Health banner — iOS only */}
          {Platform.OS === 'ios' && (
            <TouchableOpacity
              onPress={() => router.push('/apple-health')}
              activeOpacity={0.85}
              style={{ marginBottom: 14 }}>
              <LinearGradient
                colors={isDark ? ['#1a0a0a', '#2a0f0f'] : ['#fff0f0', '#ffe4e4']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.hkBanner, { borderColor: '#EF444430' }]}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="heart.fill" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>Apple Health</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                    {hkAuthorized
                      ? hkLastSync
                        ? `Синхронізовано ${hkLastSync.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`
                        : tr.connected
                      : tr.connectTap}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  {hkAuthorized && (
                    <TouchableOpacity onPress={e => { e.stopPropagation(); syncHealthKit(); }} disabled={hkSyncing}
                      style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }}>
                      {hkSyncing
                        ? <ActivityIndicator size="small" color="#EF4444" />
                        : <IconSymbol name="arrow.clockwise" size={14} color="#EF4444" />}
                    </TouchableOpacity>
                  )}
                  <IconSymbol name="chevron.right" size={13} color={c.sub} />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Overview rings */}
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
            style={[s.card, { borderColor: c.border, marginBottom: 14 }]}>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>{tr.todayLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <RingCell pct={todayWater / WATER_GOAL} color={ACCENT} label={tr.water}
                value={todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)}л` : `${todayWater}мл`} />
              <RingCell pct={todayCal / CAL_GOAL} color={ACCENT_CAL} label={tr.calories} value={`${todayCal}кк`} />
              <RingCell pct={todaySteps / STEPS_GOAL} color={ACCENT_STEPS} label={tr.steps}
                value={todaySteps >= 1000 ? `${(todaySteps / 1000).toFixed(1)}т` : `${todaySteps}`} />
              <RingCell pct={todaySleep ? todaySleep / 480 : 0} color={ACCENT_SLEEP} label={tr.sleep}
                value={todaySleep ? fmtSleep(todaySleep) : '—'} />
            </View>
          </BlurView>

          {/* Quick stat row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <QuickStatCard value={latestWeight ? `${latestWeight} кг` : '—'} label={tr.weight}
              icon="scalemass.fill" color={ACCENT_WEIGHT} isDark={isDark} border={c.border} sub={c.sub} text={c.text} />
            <QuickStatCard value={moodCfg ? `${moodCfg.emoji} ${moodCfg.label}` : '—'} label={tr.mood}
              icon="heart.fill" color={ACCENT_MOOD} isDark={isDark} border={c.border} sub={c.sub} text={c.text} />
            <QuickStatCard value={todayPulse ? `${todayPulse} уд` : '—'} label={tr.pulse}
              icon="waveform.path.ecg" color={ACCENT_PULSE} isDark={isDark} border={c.border} sub={c.sub} text={c.text} />
          </View>

          {/* Water */}
          <SectionHeader title={tr.water} icon="drop.fill" color={ACCENT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>
                {todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)} л` : `${todayWater} мл`}
              </Text>
              <Text style={{ color: c.sub, fontSize: 13, marginLeft: 6, marginBottom: 4 }}>/ {WATER_GOAL} мл</Text>
              {todayWater >= WATER_GOAL && (
                <View style={[s.badge, { backgroundColor: ACCENT + '20', borderColor: ACCENT + '40', marginLeft: 'auto' as any }]}>
                  <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{tr.target}</Text>
                </View>
              )}
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 4 }]}>
              <LinearGradient colors={[ACCENT + 'AA', ACCENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${Math.round(Math.min(todayWater / WATER_GOAL, 1) * 100)}%` as any }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginBottom: 14 }}>{Math.round(Math.min(todayWater / WATER_GOAL, 1) * 100)}% від норми</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[150, 250, 350, 500].map(ml => (
                <TouchableOpacity key={ml}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'water', value: ml, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT + '50', backgroundColor: ACCENT + '12' }]}>
                  <IconSymbol name="drop.fill" size={11} color={ACCENT} />
                  <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '700', marginTop: 2 }}>+{ml}</Text>
                  <Text style={{ color: ACCENT, fontSize: 9, opacity: 0.7 }}>мл</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>{tr.days7}</Text>
            <MiniBarChart values={waterChart} color={ACCENT} goal={WATER_GOAL} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
            </View>
          </BlurView>

          {/* Calories */}
          <SectionHeader title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{todayCal} кк</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginLeft: 6, marginBottom: 4 }}>/ {CAL_GOAL} кк</Text>
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 4 }]}>
              <LinearGradient colors={[ACCENT_CAL + 'AA', ACCENT_CAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${Math.round(Math.min(todayCal / CAL_GOAL, 1) * 100)}%` as any }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginBottom: 14 }}>{Math.round(Math.min(todayCal / CAL_GOAL, 1) * 100)}% від норми</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[200, 350, 500, 700].map(kk => (
                <TouchableOpacity key={kk}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'calories', value: kk, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT_CAL + '50', backgroundColor: ACCENT_CAL + '12' }]}>
                  <IconSymbol name="flame.fill" size={11} color={ACCENT_CAL} />
                  <Text style={{ color: ACCENT_CAL, fontSize: 12, fontWeight: '700', marginTop: 2 }}>+{kk}</Text>
                  <Text style={{ color: ACCENT_CAL, fontSize: 9, opacity: 0.7 }}>кк</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>{tr.days7}</Text>
            <MiniBarChart values={calChart} color={ACCENT_CAL} goal={CAL_GOAL} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
            </View>
          </BlurView>

          {/* Weight */}
          <SectionHeader title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {latestWeight ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={[s.iconBox, { backgroundColor: ACCENT_WEIGHT + '20' }]}>
                  <IconSymbol name="scalemass.fill" size={22} color={ACCENT_WEIGHT} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{latestWeight} кг</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{todayWeight ? tr.recordedToday : tr.lastRecord}</Text>
                </View>
                <TouchableOpacity onPress={() => openModal('weight')}
                  style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <IconSymbol name="plus" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => openModal('weight')}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim, marginBottom: 16 }]}>
                <IconSymbol name="scalemass.fill" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordWeight}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>{tr.days7}</Text>
            <MiniBarChart values={weightChart} color={ACCENT_WEIGHT} height={44} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
            </View>
          </BlurView>

          {/* Sleep */}
          <SectionHeader title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {todaySleep ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.iconBox, { backgroundColor: ACCENT_SLEEP + '20' }]}>
                  <IconSymbol name="moon.fill" size={22} color={ACCENT_SLEEP} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>{fmtSleep(todaySleep)}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                    {todaySleep >= 420 ? tr.goodSleep : todaySleep >= 360 ? tr.littleLess : tr.notEnough}
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => openModal('sleep')}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="moon.fill" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordSleep}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

          {/* Steps */}
          <SectionHeader title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{todaySteps.toLocaleString(locale)}</Text>
              <Text style={{ color: c.sub, fontSize: 13, marginLeft: 6, marginBottom: 4 }}>/ {STEPS_GOAL.toLocaleString(locale)}</Text>
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 4 }]}>
              <LinearGradient colors={[ACCENT_STEPS + 'AA', ACCENT_STEPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${Math.round(Math.min(todaySteps / STEPS_GOAL, 1) * 100)}%` as any }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginBottom: 14 }}>{Math.round(Math.min(todaySteps / STEPS_GOAL, 1) * 100)}% від мети</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[1000, 2000, 3000, 5000].map(st => (
                <TouchableOpacity key={st}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'steps', value: st, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT_STEPS + '50', backgroundColor: ACCENT_STEPS + '12' }]}>
                  <IconSymbol name="figure.walk" size={11} color={ACCENT_STEPS} />
                  <Text style={{ color: ACCENT_STEPS, fontSize: 11, fontWeight: '700', marginTop: 2 }}>+{st >= 1000 ? `${st / 1000}т` : st}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 6 }}>{tr.days7}</Text>
            <MiniBarChart values={stepsChart} color={ACCENT_STEPS} goal={STEPS_GOAL} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
            </View>
          </BlurView>

          {/* Mood */}
          <SectionHeader title={tr.mood} icon="heart.fill" color={ACCENT_MOOD} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <Text style={{ color: c.sub, fontSize: 12, marginBottom: 12 }}>Як ти почуваєшся сьогодні?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {MOODS.map(mood => {
                const active = todayMood === mood.value;
                return (
                  <TouchableOpacity key={mood.value}
                    onPress={() => {
                      const ds = now.toDateString();
                      setEntries(p => [
                        { id: Date.now().toString(), type: 'mood', value: mood.value, date: new Date().toISOString() },
                        ...p.filter(e => !(e.type === 'mood' && new Date(e.date).toDateString() === ds)),
                      ]);
                    }}
                    style={[s.moodBtn, { borderColor: active ? mood.color : c.border, backgroundColor: active ? mood.color + '22' : 'transparent' }]}>
                    <Text style={{ fontSize: 22 }}>{mood.emoji}</Text>
                    <Text style={{ color: active ? mood.color : c.sub, fontSize: 9, fontWeight: '700', marginTop: 3, textAlign: 'center' }}>{mood.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </BlurView>

          {/* Pulse */}
          <SectionHeader title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {todayPulse ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={[s.iconBox, { backgroundColor: ACCENT_PULSE + '20' }]}>
                  <IconSymbol name="waveform.path.ecg" size={22} color={ACCENT_PULSE} />
                </View>
                <View style={{ marginLeft: 14, flex: 1 }}>
                  <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{todayPulse} уд/хв</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                    {todayPulse < 60 ? tr.bradycardia : todayPulse <= 100 ? tr.normal : tr.tachycardia}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => openModal('pulse')}
                  style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <IconSymbol name="plus" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => openModal('pulse')}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="waveform.path.ecg" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordPulse}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

        </ScrollView>
      </SafeAreaView>

      {/* FAB backdrop */}
      {fabOpen && (
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}
          onPress={closeFab} />
      )}

      {/* Radial FAB */}
      <View style={[s.fabContainer, { bottom: Platform.OS === 'ios' ? 108 : 88 }]} pointerEvents="box-none">
        {RADIAL_ITEMS.map((item, i) => {
          const pos = radialPositions[i];
          const translateX = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
          const translateY = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
          const opacity = fabAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
          const scale = fabAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.2, 1] });
          return (
            <Animated.View key={item.key} style={[s.radialItem, { transform: [{ translateX }, { translateY }, { scale }], opacity }]}>
              <TouchableOpacity onPress={() => openModal(item.key as RadialKey)}
                style={[s.radialBtn, { backgroundColor: item.color, shadowColor: item.color }]}>
                <IconSymbol name={item.icon as any} size={19} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        <TouchableOpacity onPress={toggleFab} activeOpacity={0.85}
          style={[s.fab, { shadowColor: ACCENT }]}>
          <LinearGradient colors={[ACCENT, '#059669']} style={s.fabGrad}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Animated.View style={{ transform: [{ rotate: fabRotate }] }}>
              <IconSymbol name="plus" size={26} color="#fff" />
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Entry modal */}
      <Modal visible={modal !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setModal(null)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
                style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <View style={s.handleRow}>
                  <View style={{ flex: 1 }} />
                  <View style={[s.handle, { backgroundColor: c.border }]} />
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <IconSymbol name="xmark" size={17} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                </View>

                {modal === 'water' && <>
                  <ModalTitle title={tr.addWater} icon="drop.fill" color={ACCENT} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ (МЛ)</Text>
                  <TextInput placeholder="250" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                    keyboardType="number-pad" autoFocus
                    style={[s.bigInput, { color: ACCENT, borderColor: ACCENT + '40', backgroundColor: ACCENT + '10' }]} />
                  <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[150, 250, 350, 500].map(ml => (
                      <TouchableOpacity key={ml} onPress={() => setInputVal(String(ml))}
                        style={[s.presetBtn, { borderColor: ACCENT + '40', backgroundColor: inputVal === String(ml) ? ACCENT + '25' : c.dim }]}>
                        <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '700' }}>{ml}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}

                {modal === 'calories' && <>
                  <ModalTitle title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>КІЛОКАЛОРІЇ</Text>
                  <TextInput placeholder="350" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                    keyboardType="number-pad" autoFocus
                    style={[s.bigInput, { color: ACCENT_CAL, borderColor: ACCENT_CAL + '40', backgroundColor: ACCENT_CAL + '10' }]} />
                  <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    {[200, 350, 500, 700].map(kk => (
                      <TouchableOpacity key={kk} onPress={() => setInputVal(String(kk))}
                        style={[s.presetBtn, { borderColor: ACCENT_CAL + '40', backgroundColor: inputVal === String(kk) ? ACCENT_CAL + '25' : c.dim }]}>
                        <Text style={{ color: ACCENT_CAL, fontSize: 13, fontWeight: '700' }}>{kk}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[s.label, { color: c.sub }]}>НОТАТКА (страва)</Text>
                  <TextInput placeholder="Обід, гречка з куркою…" placeholderTextColor={c.sub}
                    value={inputNote} onChangeText={setInputNote}
                    style={[s.noteInput, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
                </>}

                {modal === 'weight' && <>
                  <ModalTitle title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>ВАГА (КГ)</Text>
                  <TextInput placeholder="70.5" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                    keyboardType="decimal-pad" autoFocus
                    style={[s.bigInput, { color: ACCENT_WEIGHT, borderColor: ACCENT_WEIGHT + '40', backgroundColor: ACCENT_WEIGHT + '10' }]} />
                </>}

                {modal === 'sleep' && <>
                  <ModalTitle title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>ТРИВАЛІСТЬ</Text>
                  <View style={[s.durBlock, { backgroundColor: ACCENT_SLEEP + '12', borderColor: ACCENT_SLEEP + '30' }]}>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput placeholder="7" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                        keyboardType="number-pad" autoFocus
                        style={{ color: ACCENT_SLEEP, fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: -1 }} />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.hrs}</Text>
                    </View>
                    <Text style={{ color: c.sub, fontSize: 30, fontWeight: '200', alignSelf: 'center', marginBottom: 18 }}>:</Text>
                    <View style={{ flex: 1, alignItems: 'center' }}>
                      <TextInput placeholder="30" placeholderTextColor={c.sub} value={inputVal2} onChangeText={setInputVal2}
                        keyboardType="number-pad"
                        style={{ color: ACCENT_SLEEP, fontSize: 38, fontWeight: '800', textAlign: 'center', letterSpacing: -1 }} />
                      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{tr.mins}</Text>
                    </View>
                  </View>
                  <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[360, 420, 480, 540].map(mins => (
                      <TouchableOpacity key={mins}
                        onPress={() => { setInputVal(String(Math.floor(mins / 60))); setInputVal2('00'); }}
                        style={[s.presetBtn, { borderColor: ACCENT_SLEEP + '40', backgroundColor: inputVal === String(Math.floor(mins / 60)) ? ACCENT_SLEEP + '25' : c.dim }]}>
                        <Text style={{ color: ACCENT_SLEEP, fontSize: 13, fontWeight: '700' }}>{Math.floor(mins / 60)}г</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}

                {modal === 'steps' && <>
                  <ModalTitle title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>КІЛЬКІСТЬ КРОКІВ</Text>
                  <TextInput placeholder="5000" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                    keyboardType="number-pad" autoFocus
                    style={[s.bigInput, { color: ACCENT_STEPS, borderColor: ACCENT_STEPS + '40', backgroundColor: ACCENT_STEPS + '10' }]} />
                  <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[1000, 3000, 5000, 10000].map(st => (
                      <TouchableOpacity key={st} onPress={() => setInputVal(String(st))}
                        style={[s.presetBtn, { borderColor: ACCENT_STEPS + '40', backgroundColor: inputVal === String(st) ? ACCENT_STEPS + '25' : c.dim }]}>
                        <Text style={{ color: ACCENT_STEPS, fontSize: 12, fontWeight: '700' }}>{st >= 1000 ? `${st / 1000}т` : st}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}

                {modal === 'pulse' && <>
                  <ModalTitle title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
                  <Text style={[s.label, { color: c.sub }]}>УДАРИ ЗА ХВИЛИНУ</Text>
                  <TextInput placeholder="72" placeholderTextColor={c.sub} value={inputVal} onChangeText={setInputVal}
                    keyboardType="number-pad" autoFocus
                    style={[s.bigInput, { color: ACCENT_PULSE, borderColor: ACCENT_PULSE + '40', backgroundColor: ACCENT_PULSE + '10' }]} />
                  <Text style={[s.label, { color: c.sub }]}>ШВИДКИЙ ВИБІР</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[60, 70, 80, 90].map(bpm => (
                      <TouchableOpacity key={bpm} onPress={() => setInputVal(String(bpm))}
                        style={[s.presetBtn, { borderColor: ACCENT_PULSE + '40', backgroundColor: inputVal === String(bpm) ? ACCENT_PULSE + '25' : c.dim }]}>
                        <Text style={{ color: ACCENT_PULSE, fontSize: 13, fontWeight: '700' }}>{bpm}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
                  <TouchableOpacity onPress={() => setModal(null)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveEntry}
                    style={[s.btn, { flex: 2, backgroundColor: RADIAL_ITEMS.find(r => r.key === modal)?.color ?? ACCENT }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* History modal */}
      <Modal visible={historyOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setHistoryOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setHistoryOpen(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setHistoryOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[s.sheetTitle, { color: c.text, marginBottom: 14 }]}>Історія</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.58 }}>
                {entries.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <IconSymbol name="heart.fill" size={38} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '600' }}>{tr.noEntriesYet}</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, paddingBottom: 16 }}>
                    {entries.slice(0, 60).map(entry => {
                      const d = new Date(entry.date);
                      const dayStr = isSameDay(d, now) ? tr.today : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                      const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                      const cfg = getEntryCfg(entry, MOODS, tr);
                      return (
                        <View key={entry.id} style={[s.historyCard, { borderColor: c.border, backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.78)' }]}>
                          <View style={[s.iconBox, { backgroundColor: cfg.color + '20', width: 38, height: 38, borderRadius: 11 }]}>
                            <IconSymbol name={cfg.icon as any} size={16} color={cfg.color} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{cfg.valueStr}</Text>
                            {entry.note ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{entry.note}</Text> : null}
                            <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{dayStr} · {timeStr}</Text>
                          </View>
                          <View style={[s.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '35' }]}>
                            <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.typeLabel}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function getEntryCfg(entry: HealthEntry, moods: { value: number; emoji: string; label: string; color: string }[], tr: any) {
  switch (entry.type) {
    case 'water':    return { icon: 'drop.fill',         color: ACCENT,         typeLabel: tr.water,    valueStr: entry.value >= 1000 ? `${(entry.value / 1000).toFixed(1)} л` : `+${entry.value} мл` };
    case 'calories': return { icon: 'flame.fill',        color: ACCENT_CAL,     typeLabel: tr.calories, valueStr: `${entry.value} кк` };
    case 'weight':   return { icon: 'scalemass.fill',    color: ACCENT_WEIGHT,  typeLabel: tr.weight,   valueStr: `${entry.value} кг` };
    case 'sleep':    return { icon: 'moon.fill',         color: ACCENT_SLEEP,   typeLabel: tr.sleep,    valueStr: fmtSleep(entry.value) };
    case 'steps':    return { icon: 'figure.walk',       color: ACCENT_STEPS,   typeLabel: tr.steps,    valueStr: `${entry.value.toLocaleString()} кр` };
    case 'pulse':    return { icon: 'waveform.path.ecg', color: ACCENT_PULSE,   typeLabel: tr.pulse,    valueStr: `${entry.value} уд/хв` };
    case 'mood': {
      const m = moods.find(m => m.value === entry.value);
      return { icon: 'heart.fill', color: m?.color ?? ACCENT_MOOD, typeLabel: tr.mood, valueStr: `${m?.emoji} ${m?.label}` };
    }
    default: return { icon: 'heart.fill', color: ACCENT_MOOD, typeLabel: '—', valueStr: String(entry.value) };
  }
}

function SectionHeader({ title, icon, color, textColor }: { title: string; icon: any; color: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 22, marginBottom: 10, gap: 9 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={14} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 17, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function ModalTitle({ title, icon, color, textColor }: { title: string; icon: any; color: string; textColor: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={18} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 20, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function QuickStatCard({ value, label, icon, color, isDark, border, sub, text }: {
  value: string; label: string; icon: any; color: string;
  isDark: boolean; border: string; sub: string; text: string;
}) {
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ flex: 1, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 12, alignItems: 'center' }}>
      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <Text style={{ color: text, fontSize: 12, fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </BlurView>
  );
}

const s = StyleSheet.create({
  pageTitle:    { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  card:         { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden', marginBottom: 2 },
  progressTrack:{ height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  chipBtn:      { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 9, alignItems: 'center' },
  iconBox:      { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  iconBtnSm:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:        { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  emptyRow:     { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
  moodBtn:      { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 10, alignItems: 'center' },
  historyCard:  { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center' },
  hkBanner:     { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center' },
  fabContainer: { position: 'absolute', right: 20, alignItems: 'center', justifyContent: 'center' },
  fab:          { width: 58, height: 58, borderRadius: 29, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabGrad:      { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  radialItem:   { position: 'absolute', alignItems: 'center' },
  radialBtn:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6 },
  radialLabel:  { marginTop: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, overflow: 'hidden' },
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2 },
  sheetTitle:   { fontSize: 20, fontWeight: '800' },
  label:        { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  bigInput:     { fontSize: 36, fontWeight: '800', textAlign: 'center', borderRadius: 16, borderWidth: 1.5, paddingVertical: 16, letterSpacing: -1 },
  noteInput:    { fontSize: 14, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11 },
  durBlock:     { flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, alignItems: 'flex-start' },
  presetBtn:    { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 9, alignItems: 'center' },
  btn:          { paddingVertical: 14, borderRadius: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
});
