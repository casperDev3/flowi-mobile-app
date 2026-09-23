/**
 * components/finance/CategoryMetaEditor.tsx — група і ознака «фікс/змінна»
 * категорії (finance-revamp.md §4.1). Показує ПОТОЧНЕ значення (явне або
 * похідне з categoryMeta); вибір робить його явним у рядку `categories`.
 * Ознака лише для витрат: для доходів вона не має сенсу й не показується.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { Translations } from '@/store/translations';
import {
  COST_KINDS, EXPENSE_GROUPS, INCOME_GROUPS,
  type CategoryGroup, type CostKind,
} from '@/utils/finance/classify';
import { categoryGroupLabel, costKindLabel } from './financeLabels';

interface Colors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export function CategoryMetaEditor({ type, group, cost, onGroup, onCost, c, tr }: {
  type: 'income' | 'expense';
  group: CategoryGroup;
  cost: CostKind;
  onGroup: (group: CategoryGroup) => void;
  onCost: (cost: CostKind) => void;
  c: Colors;
  tr: Translations;
}) {
  const groups = type === 'expense' ? EXPENSE_GROUPS : INCOME_GROUPS;
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
      <Text style={[st.label, { color: c.sub }]}>{tr.finCatGroup}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityRole="radiogroup"
        accessibilityLabel={tr.finCatGroup}
        contentContainerStyle={{ gap: 6 }}>
        {groups.map(g => {
          const on = g === group;
          const label = categoryGroupLabel(g, tr);
          return (
            <TouchableOpacity
              key={g}
              onPress={() => onGroup(g)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, checked: on }}
              accessibilityLabel={label}
              style={[st.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '18' : 'transparent' }]}>
              <Text style={{ color: on ? c.accent : c.sub, fontSize: 12, fontWeight: '700' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {type === 'expense' ? (
        <>
          <Text style={[st.label, { color: c.sub, marginTop: 8 }]}>{tr.finCatCost}</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel={tr.finCatCost} style={{ flexDirection: 'row', gap: 6 }}>
            {COST_KINDS.map(k => {
              const on = k === cost;
              const label = costKindLabel(k, tr);
              return (
                <TouchableOpacity
                  key={k}
                  onPress={() => onCost(k)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  accessibilityLabel={label}
                  style={[st.chip, { borderColor: on ? c.accent : c.border, backgroundColor: on ? c.accent + '18' : 'transparent' }]}>
                  <Text style={{ color: on ? c.accent : c.sub, fontSize: 12, fontWeight: '700' }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', marginBottom: 6 },
  chip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
