import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol, IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadData } from '@/store/storage';

type Shift = 'morning' | 'day' | 'evening' | 'night';

interface ShiftCfg { label: string; icon: IconSymbolName; color: string; hours: string; }

const SHIFTS: Record<Shift, ShiftCfg> = {
  morning: { label: 'Ранок',  icon: 'sun.horizon.fill', color: '#F59E0B', hours: '06–12' },
  day:     { label: 'День',   icon: 'sun.max.fill',     color: '#EF4444', hours: '12–18' },
  evening: { label: 'Вечір',  icon: 'sunset.fill',      color: '#8B5CF6', hours: '18–24' },
  night:   { label: 'Ніч',    icon: 'moon.fill',        color: '#0EA5E9', hours: '00–06' },
};

interface TimeEntry { id: string; task: string; shift: Shift; duration: number; date: string; }

const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
};

export default function TimeStatsScreen() {
  const isDark = useColorScheme() === 'dark';
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    loadData<TimeEntry[]>('time_entries', []).then(setEntries);
  }, []);

  const total = entries.reduce((s, e) => s + e.duration, 0);
  const avg = entries.length > 0 ? Math.round(total / entries.length) : 0;

  const byShift = useMemo(() => {
    const out: Record<Shift, number> = { morning: 0, day: 0, evening: 0, night: 0 };
    entries.forEach(e => { out[e.shift] += e.duration; });
    return out;
  }, [entries]);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F4F2FF',
    bg2:    isDark ? '#14121E' : '#EAE6FF',
    card:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
    text:   isDark ? '#EEF0FF' : '#0D1033',
    sub:    isDark ? 'rgba(238,240,255,0.45)' : 'rgba(13,16,51,0.45)',
    indigo: '#6366F1',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { backgroundColor: c.dim, borderColor: c.border }]}>
            <IconSymbol name="chevron.left" size={17} color={c.sub} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text }]}>Статистика часу</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: Platform.OS === 'ios' ? 48 : 28 }}
          showsVerticalScrollIndicator={false}>

          {/* Summary */}
          <View style={[s.statsRow, { borderColor: c.border, backgroundColor: c.card }]}>
            <StatCell value={total > 0 ? fmtDur(total) : '—'} label="Всього"  color={c.indigo} sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={String(entries.length)}         label="Сесій"   color="#10B981" sub={c.sub} />
            <View style={{ width: 1, backgroundColor: c.border }} />
            <StatCell value={avg > 0 ? fmtDur(avg) : '—'}     label="Середнє" color="#F59E0B" sub={c.sub} />
          </View>

          {/* Shift breakdown */}
          <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, marginTop: 14 }]}>
            <Text style={[s.sectionTitle, { color: c.text, marginBottom: 16 }]}>По змінах</Text>
            {(Object.keys(SHIFTS) as Shift[]).map(sh => {
              const cfg = SHIFTS[sh];
              const dur = byShift[sh];
              const pct = total > 0 ? Math.round((dur / total) * 100) : 0;
              return (
                <View key={sh} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <IconSymbol name={cfg.icon} size={13} color={dur > 0 ? cfg.color : c.sub} />
                    <Text style={{ color: dur > 0 ? c.text : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 7, flex: 1 }}>{cfg.label}</Text>
                    <Text style={{ color: c.sub, fontSize: 10, marginRight: 10 }}>{cfg.hours}</Text>
                    <Text style={{ color: dur > 0 ? cfg.color : c.sub, fontSize: 12, fontWeight: '700' }}>{dur > 0 ? fmtDur(dur) : '—'}</Text>
                  </View>
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                  </View>
                </View>
              );
            })}
          </BlurView>

          {entries.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 44 }}>
              <IconSymbol name="clock.fill" size={40} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 14, marginTop: 12, fontWeight: '600' }}>Немає даних для статистики</Text>
            </View>
          )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatCell({ value, label, color, sub }: { value: string; label: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '500', marginTop: 3 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header:       { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn:      { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.5, flex: 1, textAlign: 'center' },
  statsRow:     { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  card:         { borderRadius: 18, borderWidth: 1, padding: 18, overflow: 'hidden' },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  progressBg:   { height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
});
