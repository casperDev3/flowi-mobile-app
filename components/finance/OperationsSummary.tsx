import { Atlas } from '@/constants/atlas';
/**
 * components/finance/OperationsSummary.tsx — компактні «Залишки» над стрічкою
 * вкладки «Операції» (на телефоні) або в бічній колонці (планшет ≥840).
 *
 * Рішення власника: в «Операціях» одразу видно і операції, і залишки. Стрічка
 * карток рахунків та оборот місяця переїхали у вкладку «Рахунки» — тут лише
 * «На рахунках» по кожній валюті (та сама цифра, що на плитці «Сьогодні»,
 * з utils/financeOverview.ts) і під кожною — «Перенесено з минулого» за
 * період фільтра (calcPeriodTotalsByCurrency). Курсів немає, тож суми «≈
 * усього» між валютами немає свідомо.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { CurrencyTotals } from '@/utils/financeUtils';
import type { FinColors } from './financeLabels';

export interface OperationsSummaryProps {
  /** Валюта → сума балансів активних рахунків (financeOverview.totalByCurrency). */
  totals: Record<string, number>;
  /** Підсумки періоду фільтра: звідси «перенесено з минулого». */
  periodTotals: Record<string, CurrencyTotals>;
  primaryCode: string;
  hasAccounts: boolean;
  /** Суми з точністю валюти (fmtCur екрана). */
  fmt: (n: number, code: string) => string;
  c: FinColors;
  tr: Translations;
  onOpenAccounts: () => void;
  onNewAccount: () => void;
  /** Текст попередження про операції без рахунку; null — попередження немає. */
  unassignedLabel?: string | null;
  unassignedActive?: boolean;
  onPressUnassigned?: () => void;
  /** Назва рахунку, яким зараз відфільтровано стрічку; null — фільтра немає. */
  accountFilterName?: string | null;
  onClearAccountFilter?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Основна валюта першою, решта — за абеткою. */
export function orderCurrencies(codes: readonly string[], primary: string): string[] {
  return [...codes].sort((a, b) => (a === primary ? -1 : b === primary ? 1 : a.localeCompare(b)));
}

export function OperationsSummary({
  totals, periodTotals, primaryCode, hasAccounts, fmt, c, tr,
  onOpenAccounts, onNewAccount, unassignedLabel, unassignedActive, onPressUnassigned,
  accountFilterName, onClearAccountFilter, style,
}: OperationsSummaryProps) {
  const codes = orderCurrencies(Object.keys(totals), primaryCode);
  const shown = codes.length > 0 ? codes : [primaryCode];

  return (
    <View style={style}>
      <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
        <View style={st.head}>
          <Text style={[st.label, { color: c.sub }]}>{tr.finBalances}</Text>
          <TouchableOpacity
            onPress={onOpenAccounts}
            accessibilityRole="button"
            accessibilityLabel={tr.finOpenAccounts}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            style={st.link}>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{tr.finOpenAccounts}</Text>
            <IconSymbol name="chevron.right" size={11} color={c.accent} />
          </TouchableOpacity>
        </View>

        {hasAccounts ? (
          <View style={st.amounts}>
            {shown.map(code => {
              const value = totals[code] ?? 0;
              const carry = periodTotals[code]?.carryover ?? 0;
              return (
                <View key={code} style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    accessibilityLabel={`${tr.totalOnAccounts} ${fmt(value, code)}`}
                    style={{ color: value < 0 ? c.red : c.text, fontSize: 22, fontWeight: Atlas.type.headingWeight, letterSpacing: -0.5 }}>
                    {fmt(value, code)}
                  </Text>
                  {/* Перенесений залишок — ПІД сумою (як і раніше на головній картці). */}
                  {carry !== 0 ? (
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                      {tr.carryover}: {carry > 0 ? '+' : ''}{fmt(carry, code)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '700' }}>{tr.noAccounts}</Text>
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{tr.noAccountsHint}</Text>
            <TouchableOpacity
              onPress={onNewAccount}
              accessibilityRole="button"
              accessibilityLabel={tr.newAccount}
              style={[st.newBtn, { backgroundColor: c.accent }]}>
              <IconSymbol name="plus" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{tr.newAccount}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {unassignedLabel ? (
        <TouchableOpacity
          onPress={onPressUnassigned}
          accessibilityRole="button"
          accessibilityState={{ selected: !!unassignedActive }}
          accessibilityLabel={unassignedLabel}
          style={[st.warn, { borderColor: unassignedActive ? '#F59E0B' : '#F59E0B66', backgroundColor: '#F59E0B' + (unassignedActive ? '26' : '12') }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color="#F59E0B" />
          <Text style={{ color: c.text, fontSize: 12, fontWeight: '600', flex: 1 }}>{unassignedLabel}</Text>
          <IconSymbol name={unassignedActive ? 'xmark' : 'chevron.right'} size={12} color={c.sub} />
        </TouchableOpacity>
      ) : null}

      {accountFilterName ? (
        <TouchableOpacity
          onPress={onClearAccountFilter}
          accessibilityRole="button"
          accessibilityLabel={`${tr.finAccountFilterChip.replace('{name}', accountFilterName)}. ${tr.resetFilter}`}
          style={[st.chip, { backgroundColor: c.accent + '18', borderColor: c.accent + '60' }]}>
          <IconSymbol name="creditcard.fill" size={12} color={c.accent} />
          <Text numberOfLines={1} style={{ color: c.accent, fontSize: 12, fontWeight: '700', flexShrink: 1 }}>
            {tr.finAccountFilterChip.replace('{name}', accountFilterName)}
          </Text>
          <IconSymbol name="xmark" size={12} color={c.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Atlas.radius.xlarge, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  amounts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 8 },
  newBtn: { marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 44, borderRadius: Atlas.radius.medium },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Atlas.radius.medium, borderWidth: 1, marginTop: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 12, borderRadius: Atlas.radius.xlarge, borderWidth: 1, marginTop: 10, maxWidth: '100%' },
});
