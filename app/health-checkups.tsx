import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Field, Segment } from '@/components/health/FormBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { cancelById, scheduleDateReminder } from '@/store/notifications';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { ACCENT_PULSE, type HealthColors, getHealthColors } from '@/utils/healthTheme';
import { CHECKUPS_KEY, Checkup, CheckupKind, genId } from '@/utils/preventionUtils';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { localDateInputToIso, localDateKey } from '@/utils/dateUtils';
import { LoadErrorNotice, useSheetScreenMinHeight } from '@/components/health/HealthNotices';

export default function CheckupsScreen() {
  const contentWidth = useContentWidth();
  const sheetSurface = useSheetSurface();
  const sheetScreenMinHeight = useSheetScreenMinHeight();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  // Палітра — у useMemo, інакше React.memo на картці не спрацює:
  // getHealthColors повертає новий обʼєкт на кожен ререндер.
  const c = useMemo(() => getHealthColors(isDark), [isDark]);
  useScreenView('health_checkups');

  const [items, setItems] = useState<Checkup[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ERR-01: провалене читання не вмикає initialized — автозапис порожнього
  // масиву поверх нечитаних даних заборонено.
  const [loadFailed, setLoadFailed] = useState(false);
  const [add, setAdd] = useState(false);
  const [kind, setKind] = useState<CheckupKind>('analysis');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDateKey(new Date()));
  const [result, setResult] = useState('');
  const [nextDate, setNextDate] = useState('');
  const canCreate = title.trim().length > 0;

  useEffect(() => {
    loadDataResult<Checkup[]>(CHECKUPS_KEY, []).then(r => {
      if (r.ok) { setItems(r.value); setInitialized(true); }
      else setLoadFailed(true);
    });
  }, []);

  const retryLoad = async () => {
    const r = await retryStorageRead<Checkup[]>(CHECKUPS_KEY, []);
    if (r.ok) { setItems(r.value); setLoadFailed(false); setInitialized(true); }
  };

  useEffect(() => {
    if (!initialized) return;
    void saveSynced(CHECKUPS_KEY, items).catch(e => { if (__DEV__) console.warn('[checkups] save failed:', e); });
  }, [items, initialized]);


  const create = async () => {
    if (!title.trim()) return;
    // Поле — локальна доба, не UTC (див. localDateInputToIso); нерозбірна
    // дата раніше валила create через RangeError з toISOString.
    const dateIso = localDateInputToIso(date);
    const nextIso = nextDate.trim() ? localDateInputToIso(nextDate) : undefined;
    if (!dateIso || (nextDate.trim() && !nextIso)) return;
    const id = genId();
    let notifId: string | undefined;
    if (nextDate) {
      const dt = new Date(nextDate + 'T09:00:00');
      const r = await scheduleDateReminder(`checkup_${id}`, dt, `🩺 ${title.trim()}`, tr.checkups);
      notifId = r ?? undefined;
    }
    const item: Checkup = {
      id, kind, title: title.trim(), date: dateIso,
      result: result.trim() || undefined, nextDate: nextIso,
      notifId, createdAt: new Date().toISOString(),
    };
    setItems(p => [item, ...p].sort((a, b) => +new Date(b.date) - +new Date(a.date)));
    setKind('analysis'); setTitle(''); setDate(localDateKey(new Date())); setResult(''); setNextDate(''); setAdd(false);
  };

  // Колбек мусить бути стабільним і приймати елемент аргументом — інакше
  // нова стрілка на кожен ререндер зводить React.memo картки нанівець.
  const remove = useCallback(async (item: Checkup) => {
    await cancelById(item.notifId);
    setItems(p => p.filter(x => x.id !== item.id));
  }, []);

  const keyExtractor = useCallback((item: Checkup) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Checkup }) => (
    <CheckupCard item={item} onRemove={remove} isDark={isDark} c={c} tr={tr} locale={locale} />
  ), [remove, isDark, c, tr, locale]);

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
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.checkups}</Text>
          <TouchableOpacity onPress={() => setAdd(true)} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: ACCENT_PULSE }]}>
            <IconSymbol name="plus" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Історія обстежень накопичується роками, тож список
            віртуалізований: ScrollView тримав би в памʼяті всі картки. */}
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={loadFailed ? <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={retryLoad} /> : null}
          ListEmptyComponent={loadFailed ? null : <Empty c={c} text={tr.checkupsSub} icon="cross.case.fill" />}
        />
      </SafeAreaView>

      <Modal visible={add} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={s.overlay} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrap} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'} style={[s.sheet, sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addCheckup}</Text>
                  <Segment label={''} color={ACCENT_PULSE} c={c} value={kind} onChange={setKind}
                    options={[{ key: 'analysis', label: tr.kindAnalysis }, { key: 'visit', label: tr.kindVisit }, { key: 'procedure', label: tr.kindProcedure }]} />
                  <Field label={tr.title} value={title} onChange={setTitle} placeholder="Загальний аналіз крові" autoFocus c={c} />
                  <Field label={tr.date} value={date} onChange={setDate} placeholder="2026-06-29" c={c} />
                  <Field label={tr.result} value={result} onChange={setResult} placeholder="Гемоглобін 145 г/л…" multiline c={c} />
                  <Field label={`${tr.nextDate} (${tr.upcoming.toLowerCase()})`} value={nextDate} onChange={setNextDate} placeholder="2026-12-29" c={c} />
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                    <TouchableOpacity onPress={() => setAdd(false)} style={[s.btn, { flex: 1, backgroundColor: c.dim }]}>
                      <Text style={{ color: c.sub, fontWeight: '600' }}>{tr.cancel}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity disabled={!canCreate} accessibilityState={{ disabled: !canCreate }} onPress={create} style={[s.btn, { flex: 2, backgroundColor: canCreate ? ACCENT_PULSE : c.dim }]}>
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

const CheckupCard = React.memo(function CheckupCard({ item, onRemove, isDark, c, tr, locale }: {
  item: Checkup; onRemove: (item: Checkup) => void; isDark: boolean;
  c: HealthColors; tr: Translations; locale: string;
}) {
  const fmtD = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const kindLabel = item.kind === 'analysis' ? tr.kindAnalysis : item.kind === 'visit' ? tr.kindVisit : tr.kindProcedure;

  return (
    <BlurView intensity={isDark ? 22 : 42} tint={isDark ? 'dark' : 'light'} style={[s.card, { borderColor: c.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: ACCENT_PULSE + '20', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="cross.case.fill" size={17} color={ACCENT_PULSE} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>{item.title}</Text>
          <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{kindLabel} · {fmtD(item.date)}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemove(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
          <IconSymbol name="trash" size={15} color={c.sub} />
        </TouchableOpacity>
      </View>
      {item.result ? <Text style={{ color: c.text, fontSize: 13, marginTop: 8 }}>{item.result}</Text> : null}
      {item.nextDate ? (
        <View style={[s.next, { borderColor: ACCENT_PULSE + '40', backgroundColor: ACCENT_PULSE + '12' }]}>
          <IconSymbol name="bell.fill" size={11} color={ACCENT_PULSE} />
          <Text style={{ color: ACCENT_PULSE, fontSize: 11, fontWeight: '700', marginLeft: 6 }}>{tr.upcoming}: {fmtD(item.nextDate)}</Text>
        </View>
      ) : null}
    </BlurView>
  );
});

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:     { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  addBtn:    { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card:      { borderRadius: 16, borderWidth: 1, padding: 12, overflow: 'hidden', marginBottom: 10 },
  next:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 },
  overlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток тут не працював
  // (батько має height:auto), і кнопка «Зберегти» лишалась за краєм вікна.
  sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  sheetTitle:{ fontSize: 20, fontWeight: '800', marginBottom: 6 },
  btn:       { paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
