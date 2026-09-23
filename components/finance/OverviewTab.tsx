/**
 * components/finance/OverviewTab.tsx — вкладка «Огляд» (finance-revamp.md §6, §9.4):
 * попередження про мінус → Cash Flow факт → прогноз 30/90 → баланси рахунків.
 *
 * Уся арифметика — у utils/finance/* (cashflowFact, cashflowForecast); тут
 * лише показ. Прогноз — завжди в ракурсі «Всі» (§3.2), про що є підпис.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { Account } from '@/utils/accounts';
import { cashflowFact } from '@/utils/finance/cashflow';
import type { CategoryRowLike } from '@/utils/finance/classify';
import { cashflowForecast, largestOutflowsUntil } from '@/utils/finance/forecast';
import type { FinanceFilter } from '@/utils/finance/period';
import type { RecurringIncome } from '@/utils/finance/recurring';
import type { FinanceOverview } from '@/utils/financeOverview';
import type { Transaction } from '@/utils/financeUtils';
import { formatDateKey, type Subscription } from '@/utils/subscriptions';
import { CashflowFactChart, ForecastChart } from './CashflowCharts';
import type { FinColors } from './financeLabels';

export interface OverviewTabProps {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categoryRows: readonly CategoryRowLike[];
  subscriptions: readonly Subscription[];
  recurringIncomes: readonly RecurringIncome[];
  filter: FinanceFilter;
  primary: string;
  overview: FinanceOverview;
  money: (amount: number, code: string) => string;
  c: FinColors;
  tr: Translations;
  locale: string;
  isWide: boolean;
  bottomInset: number;
  onOpenUnassigned: () => void;
  onOpenSubscriptions: () => void;
  onOpenAccount: (account: Account) => void;
}

export function OverviewTab(props: OverviewTabProps) {
  const {
    transactions, accounts, categoryRows, subscriptions, recurringIncomes, filter, primary,
    overview, money, c, tr, locale, isWide, bottomInset,
  } = props;
  const [horizon, setHorizon] = useState<30 | 90>(30);
  const [showDays, setShowDays] = useState(false);
  const currency = filter.currency;

  const fact = useMemo(
    () => cashflowFact({ transactions, accounts, filter, primary, now: new Date() }),
    [transactions, accounts, filter, primary],
  );
  const forecast = useMemo(
    () => cashflowForecast({
      transactions, accounts, categories: categoryRows, subscriptions, recurringIncomes,
      currency, primary, now: new Date(), horizonDays: horizon,
    }),
    [transactions, accounts, categoryRows, subscriptions, recurringIncomes, currency, primary, horizon],
  );
  // Попередження рахуємо на ДОВШОМУ горизонті: мінус через два місяці — теж
  // привід сказати зараз, навіть коли на графіку обрано 30 днів.
  const warning = useMemo(() => {
    const long = horizon === 90 ? forecast : cashflowForecast({
      transactions, accounts, categories: categoryRows, subscriptions, recurringIncomes,
      currency, primary, now: new Date(), horizonDays: 90,
    });
    if (!long.shortfall) return null;
    return { shortfall: long.shortfall, biggest: largestOutflowsUntil(long, long.shortfall.day, 3) };
  }, [forecast, horizon, transactions, accounts, categoryRows, subscriptions, recurringIncomes, currency, primary]);

  const accountsInCurrency = accounts.filter(a => !a.archived && (a.currency || 'UAH') === currency);
  const total = overview.totalByCurrency[currency] ?? 0;
  const plannedNet = overview.future.netByCurrency[currency];

  const date = (key: string) => formatDateKey(key, locale);
  const signed = (n: number) => (n < 0 ? `−${money(-n, currency)}` : money(n, currency));
  const eventDays = forecast.points.filter(p => p.events.some(e => e.kind !== 'variable'));

  const warningCard = warning ? (
    <View
      accessibilityLiveRegion="polite"
      style={[st.card, { borderColor: c.red + '55', backgroundColor: c.red + '12' }]}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={c.red} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '800' }}>
            {tr.finShortfallTitle
              .replace('{date}', date(warning.shortfall.day))
              .replace('{amount}', signed(warning.shortfall.balance))}
          </Text>
          {warning.biggest.length > 0 ? (
            <Text style={{ color: c.sub, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
              {tr.finShortfallBiggest.replace('{list}', warning.biggest
                .map(ev => `${ev.label || '—'} ${money(-ev.amount, currency)} (${date(ev.day)})`)
                .join(', '))}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <TouchableOpacity
              onPress={() => { setHorizon(90); setShowDays(true); }}
              accessibilityRole="button"
              style={[st.smallBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
              <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{tr.finViewForecast}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={props.onOpenSubscriptions}
              accessibilityRole="button"
              style={[st.smallBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
              <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{tr.finEditSubscriptions}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  ) : null;

  const factCard = (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[st.cardTitle, { color: c.sub }]}>{tr.finFactTitle} · {currency}</Text>
      {fact.points.length > 0 ? (
        <CashflowFactChart
          points={fact.points}
          c={c}
          summary={`${tr.finInflow} ${money(fact.inflow, currency)}, ${tr.finOutflow} ${money(fact.outflow, currency)}`}
        />
      ) : (
        <Text style={{ color: c.sub, fontSize: 13 }}>{tr.finNoData}</Text>
      )}
      <View style={st.statsRow}>
        <Stat label={tr.finInflow} value={money(fact.inflow, currency)} color={c.green} c={c} />
        <Stat label={tr.finOutflow} value={money(fact.outflow, currency)} color={c.red} c={c} />
      </View>
      <View style={st.statsRow}>
        <Stat label={tr.finOpening} value={signed(fact.opening)} color={c.text} c={c} />
        <Stat
          label={tr.finClosing}
          value={signed(fact.points.length ? fact.points[fact.points.length - 1].balance : fact.opening)}
          color={c.text}
          c={c}
        />
      </View>
      {filter.scope !== 'all' ? (
        <Text style={{ color: c.sub, fontSize: 11, marginTop: 8 }}>{tr.finBalanceAllScopes}</Text>
      ) : null}
    </View>
  );

  const forecastCard = (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={[st.cardTitle, { color: c.sub, flex: 1, marginBottom: 0 }]}>{tr.finForecastTitle}</Text>
        <View accessibilityRole="radiogroup" style={[st.segment, { borderColor: c.border, backgroundColor: c.dim }]}>
          {([30, 90] as const).map(h => {
            const on = horizon === h;
            return (
              <TouchableOpacity
                key={h}
                onPress={() => setHorizon(h)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                style={[st.segmentBtn, on && { backgroundColor: c.accent }]}>
                <Text style={{ color: on ? '#fff' : c.sub, fontSize: 12, fontWeight: '700' }}>
                  {h === 30 ? tr.finForecast30 : tr.finForecast90}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ForecastChart
        points={forecast.points}
        c={c}
        summary={tr.finForecastOn
          .replace('{date}', date(forecast.points[forecast.points.length - 1]?.day ?? ''))
          .replace('{amount}', signed(forecast.closing))}
      />
      <Text style={{ color: forecast.closing < 0 ? c.red : c.text, fontSize: 15, fontWeight: '800', marginTop: 10 }}>
        {tr.finForecastOn
          .replace('{date}', date(forecast.points[forecast.points.length - 1]?.day ?? ''))
          .replace('{amount}', signed(forecast.closing))}
      </Text>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>
        {tr.finAvgVariable.replace('{amount}', money(forecast.avgDailyVariable, currency))}
      </Text>
      {forecast.basis === 'thin' ? (
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 4 }}>{tr.finForecastThin}</Text>
      ) : null}
      <Text style={{ color: c.sub, fontSize: 11, marginTop: 6 }}>{tr.finForecastAllScope}</Text>

      {eventDays.length > 0 ? (
        <TouchableOpacity
          onPress={() => setShowDays(v => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showDays }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, minHeight: 32 }}>
          <IconSymbol name={showDays ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
          <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>
            {tr.finForecastEvents} ({eventDays.length})
          </Text>
        </TouchableOpacity>
      ) : null}
      {showDays ? eventDays.map(p => (
        <View key={p.day} style={[st.eventDay, { borderTopColor: c.border }]}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', flex: 1 }}>{date(p.day)}</Text>
            <Text style={{ color: p.balance < 0 ? c.red : c.sub, fontSize: 12, fontWeight: '700' }}>{signed(p.balance)}</Text>
          </View>
          {p.events.filter(e => e.kind !== 'variable').map((ev, i) => (
            <Text key={`${ev.sourceId ?? ''}-${i}`} style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
              {ev.amount > 0 ? '+' : '−'}{money(Math.abs(ev.amount), currency)} · {ev.label || '—'}
              {' · '}{sourceLabel(ev.kind, tr)}{ev.overdue ? ` · ${tr.finOverdue}` : ''}
            </Text>
          ))}
        </View>
      )) : null}
    </View>
  );

  const balancesCard = (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={[st.cardTitle, { color: c.sub }]}>{tr.finOnAccounts.replace('{currency}', currency)}</Text>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}>{signed(total)}</Text>
      {accountsInCurrency.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 13, marginTop: 6 }}>{tr.finNoAccountsInCurrency.replace('{currency}', currency)}</Text>
      ) : accountsInCurrency.map(a => (
        <TouchableOpacity
          key={a.id}
          onPress={() => props.onOpenAccount(a)}
          accessibilityRole="button"
          accessibilityLabel={`${a.name}: ${signed(overview.balances[a.id] ?? 0)}`}
          style={[st.accountRow, { borderTopColor: c.border }]}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, flex: 1 }}>{a.name}</Text>
          <Text style={{ color: (overview.balances[a.id] ?? 0) < 0 ? c.red : c.text, fontSize: 14, fontWeight: '700' }}>
            {signed(overview.balances[a.id] ?? 0)}
          </Text>
        </TouchableOpacity>
      ))}
      {overview.unassigned.count > 0 ? (
        <TouchableOpacity
          onPress={props.onOpenUnassigned}
          accessibilityRole="button"
          style={[st.accountRow, { borderTopColor: c.border }]}>
          <IconSymbol name="exclamationmark.circle" size={14} color={c.red} />
          <Text style={{ color: c.text, fontSize: 13, flex: 1, marginLeft: 6 }}>
            {tr.finUnassignedHint.replace('{n}', String(overview.unassigned.count))}
          </Text>
          <IconSymbol name="chevron.right" size={12} color={c.sub} />
        </TouchableOpacity>
      ) : null}
      {overview.future.count > 0 && plannedNet !== undefined ? (
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 8 }}>
          {tr.finPlannedHint
            .replace('{n}', String(overview.future.count))
            .replace('{amount}', signed(plannedNet))}
        </Text>
      ) : null}
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {warningCard}
      {isWide ? (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.4, minWidth: 0 }}>{factCard}{forecastCard}</View>
          <View style={{ flex: 1, minWidth: 0 }}>{balancesCard}</View>
        </View>
      ) : (
        <>
          {balancesCard}
          {factCard}
          {forecastCard}
        </>
      )}
    </ScrollView>
  );
}

function sourceLabel(kind: string, tr: Translations): string {
  switch (kind) {
    case 'subscription': return tr.finSourceSubscription;
    case 'recurring_income': return tr.finSourceIncome;
    case 'planned_tx': return tr.finSourcePlanned;
    default: return tr.finEventVariable;
  }
}

function Stat({ label, value, color, c }: { label: string; value: string; color: string; c: FinColors }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: c.sub, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <Text numberOfLines={1} style={{ color, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 10 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 2 },
  segmentBtn: { minHeight: 30, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  accountRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6 },
  eventDay: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
