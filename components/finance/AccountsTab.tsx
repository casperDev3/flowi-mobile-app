/**
 * components/finance/AccountsTab.tsx — вкладка «Рахунки» (finance-revamp.md §2.1):
 * оборот періоду (доходи/витрати — з «Операцій»), рахунки по валютах із
 * балансами (ті самі цифри, що financeOverview),
 * скарбнички (`kind='savings'`) з ціллю, вхід до легасі-«Скарбничок».
 *
 * Період і ракурс на баланс не впливають (§3.2): баланс — факт про рахунок.
 *
 * Omni (DS v2.2): дії — pill-ряд угорі; оборот періоду й валюти — BentoCard у
 * BentoGrid (1 колонка телефон, 2–3 планшет); ціль скарбнички — сегментний
 * прогрес. Рядки — на суцільній картці, кнопки всередині — surface.subtle.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScrollHeaderSlot, useScrollHeaderScroll } from '@/components/shared/ScrollHeaderSlot';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { BentoCard, BentoGrid, EmptyState, SegmentedProgress } from '@/components/ds';
import { fontFamily, radius, type as dsType } from '@/constants/theme';
import { WIDE_CONTENT_MAX_WIDTH } from '@/hooks/use-content-width';
import { useDS } from '@/hooks/use-ds';
import type { Translations } from '@/store/translations';
import type { Account, AccountKind } from '@/utils/accounts';
import type { FinanceOverview } from '@/utils/financeOverview';
import type { FinColors } from './financeLabels';

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
  const { t } = useDS();
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
            <SegmentedProgress
              value={balance / goal}
              height={6}
              showValue
              accessibilityLabel={`${a.name}: ${Math.round(Math.min(1, Math.max(0, balance / goal)) * 100)}%`}
              style={{ marginTop: 8 }}
            />
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
    <BentoCard
      key={code}
      compact
      title={tr.finOnAccounts.replace('{currency}', code)}
      icon="creditcard.fill"
      accent="lime">
      {/* Підсумок валюти — великі тонкі табличні цифри (Omni KPI). */}
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
        style={{ ...dsType.displaySm, fontFamily: fontFamily.light, color: t.text.primary, marginBottom: 10 }}>{signed(overview.totalByCurrency[code] ?? 0, code)}</Text>
      {list.map(row)}
    </BentoCard>
  ));

  const onHeaderScroll = useScrollHeaderScroll();
  return (
    <ScrollView
      // На планшеті дашборд не розповзається ширше за Layout.wideMaxWidth.
      contentContainerStyle={[
        { paddingHorizontal: 20, paddingTop: 12, paddingBottom: bottomInset + 24 },
        isWide && WIDE_COLUMN,
      ]}
      showsVerticalScrollIndicator={false}
      // Телефон (11.2026): заголовок розділу гортається з вмістом вкладки.
      onScroll={onHeaderScroll}
      scrollEventThrottle={16}>
      <ScrollHeaderSlot insetX={20} />
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
          style={[st.action, { backgroundColor: t.surface.card, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border.hairline }]}>
          <IconSymbol name="building.columns.fill" size={14} color={t.action.secondaryText} />
          <Text style={{ ...dsType.label, color: t.action.secondaryText }}>{tr.finOpenBanks}</Text>
        </TouchableOpacity>
      </View>

      {byCurrency.length === 0 ? (
        <>
          {header ? <View style={{ marginBottom: 12 }}>{header}</View> : null}
          <View style={{ paddingVertical: 24 }}>
            <EmptyState icon="banknote" title={tr.noAccounts} caption={tr.noAccountsHint} />
          </View>
        </>
      ) : (
        // Колонок стільки, скільки влазить карток не вужчих за 280pt
        // (BentoGrid): телефон — 1, портрет планшета — 2, ландшафт — 3.
        // Оборот періоду — першою карткою на всю ширину ряду.
        <BentoGrid style={{ marginBottom: 12 }}>
          {header ? <GridCell key="flow" span="full">{header}</GridCell> : null}
          {cards}
        </BentoGrid>
      )}

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
            <BentoCard compact>{archived.map(row)}</BentoCard>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

/** Клітинка BentoGrid для готового вузла: сітка читає `span` з пропсів дитини. */
function GridCell({ children }: { span?: number | 'full'; children: React.ReactNode }) {
  return <>{children}</>;
}

const WIDE_COLUMN = { width: '100%', maxWidth: WIDE_CONTENT_MAX_WIDTH, alignSelf: 'center' } as const;

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill },
});
