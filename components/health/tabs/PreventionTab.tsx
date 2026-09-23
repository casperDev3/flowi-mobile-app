/**
 * components/health/tabs/PreventionTab.tsx — вкладка «Профілактика».
 *
 * Ліки, огляди, щеплення, ЗВИЧКИ і звіт для лікаря. Звички переїхали сюди з
 * окремої плитки хабу: серія відмічених днів — це та сама профілактика, що й
 * прийнята таблетка, і тримати їх в різних місцях означало питати людину двічі
 * на день у двох екранах.
 *
 * Самі списки лишаються окремими екранами-аркушами (`app/health-meds.tsx` і
 * решта): там ввід і редагування, тут — стан «що лишилось сьогодні».
 */
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { HubTile } from '@/components/health/HubTile';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { Events, track } from '@/utils/analytics';
import { ACCENT, ACCENT_CAL, ACCENT_PROT, ACCENT_PULSE, HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import {
  CHECKUPS_KEY, Checkup, HABITS_KEY, Habit, MEDS_KEY, Medication, VACCINES_KEY, Vaccine,
  buildHealthReport, habitDoneToday, medDueToday,
} from '@/utils/preventionUtils';

export function PreventionTab({ h }: HealthTabProps) {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const { sizeClass } = useResponsive();
  // Дві плитки на телефоні, три на середньому вікні, чотири на широкому:
  // на планшеті дві плитки заввишки 112pt розтягувались би у смуги.
  const tileColumns = sizeClass === 'expanded' ? 4 : sizeClass === 'medium' ? 3 : 2;
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  const [meds, setMeds] = useState<Medication[]>([]);
  const [checkups, setCheckups] = useState<Checkup[]>([]);
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [m, ch, v, hb] = await Promise.all([
      loadData<Medication[]>(MEDS_KEY, []),
      loadData<Checkup[]>(CHECKUPS_KEY, []),
      loadData<Vaccine[]>(VACCINES_KEY, []),
      loadData<Habit[]>(HABITS_KEY, []),
    ]);
    setMeds(m); setCheckups(ch); setVaccines(v); setHabits(hb);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await Promise.all([load(), h.reload()]); setRefreshing(false); };

  const medsDue = meds.reduce((sum, m) => sum + medDueToday(m), 0);
  const activeMeds = meds.filter(m => m.active).length;
  const habitsLeft = habits.filter(hb => !habitDoneToday(hb)).length;

  const exportReport = async () => {
    // I18N-07: підписи звіту беремо зі словника — інакше англомовний
    // користувач надсилав лікарю документ, якого сам не прочитає.
    const text = buildHealthReport({
      meds, checkups, vaccines,
      latestWeight: h.latestWeight, bmi: h.bmi, todayPulse: h.today.pulse, locale,
      labels: {
        title: tr.healthSummary,
        weight: tr.weight,
        bmi: tr.bmi,
        pulse: tr.pulse,
        unitKg: tr.unitKg,
        unitBpm: lang === 'uk' ? 'уд/хв' : 'bpm',
        meds: tr.meds,
        adherence: tr.adherence.toLowerCase(),
        checkups: tr.checkups,
        vaccines: tr.vaccines,
        dose: lang === 'uk' ? 'доза' : 'dose',
        generatedBy: lang === 'uk' ? 'Сформовано у Flowi' : 'Generated in Flowi',
      },
    });
    try { await Share.share({ message: text }); track(Events.ReportExported); } catch {}
  };

  return (
    <ScrollView
      contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingTop: 8, paddingBottom: tabBarInset + 32 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

      {/* Відʼємні поля сітки гасять padding крайніх комірок, тож на телефоні
          зовнішні відступи лишаються такими самими, як були з gap: 12. */}
      <View style={s.tileGrid}>
        <View style={[s.tileCell, { width: `${100 / tileColumns}%` }]}>
          <HubTile title={tr.meds} icon="pills.fill" color={HEALTH_ACCENTS.prevention}
            stat={activeMeds ? `${tr.medActive}: ${activeMeds}` : tr.medsSub} badge={medsDue}
            onPress={() => router.push('/health-meds')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
        </View>
        <View style={[s.tileCell, { width: `${100 / tileColumns}%` }]}>
          <HubTile title={tr.checkups} icon="cross.case.fill" color={ACCENT_PULSE}
            stat={checkups.length ? `${checkups.length}` : tr.checkupsSub}
            onPress={() => router.push('/health-checkups')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
        </View>
        <View style={[s.tileCell, { width: `${100 / tileColumns}%` }]}>
          <HubTile title={tr.vaccines} icon="syringe" color={ACCENT_CAL}
            stat={vaccines.length ? `${vaccines.length}` : tr.vaccinesSub}
            onPress={() => router.push('/health-vaccines')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
        </View>
        <View style={[s.tileCell, { width: `${100 / tileColumns}%` }]}>
          <HubTile title={tr.habits} icon="checklist" color={ACCENT_PROT}
            stat={habits.length ? `${habitsLeft} ${tr.dueToday}` : tr.habitsSub} badge={habitsLeft}
            onPress={() => router.push('/health-habits')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
        </View>
      </View>

      {/* Експорт звіту для лікаря */}
      <TouchableOpacity onPress={exportReport} activeOpacity={0.85} style={{ marginTop: 16 }}
        accessibilityRole="button" accessibilityLabel={tr.exportReport}>
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
    </ScrollView>
  );
}

const s = StyleSheet.create({
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginVertical: -6 },
  tileCell: { padding: 6 },
  report:   { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
