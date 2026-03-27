import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  HK_AVAILABLE,
  HKDayData,
  HKHeartRateSample,
  HKWeekDay,
  HKWorkout,
  fetchHeartRateSamples,
  fetchTodayData,
  fetchWeekData,
  fetchWorkouts,
  initHealthKit,
} from '@/store/healthkit';

const { width: W } = Dimensions.get('window');

const WORKOUT_NAMES: Record<number, string> = {
  1: 'Американський футбол', 2: 'Стрільба з лука', 3: 'Бадмінтон', 4: 'Бейсбол',
  5: 'Баскетбол', 6: 'Боулінг', 7: 'Бокс', 8: 'Скелелазіння', 9: 'Кросфіт',
  10: 'Велосипед', 13: 'Еліпсоїд', 16: 'Фехтування', 17: 'Риболовля', 20: 'Гольф',
  24: 'Хокей', 25: 'Хайкінг', 27: 'Катання на ковзанах', 28: 'Кікбоксинг',
  34: 'Змішані єдиноборства', 37: 'Інший', 38: 'Падл-борд', 41: 'Пілатес',
  45: 'Ракетбол', 46: 'Гребля', 47: 'Регбі', 48: 'Біг', 50: 'Вітрильний спорт',
  51: 'Катання на роликах', 52: 'Стрільба', 53: 'Лижний спорт', 57: 'Сноуборд',
  58: 'Сокербол', 59: 'Сквош', 62: 'Плавання', 63: 'Стол. теніс', 64: 'Теніс',
  68: 'Трекінг', 70: 'Волейбол', 71: 'Ходьба', 72: 'Водне поло', 73: 'Йога',
  74: 'Зумба', 75: 'Силові тренування', 79: 'Функціональний фітнес', 82: 'Танці',
  83: 'Кардіо', 84: 'HIIT', 99: 'Тренування',
};

function workoutName(id: number) {
  return WORKOUT_NAMES[id] ?? `Тренування (${id})`;
}

function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

function fmtSleep(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
}

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

function MiniBarChart({ values, color, maxVal, height = 48 }: { values: (number | null)[]; color: string; maxVal?: number; height?: number }) {
  const max = maxVal ?? Math.max(...values.map(v => v ?? 0), 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, height, justifyContent: 'flex-end' }}>
          <View style={{
            height: Math.max(3, ((v ?? 0) / max) * height),
            borderRadius: 4,
            backgroundColor: i === values.length - 1 ? color : color + '66',
          }} />
        </View>
      ))}
    </View>
  );
}

function HRSparkline({ samples, color }: { samples: HKHeartRateSample[]; color: string }) {
  if (!samples.length) return null;
  const W_CHART = W - 64;
  const H = 56;
  const values = samples.map(s => s.value);
  const min = Math.min(...values), max = Math.max(...values, min + 1);
  const pts = samples.map((s, i) => ({
    x: (i / (samples.length - 1 || 1)) * W_CHART,
    y: H - ((s.value - min) / (max - min)) * H,
  }));

  return (
    <View style={{ height: H, width: W_CHART, marginVertical: 8 }}>
      {pts.slice(1).map((pt, i) => {
        const prev = pts[i];
        const dx = pt.x - prev.x, dy = pt.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View key={i} style={{
            position: 'absolute',
            left: prev.x, top: prev.y,
            width: len, height: 2,
            backgroundColor: color + 'CC',
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: '0 0',
          }} />
        );
      })}
    </View>
  );
}

export default function AppleHealthScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const waitingForReturn = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [today, setToday] = useState<HKDayData | null>(null);
  const [week, setWeek] = useState<HKWeekDay[]>([]);
  const [workouts, setWorkouts] = useState<HKWorkout[]>([]);
  const [hrSamples, setHrSamples] = useState<HKHeartRateSample[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setSyncing(true);
    const [t, w, wo, hr] = await Promise.all([
      fetchTodayData(),
      fetchWeekData(),
      fetchWorkouts(),
      fetchHeartRateSamples(24),
    ]);
    setToday(t);
    setWeek(w);
    setWorkouts(wo);
    setHrSamples(hr);
    setLastSync(new Date());
    setSyncing(false);
  }, []);

  useEffect(() => {
    if (!HK_AVAILABLE) { setLoading(false); return; }
    initHealthKit().then(ok => {
      setAuthorized(ok);
      setLoading(false);
      if (ok) load();
    });

    // When user returns from Apple Health settings — re-check permissions
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && waitingForReturn.current) {
        waitingForReturn.current = false;
        setLoading(true);
        initHealthKit().then(ok => {
          setAuthorized(ok);
          setLoading(false);
          if (ok) load();
        });
      }
    });
    return () => sub.remove();
  }, []);

  const c = {
    bg1: isDark ? '#080F18' : '#EFF8F4',
    bg2: isDark ? '#0F1A2A' : '#E0F2EE',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(16,185,129,0.15)',
    text: isDark ? '#E8FFF7' : '#0A2018',
    sub: isDark ? 'rgba(232,255,247,0.42)' : 'rgba(10,32,24,0.45)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const weekLabels = week.map(d => {
    const date = new Date(d.date);
    return DAYS_SHORT[date.getDay() === 0 ? 6 : date.getDay() - 1];
  });

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 }}>
          <TouchableOpacity onPress={() => router.back()}
            style={[s.backBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="chevron.left" size={16} color={c.sub} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={[s.pageTitle, { color: c.text }]}>Apple Health</Text>
            {lastSync && (
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                Оновлено {lastSync.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </View>
          {authorized && (
            <TouchableOpacity onPress={load} disabled={syncing}
              style={[s.syncBtn, { borderColor: c.border, backgroundColor: '#10B98115' }]}>
              {syncing
                ? <ActivityIndicator size="small" color="#10B981" />
                : <IconSymbol name="arrow.clockwise" size={16} color="#10B981" />}
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : !HK_AVAILABLE ? (
          <NotAvailable c={c} />
        ) : !authorized ? (
          <NotAuthorized c={c} onRequest={async () => {
            // First try — this shows the iOS permission dialog on first launch
            const ok = await initHealthKit();
            if (ok) {
              setAuthorized(true);
              load();
              return;
            }
            // Permission was previously denied — open Apple Health so user can enable manually
            waitingForReturn.current = true;
            Linking.openURL('x-apple-health://').catch(() =>
              Linking.openSettings(),
            );
          }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

            {/* WIP banner */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B44', backgroundColor: '#F59E0B12', padding: 14, marginBottom: 18 }}>
              <IconSymbol name="hammer.fill" size={16} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700', flex: 1 }}>
                Цей функціонал наразі знаходиться в розробці
              </Text>
            </View>

            {/* Today summary grid */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 4, marginBottom: 12 }]}>Сьогодні</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <MetricCard label="Кроки" value={today?.steps ? today.steps.toLocaleString('uk-UA') : '—'} unit=""
                icon="figure.walk" color="#0EA5E9" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label="Активні кк" value={today?.activeCalories ? `${today.activeCalories}` : '—'} unit="кк"
                icon="flame.fill" color="#F97316" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label="Дистанція" value={today?.distanceKm != null ? `${today.distanceKm}` : '—'} unit="км"
                icon="map.fill" color="#10B981" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label="Поверхи" value={today?.flightsClimbed ? `${today.flightsClimbed}` : '—'} unit="пов"
                icon="arrow.up.circle.fill" color="#8B5CF6" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label="Сон" value={today?.sleepMinutes ? fmtSleep(today.sleepMinutes) : '—'} unit=""
                icon="moon.fill" color="#6366F1" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label="Вага" value={today?.weight != null ? `${today.weight}` : '—'} unit="кг"
                icon="scalemass.fill" color="#EC4899" isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>

            {/* Heart rate */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>Пульс</Text>
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
              style={[s.card, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <HRStatBox label="Середній" value={today?.heartRateAvg} unit="уд/хв" color="#EF4444" c={c} />
                <HRStatBox label="Мін" value={today?.heartRateMin} unit="уд/хв" color="#F97316" c={c} />
                <HRStatBox label="Макс" value={today?.heartRateMax} unit="уд/хв" color="#DC2626" c={c} />
                <HRStatBox label="Спокій" value={today?.restingHeartRate} unit="уд/хв" color="#6366F1" c={c} />
              </View>
              {hrSamples.length > 1 && (
                <>
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                    За останні 24 год ({hrSamples.length} вимірів)
                  </Text>
                  <HRSparkline samples={hrSamples} color="#EF4444" />
                </>
              )}
              {today?.hrv != null && (
                <View style={[s.hkvRow, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <IconSymbol name="waveform.path.ecg" size={15} color="#8B5CF6" />
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 }}>
                    Варіабельність пульсу (HRV)
                  </Text>
                  <Text style={{ color: '#8B5CF6', fontSize: 15, fontWeight: '800' }}>{today.hrv} мс</Text>
                </View>
              )}
              {today?.spo2 != null && (
                <View style={[s.hkvRow, { borderColor: c.border, backgroundColor: c.dim, marginTop: 8 }]}>
                  <IconSymbol name="lungs.fill" size={15} color="#0EA5E9" />
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginLeft: 8, flex: 1 }}>
                    SpO₂ (насичення O₂)
                  </Text>
                  <Text style={{ color: '#0EA5E9', fontSize: 15, fontWeight: '800' }}>{today.spo2}%</Text>
                </View>
              )}
            </BlurView>

            {/* Week charts */}
            {week.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>7 днів</Text>
                <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                  style={[s.card, { borderColor: c.border }]}>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>Кроки</Text>
                  <MiniBarChart values={week.map(d => d.steps)} color="#0EA5E9" />
                  <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 18 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>Активні калорії</Text>
                  <MiniBarChart values={week.map(d => d.activeCalories)} color="#F97316" />
                  <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 18 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>Середній пульс</Text>
                  <MiniBarChart values={week.map(d => d.heartRateAvg)} color="#EF4444" maxVal={200} />
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>
                </BlurView>
              </>
            )}

            {/* Workouts */}
            {workouts.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>
                  Тренування (30 днів)
                </Text>
                <View style={{ gap: 8 }}>
                  {workouts.map((wo, i) => {
                    const d = new Date(wo.startDate);
                    const dateStr = d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
                    const timeStr = d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
                    return (
                      <BlurView key={i} intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
                        style={[s.workoutCard, { borderColor: c.border }]}>
                        <View style={[s.workoutIcon, { backgroundColor: '#10B98122' }]}>
                          <IconSymbol name="figure.run" size={18} color="#10B981" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                            {workoutName(wo.activityId)}
                          </Text>
                          <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                            {dateStr} · {timeStr} · {wo.sourceName}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{fmtDuration(wo.duration)}</Text>
                          <Text style={{ color: '#F97316', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                            {Math.round(wo.calories)} кк
                          </Text>
                          {wo.distance > 0 && (
                            <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '600' }}>
                              {(wo.distance / 1000).toFixed(1)} км
                            </Text>
                          )}
                        </View>
                      </BlurView>
                    );
                  })}
                </View>
              </>
            )}

          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function MetricCard({ label, value, unit, icon, color, isDark, border, text, sub }: {
  label: string; value: string; unit: string; icon: any; color: string;
  isDark: boolean; border: string; text: string; sub: string;
}) {
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ width: (W - 42) / 2, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name={icon} size={14} color={color} />
        </View>
        <Text style={{ color: sub, fontSize: 11, fontWeight: '600', marginLeft: 8 }}>{label}</Text>
      </View>
      <Text style={{ color: text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }} numberOfLines={1}>
        {value}{unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: sub }}> {unit}</Text> : null}
      </Text>
    </BlurView>
  );
}

function HRStatBox({ label, value, unit, color, c }: { label: string; value: number | null | undefined; unit: string; color: string; c: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.sub, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 }}>{value ?? '—'}</Text>
      {value != null && <Text style={{ color: c.sub, fontSize: 9, marginTop: 2 }}>{unit}</Text>}
    </View>
  );
}

function NotAvailable({ c }: { c: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <IconSymbol name="heart.slash.fill" size={52} color={c.sub} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
        Недоступно
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
        Apple Health доступний тільки на iPhone з iOS 14+
      </Text>
    </View>
  );
}

function NotAuthorized({ c, onRequest }: { c: any; onRequest: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 80, height: 80, borderRadius: 22, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <IconSymbol name="heart.fill" size={38} color="#EF4444" />
      </View>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
        Підключити Apple Health
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
        {'Надай доступ до даних здоров\'я —\nпульс, кроки, сон, тренування та більше.'}
      </Text>
      <TouchableOpacity onPress={onRequest}
        style={{ marginTop: 28, backgroundColor: '#EF4444', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Надати доступ</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  sectionTitle:{ fontSize: 17, fontWeight: '800' },
  card:        { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  backBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  syncBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hkvRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12 },
  workoutCard: { borderRadius: 14, borderWidth: 1, padding: 14, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  workoutIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
