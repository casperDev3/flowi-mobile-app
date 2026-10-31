/**
 * app/health-profile.tsx — налаштування розділу «Здоровʼя».
 *
 * Профіль (стать, вік, зріст, активність, ціль) і джерела даних (Apple Health)
 * перестали бути пунктами сайдбара й плитками хабу: розділ тепер один, із
 * вкладками, а це — його налаштування за шестернею в шапці. Ходять сюди раз на
 * місяць, тож вкладки вони не варті; а місце в меню коштувало стільки ж,
 * скільки «Харчування», куди заходять щодня.
 *
 * Маршрут лишився тим самим навмисно: на `/health-profile` ведуть закладки,
 * підказка «заповніть профіль» і старі посилання — і всі вони мусять і далі
 * приводити саме до профілю, а не в довільну вкладку.
 */
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

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { HK_AVAILABLE } from '@/store/healthkit';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { saveSyncedValue } from '@/store/synced-storage';
import {
  ActivityLevel,
  DEFAULT_PROFILE,
  FALLBACK_WEIGHT,
  FitnessGoal,
  HealthEntry,
  HealthProfile,
  PROFILE_KEY,
  PROFILE_RANGES,
  Sex,
  calcTDEE,
  clampProfileRanges,
  computeGoals,
  latestValue,
} from '@/utils/healthUtils';
import { HealthColumns, useHealthTabLayout } from '@/components/health/HealthLayout';
import { getHealthDSColors } from '@/components/health/palette';
import { dsTokens } from '@/hooks/use-ds';
import { HEALTH_ACCENTS } from '@/utils/healthTheme';
import { fontFamily } from '@/constants/theme';
import { useGlassStyles } from '@/components/finance/finPalette';
import { MeshBackground } from '@/components/ds';

const ACCENT = HEALTH_ACCENTS.water;

export default function HealthProfileScreen() {
  // Планшет (рішення 6): поля профілю ліворуч, живий розрахунок цілей,
  // «Зберегти» й джерела даних праворуч — результат видно під час правки.
  const lay = useHealthTabLayout();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  useScreenView('health_settings');

  const [profile, setProfile] = useState<HealthProfile>(DEFAULT_PROFILE);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await loadData<HealthProfile | null>(PROFILE_KEY, null);
      if (p) setProfile({ ...DEFAULT_PROFILE, ...p });
      const entries = await loadData<HealthEntry[]>('health_entries_v2', []);
      // latestValue, а не вибір за позицією: тут раніше стояв
      // weights[weights.length - 1], тобто в newest-first масиві —
      // НАЙСТАРІШЕ зважування. Через це екран показував норми від однієї ваги,
      // а решта застосунку рахувала від іншої.
      setLatestWeight(latestValue(entries, 'weight'));
      setInitialized(true);
    })();
  }, []);

  const weightForCalc = latestWeight ?? FALLBACK_WEIGHT;
  const goals = useMemo(() => computeGoals(profile, weightForCalc), [profile, weightForCalc]);
  const tdee = useMemo(() => calcTDEE(profile, weightForCalc), [profile, weightForCalc]);

  const save = useCallback(async () => {
    // Межі застосовуються ще раз саме тут, а не лише на blur: зберегти можна й
    // не залишаючи поля (кнопка перехоплює натиск), і тоді в профіль поїхав би
    // вік 0 — а з нього рахується BMR, тобто й усі норми.
    const clamped = clampProfileRanges(profile);
    setProfile(clamped);
    await saveSyncedValue(PROFILE_KEY, clamped);
    router.back();
  }, [profile, router]);

  // Палітра — у useMemo: інакше кожен ререндер (а тут їх багато, бо
  // поля вводу пишуть у стан на кожен символ) створює новий обʼєкт.
  const c = useMemo(() => getHealthDSColors(isDark), [isDark]);
  const gs = useGlassStyles();
  const k = dsTokens(isDark);

  const sexOpts: { key: Sex; label: string }[] = [
    { key: 'male', label: tr.male },
    { key: 'female', label: tr.female },
  ];
  const goalOpts: { key: FitnessGoal; label: string; icon: IconSymbolName }[] = [
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
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>
        {/* Налаштування розділу пунктом сайдбара НЕ є (і не були задумані ним):
            сюди заходять із шестерні в шапці «Здоровʼя». На телефоні шлях
            нагору — «Назад», на планшеті — крихти «Здоровʼя → Налаштування»
            (ScreenHeaderNav.ts): стрілка поруч із сайдбаром вела б на
            випадковий попередній екран і не казала б, звідки прийшов. */}
        <ScreenHeader
          title={tr.settings}
          color={c.text}
          titleStyle={s.pageTitle}
          back={{ onPress: () => router.back(), label: tr.back, color: c.text }}
          crumbs={[
            { label: tr.tabHealth, onPress: () => router.push('/(tabs)/health') },
            { label: tr.settings },
          ]}
          crumbColor={c.sub}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[lay.contentStyle, { paddingBottom: 120 }]} showsVerticalScrollIndicator={false}>
            <HealthColumns twoCol={lay.twoCol} left={<>

            {/* Профіль — перша з двох налаштовок розділу */}
            <Text style={[s.sectionTitle, { color: c.text }]}>{tr.healthProfile}</Text>

            {/* Стать */}
            <Text style={[s.label, { color: c.sub }]}>{tr.sexLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {sexOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, sex: o.key }))}
                  accessibilityRole="button" accessibilityState={{ selected: profile.sex === o.key }}
                  style={[s.segBtn, { backgroundColor: profile.sex === o.key ? k.action.primary : c.dim }]}>
                  <Text style={{ color: profile.sex === o.key ? k.text.onAction : c.text, fontFamily: fontFamily.semibold, fontSize: 14 }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Вік + Зріст */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.sub }]}>{tr.ageLabel}</Text>
                <TextInput value={String(profile.age)}
                  onChangeText={t => setProfile(p => ({ ...p, age: clampInt(t, PROFILE_RANGES.age.max, p.age) }))}
                  onBlur={() => setProfile(clampProfileRanges)}
                  keyboardType="number-pad" placeholder="30" placeholderTextColor={k.text.muted}
                  style={[s.input, { color: c.text, backgroundColor: c.dim }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.label, { color: c.sub }]}>{tr.heightLabel}</Text>
                <TextInput value={String(profile.heightCm)}
                  onChangeText={t => setProfile(p => ({ ...p, heightCm: clampInt(t, PROFILE_RANGES.heightCm.max, p.heightCm) }))}
                  onBlur={() => setProfile(clampProfileRanges)}
                  keyboardType="number-pad" placeholder="175" placeholderTextColor={k.text.muted}
                  style={[s.input, { color: c.text, backgroundColor: c.dim }]} />
              </View>
            </View>

            {/* Активність */}
            <Text style={[s.label, { color: c.sub }]}>{tr.activityLabel}</Text>
            <View style={{ gap: 8 }}>
              {actOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, activity: o.key }))}
                  accessibilityRole="button" accessibilityState={{ selected: profile.activity === o.key }}
                  style={[s.rowBtn, { backgroundColor: profile.activity === o.key ? k.action.primary : c.dim }]}>
                  <Text style={{ color: profile.activity === o.key ? k.text.onAction : c.text, fontFamily: fontFamily.medium, fontSize: 14, flex: 1 }}>{o.label}</Text>
                  {profile.activity === o.key && <IconSymbol name="checkmark" size={15} color={k.text.onAction} />}
                </TouchableOpacity>
              ))}
            </View>

            {/* Ціль */}
            <Text style={[s.label, { color: c.sub }]}>{tr.goalLabel}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {goalOpts.map(o => (
                <TouchableOpacity key={o.key} onPress={() => setProfile(p => ({ ...p, goal: o.key }))}
                  accessibilityRole="button" accessibilityState={{ selected: profile.goal === o.key }}
                  style={[s.segBtn, { flexDirection: 'column', gap: 4, paddingVertical: 12, borderRadius: 16, backgroundColor: profile.goal === o.key ? k.action.primary : c.dim }]}>
                  <IconSymbol name={o.icon} size={16} color={profile.goal === o.key ? k.text.onAction : c.sub} />
                  <Text style={{ color: profile.goal === o.key ? k.text.onAction : c.text, fontFamily: fontFamily.semibold, fontSize: 13 }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            </>} right={<>
            {/* Превʼю розрахованих цілей */}
            <View style={[s.preview, { ...gs.card }, lay.twoCol && { marginTop: 8 }]}>
              <Text style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], marginBottom: 12 }}>
                {tr.todayLabel} · TDEE {tdee} кк
              </Text>
              <PreviewRow label={tr.dailyLimit} value={`${goals.calories} кк`} color={HEALTH_ACCENTS.cal} text={c.text} sub={c.sub} />
              <PreviewRow label={tr.protein} value={`${goals.protein} г`} color={HEALTH_ACCENTS.weight} text={c.text} sub={c.sub} />
              <PreviewRow label={tr.water} value={`${goals.water} мл`} color={ACCENT} text={c.text} sub={c.sub} />
              {latestWeight == null && (
                <Text style={{ color: c.sub, fontSize: 12, marginTop: 8 }}>
                  {`ℹ️ ${tr.recordWeight} — ${FALLBACK_WEIGHT} кг (за замовч.)`}
                </Text>
              )}
            </View>

            <TouchableOpacity onPress={save} disabled={!initialized}
              accessibilityRole="button" accessibilityState={{ disabled: !initialized }}
              style={[s.saveBtn, { backgroundColor: initialized ? k.action.primary : k.state.disabledBg }]}>
              <Text style={{ color: initialized ? k.text.onAction : k.state.disabledText, fontFamily: fontFamily.semibold, fontSize: 15 }}>{tr.saveProfile}</Text>
            </TouchableOpacity>

            {/*
              Джерела даних — друга налаштовка розділу.

              Тут не обіцяється те, чого немає: рядок Apple Health зʼявляється
              лише там, де модуль справді є у збірці (iOS), а на решті пристроїв
              стоїть чесний підпис, що автоматичних джерел поки нема. Health
              Connect (Android) ще не підключено — рядка під нього теж немає,
              бо неактивний пункт меню читається як зламаний, а не як «скоро».
            */}
            <Text style={[s.sectionTitle, { color: c.text, marginTop: 28 }]}>
              {lang === 'uk' ? 'Джерела даних' : 'Data sources'}
            </Text>
            {HK_AVAILABLE ? (
              <TouchableOpacity onPress={() => router.push('/apple-health')} activeOpacity={0.85}
                accessibilityRole="button" accessibilityLabel="Apple Health"
                style={[s.sourceRow, { ...gs.card }]}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: ACCENT + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="heart.fill" size={16} color={ACCENT} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.bold }}>Apple Health</Text>
                  <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
                    {lang === 'uk' ? 'Кроки, калорії, сон і пульс із HealthKit' : 'Steps, calories, sleep and pulse from HealthKit'}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={13} color={c.sub} />
              </TouchableOpacity>
            ) : (
              <Text style={{ color: c.sub, fontSize: 12, marginTop: 10 }}>
                {lang === 'uk'
                  ? 'На цьому пристрої автоматичних джерел немає — показники вводяться вручну.'
                  : 'No automatic sources on this device — metrics are entered manually.'}
              </Text>
            )}
            </>} />

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function PreviewRow({ label, value, color, text, sub }: { label: string; value: string; color: string; text: string; sub: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginRight: 10 }} />
      <Text style={{ color: text, fontSize: 24, lineHeight: 28, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], letterSpacing: -0.48, flex: 1 }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.regular }}>{label}</Text>
    </View>
  );
}

/**
 * Обмеження ПІД ЧАС НАБОРУ — лише зверху.
 *
 * Нижньої межі тут навмисно немає: поле прив'язане до значення профілю, тож
 * застосована на кожен символ нижня межа зробила б «17» недосяжним — після
 * першої «1» поле стрибнуло б на 10 і далі дописувалось би до «101». Нижню
 * межу застосовує clampProfileRanges на blur і перед збереженням, тобто тоді,
 * коли користувач уже закінчив набирати.
 *
 * Порожнє поле дає 0, а не мінімум: інакше стерти введене й почати спочатку
 * неможливо — поле щоразу підставляло б мінімум назад.
 */
function clampInt(text: string, max: number, fallback: number): number {
  const digits = text.replace(/[^0-9]/g, '');
  if (digits === '') return text === '' ? 0 : fallback;
  const n = parseInt(digits, 10);
  if (isNaN(n)) return fallback;
  return Math.min(max, Math.max(0, n));
}

const s = StyleSheet.create({
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  sectionTitle: { fontSize: 16, fontFamily: fontFamily.semibold, marginTop: 6 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, marginTop: 12 },
  label:     { fontSize: 12, fontFamily: fontFamily.medium, marginBottom: 8, marginTop: 18 },
  input:     { fontSize: 20, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'], borderRadius: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 12 },
  segBtn:    { flex: 1, borderRadius: 999, minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  rowBtn:    { flexDirection: 'row', alignItems: 'center', borderRadius: 14, minHeight: 48, paddingHorizontal: 16, paddingVertical: 13 },
  preview:   { borderRadius: 20, padding: 20, marginTop: 24 },
  saveBtn:   { borderRadius: 999, minHeight: 52, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
});
