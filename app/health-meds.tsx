import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Field } from '@/components/health/FormBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { cancelMedReminders, scheduleMedReminders } from '@/store/notifications';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { Events, track } from '@/utils/analytics';
import { HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import { MEDS_KEY, Medication, genId, medAdherence, medTakenToday, parseTimes } from '@/utils/preventionUtils';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { LoadErrorNotice, ReminderBlockedNotice, useSheetScreenMinHeight } from '@/components/health/HealthNotices';

const ACC = HEALTH_ACCENTS.prevention;

export default function MedsScreen() {
  const contentWidth = useContentWidth();
  const sheetSurface = useSheetSurface();
  const sheetScreenMinHeight = useSheetScreenMinHeight();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_meds');

  const [meds, setMeds] = useState<Medication[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ERR-01: поки читання провалене, initialized лишається false — автозапис
  // порожнього масиву поверх нечитаних даних заборонено.
  const [loadFailed, setLoadFailed] = useState(false);
  // ERR-10: scheduleMedReminders віддав [] — ліки збережено БЕЗ нагадувань.
  const [reminderBlocked, setReminderBlocked] = useState(false);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState('08:00');
  const canCreate = name.trim().length > 0 && parseTimes(times).length > 0;

  useEffect(() => {
    loadDataResult<Medication[]>(MEDS_KEY, []).then(r => {
      if (r.ok) { setMeds(r.value); setInitialized(true); }
      else setLoadFailed(true);
    });
  }, []);

  const retryLoad = async () => {
    const r = await retryStorageRead<Medication[]>(MEDS_KEY, []);
    if (r.ok) { setMeds(r.value); setLoadFailed(false); setInitialized(true); }
  };

  useEffect(() => {
    if (!initialized) return;
    void saveSynced(MEDS_KEY, meds).catch(e => { if (__DEV__) console.warn('[meds] save failed:', e); });
  }, [meds, initialized]);

  const create = async () => {
    const t = parseTimes(times);
    if (!name.trim() || !t.length) return;
    const id = genId();
    // ERR-10: порожній масив — це відмова планувальника (вимкнені сповіщення
    // або не дано дозвіл), а не «нагадувань не просили». Раніше він мовчки
    // лягав у запис, і ліки виглядали як такі, що дзвонитимуть о 08:00.
    const notifIds = await scheduleMedReminders(id, t, `💊 ${name.trim()}`, tr.takeNow);
    setReminderBlocked(notifIds.length === 0);
    const med: Medication = {
      id, name: name.trim(), dose: dose.trim() || undefined, times: t,
      startDate: new Date().toISOString(), active: true, log: [], notifIds, createdAt: new Date().toISOString(),
    };
    setMeds(p => [med, ...p]);
    track(Events.PreventionReminderSet, { times: t.length });
    setName(''); setDose(''); setTimes('08:00'); setAdd(false);
  };

  const take = (id: string) =>
    setMeds(p => p.map(m => m.id === id ? { ...m, log: [...m.log, { date: new Date().toISOString(), takenAt: new Date().toISOString() }] } : m));

  // Скасовуємо за ДЕТЕРМІНОВАНИМИ id, а не лише за m.notifIds: поле локальне
  // для пристрою і після синку з іншого пристрою його може не бути взагалі,
  // тоді як нотифікація в ОС стоїть і далі дзвонить (DI-05).
  const medNotifIds = (m: Medication) => (m.notifIds?.length ? m.notifIds : m.times.map((_, i) => `med_${m.id}_${i}`));

  const remove = async (m: Medication) => { await cancelMedReminders(medNotifIds(m)); setMeds(p => p.filter(x => x.id !== m.id)); };

  const toggleActive = async (m: Medication) => {
    if (m.active) {
      await cancelMedReminders(medNotifIds(m));
      setMeds(p => p.map(x => x.id === m.id ? { ...x, active: false, notifIds: [] } : x));
    } else {
      const ids = await scheduleMedReminders(m.id, m.times, `💊 ${m.name}`, tr.takeNow);
      // ERR-10: «активне» без жодного запланованого нагадування — обіцянка,
      // якої застосунок не виконає; кажемо це вголос.
      setReminderBlocked(ids.length === 0);
      setMeds(p => p.map(x => x.id === m.id ? { ...x, active: true, notifIds: ids } : x));
    }
  };

  return (
    // NAT-14: formSheet не дає кореню визначеної висоти — без minHeight
    // `flex: 1` схлопується до висоти вмісту, і низ аркуша лишається прозорим.
    <View style={{ flex: 1, minHeight: sheetScreenMinHeight }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="xmark" size={18} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.meds}</Text>
          <TouchableOpacity onPress={() => setAdd(true)} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: ACC }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
          {loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={retryLoad} />}
          {reminderBlocked && (
            <ReminderBlockedNotice lang={lang} c={c} isDark={isDark}
              onOpenSettings={() => { void Linking.openSettings(); }}
              onDismiss={() => setReminderBlocked(false)} />
          )}
          {loadFailed ? null : meds.length === 0 ? (
            <Empty c={c} text={tr.medsSub} />
          ) : meds.map(m => {
            const taken = medTakenToday(m); const total = m.times.length; const done = taken >= total;
            return (
              <BlurView key={m.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border, opacity: m.active ? 1 : 0.5 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ACC + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <IconSymbol name="pills.fill" size={18} color={ACC} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{m.name}</Text>
                    <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>
                      {m.dose ? `${m.dose} · ` : ''}{m.times.join(', ')} · {tr.adherence} {medAdherence(m)}%
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => remove(m)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                    <IconSymbol name="trash" size={15} color={c.sub} />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
                  <Text style={{ color: c.sub, fontSize: 12, flex: 1 }}>{tr.taken}: {taken}/{total}</Text>
                  <TouchableOpacity onPress={() => toggleActive(m)} style={[s.smallBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{m.active ? tr.medActive : tr.finished}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => take(m.id)} disabled={done || !m.active}
                    style={[s.takeBtn, { backgroundColor: done ? c.dim : ACC, opacity: m.active ? 1 : 0.6 }]}>
                    <IconSymbol name={done ? 'checkmark' : 'plus'} size={14} color={done ? ACC : '#fff'} />
                    <Text style={{ color: done ? ACC : '#fff', fontSize: 12, fontWeight: '700', marginLeft: 4 }}>{done ? tr.taken : tr.takeNow}</Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={add} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={s.overlay} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addMed}</Text>
                <Field label={tr.medName} value={name} onChange={setName} placeholder="Вітамін D" autoFocus c={c} />
                <Field label={tr.medDose} value={dose} onChange={setDose} placeholder="2000 МО" c={c} />
                <Field label={tr.medTimes} value={times} onChange={setTimes} placeholder="08:00, 20:00" c={c} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                  <TouchableOpacity onPress={() => setAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={!canCreate} accessibilityState={{ disabled: !canCreate }} onPress={create} style={[s.btn, { flex: 2, backgroundColor: canCreate ? ACC : c.dim }]}>
                    <Text style={{ color: canCreate ? '#fff' : c.sub, fontWeight: '700' }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </BlurView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:     { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  addBtn:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card:      { borderRadius: 16, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 10 },
  smallBtn:  { borderRadius: 9, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  takeBtn:   { flexDirection: 'row', alignItems: 'center', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 6 },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток тут не працював
  // (батько має height:auto), і кнопка «Зберегти» лишалась за краєм вікна.
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
