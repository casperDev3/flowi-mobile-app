import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Field } from '@/components/health/FormBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { cancelMedReminders, scheduleMedReminders } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { Events, track } from '@/utils/analytics';
import { HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import { MEDS_KEY, Medication, genId, medAdherence, medTakenToday, parseTimes } from '@/utils/preventionUtils';

const ACC = HEALTH_ACCENTS.prevention;

export default function MedsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_meds');

  const [meds, setMeds] = useState<Medication[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState('08:00');

  useEffect(() => { loadData<Medication[]>(MEDS_KEY, []).then(d => { setMeds(d); setInitialized(true); }); }, []);
  useEffect(() => { if (initialized) saveData(MEDS_KEY, meds); }, [meds, initialized]);

  const create = async () => {
    const t = parseTimes(times);
    if (!name.trim() || !t.length) return;
    const id = genId();
    const notifIds = await scheduleMedReminders(id, t, `💊 ${name.trim()}`, tr.takeNow);
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

  const remove = async (m: Medication) => { await cancelMedReminders(m.notifIds); setMeds(p => p.filter(x => x.id !== m.id)); };

  const toggleActive = async (m: Medication) => {
    if (m.active) {
      await cancelMedReminders(m.notifIds);
      setMeds(p => p.map(x => x.id === m.id ? { ...x, active: false, notifIds: [] } : x));
    } else {
      const ids = await scheduleMedReminders(m.id, m.times, `💊 ${m.name}`, tr.takeNow);
      setMeds(p => p.map(x => x.id === m.id ? { ...x, active: true, notifIds: ids } : x));
    }
  };

  return (
    <View style={{ flex: 1 }}>
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

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {meds.length === 0 ? (
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
          <Pressable style={s.overlay} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addMed}</Text>
                <Field label={tr.medName} value={name} onChange={setName} placeholder="Вітамін D" autoFocus c={c} />
                <Field label={tr.medDose} value={dose} onChange={setDose} placeholder="2000 МО" c={c} />
                <Field label={tr.medTimes} value={times} onChange={setTimes} placeholder="08:00, 20:00" c={c} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                  <TouchableOpacity onPress={() => setAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={create} style={[s.btn, { flex: 2, backgroundColor: ACC }]}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
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
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  input:     { fontSize: 15, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
