import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { CalStat, SectionHeader } from '@/components/health/HealthBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_PROT, ACCENT_PULSE, ACCENT_STEPS, ModalKey, getHealthColors,
} from '@/utils/healthTheme';

export default function NutritionScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_nutrition');

  const h = useHealthEntries();
  const { today, goals, cal } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };

  const foodToday = h.entries.filter(e => e.type === 'calories' && isSameDay(new Date(e.date), new Date()));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.nutrition}</Text>
          <TouchableOpacity onPress={() => setModal('calories')} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: ACCENT_CAL }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Калорії */}
          <SectionHeader title={tr.calories} icon="flame.fill" color={ACCENT_CAL} textColor={c.text} top={8} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{cal.net}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>/ {goals.calories} кк</Text>
              <View style={{ flex: 1 }} />
              <View style={[s.badge, { backgroundColor: (cal.over ? ACCENT_PULSE : ACCENT_CAL) + '20', borderColor: (cal.over ? ACCENT_PULSE : ACCENT_CAL) + '40' }]}>
                <Text style={{ color: cal.over ? ACCENT_PULSE : ACCENT_CAL, fontSize: 11, fontWeight: '700' }}>
                  {cal.over ? tr.overLimit : `${Math.round(Math.max(0, Math.min(cal.pct, 1)) * 100)}%`}
                </Text>
              </View>
            </View>
            <View style={[s.track, { backgroundColor: c.track, marginBottom: 8 }]}>
              <LinearGradient colors={cal.over ? [ACCENT_PULSE + 'AA', ACCENT_PULSE] : [ACCENT_CAL + 'AA', ACCENT_CAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.fill, { width: `${Math.round(Math.max(0, Math.min(cal.pct, 1)) * 100)}%` as any }]} />
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 10 }}>
              <CalStat label={tr.consumed} value={`${today.calIn}`} color={ACCENT_CAL} sub={c.sub} />
              <CalStat label={tr.burned} value={`${today.calOut}`} color={ACCENT_STEPS} sub={c.sub} />
              <CalStat label={cal.over ? tr.surplus : tr.deficit} value={`${cal.over ? '+' : ''}${Math.abs(cal.remaining)}`} color={cal.over ? ACCENT_PULSE : ACCENT} sub={c.sub} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[200, 350, 500, 700].map(kk => (
                <TouchableOpacity key={kk} onPress={() => h.addQuick('calories', kk)}
                  style={[s.chip, { borderColor: ACCENT_CAL + '50', backgroundColor: ACCENT_CAL + '12' }]}>
                  <Text style={{ color: ACCENT_CAL, fontSize: 11, fontWeight: '700' }}>+{kk} кк</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Білок */}
          <SectionHeader title={tr.protein} icon="bolt.fill" color={ACCENT_PROT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{Math.round(today.protein)}</Text>
              <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>/ {goals.protein} г</Text>
              <View style={{ flex: 1 }} />
              <View style={[s.badge, { backgroundColor: ACCENT_PROT + '20', borderColor: ACCENT_PROT + '40' }]}>
                <Text style={{ color: ACCENT_PROT, fontSize: 11, fontWeight: '700' }}>{Math.round(Math.min(today.protein / goals.protein, 1) * 100)}%</Text>
              </View>
            </View>
            <View style={[s.track, { backgroundColor: c.track, marginBottom: 6 }]}>
              <LinearGradient colors={[ACCENT_PROT + 'AA', ACCENT_PROT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={[s.fill, { width: `${Math.round(Math.min(today.protein / goals.protein, 1) * 100)}%` as any }]} />
            </View>
            <Text style={{ color: c.sub, fontSize: 11 }}>
              {today.protein < goals.protein ? `Залишилось ${Math.round(goals.protein - today.protein)} г білка` : 'Норму білка досягнуто 💪'}
            </Text>
          </BlurView>

          {/* Вода */}
          <SectionHeader title={tr.water} icon="drop.fill" color={ACCENT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
              <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 }}>
                {today.water >= 1000 ? `${(today.water / 1000).toFixed(1)} л` : `${today.water} мл`}
              </Text>
              <Text style={{ color: c.sub, fontSize: 11, marginLeft: 5 }}>/ {goals.water} мл</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>
                {today.water >= goals.water ? tr.target : `${Math.round(today.water / goals.water * 100)}%`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
              {Array.from({ length: 8 }, (_, i) => {
                const threshold = ((i + 1) / 8) * goals.water;
                return <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: today.water >= threshold ? ACCENT : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)') }} />;
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[150, 250, 350, 500].map(ml => (
                <TouchableOpacity key={ml} onPress={() => h.addQuick('water', ml)}
                  style={[s.chip, { borderColor: ACCENT + '50', backgroundColor: ACCENT + '12' }]}>
                  <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>+{ml} мл</Text>
                </TouchableOpacity>
              ))}
            </View>
          </BlurView>

          {/* Нагадування про воду */}
          <SectionHeader title={tr.reminders} icon="bell.fill" color={ACCENT} textColor={c.text} />
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, paddingVertical: 6 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
              <IconSymbol name="drop.fill" size={16} color={ACCENT} />
              <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 }}>{tr.waterReminder}</Text>
              <Switch value={h.reminders.water} disabled={!h.remindersLoaded}
                onValueChange={v => h.setReminder('water', v, tr.water, tr.waterReminder)} trackColor={{ true: ACCENT }} />
            </View>
          </BlurView>

          {/* Журнал їжі */}
          {foodToday.length > 0 && (
            <>
              <SectionHeader title={tr.todayLabel} icon="list.bullet" color={ACCENT_CAL} textColor={c.text} />
              <View style={{ gap: 8 }}>
                {foodToday.map(e => (
                  <BlurView key={e.id} intensity={isDark ? 18 : 38} tint={isDark ? 'dark' : 'light'}
                    style={[s.logRow, { borderColor: c.border }]}>
                    <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: ACCENT_CAL + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <IconSymbol name="flame.fill" size={15} color={ACCENT_CAL} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                        {e.value} кк{e.protein ? ` · ${e.protein}${tr.proteinShort}` : ''}
                      </Text>
                      {e.note ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{e.note}</Text> : null}
                    </View>
                    <Text style={{ color: c.sub, fontSize: 11 }}>
                      {new Date(e.date).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </BlurView>
                ))}
              </View>
            </>
          )}

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
  badge:  { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  logRow: { borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
});
