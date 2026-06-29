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
import { cancelDailyReminder, scheduleDailyReminder } from '@/store/notifications';
import { loadData, saveData } from '@/store/storage';
import { useI18n } from '@/store/i18n';
import { HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import { HABITS_KEY, Habit, genId, habitDoneToday, habitStreak } from '@/utils/preventionUtils';

const ICONS = ['drop.fill', 'bolt.fill', 'figure.walk', 'moon.fill', 'pills.fill', 'heart.fill'];
const COLORS = [HEALTH_ACCENTS.water, HEALTH_ACCENTS.prot, HEALTH_ACCENTS.steps, HEALTH_ACCENTS.sleep, HEALTH_ACCENTS.cal, HEALTH_ACCENTS.pulse];
const ACC = HEALTH_ACCENTS.prot;

export default function HabitsScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_habits');

  const [habits, setHabits] = useState<Habit[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [add, setAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [remAt, setRemAt] = useState('');

  useEffect(() => { loadData<Habit[]>(HABITS_KEY, []).then(d => { setHabits(d); setInitialized(true); }); }, []);
  useEffect(() => { if (initialized) saveData(HABITS_KEY, habits); }, [habits, initialized]);

  const create = async () => {
    if (!title.trim()) return;
    const id = genId();
    let notifId: string | undefined;
    const m = remAt.match(/^(\d{1,2}):(\d{2})$/);
    if (m) { await scheduleDailyReminder(`habit_${id}`, parseInt(m[1], 10), parseInt(m[2], 10), title.trim(), tr.habits); notifId = `habit_${id}`; }
    const habit: Habit = { id, title: title.trim(), icon, color, log: [], reminderAt: m ? remAt : undefined, notifId, createdAt: new Date().toISOString() };
    setHabits(p => [habit, ...p]);
    setTitle(''); setIcon(ICONS[0]); setColor(COLORS[0]); setRemAt(''); setAdd(false);
  };

  const toggle = (h: Habit) => {
    const today = new Date().toDateString();
    setHabits(p => p.map(x => {
      if (x.id !== h.id) return x;
      const has = x.log.some(l => new Date(l).toDateString() === today);
      return { ...x, log: has ? x.log.filter(l => new Date(l).toDateString() !== today) : [...x.log, new Date().toISOString()] };
    }));
  };

  const remove = async (h: Habit) => {
    if (h.notifId) await cancelDailyReminder(`habit_${h.id}`);
    setHabits(p => p.filter(x => x.id !== h.id));
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="xmark" size={18} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.habits}</Text>
          <TouchableOpacity onPress={() => setAdd(true)} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: ACC }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          {habits.length === 0 ? <Empty c={c} text={tr.habitsSub} icon="checklist" /> : habits.map(h => {
            const done = habitDoneToday(h); const streak = habitStreak(h);
            return (
              <BlurView key={h.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: h.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name={h.icon as any} size={17} color={h.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{h.title}</Text>
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>
                    🔥 {tr.streak}: {streak} {tr.daysStreak}{h.reminderAt ? ` · ⏰ ${h.reminderAt}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => remove(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4, marginRight: 4 }}>
                  <IconSymbol name="trash" size={15} color={c.sub} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => toggle(h)}
                  style={[s.check, { borderColor: done ? h.color : c.border, backgroundColor: done ? h.color : 'transparent' }]}>
                  {done && <IconSymbol name="checkmark" size={18} color="#fff" />}
                </TouchableOpacity>
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
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addHabit}</Text>
                <Field label={tr.title} value={title} onChange={setTitle} placeholder="Випити вітаміни" autoFocus c={c} />
                <Text style={[s.label, { color: c.sub }]}>ІКОНКА</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ICONS.map(ic => (
                    <TouchableOpacity key={ic} onPress={() => setIcon(ic)}
                      style={[s.pick, { borderColor: icon === ic ? color : c.border, backgroundColor: icon === ic ? color + '20' : c.dim }]}>
                      <IconSymbol name={ic as any} size={17} color={icon === ic ? color : c.sub} />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.label, { color: c.sub }]}>КОЛІР</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {COLORS.map(col => (
                    <TouchableOpacity key={col} onPress={() => setColor(col)}
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: col, borderWidth: color === col ? 3 : 0, borderColor: c.text }} />
                  ))}
                </View>
                <Field label={`${tr.reminders} (08:00)`} value={remAt} onChange={setRemAt} placeholder="08:00" c={c} />
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
  card:      { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 10 },
  check:     { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pick:      { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
