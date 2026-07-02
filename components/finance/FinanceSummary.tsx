import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Currency, CurrencyTotals } from '@/utils/financeUtils';

interface Labels {
  income: string;
  expense: string;
  balance: string;
  savings: string;
  carryover: string;
}

interface Colors {
  border: string;
  sub: string;
  green: string;
  red: string;
}

interface FinanceSummaryProps {
  currencies: Currency[];
  totalsByCurrency: Record<string, CurrencyTotals>;
  primaryCode?: string;            // default 'UAH'
  onPickPrimary?: () => void;      // tap currency chip → open picker
  fmt: (n: number, cur: Currency) => string;
  isDark: boolean;
  c: Colors;
  incomeLabel: string;
  expenseLabel: string;
  balanceLabel: string;
  savingsLabel: string;
  carryoverLabel: string;
  // Localized chrome strings (defaults are Ukrainian for back-compat).
  otherCurrenciesLabel?: string;
  primaryBadgeLabel?: string;
  showAllLabel?: (count: number) => string;
  allCurrenciesLabel?: string;
  // Tapping a row in the "all currencies" popup makes that currency primary.
  onSelectPrimary?: (code: string) => void;
}

const PREVIEW_COUNT = 2;

export function FinanceSummary({
  currencies, totalsByCurrency, primaryCode = 'UAH', onPickPrimary,
  fmt, isDark, c,
  incomeLabel, expenseLabel, balanceLabel, savingsLabel, carryoverLabel,
  otherCurrenciesLabel = 'Інші валюти',
  primaryBadgeLabel = 'ОСНОВНА',
  showAllLabel = (n) => `Показати всі (${n})`,
  allCurrenciesLabel = 'Всі валюти',
  onSelectPrimary,
}: FinanceSummaryProps) {
  const labels: Labels = {
    income: incomeLabel, expense: expenseLabel, balance: balanceLabel,
    savings: savingsLabel, carryover: carryoverLabel,
  };
  const [showAll, setShowAll] = useState(false);

  const primary = currencies.find(cu => cu.code === primaryCode)
    ?? currencies.find(cu => cu.code === 'UAH')
    ?? currencies[0];

  if (!primary) return null;

  const primaryTotals: CurrencyTotals =
    totalsByCurrency[primary.code] ?? { income: 0, expense: 0, carryover: 0, balance: 0 };

  const others = currencies
    .filter(cu => cu.code !== primary.code)
    .map(cu => ({ cur: cu, totals: totalsByCurrency[cu.code] }))
    .filter(x => {
      const t = x.totals;
      return t && (t.income !== 0 || t.expense !== 0 || t.carryover !== 0);
    });

  const preview = others.slice(0, PREVIEW_COUNT);
  const hiddenCount = others.length - preview.length;

  return (
    <>
      <BlurView
        intensity={isDark ? 25 : 45}
        tint={isDark ? 'dark' : 'light'}
        style={[s.card, { borderColor: c.border }]}>

        <PrimaryBlock
          primary={primary}
          totals={primaryTotals}
          fmt={fmt}
          c={c}
          labels={labels}
          onPickPrimary={onPickPrimary}
        />

        {others.length > 0 && (
          <>
            <View style={[s.divider, { backgroundColor: c.border, marginTop: 14, marginBottom: 10 }]} />
            <Text style={[s.othersLabel, { color: c.sub }]}>{otherCurrenciesLabel}</Text>
            <View style={{ marginTop: 4 }}>
              {preview.map((x, idx) => (
                <OtherRow
                  key={x.cur.code}
                  cur={x.cur}
                  totals={x.totals!}
                  fmt={fmt}
                  c={c}
                  carryoverLabel={labels.carryover}
                  last={idx === preview.length - 1 && hiddenCount === 0}
                />
              ))}
            </View>

            {hiddenCount > 0 && (
              <TouchableOpacity
                onPress={() => setShowAll(true)}
                activeOpacity={0.7}
                style={[s.showAllBtn, { borderColor: c.border }]}>
                <Text style={{ color: c.sub, fontSize: 12, fontWeight: '600' }}>
                  {showAllLabel(others.length)}
                </Text>
                <IconSymbol name="chevron.right" size={12} color={c.sub} />
              </TouchableOpacity>
            )}
          </>
        )}
      </BlurView>

      {/* All-currencies popup */}
      <Modal
        visible={showAll}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowAll(false)}>
        <Pressable style={s.overlay} onPress={() => setShowAll(false)}>
          <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
            <BlurView intensity={isDark ? 50 : 70} tint={isDark ? 'dark' : 'light'}
              style={[s.sheet, { borderColor: c.border, backgroundColor: isDark ? 'rgba(12,12,20,0.98)' : 'rgba(248,246,255,0.98)' }]}>
              <View style={s.handleRow}>
                <View style={{ flex: 1 }} />
                <View style={[s.handle, { backgroundColor: c.border }]} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <TouchableOpacity onPress={() => setShowAll(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <IconSymbol name="xmark" size={17} color={c.sub} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={[s.sheetTitle, { color: c.sub }]}>{allCurrenciesLabel}</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
                {/* Primary first — already primary, but still tappable to no-op */}
                <OtherRow
                  cur={primary}
                  totals={primaryTotals}
                  fmt={fmt}
                  c={c}
                  carryoverLabel={labels.carryover}
                  last={others.length === 0}
                  highlightPrimary
                  primaryBadgeLabel={primaryBadgeLabel}
                />
                {others.map((x, idx) => {
                  const inner = (
                    <OtherRow
                      cur={x.cur}
                      totals={x.totals!}
                      fmt={fmt}
                      c={c}
                      carryoverLabel={labels.carryover}
                      last={idx === others.length - 1}
                    />
                  );
                  if (!onSelectPrimary) return <View key={x.cur.code}>{inner}</View>;
                  return (
                    <TouchableOpacity
                      key={x.cur.code}
                      onPress={() => { onSelectPrimary(x.cur.code); setShowAll(false); }}
                      accessibilityRole="button"
                      accessibilityLabel={x.cur.code}>
                      {inner}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function PrimaryBlock({
  primary, totals, fmt, c, labels, onPickPrimary,
}: {
  primary: Currency;
  totals: CurrencyTotals;
  fmt: (n: number, cur: Currency) => string;
  c: Colors;
  labels: Labels;
  onPickPrimary?: () => void;
}) {
  const { income, expense, balance, carryover } = totals;
  const savingsPct = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;

  const ChipInner = (
    <>
      <Text style={{ fontSize: 11, fontWeight: '800', color: c.sub, letterSpacing: 0.5 }}>{primary.code}</Text>
      {onPickPrimary && (
        <IconSymbol name="chevron.down" size={10} color={c.sub} style={{ marginLeft: 4 }} />
      )}
    </>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: c.sub, letterSpacing: 0.3, textTransform: 'uppercase' }}>{labels.balance}</Text>
        {onPickPrimary ? (
          <TouchableOpacity
            onPress={onPickPrimary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
            {ChipInner}
          </TouchableOpacity>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
            {ChipInner}
          </View>
        )}
      </View>

      <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: balance >= 0 ? c.green : c.red }}>
        {fmt(balance, primary)}
      </Text>
      {carryover !== 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: c.sub }}>{labels.carryover}:</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: carryover >= 0 ? c.green : c.red }}>
            {carryover >= 0 ? '+' : ''}{fmt(carryover, primary)}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 12, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.green }} />
          <Text style={{ color: c.sub, fontSize: 11 }}>{labels.income}</Text>
          <Text numberOfLines={1} style={{ color: c.green, fontSize: 13, fontWeight: '800', marginLeft: 2, flexShrink: 1 }}>{fmt(income, primary)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.red }} />
          <Text style={{ color: c.sub, fontSize: 11 }}>{labels.expense}</Text>
          <Text numberOfLines={1} style={{ color: c.red, fontSize: 13, fontWeight: '800', marginLeft: 2, flexShrink: 1 }}>{fmt(expense, primary)}</Text>
        </View>
        {income > 0 && (
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: c.sub, fontSize: 11 }}>{labels.savings}</Text>
            <Text style={{ color: c.green, fontSize: 13, fontWeight: '800' }}>{savingsPct}%</Text>
          </View>
        )}
      </View>

      {income > 0 && (
        <View style={{ height: 3, marginTop: 8, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' }}>
          <View style={{ height: '100%', borderRadius: 2, width: `${savingsPct}%` as any, backgroundColor: c.green }} />
        </View>
      )}
    </View>
  );
}

function OtherRow({
  cur, totals, fmt, c, carryoverLabel, last, highlightPrimary, primaryBadgeLabel = 'ОСНОВНА',
}: {
  cur: Currency;
  totals: CurrencyTotals;
  fmt: (n: number, cur: Currency) => string;
  c: Colors;
  carryoverLabel: string;
  last: boolean;
  highlightPrimary?: boolean;
  primaryBadgeLabel?: string;
}) {
  const { income, expense, balance, carryover } = totals;
  const hasFlow = income !== 0 || expense !== 0;
  const balanceColor = balance >= 0 ? c.green : c.red;

  return (
    <View style={{
      paddingVertical: 9,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 8,
          borderWidth: 1, borderColor: c.border,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: c.sub }}>{cur.symbol}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: c.sub, letterSpacing: 0.4 }}>{cur.code}</Text>
            {highlightPrimary && (
              <View style={{ backgroundColor: c.green + '20', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
                <Text style={{ color: c.green, fontSize: 9, fontWeight: '700' }}>{primaryBadgeLabel}</Text>
              </View>
            )}
          </View>
          {hasFlow && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              {income !== 0 && (
                <Text style={{ fontSize: 11, fontWeight: '600', color: c.green }}>+{fmt(income, cur)}</Text>
              )}
              {expense !== 0 && (
                <Text style={{ fontSize: 11, fontWeight: '600', color: c.red }}>−{fmt(expense, cur)}</Text>
              )}
            </View>
          )}
          {!hasFlow && carryover !== 0 && (
            <Text style={{ fontSize: 10, fontWeight: '500', color: c.sub, marginTop: 2 }}>
              {carryoverLabel}
            </Text>
          )}
        </View>
        <Text style={{ fontSize: 15, fontWeight: '800', color: balanceColor, letterSpacing: -0.3 }}>
          {fmt(balance, cur)}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:        { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  divider:     { height: 1 },
  othersLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  showAllBtn:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginTop: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth,
  },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheetWrapper:{ paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  sheet:       { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' },
  handleRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center' },
  sheetTitle:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
});
