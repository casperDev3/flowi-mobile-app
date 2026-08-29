/**
 * components/finance/FinanceSummary.tsx — шапка екрана фінансів.
 *
 * Раніше тут була одна картка з балансом «основної» валюти й стовпчиком інших
 * валют під нею. Вона відповідала на питання «скільки в мене грошей у гривні»,
 * але не на «де саме вони лежать»: готівка не відрізнялася від картки, і будь-яке
 * переміщення грошей між своїми ж місцями виглядало як витрата.
 *
 * Тепер зверху — стрічка РАХУНКІВ: кожен зі своїм балансом у своїй валюті.
 * Тап по рахунку фільтрує стрічку операцій нижче. Зведеного «≈ усього» немає
 * свідомо: курсів валют у застосунку поки немає, і будь-яка спільна цифра була
 * б вигадкою.
 *
 * Під стрічкою — оборот місяця (доходи/витрати) по валютах. Перекази в нього не
 * входять: гроші не заробили й не витратили, а переклали з місця на місце.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Account, AccountKind } from '@/utils/accounts';
import type { Currency, CurrencyTotals } from '@/utils/financeUtils';

interface Colors {
  border: string;
  sub: string;
  text: string;
  dim: string;
  accent: string;
  green: string;
  red: string;
}

interface FinanceSummaryProps {
  /** Лише активні: архівний рахунок лишається в історії, але не в стрічці. */
  accounts: Account[];
  /** id рахунку → баланс. Рахує accountBalance у екрані. */
  balances: Record<string, number>;
  selectedAccountId: string | null;
  /** Тап по картці. Повторний тап по тому самому рахунку знімає фільтр. */
  onSelectAccount: (id: string) => void;
  onNewAccount: () => void;
  kindLabel: (kind: AccountKind) => string;

  currencies: Currency[];
  totalsByCurrency: Record<string, CurrencyTotals>;
  primaryCode?: string;
  onPickPrimary?: () => void;
  fmt: (n: number, cur: Currency) => string;
  isDark: boolean;
  c: Colors;

  incomeLabel: string;
  expenseLabel: string;
  savingsLabel: string;
  accountsLabel: string;
  newAccountLabel: string;
  noAccountsLabel: string;
  noAccountsHint: string;
  transfersNoteLabel: string;
  /** Показувати примітку про перекази лише коли вони цього місяця були. */
  showTransfersNote?: boolean;
}

/** Кольори за видом рахунку — коли користувач не задав власний. */
export const KIND_COLOR: Record<AccountKind, string> = {
  cash: '#10B981',
  card: '#0EA5E9',
  savings: '#8B5CF6',
};

export const KIND_ICON: Record<AccountKind, IconSymbolName> = {
  cash: 'banknote',
  card: 'creditcard.fill',
  savings: 'building.columns.fill',
};

export function FinanceSummary({
  accounts, balances, selectedAccountId, onSelectAccount, onNewAccount, kindLabel,
  currencies, totalsByCurrency, primaryCode = 'UAH', onPickPrimary,
  fmt, isDark, c,
  incomeLabel, expenseLabel, savingsLabel,
  accountsLabel, newAccountLabel, noAccountsLabel, noAccountsHint,
  transfersNoteLabel, showTransfersNote,
}: FinanceSummaryProps) {
  const curOf = (code: string): Currency =>
    currencies.find(cu => cu.code === code) ?? { code, symbol: code, kind: 'fiat', decimals: 2 };

  // Валюти з рухом за місяць. Основна йде першою — на неї дивляться найчастіше.
  const flowCodes = Object.keys(totalsByCurrency)
    .filter(code => {
      const t = totalsByCurrency[code];
      return t && (t.income !== 0 || t.expense !== 0);
    })
    .sort((a, b) => (a === primaryCode ? -1 : b === primaryCode ? 1 : a.localeCompare(b)));

  return (
    <View>
      {/* ─── Стрічка рахунків ─── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[s.sectionLabel, { color: c.sub, flex: 1 }]}>{accountsLabel}</Text>
      </View>

      {accounts.length === 0 ? (
        <BlurView
          intensity={isDark ? 25 : 45}
          tint={isDark ? 'dark' : 'light'}
          style={[s.card, { borderColor: c.border, alignItems: 'center' }]}>
          <IconSymbol name="banknote" size={26} color={c.sub} />
          <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', marginTop: 8 }}>{noAccountsLabel}</Text>
          <Text style={{ color: c.sub, fontSize: 12, textAlign: 'center', marginTop: 4, lineHeight: 17 }}>
            {noAccountsHint}
          </Text>
          <TouchableOpacity
            onPress={onNewAccount}
            accessibilityRole="button"
            accessibilityLabel={newAccountLabel}
            style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: c.accent }}>
            <IconSymbol name="plus" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{newAccountLabel}</Text>
          </TouchableOpacity>
        </BlurView>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: 4, paddingVertical: 2 }}>
          {accounts.map(account => {
            const selected = account.id === selectedAccountId;
            const tint = account.color ?? KIND_COLOR[account.kind];
            const balance = balances[account.id] ?? account.openingBalance;
            return (
              <TouchableOpacity
                key={account.id}
                activeOpacity={0.8}
                onPress={() => onSelectAccount(account.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${account.name}, ${fmt(balance, curOf(account.currency))}`}>
                <BlurView
                  intensity={isDark ? 25 : 45}
                  tint={isDark ? 'dark' : 'light'}
                  style={[s.accountCard, {
                    borderColor: selected ? c.accent : c.border,
                    backgroundColor: selected ? c.accent + '14' : 'transparent',
                  }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.accountIcon, { backgroundColor: tint + (isDark ? '25' : '18') }]}>
                      <IconSymbol name={(account.icon as IconSymbolName) ?? KIND_ICON[account.kind]} size={15} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '700' }}>
                        {account.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginTop: 1 }}>
                        {kindLabel(account.kind)} · {account.currency}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 10, fontSize: 17, fontWeight: '800', letterSpacing: -0.4, color: balance < 0 ? c.red : c.text }}>
                    {fmt(balance, curOf(account.currency))}
                  </Text>
                  {account.goal ? (
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>
                      {fmt(account.goal, curOf(account.currency))}
                    </Text>
                  ) : null}
                </BlurView>
              </TouchableOpacity>
            );
          })}

          {/* Картка «новий рахунок» — щоб завести гаманець там, де на нього дивляться */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onNewAccount}
            accessibilityRole="button"
            accessibilityLabel={newAccountLabel}
            style={[s.accountCard, s.accountAdd, { borderColor: c.accent + '55' }]}>
            <IconSymbol name="plus" size={18} color={c.accent} />
            <Text style={{ color: c.accent, fontSize: 12, fontWeight: '700', marginTop: 6, textAlign: 'center' }}>
              {newAccountLabel}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ─── Оборот місяця ─── */}
      <BlurView
        intensity={isDark ? 25 : 45}
        tint={isDark ? 'dark' : 'light'}
        style={[s.card, { borderColor: c.border, marginTop: 14 }]}>

        {onPickPrimary && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={onPickPrimary}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={primaryCode}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: c.border }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: c.sub, letterSpacing: 0.5 }}>{primaryCode}</Text>
              <IconSymbol name="chevron.down" size={10} color={c.sub} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </View>
        )}

        {flowCodes.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <FlowCell label={incomeLabel} value={fmt(0, curOf(primaryCode))} color={c.green} sub={c.sub} />
            <FlowCell label={expenseLabel} value={fmt(0, curOf(primaryCode))} color={c.red} sub={c.sub} />
          </View>
        ) : (
          flowCodes.map((code, idx) => {
            const t = totalsByCurrency[code];
            const cur = curOf(code);
            const savingsPct = t.income > 0
              ? Math.max(0, Math.round(((t.income - t.expense) / t.income) * 100))
              : 0;
            return (
              <View
                key={code}
                style={{
                  paddingTop: idx === 0 ? 0 : 10,
                  marginTop: idx === 0 ? 0 : 10,
                  borderTopWidth: idx === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: c.border,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: c.sub }}>{cur.code}</Text>
                  {t.income > 0 && (
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: c.sub, fontSize: 11 }}>{savingsLabel}</Text>
                      <Text style={{ color: c.green, fontSize: 12, fontWeight: '800' }}>{savingsPct}%</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                  <FlowCell label={incomeLabel} value={fmt(t.income, cur)} color={c.green} sub={c.sub} />
                  <FlowCell label={expenseLabel} value={fmt(t.expense, cur)} color={c.red} sub={c.sub} />
                </View>
                {t.income > 0 && (
                  <View style={{ height: 3, marginTop: 8, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 2, overflow: 'hidden' }}>
                    <View style={{ height: '100%', borderRadius: 2, width: `${savingsPct}%` as any, backgroundColor: c.green }} />
                  </View>
                )}
              </View>
            );
          })
        )}

        {showTransfersNote && (
          <Text style={{ color: c.sub, fontSize: 10, marginTop: 12, lineHeight: 14 }}>
            {transfersNoteLabel}
          </Text>
        )}
      </BlurView>
    </View>
  );
}

function FlowCell({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ color: sub, fontSize: 11 }}>{label}</Text>
      <Text numberOfLines={1} style={{ color, fontSize: 16, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card:         { borderRadius: 18, borderWidth: 1, padding: 14, overflow: 'hidden' },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  // 158pt тримає в один рядок і «Основний UAH», і суму на шість знаків.
  accountCard:  { width: 158, borderRadius: 16, borderWidth: 1, padding: 12, overflow: 'hidden' },
  accountAdd:   { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  accountIcon:  { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
