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
import { cancelById, scheduleDateReminder } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { ACCENT_CAL, getHealthColors } from '@/utils/healthTheme';
import { VACCINES_KEY, Vaccine, genId } from '@/utils/preventionUtils';

export default function VaccinesScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  const [items, setItems] = useState<Vaccine[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [doseNo, setDoseNo] = useState('');
  const [nextDate, setNextDate] = useState('');

  useEffect(() => { loadData<Vaccine[]>(VACCINES_KEY, []).then(d => { setItems(d); setInitialized(true); }); }, []);
  useEffect(() => { if (initialized) saveData(VACCINES_KEY, items); }, [items, initialized]);

  const create = async () => {
    if (!name.trim()) return;
    const id = genId();
    let notifId: string | undefined;
    if (nextDate) {
      const r = await scheduleDateReminder(`vaccine_${id}`, new Date(nextDate + 'T09:00:00'), `💉 ${name.trim()}`, tr.vaccines);
      notifId = r ?? undefined;
    }
    const item: Vaccine = {
      id, name: name.trim(), date: new Date(date).toISOString(),
      doseNo: doseNo ? parseInt(doseNo, 10) : undefined,
      nextDate: nextDate ? new Date(nextDate).toISOString() : undefined,
      notifId, createdAt: new Date().toISOString(),
    };
    setItems(p => [item, ...p].sort((a, b) => +new Date(b.date) - +new Date(a.date)));
    setName(''); setDate(new Date().toISOString().slice(0, 10)); setDoseNo(''); setNextDate(''); setAdd(false);
  };

  const remove = async (item: Vaccine) => { await cancelById(item.notifId); setItems(p => p.filter(x => x.id !== item.id)); };
  const fmtD = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="xmark" size={18} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.vaccines}</Text>
          <TouchableOpacity onPress={() => setAdd(true)} style={[s.addBtn, { backgroundColor: ACCENT_CAL }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {items.length === 0 ? <Empty c={c} text={tr.vaccinesSub} icon="syringe" /> : items.map(item => (
            <BlurView key={item.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ACCENT_CAL + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name="syringe" size={17} color={ACCENT_CAL} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{item.name}{item.doseNo ? ` · №${item.doseNo}` : ''}</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{fmtD(item.date)}</Text>
                </View>
                <TouchableOpacity onPress={() => remove(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
                  <IconSymbol name="trash" size={15} color={c.sub} />
                </TouchableOpacity>
              </View>
              {item.nextDate ? (
                <View style={[s.next, { borderColor: ACCENT_CAL + '40', backgroundColor: ACCENT_CAL + '12' }]}>
                  <IconSymbol name="bell.fill" size={11} color={ACCENT_CAL} />
                  <Text style={{ color: ACCENT_CAL, fontSize: 11, fontWeight: '700', marginLeft: 6 }}>{tr.upcoming}: {fmtD(item.nextDate)}</Text>
                </View>
              ) : null}
            </BlurView>
          ))}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={add} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable style={s.overlay} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap}>
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addVaccine}</Text>
                <Field label={tr.title} value={name} onChange={setName} placeholder="Грип / COVID-19…" autoFocus c={c} />
                <Field label={tr.date} value={date} onChange={setDate} placeholder="2026-06-29" c={c} />
                <Field label={tr.doseNo} value={doseNo} onChange={setDoseNo} placeholder="1" keyboardType="number-pad" c={c} />
                <Field label={tr.nextDate} value={nextDate} onChange={setNextDate} placeholder="2027-06-29" c={c} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                  <TouchableOpacity onPress={() => setAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                    <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={create} style={[s.btn, { flex: 2, backgroundColor: ACCENT_CAL }]}>
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
  next:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
