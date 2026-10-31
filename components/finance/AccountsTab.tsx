/**
 * components/finance/AccountsTab.tsx — вкладка «Рахунки» (finance-revamp.md §2.1):
 * оборот періоду (доходи/витрати — з «Операцій»), рахунки по валютах із
 * балансами (ті самі цифри, що financeOverview),
 * скарбнички (`kind='savings'`) з ціллю, вхід до легасі-«Скарбничок».
 *
 * Період і ракурс на баланс не впливають (§3.2): баланс — факт про рахунок.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ResponsiveGrid } from '@/components/shared/ResponsiveGrid';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { EmptyState, GlassSurface } from '@/components/ds';
import { fontFamily, radius, space, type as dsType } from '@/constants/theme';
import { WIDE_CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';
import type { Account, AccountKind } from '@/utils/accounts';
import type { FinanceOverview } from '@/utils/financeOverview';
import type { FinColors } from './financeLabels';
import { useGlassStyles } from '@/components/finance/finPalette';

export function AccountsTab({
  accounts, overview, money, kindLabel, c, tr, isWide, bottomInset,
  onOpenAccount, onEditAccount, onNewAccount, onOpenBanks, header,
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
  /**
   * Над рахунками: оборот періоду (доходи/витрати). Переїхав сюди з
   * «Операцій» — там лишились тільки залишки (рішення власника 2026-10).
   */
  header?: React.ReactNode;
}) {
  const { t, g } = useDS();
  const gs = useGlassStyles();
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
      <View key={a.id} style={[st.row, { borderTopColor: t.border.hairline }]}>
        <TouchableOpacity
          onPress={() => onOpenAccount(a)}
          accessibilityRole="button"
          accessibilityLabel={`${a.name}, ${kindLabel(a.kind)}: ${signed(balance, code)}`}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ ...dsType.bodyMedium, color: t.text.primary }}>{a.name}</Text>
              <Text style={{ ...dsType.caption, color: t.text.secondary, marginTop: 1 }}>{kindLabel(a.kind)}</Text>
            </View>
            <Text style={{ color: balance < 0 ? t.status.danger : t.text.primary, fontSize: 16, fontFamily: fontFamily.medium, ...dsType.numeric }}>{signed(balance, code)}</Text>
          </View>
          {goal ? (
            <View style={[st.bar, { ...gs.subtle }]}>
              <View style={{ width: `${Math.min(100, Math.max(0, (balance / goal) * 100))}%`, height: '100%', backgroundColor: g.accent.lime.fill, borderRadius: radius.pill }} />
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onEditAccount(a)}
          accessibilityRole="button"
          accessibilityLabel={`${tr.edit}: ${a.name}`}
          style={st.iconBtn}>
          <IconSymbol name="pencil" size={14} color={t.text.secondary} />
        </TouchableOpacity>
      </View>
    );
  };

  const cards = byCurrency.map(([code, list]) => (
    <GlassSurface key={code} radius={radius.cardCompact} style={st.card}>
      {/* Підсумок валюти — display-число картки (тонке, табличне). */}
      <Text style={[st.cardTitle, { color: t.text.secondary }]}>{tr.finOnAccounts.replace('{currency}', code)}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
        style={{ ...dsType.displaySm, color: t.text.primary, marginTop: 6, marginBottom: 10 }}>{signed(overview.totalByCurrency[code] ?? 0, code)}</Text>
      {list.map(row)}
    </GlassSurface>
  ));

  return (
    <ScrollView
      // На планшеті дашборд не розповзається ширше за Layout.wideMaxWidth.
      contentContainerStyle={[
        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 },
        isWide && WIDE_COLUMN,
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <TouchableOpacity
          onPress={onNewAccount}
          accessibilityRole="button"
          accessibilityLabel={tr.newAccount}
          style={[st.action, { backgroundColor: t.action.primary }]}>
          <IconSymbol name="plus" size={14} color={t.text.onAction} />
          <Text style={{ ...dsType.label, color: t.text.onAction }}>{tr.newAccount}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onOpenBanks}
          accessibilityRole="button"
          style={[st.action, { ...gs.card }]}>
          <IconSymbol name="building.columns.fill" size={14} color={t.action.secondaryText} />
          <Text style={{ ...dsType.label, color: t.action.secondaryText }}>{tr.finOpenBanks}</Text>
        </TouchableOpacity>
      </View>

      {header ? <View style={{ marginBottom: 12 }}>{header}</View> : null}

      {byCurrency.length === 0 ? (
        <View style={{ paddingVertical: 24 }}>
          <EmptyState icon="banknote" title={tr.noAccounts} caption={tr.noAccountsHint} />
        </View>
      ) : isWide ? (
        // Колонок стільки, скільки влазить карток валют не вужчих за 300pt:
        // портрет планшета — 2, ландшафт — 3. Неповний ряд не розтягує
        // одиноку картку на всю ширину (ResponsiveGrid добиває порожніми).
        <ResponsiveGrid minItemWidth={300} maxColumns={3}>
          {cards.map((card, i) => <React.Fragment key={i}>{card}</React.Fragment>)}
        </ResponsiveGrid>
      ) : cards}

      {archived.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() => setShowArchived(v => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchived }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
            <IconSymbol name={showArchived ? 'chevron.down' : 'chevron.right'} size={12} color={t.text.secondary} />
            <Text style={{ color: t.text.secondary, fontSize: 13, fontFamily: fontFamily.semibold, ...dsType.numeric }}>{tr.finArchivedAccounts} ({archived.length})</Text>
          </TouchableOpacity>
          {showArchived ? (
            <View style={[st.card, { ...gs.card }]}>{archived.map(row)}</View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const WIDE_COLUMN = { width: '100%', maxWidth: WIDE_CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

const st = StyleSheet.create({
  card: { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact, marginBottom: space.cardGapCompact },
  cardTitle: { ...dsType.caption, fontFamily: fontFamily.medium },
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  bar: { height: 6, borderRadius: radius.pill, marginTop: 8, overflow: 'hidden' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill },
});
