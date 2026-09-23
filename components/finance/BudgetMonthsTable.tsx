/**
 * components/finance/BudgetMonthsTable.tsx — «категорія × місяць» для
 * періоду, довшого за місяць (finance-revamp.md §5.5). Кожна клітинка —
 * витрачено / ліміт ТОГО місяця; суми лімітів не показуються свідомо.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { BudgetMonthRow } from '@/utils/budgetMonths';

interface Colors {
  text: string;
  sub: string;
  border: string;
  card: string;
  green: string;
  amber: string;
  red: string;
}

const CELL_W = 92;

export function BudgetMonthsTable({ rows, monthsShort, fmt, c, title, hint, empty }: {
  rows: readonly BudgetMonthRow[];
  monthsShort: readonly string[];
  fmt: (n: number) => string;
  c: Colors;
  title: string;
  hint: string;
  empty: string;
}) {
  const months = rows[0]?.cells.map(cell => cell.month) ?? [];
  const monthLabel = (m: string) => `${monthsShort[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(2, 4)}`;
  return (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>{title}</Text>
      <Text style={{ color: c.sub, fontSize: 11, marginTop: 2, marginBottom: 10 }}>{hint}</Text>
      {rows.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 13 }}>{empty}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={st.row}>
              <View style={st.nameCell} />
              {months.map(m => (
                <Text key={m} style={[st.cell, { color: c.sub, fontWeight: '700' }]}>{monthLabel(m)}</Text>
              ))}
            </View>
            {rows.map(row => (
              <View key={row.category} style={[st.row, { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text numberOfLines={1} style={[st.nameCell, { color: c.text, fontWeight: '600' }]}>{row.category}</Text>
                {row.cells.map(cell => {
                  const ratio = cell.limit > 0 ? cell.spent / cell.limit : 0;
                  const color = ratio > 1 ? c.red : ratio >= 0.8 ? c.amber : c.green;
                  return (
                    <View key={cell.month} style={{ width: CELL_W, paddingVertical: 6 }}>
                      <Text style={{ color, fontSize: 13, fontWeight: '700', textAlign: 'right' }}>{fmt(cell.spent)}</Text>
                      <Text style={{ color: c.sub, fontSize: 10, textAlign: 'right' }}>/ {fmt(cell.limit)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  nameCell: { width: 110, fontSize: 13, paddingRight: 6 },
  cell: { width: CELL_W, fontSize: 11, textAlign: 'right', paddingVertical: 4 },
});
