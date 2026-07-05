import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import {
  ActivityLevel,
  DEFAULT_PROFILE,
  FALLBACK_WEIGHT,
  FitnessGoal,
  HealthEntry,
  HealthProfile,
  PROFILE_KEY,
  Sex,
  calcTDEE,
  computeGoals,
} from '@/utils/healthUtils';

const ACCENT = '#10B981';

export default function HealthProfileScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  useScreenView('health_profile');

  const [profile, setProfile] = useState<HealthProfile>(DEFAULT_PROFILE);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await loadData<HealthProfile | null>(PROFILE_KEY, null);
      if (p) setProfile({ ...DEFAULT_PROFILE, ...p });
      const entries = await loadData<HealthEntry[]>('health_entries_v2', []);
      const weights = entries.filter(e => e.type === 'weight');
      if (weights.length) setLatestWeight(weights[weights.length - 1].value);
      setInitialized(true);
    })();
  }, []);

  const weightForCalc = latestWeight ?? FALLBACK_WEIGHT;
  const goals = useMemo(() => computeGoals(profile, weightForCalc), [profile, weightForCalc]);
  const tdee = useMemo(() => calcTDEE(profile, weightForCalc), [profile, weightForCalc]);

  const save = useCallback(async () => {
    await saveData(PROFILE_KEY, profile);
    router.back();
  }, [profile, router]);

  const c = {
    bg1:   isDark ? '#0C0C14' : '#F4F2FF',
    bg2:   isDark ? '#14121E' : '#EAE6FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
    text:  isDark ? '#F0EEFF' : '#1A1433',
    sub:   isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const sexOpts: { key: Sex; label: string }[] = [
    { key: 'male', label: tr.male },
    { key: 'female', label: tr.female },
  ];
  const goalOpts: { key: FitnessGoal; label: string; icon: string }[] = [
    { key: 'lose', label: tr.goalLose, icon: 'arrow.down.right' },
    { key: 'maintain', label: tr.goalMaintain, icon: 'equal' },
    { key: 'gain', label: tr.goalGain, icon: 'arrow.up.right' },
  ];
  const actOpts: { key: ActivityLevel; label: string }[] = [
    { key: 'sedentary', label: tr.actSedentary },
    { key: 'light', label: tr.actLight },
    { key: 'moderate', label: tr.actModerate },
    { key: 'active', label: tr.actActive },
    { key: 'very_active', label: tr.actVeryActive },
  ];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="chevron.left" size={20} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.pageTitle, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.healthProfile}</Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

            {/* Стать */}
            <Text style={[s.label, { color: c.sub }]}>{tr.sexLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sexOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, sex: o.key }))}
                  style={[s.segBtn, { borderColor: profile.sex === o.key ? ACCENT : c.border, backgroundColor: profile.sex === o.key ? ACCENT + '20' : c.dim }]}>
                  <Text style={{ color: profile.sex === o.key ? ACCENT : c.text, fontWeight: '700', fontSize: 14 }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Вік + Зріст */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.sub }]}>{tr.ageLabel}</Text>
                <TextInput value={String(profile.age)} onChangeText={t => setProfile(p => ({ ...p, age: clampInt(t, 10, 120, p.age) }))}
                  keyboardType="number-pad" placeholder="30" placeholderTextColor={c.sub}
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.sub }]}>{tr.heightLabel}</Text>
                <TextInput value={String(profile.heightCm)} onChangeText={t => setProfile(p => ({ ...p, heightCm: clampInt(t, 100, 250, p.heightCm) }))}
                  keyboardType="number-pad" placeholder="175" placeholderTextColor={c.sub}
                  style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
              </View>
            </View>

            {/* Активність */}
            <Text style={[s.label, { color: c.sub }]}>{tr.activityLabel}</Text>
            <View style={{ gap: 8 }}>
              {actOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, activity: o.key }))}
                  style={[s.rowBtn, { borderColor: profile.activity === o.key ? ACCENT : c.border, backgroundColor: profile.activity === o.key ? ACCENT + '15' : c.dim }]}>
                  <Text style={{ color: profile.activity === o.key ? ACCENT : c.text, fontWeight: '600', fontSize: 14, flex: 1 }}>{o.label}</Text>
                  {profile.activity === o.key && <IconSymbol name="checkmark" size={15} color={ACCENT} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Ціль */}
            <Text style={[s.label, { color: c.sub }]}>{tr.goalLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {goalOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, goal: o.key }))}
                  style={[s.segBtn, { flexDirection: 'column', gap: 4, paddingVertical: 12, borderColor: profile.goal === o.key ? ACCENT : c.border, backgroundColor: profile.goal === o.key ? ACCENT + '20' : c.dim }]}>
                  <IconSymbol name={o.icon as any} size={16} color={profile.goal === o.key ? ACCENT : c.sub} />
                  <Text style={{ color: profile.goal === o.key ? ACCENT : c.text, fontWeight: '700', fontSize: 13 }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Превʼю розрахованих цілей */}
            <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.preview, { borderColor: c.border }]}>
              <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
                {tr.todayLabel} · TDEE {tdee} кк
              </Text>
              <PreviewRow label={tr.dailyLimit} value={`${goals.calories} кк`} color="#F97316" />
              <PreviewRow label={tr.protein} value={`${goals.protein} г`} color="#8B5CF6" />
              <PreviewRow label={tr.water} value={`${goals.water} мл`} color={ACCENT} />
              {latestWeight == null && (
                <Text style={{ color: c.sub, fontSize: 11, marginTop: 8 }}>
                  {`ℹ️ ${tr.recordWeight} — ${FALLBACK_WEIGHT} кг (за замовч.)`}
                </Text>
              )}
            </BlurView>

            <TouchableOpacity onPress={save} disabled={!initialized}
              style={[s.saveBtn, { backgroundColor: ACCENT, opacity: initialized ? 1 : 0.5 }]}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{tr.saveProfile}</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PreviewRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 10 }} />
      <Text style={{ color: color, fontSize: 14, fontWeight: '700', flex: 1 }}>{value}</Text>
      <Text style={{ color: color, opacity: 0.7, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function clampInt(text: string, min: number, max: number, fallback: number): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return text === '' ? min : fallback;
  return Math.min(max, Math.max(0, n));
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 18 },
  input:     { fontSize: 18, fontWeight: '700', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  segBtn:    { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  rowBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 13 },
  preview:   { borderRadius: 18, borderWidth: 1, padding: 16, overflow: 'hidden', marginTop: 24 },
  saveBtn:   { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 20 },
});
