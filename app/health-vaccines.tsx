import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Empty, Field } from '@/components/health/FormBits';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useScreenView } from '@/hooks/use-screen-view';
import { cancelById, scheduleDateReminder } from '@/store/notifications';
import { loadDataResult, retryStorageRead } from '@/store/storage';
import { saveSynced } from '@/store/synced-storage';
import { useI18n } from '@/store/i18n';
import type { Translations } from '@/store/translations';
import { ACCENT_CAL, type HealthColors } from '@/utils/healthTheme';
import { getHealthDSColors } from '@/components/health/palette';
import { dsTokens } from '@/hooks/use-ds';
import { VACCINES_KEY, Vaccine, genId } from '@/utils/preventionUtils';
import { useWideModal } from '@/components/health/HealthLayout';
import { useContentWidth, useSheetSurface } from '@/hooks/use-content-width';
import { localDateInputToIso, localDateKey } from '@/utils/dateUtils';
import { LoadErrorNotice, useSheetScreenMinHeight } from '@/components/health/HealthNotices';
import { fontFamily } from '@/constants/theme';
import { useGlassStyles } from '@/components/finance/finPalette';
import { GlassBackdrop, GlassSurface, MeshBackground } from '@/components/ds';

export default function VaccinesScreen() {
  const contentWidth = useContentWidth();
  const sheetSurface = useSheetSurface();
  const wm = useWideModal();
  const sheetScreenMinHeight = useSheetScreenMinHeight();
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  // Палітра — у useMemo, інакше React.memo на картці не спрацює:
  // getHealthColors повертає новий обʼєкт на кожен ререндер.
  const c = useMemo(() => getHealthDSColors(isDark), [isDark]);
  const gs = useGlassStyles();
  const k = dsTokens(isDark);
  useScreenView('health_vaccines');

  const [items, setItems] = useState<Vaccine[]>([]);
  const [initialized, setInitialized] = useState(false);
  // ERR-01: провалене читання не вмикає initialized — автозапис порожнього
  // масиву поверх нечитаних даних заборонено.
  const [loadFailed, setLoadFailed] = useState(false);
  const [add, setAdd] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(localDateKey(new Date()));
  const [doseNo, setDoseNo] = useState('');
  const [nextDate, setNextDate] = useState('');
  const canCreate = name.trim().length > 0;

  useEffect(() => {
    loadDataResult<Vaccine[]>(VACCINES_KEY, []).then(r => {
      if (r.ok) { setItems(r.value); setInitialized(true); }
      else setLoadFailed(true);
    });
  }, []);

  const retryLoad = async () => {
    const r = await retryStorageRead<Vaccine[]>(VACCINES_KEY, []);
    if (r.ok) { setItems(r.value); setLoadFailed(false); setInitialized(true); }
  };

  useEffect(() => {
    if (!initialized) return;
    void saveSynced(VACCINES_KEY, items).catch(e => { if (__DEV__) console.warn('[vaccines] save failed:', e); });
  }, [items, initialized]);

  const create = async () => {
    if (!name.trim()) return;
    // Поле — локальна доба, не UTC (див. localDateInputToIso); нерозбірна
    // дата раніше валила create через RangeError з toISOString.
    const dateIso = localDateInputToIso(date);
    const nextIso = nextDate.trim() ? localDateInputToIso(nextDate) : undefined;
    if (!dateIso || (nextDate.trim() && !nextIso)) return;
    const id = genId();
    let notifId: string | undefined;
    if (nextDate) {
      const r = await scheduleDateReminder(`vaccine_${id}`, new Date(nextDate + 'T09:00:00'), `💉 ${name.trim()}`, tr.vaccines);
      notifId = r ?? undefined;
    }
    const item: Vaccine = {
      id, name: name.trim(), date: dateIso,
      doseNo: doseNo ? parseInt(doseNo, 10) : undefined,
      nextDate: nextIso,
      notifId, createdAt: new Date().toISOString(),
    };
    setItems(p => [item, ...p].sort((a, b) => +new Date(b.date) - +new Date(a.date)));
    setName(''); setDate(localDateKey(new Date())); setDoseNo(''); setNextDate(''); setAdd(false);
  };

  // Колбек мусить бути стабільним і приймати елемент аргументом — інакше
  // нова стрілка на кожен ререндер зводить React.memo картки нанівець.
  const remove = useCallback(async (item: Vaccine) => {
    await cancelById(item.notifId);
    setItems(p => p.filter(x => x.id !== item.id));
  }, []);

  const keyExtractor = useCallback((item: Vaccine) => item.id, []);
  const renderItem = useCallback(({ item }: { item: Vaccine }) => (
    <VaccineCard item={item} onRemove={remove} isDark={isDark} c={c} tr={tr} locale={locale} />
  ), [remove, isDark, c, tr, locale]);

  return (
    // NAT-14: formSheet не дає кореню визначеної висоти — без minHeight
    // `flex: 1` схлопується до висоти вмісту, і низ аркуша лишається прозорим.
    <View style={{ flex: 1, minHeight: sheetScreenMinHeight }}>
      <MeshBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={tr.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <IconSymbol name="xmark" size={18} color={c.text} />
          </TouchableOpacity>
          <Text style={[s.title, { color: c.text, flex: 1, marginLeft: 8 }]}>{tr.vaccines}</Text>
          <TouchableOpacity onPress={() => setAdd(true)} accessibilityRole="button" accessibilityLabel={tr.add} style={[s.addBtn, { backgroundColor: k.action.primary }]}>
            <IconSymbol name="plus" size={18} color={k.text.onAction} />
          </TouchableOpacity>
        </View>

        {/* Історія щеплень накопичується роками, тож список
            віртуалізований: ScrollView тримав би в памʼяті всі картки. */}
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={loadFailed ? <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={retryLoad} /> : null}
          ListEmptyComponent={loadFailed ? null : <Empty c={c} text={tr.vaccinesSub} icon="syringe" />}
        />
      </SafeAreaView>

      <Modal visible={add} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <Pressable accessible={false} style={[s.overlay, wm.overlay]} onPress={() => setAdd(false)}>
            <Pressable onPress={e => e.stopPropagation()} style={[s.sheetWrap, wm.column]} accessible={false} accessibilityViewIsModal importantForAccessibility="yes">
              <View style={[s.sheet, sheetSurface, { ...gs.strong }]}>
                <GlassBackdrop style={{ borderRadius: 24, overflow: 'hidden' }} />
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={[s.sheetTitle, { color: c.text }]}>{tr.addVaccine}</Text>
                <Field label={tr.title} value={name} onChange={setName} placeholder="Грип / COVID-19…" autoFocus c={c} />
                <Field label={tr.date} value={date} onChange={setDate} placeholder="2026-06-29" c={c} />
                <Field label={tr.doseNo} value={doseNo} onChange={setDoseNo} placeholder="1" keyboardType="number-pad" c={c} />
                <Field label={tr.nextDate} value={nextDate} onChange={setNextDate} placeholder="2027-06-29" c={c} />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
                  <TouchableOpacity onPress={() => setAdd(false)} style={[s.btn, { ...gs.subtle, flex: 1 }]}>
                    <Text style={{ color: k.action.secondaryText, fontFamily: fontFamily.semibold }}>{tr.cancel}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={!canCreate} accessibilityState={{ disabled: !canCreate }} onPress={create} style={[s.btn, { flex: 2, backgroundColor: canCreate ? k.action.primary : k.state.disabledBg }]}>
                    <Text style={{ color: canCreate ? k.text.onAction : k.state.disabledText, fontFamily: fontFamily.semibold }}>{tr.save}</Text>
                  </TouchableOpacity>
                </View>
                </ScrollView>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const VaccineCard = React.memo(function VaccineCard({ item, onRemove, isDark, c, tr, locale }: {
  item: Vaccine; onRemove: (item: Vaccine) => void; isDark: boolean;
  c: HealthColors; tr: Translations; locale: string;
}) {
  const fmtD = (d: string) => new Date(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <GlassSurface blur={false} radius={20} style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 38, height: 38, borderRadius: 999, backgroundColor: ACCENT_CAL + '20', alignItems: 'center', justifyContent: 'center' }}>
          <IconSymbol name="syringe" size={17} color={ACCENT_CAL} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{item.name}{item.doseNo ? ` · №${item.doseNo}` : ''}</Text>
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>{fmtD(item.date)}</Text>
        </View>
        <TouchableOpacity onPress={() => onRemove(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4 }}>
          <IconSymbol name="trash" size={15} color={c.sub} />
        </TouchableOpacity>
      </View>
      {item.nextDate ? (
        <View style={[s.next, { backgroundColor: ACCENT_CAL + '1F' }]}>
          <IconSymbol name="bell.fill" size={11} color={ACCENT_CAL} />
          <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], marginLeft: 6 }}>{tr.upcoming}: {fmtD(item.nextDate)}</Text>
        </View>
      ) : null}
    </GlassSurface>
  );
});

const s = StyleSheet.create({
  header:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  title:     { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  addBtn:    { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  card:      { borderRadius: 20, padding: 20, marginBottom: 12 },
  next:      { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  overlay:   { flex: 1, backgroundColor: 'rgba(17,17,19,0.40)' /* surface.overlay */, justifyContent: 'flex-end' },
  sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16, flexShrink: 1 },
  // Стеля висоти — числом із useSheetSurface(); відсоток тут не працював
  // (батько має height:auto), і кнопка «Зберегти» лишалась за краєм вікна.
  sheet:     { borderRadius: 24, padding: 24 },
  sheetTitle:{ fontSize: 20, fontFamily: fontFamily.semibold, marginBottom: 6 },
  btn:       { minHeight: 48, paddingVertical: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
