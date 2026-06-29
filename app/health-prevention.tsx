import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HubTile } from '@/components/health/HubTile';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { loadData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { ACCENT, ACCENT_CAL, ACCENT_PROT, ACCENT_PULSE, HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import {
  CHECKUPS_KEY, Checkup, HABITS_KEY, Habit, MEDS_KEY, Medication, VACCINES_KEY, Vaccine,
  buildHealthReport, habitDoneToday, medDueToday,
} from '@/utils/preventionUtils';

export default function PreventionScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  const h = useHealthEntries();

  const [meds, setMeds] = useState<Medication[]>([]);
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);

  const load = useCallback(async () => {
    const [m, ch, v, hb] = await Promise.all([
      loadData<Medication[]>(MEDS_KEY, []),
      loadData<Checkup[]>(CHECKUPS_KEY, []),
      loadData<Vaccine[]>(VACCINES_KEY, []),
      loadData<Habit[]>(HABITS_KEY, []),
    ]);
    setMeds(m); setCheckups(ch); setVaccines(v); setHabits(hb);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const medsDue = meds.reduce((s, m) => s + medDueToday(m), 0);
  const activeMeds = meds.filter(m => m.active).length;
  const habitsLeft = habits.filter(hb => !habitDoneToday(hb)).length;

  const exportReport = async () => {
    const text = buildHealthReport({
      meds, checkups, vaccines,
      latestWeight: h.latestWeight, bmi: h.bmi, todayPulse: h.today.pulse, locale,
    });
    try { await Share.share({ message: text }); } catch {}
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.prevention}</Text>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <HubTile title={tr.meds} icon="pills.fill" color={HEALTH_ACCENTS.prevention}
              stat={activeMeds ? `${tr.medActive}: ${activeMeds}` : tr.medsSub} badge={medsDue}
              onPress={() => router.push('/health-meds')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            <HubTile title={tr.checkups} icon="cross.case.fill" color={ACCENT_PULSE}
              stat={checkups.length ? `${checkups.length}` : tr.checkupsSub}
              onPress={() => router.push('/health-checkups')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <HubTile title={tr.vaccines} icon="syringe" color={ACCENT_CAL}
              stat={vaccines.length ? `${vaccines.length}` : tr.vaccinesSub}
              onPress={() => router.push('/health-vaccines')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            <HubTile title={tr.habits} icon="checklist" color={ACCENT_PROT}
              stat={habits.length ? `${habitsLeft} ${tr.dueToday}` : tr.habitsSub} badge={habitsLeft}
              onPress={() => router.push('/health-habits')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
          </View>

          {/* Експорт звіту для лікаря */}
          <TouchableOpacity onPress={exportReport} activeOpacity={0.85} style={{ marginTop: 4 }}>
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.report, { borderColor: ACCENT + '40' }]}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="square.and.arrow.up" size={18} color={ACCENT} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{tr.exportReport}</Text>
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{tr.reportSub}</Text>
              </View>
              <IconSymbol name="chevron.right" size={13} color={c.sub} />
            </BlurView>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:  { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  report: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
