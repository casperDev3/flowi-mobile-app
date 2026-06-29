import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { SectionHeader } from '@/components/health/HealthBits';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import {
  ACCENT, ACCENT_MOOD, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ModalKey, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';

export default function SleepScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_sleep');

  const h = useHealthEntries();
  const { today, goals } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  const sleep = today.sleep;
  const sleepColor = sleep ? (sleep >= 420 ? ACCENT_SLEEP : sleep >= 360 ? ACCENT_MOOD : ACCENT_PULSE) : c.sub;
  const sleepLabel = sleep ? (sleep >= 420 ? tr.goodSleep : sleep >= 360 ? tr.littleLess : tr.notEnough) : '';

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.sleepRecovery}</Text>
          <TouchableOpacity onPress={() => setModal('sleep')} style={[s.addBtn, { backgroundColor: ACCENT_SLEEP }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Сон */}
          <SectionHeader title={tr.sleep} icon="moon.fill" color={ACCENT_SLEEP} textColor={c.text} top={8} />
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

          {/* Пульс спокою */}
          <SectionHeader title={tr.restingPulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{today.pulse ?? '—'}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>уд/хв</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>Нижчий пульс спокою — кращий показник відновлення</Text>
          </BlurView>

        </ScrollView>
      </SafeAreaView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:  { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  addBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card:   { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 2 },
  track:  { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 4 },
  badge:  { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  empty:  { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
});
