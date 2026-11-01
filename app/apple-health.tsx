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
import { HealthColumns, useHealthTabLayout } from '@/components/health/HealthLayout';
import { Layout } from '@/constants/tokens';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { HEALTH_ACCENTS, fmtSleep } from '@/utils/healthTheme';
import { getHealthDSColors } from '@/components/health/palette';
import { fontFamily, shadow } from '@/constants/theme';
import { dsTokens, useDS } from '@/hooks/use-ds';
import { BentoCard, HatchedBars, MeshBackground } from '@/components/ds';


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
const GRID_GAP = 12;

function HRSparkline({ samples, color }: { samples: HKHeartRateSample[]; color: string }) {
  // Ширина — виміряна ширина картки, а не вікна: на планшеті картка вужча
  // за вікно (сайдбар, стеля колонки, дві колонки), і лінія вилазила б за неї.
  const [W_CHART, setW] = useState(0);
  if (!samples.length) return null;
  const H = 56;
  const values = samples.map(s => s.value);
  const min = Math.min(...values), max = Math.max(...values, min + 1);
  const pts = samples.map((s, i) => ({
    x: (i / (samples.length - 1 || 1)) * W_CHART,
    y: H - ((s.value - min) / (max - min)) * H,
  }));

  return (
    <View style={{ height: H, alignSelf: 'stretch', marginVertical: 8 }}
      onLayout={e => { const w = Math.round(e.nativeEvent.layout.width); setW(prev => (prev === w ? prev : w)); }}>
      {W_CHART > 0 && pts.slice(1).map((pt, i) => {
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
  // Планшет (рішення 6): широка колонка, плитки «сьогодні» рядом по 3–4,
  // пульс і тиждень — двома колонками поруч.
  const lay = useHealthTabLayout();
  const screenWidth = useScreenWidth();
  const { sizeClass } = useResponsive();
  // Дві колонки на телефоні, три на середньому вікні, чотири на широкому.
  const metricColumns = sizeClass === 'expanded' ? 4 : sizeClass === 'medium' ? 3 : 2;
  // Ширина картки рахується від колонки контенту (вона обмежена 720pt), а не
  // від вікна: інакше на планшеті дві картки по пів екрана вилазили б за неї.
  const cardWidth = useMemo(() => {
    const cap = lay.twoCol ? Layout.wideMaxWidth : Layout.readingMaxWidth;
    const column = Math.min(screenWidth, cap) - 2 * Layout.gutter[sizeClass];
    return Math.floor((column - GRID_GAP * (metricColumns - 1)) / metricColumns);
  }, [screenWidth, metricColumns, lay.twoCol, sizeClass]);
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
  const c = useMemo(() => getHealthDSColors(isDark), [isDark]);
  const k = dsTokens(isDark);

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
      <MeshBackground />
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
            style: { backgroundColor: c.dim },
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
              style={{ backgroundColor: c.dim }}>
              {syncing
                ? <ActivityIndicator size="small" color={c.text} />
                : <IconSymbol name="arrow.clockwise" size={18} color={c.text} />}
            </HeaderButton>
          ) : undefined}>
          {readFailed ? (
            <Text style={{ color: k.status.danger, fontSize: 12, fontFamily: fontFamily.semibold }}>
              {tr.healthReadFailed}
            </Text>
          ) : lastSync ? (
            <Text style={{ color: c.sub, fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {tr.healthUpdatedAt.replace(
                '{time}',
                lastSync.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
              )}
            </Text>
          ) : null}
        </ScreenHeader>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color={c.sub} />
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
            contentContainerStyle={[lay.contentStyle, { paddingBottom: 40 }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
            <>

            {/* ERR-14: збій читання показуємо явно — інакше нулі нижче
                неможливо відрізнити від справжніх «сьогодні 0 кроків». */}
            {readFailed && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: k.status.danger + '14', padding: 20, marginBottom: 12 }}>
                <IconSymbol name="exclamationmark.triangle.fill" size={16} color={k.status.danger} />
                <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>
                  {tr.hautoReadFailedBody.replace('{source}', sourceLabel)}
                </Text>
              </View>
            )}

            {/* WIP banner */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 20, backgroundColor: k.status.warning + '1F', padding: 20, marginBottom: 18 }}>
              <IconSymbol name="hammer.fill" size={16} color={c.text} />
              <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>
                {tr.hautoWip}
              </Text>
            </View>

            {/* Today summary grid */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 4, marginBottom: 12 }]}>{tr.today}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              <MetricCard label={tr.steps} value={today?.steps ? today.steps.toLocaleString(locale) : '—'} unit=""
                icon="figure.walk" color={HEALTH_ACCENTS.steps} width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label={tr.hautoActiveKcal} value={today?.activeCalories ? `${today.activeCalories}` : '—'} unit={tr.hautoKcal}
                icon="flame.fill" color={HEALTH_ACCENTS.cal} width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <MetricCard label={tr.hautoDistance} value={today?.distanceKm != null ? `${today.distanceKm}` : '—'} unit={tr.hautoKm}
                icon="map.fill" color={HEALTH_ACCENTS.water} width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              {/* Поверхи — лише HealthKit; у Health Connect ми їх не просимо (зайвий дозвіл = відмова в Play). */}
              {IS_IOS && (
                <MetricCard label={tr.hautoFlights} value={today?.flightsClimbed ? `${today.flightsClimbed}` : '—'} unit=""
                  icon="arrow.up.circle" color={HEALTH_ACCENTS.weight} width={cardWidth}
                  isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              )}
              <MetricCard label={tr.sleep} value={today?.sleepMinutes ? fmtSleep(today.sleepMinutes) : '—'} unit=""
                icon="moon.fill" color={HEALTH_ACCENTS.sleep} width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              {/* Вага — останній замір і ЙОГО дата: вона не обовʼязково сьогоднішня. */}
              {IS_IOS && (
                <MetricCard label={tr.weight} value={today?.weight != null ? `${today.weight}` : '—'} unit={tr.hautoKg}
                  note={today?.weightAt
                    ? tr.hautoWeightMeasuredAt.replace('{date}', new Date(today.weightAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
                    : undefined}
                  icon="scalemass.fill" color={HEALTH_ACCENTS.prot} width={cardWidth}
                  isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              )}
              <MetricCard label={tr.hautoSpo2} value={today?.spo2 != null ? `${today.spo2}` : '—'} unit="%"
                icon="lungs.fill" color={HEALTH_ACCENTS.steps} width={cardWidth}
                isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>

            <HealthColumns twoCol={lay.twoCol && week.length > 0} left={<>
            {/* Heart rate */}
            {/* Omni (DS v2.2): суцільна BentoCard із шапкою «icon-chip + назва». */}
            <BentoCard compact title={tr.pulse} icon="waveform.path.ecg" accent="coral" style={{ marginTop: 24 }}>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <HRStatBox label={tr.hautoHrAvgShort} value={today?.heartRateAvg} unit={tr.hautoBpm} color={HEALTH_ACCENTS.pulse} c={c} />
                <HRStatBox label={tr.hautoHrMin} value={today?.heartRateMin} unit={tr.hautoBpm} color={HEALTH_ACCENTS.cal} c={c} />
                <HRStatBox label={tr.hautoHrMax} value={today?.heartRateMax} unit={tr.hautoBpm} color={HEALTH_ACCENTS.pulse} c={c} />
                <HRStatBox label={tr.hautoHrRest} value={today?.restingHeartRate} unit={tr.hautoBpm} color={HEALTH_ACCENTS.sleep} c={c} />
              </View>
              {hrSamples.length > 1 && (
                <>
                  <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'], marginBottom: 4 }}>
                    {tr.hautoLast24h.replace('{n}', String(hrSamples.length))}
                  </Text>
                  <HRSparkline samples={hrSamples} color={HEALTH_ACCENTS.pulse} />
                </>
              )}
              {/* Фази ночі, що закінчилась сьогодні (якщо джерело їх дало). */}
              {today?.sleep && today.sleep.deep != null && (
                <View style={[s.hkvRow, { backgroundColor: k.surface.subtle, marginTop: 8, flexWrap: 'wrap', gap: 8 }]}>
                  <IconSymbol name="moon.fill" size={16} color={HEALTH_ACCENTS.sleep} />
                  <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, flex: 1 }}>{tr.hautoSleepPhases}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, width: '100%' }}>
                    {`${tr.hautoSleepDeep} ${fmtSleep(today.sleep.deep)} · ${tr.hautoSleepRem} ${fmtSleep(today.sleep.rem ?? 0)} · ${tr.hautoSleepLight} ${fmtSleep(today.sleep.light ?? 0)} · ${tr.hautoSleepAwake} ${fmtSleep(today.sleep.awake ?? 0)}`}
                  </Text>
                </View>
              )}
            </BentoCard>
            </>} right={<>
            {/* Week charts */}
            {week.length > 0 && (
              <>
                {/* Omni: тиждень — штриховані стовпці, сьогодні — фірмовий градієнт
                    із pill-підказкою значення (замість лаймового стовпця). */}
                <BentoCard compact title={tr.hautoWeek} icon="chart.bar.fill" accent="coral" style={{ marginTop: 24 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, marginBottom: 6 }}>{tr.steps}</Text>
                  <HatchedBars
                    data={week.map((d, i) => ({ label: weekLabels[i] ?? '', value: d.steps ?? 0 }))}
                    activeIndex={week.length - 1}
                    height={56}
                    accessibilityLabel={`${tr.hautoWeek}: ${tr.steps}`}
                    style={{ marginBottom: 14 }}
                  />
                  <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, marginBottom: 6 }}>{tr.hautoActiveCalories}</Text>
                  <HatchedBars
                    data={week.map((d, i) => ({ label: weekLabels[i] ?? '', value: d.activeCalories ?? 0 }))}
                    activeIndex={week.length - 1}
                    height={56}
                    accessibilityLabel={`${tr.hautoWeek}: ${tr.hautoActiveCalories}`}
                    style={{ marginBottom: 14 }}
                  />
                  <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.semibold, marginBottom: 6 }}>{tr.hautoPulseAvg}</Text>
                  <HatchedBars
                    data={week.map((d, i) => ({ label: weekLabels[i] ?? '', value: d.heartRateAvg ?? 0 }))}
                    activeIndex={week.length - 1}
                    height={56}
                    accessibilityLabel={`${tr.hautoWeek}: ${tr.hautoPulseAvg}`}
                  />
                </BentoCard>
              </>
            )}
            </>} />

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
  // Omni (DS v2.2): суцільна картка вмісту (не скло).
  return (
    <View
      style={{ backgroundColor: dsTokens(isDark).surface.card, width, borderRadius: 16, padding: 20, ...shadow[isDark ? 'dark' : 'light'].card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name={icon} size={14} color={color} />
        </View>
        <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.medium, marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      </View>
      {/* KPI — великі тонкі табличні цифри; одиниця дрібніша й світліша. */}
      <Text style={{ color: text, fontSize: 32, lineHeight: 36, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.64 }} numberOfLines={1}>
        {value}{unit ? <Text style={{ fontSize: 15, fontFamily: fontFamily.regular, color: sub, letterSpacing: 0 }}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={{ color: sub, fontSize: 11, marginTop: 4 }} numberOfLines={1}>{note}</Text> : null}
    </View>
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
    <View
      style={[s.workoutCard, { backgroundColor: dsTokens(isDark).surface.card }, shadow[isDark ? 'dark' : 'light'].card]}>
      <View style={[s.workoutIcon, { backgroundColor: HEALTH_ACCENTS.water + '22' }]}>
        <IconSymbol name="figure.run" size={18} color={HEALTH_ACCENTS.water} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: text, fontSize: 14, fontFamily: fontFamily.semibold }}>
          {workoutName(wo.activityId)}
        </Text>
        <Text style={{ color: sub, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] }}>
          {dateStr} · {timeStr} · {wo.sourceName}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ color: text, fontSize: 16, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] }}>{fmtDuration(wo.duration)}</Text>
        <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'], marginTop: 2 }}>
          {Math.round(wo.calories)} {tr.hautoKcal}
        </Text>
        {wo.distance > 0 && (
          <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.regular, fontVariant: ['tabular-nums'] }}>
            {(wo.distance / 1000).toFixed(1)} {tr.hautoKm}
          </Text>
        )}
      </View>
    </View>
  );
});

function HRStatBox({ label, value, unit, color, c }: { label: string; value: number | null | undefined; unit: string; color: string; c: any }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.medium, marginBottom: 4 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 26, lineHeight: 30, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.52 }}>{value ?? '—'}</Text>
      {/* Колір показника — тонкою позначкою під числом. */}
      <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: color, marginTop: 4 }} />
      {value != null && <Text style={{ color: c.sub, fontSize: 11, marginTop: 4 }}>{unit}</Text>}
    </View>
  );
}

function NotAvailable({ c, tr, androidMissing }: { c: any; tr: Translations; androidMissing: boolean }) {
  const { t: k } = useDS();
  const body = Platform.OS === 'android'
    ? tr.hautoNotAvailableAndroid
    : Platform.OS === 'ios' ? tr.hautoNotAvailableIos : tr.hautoNotAvailableOther;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <IconSymbol name="heart.slash.fill" size={52} color={c.sub} />
      <Text style={{ color: c.text, fontSize: 18, fontFamily: fontFamily.semibold, marginTop: 16, textAlign: 'center' }}>
        {tr.hautoNotAvailable}
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
        {body}
      </Text>
      {androidMissing && (
        <TouchableOpacity onPress={() => { void openHealthConnectInstall(); }}
          accessibilityRole="button" accessibilityLabel={tr.hautoInstallHc}
          style={{ marginTop: 24, backgroundColor: k.action.primary, borderRadius: 999, minHeight: 48, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 14 }}>
          <Text style={{ color: k.text.onAction, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.hautoInstallHc}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function NotAuthorized({ c, tr, label, onRequest }: { c: any; tr: Translations; label: string; onRequest: () => void }) {
  const { t: k } = useDS();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: HEALTH_ACCENTS.pulse + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <IconSymbol name="heart.fill" size={38} color={HEALTH_ACCENTS.pulse} />
      </View>
      <Text style={{ color: c.text, fontSize: 20, fontFamily: fontFamily.semibold, textAlign: 'center' }}>
        {tr.hautoConnectTitle.replace('{source}', label)}
      </Text>
      <Text style={{ color: c.sub, fontSize: 14, marginTop: 10, textAlign: 'center', lineHeight: 22 }}>
        {tr.hautoConnectBody}
      </Text>
      <TouchableOpacity onPress={onRequest} accessibilityRole="button" accessibilityLabel={tr.hkGrant}
        style={{ marginTop: 28, backgroundColor: k.action.primary, borderRadius: 999, minHeight: 48, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 14 }}>
        <Text style={{ color: k.text.onAction, fontSize: 15, fontFamily: fontFamily.semibold }}>{tr.hkGrant}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  pageTitle:   { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  sectionTitle:{ fontSize: 16, fontFamily: fontFamily.semibold },
  card:        { borderRadius: 20, padding: 20 },
  syncBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  hkvRow:      { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16 },
  workoutCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  workoutIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
