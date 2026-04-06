import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MiniBarChart } from '@/components/health/MiniBarChart';
import { RingCell } from '@/components/health/RingCell';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HK_AVAILABLE, HKDayData, fetchTodayData, initHealthKit } from '@/store/healthkit';
import { loadData, saveData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { getMonthEntries } from '@/utils/healthUtils';
import { isSameDay } from '@/utils/dateUtils';

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

const MOODS = [
  { value: 1, emoji: '😞', label: 'Погано',    color: '#EF4444' },
  { value: 2, emoji: '😕', label: 'Не дуже',  color: '#F97316' },
  { value: 3, emoji: '😐', label: 'Нормально', color: '#F59E0B' },
  { value: 4, emoji: '🙂', label: 'Добре',     color: '#10B981' },
  { value: 5, emoji: '😄', label: 'Відмінно',  color: '#6366F1' },
];

type RadialKey = 'water' | 'calories' | 'weight' | 'steps' | 'pulse';

export default function HealthScreen() {
  const isDark = useColorScheme() === 'dark';
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
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
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [refreshing, setRefreshing] = useState(false);

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

  const loadEntries = useCallback(async () => {
    const data = await loadData<HealthEntry[]>('health_entries_v2', []);
    setEntries(data);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

  useEffect(() => {
    loadEntries().then(() => setInitialized(true));
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
      const todayDate = new Date();
      const filtered = prev.filter(e => {
        const isToday = isSameDay(new Date(e.date), todayDate);
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

  const now = new Date();

  const todayEntries = useMemo(
    () => entries.filter(e => isSameDay(new Date(e.date), new Date())),
    [entries],
  );

  const todayWater  = useMemo(() => todayEntries.filter(e => e.type === 'water').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todayCal    = useMemo(() => todayEntries.filter(e => e.type === 'calories').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todaySteps  = useMemo(() => todayEntries.filter(e => e.type === 'steps').reduce((s, e) => s + e.value, 0), [todayEntries]);
  const todayWeight = useMemo(() => { const a = todayEntries.filter(e => e.type === 'weight'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);
  const todaySleep  = useMemo(() => { const a = todayEntries.filter(e => e.type === 'sleep'); return a.length ? a[a.length - 1].value : null; }, [todayEntries]);
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
  const sleepChart  = useMemo(() => chartData('sleep', 'last'), [entries]);

  const prevWeight = useMemo(() => {
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const old = entries.filter(e => e.type === 'weight' && new Date(e.date) <= weekAgo);
    return old.length ? old[old.length - 1].value : null;
  }, [entries]);

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
  const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const c = {
    bg1:   isDark ? '#0C0C14' : '#F4F2FF',
    bg2:   isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:  isDark ? '#F0EEFF' : '#1A1433',
    sub:   isDark ? 'rgba(240,238,255,0.45)' : 'rgba(26,20,51,0.45)',
    dim:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet: isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.health}</Text>
            <TouchableOpacity onPress={() => setHistoryOpen(true)}
              style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name="clock.fill" size={16} color={c.sub} />
            </TouchableOpacity>
          </View>
          <MonthPicker
            month={activeMonth}
            onChange={setActiveMonth}
            months={tr.months}
            monthsShort={tr.monthsShort}
            monthsGenitive={tr.monthsGenitive}
            accentColor={ACCENT}
            textColor={c.text}
            subColor={c.sub}
            dimColor={c.dim}
            borderColor={c.border}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 120 : 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />
          }>

          {/* Тренування banner */}
          <TouchableOpacity
            onPress={() => router.push('/workouts')}
            activeOpacity={0.85}
            style={{ marginBottom: 14 }}>
            <LinearGradient
              colors={isDark ? ['#0a0f1a', '#0f1a2e'] : ['#eff5ff', '#e0ecff']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.hkBanner, { borderColor: ACCENT_STEPS + '30' }]}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: ACCENT_STEPS + '20', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="figure.run" size={18} color={ACCENT_STEPS} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>Тренування</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>Переглянути та додати тренування</Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={c.sub} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Overview rings */}
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
            style={[s.card, { borderColor: c.border, marginBottom: 14 }]}>
            <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>{tr.todayLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <RingCell pct={todayCal / CAL_GOAL} color={ACCENT_CAL} label={tr.calories} value={`${todayCal}кк`} />
              <RingCell pct={todaySteps / STEPS_GOAL} color={ACCENT_STEPS} label={tr.steps}
                value={todaySteps >= 1000 ? `${(todaySteps / 1000).toFixed(1)}т` : `${todaySteps}`} />
              <RingCell pct={todayWater / WATER_GOAL} color={ACCENT} label={tr.water}
                value={todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)}л` : `${todayWater}мл`} />
              <RingCell pct={todaySleep ? todaySleep / 480 : 0} color={ACCENT_SLEEP} label={tr.sleep}
                value={todaySleep ? fmtSleep(todaySleep) : '—'} />
            </View>
          </BlurView>

          {/* Quick stat row */}
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
            <QuickStatCard value={latestWeight ? `${latestWeight} кг` : '—'} label={tr.weight}
              icon="scalemass.fill" color={ACCENT_WEIGHT} isDark={isDark} border={c.border} sub={c.sub} text={c.text} />
            <QuickStatCard value={todayPulse ? `${todayPulse} уд` : '—'} label={tr.pulse}
              icon="waveform.path.ecg" color={ACCENT_PULSE} isDark={isDark} border={c.border} sub={c.sub} text={c.text} />
          </View>

          {/* Calories — фокус на залишку до цілі */}
          <SectionHeader title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{todayCal}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>кк</Text>
              <View style={{ flex: 1 }} />
              <View style={[s.badge, { backgroundColor: ACCENT_CAL + '20', borderColor: ACCENT_CAL + '40' }]}>
                <Text style={{ color: ACCENT_CAL, fontSize: 11, fontWeight: '700' }}>{Math.round(Math.min(todayCal / CAL_GOAL, 1) * 100)}%</Text>
              </View>
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 6 }]}>
              <LinearGradient colors={[ACCENT_CAL + 'AA', ACCENT_CAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${Math.round(Math.min(todayCal / CAL_GOAL, 1) * 100)}%` as any }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginBottom: 10 }}>
              {todayCal < CAL_GOAL ? `Залишилось ${CAL_GOAL - todayCal} кк до норми` : 'Добову норму досягнуто'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[200, 350, 500, 700].map(kk => (
                <TouchableOpacity key={kk}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'calories', value: kk, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT_CAL + '50', backgroundColor: ACCENT_CAL + '12', paddingVertical: 7 }]}>
                  <Text style={{ color: ACCENT_CAL, fontSize: 11, fontWeight: '700' }}>+{kk} кк</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Steps — акцент на тижневому чарті + відстань */}
          <SectionHeader title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -1 }}>{todaySteps.toLocaleString(locale)}</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                  {'\u2248'} {(todaySteps * 0.00075).toFixed(1)} км{todaySteps > 0 ? ` \u00B7 ${Math.round(Math.min(todaySteps / STEPS_GOAL, 1) * 100)}% від мети` : ''}
                </Text>
              </View>
              <View style={{ width: 96 }}>
                <MiniBarChart values={stepsChart} color={ACCENT_STEPS} goal={STEPS_GOAL} height={46} />
                <View style={{ flexDirection: 'row', marginTop: 3 }}>
                  {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
                </View>
              </View>
            </View>
            <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 8 }]}>
              <LinearGradient colors={[ACCENT_STEPS + 'AA', ACCENT_STEPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.progressFill, { width: `${Math.round(Math.min(todaySteps / STEPS_GOAL, 1) * 100)}%` as any }]} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1000, 2000, 3000, 5000].map(st => (
                <TouchableOpacity key={st}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'steps', value: st, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT_STEPS + '50', backgroundColor: ACCENT_STEPS + '12', paddingVertical: 7 }]}>
                  <Text style={{ color: ACCENT_STEPS, fontSize: 11, fontWeight: '700' }}>+{st >= 1000 ? `${st / 1000}т` : st}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Water — 8-сегментний індикатор стаканів */}
          <SectionHeader title={tr.water} icon="drop.fill" color={ACCENT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>
                {todayWater >= 1000 ? `${(todayWater / 1000).toFixed(1)} л` : `${todayWater} мл`}
              </Text>
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 5 }}>/ {WATER_GOAL} мл</Text>
              <View style={{ flex: 1 }} />
              {todayWater >= WATER_GOAL
                ? <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{tr.target}</Text>
                : <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{Math.round(todayWater / WATER_GOAL * 100)}%</Text>
              }
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
              {Array.from({ length: 8 }, (_, i) => {
                const threshold = ((i + 1) / 8) * WATER_GOAL;
                return (
                  <View key={i} style={{
                    flex: 1, height: 6, borderRadius: 3,
                    backgroundColor: todayWater >= threshold ? ACCENT : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'),
                  }} />
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[150, 250, 350, 500].map(ml => (
                <TouchableOpacity key={ml}
                  onPress={() => setEntries(p => [{ id: Date.now().toString(), type: 'water', value: ml, date: new Date().toISOString() }, ...p])}
                  style={[s.chipBtn, { borderColor: ACCENT + '50', backgroundColor: ACCENT + '12', paddingVertical: 7 }]}>
                  <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>+{ml} мл</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Sleep — тривалість + якість + прогрес 8г + 7-денний чарт */}
          <SectionHeader title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            {todaySleep ? (() => {
              const sleepColor = todaySleep >= 420 ? ACCENT_SLEEP : todaySleep >= 360 ? ACCENT_MOOD : ACCENT_PULSE;
              const sleepLabel = todaySleep >= 420 ? tr.goodSleep : todaySleep >= 360 ? tr.littleLess : tr.notEnough;
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, flex: 1 }}>{fmtSleep(todaySleep)}</Text>
                    <View style={[s.badge, { backgroundColor: sleepColor + '20', borderColor: sleepColor + '40' }]}>
                      <Text style={{ color: sleepColor, fontSize: 11, fontWeight: '700' }}>{sleepLabel}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openModal('sleep')}
                      style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim, marginLeft: 8 }]}>
                      <IconSymbol name="plus" size={14} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                  <View style={[s.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', marginBottom: 8 }]}>
                    <LinearGradient colors={[sleepColor + 'AA', sleepColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={[s.progressFill, { width: `${Math.round(Math.min(todaySleep / 480, 1) * 100)}%` as any }]} />
                  </View>
                  <MiniBarChart values={sleepChart} color={ACCENT_SLEEP} height={34} />
                  <View style={{ flexDirection: 'row', marginTop: 3 }}>
                    {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
                  </View>
                </>
              );
            })() : (
              <TouchableOpacity onPress={() => openModal('sleep')}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="moon.fill" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordSleep}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

          {/* Weight — значення + тренд за тиждень + чарт */}
          <SectionHeader title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            {latestWeight ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{latestWeight} кг</Text>
                  {prevWeight && latestWeight !== prevWeight ? (() => {
                    const delta = latestWeight - prevWeight;
                    const up = delta > 0;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                        <IconSymbol name={up ? 'arrow.up.right' : 'arrow.down.right'} size={11} color={up ? ACCENT_PULSE : ACCENT} />
                        <Text style={{ color: up ? ACCENT_PULSE : ACCENT, fontSize: 11, fontWeight: '700', marginLeft: 2 }}>
                          {up ? '+' : ''}{delta.toFixed(1)} кг/тиж
                        </Text>
                      </View>
                    );
                  })() : (
                    <Text style={{ color: c.sub, fontSize: 11, marginLeft: 8 }}>{todayWeight ? tr.recordedToday : tr.lastRecord}</Text>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => openModal('weight')}
                    style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <IconSymbol name="plus" size={14} color={c.sub} />
                  </TouchableOpacity>
                </View>
                <MiniBarChart values={weightChart} color={ACCENT_WEIGHT} height={36} />
                <View style={{ flexDirection: 'row', marginTop: 3 }}>
                  {last7Labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => openModal('weight')}
                style={[s.emptyRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="scalemass.fill" size={16} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 8, flex: 1 }}>{tr.recordWeight}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

          {/* Pulse — 3-зонний індикатор ЧСС */}
          <SectionHeader title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, padding: 12 }]}>
            {todayPulse ? (() => {
              const zoneColor = todayPulse < 60 ? ACCENT_STEPS : todayPulse <= 100 ? ACCENT : ACCENT_PULSE;
              const zoneLabel = todayPulse < 60 ? tr.bradycardia : todayPulse <= 100 ? tr.normal : tr.tachycardia;
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{todayPulse}</Text>
                    <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>уд/хв</Text>
                    <View style={{ flex: 1 }} />
                    <View style={[s.badge, { backgroundColor: zoneColor + '20', borderColor: zoneColor + '40' }]}>
                      <Text style={{ color: zoneColor, fontSize: 11, fontWeight: '700' }}>{zoneLabel}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openModal('pulse')}
                      style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim, marginLeft: 8 }]}>
                      <IconSymbol name="plus" size={14} color={c.sub} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {[
                      { label: tr.bradycardia, range: '< 60',   color: ACCENT_STEPS, active: todayPulse < 60,              flex: 1   },
                      { label: tr.normal,       range: '60–100', color: ACCENT,        active: todayPulse >= 60 && todayPulse <= 100, flex: 1.4 },
                      { label: tr.tachycardia,  range: '> 100',  color: ACCENT_PULSE,  active: todayPulse > 100,             flex: 1   },
                    ].map((z, i) => (
                      <View key={i} style={{ flex: z.flex, alignItems: 'center' }}>
                        <View style={{ height: 5, width: '100%', borderRadius: 3, backgroundColor: z.active ? z.color : z.color + '28' }} />
                        <Text style={{ color: z.active ? z.color : c.sub, fontSize: 9, fontWeight: z.active ? '700' : '500', marginTop: 4 }}>
                          {z.range}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              );
            })() : (
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
          style={[s.fab, { shadowColor: ACCENT, borderRadius: fabOpen ? 29 : 16 }]}>
          <LinearGradient colors={[ACCENT, '#059669']}
            style={[s.fabGrad, { borderRadius: fabOpen ? 29 : 16 }]}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <Text style={[s.sheetTitle, { color: c.text, flex: 1, marginBottom: 0 }]}>Історія</Text>
                <MonthPicker
                  month={activeMonth}
                  onChange={setActiveMonth}
                  months={tr.months}
                  accentColor={ACCENT}
                  textColor={c.text}
                  subColor={c.sub}
                  dimColor={c.dim}
                  borderColor={c.border}
                />
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.58 }}>
                {(() => {
                  const monthEntries = getMonthEntries(entries, activeMonth);
                  return monthEntries.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <IconSymbol name="heart.fill" size={38} color={c.sub} />
                    <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '600' }}>{tr.noEntriesYet}</Text>
                  </View>
                ) : (
                  <View style={{ gap: 8, paddingBottom: 16 }}>
                    {monthEntries.slice(0, 60).map(entry => {
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
                );
                })()}
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
