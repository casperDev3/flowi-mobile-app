/**
 * components/finance/FinanceSectionBar.tsx — смуга вкладок і спільний фільтр
 * розділу «Фінанси» (finance-revamp.md §2.1, §3, §9.4).
 *
 * Вкладки — ОДИН ряд сегментованого перемикача: «Операції · Рахунки · Звіти
 * · Ще ▾» скрізь. Період — чип зі стрілками; валюта, ракурс і тип операцій —
 * у шторці за одним чипом. На планшеті вкладки, період і чип «Фільтри (N)»
 * стоять в одному ряду (раніше валюти й радіо ракурсу розповзались на 2–3
 * ряди — скарга власника 2026-10-07).
 * DS v2.5 (планшет, useFiltersV25): вкладки — Segmented + «Ще» FilterSelect,
 * фільтри — FilterBar 36pt; телефон — без змін (…Legacy).
 */
import { OverlayMaterial } from '@/components/ds/OverlayMaterial';
import { dsTheme, glassOf } from '@/components/shared/dsTheme';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
import { sheetColumnStyle } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
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
import { useGlassStyles } from '@/components/finance/finPalette';
import { FILTER_CONTROL_H, FILTER_GAP, FILTER_HIT_H, FilterBar, FilterSelect, Segmented, useFiltersV25 } from '@/components/ds/filters';

const HIT = { top: 8, bottom: 8, left: 4, right: 4 } as const;

/**
 * Один ряд — сегментований перемикач на будь-якій ширині: «Операції ·
 * Рахунки · Звіти · Ще ▾» (рішення власника 2026-10-07). Вибрана вкладка з
 * меню «Ще» підписує саму кнопку («Бюджет ▾»), тож видно, де ти є.
 */
type FinanceTabBarProps = {
  tabs: readonly FinanceTab[];
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  c: FinColors;
  tr: Translations;
  /** Телефон: сегменти на всю ширину. Планшет: за вмістом, поруч із фільтром. */
  stretch?: boolean;
};

/**
 * Планшет (DS v2.5): вкладки — `Segmented` (tablist) 36pt, «Ще» — `FilterSelect`
 * з рештою розділів (тригер підписаний вибраною вкладкою). Телефон — як було.
 */
export function FinanceTabBar(props: FinanceTabBarProps) {
  return useFiltersV25() ? <FinanceTabBarV25 {...props} /> : <FinanceTabBarLegacy {...props} />;
}

function FinanceTabBarV25({ tabs, active, onChange, tr }: FinanceTabBarProps) {
  const { inline, more } = splitFinanceTabs(tabs);
  const moreActive = more.includes(active);
  return (
    <View style={[st.v25Row, { marginTop: 10 }]}>
      <Segmented<FinanceTab>
        label={tr.finTabsLabel}
        semantics="tablist"
        value={active}
        onChange={onChange}
        options={inline.map(tab => ({ value: tab, label: financeTabLabel(tab, tr), icon: TAB_ICON[tab] }))}
      />
      {more.length > 0 ? (
        <FilterSelect<FinanceTab>
          label={tr.finMoreSections}
          hideLabel
          placeholder={tr.finTabMore}
          icon={moreActive ? TAB_ICON[active] : 'ellipsis'}
          value={moreActive ? active : null}
          onChange={v => { if (v) onChange(v); }}
          options={more.map(tab => ({ value: tab, label: financeTabLabel(tab, tr), icon: TAB_ICON[tab] }))}
        />
      ) : null}
    </View>
  );
}

function FinanceTabBarLegacy({ tabs, active, onChange, c, tr, stretch = true }: {
  tabs: readonly FinanceTab[];
  active: FinanceTab;
  onChange: (tab: FinanceTab) => void;
  c: FinColors;
  tr: Translations;
  /** Телефон: сегменти на всю ширину. Планшет: за вмістом, поруч із фільтром. */
  stretch?: boolean;
}) {
  const { isWide, height } = useResponsive();
  const { t, g, isDark, reduceTransparency } = useDS();
  const gs = useGlassStyles();
  const [moreOpen, setMoreOpen] = useState(false);
  const { inline, more } = splitFinanceTabs(tabs);
  const moreActive = more.includes(active);
  const moreLabel = moreActive ? financeTabLabel(active, tr) : tr.finTabMore;

  // Omni (DS v2.2): окремі pill-вкладки (як SectionTabs) — активна суцільна
  // action.primary (чорна; у темній — біла), решта — тиха скляна pill з
  // волосяним обідком (смуга живе у функціональному шарі — шапці). Іконки —
  // лише на планшеті: на телефоні чотири pill з іконками не вміщаються в ряд.
  const idle = reduceTransparency ? t.surface.subtle : g.surfaceSubtle;
  const segment = (key: string, label: string, on: boolean, onPress: () => void, icon?: IconSymbolName, extra?: React.ReactNode, hint?: string) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={SEG_HIT}
      style={[
        st.seg,
        stretch && st.segStretch,
        on
          ? { backgroundColor: t.action.primary }
          : { backgroundColor: idle, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline },
      ]}>
      {icon && !stretch ? <IconSymbol name={icon} size={14} color={on ? t.text.onAction : t.text.secondary} style={{ marginRight: 6 }} /> : null}
      <Text numberOfLines={1} style={{ color: on ? t.text.onAction : t.text.secondary, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
      {extra}
    </TouchableOpacity>
  );

  return (
    <>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={tr.finTabsLabel}
        style={[st.segBar, stretch ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start' }]}>
        {inline.map(tab => segment(tab, financeTabLabel(tab, tr), tab === active, () => onChange(tab), TAB_ICON[tab]))}
        {more.length > 0 ? segment(
          'more',
          moreLabel,
          moreActive,
          () => setMoreOpen(true),
          moreActive ? TAB_ICON[active] : 'ellipsis',
          <IconSymbol name="chevron.down" size={10} color={moreActive ? t.text.onAction : t.text.secondary} style={{ marginLeft: 4 }} />,
          tr.finMoreSections,
        ) : null}
      </View>

      <SheetModal visible={moreOpen} onClose={() => setMoreOpen(false)}>
        <View style={[st.sheet, sheetColumnStyle(isWide), { ...gs.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
          <OverlayMaterial isDark={isDark} radius={24} />
          <Text style={[st.sheetLabel, { color: t.text.secondary }]}>{tr.finMoreSections}</Text>
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
                  style={[st.row, { backgroundColor: on ? t.action.primary : (gs.subtle.backgroundColor as string) }]}>
                  <IconSymbol name={TAB_ICON[tab]} size={16} color={on ? t.text.onAction : t.text.secondary} />
                  <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 15, fontFamily: fontFamily.medium, flex: 1, marginLeft: 10 }}>
                    {financeTabLabel(tab, tr)}
                  </Text>
                  {on ? <IconSymbol name="checkmark" size={14} color={t.text.onAction} /> : <IconSymbol name="chevron.right" size={12} color={t.text.secondary} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </SheetModal>
    </>
  );
}

// 40 + 3 + 3 = 46: ціль ≥44; смуга має вертикальні поля 3, тож hitSlop не
// виходить за bounds батька (A11Y-08).
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

type FinanceFilterBarProps = {
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
};

/**
 * Планшет (DS v2.5): період · валюта · ракурс · тип — ОДИН ряд `FilterBar`
 * (36pt), що не вліз — у «Фільтри · N». Телефон — чип і шторка, як було.
 */
export function FinanceFilterBar(props: FinanceFilterBarProps) {
  return useFiltersV25() ? <FinanceFilterBarV25 {...props} /> : <FinanceFilterBarLegacy {...props} />;
}

function FinanceFilterBarV25({
  filter, currencies, onPeriod, onCurrency, onScope, showScope = true, c, tr, isDark,
  txType, onTxType,
}: FinanceFilterBarProps) {
  const { t } = useDS();
  const gs = useGlassStyles();
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodLabel = labelPeriodLocalized(filter.period, tr.months, tr.monthsShort);
  const primary = currencies[0];
  const scopeOptions = MONEY_SCOPES.map(o => ({ value: o, label: moneyScopeText(o, tr) }));
  const typeOptions = (['all', 'income', 'expense'] as const).map(o => ({ value: o, label: txTypeText(o, tr) }));

  return (
    <>
      <FilterBar
        label={tr.finFilterButton}
        overflowLabel={tr.filters}
        style={{ flex: 1, minWidth: 0, marginTop: 10 }}
        items={[
          {
            id: 'period',
            pinned: true,
            node: (
              <View style={st.v25Hit}>
                <View style={[st.periodBox, st.v25Period, { ...gs.card }]}>
                  <TouchableOpacity
                    onPress={() => onPeriod(shiftPeriod(filter.period, -1))}
                    accessibilityRole="button"
                    accessibilityLabel={tr.finPeriodPrev}
                    style={st.v25Arrow}>
                    <IconSymbol name="chevron.left" size={14} color={t.text.secondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPeriodOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${tr.finFilterPeriod}: ${periodLabel}`}
                    style={st.v25PeriodBtn}>
                    <Text numberOfLines={1} style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.medium, maxWidth: 180, ...dsType.numeric }}>{periodLabel}</Text>
                    <IconSymbol name="chevron.down" size={14} color={t.text.secondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onPeriod(shiftPeriod(filter.period, 1))}
                    accessibilityRole="button"
                    accessibilityLabel={tr.finPeriodNext}
                    style={st.v25Arrow}>
                    <IconSymbol name="chevron.right" size={14} color={t.text.secondary} />
                  </TouchableOpacity>
                </View>
              </View>
            ),
          },
          ...(currencies.length > 0 ? [{
            id: 'currency',
            active: Boolean(primary) && filter.currency !== primary,
            menuLabel: tr.finFilterCurrency,
            node: (
              <FilterSelect<string>
                label={tr.finFilterCurrency}
                value={filter.currency}
                neutralValue={primary}
                onChange={v => onCurrency(v ?? primary)}
                options={currencies.map(code => ({ value: code, label: code }))}
              />
            ),
          }] : []),
          ...(showScope ? [{
            id: 'scope',
            active: filter.scope !== 'all',
            menuLabel: tr.budgetScopeLabel,
            node: (
              <FilterSelect<MoneyScope>
                label={tr.budgetScopeLabel}
                value={filter.scope}
                neutralValue="all"
                onChange={v => onScope(v ?? 'all')}
                options={scopeOptions}
              />
            ),
          }] : []),
          ...(txType && onTxType ? [{
            id: 'type',
            active: txType !== 'all',
            menuLabel: tr.finTxTypeLabel,
            node: (
              <Segmented<FinanceTxType>
                label={tr.finTxTypeLabel}
                value={txType}
                onChange={onTxType}
                options={typeOptions}
              />
            ),
          }] : []),
        ]}
      />
      <PeriodSheet
        visible={periodOpen}
        onClose={() => setPeriodOpen(false)}
        period={filter.period}
        onPick={p => { onPeriod(p); setPeriodOpen(false); }}
        c={c}
        tr={tr}
        isWide
        isDark={isDark}
      />
    </>
  );
}

function FinanceFilterBarLegacy({
  filter, currencies, onPeriod, onCurrency, onScope, showScope = true, c, tr, isDark,
  txType, onTxType,
}: FinanceFilterBarProps) {
  const { isWide, height } = useResponsive();
  const { t } = useDS();
  const gs = useGlassStyles();
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
      <View style={[st.periodBox, { ...gs.card }]}>
        <TouchableOpacity
          onPress={() => onPeriod(shiftPeriod(filter.period, -1))}
          accessibilityRole="button"
          accessibilityLabel={tr.finPeriodPrev}
          hitSlop={HIT}
          style={st.arrow}>
          <IconSymbol name="chevron.left" size={14} color={t.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setPeriodOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${tr.finFilterPeriod}: ${periodLabel}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, minHeight: 36 }}>
          <Text numberOfLines={1} style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, maxWidth: 180, ...dsType.numeric }}>{periodLabel}</Text>
          <IconSymbol name="chevron.down" size={12} color={t.text.secondary} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onPeriod(shiftPeriod(filter.period, 1))}
          accessibilityRole="button"
          accessibilityLabel={tr.finPeriodNext}
          hitSlop={HIT}
          style={st.arrow}>
          <IconSymbol name="chevron.right" size={14} color={t.text.secondary} />
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
        style={[st.chip, { backgroundColor: chipActive ? t.action.primary : (gs.card.backgroundColor as string), flexDirection: 'row', gap: 4 }]}>
        <IconSymbol name="line.3.horizontal.decrease" size={12} color={chipActive ? t.text.onAction : t.text.secondary} />
        <Text numberOfLines={1} style={{ color: chipActive ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold }}>
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
        <View style={[st.sheet, sheetColumnStyle(isWide), { ...gs.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
          <OverlayMaterial isDark={isDark} radius={24} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[st.sheetLabel, { color: t.text.secondary }]}>{tr.finFilterCurrency}</Text>
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
                  style={[st.chip, { backgroundColor: on ? t.action.primary : (gs.subtle.backgroundColor as string) }]}>
                  <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold }}>{code}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {showScope ? (
            <>
              <Text style={[st.sheetLabel, { color: t.text.secondary, marginTop: 20 }]}>{tr.budgetScopeLabel}</Text>
              <ScopeRadios scope={filter.scope} onScope={onScope} c={c} tr={tr} />
            </>
          ) : null}
          {txType && onTxType ? (
            <>
              <Text style={[st.sheetLabel, { color: t.text.secondary, marginTop: 20 }]}>{tr.finTxTypeLabel}</Text>
              <TxTypeRadios type={txType} onType={onTxType} c={c} tr={tr} />
            </>
          ) : null}
          <TouchableOpacity
            onPress={() => setFilterOpen(false)}
            accessibilityRole="button"
            style={[st.primaryBtn, { backgroundColor: t.action.primary, marginTop: 24 }]}>
            <Text style={{ ...dsType.label, color: t.text.onAction }}>{tr.close}</Text>
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
  const { t } = useDS();
  const gs = useGlassStyles();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={tr.finTxTypeLabel}
      style={[st.segment, { ...gs.subtle, alignSelf: 'flex-start' }]}>
      {(['all', 'income', 'expense'] as const).map(option => {
        const on = option === type;
        const label = txTypeText(option, tr);
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onType(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={label}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[st.segmentBtn, on && { backgroundColor: t.action.primary }]}>
            <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
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
  const { t } = useDS();
  const gs = useGlassStyles();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={tr.budgetScopeLabel}
      style={[st.segment, { ...gs.subtle }]}>
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
            style={[st.segmentBtn, on && { backgroundColor: t.action.primary }]}>
            <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
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
  const { t } = useDS();
  const gs = useGlassStyles();
  const inputBg = (gs.subtle.backgroundColor as string);

  const pick = (preset: PeriodPreset) => onPick(resolvePeriod(preset, '', new Date()));

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={[st.sheet, sheetColumnStyle(isWide), { ...gs.strong, backgroundColor: glassOf(dsTheme(isDark)).sheet, maxHeight: height * 0.88 }, shadow[isDark ? 'dark' : 'light'].popover]}>
        <OverlayMaterial isDark={isDark} radius={24} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={[st.sheetLabel, { color: t.text.secondary }]}>{tr.finFilterPeriod}</Text>
          <View style={{ gap: 6 }} accessibilityRole="radiogroup">
            {presets.map(preset => {
              const on = period.preset === preset && resolvePeriod(preset, '', new Date()).key === period.key;
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => pick(preset)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  style={[st.row, { backgroundColor: on ? t.action.primary : (gs.subtle.backgroundColor as string) }]}>
                  <Text style={{ color: on ? t.text.onAction : t.text.primary, fontSize: 14, fontFamily: fontFamily.medium, flex: 1 }}>
                    {periodPresetLabel(preset, tr)}
                  </Text>
                  {on ? <IconSymbol name="checkmark" size={14} color={t.text.onAction} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[st.sheetLabel, { color: t.text.secondary, marginTop: 20 }]}>{tr.finPresetCustom}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={from}
              onChangeText={setFrom}
              placeholder="2026-01-01"
              placeholderTextColor={t.text.muted}
              accessibilityLabel={tr.finCustomFrom}
              autoCapitalize="none"
              style={[st.input, { color: c.text, backgroundColor: inputBg }]}
            />
            <TextInput
              value={to}
              onChangeText={setTo}
              placeholder="2026-03-31"
              placeholderTextColor={t.text.muted}
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
            style={[st.primaryBtn, { backgroundColor: customValid ? t.action.primary : t.state.disabledBg, marginTop: 12 }]}>
            <Text style={{ ...dsType.label, color: customValid ? t.text.onAction : t.state.disabledText }}>{tr.finApply}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const st = StyleSheet.create({
  // Сегментований перемикач DS v2: біла pill-доріжка, активний сегмент — pill action.primary.
  segBar: { flexDirection: 'row', paddingVertical: 4, marginTop: 10, gap: 8 },
  seg: { flexDirection: 'row', minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segStretch: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingHorizontal: 8 },
  periodBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 4 },
  arrow: { width: 32, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', borderRadius: radius.pill, padding: 4 },
  segmentBtn: { minHeight: 34, paddingHorizontal: 14, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sheet: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.cardPadding, paddingBottom: 36 },
  sheetLabel: { fontSize: 13, fontFamily: fontFamily.medium, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget, borderRadius: radius.pill, paddingHorizontal: 16 },
  input: { flex: 1, minHeight: touchTarget, borderRadius: radius.control, paddingHorizontal: space[4], fontSize: 15, fontFamily: fontFamily.regular, ...dsType.numeric },
  primaryBtn: { minHeight: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  // DS v2.5 (планшет): видимо 36pt, рамка дотику 44pt — без hitSlop (A11Y-08).
  v25Row: { flexDirection: 'row', alignItems: 'center', gap: FILTER_GAP },
  v25Hit: { height: FILTER_HIT_H, justifyContent: 'center' },
  v25Period: { height: FILTER_CONTROL_H, paddingHorizontal: 0 },
  v25Arrow: { width: 36, height: FILTER_HIT_H, alignItems: 'center', justifyContent: 'center' },
  v25PeriodBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, height: FILTER_HIT_H },
});
