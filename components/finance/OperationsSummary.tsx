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
 *
 * Omni (DS v2.2): суцільна BentoCard — шапка «icon-chip + Залишки», праворуч
 * pill «Рахунки ›»; сума — великі тонкі цифри. Плашки під карткою — суцільні.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';
import type { CurrencyTotals } from '@/utils/financeUtils';
import type { FinColors } from './financeLabels';
import { BentoCard } from '@/components/ds';

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
  const { t } = useDS();
  const codes = orderCurrencies(Object.keys(totals), primaryCode);
  const shown = codes.length > 0 ? codes : [primaryCode];

  return (
    <View style={style}>
      <BentoCard
        compact
        title={tr.finBalances}
        icon="creditcard.fill"
        accent="lime"
        headerRight={
          <TouchableOpacity
            onPress={onOpenAccounts}
            accessibilityRole="button"
            accessibilityLabel={tr.finOpenAccounts}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            style={[st.link, { backgroundColor: t.surface.subtle }]}>
            <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.medium }}>{tr.finOpenAccounts}</Text>
            <IconSymbol name="chevron.right" size={10} color={t.text.secondary} />
          </TouchableOpacity>
        }>

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
                    style={{ ...dsType.display, fontFamily: fontFamily.light, color: value < 0 ? t.status.danger : t.text.primary }}>
                    {fmt(value, code)}
                  </Text>
                  {/* Перенесений залишок — ПІД сумою (як і раніше на головній картці). */}
                  {carry !== 0 ? (
                    <Text numberOfLines={1} style={{ ...dsType.caption, ...dsType.numeric, color: t.text.secondary, marginTop: 4 }}>
                      {tr.carryover}: {carry > 0 ? '+' : ''}{fmt(carry, code)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ marginTop: 6 }}>
            <Text style={{ ...dsType.h2, color: t.text.primary }}>{tr.noAccounts}</Text>
            <Text style={{ ...dsType.caption, color: t.text.secondary, marginTop: 2, lineHeight: 17 }}>{tr.noAccountsHint}</Text>
            <TouchableOpacity
              onPress={onNewAccount}
              accessibilityRole="button"
              accessibilityLabel={tr.newAccount}
              style={[st.newBtn, { backgroundColor: t.action.primary }]}>
              <IconSymbol name="plus" size={14} color={t.text.onAction} />
              <Text style={{ ...dsType.label, color: t.text.onAction }}>{tr.newAccount}</Text>
            </TouchableOpacity>
          </View>
        )}
      </BentoCard>

      {unassignedLabel ? (
        <TouchableOpacity
          onPress={onPressUnassigned}
          accessibilityRole="button"
          accessibilityState={{ selected: !!unassignedActive }}
          accessibilityLabel={unassignedLabel}
          style={[st.warn, { backgroundColor: unassignedActive ? t.action.primary : t.surface.card }]}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color={t.status.warning} />
          <Text style={{ color: unassignedActive ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.medium, flex: 1 }}>{unassignedLabel}</Text>
          <IconSymbol name={unassignedActive ? 'xmark' : 'chevron.right'} size={12} color={unassignedActive ? t.text.onAction : t.text.secondary} />
        </TouchableOpacity>
      ) : null}

      {accountFilterName ? (
        <TouchableOpacity
          onPress={onClearAccountFilter}
          accessibilityRole="button"
          accessibilityLabel={`${tr.finAccountFilterChip.replace('{name}', accountFilterName)}. ${tr.resetFilter}`}
          style={[st.chip, { backgroundColor: t.action.primary }]}>
          <IconSymbol name="creditcard.fill" size={12} color={t.text.onAction} />
          <Text numberOfLines={1} style={{ color: t.text.onAction, fontSize: 13, fontFamily: fontFamily.semibold, flexShrink: 1 }}>
            {tr.finAccountFilterChip.replace('{name}', accountFilterName)}
          </Text>
          <IconSymbol name="xmark" size={12} color={t.text.onAction} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill },
  amounts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 12 },
  newBtn: { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, minHeight: 44, borderRadius: radius.pill },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, marginTop: 12, maxWidth: '100%' },
});
