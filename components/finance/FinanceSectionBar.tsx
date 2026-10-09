import { Atlas } from '@/constants/atlas';
/**
 * components/finance/FinanceSectionBar.tsx — смуга вкладок і спільний фільтр
 * розділу «Фінанси» (finance-revamp.md §2.1, §3, §9.4).
 *
 * Вкладки — ОДИН ряд сегментованого перемикача: «Операції · Рахунки · Звіти
 * · Ще ▾» скрізь. Період — чип зі стрілками; валюта, ракурс і тип операцій —
 * у шторці за одним чипом. На планшеті вкладки, період і чип «Фільтри (N)»
 * стоять в одному ряду (раніше валюти й радіо ракурсу розповзались на 2–3
 * ряди — скарга власника 2026-10-07).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import type { Translations } from '@/store/translations';
import { MONEY_SCOPES, type MoneyScope } from '@/utils/budgetScope';
import {
  labelPeriodLocalized, PERIOD_PRESETS, resolvePeriod, shiftPeriod,
  type FinanceFilter, type PeriodPreset, type PeriodRange,
} from '@/utils/finance/period';
import { isDateKey } from '@/utils/subscriptions';
import { activeFinanceFilterCount, splitFinanceTabs, type FinanceTab } from '@/utils/financeTabs';
import {
  financeTabLabel, moneyScopeText, periodPresetLabel, type FinColors,
} from './financeLabels';

const HIT = { top: 8, bottom: 8, left: 4, right: 4 } as const;

/**
 * Один ряд — сегментований перемикач на будь-якій ширині: «Операції ·
 * Рахунки · Звіти · Ще ▾» (рішення власника 2026-10-07). Вибрана вкладка з
 * меню «Ще» підписує саму кнопку («Бюджет ▾»), тож видно, де ти є.
 */
export function FinanceTabBar({ tabs, active, onChange, c, tr, stretch = true }: {
  tabs: readonly FinanceTab[];
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  c: FinColors;
  tr: Translations;
  /** Телефон: сегменти на всю ширину. Планшет: за вмістом, поруч із фільтром. */
  stretch?: boolean;
}) {
  const { isWide, height } = useResponsive();
  const [moreOpen, setMoreOpen] = useState(false);
  const { inline, more } = splitFinanceTabs(tabs);
  const moreActive = more.includes(active);
  const moreLabel = moreActive ? financeTabLabel(active, tr) : tr.finTabMore;

  const segment = (key: string, label: string, on: boolean, onPress: () => void, extra?: React.ReactNode, hint?: string) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={SEG_HIT}
      style={[st.seg, stretch && st.segStretch, on && { backgroundColor: c.accent }]}>
      <Text numberOfLines={1} style={{ color: on ? '#fff' : c.sub, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      {extra}
    </TouchableOpacity>
  );

  return (
    <>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={tr.finTabsLabel}
        style={[st.segBar, { borderColor: c.border, backgroundColor: c.dim }, stretch ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }]}>
        {inline.map(tab => segment(tab, financeTabLabel(tab, tr), tab === active, () => onChange(tab)))}
        {more.length > 0 ? segment(
          'more',
          moreLabel,
          moreActive,
          () => setMoreOpen(true),
          <IconSymbol name="chevron.down" size={10} color={moreActive ? '#fff' : c.sub} style={{ marginLeft: 3 }} />,
          tr.finMoreSections,
        ) : null}
      </View>

      <SheetModal visible={moreOpen} onClose={() => setMoreOpen(false)}>
        <View style={[st.sheet, sheetColumnStyle(isWide), { maxHeight: height * 0.88, backgroundColor: c.sheet, borderColor: c.border }]}>
          <Text style={[st.sheetLabel, { color: c.sub }]}>{tr.finMoreSections}</Text>
          <View style={{ gap: 6 }}>
            {more.map(tab => {
              const on = tab === active;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => { setMoreOpen(false); onChange(tab); }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={financeTabLabel(tab, tr)}
                  style={[st.row, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '15' : c.dim }]}>
                  <IconSymbol name={TAB_ICON[tab]} size={16} color={on ? c.accent : c.sub} />
                  <Text style={{ color: on ? c.accent : c.text, fontSize: 15, fontWeight: '600', flex: 1, marginLeft: 10 }}>
                    {financeTabLabel(tab, tr)}
                  </Text>
                  {on ? <IconSymbol name="checkmark" size={14} color={c.accent} /> : <IconSymbol name="chevron.right" size={12} color={c.sub} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </SheetModal>
    </>
  );
}

// 40 + 3 + 3 у межах смуги (padding 3) = 46: ціль ≥44 без виходу за bounds батька (A11Y-08).
const SEG_HIT = { top: 3, bottom: 3, left: 1, right: 1 } as const;

const TAB_ICON: Record<FinanceTab, IconSymbolName> = {
  transactions: 'list.bullet',
  accounts: 'creditcard.fill',
  reports: 'chart.bar.fill',
  budget: 'chart.line.uptrend.xyaxis',
  subscriptions: 'repeat',
};

export type FinanceTxType = 'all' | 'income' | 'expense';

function txTypeText(type: FinanceTxType, tr: Translations): string {
  return type === 'income' ? tr.incomes : type === 'expense' ? tr.expenses : tr.all;
}

export function FinanceFilterBar({
  filter, currencies, onPeriod, onCurrency, onScope, showScope = true, c, tr, isDark,
  txType, onTxType,
}: {
  filter: FinanceFilter;
  /**
   * Тип операцій (Всі/Доходи/Витрати) — лише на «Операціях». Раніше це був
   * окремий перемикач у рядку заголовка стрічки, тобто третій ряд контролів
   * під табами й періодом (P2 аудиту 2026-10, скарга власника на «3 ряди»).
   * Тепер на телефоні він живе в аркуші фільтра, на планшеті — в цьому ж ряду.
   */
  txType?: FinanceTxType;
  onTxType?: (type: FinanceTxType) => void;
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
  const typeActive = Boolean(txType && txType !== 'all');
  const activeCount = activeFinanceFilterCount({
    currency: filter.currency,
    primaryCurrency: currencies[0],
    scope: filter.scope,
    showScope,
    txType,
  });
  const chipActive = (showScope && filter.scope !== 'all') || typeActive || (isWide && activeCount > 0);
  const countLabel = activeCount > 0 ? `${tr.filters} (${activeCount})` : tr.filters;
  const chipLabel = [
    filter.currency,
    showScope ? moneyScopeText(filter.scope, tr) : null,
    typeActive && txType ? txTypeText(txType, tr) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }, !isWide && { flexWrap: 'wrap' }]}>
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

      {/* Один чип на будь-якій ширині. Телефон: підпис — поточні значення
          («UAH · Особисті»); планшет: «Фільтри (N)», бо ряд уже несе вкладки
          й період, а валюти з радіо ракурсу й типу розносили його на 2–3 ряди. */}
      <TouchableOpacity
        onPress={() => setFilterOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr.finFilterButton}
        accessibilityValue={{ text: isWide ? countLabel : chipLabel }}
        style={[st.chip, { borderColor: chipActive ? c.accent : c.border, backgroundColor: chipActive ? c.accent + '18' : c.dim, flexDirection: 'row', gap: 5 }]}>
        <IconSymbol name="line.3.horizontal.decrease" size={12} color={chipActive ? c.accent : c.sub} />
        <Text numberOfLines={1} style={{ color: chipActive ? c.accent : c.sub, fontSize: 12, fontWeight: Atlas.type.headingWeight }}>
          {isWide ? countLabel : chipLabel}
        </Text>
      </TouchableOpacity>

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
                  <Text style={{ color: on ? c.accent : c.sub, fontSize: 13, fontWeight: Atlas.type.headingWeight }}>{code}</Text>
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
          {txType && onTxType ? (
            <>
              <Text style={[st.sheetLabel, { color: c.sub, marginTop: 18 }]}>{tr.finTxTypeLabel}</Text>
              <TxTypeRadios type={txType} onType={onTxType} c={c} tr={tr} />
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

function TxTypeRadios({ type, onType, c, tr }: {
  type: FinanceTxType;
  onType: (t: FinanceTxType) => void;
  c: FinColors;
  tr: Translations;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={tr.finTxTypeLabel}
      style={[st.segment, { borderColor: c.border, backgroundColor: c.dim, alignSelf: 'flex-start' }]}>
      {(['all', 'income', 'expense'] as const).map(option => {
        const on = option === type;
        const label = txTypeText(option, tr);
        const tint = option === 'income' ? c.green : option === 'expense' ? c.red : c.accent;
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onType(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={label}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[st.segmentBtn, on && { backgroundColor: tint }]}>
            <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: Atlas.type.headingWeight }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
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
  segBar: { flexDirection: 'row', borderWidth: 1, borderRadius: Atlas.radius.large, padding: 3, marginTop: 10, gap: 2 },
  seg: { flexDirection: 'row', minHeight: 40, paddingHorizontal: 12, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  segStretch: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingHorizontal: 6 },
  periodBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 2 },
  arrow: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: Atlas.radius.medium, padding: 2 },
  segmentBtn: { minHeight: 32, paddingHorizontal: 10, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: Atlas.radius.xlarge, borderTopRightRadius: Atlas.radius.xlarge, borderWidth: 1, padding: 20, paddingBottom: 36 },
  sheetLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderWidth: 1, borderRadius: Atlas.radius.medium, paddingHorizontal: 14 },
  input: { flex: 1, minHeight: 44, borderRadius: Atlas.radius.medium, paddingHorizontal: 12, fontSize: 14 },
  primaryBtn: { minHeight: 46, borderRadius: Atlas.radius.large, alignItems: 'center', justifyContent: 'center' },
});
