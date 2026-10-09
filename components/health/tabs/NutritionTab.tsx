import { Atlas } from '@/constants/atlas';
/**
 * components/health/tabs/NutritionTab.tsx — вкладка «Харчування».
 *
 * Вміст колишнього екрана `app/health-nutrition.tsx` дослівно: калорії, білок,
 * вода, нагадування і журнал їжі. Формули не чіпались — велике число й смужка
 * міряють ЗʼЇДЕНЕ проти ліміту їжі, а спалене лишається окремим числом.
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { CalStat, HealthAddButton, HealthCard } from '@/components/health/HealthBits';
import { HealthEntryModal, NewEntryPayload } from '@/components/health/HealthEntryModal';
import { LoadErrorNotice, ReminderBlockedNotice } from '@/components/health/HealthNotices';
import { MetricTrend } from '@/components/health/MetricTrend';
import { useHealthTabGrid } from '@/components/health/HealthLayout';
import type { HealthTabProps } from '@/components/health/tabs/types';
import { MasonryColumns, type MasonryEntry } from '@/components/shared/MasonryColumns';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { useI18n } from '@/store/i18n';
import { isSameDay } from '@/utils/dateUtils';
import {
  ACCENT, ACCENT_CAL, ACCENT_PULSE, ACCENT_STEPS, ModalKey, getHealthColors,
} from '@/utils/healthTheme';

export function NutritionTab({ h }: HealthTabProps) {
  const grid = useHealthTabGrid();
  const tabBarInset = useTabBarInset();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const c = getHealthColors(isDark);

  const { today, goals, cal } = h;
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalKey | null>(null);
  // ERR-10: планувальник відмовив — перемикач лишається вимкненим, а причину
  // показуємо, замість того щоб малювати «увімкнено» і мовчати.
  const [reminderBlocked, setReminderBlocked] = useState(false);

  const onRefresh = async () => { setRefreshing(true); await h.reload(); setRefreshing(false); };
  const onSubmit = (e: NewEntryPayload) => { h.addEntry(e); setModal(null); };

  const foodToday = h.entries.filter(e => e.type === 'calories' && isSameDay(new Date(e.date), new Date()));

  // Картки вкладки в порядку читання (телефон — саме так, згори вниз;
  // планшет — дві masonry-колонки без дір).
  const items: MasonryEntry[] = [
    {
      key: 'calories',
      node: (
        <HealthCard c={c} title={tr.calories} right={<HealthAddButton onPress={() => setModal('calories')} label={tr.add} />}>
          {/* Велике число — ЗʼЇДЕНЕ, і смужка міряє теж його. Спалене сюди не
              входить: день без їжі й із 500 спаленими має показувати нуль
              зʼїдених, а не «500 / 2200». Вплив тренувань видно в залишку. */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.5 }}>{cal.consumed}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>/ {goals.calories} кк</Text>
            <View style={{ flex: 1 }} />
            <View style={[s.badge, { backgroundColor: (cal.over ? ACCENT_PULSE : ACCENT_CAL) + '20', borderColor: (cal.over ? ACCENT_PULSE : ACCENT_CAL) + '40' }]}>
              <Text style={{ color: cal.over ? ACCENT_PULSE : ACCENT_CAL, fontSize: 11, fontWeight: '700' }}>
                {cal.over ? tr.overLimit : `${Math.round(cal.pct * 100)}%`}
              </Text>
            </View>
          </View>
          <View style={[s.track, { backgroundColor: c.track, marginBottom: 8 }]}>
            <LinearGradient colors={cal.over ? [ACCENT_PULSE + 'AA', ACCENT_PULSE] : [ACCENT_CAL + 'AA', ACCENT_CAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.round(cal.pct * 100)}%` as any }]} />
          </View>
          {/* Три незалежні числа. Підпис третього — «Залишок» (tr.calRemaining),
              рівно як у вебі (`CALORIE_STAT_LABEL.remaining`): «дефіцит» на
              тому самому числі читався як інший показник. Перевищений ліміт
              так само, як у вебі, підписаний «профіцит» — знак несе ПІДПИС, а
              не мінус у значенні. */}
          <View style={{ flexDirection: 'row', marginBottom: 10 }}>
            <CalStat label={tr.consumed} value={`${cal.consumed}`} color={ACCENT_CAL} sub={c.sub} />
            <CalStat label={tr.burned} value={`${cal.burned}`} color={ACCENT_STEPS} sub={c.sub} />
            <CalStat label={cal.remaining < 0 ? tr.surplus : tr.calRemaining} value={`${Math.abs(cal.remaining)}`}
              color={cal.remaining < 0 ? ACCENT_PULSE : ACCENT} sub={c.sub} />
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[200, 350, 500, 700].map(kk => (
              <TouchableOpacity key={kk} onPress={() => h.addQuick('calories', kk)}
                accessibilityRole="button" accessibilityLabel={`+${kk} кк`}
                style={[s.chip, { borderColor: c.border, backgroundColor: c.dim }]}>
                <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>+{kk} кк</Text>
              </TouchableOpacity>
            ))}
          </View>
        </HealthCard>
      ),
    },
    {
      key: 'calories-trend',
      node: (
        <MetricTrend entries={h.entries} type="calories" agg="sum" color={ACCENT_CAL} goal={goals.calories}
          title={`${tr.calories} · ${tr.dynamics}`}
          format={v => `${Math.round(v)} кк`} c={c} tr={tr} />
      ),
    },
    {
      key: 'protein',
      node: (
        <HealthCard c={c} title={tr.protein}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 }}>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.5 }}>{Math.round(today.protein)}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginLeft: 4 }}>/ {goals.protein} г</Text>
            <View style={{ flex: 1 }} />
            {/* Рішення 07.10: один зелений акцент розділу — фіолетовий «Білків»
                виглядав як чужий модуль (аудит iPad/iPhone). */}
            <View style={[s.badge, { backgroundColor: ACCENT + '20', borderColor: ACCENT + '40' }]}>
              <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>{Math.round(Math.min(today.protein / goals.protein, 1) * 100)}%</Text>
            </View>
          </View>
          <View style={[s.track, { backgroundColor: c.track, marginBottom: 6 }]}>
            <LinearGradient colors={[ACCENT + 'AA', ACCENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={[s.fill, { width: `${Math.round(Math.min(today.protein / goals.protein, 1) * 100)}%` as any }]} />
          </View>
          {/* Рядок лишається українським, як і був: окремого ключа під нього в
              словнику немає, а вигадувати його тут — міняти контракт i18n
              мимохідь (винесено в followups). */}
          <Text style={{ color: c.sub, fontSize: 11 }}>
            {today.protein < goals.protein ? `Залишилось ${Math.round(goals.protein - today.protein)} г білка` : 'Норму білка досягнуто 💪'}
          </Text>
        </HealthCard>
      ),
    },
    {
      key: 'water',
      node: (
        <HealthCard c={c} title={tr.water}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.5 }}>
              {today.water >= 1000 ? `${(today.water / 1000).toFixed(1)} л` : `${today.water} мл`}
            </Text>
            <Text style={{ color: c.sub, fontSize: 11, marginLeft: 5 }}>/ {goals.water} мл</Text>
            <View style={{ flex: 1 }} />
            <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '700' }}>
              {today.water >= goals.water ? tr.target : `${Math.round(today.water / goals.water * 100)}%`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 10 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const threshold = ((i + 1) / 8) * goals.water;
              return <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: today.water >= threshold ? ACCENT : c.track }} />;
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[150, 250, 350, 500].map(ml => (
              <TouchableOpacity key={ml} onPress={() => h.addQuick('water', ml)}
                accessibilityRole="button" accessibilityLabel={`+${ml} мл`}
                style={[s.chip, { borderColor: c.border, backgroundColor: c.dim }]}>
                <Text style={{ color: c.text, fontSize: 11, fontWeight: '700' }}>+{ml} мл</Text>
              </TouchableOpacity>
            ))}
          </View>
        </HealthCard>
      ),
    },
    {
      key: 'reminders',
      node: (
        <HealthCard c={c} title={tr.reminders}>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{tr.waterReminder}</Text>
            <Switch
              value={h.reminders.water}
              disabled={!h.remindersLoaded || h.reminderBusy !== null}
              accessibilityLabel={tr.waterReminder}
              accessibilityState={{ checked: h.reminders.water, disabled: !h.remindersLoaded || h.reminderBusy !== null }}
              onValueChange={v => { void h.setReminder('water', v, tr.water, tr.waterReminder).then(ok => setReminderBlocked(v && !ok)); }}
              trackColor={{ true: ACCENT }} />
          </View>
          {reminderBlocked && (
            <View style={{ marginTop: 8 }}>
              <ReminderBlockedNotice lang={lang} c={c} isDark={isDark}
                onOpenSettings={() => { void Linking.openSettings(); }}
                onDismiss={() => setReminderBlocked(false)} />
            </View>
          )}
        </HealthCard>
      ),
    },
  ];
  // Журнал їжі за сьогодні — одна картка з рядками, а не стос дрібних карток:
  // у masonry стос розлетівся б по колонках.
  if (foodToday.length > 0) {
    items.push({
      key: 'food-log',
      node: (
        <HealthCard c={c} title={`${tr.todayLabel} · ${tr.nutrition}`} style={{ paddingBottom: 8 }}>
          {foodToday.map((e, i) => (
            <View key={e.id} style={[s.logRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <View style={{ width: 34, height: 34, borderRadius: Atlas.radius.medium, backgroundColor: ACCENT_CAL + '20', alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="flame.fill" size={15} color={ACCENT_CAL} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                  {e.value} кк{e.protein ? ` · ${e.protein}${tr.proteinShort}` : ''}
                </Text>
                {e.note ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{e.note}</Text> : null}
              </View>
              <Text style={{ color: c.sub, fontSize: 11 }}>
                {new Date(e.date).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </HealthCard>
      ),
    });
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={[grid.contentStyle, { paddingBottom: tabBarInset + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>

        {/* ERR-01: сховище віддало помилку — це НЕ «записів немає». */}
        {h.loadFailed && <LoadErrorNotice lang={lang} c={c} isDark={isDark} onRetry={() => { void h.retryLoad(); }} />}

        <MasonryColumns items={items} columnCount={grid.columnCount} columnGap={12} />
      </ScrollView>

      <HealthEntryModal modalKey={modal} onClose={() => setModal(null)} onSubmit={onSubmit} isDark={isDark} tr={tr} />
    </>
  );
}

const s = StyleSheet.create({
  track:  { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill:   { height: '100%', borderRadius: 4 },
  // Швидкі кнопки — нейтральні, як вторинні кнопки Фінансів: колір розділу лишається на даних.
  chip:   { flex: 1, minHeight: 36, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  badge:  { borderRadius: 7, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
});
