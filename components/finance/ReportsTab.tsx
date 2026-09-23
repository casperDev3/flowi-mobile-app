/**
 * components/finance/ReportsTab.tsx — вкладка «Звіти» (finance-revamp.md §5.3–§5.4, §9.1):
 * P&L (Доходи → Фіксовані → Змінні → Чистий результат → Норма заощаджень) з
 * порівнянням до попереднього періоду й середнього за три, і структура
 * витрат за групами. Перекази не входять ніде.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { Account } from '@/utils/accounts';
import type { CategoryRowLike, CostKind } from '@/utils/finance/classify';
import { labelPeriodLocalized, shiftPeriod, type FinanceFilter } from '@/utils/finance/period';
import {
  buildPnl, comparePnl, NO_CATEGORY_LABEL,
  type PnlDelta, type PnlField,
} from '@/utils/finance/pnl';
import type { Transaction } from '@/utils/financeUtils';
import type { Subscription } from '@/utils/subscriptions';
import { categoryGroupLabel, costKindLabel, type FinColors } from './financeLabels';

export interface ReportsTabProps {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categoryRows: readonly CategoryRowLike[];
  subscriptions: readonly Subscription[];
  filter: FinanceFilter;
  primary: string;
  money: (amount: number, code: string) => string;
  c: FinColors;
  tr: Translations;
  locale: string;
  isWide: boolean;
  bottomInset: number;
  onAssignCategories: () => void;
}

type CostFilter = 'all' | CostKind;

export function ReportsTab(props: ReportsTabProps) {
  const {
    transactions, accounts, categoryRows, subscriptions, filter, primary, money, c, tr, isWide, bottomInset,
  } = props;
  const [costFilter, setCostFilter] = useState<CostFilter>('all');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const currency = filter.currency;

  const input = useMemo(
    () => ({ transactions, accounts, categories: categoryRows, subscriptions, filter, primary }),
    [transactions, accounts, categoryRows, subscriptions, filter, primary],
  );
  const pnl = useMemo(() => buildPnl(input), [input]);
  const cmp = useMemo(() => comparePnl(input), [input]);

  /** Обороти в інших валютах — окремо, без зведення (§7.1). */
  const uncounted = useMemo(
    () => pnl.uncounted.map(row => {
      const parts: string[] = [];
      if (row.income) parts.push(`+${money(row.income, row.currency)}`);
      if (row.expense) parts.push(`−${money(row.expense, row.currency)}`);
      return parts.join(' ');
    }).filter(Boolean),
    [pnl.uncounted, money],
  );

  const t = pnl.totals;
  const prevLabel = labelPeriodLocalized(shiftPeriod(filter.period, -1), tr.months, tr.monthsShort);
  const deltaFor = (list: PnlDelta[], field: PnlField) => list.find(d => d.field === field);
  const signed = (n: number) => (n < 0 ? `−${money(-n, currency)}` : money(n, currency));
  const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 100))}%`);

  /** Для витрат ріст — погано; для доходу, результату й норми — добре. */
  const goodWhenUp = (field: PnlField) => field === 'income' || field === 'net' || field === 'savingsRate';

  const deltaLine = (field: PnlField) => {
    const prev = deltaFor(cmp.delta, field);
    const avg = deltaFor(cmp.deltaAverage, field);
    const fmt = (d: PnlDelta | undefined) => {
      if (!d) return '—';
      if (field === 'savingsRate') {
        if (d.abs === null) return '—';
        const pp = Math.round(d.abs * 100);
        return `${pp > 0 ? '+' : pp < 0 ? '−' : ''}${Math.abs(pp)} ${tr.finPp}`;
      }
      return pct(d.pct);
    };
    const colorOf = (d: PnlDelta | undefined) => {
      if (!d || d.abs === null || d.abs === 0 || (field !== 'savingsRate' && d.pct === null)) return c.sub;
      const up = d.abs > 0;
      return up === goodWhenUp(field) ? c.green : c.red;
    };
    return (
      <View style={{ marginTop: 2 }}>
        <Text style={{ color: colorOf(prev), fontSize: 11 }}>
          {fmt(prev)} {tr.finVsPrev.replace('{period}', prevLabel)}
        </Text>
        {cmp.basis > 0 ? (
          <Text style={{ color: colorOf(avg), fontSize: 11 }}>
            {fmt(avg)} {tr.finVsAvg.replace('{n}', String(cmp.basis))}
          </Text>
        ) : null}
      </View>
    );
  };

  const row = (label: string, value: string, field: PnlField, opts: { strong?: boolean; color?: string } = {}) => (
    <View style={{ paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={{ color: c.text, fontSize: opts.strong ? 15 : 14, fontWeight: opts.strong ? '800' : '600', flex: 1 }}>{label}</Text>
        <Text style={{ color: opts.color ?? c.text, fontSize: opts.strong ? 17 : 15, fontWeight: '800' }}>{value}</Text>
      </View>
      {deltaLine(field)}
    </View>
  );

  const pnlCard = (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[st.cardTitle, { color: c.sub }]}>
        {tr.finPnlTitle} · {labelPeriodLocalized(filter.period, tr.months, tr.monthsShort)} · {currency}
      </Text>
      {row(tr.finIncome, money(t.income, currency), 'income', { color: c.green })}
      {row(tr.finFixed, money(t.fixedExpense, currency), 'fixedExpense')}
      {row(tr.finVariable, money(t.variableExpense, currency), 'variableExpense')}
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
      {row(tr.finNet, signed(t.net), 'net', { strong: true, color: t.net < 0 ? c.red : c.green })}
      {row(
        tr.finSavingsRate,
        t.savingsRate === null ? '—' : `${Math.round(t.savingsRate * 100)}%`,
        'savingsRate',
        { strong: true },
      )}
      <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{tr.finTransfersExcluded}</Text>
      {uncounted.length > 0 ? (
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>{tr.finOtherCurrencies.replace('{list}', uncounted.join(', '))}</Text>
      ) : null}
    </View>
  );

  const groups = pnl.groups.filter(g => costFilter === 'all' || g.cost === costFilter);
  const structureCard = (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[st.cardTitle, { color: c.sub }]}>{tr.finStructure}</Text>
      <View accessibilityRole="radiogroup" style={[st.segment, { borderColor: c.border, backgroundColor: c.dim, alignSelf: 'flex-start', marginBottom: 10 }]}>
        {(['all', 'fixed', 'variable'] as const).map(k => {
          const on = costFilter === k;
          const label = k === 'all' ? tr.finCostAll : costKindLabel(k, tr);
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setCostFilter(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={label}
              style={[st.segmentBtn, on && { backgroundColor: c.accent }]}>
              <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {groups.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 13 }}>{tr.finNoData}</Text>
      ) : groups.map(g => {
        const key = `${g.group}|${g.cost}`;
        const open = openGroup === key;
        return (
          <View key={key} style={{ marginBottom: 10 }}>
            <TouchableOpacity
              onPress={() => setOpenGroup(open ? null : key)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={{ minHeight: 40, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <IconSymbol name={open ? 'chevron.down' : 'chevron.right'} size={11} color={c.sub} />
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '700', flex: 1 }}>
                  {categoryGroupLabel(g.group, tr)}
                  <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}> · {costKindLabel(g.cost, tr)}</Text>
                </Text>
                <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>{money(g.value, currency)}</Text>
                <Text style={{ color: c.sub, fontSize: 12, width: 40, textAlign: 'right' }}>{Math.round(g.share * 100)}%</Text>
              </View>
              <View style={[st.bar, { backgroundColor: c.dim }]}>
                <View style={{ width: `${Math.min(100, Math.max(0, g.share * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: g.cost === 'fixed' ? c.accent : c.red + 'CC' }} />
              </View>
            </TouchableOpacity>
            {open ? g.categories.map(cat => (
              <View key={cat.name || '__none'} style={{ flexDirection: 'row', paddingLeft: 18, paddingVertical: 4 }}>
                <Text numberOfLines={1} style={{ color: c.sub, fontSize: 13, flex: 1 }}>
                  {!cat.name || cat.name === NO_CATEGORY_LABEL ? tr.finNoCategory : cat.name}
                </Text>
                <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{money(cat.value, currency)}</Text>
              </View>
            )) : null}
          </View>
        );
      })}
      {t.unclassifiedCount > 0 ? (
        <View style={[st.hint, { borderColor: c.border, backgroundColor: c.dim }]}>
          <IconSymbol name="info.circle" size={14} color={c.accent} />
          <Text style={{ color: c.sub, fontSize: 12, flex: 1, lineHeight: 17 }}>
            {tr.finUnclassified.replace('{n}', String(t.unclassifiedCount))}
          </Text>
          <TouchableOpacity
            onPress={props.onAssignCategories}
            accessibilityRole="button"
            style={[st.smallBtn, { borderColor: c.accent + '55' }]}>
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700' }}>{tr.finAssign}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 }}
      showsVerticalScrollIndicator={false}>
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>{pnlCard}</View>
          <View style={{ flex: 1.2, minWidth: 0 }}>{structureCard}</View>
        </View>
      ) : (
        <>
          {pnlCard}
          {structureCard}
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 2 },
  segmentBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 6 },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
