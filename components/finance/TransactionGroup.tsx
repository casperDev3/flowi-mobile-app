import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { TxGroup, Transaction } from '@/utils/financeUtils';

interface Colors {
  sub: string;
  text: string;
  green: string;
  red: string;
  border: string;
  dim: string;
}

interface TransactionGroupProps {
  group: TxGroup;
  compact: boolean;
  isDark: boolean;
  c: Colors;
  fmt: (n: number) => string;
  getCatIcon: (cat: string, type: 'income' | 'expense') => IconSymbolName;
  onSelect: (tx: Transaction) => void;
  todayLabel: string;
  yesterdayLabel: string;
  incomeLabel: string;
  expenseLabel: string;
}

export function TransactionGroup({
  group, compact, isDark, c, fmt, getCatIcon, onSelect,
  todayLabel, yesterdayLabel, incomeLabel, expenseLabel,
}: TransactionGroupProps) {
  const displayLabel =
    group.label === '__today__' ? todayLabel :
    group.label === '__yesterday__' ? yesterdayLabel :
    group.label;

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Group header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text style={{ color: c.sub, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
          {displayLabel}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {group.dayIncome > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.green + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <IconSymbol name="arrow.up" size={9} color={c.green} />
              <Text style={{ color: c.green, fontSize: 11, fontWeight: '700' }}>{fmt(group.dayIncome)}</Text>
            </View>
          )}
          {group.dayExpense > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.red + '18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <IconSymbol name="arrow.down" size={9} color={c.red} />
              <Text style={{ color: c.red, fontSize: 11, fontWeight: '700' }}>{fmt(group.dayExpense)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Transactions */}
      <View style={{ gap: compact ? 8 : 2 }}>
        {group.items.map((tx, idx) => {
          const isIncome = tx.type === 'income';
          const color = isIncome ? c.green : c.red;
          const iconName = getCatIcon(tx.category, tx.type);
          const txDate = new Date(tx.date);
          const isFirst = idx === 0;
          const isLast = idx === group.items.length - 1;

          if (compact) {
            return (
              <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => onSelect(tx)}>
                <BlurView
                  intensity={isDark ? 18 : 35}
                  tint={isDark ? 'dark' : 'light'}
                  style={{ borderRadius: 15, borderWidth: 1, borderColor: c.border, paddingLeft: 10, paddingRight: 13, paddingVertical: 12, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: color + '70', borderRadius: 2, marginRight: 12 }} />
                  <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: color + (isDark ? '20' : '12') }}>
                    <IconSymbol name={iconName} size={19} color={color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }} numberOfLines={1}>{tx.category}</Text>
                    {tx.note ? <Text style={{ fontSize: 12, color: c.sub, marginTop: 2 }} numberOfLines={1}>{tx.note}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                      <IconSymbol name="clock" size={10} color={c.sub} />
                      <Text style={{ color: c.sub, fontSize: 10, fontWeight: '500' }}>
                        {txDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: c.sub + '80' }} />
                      <View style={{ backgroundColor: color + '20', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
                        <Text style={{ color, fontSize: 9, fontWeight: '700' }}>{isIncome ? incomeLabel : expenseLabel}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color, marginLeft: 10 }}>
                    {isIncome ? '+' : '−'}{fmt(tx.amount)}
                  </Text>
                </BlurView>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => onSelect(tx)}>
              <BlurView
                intensity={isDark ? 16 : 28}
                tint={isDark ? 'dark' : 'light'}
                style={{
                  paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden',
                  flexDirection: 'row', alignItems: 'center',
                  borderTopLeftRadius:    isFirst ? 13 : 5,
                  borderTopRightRadius:   isFirst ? 13 : 5,
                  borderBottomLeftRadius: isLast  ? 13 : 5,
                  borderBottomRightRadius:isLast  ? 13 : 5,
                }}>
                <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: color + (isDark ? '20' : '12') }}>
                  <IconSymbol name={iconName} size={14} color={color} />
                </View>
                <View style={{ flex: 1, marginLeft: 9 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }} numberOfLines={1}>{tx.category}</Text>
                  {tx.note ? <Text style={{ fontSize: 11, marginTop: 1, color: c.sub }} numberOfLines={1}>{tx.note}</Text> : null}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color }}>
                  {isIncome ? '+' : '−'}{fmt(tx.amount)}
                </Text>
              </BlurView>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
