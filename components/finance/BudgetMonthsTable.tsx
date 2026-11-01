/**
 * components/finance/BudgetMonthsTable.tsx — «категорія × місяць» для
 * періоду, довшого за місяць (finance-revamp.md §5.5). Кожна клітинка —
 * витрачено / ліміт ТОГО місяця; суми лімітів не показуються свідомо.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { fontFamily, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import type { BudgetMonthRow } from '@/utils/budgetMonths';
import { BentoCard } from '@/components/ds';

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
  const { t } = useDS();
  const months = rows[0]?.cells.map(cell => cell.month) ?? [];
  const monthLabel = (m: string) => `${monthsShort[Number(m.slice(5, 7)) - 1] ?? m.slice(5, 7)} ${m.slice(2, 4)}`;
  return (
    // Omni (DS v2.2): суцільна BentoCard — «icon-chip + назва», підказка — підзаголовком.
    <BentoCard compact title={title} icon="calendar" accent="lime" style={st.card}>
      <Text style={{ ...dsType.caption, color: t.text.secondary, marginBottom: 12 }}>{hint}</Text>
      {rows.length === 0 ? (
        <Text style={{ ...dsType.body, color: t.text.secondary }}>{empty}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={st.row}>
              <View style={st.nameCell} />
              {months.map(m => (
                <Text key={m} style={[st.cell, { color: t.text.secondary, fontFamily: fontFamily.semibold }]}>{monthLabel(m)}</Text>
              ))}
            </View>
            {rows.map(row => (
              <View key={row.category} style={[st.row, { borderTopColor: t.border.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text numberOfLines={1} style={[st.nameCell, { color: t.text.primary, fontFamily: fontFamily.medium }]}>{row.category}</Text>
                {row.cells.map(cell => {
                  const ratio = cell.limit > 0 ? cell.spent / cell.limit : 0;
                  // Перевищення — коралова крапка-тік, близько до ліміту — бурштинова; суми — text.primary.
                  const tick = ratio > 1 ? t.accent.coral : ratio >= 0.8 ? t.accent.amber : null;
                  return (
                    <View key={cell.month} style={{ width: CELL_W, paddingVertical: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                        {tick ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tick }} /> : null}
                        <Text style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, textAlign: 'right', ...dsType.numeric }}>{fmt(cell.spent)}</Text>
                      </View>
                      <Text style={{ color: t.text.secondary, fontSize: 11, fontFamily: fontFamily.regular, textAlign: 'right', ...dsType.numeric }}>/ {fmt(cell.limit)}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </BentoCard>
  );
}

const st = StyleSheet.create({
  card: { marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  nameCell: { width: 110, fontSize: 13, paddingRight: 6 },
  cell: { width: CELL_W, fontSize: 11, textAlign: 'right', paddingVertical: 4, fontVariant: ['tabular-nums'] },
});
