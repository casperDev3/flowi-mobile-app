import { Atlas } from '@/constants/atlas';
/**
 * components/finance/ReportsTab.tsx — вкладка «Звіти» (finance-revamp.md §5.3–§5.4, §6, §9.1).
 *
 * Одна стрічка за змістом (рішення власника 2026-10-07, «Огляд» влився сюди;
 * порядок — reportsSections() у utils/financeTabs.ts):
 *   попередження про мінус (якщо є) →
 *   1) Підсумок періоду — P&L (Доходи → Фіксовані → Змінні → Чистий
 *      результат → Норма заощаджень) з порівнянням до попереднього періоду й
 *      середнього за три;
 *   2) Куди йдуть гроші — структура витрат за групами;
 *   3) Рух коштів — факт за період;
 *   4) Прогноз 30/90 днів із подіями.
 * Баланси рахунків — лише на «Рахунках». Перекази не входять ніде.
 * Планшет: картки рядами по дві (reportsRows) — порядок читання зліва
 * направо збігається зі стрічкою телефона.
 *
 * Уся арифметика — у utils/finance/* (pnl, cashflow, forecast); тут лише показ.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { WIDE_CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import type { Translations } from '@/store/translations';
import type { Account } from '@/utils/accounts';
import { cashflowFact } from '@/utils/finance/cashflow';
import type { CategoryRowLike, CostKind } from '@/utils/finance/classify';
import { cashflowForecast, largestOutflowsUntil } from '@/utils/finance/forecast';
import { labelPeriodLocalized, shiftPeriod, type FinanceFilter } from '@/utils/finance/period';
import {
  buildPnl, comparePnl, NO_CATEGORY_LABEL,
  type PnlDelta, type PnlField,
} from '@/utils/finance/pnl';
import type { RecurringIncome } from '@/utils/finance/recurring';
import { reportsRows, reportsSections, type ReportsSection } from '@/utils/financeTabs';
import type { Transaction } from '@/utils/financeUtils';
import { formatDateKey, type Subscription } from '@/utils/subscriptions';
import { CashflowFactChart, ForecastChart } from './CashflowCharts';
import { categoryGroupLabel, costKindLabel, type FinColors } from './financeLabels';

export interface ReportsTabProps {
  transactions: readonly Transaction[];
  accounts: readonly Account[];
  categoryRows: readonly CategoryRowLike[];
  subscriptions: readonly Subscription[];
  recurringIncomes: readonly RecurringIncome[];
  filter: FinanceFilter;
  primary: string;
  money: (amount: number, code: string) => string;
  c: FinColors;
  tr: Translations;
  locale: string;
  isWide: boolean;
  bottomInset: number;
  onAssignCategories: () => void;
  /** Зсув прокрутки — екран ховає FAB «+», поки стрічку гортають униз. */
  onScrollY?: (y: number) => void;
  /** «Змінити підписки» з попередження; немає — підмодуль вимкнено, кнопки теж. */
  onOpenSubscriptions?: () => void;
}

type CostFilter = 'all' | CostKind;

export function ReportsTab(props: ReportsTabProps) {
  const {
    transactions, accounts, categoryRows, subscriptions, recurringIncomes, filter, primary,
    money, c, tr, locale, isWide, bottomInset, onScrollY,
  } = props;
  const [costFilter, setCostFilter] = useState<CostFilter>('all');
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<30 | 90>(30);
  const [showDays, setShowDays] = useState(false);
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

  const t = pnl.totals;
  const prevLabel = labelPeriodLocalized(shiftPeriod(filter.period, -1), tr.months, tr.monthsShort);
  const deltaFor = (list: PnlDelta[], field: PnlField) => list.find(d => d.field === field);
  const signed = (n: number) => (n < 0 ? `−${money(-n, currency)}` : money(n, currency));
  const pct = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 100))}%`);

  const date = (key: string) => formatDateKey(key, locale);
  const eventDays = forecast.points.filter(p => p.events.some(e => e.kind !== 'variable'));

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
        <Text style={{ color: opts.color ?? c.text, fontSize: opts.strong ? 17 : 15, fontWeight: Atlas.type.headingWeight }}>{value}</Text>
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
                <Text style={{ color: c.text, fontSize: 14, fontWeight: Atlas.type.headingWeight }}>{money(g.value, currency)}</Text>
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

  const warningCard = warning ? (
    <View
      accessibilityLiveRegion="polite"
      style={[st.card, { borderColor: c.red + '55', backgroundColor: c.red + '12' }]}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <IconSymbol name="exclamationmark.triangle.fill" size={16} color={c.red} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: Atlas.type.headingWeight }}>
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
            {props.onOpenSubscriptions ? (
              <TouchableOpacity
                onPress={props.onOpenSubscriptions}
                accessibilityRole="button"
                style={[st.smallBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
                <Text style={{ color: c.text, fontSize: 12, fontWeight: '700' }}>{tr.finEditSubscriptions}</Text>
              </TouchableOpacity>
            ) : null}
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
      <Text style={{ color: forecast.closing < 0 ? c.red : c.text, fontSize: 15, fontWeight: Atlas.type.headingWeight, marginTop: 10 }}>
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

  const cards: Record<Exclude<ReportsSection, 'shortfall'>, React.ReactNode> = {
    pnl: pnlCard,
    structure: structureCard,
    cashflow: factCard,
    forecast: forecastCard,
  };
  const sections = reportsSections(Boolean(warningCard));
  const feed = sections
    .filter((key): key is Exclude<ReportsSection, 'shortfall'> => key !== 'shortfall');
  const rows = reportsRows(feed, isWide ? 2 : 1);

  return (
    <ScrollView
      // На планшеті дашборд не розповзається ширше за Layout.wideMaxWidth.
      contentContainerStyle={[
        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 },
        isWide && WIDE_COLUMN,
      ]}
      showsVerticalScrollIndicator={false}
      onScroll={onScrollY ? e => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
      scrollEventThrottle={32}
      keyboardShouldPersistTaps="handled">
      {/* Попередження — на всю ширину над стрічкою: воно про все нижче. */}
      {sections[0] === 'shortfall' ? warningCard : null}
      {/* Планшет: ряди по дві картки в порядку стрічки (не masonry — той
          ставив «Прогноз» вище за «Cash flow»). Телефон — одна колонка. */}
      {rows.map(row => (
        <View key={row.join('-')} style={isWide ? st.reportsRow : undefined}>
          {row.map(key => (
            <View key={key} style={isWide ? st.reportsCell : undefined}>{cards[key]}</View>
          ))}
        </View>
      ))}
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
      <Text numberOfLines={1} style={{ color, fontSize: 15, fontWeight: Atlas.type.headingWeight, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const WIDE_COLUMN = { width: '100%', maxWidth: WIDE_CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

const st = StyleSheet.create({
  reportsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reportsCell: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: Atlas.radius.xlarge, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6 },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: Atlas.radius.medium, padding: 2 },
  segmentBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: Atlas.radius.small, alignItems: 'center', justifyContent: 'center' },
  bar: { height: 6, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Atlas.radius.medium, padding: 10, marginTop: 6 },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: Atlas.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  eventDay: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
