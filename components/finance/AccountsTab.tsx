/**
 * components/finance/AccountsTab.tsx — вкладка «Рахунки» (finance-revamp.md §2.1):
 * рахунки по валютах із балансами (ті самі цифри, що financeOverview),
 * скарбнички (`kind='savings'`) з ціллю, вхід до легасі-«Скарбничок».
 *
 * Період і ракурс на баланс не впливають (§3.2): баланс — факт про рахунок.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import type { Account, AccountKind } from '@/utils/accounts';
import type { FinanceOverview } from '@/utils/financeOverview';
import type { FinColors } from './financeLabels';

export function AccountsTab({
  accounts, overview, money, kindLabel, c, tr, isWide, bottomInset,
  onOpenAccount, onEditAccount, onNewAccount, onOpenBanks,
}: {
  accounts: readonly Account[];
  overview: FinanceOverview;
  money: (amount: number, code: string) => string;
  kindLabel: (kind: AccountKind) => string;
  c: FinColors;
  tr: Translations;
  isWide: boolean;
  bottomInset: number;
  /** Тап — «Звідки ця сума». */
  onOpenAccount: (account: Account) => void;
  onEditAccount: (account: Account) => void;
  onNewAccount: () => void;
  onOpenBanks: () => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const byCurrency = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) {
      if (a.archived) continue;
      const code = a.currency || 'UAH';
      map.set(code, [...(map.get(code) ?? []), a]);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [accounts]);
  const archived = accounts.filter(a => a.archived);
  const signed = (n: number, code: string) => (n < 0 ? `−${money(-n, code)}` : money(n, code));

  const row = (a: Account) => {
    const balance = overview.balances[a.id] ?? 0;
    const code = a.currency || 'UAH';
    const goal = a.kind === 'savings' && typeof a.goal === 'number' && a.goal > 0 ? a.goal : null;
    return (
      <View key={a.id} style={[st.row, { borderTopColor: c.border }]}>
        <TouchableOpacity
          onPress={() => onOpenAccount(a)}
          accessibilityRole="button"
          accessibilityLabel={`${a.name}, ${kindLabel(a.kind)}: ${signed(balance, code)}`}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{a.name}</Text>
              <Text style={{ color: c.sub, fontSize: 11, marginTop: 1 }}>{kindLabel(a.kind)}</Text>
            </View>
            <Text style={{ color: balance < 0 ? c.red : c.text, fontSize: 15, fontWeight: '800' }}>{signed(balance, code)}</Text>
          </View>
          {goal ? (
            <View style={[st.bar, { backgroundColor: c.dim }]}>
              <View style={{ width: `${Math.min(100, Math.max(0, (balance / goal) * 100))}%`, height: '100%', backgroundColor: c.green, borderRadius: 3 }} />
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEditAccount(a)}
          accessibilityRole="button"
          accessibilityLabel={`${tr.edit}: ${a.name}`}
          style={st.iconBtn}>
          <IconSymbol name="pencil" size={14} color={c.sub} />
        </TouchableOpacity>
      </View>
    );
  };

  const cards = byCurrency.map(([code, list]) => (
    <View key={code} style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}>
        <Text style={[st.cardTitle, { color: c.sub, flex: 1 }]}>{tr.finOnAccounts.replace('{currency}', code)}</Text>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '800' }}>{signed(overview.totalByCurrency[code] ?? 0, code)}</Text>
      </View>
      {list.map(row)}
    </View>
  ));

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 }}
      showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <TouchableOpacity
          onPress={onNewAccount}
          accessibilityRole="button"
          style={[st.action, { backgroundColor: c.accent }]}>
          <IconSymbol name="plus" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{tr.newAccount}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenBanks}
          accessibilityRole="button"
          style={[st.action, { backgroundColor: c.dim, borderWidth: 1, borderColor: c.border }]}>
          <IconSymbol name="building.columns.fill" size={14} color={c.accent} />
          <Text style={{ color: c.text, fontWeight: '700', fontSize: 13 }}>{tr.finOpenBanks}</Text>
        </TouchableOpacity>
      </View>

      {byCurrency.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 48 }}>
          <IconSymbol name="banknote" size={32} color={c.accent} />
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginTop: 10 }}>{tr.noAccounts}</Text>
          <Text style={{ color: c.sub, fontSize: 13, marginTop: 4, textAlign: 'center' }}>{tr.noAccountsHint}</Text>
        </View>
      ) : isWide ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {cards.map((card, i) => <View key={i} style={{ flexBasis: '48%', flexGrow: 1, minWidth: 0 }}>{card}</View>)}
        </View>
      ) : cards}

      {archived.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() => setShowArchived(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
            <IconSymbol name={showArchived ? 'chevron.down' : 'chevron.right'} size={12} color={c.sub} />
            <Text style={{ color: c.sub, fontSize: 13, fontWeight: '700' }}>{tr.finArchivedAccounts} ({archived.length})</Text>
          </TouchableOpacity>
          {showArchived ? (
            <View style={[st.card, { borderColor: c.border, backgroundColor: c.card }]}>{archived.map(row)}</View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  bar: { height: 5, borderRadius: 3, marginTop: 6, overflow: 'hidden' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 12 },
});
