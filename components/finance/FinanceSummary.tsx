/**
 * components/finance/FinanceSummary.tsx — шапка екрана фінансів.
 *
 * Раніше тут була одна картка з балансом «основної» валюти й стовпчиком інших
 * валют під нею. Вона відповідала на питання «скільки в мене грошей у гривні»,
 * але не на «де саме вони лежать»: готівка не відрізнялася від картки, і будь-яке
 * переміщення грошей між своїми ж місцями виглядало як витрата.
 *
 * Тепер зверху — стрічка РАХУНКІВ: кожен зі своїм балансом у своїй валюті.
 * Тап по рахунку фільтрує стрічку операцій нижче, довгий тап показує «Звідки
 * ця сума». Над стрічкою — «На рахунках» ПО КОЖНІЙ ВАЛЮТІ окремо (курсів
 * валют немає, тож міжвалютного «≈ усього» немає свідомо). Ця цифра та сама,
 * що на плитці «Сьогодні» — обидві з utils/financeOverview.ts.
 *
 * Під стрічкою — оборот місяця (доходи/витрати) по валютах. Перекази в нього не
 * входять: гроші не заробили й не витратили, а переклали з місця на місце.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import type { Account, AccountKind } from '@/utils/accounts';
import type { Currency, CurrencyTotals } from '@/utils/financeUtils';
import { useGlassStyles } from '@/components/finance/finPalette';
import { BentoCard, IconChip, SegmentedProgress } from '@/components/ds';

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
  /** Валюта → сума балансів активних рахунків (financeOverview.totalByCurrency). */
  accountTotals?: Record<string, number>;
  totalLabel?: string;
  /** Довгий тап по рахунку — «Звідки ця сума». */
  onLongPressAccount?: (account: Account) => void;
  breakdownHint?: string;
  /** Текст попередження про операції без рахунку; null — попередження немає. */
  unassignedLabel?: string | null;
  unassignedActive?: boolean;
  onPressUnassigned?: () => void;
}

/** Кольори за видом рахунку — коли користувач не задав власний. */
export const KIND_COLOR: Record<AccountKind, string> = {
  // Ідентичність рахунку (крапка/іконка), не семантика: status.success / status.info / глибока лаванда DS v2.
  cash: '#22A55B',
  card: '#4F7CF7',
  savings: '#8B6CFF',
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
  accountTotals, totalLabel, onLongPressAccount, breakdownHint,
  unassignedLabel, unassignedActive, onPressUnassigned,
}: FinanceSummaryProps) {
  const { t, g } = useDS();
  const gs = useGlassStyles();
  const curOf = (code: string): Currency =>
    currencies.find(cu => cu.code === code) ?? { code, symbol: code, kind: 'fiat', decimals: 2 };

  const totalCodes = Object.keys(accountTotals ?? {})
    .sort((a, b) => (a === primaryCode ? -1 : b === primaryCode ? 1 : a.localeCompare(b)));

  return (
    <View>
      {/* ─── Стрічка рахунків ─── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={[s.sectionLabel, { color: t.text.secondary, flex: 1 }]}>{accountsLabel}</Text>
      </View>

      {/* «На рахунках» — та сама цифра, що на плитці «Сьогодні». */}
      {accounts.length > 0 && totalCodes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, rowGap: 4, marginBottom: 10 }}>
          <Text style={{ ...dsType.caption, color: t.text.secondary }}>{totalLabel}</Text>
          {totalCodes.map(code => {
            const value = accountTotals![code];
            return (
              <Text
                key={code}
                numberOfLines={1}
                accessibilityLabel={`${totalLabel ?? ''} ${fmt(value, curOf(code))}`}
                style={{ ...dsType.displaySm, fontSize: 32, lineHeight: 36, color: value < 0 ? t.status.danger : t.text.primary, flexShrink: 1 }}>
                {fmt(value, curOf(code))}
              </Text>
            );
          })}
        </View>
      )}

      {unassignedLabel ? (
        <TouchableOpacity
          onPress={onPressUnassigned}
          accessibilityRole="button"
          accessibilityState={{ selected: !!unassignedActive }}
          accessibilityLabel={unassignedLabel}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: unassignedActive ? t.action.primary : (gs.card.backgroundColor as string), marginBottom: 10 }}>
          <IconSymbol name="exclamationmark.triangle.fill" size={14} color={t.status.warning} />
          <Text style={{ color: unassignedActive ? t.text.onAction : t.text.primary, fontSize: 13, fontFamily: fontFamily.medium, flex: 1 }}>{unassignedLabel}</Text>
          <IconSymbol name={unassignedActive ? 'xmark' : 'chevron.right'} size={12} color={unassignedActive ? t.text.onAction : t.text.secondary} />
        </TouchableOpacity>
      ) : null}

      {accounts.length === 0 ? (
        <View style={[s.card, { ...gs.card, alignItems: 'center' }, shadow[isDark ? 'dark' : 'light'].card]}>
          <IconChip icon="banknote" accent="lime" size="lg" />
          <Text style={{ ...dsType.h2, color: t.text.primary, marginTop: 8 }}>{noAccountsLabel}</Text>
          <Text style={{ ...dsType.caption, color: t.text.secondary, textAlign: 'center', marginTop: 4, lineHeight: 17 }}>
            {noAccountsHint}
          </Text>
          <TouchableOpacity
            onPress={onNewAccount}
            accessibilityRole="button"
            accessibilityLabel={newAccountLabel}
            style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, minHeight: 44, borderRadius: radius.pill, backgroundColor: t.action.primary }}>
            <IconSymbol name="plus" size={14} color={t.text.onAction} />
            <Text style={{ ...dsType.label, color: t.text.onAction }}>{newAccountLabel}</Text>
          </TouchableOpacity>
        </View>
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
                onLongPress={onLongPressAccount ? () => onLongPressAccount(account) : undefined}
                accessibilityRole="button"
                accessibilityHint={onLongPressAccount ? breakdownHint : undefined}
                accessibilityActions={onLongPressAccount ? [{ name: 'longpress', label: breakdownHint }] : undefined}
                onAccessibilityAction={onLongPressAccount ? (e => { if (e.nativeEvent.actionName === 'longpress') onLongPressAccount(account); }) : undefined}
                accessibilityState={{ selected }}
                accessibilityLabel={`${account.name}, ${fmt(balance, curOf(account.currency))}`}>
                {/* Вибраний рахунок — 2px рамка акценту модуля (lime ink) + змивка;
                    у спокої — скляний обідок (без сіпання розміру). */}
                <View style={[s.accountCard, {
                    ...gs.card,
                    borderWidth: 2,
                    ...(selected
                      ? { backgroundColor: g.accent.lime.tint, borderColor: g.accent.lime.ink, borderTopColor: g.accent.lime.ink, borderBottomColor: g.accent.lime.ink }
                      : null),
                  }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[s.accountIcon, { backgroundColor: tint + (isDark ? '2E' : '1F') }]}>
                      <IconSymbol name={(account.icon as IconSymbolName) ?? KIND_ICON[account.kind]} size={16} color={tint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ color: t.text.primary, fontSize: 13, fontFamily: fontFamily.semibold }}>
                        {account.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: t.text.secondary, fontSize: 11, fontFamily: fontFamily.regular, marginTop: 1 }}>
                        {kindLabel(account.kind)} · {account.currency}
                      </Text>
                    </View>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={{ marginTop: 12, fontSize: 22, lineHeight: 26, fontFamily: fontFamily.light, letterSpacing: -0.44, ...dsType.numeric, color: balance < 0 ? t.status.danger : t.text.primary }}>
                    {fmt(balance, curOf(account.currency))}
                  </Text>
                  {account.goal ? (
                    <Text numberOfLines={1} style={{ color: t.text.secondary, fontSize: 11, fontFamily: fontFamily.regular, marginTop: 2, ...dsType.numeric }}>
                      {fmt(account.goal, curOf(account.currency))}
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Картка «новий рахунок» — щоб завести гаманець там, де на нього дивляться */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onNewAccount}
            accessibilityRole="button"
            accessibilityLabel={newAccountLabel}
            style={[s.accountCard, s.accountAdd, { backgroundColor: (gs.subtle.backgroundColor as string), borderColor: t.border.hairline }]}>
            <IconSymbol name="plus" size={18} color={t.text.primary} />
            <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.semibold, marginTop: 6, textAlign: 'center' }}>
              {newAccountLabel}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <PeriodFlowCard
        currencies={currencies}
        totalsByCurrency={totalsByCurrency}
        primaryCode={primaryCode}
        onPickPrimary={onPickPrimary}
        fmt={fmt}
        isDark={isDark}
        c={c}
        incomeLabel={incomeLabel}
        expenseLabel={expenseLabel}
        savingsLabel={savingsLabel}
        transfersNoteLabel={transfersNoteLabel}
        showTransfersNote={showTransfersNote}
        style={{ marginTop: 14 }}
      />
    </View>
  );
}

/**
 * Оборот періоду (доходи / витрати / % заощаджень) по валютах. Окремо від
 * стрічки рахунків, щоб жити у вкладці «Рахунки» (рішення власника: рахунки
 * й місячні надходження — не в «Операціях»).
 */
export function PeriodFlowCard({
  currencies, totalsByCurrency, primaryCode = 'UAH', onPickPrimary, fmt, isDark, c,
  incomeLabel, expenseLabel, savingsLabel, transfersNoteLabel, showTransfersNote, title, style,
}: {
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
  transfersNoteLabel: string;
  showTransfersNote?: boolean;
  /** Підпис картки зліва від вибору основної валюти. */
  title?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { t: ds } = useDS();
  const curOf = (code: string): Currency =>
    currencies.find(cu => cu.code === code) ?? { code, symbol: code, kind: 'fiat', decimals: 2 };
  const flowCodes = Object.keys(totalsByCurrency)
    .filter(code => {
      const t = totalsByCurrency[code];
      return t && (t.income !== 0 || t.expense !== 0);
    })
    .sort((a, b) => (a === primaryCode ? -1 : b === primaryCode ? 1 : a.localeCompare(b)));
  const picker = onPickPrimary ? (
    <TouchableOpacity
      onPress={onPickPrimary}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={primaryCode}
      style={{ backgroundColor: ds.surface.subtle, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 32, borderRadius: radius.pill }}>
      <Text style={{ fontSize: 12, fontFamily: fontFamily.semibold, color: ds.text.primary, letterSpacing: 0.5 }}>{primaryCode}</Text>
      <IconSymbol name="chevron.down" size={10} color={ds.text.secondary} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  ) : undefined;
  // Omni (DS v2.2): суцільна BentoCard — «icon-chip + назва», праворуч
  // pill основної валюти (як period-pill Omni); норма заощаджень — сегментний
  // прогрес фірмовим градієнтом.
  return (
      <BentoCard
        compact
        title={title}
        icon={title ? 'chart.bar.fill' : undefined}
        accent="lime"
        headerRight={title ? picker : undefined}
        style={style}>

        {!title && picker ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10 }}>{picker}</View>
        ) : null}

        {flowCodes.length === 0 ? (
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <FlowCell label={incomeLabel} value={fmt(0, curOf(primaryCode))} color={ds.text.primary} sub={ds.text.secondary} dot={ds.status.success} />
            <FlowCell label={expenseLabel} value={fmt(0, curOf(primaryCode))} color={ds.text.primary} sub={ds.text.secondary} dot={ds.status.danger} />
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
                  borderTopColor: ds.border.hairline,
                }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, color: ds.text.secondary }}>{cur.code}</Text>
                  {t.income > 0 && (
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ ...dsType.caption, color: ds.text.secondary }}>{savingsLabel}</Text>
                      {/* Значення-бейдж — лайм (правило DS для бейджів значень). */}
                      <View style={{ backgroundColor: ds.accent.lime, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: ds.text.onAccent, fontSize: 12, fontFamily: fontFamily.semibold, ...dsType.numeric }}>{savingsPct}%</Text>
                      </View>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 6 }}>
                  <FlowCell label={incomeLabel} value={fmt(t.income, cur)} color={ds.text.primary} sub={ds.text.secondary} dot={ds.status.success} />
                  <FlowCell label={expenseLabel} value={fmt(t.expense, cur)} color={ds.text.primary} sub={ds.text.secondary} dot={ds.status.danger} />
                </View>
                {t.income > 0 && (
                  <SegmentedProgress
                    value={savingsPct / 100}
                    height={8}
                    accessibilityLabel={`${savingsLabel} ${cur.code}: ${savingsPct}%`}
                    style={{ marginTop: 12 }}
                  />
                )}
              </View>
            );
          })
        )}

        {showTransfersNote && (
          <Text style={{ ...dsType.caption, color: ds.text.secondary, marginTop: 12 }}>
            {transfersNoteLabel}
          </Text>
        )}
      </BentoCard>
  );
}

function FlowCell({ label, value, color, sub, dot }: { label: string; value: string; color: string; sub: string; dot?: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} /> : null}
        <Text style={{ ...dsType.caption, color: sub }}>{label}</Text>
      </View>
      {/* Сума — тонкі табличні цифри (display-рівень картки). */}
      <Text numberOfLines={1} style={{ color, fontSize: 24, lineHeight: 28, fontFamily: fontFamily.light, letterSpacing: -0.48, marginTop: 4, ...dsType.numeric }}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card:         { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact },
  cardTitle:    { ...dsType.h2 },
  sectionLabel: { fontSize: 13, fontFamily: fontFamily.medium },
  // 158pt тримає в один рядок і «Основний UAH», і суму на шість знаків.
  accountCard:  { width: 158, borderRadius: radius.cardCompact, borderWidth: 2, padding: 14, overflow: 'hidden' },
  accountAdd:   { borderStyle: 'dashed', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  accountIcon:  { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
