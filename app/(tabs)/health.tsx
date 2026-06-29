import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { HubTile } from '@/components/health/HubTile';
import { RingCell } from '@/components/health/RingCell';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { loadData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
  HEALTH_ACCENTS, ModalKey, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { HealthEntry, getMonthEntries, getWeeklyInsights } from '@/utils/healthUtils';

const { width: W } = Dimensions.get('window');

const RADIAL_ITEMS = [
  { key: 'water',    icon: 'drop.fill',         color: ACCENT },
  { key: 'calories', icon: 'flame.fill',        color: ACCENT_CAL },
  { key: 'weight',   icon: 'scalemass.fill',    color: ACCENT_WEIGHT },
  { key: 'steps',    icon: 'figure.walk',       color: ACCENT_STEPS },
  { key: 'pulse',    icon: 'waveform.path.ecg', color: ACCENT_PULSE },
] as const;

export default function HealthHubScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  const h = useHealthEntries();
  const { today, goals, cal, latestWeight, bmi, bmiCategory, profile } = h;

  const [refreshing, setRefreshing] = useState(false);
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);

  // Лічильник «на сьогодні» для плитки Профілактики (невипиті ліки)
  const [medsDue, setMedsDue] = useState(0);
  const loadMedsDue = useCallback(async () => {
    const meds = await loadData<any[]>('health_meds', []);
    const todayIso = new Date().toDateString();
    let due = 0;
    meds.forEach(m => {
      if (!m.active) return;
      const takenToday = (m.log ?? []).filter((l: any) => new Date(l.date).toDateString() === todayIso).length;
      due += Math.max(0, (m.times?.length ?? 0) - takenToday);
    });
    setMedsDue(due);
  }, []);
  useEffect(() => { loadMedsDue(); }, [loadMedsDue]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([h.reload(), loadMedsDue()]);
    setRefreshing(false);
  }, [h, loadMedsDue]);

  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };

  const bmiColor = (b: number) => {
    const cat = bmiCategory(b);
    return cat === 'normal' ? ACCENT : cat === 'underweight' ? ACCENT_STEPS : cat === 'overweight' ? ACCENT_MOOD : ACCENT_PULSE;
  };

  // Radial FAB
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const toggleFab = () => {
    const to = fabOpen ? 0 : 1; setFabOpen(!fabOpen);
    Animated.spring(fabAnim, { toValue: to, useNativeDriver: true, friction: 5, tension: 80 }).start();
  };
  const closeFab = () => { setFabOpen(false); Animated.spring(fabAnim, { toValue: 0, useNativeDriver: true, friction: 6 }).start(); };
  const openModal = (key: ModalKey) => { closeFab(); setModal(key); };
  const RADIUS = 112;
  const radialPositions = RADIAL_ITEMS.map((_, i) => {
    const angle = Math.PI + (Math.PI * i) / (RADIAL_ITEMS.length - 1);
    return { x: Math.cos(angle) * RADIUS, y: -Math.abs(Math.sin(angle)) * RADIUS };
  });
  const fabRotate = fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  const stepsStat = today.steps >= 1000 ? `${(today.steps / 1000).toFixed(1)}т кр` : `${today.steps} кр`;

  const insights = useMemo(() => getWeeklyInsights(h.entries).slice(0, 2), [h.entries]);
  const insightLabel: Record<string, string> = { steps: tr.steps, sleep: tr.sleep, water: tr.water, calories: tr.calories };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <Text style={[s.pageTitle, { color: c.text, flex: 1 }]}>{tr.health}</Text>
          <TouchableOpacity onPress={() => setHistoryOpen(true)}
            accessibilityRole="button" accessibilityLabel={tr.history}
            style={[s.iconBtnSm, { borderColor: c.border, backgroundColor: c.dim }]}>
            <IconSymbol name="clock.fill" size={16} color={c.sub} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 120 : 100 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Профіль-підказка */}
          {h.initialized && !profile && (
            <TouchableOpacity onPress={() => router.push('/health-profile')} activeOpacity={0.85} style={{ marginBottom: 14 }}>
              <LinearGradient colors={isDark ? ['#0c1a14', '#10241c'] : ['#e9fbf3', '#d8f5e8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.banner, { borderColor: ACCENT + '40' }]}>
                <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="person.fill" size={18} color={ACCENT} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{tr.healthProfile}</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{tr.profileHint}</Text>
                </View>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Зведена статистика */}
          <Text style={[s.kicker, { color: c.sub }]}>{tr.summary}</Text>
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <RingCell pct={goals.calories ? Math.max(0, cal.net) / goals.calories : 0} color={ACCENT_CAL} label={tr.calories} value={`${cal.net}кк`} />
              <RingCell pct={today.steps / goals.steps} color={ACCENT_STEPS} label={tr.steps}
                value={today.steps >= 1000 ? `${(today.steps / 1000).toFixed(1)}т` : `${today.steps}`} />
              <RingCell pct={today.water / goals.water} color={ACCENT} label={tr.water}
                value={today.water >= 1000 ? `${(today.water / 1000).toFixed(1)}л` : `${today.water}мл`} />
              <RingCell pct={today.sleep ? today.sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep}
                value={today.sleep ? fmtSleep(today.sleep) : '—'} />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }}>
              <VitalMini label={tr.weight} value={latestWeight ? `${latestWeight} кг` : '—'} color={ACCENT_WEIGHT} sub={c.sub} text={c.text} />
              <VitalMini label={tr.bmi} value={bmi ? bmi.toFixed(1) : '—'} color={bmi ? bmiColor(bmi) : c.sub} sub={c.sub} text={c.text} />
              <VitalMini label={tr.pulse} value={today.pulse ? `${today.pulse}` : '—'} color={ACCENT_PULSE} sub={c.sub} text={c.text} />
              <VitalMini label={tr.protein} value={`${Math.round(today.protein)}г`} color={ACCENT_PROT} sub={c.sub} text={c.text} />
            </View>
          </BlurView>

          {/* Інсайти тижня */}
          {insights.length > 0 && (
            <>
              <Text style={[s.kicker, { color: c.sub }]}>{tr.insights}</Text>
              <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginBottom: 16, paddingVertical: 6 }]}>
                {insights.map((ins, i) => {
                  const up = ins.deltaPct > 0;
                  const col = ins.good ? ACCENT : ACCENT_PULSE;
                  return (
                    <View key={ins.type} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9,
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, borderTopColor: c.border }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: col + '20', alignItems: 'center', justifyContent: 'center' }}>
                        <IconSymbol name={up ? 'arrow.up.right' : 'arrow.down.right'} size={13} color={col} />
                      </View>
                      <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', marginLeft: 10, flex: 1 }}>{insightLabel[ins.type]}</Text>
                      <Text style={{ color: col, fontSize: 13, fontWeight: '800' }}>{up ? '+' : ''}{ins.deltaPct}%</Text>
                      <Text style={{ color: c.sub, fontSize: 11, marginLeft: 6 }}>{tr.thisWeek}</Text>
                    </View>
                  );
                })}
              </BlurView>
            </>
          )}

          {/* Розділи */}
          <Text style={[s.kicker, { color: c.sub }]}>{tr.sections}</Text>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <HubTile title={tr.workoutsLabel} icon="figure.run" color={ACCENT_STEPS} hint={tr.workoutsSub}
                onPress={() => router.push('/workouts')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <HubTile title={tr.nutrition} icon="flame.fill" color={ACCENT_CAL} stat={`${cal.net} / ${goals.calories} кк`}
                onPress={() => router.push('/health-nutrition')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <HubTile title={tr.activity} icon="figure.walk" color={ACCENT_STEPS} stat={stepsStat}
                onPress={() => router.push('/health-activity')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <HubTile title={tr.sleepRecovery} icon="moon.fill" color={ACCENT_SLEEP} stat={today.sleep ? fmtSleep(today.sleep) : tr.noData}
                onPress={() => router.push('/health-sleep')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <HubTile title={tr.bodyMetrics} icon="heart.fill" color={ACCENT_PULSE} stat={latestWeight ? `${latestWeight} кг · ${bmi ? bmi.toFixed(1) : '—'}` : tr.noData}
                onPress={() => router.push('/health-vitals')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <HubTile title={tr.prevention} icon="cross.case.fill" color={HEALTH_ACCENTS.prevention} hint={tr.medsSub} badge={medsDue}
                onPress={() => router.push('/health-prevention')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <HubTile title={tr.healthProfile} icon="person.fill" color={ACCENT_PROT}
                hint={profile ? `${goals.calories} кк · ${goals.protein} г` : tr.profileHint}
                onPress={() => router.push('/health-profile')} isDark={isDark} border={c.border} text={c.text} sub={c.sub} />
              <View style={{ flex: 1 }} />
            </View>
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* FAB backdrop */}
      {fabOpen && <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} onPress={closeFab} />}

      {/* Radial FAB */}
      <View style={[s.fabContainer, { bottom: Platform.OS === 'ios' ? 108 : 88 }]} pointerEvents="box-none">
        {RADIAL_ITEMS.map((item, i) => {
          const pos = radialPositions[i];
          const translateX = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, pos.x] });
          const translateY = fabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, pos.y] });
          const opacity = fabAnim.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1] });
          const scale = fabAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.2, 1] });
          return (
            <Animated.View key={item.key} style={[s.radialItem, { transform: [{ translateX }, { translateY }, { scale }], opacity }]}>
              <TouchableOpacity onPress={() => openModal(item.key as ModalKey)}
                style={[s.radialBtn, { backgroundColor: item.color, shadowColor: item.color }]}>
                <IconSymbol name={item.icon as any} size={19} color="#fff" />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
        <TouchableOpacity onPress={toggleFab} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={tr.add}
          style={[s.fab, { shadowColor: ACCENT, borderRadius: fabOpen ? 29 : 16 }]}>
          <LinearGradient colors={[ACCENT, '#059669']} style={[s.fabGrad, { borderRadius: fabOpen ? 29 : 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Animated.View style={{ transform: [{ rotate: fabRotate }] }}>
              <IconSymbol name="plus" size={22} color="#fff" />
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)}
        entries={h.entries} activeMonth={activeMonth} setActiveMonth={setActiveMonth}
        isDark={isDark} c={c} tr={tr} locale={locale} />
    </View>
  );
}

function VitalMini({ label, value, color, sub, text }: { label: string; value: string; color: string; sub: string; text: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color, fontSize: 15, fontWeight: '800' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function HistoryModal({ open, onClose, entries, activeMonth, setActiveMonth, isDark, c, tr, locale }: {
  open: boolean; onClose: () => void; entries: HealthEntry[];
  activeMonth: Date; setActiveMonth: (d: Date) => void;
  isDark: boolean; c: any; tr: any; locale: string;
}) {
  const now = new Date();
  const monthEntries = useMemo(() => getMonthEntries(entries, activeMonth), [entries, activeMonth]);
  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
          <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
            <View style={s.handleRow}>
              <View style={{ flex: 1 }} />
              <View style={[s.handle, { backgroundColor: c.border }]} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <IconSymbol name="xmark" size={17} color={c.sub} />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[s.sheetTitle, { color: c.text, flex: 1 }]}>{tr.history}</Text>
              <MonthPicker month={activeMonth} onChange={setActiveMonth} months={tr.months}
                accentColor={ACCENT} textColor={c.text} subColor={c.sub} dimColor={c.dim} borderColor={c.border} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get('window').height * 0.58 }}>
              {monthEntries.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <IconSymbol name="heart.fill" size={38} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '600' }}>{tr.noEntriesYet}</Text>
                </View>
              ) : (
                <View style={{ gap: 8, paddingBottom: 16 }}>
                  {monthEntries.slice(0, 60).map(entry => {
                    const d = new Date(entry.date);
                    const dayStr = isSameDay(d, now) ? tr.today : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                    const cfg = getEntryCfg(entry, tr);
                    return (
                      <View key={entry.id} style={[s.historyCard, { borderColor: c.border, backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.78)' }]}>
                        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                          <IconSymbol name={cfg.icon as any} size={16} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{cfg.valueStr}</Text>
                          {entry.note && entry.note !== '__hk__' ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{entry.note}</Text> : null}
                          <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{dayStr} · {timeStr}</Text>
                        </View>
                        <View style={[s.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '35' }]}>
                          <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.typeLabel}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function getEntryCfg(entry: HealthEntry, tr: any) {
  switch (entry.type) {
    case 'water':        return { icon: 'drop.fill',         color: ACCENT,        typeLabel: tr.water,    valueStr: entry.value >= 1000 ? `${(entry.value / 1000).toFixed(1)} л` : `+${entry.value} мл` };
    case 'calories':     return { icon: 'flame.fill',        color: ACCENT_CAL,    typeLabel: tr.consumed, valueStr: `${entry.value} кк${entry.protein ? ` · ${entry.protein}${tr.proteinShort}` : ''}` };
    case 'calories_out': return { icon: 'flame',             color: ACCENT_STEPS,  typeLabel: tr.burned,   valueStr: `${entry.value} кк` };
    case 'weight':       return { icon: 'scalemass.fill',    color: ACCENT_WEIGHT, typeLabel: tr.weight,   valueStr: `${entry.value} кг` };
    case 'sleep':        return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.sleep,    valueStr: fmtSleep(entry.value) };
    case 'steps':        return { icon: 'figure.walk',       color: ACCENT_STEPS,  typeLabel: tr.steps,    valueStr: `${entry.value.toLocaleString()} кр` };
    case 'pulse':        return { icon: 'waveform.path.ecg', color: ACCENT_PULSE,  typeLabel: tr.pulse,    valueStr: `${entry.value} уд/хв` };
    default:             return { icon: 'heart.fill',        color: ACCENT_MOOD,   typeLabel: '—',         valueStr: String(entry.value) };
  }
}

const s = StyleSheet.create({
  pageTitle:    { fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  kicker:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, marginLeft: 2 },
  card:         { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden' },
  iconBtnSm:    { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:        { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  banner:       { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center' },
  historyCard:  { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center' },
  fabContainer: { position: 'absolute', right: 20, alignItems: 'center', justifyContent: 'center' },
  fab:          { width: 58, height: 58, borderRadius: 29, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8 },
  fabGrad:      { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  radialItem:   { position: 'absolute', alignItems: 'center' },
  radialBtn:    { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 6 },
  overlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrapper: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:        { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  handle:       { width: 36, height: 4, borderRadius: 2 },
  sheetTitle:   { fontSize: 20, fontWeight: '800' },
});
