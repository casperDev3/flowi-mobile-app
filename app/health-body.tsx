import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BodyEntrySheet, BodyRecord } from '@/components/health/BodyEntrySheet';
import { MetricTrend } from '@/components/health/MetricTrend';
import { SectionHeader } from '@/components/health/HealthBits';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { ACCENT, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_WEIGHT, getHealthColors } from '@/utils/healthTheme';
import {
  DEFAULT_PROFILE, EntryType, MEASUREMENT_TYPES, MeasurementType,
  estimateBodyFatNavy, latestValue, leanMass, waistToHeightRatio, waistToHipRatio, whrHealthy, whtrCategory,
} from '@/utils/healthUtils';

const labelKey: Record<MeasurementType, string> = {
  waist: 'mWaist', hips: 'mHips', chest: 'mChest', thigh: 'mThigh',
  biceps: 'mBiceps', neck: 'mNeck', calf: 'mCalf', bodyfat: 'mBodyfat',
};

export default function BodyScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_body');

  const h = useHealthEntries();
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(false);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };

  const sex = h.profile?.sex ?? DEFAULT_PROFILE.sex;
  const height = h.profile?.heightCm ?? DEFAULT_PROFILE.heightCm;
  const lv = (t: EntryType) => latestValue(h.entries, t);

  const weight = h.latestWeight;
  const waist = lv('waist'); const hips = lv('hips'); const neck = lv('neck');
  const whtr = waistToHeightRatio(waist, height);
  const whtrCat = whtr ? whtrCategory(whtr) : null;
  const whtrColor = whtrCat === 'healthy' ? ACCENT : whtrCat === 'increased' ? ACCENT_MOOD : ACCENT_PULSE;
  const whtrLbl = whtrCat === 'healthy' ? tr.whtrHealthy : whtrCat === 'increased' ? tr.whtrIncreased : tr.whtrHigh;
  const whr = waistToHipRatio(waist, hips);
  const bodyfatManual = lv('bodyfat');
  const bodyfatEst = estimateBodyFatNavy(sex, height, neck, waist, sex === 'female' ? hips : null);
  const bodyfat = bodyfatManual ?? bodyfatEst;
  const lean = weight && bodyfat ? leanMass(weight, bodyfat) : null;

  const defaults: Partial<Record<EntryType, number | null>> = { weight };
  MEASUREMENT_TYPES.forEach(t => { defaults[t] = lv(t); });

  const onSubmit = (records: BodyRecord[]) => records.forEach(r => h.addEntry({ type: r.type, value: r.value }));

  const series = (t: EntryType) => h.entries.filter(e => e.type === t).slice(0, 8).reverse().map(e => e.value);
  const unitOf = (t: MeasurementType) => (t === 'bodyfat' ? '%' : 'см');

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.bodyMeasurements}</Text>
          <TouchableOpacity onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={tr.addBodyEntry} style={[s.addBtn, { backgroundColor: ACCENT_WEIGHT }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT_WEIGHT} />}>

          {/* Зведення */}
          <SectionHeader title={tr.summary} icon="ruler.fill" color={ACCENT_WEIGHT} textColor={c.text} top={8} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Stat label={tr.weight} value={weight ? `${weight} кг` : '—'} color={ACCENT_WEIGHT} sub={c.sub} text={c.text} />
              <Stat label={tr.bmi} value={h.bmi ? h.bmi.toFixed(1) : '—'} color={ACCENT_PROT} sub={c.sub} text={c.text} />
              <Stat label={bodyfatManual ? tr.mBodyfat : tr.bodyfatEst} value={bodyfat != null ? `${bodyfat.toFixed(1)}%` : '—'} color={ACCENT_MOOD} sub={c.sub} text={c.text} />
              <Stat label={tr.leanMass} value={lean ? `${lean.toFixed(1)} кг` : '—'} color={ACCENT} sub={c.sub} text={c.text} />
              <Stat label={tr.whtr} value={whtr ? whtr.toFixed(2) : '—'} color={whtr ? whtrColor : c.sub} sub={c.sub} text={c.text}
                badge={whtr ? whtrLbl : undefined} />
              <Stat label={tr.whr} value={whr ? whr.toFixed(2) : '—'} color={whr ? (whrHealthy(whr, sex) ? ACCENT : ACCENT_PULSE) : c.sub} sub={c.sub} text={c.text} />
            </View>
          </BlurView>

          {/* Динаміка ваги */}
          <View style={{ marginTop: 14 }}>
            <MetricTrend entries={h.entries} type="weight" agg="avg" color={ACCENT_WEIGHT}
              format={v => `${v.toFixed(1)} кг`} isDark={isDark} c={c} tr={tr} />
          </View>

          {/* Виміри */}
          <SectionHeader title={tr.bodyMeasurements} icon="figure.arms.open" color={ACCENT_WEIGHT} textColor={c.text} />
          {MEASUREMENT_TYPES.every(t => lv(t) == null) && weight == null ? (
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
              <TouchableOpacity onPress={() => setSheet(true)} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="ruler.fill" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.noMeasurements}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            </BlurView>
          ) : (
            <View style={{ gap: 8 }}>
              {MEASUREMENT_TYPES.filter(t => lv(t) != null).map(t => {
                const ser = series(t);
                const delta = ser.length >= 2 ? ser[ser.length - 1] - ser[0] : null;
                return (
                  <BlurView key={t} intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[s.row, { borderColor: c.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{tr[labelKey[t]]}</Text>
                      <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginTop: 1 }}>
                        {lv(t)}<Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}> {unitOf(t)}</Text>
                      </Text>
                      {delta != null && delta !== 0 && (
                        <Text style={{ color: delta < 0 ? ACCENT : ACCENT_MOOD, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unitOf(t)}
                        </Text>
                      )}
                    </View>
                    {ser.length >= 2 && <View style={{ width: 90 }}><MiniBarChart values={ser} color={ACCENT_WEIGHT} height={40} /></View>}
                  </BlurView>
                );
              })}
            </View>
          )}

          {/* Нагадування */}
          <SectionHeader title={tr.reminders} icon="bell.fill" color={ACCENT_MOOD} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, paddingVertical: 4 }]}>
            <View style={s.remRow}>
              <IconSymbol name="scalemass.fill" size={16} color={ACCENT_WEIGHT} />
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 }}>{tr.weightReminder}</Text>
              <Switch value={h.reminders.weight} disabled={!h.remindersLoaded}
                onValueChange={v => h.setReminder('weight', v, tr.weight, tr.weightReminderBody)} trackColor={{ true: ACCENT_WEIGHT }} />
            </View>
            <View style={[s.remRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <IconSymbol name="ruler.fill" size={16} color={ACCENT_WEIGHT} />
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 }}>{tr.measurementsReminder}</Text>
              <Switch value={h.reminders.measurements} disabled={!h.remindersLoaded}
                onValueChange={v => h.setReminder('measurements', v, tr.bodyMeasurements, tr.measurementsReminderBody)} trackColor={{ true: ACCENT_WEIGHT }} />
            </View>
          </BlurView>

        </ScrollView>
      </SafeAreaView>

      <BodyEntrySheet visible={sheet} onClose={() => setSheet(false)} onSubmit={onSubmit} defaults={defaults} isDark={isDark} tr={tr} />
    </View>
  );
}

function Stat({ label, value, color, sub, text, badge }: {
  label: string; value: string; color: string; sub: string; text: string; badge?: string;
}) {
  return (
    <View style={{ width: '33.3%', paddingVertical: 6 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>{label}</Text>
      {badge && <Text style={{ color, fontSize: 9, fontWeight: '700', marginTop: 1 }}>{badge}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  addBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card:    { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 2 },
  row:     { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  empty:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
  remRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
});
