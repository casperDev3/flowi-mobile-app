import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import Animated, {
  FadeInRight, FadeOutLeft, interpolateColor, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { Motion } from '@/constants/motion';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMotion } from '@/hooks/use-motion';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { requestNotificationPermissions } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { DEFAULT_PROFILE, FitnessGoal, HealthProfile, PROFILE_KEY, Sex } from '@/utils/healthUtils';

const ONBOARDING_KEY = 'onboarding_done';
const ACCENT = '#7C3AED';
const STEPS = 4;

function clampInt(text: string, min: number, max: number, fallback: number): number {
  const n = parseInt(text.replace(/[^0-9]/g, ''), 10);
  if (isNaN(n)) return text === '' ? min : fallback;
  return Math.min(max, Math.max(0, n));
}

// ─── Animated progress dot ───────────────────────────────────────────────────
function ProgressDot({ active, dim }: { active: boolean; dim: string }) {
  const { reduced } = useMotion();
  const progress = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: reduced ? 0 : Motion.duration.normal,
    });
  }, [active, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const dotStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [dim, ACCENT]),
  }));

  return <Animated.View style={[{ flex: 1, height: 4, borderRadius: 2 }, dotStyle]} />;
}

export function Onboarding() {
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { status: authStatus } = useAuth();
  const router = useRouter();
  const motion = useMotion();

  const [loaded, setLoaded] = useState(false);
  const [show, setShow] = useState(false);
  const [welcomeDone, setWelcomeDone] = useState(false);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<HealthProfile>(DEFAULT_PROFILE);
  const [profileTouched, setProfileTouched] = useState(false);

  useEffect(() => {
    Promise.all([
      loadData<boolean>(ONBOARDING_KEY, false),
      loadData<boolean>('welcome_done', false),
    ]).then(([done, wd]) => {
      setWelcomeDone(Boolean(wd));
      setShow(!done);
      setLoaded(true);
    });
  }, []);

  const finish = async () => {
    try {
      if (profileTouched) await saveData(PROFILE_KEY, profile);
      await saveData(ONBOARDING_KEY, true);
    } catch {}
    setShow(false);
    if (!welcomeDone && authStatus !== 'authed') {
      router.replace('/welcome');
    }
  };

  if (!loaded || !show) return null;

  const c = {
    bg1:   isDark ? '#0A0E1A' : '#EFF5FF',
    bg2:   isDark ? '#0F1A2E' : '#E0ECFF',
    text:  isDark ? '#EAF4FF' : '#0C2030',
    sub:   isDark ? 'rgba(234,244,255,0.62)' : 'rgba(12,32,48,0.58)',
    card:  isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
    border: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
    dim:   isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const next = () => setStep(s => Math.min(STEPS - 1, s + 1));
  const touchProfile = (p: Partial<HealthProfile>) => { setProfileTouched(true); setProfile(prev => ({ ...prev, ...p })); };

  const sexOpts: { key: Sex; label: string }[] = [{ key: 'male', label: tr.male }, { key: 'female', label: tr.female }];
  const goalOpts: { key: FitnessGoal; label: string }[] = [
    { key: 'lose', label: tr.goalLose }, { key: 'maintain', label: tr.goalMaintain }, { key: 'gain', label: tr.goalGain },
  ];

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={{ flex: 1 }}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

            {/* Прогрес + пропуск */}
            <View style={s.top}>
              <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
                {Array.from({ length: STEPS }, (_, i) => (
                  <ProgressDot key={i} active={i <= step} dim={c.dim} />
                ))}
              </View>
              <TouchableOpacity onPress={finish} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 14 }}>{tr.onbSkip}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Step content — key forces remount → triggers entering/exiting */}
              <Animated.View
                key={step}
                entering={motion.entering(FadeInRight.duration(Motion.duration.normal))}
                exiting={motion.entering(FadeOutLeft.duration(Motion.duration.fast))}
              >
                {step === 0 && (
                  <Hero icon="sparkles" title={tr.onbWelcomeTitle} desc={tr.onbWelcomeDesc} c={c} />
                )}

                {step === 1 && (
                  <View>
                    <Hero icon="person.fill" title={tr.onbProfileTitle} desc={tr.onbProfileDesc} c={c} compact />
                    <Text style={[s.label, { color: c.sub }]}>{tr.sexLabel}</Text>
                    <Segmented opts={sexOpts} value={profile.sex} onChange={v => touchProfile({ sex: v })} c={c} />
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.label, { color: c.sub }]}>{tr.ageLabel}</Text>
                        <TextInput value={String(profile.age)} onChangeText={t => touchProfile({ age: clampInt(t, 10, 120, profile.age) })}
                          keyboardType="number-pad" placeholder="30" placeholderTextColor={c.sub}
                          style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.label, { color: c.sub }]}>{tr.heightLabel}</Text>
                        <TextInput value={String(profile.heightCm)} onChangeText={t => touchProfile({ heightCm: clampInt(t, 100, 250, profile.heightCm) })}
                          keyboardType="number-pad" placeholder="175" placeholderTextColor={c.sub}
                          style={[s.input, { color: c.text, borderColor: c.border, backgroundColor: c.dim }]} />
                      </View>
                    </View>
                    <Text style={[s.label, { color: c.sub }]}>{tr.goalLabel}</Text>
                    <Segmented opts={goalOpts} value={profile.goal} onChange={v => touchProfile({ goal: v })} c={c} />
                  </View>
                )}

                {step === 2 && (
                  <Hero icon="bell.fill" title={tr.onbNotifTitle} desc={tr.onbNotifDesc} c={c} />
                )}

                {step === 3 && (
                  <Hero icon="checkmark.circle.fill" title={tr.onbDoneTitle} desc={tr.onbDoneDesc} c={c} />
                )}
              </Animated.View>
            </ScrollView>

            {/* Кнопки */}
            <View style={{ paddingHorizontal: 24, paddingBottom: 12, gap: 10 }}>
              {step === 0 && <PrimaryBtn label={tr.onbStart} onPress={next} />}
              {step === 1 && <PrimaryBtn label={tr.onbNext} onPress={next} />}
              {step === 2 && (
                <>
                  <PrimaryBtn label={tr.onbAllow} onPress={async () => { try { await requestNotificationPermissions(); } catch {} next(); }} />
                  <TouchableOpacity onPress={next} style={s.ghostBtn}>
                    <Text style={{ color: c.sub, fontWeight: '700' }}>{tr.onbLater}</Text>
                  </TouchableOpacity>
                </>
              )}
              {step === 3 && <PrimaryBtn label={tr.onbBegin} onPress={finish} />}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function Hero({ icon, title, desc, c, compact }: { icon: string; title: string; desc: string; c: any; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', marginBottom: compact ? 18 : 0 }}>
      <View style={{ width: compact ? 56 : 76, height: compact ? 56 : 76, borderRadius: 24, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <IconSymbol name={icon as any} size={compact ? 28 : 38} color={ACCENT} />
      </View>
      <Text style={{ color: c.text, fontSize: compact ? 22 : 26, fontWeight: '800', textAlign: 'center', marginBottom: 10, letterSpacing: -0.5 }}>{title}</Text>
      <Text style={{ color: c.sub, fontSize: 14, lineHeight: 21, textAlign: 'center', paddingHorizontal: 4 }}>{desc}</Text>
    </View>
  );
}

function Segmented<T extends string>({ opts, value, onChange, c }: { opts: { key: T; label: string }[]; value: T; onChange: (v: T) => void; c: any }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {opts.map(o => {
        const active = o.key === value;
        return (
          <TouchableOpacity key={o.key} onPress={() => onChange(o.key)}
            style={{ flex: 1, paddingVertical: 13, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', borderColor: active ? ACCENT : c.border, backgroundColor: active ? ACCENT + '20' : c.dim }}>
            <Text style={{ color: active ? ACCENT : c.text, fontWeight: '700', fontSize: 14 }}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PrimaryBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  top:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  label:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:    { fontSize: 18, fontWeight: '700', borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  ghostBtn: { alignItems: 'center', paddingVertical: 12 },
});
