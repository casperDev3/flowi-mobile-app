/**
 * components/health/tabs/SleepTab.tsx — вкладка «Сон».
 *
 * Тривалість ночі, якість сну і динаміка — колишній `app/health-sleep.tsx`.
 *
 * ПУЛЬС СПОКОЮ тепер справжній: з Apple Health / Health Connect приходить
 * окремий тип `pulse_rest` (останній семпл доби), і картка показує саме його.
 * Середній пульс за добу (`pulse`) лишається поруч і підписаний як середній —
 * «55 уранці» і денне середнє більше не плутаються.
 *
 * ЯКІСТЬ СНУ рахується з фаз (глибокий / REM / пробудження, `sleepQuality` у
 * utils/healthUtils.ts; та сама формула у вебі). Якщо джерело фаз не дало,
 * оцінка чесно підписана «за тривалістю». Бейдж тривалості (420/360 хв)
 * лишається окремо — якість його не заміняє.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SectionHeader } from '@/components/health/HealthBits';
import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { LoadErrorNotice } from '@/components/health/HealthNotices';
import { MetricTrend } from '@/components/health/MetricTrend';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import {
  ACCENT, ACCENT_MOOD, ACCENT_PULSE, ACCENT_SLEEP, ModalKey, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';

export function SleepTab({ h }: HealthTabProps) {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const c = getHealthColors(isDark);

  const { today, goals } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  const sleep = today.sleep;
  const sleepColor = sleep ? (sleep >= 420 ? ACCENT_SLEEP : sleep >= 360 ? ACCENT_MOOD : ACCENT_PULSE) : c.sub;
  const sleepLabel = sleep ? (sleep >= 420 ? tr.goodSleep : sleep >= 360 ? tr.littleLess : tr.notEnough) : '';

  const night = today.sleepNight;
  const quality = today.sleepQuality;
  const qualityColor = quality ? (quality.score >= 80 ? ACCENT_SLEEP : quality.score >= 60 ? ACCENT_MOOD : ACCENT_PULSE) : c.sub;
  const phases = night && night.deep != null
    ? [
      { key: 'deep', label: tr.hautoSleepDeep, value: night.deep, color: '#4F46E5' },
      { key: 'rem', label: tr.hautoSleepRem, value: night.rem ?? 0, color: '#8B5CF6' },
      { key: 'light', label: tr.hautoSleepLight, value: night.light ?? 0, color: '#A5B4FC' },
      { key: 'awake', label: tr.hautoSleepAwake, value: night.awake ?? 0, color: ACCENT_MOOD },
    ]
    : null;
  const phaseTotal = phases ? phases.reduce((sum, p) => sum + p.value, 0) : 0;

  // Звідки число пульсу спокою: з джерела телефона або з ручного запису.
  const restNote = h.hk.label
    ? tr.hautoPulseRestNote.replace('{source}', h.hk.label)
    : tr.hautoPulseRestNoteManual;

  return (
    <>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: tabBarInset + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

        {/* ERR-01: сховище віддало помилку — це НЕ «записів немає». */}
        {h.loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={() => { void h.retryLoad(); }} />}

        {/* Сон */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <SectionHeader title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} top={8} />
          </View>
          <TouchableOpacity onPress={() => setModal('sleep')} accessibilityRole="button" accessibilityLabel={tr.add}
            style={[s.addBtn, { backgroundColor: ACCENT_SLEEP }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
          {sleep ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5, flex: 1 }}>{fmtSleep(sleep)}</Text>
                <View style={[s.badge, { backgroundColor: sleepColor + '20', borderColor: sleepColor + '40' }]}>
                  <Text style={{ color: sleepColor, fontSize: 11, fontWeight: '700' }}>{sleepLabel}</Text>
                </View>
              </View>
              <View style={[s.track, { backgroundColor: c.track, marginBottom: 8 }]}>
                <LinearGradient colors={[sleepColor + 'AA', sleepColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={[s.fill, { width: `${Math.round(Math.min(sleep / goals.sleep, 1) * 100)}%` as any }]} />
              </View>
              <MiniBarChart values={h.charts.sleep} color={ACCENT_SLEEP} height={40} />
              <View style={{ flexDirection: 'row', marginTop: 3 }}>
                {labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
              </View>
            </>
          ) : (
            <TouchableOpacity onPress={() => setModal('sleep')} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name="moon.fill" size={18} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordSleep}</Text>
              <IconSymbol name="plus" size={14} color={c.sub} />
            </TouchableOpacity>
          )}
        </BlurView>

        {/* Динаміка сну */}
        <View style={{ marginTop: 14 }}>
          <MetricTrend entries={h.entries} type="sleep" agg="avg" color={ACCENT_SLEEP} goal={goals.sleep}
            format={v => fmtSleep(Math.round(v))} isDark={isDark} c={c} tr={tr} />
        </View>

        {/* Якість сну — з фаз, або «за тривалістю», коли фаз немає. */}
        {quality && (
          <>
            <SectionHeader title={tr.hautoSleepQuality} icon="sparkles" color={ACCENT_SLEEP} textColor={c.text} />
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{quality.score}</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4, flex: 1 }}>/ 100</Text>
                <View style={[s.badge, { backgroundColor: qualityColor + '20', borderColor: qualityColor + '40' }]}>
                  <Text style={{ color: qualityColor, fontSize: 11, fontWeight: '700' }}>
                    {quality.byDurationOnly ? tr.hautoSleepQualityByDuration : tr.hautoSleepQualityByPhases}
                  </Text>
                </View>
              </View>
              {phases && phaseTotal > 0 ? (
                <>
                  <View style={[s.stack, { backgroundColor: c.track }]}
                    accessibilityLabel={`${tr.hautoSleepPhases}: ${phases.map(p => `${p.label} ${fmtSleep(p.value)}`).join(', ')}`}>
                    {phases.map(p => p.value > 0 ? (
                      <View key={p.key} style={{ flex: p.value, backgroundColor: p.color }} />
                    ) : null)}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 10 }}>
                    {phases.map(p => (
                      <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color, marginRight: 5 }} />
                        <Text style={{ color: c.sub, fontSize: 11 }}>{p.label} · {fmtSleep(p.value)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{tr.hautoSleepNoPhases}</Text>
              )}
            </BlurView>
          </>
        )}

        {/* Пульс спокою — справжній (pulse_rest); середній за добу — поруч, підписаний як середній. */}
        <SectionHeader title={tr.hautoPulseRest} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{today.pulseRest ?? '—'}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>{tr.hautoBpm}</Text>
          </View>
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>
            {today.pulseRest == null ? tr.hautoPulseRestEmpty : restNote}
          </Text>
          {today.pulse != null && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 10 }}>
              <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', flex: 1 }}>{tr.hautoPulseAvg}</Text>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{today.pulse}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 4 }}>{tr.hautoBpm}</Text>
            </View>
          )}
        </BlurView>
      </ScrollView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
    </>
  );
}

const s = StyleSheet.create({
  addBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  card:   { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 2 },
  track:  { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 4 },
  badge:  { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  stack:  { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row', marginTop: 10 },
  empty:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
});
