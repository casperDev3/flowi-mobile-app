/**
 * components/health/tabs/BodyTab.tsx — вкладка «Тіло і вітальні».
 *
 * Зводить два колишні екрани: `app/health-vitals.tsx` (вага, ІМТ, пульс) і
 * `app/health-body.tsx` (обводи, % жиру, співвідношення, нагадування). Вони
 * розʼїхались історично, хоча міряються за одну сесію біля дзеркала: людина
 * стає на ваги, бере сантиметр і записує все підряд. Тепер це один список, а
 * динаміка ваги в ньому ОДНА — раніше той самий графік малювався на обох
 * екранах, і різниця між ними виглядала як різні дані.
 *
 * Обчислення лишились у healthUtils: тут немає жодної власної формули, бо
 * WHtR, порахований по-своєму, розійшовся б із вебом мовчки.
 */
import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { BodyEntrySheet, BodyRecord } from '@/components/health/BodyEntrySheet';
import { SectionHeader } from '@/components/health/HealthBits';
import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { LoadErrorNotice, ReminderBlockedNotice } from '@/components/health/HealthNotices';
import { MetricTrend } from '@/components/health/MetricTrend';
import { MiniBarChart } from '@/components/health/MiniBarChart';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import {
  ACCENT, ACCENT_MOOD, ACCENT_PROT, ACCENT_PULSE, ACCENT_STEPS, ACCENT_WEIGHT, ModalKey, getHealthColors,
} from '@/utils/healthTheme';
import {
  DEFAULT_PROFILE, EntryType, MEASUREMENT_TYPES, MeasurementType,
  estimateBodyFatNavy, latestValue, leanMass, waistToHeightRatio, waistToHipRatio, whrHealthy, whtrCategory,
} from '@/utils/healthUtils';

const labelKey = {
  waist: 'mWaist', hips: 'mHips', chest: 'mChest', thigh: 'mThigh',
  biceps: 'mBiceps', neck: 'mNeck', calf: 'mCalf', bodyfat: 'mBodyfat',
} as const satisfies Record<MeasurementType, keyof Translations>;

export function BodyTab({ h }: HealthTabProps) {
  const contentWidth = useContentWidth();
  const tabBarInset = useTabBarInset();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const c = getHealthColors(isDark);

  const { latestWeight, bmi, prevWeight, today } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);
  const [sheet, setSheet] = useState(false);
  // ERR-10: відмова планувальника перестала бути невидимою.
  const [reminderBlocked, setReminderBlocked] = useState(false);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };
  const labels = h.last7.map(d => tr.weekdays[d.getDay() === 0 ? 6 : d.getDay() - 1]);

  const bmiCat = bmi ? h.bmiCategory(bmi) : null;
  const bmiColor = bmiCat === 'normal' ? ACCENT : bmiCat === 'underweight' ? ACCENT_STEPS : bmiCat === 'overweight' ? ACCENT_MOOD : ACCENT_PULSE;
  const bmiLbl = bmiCat === 'underweight' ? tr.bmiUnderweight : bmiCat === 'normal' ? tr.bmiNormal : bmiCat === 'overweight' ? tr.bmiOverweight : tr.bmiObese;

  const pulse = today.pulse;
  const zoneColor = pulse ? (pulse < 60 ? ACCENT_STEPS : pulse <= 100 ? ACCENT : ACCENT_PULSE) : c.sub;
  const zoneLabel = pulse ? (pulse < 60 ? tr.bradycardia : pulse <= 100 ? tr.normal : tr.tachycardia) : '';
  // Це СЕРЕДНІЙ пульс за добу; пульс спокою (pulse_rest) — на вкладці «Сон».
  const pulseNote = tr.hautoPulseAvgNote;

  const sex = h.profile?.sex ?? DEFAULT_PROFILE.sex;
  const height = h.profile?.heightCm ?? DEFAULT_PROFILE.heightCm;
  const lv = (t: EntryType) => latestValue(h.entries, t);

  const waist = lv('waist'); const hips = lv('hips'); const neck = lv('neck');
  const whtr = waistToHeightRatio(waist, height);
  const whtrCat = whtr ? whtrCategory(whtr) : null;
  const whtrColor = whtrCat === 'healthy' ? ACCENT : whtrCat === 'increased' ? ACCENT_MOOD : ACCENT_PULSE;
  const whtrLbl = whtrCat === 'healthy' ? tr.whtrHealthy : whtrCat === 'increased' ? tr.whtrIncreased : tr.whtrHigh;
  const whr = waistToHipRatio(waist, hips);
  const bodyfatManual = lv('bodyfat');
  const bodyfatEst = estimateBodyFatNavy(sex, height, neck, waist, sex === 'female' ? hips : null);
  const bodyfat = bodyfatManual ?? bodyfatEst;
  const lean = latestWeight && bodyfat ? leanMass(latestWeight, bodyfat) : null;

  const defaults: Partial<Record<EntryType, number | null>> = { weight: latestWeight };
  MEASUREMENT_TYPES.forEach(t => { defaults[t] = lv(t); });

  const onBodySubmit = (records: BodyRecord[]) => records.forEach(r => h.addEntry({ type: r.type, value: r.value }));

  const series = (t: EntryType) => h.entries.filter(e => e.type === t).slice(0, 8).reverse().map(e => e.value);
  const unitOf = (t: MeasurementType) => (t === 'bodyfat' ? '%' : 'см');

  return (
    <>
      <ScrollView
        contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: tabBarInset + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT_WEIGHT} />}>

        {/* ERR-01: сховище віддало помилку — це НЕ «записів немає». */}
        {h.loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={() => { void h.retryLoad(); }} />}

        {/* Одноразове прибирання ваги, яку старий синк щодня переклеював на
            «сьогодні» (ВАДА-2): видаляти мовчки не можна — кажемо підсумок. */}
        {h.weightCleanupRemoved != null && h.weightCleanupRemoved > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: ACCENT_WEIGHT + '44', backgroundColor: ACCENT_WEIGHT + '12', padding: 12, marginTop: 8 }}>
            <IconSymbol name="scalemass.fill" size={15} color={ACCENT_WEIGHT} />
            <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', flex: 1, marginLeft: 8 }}>
              {tr.hautoWeightCleanup.replace('{n}', String(h.weightCleanupRemoved))}
            </Text>
            <TouchableOpacity onPress={h.dismissWeightCleanup} accessibilityRole="button" accessibilityLabel={tr.close}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <IconSymbol name="xmark" size={14} color={c.sub} />
            </TouchableOpacity>
          </View>
        )}

        {/* Вага */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <SectionHeader title={tr.weight} icon="scalemass.fill" color={ACCENT_WEIGHT} textColor={c.text} top={8} />
          </View>
          <TouchableOpacity onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel={tr.addBodyEntry}
            style={[s.addBtn, { backgroundColor: ACCENT_WEIGHT }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
          {latestWeight ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{latestWeight} кг</Text>
                {bmi && (
                  <View style={[s.badge, { marginLeft: 10, backgroundColor: bmiColor + '20', borderColor: bmiColor + '40' }]}>
                    <Text style={{ color: bmiColor, fontSize: 10, fontWeight: '700' }}>{tr.bmi} {bmi.toFixed(1)} · {bmiLbl}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => setModal('weight')} accessibilityRole="button" accessibilityLabel={tr.recordWeight}
                  style={[s.iconBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                  <IconSymbol name="plus" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>
              {prevWeight && latestWeight !== prevWeight && (() => {
                const delta = latestWeight - prevWeight; const up = delta > 0;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <IconSymbol name={up ? 'arrow.up.right' : 'arrow.down.right'} size={11} color={up ? ACCENT_PULSE : ACCENT} />
                    <Text style={{ color: up ? ACCENT_PULSE : ACCENT, fontSize: 11, fontWeight: '700', marginLeft: 2 }}>
                      {up ? '+' : ''}{delta.toFixed(1)} кг/тиж
                    </Text>
                  </View>
                );
              })()}
              <MiniBarChart values={h.charts.weight} color={ACCENT_WEIGHT} height={40} />
              <View style={{ flexDirection: 'row', marginTop: 3 }}>
                {labels.map((l, i) => <Text key={i} style={{ flex: 1, textAlign: 'center', color: c.sub, fontSize: 8, fontWeight: '600' }}>{l}</Text>)}
              </View>
            </>
          ) : (
            <TouchableOpacity onPress={() => setModal('weight')} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name="scalemass.fill" size={16} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 8, flex: 1 }}>{tr.recordWeight}</Text>
              <IconSymbol name="plus" size={14} color={c.sub} />
            </TouchableOpacity>
          )}
        </BlurView>

        {/* Динаміка ваги — одна на вкладку, а не по одній на кожен колишній екран */}
        <View style={{ marginTop: 14 }}>
          <MetricTrend entries={h.entries} type="weight" agg="avg" color={ACCENT_WEIGHT}
            format={v => `${v.toFixed(1)} кг`} isDark={isDark} c={c} tr={tr} />
        </View>

        {/* Пульс */}
        <SectionHeader title={tr.pulse} icon="waveform.path.ecg" color={ACCENT_PULSE} textColor={c.text} />
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
          {pulse ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }}>{pulse}</Text>
                <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>{lang === 'uk' ? 'уд/хв' : 'bpm'}</Text>
                <View style={{ flex: 1 }} />
                <View style={[s.badge, { backgroundColor: zoneColor + '20', borderColor: zoneColor + '40' }]}>
                  <Text style={{ color: zoneColor, fontSize: 11, fontWeight: '700' }}>{zoneLabel}</Text>
                </View>
                <TouchableOpacity onPress={() => setModal('pulse')} accessibilityRole="button" accessibilityLabel={tr.recordPulse}
                  style={[s.iconBtn, { borderColor: c.border, backgroundColor: c.dim, marginLeft: 8 }]}>
                  <IconSymbol name="plus" size={14} color={c.sub} />
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {[
                  { range: '< 60',   color: ACCENT_STEPS, active: pulse < 60,                   flex: 1 },
                  { range: '60–100', color: ACCENT,       active: pulse >= 60 && pulse <= 100,  flex: 1.4 },
                  { range: '> 100',  color: ACCENT_PULSE, active: pulse > 100,                  flex: 1 },
                ].map((z, i) => (
                  <View key={i} style={{ flex: z.flex, alignItems: 'center' }}>
                    <View style={{ height: 5, width: '100%', borderRadius: 3, backgroundColor: z.active ? z.color : z.color + '28' }} />
                    <Text style={{ color: z.active ? z.color : c.sub, fontSize: 9, fontWeight: z.active ? '700' : '500', marginTop: 4 }}>{z.range}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 8 }}>{pulseNote}</Text>
            </>
          ) : (
            <TouchableOpacity onPress={() => setModal('pulse')} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name="waveform.path.ecg" size={18} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.recordPulse}</Text>
              <IconSymbol name="plus" size={14} color={c.sub} />
            </TouchableOpacity>
          )}
        </BlurView>

        {/* Склад тіла */}
        <SectionHeader title={tr.summary} icon="ruler.fill" color={ACCENT_WEIGHT} textColor={c.text} />
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Stat label={bodyfatManual ? tr.mBodyfat : tr.bodyfatEst} value={bodyfat != null ? `${bodyfat.toFixed(1)}%` : '—'} color={ACCENT_MOOD} sub={c.sub} />
            <Stat label={tr.leanMass} value={lean ? `${lean.toFixed(1)} кг` : '—'} color={ACCENT} sub={c.sub} />
            <Stat label={tr.bmi} value={bmi ? bmi.toFixed(1) : '—'} color={ACCENT_PROT} sub={c.sub} />
            <Stat label={tr.whtr} value={whtr ? whtr.toFixed(2) : '—'} color={whtr ? whtrColor : c.sub} sub={c.sub}
              badge={whtr ? whtrLbl : undefined} />
            <Stat label={tr.whr} value={whr ? whr.toFixed(2) : '—'} color={whr ? (whrHealthy(whr, sex) ? ACCENT : ACCENT_PULSE) : c.sub} sub={c.sub} />
          </View>
        </BlurView>

        {/* Виміри */}
        <SectionHeader title={tr.bodyMeasurements} icon="figure.arms.open" color={ACCENT_WEIGHT} textColor={c.text} />
        {MEASUREMENT_TYPES.every(t => lv(t) == null) && latestWeight == null ? (
          <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
            <TouchableOpacity onPress={() => setSheet(true)} style={[s.empty, { borderColor: c.border, backgroundColor: c.dim }]}>
              <IconSymbol name="ruler.fill" size={18} color={c.sub} />
              <Text style={{ color: c.sub, fontSize: 13, fontWeight: '600', marginLeft: 9, flex: 1 }}>{tr.noMeasurements}</Text>
              <IconSymbol name="plus" size={14} color={c.sub} />
            </TouchableOpacity>
          </BlurView>
        ) : (
          <View style={{ gap: 8 }}>
            {MEASUREMENT_TYPES.filter(t => lv(t) != null).map(t => {
              const ser = series(t);
              const delta = ser.length >= 2 ? ser[ser.length - 1] - ser[0] : null;
              return (
                <BlurView key={t} intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={[s.row, { borderColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{tr[labelKey[t]]}</Text>
                    <Text style={{ color: c.text, fontSize: 20, fontWeight: '800', marginTop: 1 }}>
                      {lv(t)}<Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}> {unitOf(t)}</Text>
                    </Text>
                    {delta != null && delta !== 0 && (
                      <Text style={{ color: delta < 0 ? ACCENT : ACCENT_MOOD, fontSize: 11, fontWeight: '700', marginTop: 1 }}>
                        {delta > 0 ? '+' : ''}{delta.toFixed(1)} {unitOf(t)}
                      </Text>
                    )}
                  </View>
                  {ser.length >= 2 && <View style={{ width: 90 }}><MiniBarChart values={ser} color={ACCENT_WEIGHT} height={40} /></View>}
                </BlurView>
              );
            })}
          </View>
        )}

        {/* Нагадування */}
        <SectionHeader title={tr.reminders} icon="bell.fill" color={ACCENT_MOOD} textColor={c.text} />
        <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, paddingVertical: 4 }]}>
          <View style={s.remRow}>
            <IconSymbol name="scalemass.fill" size={16} color={ACCENT_WEIGHT} />
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 }}>{tr.weightReminder}</Text>
            <Switch
              value={h.reminders.weight}
              disabled={!h.remindersLoaded || h.reminderBusy !== null}
              accessibilityLabel={tr.weightReminder}
              accessibilityState={{ checked: h.reminders.weight, disabled: !h.remindersLoaded || h.reminderBusy !== null }}
              onValueChange={v => { void h.setReminder('weight', v, tr.weight, tr.weightReminderBody).then(ok => setReminderBlocked(v && !ok)); }}
              trackColor={{ true: ACCENT_WEIGHT }} />
          </View>
          <View style={[s.remRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
            <IconSymbol name="ruler.fill" size={16} color={ACCENT_WEIGHT} />
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1, marginLeft: 10 }}>{tr.measurementsReminder}</Text>
            <Switch
              value={h.reminders.measurements}
              disabled={!h.remindersLoaded || h.reminderBusy !== null}
              accessibilityLabel={tr.measurementsReminder}
              accessibilityState={{ checked: h.reminders.measurements, disabled: !h.remindersLoaded || h.reminderBusy !== null }}
              onValueChange={v => { void h.setReminder('measurements', v, tr.bodyMeasurements, tr.measurementsReminderBody).then(ok => setReminderBlocked(v && !ok)); }}
              trackColor={{ true: ACCENT_WEIGHT }} />
          </View>
          {reminderBlocked && (
            <ReminderBlockedNotice lang={lang} c={c} isDark={isDark}
              onOpenSettings={() => { void Linking.openSettings(); }}
              onDismiss={() => setReminderBlocked(false)} />
          )}
        </BlurView>
      </ScrollView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
      <BodyEntrySheet visible={sheet} onClose={() => setSheet(false)} onSubmit={onBodySubmit} defaults={defaults} isDark={isDark} tr={tr} />
    </>
  );
}

function Stat({ label, value, color, sub, badge }: {
  label: string; value: string; color: string; sub: string; badge?: string;
}) {
  return (
    <View style={{ width: '33.3%', paddingVertical: 6 }}>
      <Text style={{ color, fontSize: 17, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>{label}</Text>
      {badge && <Text style={{ color, fontSize: 9, fontWeight: '700', marginTop: 1 }}>{badge}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  addBtn:  { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card:    { borderRadius: 18, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 2 },
  row:     { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  badge:   { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  empty:   { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 13 },
  remRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
});
