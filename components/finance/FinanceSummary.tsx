import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';

interface FinanceSummaryProps {
  income: number;
  expense: number;
  balance: number;
  savingsPct: number;
  fmt: (n: number) => string;
  isDark: boolean;
  c: {
    border: string;
    sub: string;
    green: string;
    red: string;
  };
  incomeLabel: string;
  expenseLabel: string;
  balanceLabel: string;
  savingsLabel: string;
}

function SummaryItem({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1, padding: 6 }}>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', letterSpacing: 0.3, marginBottom: 5 }}>{label}</Text>
      <Text style={{ color, fontSize: 17, fontWeight: '800', letterSpacing: -0.4 }}>{value}</Text>
    </View>
  );
}

export function FinanceSummary({
  income, expense, balance, savingsPct, fmt, isDark, c,
  incomeLabel, expenseLabel, balanceLabel, savingsLabel,
}: FinanceSummaryProps) {
  return (
    <BlurView
      intensity={isDark ? 25 : 45}
      tint={isDark ? 'dark' : 'light'}
      style={{ borderRadius: 20, borderWidth: 1, padding: 20, overflow: 'hidden', borderColor: c.border }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.sub, marginBottom: 4 }}>{balanceLabel}</Text>
      <Text style={{ fontSize: 36, fontWeight: '800', letterSpacing: -1, color: balance >= 0 ? c.green : c.red }}>
        {fmt(balance)}
      </Text>
      <View style={{ height: 1, backgroundColor: c.border, marginVertical: 16 }} />
      <View style={{ flexDirection: 'row' }}>
        <SummaryItem label={incomeLabel} value={fmt(income)} color={c.green} sub={c.sub} />
        <View style={{ width: 1, backgroundColor: c.border }} />
        <SummaryItem label={expenseLabel} value={fmt(expense)} color={c.red} sub={c.sub} />
      </View>
      {income > 0 && (
        <>
          <View style={{ height: 1, backgroundColor: c.border, marginTop: 16, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: c.sub, marginBottom: 6 }}>{savingsLabel}</Text>
              <View style={{ height: 4, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: '100%', borderRadius: 2, width: `${savingsPct}%`, backgroundColor: c.green }} />
              </View>
            </View>
            <Text style={{ color: c.green, fontSize: 18, fontWeight: '800' }}>{savingsPct}%</Text>
          </View>
        </>
      )}
    </BlurView>
  );
}
