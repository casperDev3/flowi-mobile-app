import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RingCell } from '@/components/health/RingCell';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { loadData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import { Transaction, calcTotals, filterByMonth, txCurrency } from '@/utils/financeUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_SLEEP, ACCENT_STEPS, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { FALLBACK_WEIGHT, HealthEntry, HealthProfile, computeGoals, lastForDay, sumForDay } from '@/utils/healthUtils';
import { Task, isOverdue } from '@/utils/taskUtils';

interface TimeEntry { id: string; duration: number; date: string; }

const ACCENT_TASK = '#7C3AED';
const ACCENT_FIN = '#0EA5E9';
const ACCENT_TIME = '#6366F1';

export default function TodayScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);
  useScreenView('today');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [time, setTime] = useState<TimeEntry[]>([]);
  const [health, setHealth] = useState<HealthEntry[]>([]);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [t, x, tm, h, p] = await Promise.all([
      loadData<Task[]>('tasks', []),
      loadData<Transaction[]>('transactions', []),
      loadData<TimeEntry[]>('time_entries', []),
      loadData<HealthEntry[]>('health_entries_v2', []),
      loadData<HealthProfile | null>('health_profile', null),
    ]);
    setTasks(t); setTxs(x); setTime(tm); setHealth(h); setProfile(p);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const today = new Date();
  const hour = today.getHours();
  const greet = hour < 6 ? tr.todayGreetNight : hour < 12 ? tr.todayGreetMorning : hour < 18 ? tr.todayGreetDay : tr.todayGreetEvening;
  const dateStr = today.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  // Завдання
  const activeCount = tasks.filter(t => t.status === 'active').length;
  const overdueCount = tasks.filter(isOverdue).length;

  // Здоров'я
  const goals = useMemo(() => {
    const weights = health.filter(e => e.type === 'weight');
    const lw = weights.length ? weights[0].value : null;
    return computeGoals(profile, lw ?? FALLBACK_WEIGHT);
  }, [health, profile]);
  const calNet = sumForDay(health, 'calories', today) - sumForDay(health, 'calories_out', today);
  const steps = sumForDay(health, 'steps', today);
  const water = sumForDay(health, 'water', today);
  const sleep = lastForDay(health, 'sleep', today);

  // Фінанси (основна валюта UAH)
  const fin = useMemo(() => {
    const month = filterByMonth(txs.filter(t => txCurrency(t) === 'UAH'), today);
    return calcTotals(month);
  }, [txs]);

  // Час сьогодні (секунди)
  const trackedSec = time.filter(e => isSameDay(new Date(e.date), today)).reduce((s, e) => s + (e.duration || 0), 0);
  const fmtTime = (sec: number) => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}г ${m}хв`;
    return `${m}хв`;
  };
  const fmtMoney = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString(locale)} ₴`;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6 }}>
          <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600' }}>{greet}</Text>
          <Text style={[s.title, { color: c.text }]} numberOfLines={1}>{dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 112 : 92 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

          {/* Здоров'я */}
          <Card onPress={() => router.push('/health')} c={c} isDark={isDark} title={tr.tabHealth} icon="figure.run" color={ACCENT}>
            <View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>
              <RingCell pct={goals.calories ? Math.max(0, calNet) / goals.calories : 0} color={ACCENT_CAL} label={tr.calories} value={`${calNet}кк`} />
              <RingCell pct={steps / goals.steps} color={ACCENT_STEPS} label={tr.steps} value={steps >= 1000 ? `${(steps / 1000).toFixed(1)}т` : `${steps}`} />
              <RingCell pct={water / goals.water} color={ACCENT} label={tr.water} value={water >= 1000 ? `${(water / 1000).toFixed(1)}л` : `${water}мл`} />
              <RingCell pct={sleep ? sleep / goals.sleep : 0} color={ACCENT_SLEEP} label={tr.sleep} value={sleep ? fmtSleep(sleep) : '—'} />
            </View>
          </Card>

          {/* Завдання */}
          <Card onPress={() => router.push('/')} c={c} isDark={isDark} title={tr.tabTasks} icon="checklist" color={ACCENT_TASK}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4, gap: 6 }}>
              <Text style={{ color: c.text, fontSize: 26, fontWeight: '800' }}>{activeCount}</Text>
              <Text style={{ color: c.sub, fontSize: 13 }}>{tr.todayActive}</Text>
              {overdueCount > 0 && (
                <View style={[s.badge, { backgroundColor: '#EF4444' + '20', borderColor: '#EF4444' + '40', marginLeft: 'auto' }]}>
                  <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700' }}>{overdueCount} {tr.todayOverdue}</Text>
                </View>
              )}
            </View>
          </Card>

          {/* Фінанси */}
          <Card onPress={() => router.push('/explore')} c={c} isDark={isDark} title={tr.tabFinance} icon="banknote" color={ACCENT_FIN}>
            <Text style={{ color: fin.balance >= 0 ? '#10B981' : '#EF4444', fontSize: 24, fontWeight: '800', marginTop: 4 }}>{fmtMoney(fin.balance)}</Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 4 }}>
              <Text style={{ color: c.sub, fontSize: 12 }}>↑ <Text style={{ color: '#10B981', fontWeight: '700' }}>{fmtMoney(fin.income)}</Text></Text>
              <Text style={{ color: c.sub, fontSize: 12 }}>↓ <Text style={{ color: '#EF4444', fontWeight: '700' }}>{fmtMoney(fin.expense)}</Text></Text>
            </View>
          </Card>

          {/* Час */}
          <Card onPress={() => router.push('/time')} c={c} isDark={isDark} title={tr.tabToday + ' · ' + fmtTime(trackedSec)} icon="timer" color={ACCENT_TIME}>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{tr.todayTracked}</Text>
          </Card>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Card({ onPress, c, isDark, title, icon, color, children }: {
  onPress: () => void; c: any; isDark: boolean; title: string; icon: string; color: string; children?: React.ReactNode;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={title} style={{ marginBottom: 12 }}>
      <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
            <IconSymbol name={icon as any} size={16} color={color} />
          </View>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '800', marginLeft: 10, flex: 1 }}>{title}</Text>
          <IconSymbol name="chevron.right" size={13} color={c.sub} />
        </View>
        {children}
      </BlurView>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  card:  { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  badge: { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
});
