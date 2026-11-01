import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, type as dsType } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import type { Currency, TxGroup, Transaction } from '@/utils/financeUtils';
import { accountById, creditedAmount, isTransfer, resolveTxCurrency, type Account } from '@/utils/accounts';

/*
 * Omni (DS v2.2): день — ОДНА суцільна картка (surface.card + м'яка тінь), у
 * ній рядки, розділені волосяною лінією; дата й денні підсумки — над карткою.
 * Скло лишається функціональному шару — на білій картці скляний subtle
 * зникав, тож вкладені чипи — surface.subtle.
 */

interface Colors {
  sub: string;
  text: string;
  green: string;
  red: string;
  border: string;
  dim: string;
  /**
   * Колір переказу. Навмисно НЕ зелений і НЕ червоний: переказ не дохід і не
   * витрата, і фарбувати його як витрату (як було раніше) означало показувати
   * втрату грошей там, де вони просто переїхали між власними рахунками.
   */
  neutral: string;
}

interface TransactionGroupProps {
  group: TxGroup;
  compact: boolean;
  isDark: boolean;
  c: Colors;
  fmt: (n: number, cur: Currency) => string;
  currencyByCode: Record<string, Currency>;
  primaryCode?: string;
  /** Рахунки потрібні і для валюти операції, і для назв у переказі. */
  accounts: Account[];
  getCatIcon: (cat: string, type: 'income' | 'expense') => IconSymbolName;
  onSelect: (tx: Transaction) => void;
  todayLabel: string;
  yesterdayLabel: string;
  incomeLabel: string;
  expenseLabel: string;
  transferLabel: string;
}

export function TransactionGroup({
  group, compact, isDark, c, fmt, currencyByCode, primaryCode = 'UAH', accounts,
  getCatIcon, onSelect,
  todayLabel, yesterdayLabel, incomeLabel, expenseLabel, transferLabel,
}: TransactionGroupProps) {
  const displayLabel =
    group.label === '__today__' ? todayLabel :
    group.label === '__yesterday__' ? yesterdayLabel :
    group.label;

  const t = dsTokens(isDark);
  const sh = shadow[isDark ? 'dark' : 'light'].card;
  // Денні підсумки й мітки — суцільні subtle-pill (не скло).
  const pill = { backgroundColor: t.surface.subtle } as const;
  const curOf = (code: string): Currency =>
    currencyByCode[code] ?? { code, symbol: code, kind: 'fiat', decimals: 2 };

  const incomeCodes = Object.keys(group.dayIncomeByCur).filter(k => group.dayIncomeByCur[k] > 0);
  const expenseCodes = Object.keys(group.dayExpenseByCur).filter(k => group.dayExpenseByCur[k] > 0);

  return (
    <View style={{ marginBottom: 16 }}>
      {/* Group header — денні підсумки без переказів (їх не рахує groupTransactions) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <Text style={{ color: t.text.secondary, fontSize: 12, fontFamily: fontFamily.semibold, flex: 1, minWidth: 80 }}>
          {displayLabel}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {incomeCodes.map(code => (
            <View key={'in_' + code} style={{ ...pill, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <IconSymbol name="arrow.up" size={9} color={t.status.success} />
              <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.semibold, ...dsType.numeric }}>
                {fmt(group.dayIncomeByCur[code], curOf(code))}
              </Text>
            </View>
          ))}
          {expenseCodes.map(code => (
            <View key={'ex_' + code} style={{ ...pill, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <IconSymbol name="arrow.down" size={9} color={t.status.danger} />
              <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.semibold, ...dsType.numeric }}>
                {fmt(group.dayExpenseByCur[code], curOf(code))}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Transactions */}
      <View style={compact ? { gap: 8 } : [{ backgroundColor: t.surface.card, borderRadius: radius.cardCompact, paddingVertical: 4 }, sh]}>
        {group.items.map((tx, idx) => {
          // Вигляд переказу вмикає САМ `type`, а не звужувач `isTransfer`:
          // запис без адресата — зламані дані, але малювати його червоною
          // витратою означало б брехати про те, що сталося з грошима.
          const transfer = tx.type === 'transfer';
          const isIncome = tx.type === 'income';
          // Тип — лише в гліфі (статусний колір); суми — text.primary, щоб читались на 4.5:1.
          const color = transfer ? t.status.info : isIncome ? t.status.success : t.status.danger;
          const iconName: IconSymbolName = transfer
            ? 'arrow.left.arrow.right'
            : getCatIcon(tx.category, isIncome ? 'income' : 'expense');
          const txDate = new Date(tx.date);
          const isFirst = idx === 0;
                  const cur = curOf(resolveTxCurrency(tx, accounts));

          const fromAccount = accountById(accounts, tx.accountId);
          const toAccount = transfer ? accountById(accounts, tx.toAccountId) : undefined;
          const title = transfer
            ? `${fromAccount?.name ?? '—'} → ${toAccount?.name ?? '—'}`
            : tx.category;

          // Друга сума потрібна лише коли валюти різні: у межах однієї валюти
          // `toAmount` не зберігається, і дублювати ту саму цифру ні до чого.
          const credited = isTransfer(tx) ? creditedAmount(tx) : null;
          const creditedCur = toAccount ? curOf(toAccount.currency) : cur;
          const showCredited = credited !== null && credited !== tx.amount;

          const sign = transfer ? '' : isIncome ? '+' : '−';

          if (compact) {
            return (
              <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => onSelect(tx)}>
                <View style={[{ backgroundColor: t.surface.card, borderRadius: radius.cardCompact, paddingLeft: 14, paddingRight: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' }, sh]}>
                  <View style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color + (isDark ? '24' : '14') }}>
                    <IconSymbol name={iconName} size={19} color={color} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={{ ...dsType.bodyMedium, color: t.text.primary }} numberOfLines={1}>{title}</Text>
                    {tx.note ? <Text style={{ ...dsType.caption, color: t.text.secondary, marginTop: 2 }} numberOfLines={1}>{tx.note}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
                      <IconSymbol name="clock" size={10} color={t.text.secondary} />
                      <Text style={{ color: t.text.secondary, fontSize: 11, fontFamily: fontFamily.regular, ...dsType.numeric }}>
                        {txDate.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                      <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: t.text.muted }} />
                      <View style={{ ...pill, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
                        <Text style={{ color: t.text.secondary, fontSize: 10, fontFamily: fontFamily.semibold }}>
                          {transfer ? transferLabel : isIncome ? incomeLabel : expenseLabel}
                        </Text>
                      </View>
                      {cur.code !== primaryCode && (
                        <View style={{ ...pill, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 }}>
                          <Text style={{ color: t.text.secondary, fontSize: 10, fontFamily: fontFamily.semibold }}>{cur.code}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
                    <Text style={{ fontSize: 16, fontFamily: fontFamily.semibold, color: t.text.primary, ...dsType.numeric }}>
                      {sign}{fmt(tx.amount, cur)}
                    </Text>
                    {showCredited && (
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: t.text.secondary, marginTop: 2, ...dsType.numeric }}>
                        → {fmt(credited, creditedCur)}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          return (
            <TouchableOpacity key={tx.id} activeOpacity={0.75} onPress={() => onSelect(tx)}>
              <View
                style={{
                  paddingHorizontal: 16, paddingVertical: 10,
                  flexDirection: 'row', alignItems: 'center', minHeight: 56,
                  // Omni-список: рядки в одній картці дня, між ними — волосина
                  // з відступом від іконки (як у системних списках).
                  borderTopWidth: isFirst ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: t.border.hairline,
                }}>
                <View style={{ width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: color + (isDark ? '24' : '14') }}>
                  <IconSymbol name={iconName} size={15} color={color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontFamily: fontFamily.medium, color: t.text.primary }} numberOfLines={1}>{title}</Text>
                  {tx.note ? <Text style={{ ...dsType.caption, marginTop: 1, color: t.text.secondary }} numberOfLines={1}>{tx.note}</Text> : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 14, fontFamily: fontFamily.semibold, color: t.text.primary, ...dsType.numeric }}>
                    {sign}{fmt(tx.amount, cur)}
                  </Text>
                  {showCredited && (
                    <Text style={{ fontSize: 11, fontFamily: fontFamily.medium, color: t.text.secondary, marginTop: 1, ...dsType.numeric }}>
                      → {fmt(credited, creditedCur)}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
