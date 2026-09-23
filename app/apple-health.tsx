import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';
import {
  HKDayData,
  HKHeartRateSample,
  HKReadOutcome,
  HKWeekDay,
  HKWorkout,
  fetchHeartRateSamples,
  fetchTodayDataResult,
  fetchWeekData,
  fetchWorkouts,
} from '@/store/healthkit';
import {
  getHealthConnectStatus,
  openHealthConnectInstall,
  openHealthConnectSettings,
  readHealthConnectDay,
} from '@/store/health-connect';
import { pickHealthSource } from '@/hooks/use-health-entries';
import type { Translations } from '@/store/translations';
import { useResponsive } from '@/hooks/use-responsive';
import { useContentWidth, CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { fmtSleep } from '@/utils/healthTheme';


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

/**
 * Один екран для обох ОС: на iPhone — Apple Health, на Android — Health
 * Connect (той самий контракт джерела, utils/healthUtils.ts HealthSourceApi).
 * Файл лишається `apple-health.tsx`, бо маршрут уже зареєстрований і на нього
 * ведуть переходи з вкладки «Активність».
 */
const SOURCE = pickHealthSource();
const IS_IOS = Platform.OS === 'ios';

/** Сьогодні з Health Connect у формі HKDayData, щоб картки не розгалужувались. */
async function fetchTodayAndroid(): Promise<{ data: HKDayData; outcome: HKReadOutcome }> {
  const now = new Date();
  const { read, outcome } = await readHealthConnectDay(now, now);
  return {
    data: {
      steps: read.steps ?? 0,
      activeCalories: read.activeCalories ?? 0,
      heartRateAvg: read.heartRateAvg,
      heartRateMin: read.heartRateMin ?? null,
      heartRateMax: read.heartRateMax ?? null,
      restingHeartRate: read.restingHeartRate,
      weight: null,
      distanceKm: read.distanceKm,
      sleepMinutes: read.sleep?.total ?? null,
      sleep: read.sleep,
      spo2: read.spo2,
    },
    outcome,
  };
}

/** `yyyy-mm-dd` → локальна дата (new Date('yyyy-mm-dd') — це UTC-північ). */
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Проміжок між картками метрик; від нього рахується їхня ширина. */
const GRID_GAP = 10;

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
  const { width } = useResponsive();
  if (!samples.length) return null;
  const W_CHART = width - 64;
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
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const contentWidth = useContentWidth();
  const { width, sizeClass } = useResponsive();
  // Дві колонки на телефоні, три на середньому вікні, чотири на широкому.
  const metricColumns = sizeClass === 'expanded' ? 4 : sizeClass === 'medium' ? 3 : 2;
  // Ширина картки рахується від колонки контенту (вона обмежена 720pt), а не
  // від вікна: інакше на планшеті дві картки по пів екрана вилазили б за неї.
  const cardWidth = useMemo(() => {
    const column = Math.min(width, CONTENT_MAX_WIDTH) - 32; // 16pt поля з боків
    return (column - GRID_GAP * (metricColumns - 1)) / metricColumns;
  }, [width, metricColumns]);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const waitingForReturn = useRef(false);
  const [syncing, setSyncing] = useState(false);
  const [today, setToday] = useState<HKDayData | null>(null);
  const [week, setWeek] = useState<HKWeekDay[]>([]);
  const [workouts, setWorkouts] = useState<HKWorkout[]>([]);
  const [hrSamples, setHrSamples] = useState<HKHeartRateSample[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  // ERR-14: читання могло не вдатись зовсім. Тоді нулі на картках — не факт
  // про здоровʼя людини, а відсутність відповіді, і підпис «Оновлено HH:MM»
  // поверх них був неправдою.
  const [readFailed, setReadFailed] = useState(false);

  const [hcMissing, setHcMissing] = useState(false);

  const load = useCallback(async () => {
    setSyncing(true);
    if (!IS_IOS) {
      const t = await fetchTodayAndroid();
      setReadFailed(!t.outcome.ok);
      if (t.outcome.ok) { setToday(t.data); setLastSync(new Date()); }
      setSyncing(false);
      return;
    }
    const [t, w, wo, hr] = await Promise.all([
      fetchTodayDataResult(),
      fetchWeekData(),
      fetchWorkouts(),
      fetchHeartRateSamples(24),
    ]);
    setReadFailed(!t.outcome.ok);
    if (t.outcome.ok) {
      setToday(t.data);
      setWeek(w);
      setWorkouts(wo);
      setHrSamples(hr);
      setLastSync(new Date());
    }
    setSyncing(false);
  }, []);

  /**
   * ERR-14. `initHealthKit()` каже лише «модуль є і запит не впав» — Apple за
   * дизайном не повідомляє, що саме дозволено читати. Тому окремо питаємо
   * getRequestStatusForAuthorization: `shouldRequest` означає, що діалог ще
   * не показували або на нього не відповіли, тобто доступу НЕМАЄ і екран
   * мусить пропонувати його надати, а не малювати нулі.
   */
  const checkAccess = useCallback(async () => {
    if (!SOURCE?.isAvailable) { setLoading(false); return; }
    if (!IS_IOS) {
      // Health Connect відсутній/застарів — пояснення й посилання, а не нулі.
      const status = await getHealthConnectStatus();
      if (status !== 'available') { setHcMissing(true); setAuthorized(false); setLoading(false); return; }
      setHcMissing(false);
      // Android: дозвіл не просимо без дії людини — лише перевіряємо.
      const access = await SOURCE.getAccess();
      const granted = access === 'granted' || access === 'unknown';
      setAuthorized(granted);
      setLoading(false);
      if (granted) await load();
      return;
    }
    const ok = await SOURCE.requestAccess();
    const access = await SOURCE.getAccess();
    const granted = ok && access !== 'denied' && access !== 'unavailable';
    setAuthorized(granted);
    setLoading(false);
    if (granted) await load();
  }, [load]);

  useEffect(() => {
    if (!SOURCE?.isAvailable) { setLoading(false); return; }
    void checkAccess();

    // Повернення з налаштувань Health / Health Connect — перевірити дозволи знову.
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active' && waitingForReturn.current) {
        waitingForReturn.current = false;
        setLoading(true);
        void checkAccess();
      }
    });
    return () => sub.remove();
    // checkAccess — стабільний useCallback, тож ефект не перезапускається.
  }, [checkAccess]);

  // Палітра — у useMemo, щоб React.memo на картках метрик і тренувань
  // не збивався новим обʼєктом на кожен ререндер (а їх тут багато: синхронізація
  // оновлює стан чотири рази поспіль).
  const c = useMemo(() => ({
    bg1: isDark ? '#080F18' : '#EFF8F4',
    bg2: isDark ? '#0F1A2A' : '#E0F2EE',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(16,185,129,0.15)',
    text: isDark ? '#E8FFF7' : '#0A2018',
    sub: isDark ? 'rgba(232,255,247,0.62)' : 'rgba(10,32,24,0.58)',
    dim: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  }), [isDark]);

  const weekLabels = week.map(d => {
    const date = parseDayKey(d.date);
    return tr.weekdays[date.getDay() === 0 ? 6 : date.getDay() - 1];
  });
  const sourceLabel = SOURCE?.label ?? 'Apple Health';

  // Кожне тренування унікальне за моментом початку; індекс — запобіжник
  // на випадок двох записів з однаковим startDate з різних джерел.
  const workoutKey = useCallback((wo: HKWorkout, i: number) => `${wo.startDate}-${i}`, []);
  const renderWorkout = useCallback(({ item }: { item: HKWorkout }) => (
    <WorkoutCard wo={item} isDark={isDark} border={c.border} text={c.text} sub={c.sub} tr={tr} locale={locale} />
  ), [isDark, c, tr, locale]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/*
          «Apple Health» — назва сервісу, не перекладається; у словник іде
          лише підпис кнопки. Розділу немає в сайдбарі (він відкривається зі
          «Здоровʼя»): на телефоні шлях нагору — «Назад», на планшеті — крихти
          «Здоровʼя → Налаштування → Apple Health» (ScreenHeaderNav.ts).
          Рядок стану переїхав із коробки заголовка під нього: у спільному
          хедері під заголовком стоїть саме children.
        */}
        <ScreenHeader
          title={sourceLabel}
          color={c.text}
          titleStyle={s.pageTitle}
          paddingBottom={14}
          back={{
            onPress: () => router.back(),
            label: tr.back,
            color: c.sub,
            style: { borderColor: c.border, backgroundColor: c.dim },
          }}
          crumbs={[
            { label: tr.tabHealth, onPress: () => router.push('/(tabs)/health') },
            { label: tr.settings, onPress: () => router.push('/health-profile') },
            { label: sourceLabel },
          ]}
          crumbColor={c.sub}
          actions={authorized ? (
            <HeaderButton
              onPress={load}
              accessibilityLabel={tr.syncNow}
              style={{ borderColor: c.border, backgroundColor: '#10B98115' }}>
              {syncing
                ? <ActivityIndicator size="small" color="#10B981" />
                : <IconSymbol name="arrow.clockwise" size={16} color="#10B981" />}
            </HeaderButton>
          ) : undefined}>
          {readFailed ? (
            <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>
              {tr.healthReadFailed}
            </Text>
          ) : lastSync ? (
            <Text style={{ color: c.sub, fontSize: 11 }}>
              {tr.healthUpdatedAt.replace(
                '{time}',
                lastSync.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
              )}
            </Text>
          ) : null}
        </ScreenHeader>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : !SOURCE?.isAvailable || hcMissing ? (
          <NotAvailable c={c} tr={tr} androidMissing={hcMissing} />
        ) : !authorized ? (
          <NotAuthorized c={c} tr={tr} label={sourceLabel} onRequest={async () => {
            if (!SOURCE) return;
            // Перша спроба показує системний діалог дозволів.
            const ok = await SOURCE.requestAccess();
            const access = await SOURCE.getAccess();
            if (ok && access !== 'denied' && access !== 'unavailable') {
              setAuthorized(true);
              void load();
              return;
            }
            // Раніше відмовили — відкриваємо налаштування, щоб увімкнути вручну.
            waitingForReturn.current = true;
            if (IS_IOS) {
              Linking.openURL('x-apple-health://').catch(() => Linking.openSettings());
            } else {
              void openHealthConnectSettings();
            }
          }} />
        ) : (
          // Список тренувань за 30 днів може бути довгим, тож він
          // віртуалізований, а вся решта екрана поїхала в шапку списку.
          <FlatList
            data={workouts}
            keyExtractor={workoutKey}
            renderItem={renderWorkout}
            ItemSeparatorComponent={WorkoutSeparator}
            contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
            <>

            {/* ERR-14: збій читання показуємо явно — інакше нулі нижче
                неможливо відрізнити від справжніх «сьогодні 0 кроків». */}
            {readFailed && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#EF444444', backgroundColor: '#EF444412', padding: 14, marginBottom: 12 }}>
                <IconSymbol name="exclamationmark.triangle.fill" size={16} color="#EF4444" />
                <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700', flex: 1 }}>
                  {tr.hautoReadFailedBody.replace('{source}', sourceLabel)}
                </Text>
              </View>
            )}

            {/* WIP banner */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B44', backgroundColor: '#F59E0B12', padding: 14, marginBottom: 18 }}>
              <IconSymbol name="hammer.fill" size={16} color="#F59E0B" />
              <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700', flex: 1 }}>
                {tr.hautoWip}
              </Text>
            </View>

            {/* Today summary grid */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 4, marginBottom: 12 }]}>{tr.today}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              <MetricCard label={tr.steps} value={today?.steps ? today.steps.toLocaleString(locale) : '—'} unit=""
                icon="figure.walk" color="#0EA5E9" width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label={tr.hautoActiveKcal} value={today?.activeCalories ? `${today.activeCalories}` : '—'} unit={tr.hautoKcal}
                icon="flame.fill" color="#F97316" width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label={tr.hautoDistance} value={today?.distanceKm != null ? `${today.distanceKm}` : '—'} unit={tr.hautoKm}
                icon="map.fill" color="#10B981" width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              {/* Поверхи — лише HealthKit; у Health Connect ми їх не просимо (зайвий дозвіл = відмова в Play). */}
              {IS_IOS && (
                <MetricCard label={tr.hautoFlights} value={today?.flightsClimbed ? `${today.flightsClimbed}` : '—'} unit=""
                  icon="arrow.up.circle" color="#8B5CF6" width={cardWidth}
                  isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              )}
              <MetricCard label={tr.sleep} value={today?.sleepMinutes ? fmtSleep(today.sleepMinutes) : '—'} unit=""
                icon="moon.fill" color="#6366F1" width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              {/* Вага — останній замір і ЙОГО дата: вона не обовʼязково сьогоднішня. */}
              {IS_IOS && (
                <MetricCard label={tr.weight} value={today?.weight != null ? `${today.weight}` : '—'} unit={tr.hautoKg}
                  note={today?.weightAt
                    ? tr.hautoWeightMeasuredAt.replace('{date}', new Date(today.weightAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
                    : undefined}
                  icon="scalemass.fill" color="#EC4899" width={cardWidth}
                  isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              )}
              <MetricCard label={tr.hautoSpo2} value={today?.spo2 != null ? `${today.spo2}` : '—'} unit="%"
                icon="lungs.fill" color="#0EA5E9" width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>

            {/* Heart rate */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>{tr.pulse}</Text>
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
              style={[s.card, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <HRStatBox label={tr.hautoHrAvgShort} value={today?.heartRateAvg} unit={tr.hautoBpm} color="#EF4444" c={c} />
                <HRStatBox label={tr.hautoHrMin} value={today?.heartRateMin} unit={tr.hautoBpm} color="#F97316" c={c} />
                <HRStatBox label={tr.hautoHrMax} value={today?.heartRateMax} unit={tr.hautoBpm} color="#DC2626" c={c} />
                <HRStatBox label={tr.hautoHrRest} value={today?.restingHeartRate} unit={tr.hautoBpm} color="#6366F1" c={c} />
              </View>
              {hrSamples.length > 1 && (
                <>
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600', marginBottom: 4 }}>
                    {tr.hautoLast24h.replace('{n}', String(hrSamples.length))}
                  </Text>
                  <HRSparkline samples={hrSamples} color="#EF4444" />
                </>
              )}
              {/* Фази ночі, що закінчилась сьогодні (якщо джерело їх дало). */}
              {today?.sleep && today.sleep.deep != null && (
                <View style={[s.hkvRow, { borderColor: c.border, backgroundColor: c.dim, marginTop: 8, flexWrap: 'wrap', gap: 8 }]}>
                  <IconSymbol name="moon.fill" size={15} color="#6366F1" />
                  <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{tr.hautoSleepPhases}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, width: '100%' }}>
                    {`${tr.hautoSleepDeep} ${fmtSleep(today.sleep.deep)} · ${tr.hautoSleepRem} ${fmtSleep(today.sleep.rem ?? 0)} · ${tr.hautoSleepLight} ${fmtSleep(today.sleep.light ?? 0)} · ${tr.hautoSleepAwake} ${fmtSleep(today.sleep.awake ?? 0)}`}
                  </Text>
                </View>
              )}
            </BlurView>

            {/* Week charts */}
            {week.length > 0 && (
              <>
                <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>{tr.hautoWeek}</Text>
                <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
                  style={[s.card, { borderColor: c.border }]}>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>{tr.steps}</Text>
                  <MiniBarChart values={week.map(d => d.steps)} color="#0EA5E9" />
                  <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 18 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>{tr.hautoActiveCalories}</Text>
                  <MiniBarChart values={week.map(d => d.activeCalories)} color="#F97316" />
                  <View style={{ flexDirection: 'row', marginTop: 4, marginBottom: 18 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>

                  <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', marginBottom: 10 }}>{tr.hautoPulseAvg}</Text>
                  <MiniBarChart values={week.map(d => d.heartRateAvg)} color="#EF4444" maxVal={200} />
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    {weekLabels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 9, fontWeight: '600' }}>{l}</Text>)}
                  </View>
                </BlurView>
              </>
            )}

            {/* Workouts: заголовок лишається в шапці, картки віддані FlatList */}
            {workouts.length > 0 && (
              <Text style={[s.sectionTitle, { color: c.text, marginTop: 24, marginBottom: 12 }]}>
                {tr.hautoWorkouts30}
              </Text>
            )}

            </>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const MetricCard = React.memo(function MetricCard({ label, value, unit, note, icon, color, width, isDark, border, text, sub }: {
  label: string; value: string; unit: string; icon: IconSymbolName; color: string;
  /** Підпис під числом (напр. дата заміру ваги). */
  note?: string;
  /** Рахує екран — картка не має знати ні про вікно, ні про кількість колонок. */
  width: number;
  isDark: boolean; border: string; text: string; sub: string;
}) {
  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'}
      style={{ width, borderRadius: 16, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name={icon} size={14} color={color} />
        </View>
        <Text style={{ color: sub, fontSize: 11, fontWeight: '600', marginLeft: 8 }}>{label}</Text>
      </View>
      <Text style={{ color: text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }} numberOfLines={1}>
        {value}{unit ? <Text style={{ fontSize: 13, fontWeight: '600', color: sub }}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={{ color: sub, fontSize: 10, marginTop: 3 }} numberOfLines={1}>{note}</Text> : null}
    </BlurView>
  );
});

/** Проміжок 8pt між картками тренувань — той самий, що давав gap у ScrollView. */
function WorkoutSeparator() {
  return <View style={{ height: 8 }} />;
}

const WorkoutCard = React.memo(function WorkoutCard({ wo, isDark, border, text, sub, tr, locale }: {
  wo: HKWorkout; isDark: boolean; border: string; text: string; sub: string; tr: Translations; locale: string;
}) {
  const d = new Date(wo.startDate);
  const dateStr = d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'}
      style={[s.workoutCard, { borderColor: border }]}>
      <View style={[s.workoutIcon, { backgroundColor: '#10B98122' }]}>
        <IconSymbol name="figure.run" size={18} color="#10B981" />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: text, fontSize: 13, fontWeight: '700' }}>
          {workoutName(wo.activityId)}
        </Text>
        <Text style={{ color: sub, fontSize: 11, marginTop: 2 }}>
          {dateStr} · {timeStr} · {wo.sourceName}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: text, fontSize: 13, fontWeight: '700' }}>{fmtDuration(wo.duration)}</Text>
        <Text style={{ color: '#F97316', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
          {Math.round(wo.calories)} {tr.hautoKcal}
        </Text>
        {wo.distance > 0 && (
          <Text style={{ color: '#0EA5E9', fontSize: 11, fontWeight: '600' }}>
            {(wo.distance / 1000).toFixed(1)} {tr.hautoKm}
          </Text>
        )}
      </View>
    </BlurView>
  );
});

function HRStatBox({ label, value, unit, color, c }: { label: string; value: number | null | undefined; unit: string; color: string; c: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.sub, fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>{label}</Text>
      <Text style={{ color, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 }}>{value ?? '—'}</Text>
      {value != null && <Text style={{ color: c.sub, fontSize: 9, marginTop: 2 }}>{unit}</Text>}
    </View>
  );
}

function NotAvailable({ c, tr, androidMissing }: { c: any; tr: Translations; androidMissing: boolean }) {
  const body = Platform.OS === 'android'
    ? tr.hautoNotAvailableAndroid
    : Platform.OS === 'ios' ? tr.hautoNotAvailableIos : tr.hautoNotAvailableOther;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <IconSymbol name="heart.slash.fill" size={52} color={c.sub} />
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '800', marginTop: 16, textAlign: 'center' }}>
        {tr.hautoNotAvailable}
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
        {body}
      </Text>
      {androidMissing && (
        <TouchableOpacity onPress={() => { void openHealthConnectInstall(); }}
          accessibilityRole="button" accessibilityLabel={tr.hautoInstallHc}
          style={{ marginTop: 24, backgroundColor: '#10B981', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 }}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{tr.hautoInstallHc}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function NotAuthorized({ c, tr, label, onRequest }: { c: any; tr: Translations; label: string; onRequest: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 80, height: 80, borderRadius: 22, backgroundColor: '#EF444420', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <IconSymbol name="heart.fill" size={38} color="#EF4444" />
      </View>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
        {tr.hautoConnectTitle.replace('{source}', label)}
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
        {tr.hautoConnectBody}
      </Text>
      <TouchableOpacity onPress={onRequest} accessibilityRole="button" accessibilityLabel={tr.hkGrant}
        style={{ marginTop: 28, backgroundColor: '#EF4444', borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{tr.hkGrant}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  sectionTitle:{ fontSize: 17, fontWeight: '800' },
  card:        { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  syncBtn:     { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hkvRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12 },
  workoutCard: { borderRadius: 14, borderWidth: 1, padding: 14, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  workoutIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
