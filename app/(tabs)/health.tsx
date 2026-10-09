import { Atlas } from '@/constants/atlas';
/**
 * app/(tabs)/health.tsx — розділ «Здоровʼя» однією сторінкою з вкладками.
 *
 * Було: хаб із дев'ятьма плитками, вісім окремих екранів `app/health-*.tsx` і
 * ще три пункти сайдбара («Зведення здоровʼя», «Профіль здоровʼя»,
 * «Профілактика»). Один розділ жив у чотирьох місцях меню, а щоб порівняти сон
 * із кроками, треба було двічі повернутись назад через хаб.
 *
 * Стало: один пункт меню й шість вкладок — Огляд · Харчування · Активність і
 * тренування · Сон · Тіло і вітальні · Профілактика. Старі маршрути лишились
 * живими редиректами (`app/health-summary.tsx` і решта), бо на них ведуть
 * нагадування, закладки й нотифікації.
 *
 * Профіль і джерела даних (Apple Health) — НЕ вкладка, а налаштування розділу
 * за шестернею: туди ходять раз на місяць, а вкладка коштує стільки ж місця,
 * скільки щоденна.
 *
 * Тренування лишились ОКРЕМИМ розділом: це майбутній модуль із групами й
 * програмами, тож вкладка «Активність і тренування» показує їхнє зведення і
 * веде туди, а не втягує його в себе.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { HealthTabBar, type HealthTabId, healthTabBarLayout, parseHealthTab } from '@/components/health/HealthTabs';
import { QuickAddSheet, QuickRecord } from '@/components/health/QuickAddSheet';
import { ActivityTab } from '@/components/health/tabs/ActivityTab';
import { BodyTab } from '@/components/health/tabs/BodyTab';
import { NutritionTab } from '@/components/health/tabs/NutritionTab';
import { OverviewTab } from '@/components/health/tabs/OverviewTab';
import { PreventionTab } from '@/components/health/tabs/PreventionTab';
import { SleepTab } from '@/components/health/tabs/SleepTab';
import { MonthPicker } from '@/components/shared/MonthPicker';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sheetSurfaceStyle } from '@/hooks/use-content-width';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHealthEntries } from '@/hooks/use-health-entries';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useScreenView } from '@/hooks/use-screen-view';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { isSameDay } from '@/utils/dateUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_MOOD, ACCENT_PULSE, ACCENT_SLEEP, ACCENT_STEPS, ACCENT_WEIGHT,
  type HealthColors, fmtSleep, getHealthColors,
} from '@/utils/healthTheme';
import { HealthEntry, getMonthEntries } from '@/utils/healthUtils';

export default function HealthHubScreen() {
  const tabBarInset = useTabBarInset();
  // Планшет: головна дія «додати» — кнопкою в шапці, як на інших екранах
  // (рішення 6); FAB лишається телефону, де до шапки тягнутись далеко.
  const { isWide } = useResponsive();
  // Смуга вкладок: на планшеті — шість в один ряд без прокрутки (рішення 07.10).
  const tabBarLayout = healthTabBarLayout(useScreenWidth(), isWide);
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  /**
   * Вкладка живе у стані, а параметр адреси лише СТАВИТЬ її.
   *
   * Так працюють обидва входи: тап по смузі перемикає миттєво й не залежить
   * від навігатора, а глибоке посилання (`?tab=sleep` із нагадування або з
   * редиректу старого маршруту) доїжджає ефектом нижче.
   */
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<HealthTabId>(() => parseHealthTab(tabParam));
  useEffect(() => {
    if (tabParam === undefined) return;
    setTab(parseHealthTab(tabParam));
  }, [tabParam]);

  useScreenView(`health_${tab}`);

  const h = useHealthEntries();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [activeMonth, setActiveMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // Лічильник «на сьогодні» для бейджа вкладки Профілактики (невипиті ліки).
  const [medsDue, setMedsDue] = useState(0);
  const loadMedsDue = useCallback(async () => {
    const meds = await loadData<any[]>('health_meds', []);
    const today = new Date();
    let due = 0;
    meds.forEach(m => {
      if (!m.active) return;
      const takenToday = (m.log ?? []).filter((l: any) => isSameDay(new Date(l.date), today)).length;
      due += Math.max(0, (m.times?.length ?? 0) - takenToday);
    });
    setMedsDue(due);
  }, []);
  useEffect(() => { void loadMedsDue(); }, [loadMedsDue, tab]);

  const onQuickSubmit = (records: QuickRecord[]) => records.forEach(r => h.addEntry({ type: r.type, value: r.value }));

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1 }}>

        <ScreenHeader
          title={tr.health}
          color={c.text}
          actions={
            <>
              {isWide && (
                <HeaderButton onPress={() => setQuickOpen(true)} accessibilityLabel={tr.add}
                  style={{ borderColor: ACCENT + '55', backgroundColor: ACCENT }}>
                  <IconSymbol name="plus" size={17} color="#fff" />
                </HeaderButton>
              )}
              <HeaderButton onPress={() => setHistoryOpen(true)} accessibilityLabel={tr.history}
                style={{ borderColor: c.border, backgroundColor: c.dim }}>
                <IconSymbol name="clock.arrow.circlepath" size={17} color={c.text} />
              </HeaderButton>
              {/* Налаштування розділу: профіль здоровʼя і джерела даних. */}
              <HeaderButton onPress={() => router.push('/health-profile')} accessibilityLabel={tr.settings}
                style={{ borderColor: c.border, backgroundColor: c.dim }}>
                <IconSymbol name="gearshape.fill" size={17} color={c.text} />
              </HeaderButton>
            </>
          }>
          <HealthTabBar value={tab} onChange={setTab} tr={tr} c={c} preventionBadge={medsDue} layout={tabBarLayout} />
        </ScreenHeader>

        {tab === 'overview'   && <OverviewTab h={h} />}
        {tab === 'nutrition'  && <NutritionTab h={h} />}
        {tab === 'activity'   && <ActivityTab h={h} />}
        {tab === 'sleep'      && <SleepTab h={h} />}
        {tab === 'body'       && <BodyTab h={h} />}
        {tab === 'prevention' && <PreventionTab h={h} />}
      </View>

      {/* FAB → нижній попап швидкого вводу */}
      {/* L5: інсет із useTabBarInset() — він додає висоту ActiveTimersBar,
          коли йде хоч один таймер. Зашите 108 ховало нижню третину кнопки
          під панеллю таймерів, і тап потрапляв у панель. */}
      {!isWide && (
      <View style={[s.fabContainer, { bottom: tabBarInset + 20 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => setQuickOpen(true)} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel={tr.add}
          style={[s.fab, { backgroundColor: ACCENT }]}>
          {/* Суцільна кнопка без кольорового «сяйва» — як FAB Фінансів. */}
          <IconSymbol name="plus" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
      )}

      <QuickAddSheet visible={quickOpen} onClose={() => setQuickOpen(false)} onSubmit={onQuickSubmit} isDark={isDark} tr={tr} />

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)}
        entries={h.entries} activeMonth={activeMonth} setActiveMonth={setActiveMonth}
        onDelete={h.deleteEntry}
        isDark={isDark} c={c} tr={tr} locale={locale} />
    </View>
  );
}

function HistoryModal({ open, onClose, entries, activeMonth, setActiveMonth, onDelete, isDark, c, tr, locale }: {
  open: boolean; onClose: () => void; entries: HealthEntry[];
  activeMonth: Date; setActiveMonth: (d: Date) => void;
  /** h.deleteEntry: автоматичний запис ще й потрапляє в тумбстоуни, щоб синк його не повернув. */
  onDelete: (id: string) => void;
  isDark: boolean; c: HealthColors; tr: any; locale: string;
}) {
  const { height, isWide } = useResponsive();
  const sheetSurface = sheetSurfaceStyle(height);
  const now = new Date();
  const monthEntries = useMemo(() => getMonthEntries(entries, activeMonth), [entries, activeMonth]);
  /*
   * Журнал — довідка «збоку» від дашборда: на планшеті він виїжджає панеллю
   * праворуч на всю висоту (SheetModal 'side'), і вкладка лишається видимою
   * зліва; на телефоні — звичайний нижній лист. Ручку й хрестик дає
   * SheetModal, тож власних тут немає.
   */
  return (
    <SheetModal visible={open} onClose={onClose} presentation="side">
          <BlurView intensity={isDark ? 55 : 75} tint={isDark ? 'dark' : 'light'}
            style={[s.sheet, isWide ? s.sheetSide : sheetSurface, { borderColor: c.border, backgroundColor: c.sheet }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[s.sheetTitle, { color: c.text, flex: 1 }]}>{tr.history}</Text>
              <MonthPicker month={activeMonth} onChange={setActiveMonth} months={tr.months}
                accentColor={ACCENT} textColor={c.text} subColor={c.sub} dimColor={c.dim} borderColor={c.border} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={isWide ? { flex: 1 } : { maxHeight: height * 0.58 }}>
              {monthEntries.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <IconSymbol name="heart.fill" size={38} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 15, marginTop: 12, fontWeight: '600' }}>{tr.noEntriesYet}</Text>
                </View>
              ) : (
                <View style={{ gap: 8, paddingBottom: 16 }}>
                  {monthEntries.slice(0, 60).map(entry => {
                    const d = new Date(entry.date);
                    const dayStr = isSameDay(d, now) ? tr.today : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
                    const cfg = getEntryCfg(entry, tr);
                    return (
                      <View key={entry.id} style={[s.historyCard, { borderColor: c.border, backgroundColor: c.card }]}>
                        <View style={{ width: 38, height: 38, borderRadius: 11, backgroundColor: cfg.color + '20', alignItems: 'center', justifyContent: 'center' }}>
                          <IconSymbol name={cfg.icon as any} size={16} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>{cfg.valueStr}</Text>
                          {entry.note && entry.note !== '__hk__' ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{entry.note}</Text> : null}
                          <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>{dayStr} · {timeStr}</Text>
                        </View>
                        <View style={[s.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '35' }]}>
                          <Text style={{ color: cfg.color, fontSize: 10, fontWeight: '700' }}>{cfg.typeLabel}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => Alert.alert(tr.tlHealthDeleteEntryTitle, tr.tlHealthDeleteEntryMsg, [
                            { text: tr.cancel, style: 'cancel' },
                            { text: tr.delete, style: 'destructive', onPress: () => onDelete(entry.id) },
                          ])}
                          accessibilityRole="button"
                          accessibilityLabel={`${tr.delete}: ${cfg.typeLabel} ${cfg.valueStr}`}
                          style={s.deleteBtn}>
                          <IconSymbol name="trash" size={15} color={c.sub} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </BlurView>
    </SheetModal>
  );
}

function getEntryCfg(entry: HealthEntry, tr: any) {
  switch (entry.type) {
    case 'water':        return { icon: 'drop.fill',         color: ACCENT,        typeLabel: tr.water,    valueStr: entry.value >= 1000 ? `${(entry.value / 1000).toFixed(1)} л` : `+${entry.value} мл` };
    case 'calories':     return { icon: 'flame.fill',        color: ACCENT_CAL,    typeLabel: tr.consumed, valueStr: `${entry.value} кк${entry.protein ? ` · ${entry.protein}${tr.proteinShort}` : ''}` };
    case 'calories_out': return { icon: 'flame',             color: ACCENT_STEPS,  typeLabel: tr.burned,   valueStr: `${entry.value} кк` };
    case 'weight':       return { icon: 'scalemass.fill',    color: ACCENT_WEIGHT, typeLabel: tr.weight,   valueStr: `${entry.value} кг` };
    case 'sleep':        return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.sleep,    valueStr: fmtSleep(entry.value) };
    case 'steps':        return { icon: 'figure.walk',       color: ACCENT_STEPS,  typeLabel: tr.steps,    valueStr: `${entry.value.toLocaleString()} кр` };
    case 'pulse':        return { icon: 'waveform.path.ecg', color: ACCENT_PULSE,  typeLabel: tr.pulse,    valueStr: `${entry.value} уд/хв` };
    // Автодані (health-auto-data.md): без цих гілок записи падали в default і показували «—».
    case 'pulse_rest':   return { icon: 'heart.fill',        color: ACCENT_PULSE,  typeLabel: tr.hautoPulseRest, valueStr: `${entry.value} ${tr.hautoBpm}` };
    case 'spo2':         return { icon: 'lungs.fill',        color: ACCENT_PULSE,  typeLabel: tr.hautoSpo2,      valueStr: `${Math.round(entry.value)}%` };
    case 'distance':     return { icon: 'figure.walk',       color: ACCENT_STEPS,  typeLabel: tr.hautoDistance,  valueStr: `${Number(entry.value).toFixed(1)} ${tr.hautoKm}` };
    case 'sleep_deep':   return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.hautoSleepDeep,  valueStr: fmtSleep(entry.value) };
    case 'sleep_rem':    return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.hautoSleepRem,   valueStr: fmtSleep(entry.value) };
    case 'sleep_light':  return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.hautoSleepLight, valueStr: fmtSleep(entry.value) };
    case 'sleep_awake':  return { icon: 'moon.fill',         color: ACCENT_SLEEP,  typeLabel: tr.hautoSleepAwake, valueStr: fmtSleep(entry.value) };
    default:             return { icon: 'heart.fill',        color: ACCENT_MOOD,   typeLabel: '—',         valueStr: String(entry.value) };
  }
}

const s = StyleSheet.create({
  badge:        { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  // 44×44 — мінімальна ціль дотику (HIG); іконка маленька, ціль — ні.
  deleteBtn:    { width: 44, height: 44, marginLeft: 4, marginRight: -8, alignItems: 'center', justifyContent: 'center' },
  historyCard:  { borderRadius: Atlas.radius.large, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center' },
  fabContainer: { position: 'absolute', right: 20, alignItems: 'center', justifyContent: 'center' },
  fab:          { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  // Стеля висоти — числом із sheetSurfaceStyle(); відсоток від батька з
  // height:auto не рахується і обмеження просто зникає (NAT-01).
  sheet:        { borderRadius: 26, borderWidth: 1, padding: 20, overflow: 'hidden' },
  // Бокова панель: на всю висоту, список гортається всередині.
  sheetSide:    { flex: 1, marginBottom: 12 },
  sheetTitle:   { fontSize: 20, fontWeight: Atlas.type.headingWeight },
});
