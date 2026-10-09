import { Atlas } from '@/constants/atlas';
/**
 * components/health/tabs/ActivityTab.tsx — вкладка «Активність і тренування».
 *
 * Кроки, дистанція й активні калорії — дослівно колишній `app/health-activity.tsx`.
 * Додалось зведення тренувань: скільки їх було за тиждень і скільки калорій
 * вони принесли. Самі тренування лишаються ОКРЕМИМ розділом (`/workouts`) —
 * це майбутній модуль із групами й програмами, і вкладка на нього лише
 * посилається, а не тягне його всередину здоровʼя.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HealthAddButton, HealthCard } from '@/components/health/HealthBits';
import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { HealthKitStatus, LoadErrorNotice } from '@/components/health/HealthNotices';
import { MetricTrend } from '@/components/health/MetricTrend';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import { useHealthTabGrid } from '@/components/health/HealthLayout';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { ACCENT, ACCENT_STEPS, ModalKey, getHealthColors } from '@/utils/healthTheme';
import { stepsToKm } from '@/utils/healthUtils';

/** Тренування читаються лише заради дати й калорій — решта полів тут ні до чого. */
interface WorkoutBrief { date: string; calories?: number }

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function ActivityTab({ h }: HealthTabProps) {
  const grid = useHealthTabGrid();
  const tabBarInset = useTabBarInset();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  const { today, goals, heightCm, cal } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  // Зведення тренувань за тиждень. Читається зі сховища напряму: вкладка
  // показує ДВА числа, і тягти заради них увесь модуль тренувань — завести
  // другу копію його стану.
  const [week, setWeek] = useState({ count: 0, calories: 0 });
  const loadWorkouts = useCallback(async () => {
    const all = await loadData<WorkoutBrief[]>('workouts', []);
    const since = Date.now() - WEEK_MS;
    const recent = all.filter(w => {
      const at = new Date(w.date).getTime();
      return Number.isFinite(at) && at >= since;
    });
    setWeek({
      count: recent.length,
      calories: recent.reduce((sum, w) => sum + (Number(w.calories) > 0 ? Number(w.calories) : 0), 0),
    });
  }, []);
  useFocusEffect(useCallback(() => { void loadWorkouts(); }, [loadWorkouts]));

  const onRefresh = async () => { setRefreshing(true); await Promise.all([h.reload(), loadWorkouts()]); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  const items: MasonryEntry[] = [
    {
      key: 'steps',
      node: (
        <HealthCard c={c} title={tr.steps} right={<HealthAddButton onPress={() => setModal('steps')} label={tr.add} />}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={{ color: c.text, fontSize: 30, fontWeight: Atlas.type.headingWeight, letterSpacing: -1 }}>{today.steps.toLocaleString(locale)}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                {/* Справжня дистанція з телефона, коли є; інакше — оцінка з кроків (≈). */}
                {today.distance != null
                  ? `${today.distance.toFixed(1)} ${tr.hautoKm}`
                  : `≈ ${stepsToKm(today.steps, heightCm).toFixed(1)} ${tr.hautoKm}`}{today.steps > 0 ? ` · ${Math.round(Math.min(today.steps / goals.steps, 1) * 100)}% від мети` : ''}
              </Text>
            </View>
            <View style={{ width: 110 }}>
              <MiniBarChart values={h.charts.steps} color={ACCENT_STEPS} goal={goals.steps} height={50} />
              <View style={{ flexDirection: 'row', marginTop: 3 }}>
                {labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
              </View>
            </View>
          </View>
          <View style={[s.track, { backgroundColor: c.track, marginBottom: 8 }]}>
            <LinearGradient colors={[ACCENT_STEPS + 'AA', ACCENT_STEPS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.round(Math.min(today.steps / goals.steps, 1) * 100)}%` as any }]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[1000, 2000, 3000, 5000].map(st => (
              <TouchableOpacity key={st} onPress={() => h.addQuick('steps', st)}
                accessibilityRole="button" accessibilityLabel={`+${st}`}
                style={[s.chip, { borderColor: c.border, backgroundColor: c.dim }]}>
                <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>+{st >= 1000 ? `${st / 1000}т` : st}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </HealthCard>
      ),
    },
    {
      key: 'steps-trend',
      node: (
        <MetricTrend entries={h.entries} type="steps" agg="sum" color={ACCENT_STEPS} goal={goals.steps}
          title={`${tr.steps} · ${tr.dynamics}`}
          format={v => (v >= 1000 ? `${(v / 1000).toFixed(1)}т` : `${Math.round(v)}`)} c={c} tr={tr} />
      ),
    },
    {
      key: 'burned',
      node: (
        <HealthCard c={c} title={tr.burned}>
          {/* cal.burned, а не today.calOut: у спалене входять ще й калорії
              тренувань Flowi за цей день (без подвоєння з Apple Health —
              див. burnedForDay). Рядок нижче показує внесок тренувань, щоб
              число не розходилось із журналом записів мовчки. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.5 }}>{cal.burned}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>кк {tr.burned.toLowerCase()}</Text>
          </View>
          {cal.burned > today.calOut && (
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 3 }}>
              {tr.workoutsLabel}: +{cal.burned - today.calOut} кк
            </Text>
          )}
          {/* ERR-14: перевіряємо ДОСТУП, а не наявність модуля у збірці. */}
          <HealthKitStatus
            lang={lang}
            c={c}
            hk={{ available: h.hk.available, access: h.hk.access, failed: h.hk.failed, label: h.hk.label }}
            onGrant={() => { void h.hk.requestAccess(); }}
            onRetry={() => { void h.hk.sync(); }} />
        </HealthCard>
      ),
    },
    {
      // Тренування — зведення й вхід в окремий розділ.
      key: 'workouts',
      node: (
        <TouchableOpacity onPress={() => router.push('/workouts')} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={tr.workoutsLabel}>
          <HealthCard c={c} title={tr.workoutsLabel}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 38, height: 38, borderRadius: Atlas.radius.medium, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="dumbbell.fill" size={18} color={ACCENT} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: Atlas.type.headingWeight }}>
                  {week.count > 0 ? `${week.count} · ${tr.thisWeek}` : tr.workoutsSub}
                </Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                  {week.calories > 0 ? `${week.calories} кк ${tr.burned.toLowerCase()}` : tr.workoutsSub}
                </Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={c.sub} />
            </View>
          </HealthCard>
        </TouchableOpacity>
      ),
    },
  ];
  /* NAT-24: вхід в Apple Health саме звідси — це єдиний екран, що
     показує ті самі дані HealthKit. Налаштування джерел живуть у
     налаштуваннях розділу, а тут лишається швидкий перехід. */
  if (h.hk.available) {
    items.push({
      key: 'apple-health',
      node: (
        <TouchableOpacity
          onPress={() => router.push('/apple-health')}
          accessibilityRole="button"
          accessibilityLabel={h.hk.label ?? 'Apple Health'}>
          <HealthCard c={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <IconSymbol name="heart.fill" size={16} color={ACCENT} />
            {/* Назва сервісу не перекладається; на Android це Health Connect. */}
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', flex: 1, marginLeft: 10 }}>{h.hk.label ?? 'Apple Health'}</Text>
            <IconSymbol name="chevron.right" size={13} color={c.sub} />
          </HealthCard>
        </TouchableOpacity>
      ),
    });
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[grid.contentStyle, { paddingBottom: tabBarInset + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

        {/* ERR-01: сховище віддало помилку — це НЕ «записів немає». */}
        {h.loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={() => { void h.retryLoad(); }} />}

        <MasonryColumns items={items} columnCount={grid.columnCount} columnGap={12} />
      </ScrollView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
    </>
  );
}

const s = StyleSheet.create({
  track:  { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 4 },
  // Швидкі кнопки — нейтральні, як вторинні кнопки Фінансів: колір розділу лишається на даних.
  chip:   { flex: 1, minHeight: 36, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
