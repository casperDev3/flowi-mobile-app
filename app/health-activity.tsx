import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { SectionHeader } from '@/components/health/HealthBits';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { ACCENT, ACCENT_CAL, ACCENT_STEPS, ModalKey, getHealthColors } from '@/utils/healthTheme';
import { stepsToKm } from '@/utils/healthUtils';

export default function ActivityScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('health_activity');

  const h = useHealthEntries();
  const { today, goals, heightCm } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.activity}</Text>
          <TouchableOpacity onPress={() => setModal('steps')} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: ACCENT_STEPS }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Кроки */}
          <SectionHeader title={tr.steps} icon="figure.walk" color={ACCENT_STEPS} textColor={c.text} top={8} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 }}>{today.steps.toLocaleString(locale)}</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                  ≈ {stepsToKm(today.steps, heightCm).toFixed(1)} км{today.steps > 0 ? ` · ${Math.round(Math.min(today.steps / goals.steps, 1) * 100)}% від мети` : ''}
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
                  style={[s.chip, { borderColor: ACCENT_STEPS + '50', backgroundColor: ACCENT_STEPS + '12' }]}>
                  <Text style={{ color: ACCENT_STEPS, fontSize: 11, fontWeight: '700' }}>+{st >= 1000 ? `${st / 1000}т` : st}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Активні калорії */}
          <SectionHeader title={tr.burned} icon="flame" color={ACCENT_CAL} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{today.calOut}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>кк {tr.burned.toLowerCase()}</Text>
            </View>
            <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>
              {h.hk.available ? 'Синхронізується з HealthKit' : 'Додавайте активність вручну або через тренування'}
            </Text>
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
  chip:   { flex: 1, borderRadius: 11, borderWidth: 1.5, paddingVertical: 7, alignItems: 'center' },
});
