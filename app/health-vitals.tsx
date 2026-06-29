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
  ACCENT, ACCENT_MOOD, ACCENT_PULSE, ACCENT_STEPS, ACCENT_WEIGHT, ModalKey, getHealthColors,
} from '@/utils/healthTheme';

export default function VitalsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_vitals');

  const h = useHealthEntries();
  const { latestWeight, bmi, prevWeight, today } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  const bmiCat = bmi ? h.bmiCategory(bmi) : null;
  const bmiColor = bmiCat === 'normal' ? ACCENT : bmiCat === 'underweight' ? ACCENT_STEPS : bmiCat === 'overweight' ? ACCENT_MOOD : ACCENT_PULSE;
  const bmiLbl = bmiCat === 'underweight' ? tr.bmiUnderweight : bmiCat === 'normal' ? tr.bmiNormal : bmiCat === 'overweight' ? tr.bmiOverweight : tr.bmiObese;

  const pulse = today.pulse;
  const zoneColor = pulse ? (pulse < 60 ? ACCENT_STEPS : pulse <= 100 ? ACCENT : ACCENT_PULSE) : c.sub;
  const zoneLabel = pulse ? (pulse < 60 ? tr.bradycardia : pulse <= 100 ? tr.normal : tr.tachycardia) : '';

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.bodyMetrics}</Text>
          <TouchableOpacity onPress={() => setModal('weight')} style={[s.addBtn, { backgroundColor: ACCENT_WEIGHT }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Вага */}
          <SectionHeader title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} top={8} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {latestWeight ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{latestWeight} кг</Text>
                  {bmi && (
                    <View style={[s.badge, { marginLeft: 10, backgroundColor: bmiColor + '20', borderColor: bmiColor + '40' }]}>
                      <Text style={{ color: bmiColor, fontSize: 10, fontWeight: '700' }}>{tr.bmi} {bmi.toFixed(1)} · {bmiLbl}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity onPress={() => setModal('weight')} style={[s.iconBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <IconSymbol name="plus" size={14} color={c.sub} />
                  </TouchableOpacity>
                </View>
                {prevWeight && latestWeight !== prevWeight && (() => {
                  const delta = latestWeight - prevWeight; const up = delta > 0;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <IconSymbol name={up ? 'arrow.up.right' : 'arrow.down.right'} size={11} color={up ? ACCENT_PULSE : ACCENT} />
                      <Text style={{ color: up ? ACCENT_PULSE : ACCENT, fontSize: 11, fontWeight: '700', marginLeft: 2 }}>
                        {up ? '+' : ''}{delta.toFixed(1)} кг/тиж
                      </Text>
                    </View>
                  );
                })()}
                <MiniBarChart values={h.charts.weight} color={ACCENT_WEIGHT} height={40} />
                <View style={{ flexDirection: 'row', marginTop: 3 }}>
                  {labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => setModal('weight')} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="scalemass.fill" size={16} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 8, flex: 1 }}>{tr.recordWeight}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

          {/* Пульс */}
          <SectionHeader title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            {pulse ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{pulse}</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>уд/хв</Text>
                  <View style={{ flex: 1 }} />
                  <View style={[s.badge, { backgroundColor: zoneColor + '20', borderColor: zoneColor + '40' }]}>
                    <Text style={{ color: zoneColor, fontSize: 11, fontWeight: '700' }}>{zoneLabel}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setModal('pulse')} style={[s.iconBtn, { borderColor: c.border, backgroundColor: c.dim, marginLeft: 8 }]}>
                    <IconSymbol name="plus" size={14} color={c.sub} />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {[
                    { range: '< 60',   color: ACCENT_STEPS, active: pulse < 60,                 flex: 1 },
                    { range: '60–100', color: ACCENT,        active: pulse >= 60 && pulse <= 100, flex: 1.4 },
                    { range: '> 100',  color: ACCENT_PULSE,  active: pulse > 100,               flex: 1 },
                  ].map((z, i) => (
                    <View key={i} style={{ flex: z.flex, alignItems: 'center' }}>
                      <View style={{ height: 5, width: '100%', borderRadius: 3, backgroundColor: z.active ? z.color : z.color + '28' }} />
                      <Text style={{ color: z.active ? z.color : c.sub, fontSize: 9, fontWeight: z.active ? '700' : '500', marginTop: 4 }}>{z.range}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={() => setModal('pulse')} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="waveform.path.ecg" size={18} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordPulse}</Text>
                <IconSymbol name="plus" size={14} color={c.sub} />
              </TouchableOpacity>
            )}
          </BlurView>

        </ScrollView>
      </SafeAreaView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
    </View>
  );
}

const s = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:   { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  addBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card:    { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 2 },
  badge:   { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  empty:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
});
