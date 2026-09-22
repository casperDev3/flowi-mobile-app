import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Field } from '@/components/health/FormBits';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { cancelDailyReminder, dailyReminderId, scheduleDailyReminder } from '@/store/notifications';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import { LoadErrorNotice, ReminderBlockedNotice, useSheetScreenMinHeight } from '@/components/health/HealthNotices';
import { HEALTH_ACCENTS, getHealthColors } from '@/utils/healthTheme';
import { HABITS_KEY, Habit, genId, habitDoneToday, habitStreak } from '@/utils/preventionUtils';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';

// Типізовано: раніше це був string[], і назва без відповідника в маппінгу
// мовчки малювала порожнє місце на Android.
const ICONS: IconSymbolName[] = ['drop.fill', 'bolt.fill', 'figure.walk', 'moon.fill', 'pills.fill', 'heart.fill'];
const COLORS = [HEALTH_ACCENTS.water, HEALTH_ACCENTS.prot, HEALTH_ACCENTS.steps, HEALTH_ACCENTS.sleep, HEALTH_ACCENTS.cal, HEALTH_ACCENTS.pulse];
const ACC = HEALTH_ACCENTS.prot;

export default function HabitsScreen() {
  const contentWidth = useContentWidth();
  const sheetSurface = useSheetSurface();
  const sheetScreenMinHeight = useSheetScreenMinHeight();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const c = getHealthColors(isDark);
  useScreenView('health_habits');

  const [habits, setHabits] = useState<Habit[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ERR-01: «не прочиталось» ≠ «порожньо». Поки читання провалене,
  // initialized лишається false — це і є заборона автозапису поверх даних.
  const [loadFailed, setLoadFailed] = useState(false);
  // ERR-10: планувальник відмовив — звичка збережена БЕЗ нагадування.
  const [reminderBlocked, setReminderBlocked] = useState(false);
  const [add, setAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [remAt, setRemAt] = useState('');
  const canCreate = title.trim().length > 0;

  useEffect(() => {
    loadDataResult<Habit[]>(HABITS_KEY, []).then(r => {
      if (r.ok) { setHabits(r.value); setInitialized(true); }
      else setLoadFailed(true);
    });
  }, []);

  const retryLoad = async () => {
    const r = await retryStorageRead<Habit[]>(HABITS_KEY, []);
    if (r.ok) { setHabits(r.value); setLoadFailed(false); setInitialized(true); }
  };

  useEffect(() => {
    if (!initialized) return;
    // saveSynced тепер може відхилитись (StorageWriteBlockedError) — без
    // .catch RN лаявся б Possible Unhandled Promise Rejection.
    void saveSynced(HABITS_KEY, habits).catch(e => { if (__DEV__) console.warn('[habits] save failed:', e); });
  }, [habits, initialized]);

  const create = async () => {
    if (!title.trim()) return;
    const id = genId();
    let notifId: string | undefined;
    const m = remAt.match(/^(\d{1,2}):(\d{2})$/);
    // ERR-10: результат планувальника більше не відкидається. scheduleDailyReminder
    // повертає false, коли сповіщення вимкнені глобально або ОС не дала дозволу;
    // до цього годину писали в запис усе одно, і застосунок стверджував, що
    // нагадування є, хоча в ОС не було заплановано нічого.
    // ERR-10 (поправка з пристрою): id нотифікації — детермінований і той
    // самий, що будує планувальник (dailyReminderId → `daily_habit_<id>`),
    // інакше звірка зі списком запланованих в ОС шукає неіснуючий ключ.
    let scheduled = false;
    if (m) {
      scheduled = await scheduleDailyReminder(`habit_${id}`, parseInt(m[1], 10), parseInt(m[2], 10), title.trim(), tr.habits);
      if (scheduled) notifId = dailyReminderId(`habit_${id}`);
    }
    setReminderBlocked(Boolean(m) && !scheduled);
    const habit: Habit = { id, title: title.trim(), icon, color, log: [], reminderAt: scheduled ? remAt : undefined, notifId, createdAt: new Date().toISOString() };
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
    // Скасовуємо завжди, а не лише коли notifId є: після синку поле локальне
    // й може не приїхати з іншого пристрою, а нотифікація в ОС — стоїть.
    await cancelDailyReminder(`habit_${h.id}`);
    setHabits(p => p.filter(x => x.id !== h.id));
  };

  return (
    // NAT-14: екран поданий як formSheet, де корінь не отримує визначеної
    // висоти — без minHeight `flex: 1` схлопувався до висоти вмісту, і нижні
    // дві третини «аркуша» лишались прозорими.
    <View style={{ flex: 1, minHeight: sheetScreenMinHeight }}>
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

        <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
          {loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={retryLoad} />}
          {reminderBlocked && (
            <ReminderBlockedNotice lang={lang} c={c} isDark={isDark}
              onOpenSettings={() => { void Linking.openSettings(); }}
              onDismiss={() => setReminderBlocked(false)} />
          )}
          {loadFailed ? null : habits.length === 0 ? <Empty c={c} text={tr.habitsSub} icon="checklist" /> : habits.map(h => {
            const done = habitDoneToday(h); const streak = habitStreak(h);
            return (
              <BlurView key={h.id} intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: h.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <IconSymbol name={h.icon} size={17} color={h.color} />
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
          <Pressable accessible={false} style={s.overlay} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addHabit}</Text>
                <Field label={tr.title} value={title} onChange={setTitle} placeholder="Випити вітаміни" autoFocus c={c} />
                <Text style={[s.label, { color: c.sub }]}>ІКОНКА</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ICONS.map(ic => (
                    <TouchableOpacity key={ic} onPress={() => setIcon(ic)}
                      style={[s.pick, { borderColor: icon === ic ? color : c.border, backgroundColor: icon === ic ? color + '20' : c.dim }]}>
                      <IconSymbol name={ic} size={17} color={icon === ic ? color : c.sub} />
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
  card:      { borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: 10 },
  check:     { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  pick:      { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток тут не працював
  // (батько має height:auto), і кнопка «Зберегти» лишалась за краєм вікна.
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  label:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
