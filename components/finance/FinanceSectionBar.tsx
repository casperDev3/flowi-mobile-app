/**
 * components/finance/FinanceSectionBar.tsx — смуга вкладок і спільний фільтр
 * розділу «Фінанси» (finance-revamp.md §2.1, §3, §9.4).
 *
 * Телефон (compact): вкладки — горизонтальний скролер; період — чип зі
 * стрілками; валюта й ракурс — у шторці за одним чипом (місця на три
 * перемикачі в рядок немає). Планшет: ті самі вкладки горизонтально під
 * шапкою (єдине рішення на обидві платформи — не плодити другий сайдбар),
 * валюта й ракурс — прямо в рядку.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { MONEY_SCOPES, type MoneyScope } from '@/utils/budgetScope';
import {
  labelPeriodLocalized, PERIOD_PRESETS, resolvePeriod, shiftPeriod,
  type FinanceFilter, type PeriodPreset, type PeriodRange,
} from '@/utils/finance/period';
import { isDateKey } from '@/utils/subscriptions';
import type { FinanceTab } from '@/utils/financeTabs';
import {
  financeTabLabel, moneyScopeText, periodPresetLabel, type FinColors,
} from './financeLabels';

const HIT = { top: 8, bottom: 8, left: 4, right: 4 } as const;

export function FinanceTabBar({ tabs, active, onChange, c, tr }: {
  tabs: readonly FinanceTab[];
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  c: FinColors;
  tr: Translations;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
      accessibilityLabel={tr.finTabsLabel}
      style={{ flexGrow: 0, marginTop: 10 }}
      contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
      {tabs.map(tab => {
        const on = tab === active;
        const label = financeTabLabel(tab, tr);
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => onChange(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            hitSlop={HIT}
            style={[st.tab, { backgroundColor: on ? c.accent : c.dim, borderColor: on ? c.accent : c.border }]}>
            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 13, fontWeight: '700' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

export function FinanceFilterBar({
  filter, currencies, onPeriod, onCurrency, onScope, showScope = true, c, tr, isDark,
}: {
  filter: FinanceFilter;
  /** Коди валют, у яких є рахунки чи операції (основна — першою). */
  currencies: readonly string[];
  onPeriod: (period: PeriodRange) => void;
  onCurrency: (code: string) => void;
  onScope: (scope: MoneyScope) => void;
  /** Ракурс не має сенсу на вкладці «Рахунки» — баланс не залежить від погляду. */
  showScope?: boolean;
  c: FinColors;
  tr: Translations;
  /** Зарезервовано: підпис періоду береться з перекладів (tr.months). */
  locale?: string;
  isDark: boolean;
}) {
  const { isWide, height } = useResponsive();
  const [periodOpen, setPeriodOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const periodLabel = labelPeriodLocalized(filter.period, tr.months, tr.monthsShort);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
      <View style={[st.periodBox, { borderColor: c.border, backgroundColor: c.dim }]}>
        <TouchableOpacity
          onPress={() => onPeriod(shiftPeriod(filter.period, -1))}
          accessibilityRole="button"
          accessibilityLabel={tr.finPeriodPrev}
          hitSlop={HIT}
          style={st.arrow}>
          <IconSymbol name="chevron.left" size={14} color={c.sub} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPeriodOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${tr.finFilterPeriod}: ${periodLabel}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, minHeight: 36 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700', maxWidth: 180 }}>{periodLabel}</Text>
          <IconSymbol name="chevron.down" size={11} color={c.sub} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onPeriod(shiftPeriod(filter.period, 1))}
          accessibilityRole="button"
          accessibilityLabel={tr.finPeriodNext}
          hitSlop={HIT}
          style={st.arrow}>
          <IconSymbol name="chevron.right" size={14} color={c.sub} />
        </TouchableOpacity>
      </View>

      {isWide ? (
        <>
          {currencies.length > 1 ? currencies.map(code => {
            const on = code === filter.currency;
            return (
              <TouchableOpacity
                key={code}
                onPress={() => onCurrency(code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                accessibilityLabel={`${tr.finFilterCurrency}: ${code}`}
                style={[st.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '18' : c.dim }]}>
                <Text style={{ color: on ? c.accent : c.sub, fontSize: 12, fontWeight: '800' }}>{code}</Text>
              </TouchableOpacity>
            );
          }) : null}
          {showScope ? (
            <ScopeRadios scope={filter.scope} onScope={onScope} c={c} tr={tr} />
          ) : null}
        </>
      ) : (
        <TouchableOpacity
          onPress={() => setFilterOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={tr.finFilterButton}
          style={[st.chip, { borderColor: filter.scope !== 'all' ? c.accent : c.border, backgroundColor: filter.scope !== 'all' ? c.accent + '18' : c.dim, flexDirection: 'row', gap: 5 }]}>
          <IconSymbol name="line.3.horizontal.decrease" size={12} color={filter.scope !== 'all' ? c.accent : c.sub} />
          <Text style={{ color: filter.scope !== 'all' ? c.accent : c.sub, fontSize: 12, fontWeight: '800' }}>
            {showScope ? `${filter.currency} · ${moneyScopeText(filter.scope, tr)}` : filter.currency}
          </Text>
        </TouchableOpacity>
      )}

      <PeriodSheet
        visible={periodOpen}
        onClose={() => setPeriodOpen(false)}
        period={filter.period}
        onPick={p => { onPeriod(p); setPeriodOpen(false); }}
        c={c}
        tr={tr}
        isWide={isWide}
        isDark={isDark}
      />

      <SheetModal visible={filterOpen} onClose={() => setFilterOpen(false)}>
        <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[st.handle, { backgroundColor: c.border }]} />
          <Text style={[st.sheetLabel, { color: c.sub }]}>{tr.finFilterCurrency}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="radiogroup">
            {currencies.map(code => {
              const on = code === filter.currency;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => onCurrency(code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={code}
                  style={[st.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '18' : c.dim }]}>
                  <Text style={{ color: on ? c.accent : c.sub, fontSize: 13, fontWeight: '800' }}>{code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {showScope ? (
            <>
              <Text style={[st.sheetLabel, { color: c.sub, marginTop: 18 }]}>{tr.budgetScopeLabel}</Text>
              <ScopeRadios scope={filter.scope} onScope={onScope} c={c} tr={tr} />
            </>
          ) : null}
          <TouchableOpacity
            onPress={() => setFilterOpen(false)}
            accessibilityRole="button"
            style={[st.primaryBtn, { backgroundColor: c.accent, marginTop: 20 }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.close}</Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
      </SheetModal>
    </View>
  );
}

function ScopeRadios({ scope, onScope, c, tr }: {
  scope: MoneyScope;
  onScope: (s: MoneyScope) => void;
  c: FinColors;
  tr: Translations;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={tr.budgetScopeLabel}
      style={[st.segment, { borderColor: c.border, backgroundColor: c.dim }]}>
      {MONEY_SCOPES.map(option => {
        const on = option === scope;
        const label = moneyScopeText(option, tr);
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onScope(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={label}
            style={[st.segmentBtn, on && { backgroundColor: c.accent }]}>
            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PeriodSheet({ visible, onClose, period, onPick, c, tr, isWide, isDark }: {
  visible: boolean;
  onClose: () => void;
  period: PeriodRange;
  onPick: (p: PeriodRange) => void;
  c: FinColors;
  tr: Translations;
  isWide: boolean;
  isDark: boolean;
}) {
  const { height } = useResponsive();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  useEffect(() => {
    if (visible) { setFrom(period.from); setTo(period.to); }
  }, [visible, period.from, period.to]);
  const customValid = isDateKey(from.trim()) && isDateKey(to.trim());
  const presets = useMemo(() => PERIOD_PRESETS.filter(p => p !== 'custom'), []);
  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';

  const pick = (preset: PeriodPreset) => onPick(resolvePeriod(preset, '', new Date()));

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[st.handle, { backgroundColor: c.border }]} />
          <Text style={[st.sheetLabel, { color: c.sub }]}>{tr.finFilterPeriod}</Text>
          <View style={{ gap: 6 }} accessibilityRole="radiogroup">
            {presets.map(preset => {
              const on = period.preset === preset && resolvePeriod(preset, '', new Date()).key === period.key;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => pick(preset)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  style={[st.row, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '15' : c.dim }]}>
                  <Text style={{ color: on ? c.accent : c.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                    {periodPresetLabel(preset, tr)}
                  </Text>
                  {on ? <IconSymbol name="checkmark" size={14} color={c.accent} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.sheetLabel, { color: c.sub, marginTop: 18 }]}>{tr.finPresetCustom}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="2026-01-01"
              placeholderTextColor={c.sub}
              accessibilityLabel={tr.finCustomFrom}
              autoCapitalize="none"
              style={[st.input, { color: c.text, backgroundColor: inputBg }]}
            />
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="2026-03-31"
              placeholderTextColor={c.sub}
              accessibilityLabel={tr.finCustomTo}
              autoCapitalize="none"
              style={[st.input, { color: c.text, backgroundColor: inputBg }]}
            />
          </View>
          <TouchableOpacity
            disabled={!customValid}
            onPress={() => onPick(resolvePeriod('custom', `${from.trim()}..${to.trim()}`, new Date()))}
            accessibilityRole="button"
            accessibilityState={{ disabled: !customValid }}
            style={[st.primaryBtn, { backgroundColor: customValid ? c.accent : c.dim, marginTop: 12 }]}>
            <Text style={{ color: customValid ? '#fff' : c.sub, fontWeight: '700' }}>{tr.finApply}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const st = StyleSheet.create({
  tab: { paddingHorizontal: 14, minHeight: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  periodBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 2 },
  arrow: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 2 },
  segmentBtn: { minHeight: 32, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 20, paddingBottom: 36 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  sheetLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 44, borderRadius: 12, paddingHorizontal: 12, fontSize: 14 },
  primaryBtn: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
