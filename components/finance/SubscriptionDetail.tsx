/**
 * components/finance/SubscriptionDetail.tsx — рядок списку й деталь підписки.
 *
 * Деталь малюється в DetailPane: на телефоні — модальний лист, на планшеті
 * (expanded) — колонка праворуч. Тому все, що в ній відкривається («Продовжено»
 * з підтвердженням суми), розкривається ІНЛАЙН, а не другою модалкою.
 *
 * «Продовжено» не створює фінансових операцій: лише зсуває дату наступної
 * оплати на один період і дописує запис в історію (renewSubscription).
 */
import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import {
  addPeriod,
  daysBetween,
  formatDateKey,
  formatPeriod,
  formatSubscriptionMoney,
  monthlyEquivalent,
  parseAmountInput,
  parseDateKey,
  subscriptionLink,
  subscriptionStatus,
  yearlyEquivalent,
  type CurrencyLike,
  type Subscription,
} from '@/utils/subscriptions';

export interface SubscriptionUiColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
  red: string;
  green: string;
}

export const OVERDUE_RED = '#EF4444';

/** «через 3 дн.» / «Сьогодні» / «прострочено 2 дн.» */
export function paymentWhenLabel(nextPaymentDate: string, today: string, tr: Translations): string {
  const days = daysBetween(today, nextPaymentDate);
  if (!Number.isFinite(days)) return '';
  if (days < 0) return tr.subOverdueDays.replace('{n}', String(-days));
  if (days === 0) return tr.today;
  if (days === 1) return tr.tomorrow;
  return tr.subInDays.replace('{n}', String(days));
}

// ─── Рядок списку ─────────────────────────────────────────────────────────────

export const SubscriptionRow = React.memo(function SubscriptionRow({
  sub, today, selected, currencies, locale, lang, project, onPress, onRenew, colors: c, tr,
}: {
  sub: Subscription;
  today: string;
  selected: boolean;
  currencies: readonly CurrencyLike[];
  locale: string;
  lang: 'uk' | 'en';
  project?: { name: string; color: string } | null;
  onPress: (id: string) => void;
  /** Швидке «Продовжено» просто з рядка (відкриває підтвердження суми в деталі). */
  onRenew?: (id: string) => void;
  colors: SubscriptionUiColors;
  tr: Translations;
}) {
  const status = subscriptionStatus(sub, today);
  const overdue = status === 'overdue';
  const archived = status === 'archived';
  const tint = sub.color || '#8B5CF6';
  return (
    <TouchableOpacity
      onPress={() => onPress(sub.id)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={sub.name}
      style={[st.row, {
        borderColor: selected ? c.accent : overdue ? OVERDUE_RED + '55' : c.border,
        backgroundColor: selected ? c.accent + '12' : c.dim,
        opacity: archived ? 0.6 : 1,
      }]}>
      <View style={[st.iconBox, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={18} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontWeight: '700' }}>{sub.name}</Text>
          {overdue ? <StatusChip label={tr.subOverdue} color={OVERDUE_RED} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: overdue ? OVERDUE_RED : c.sub, fontSize: 12, marginTop: 2 }}>
          {archived
            ? (sub.archivedAt ? tr.subArchivedChip : tr.subEnded.replace('{date}', formatDateKey(sub.endDate ?? '', locale)))
            : `${formatDateKey(sub.nextPaymentDate, locale)} · ${paymentWhenLabel(sub.nextPaymentDate, today, tr)}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11 }}>{formatPeriod(sub.period, lang)}</Text>
          {project ? (
            <View style={[st.projectChip, { borderColor: c.border }]}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: project.color }} />
              <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, maxWidth: 120 }}>{project.name}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ color: overdue ? OVERDUE_RED : c.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
          {formatSubscriptionMoney(sub.amount, sub.currency, currencies, locale)}
        </Text>
        {!archived && onRenew ? (
          <TouchableOpacity
            onPress={() => onRenew(sub.id)}
            accessibilityRole="button"
            accessibilityLabel={`${tr.subRenew}: ${sub.name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[st.renewMini, { borderColor: overdue ? OVERDUE_RED : c.accent }]}>
            <IconSymbol name="checkmark" size={11} color={overdue ? OVERDUE_RED : c.accent} />
            <Text style={{ color: overdue ? OVERDUE_RED : c.accent, fontSize: 11, fontWeight: '700' }}>{tr.subRenew}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[st.statusChip, { backgroundColor: color + '22', borderColor: color + '55' }]}>
      <Text style={{ color, fontSize: 10, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

// ─── Шапка деталі (липка) ─────────────────────────────────────────────────────

export function SubscriptionDetailHeader({ sub, onEdit, onClose, colors: c, tr }: {
  sub: Subscription;
  onEdit: () => void;
  onClose: () => void;
  colors: SubscriptionUiColors;
  tr: Translations;
}) {
  const tint = sub.color || '#8B5CF6';
  return (
    <View style={st.headerRow}>
      <View style={[st.iconBoxLg, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={20} color={tint} />
      </View>
      <Text numberOfLines={2} style={{ flex: 1, color: c.text, fontSize: 19, fontWeight: '800' }}>{sub.name}</Text>
      <TouchableOpacity
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={tr.edit}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        style={[st.headerBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
        <IconSymbol name="pencil" size={15} color={c.sub} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={tr.close}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        style={[st.headerBtn, { borderColor: c.border, backgroundColor: c.dim }]}>
        <IconSymbol name="xmark" size={15} color={c.sub} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Тіло деталі ──────────────────────────────────────────────────────────────

export function SubscriptionDetailBody({
  sub, today, currencies, locale, lang, project, categoryLabel, accountLabel,
  renewOpen, onRenewOpenChange, onRenew, onArchive, onRestore, onDelete, busy, colors: c, tr,
}: {
  sub: Subscription;
  today: string;
  currencies: readonly CurrencyLike[];
  locale: string;
  lang: 'uk' | 'en';
  project?: { name: string; color: string } | null;
  categoryLabel?: string | null;
  accountLabel?: string | null;
  renewOpen: boolean;
  onRenewOpenChange: (open: boolean) => void;
  onRenew: (amount: number) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  busy: boolean;
  colors: SubscriptionUiColors;
  tr: Translations;
}) {
  const status = subscriptionStatus(sub, today);
  const overdue = status === 'overdue';
  const archived = status === 'archived';
  const [amountText, setAmountText] = useState(String(sub.amount));
  const money = (n: number, code = sub.currency) => formatSubscriptionMoney(n, code, currencies, locale);

  // Кожне відкриття підтвердження — з поточною ціною підписки.
  useEffect(() => {
    if (renewOpen) setAmountText(String(sub.amount));
  }, [renewOpen, sub.amount, sub.id]);

  const renewAmount = parseAmountInput(amountText);
  const renewValid = Number.isFinite(renewAmount) && renewAmount > 0;
  const nextAfterRenew = addPeriod(sub.nextPaymentDate, sub.period, sub.billingDay ?? parseDateKey(sub.nextPaymentDate)?.d);
  const link = subscriptionLink(sub.url);
  const history = [...(sub.history ?? [])].reverse();

  const reminderLabel = sub.reminderDaysBefore === 0
    ? tr.subReminderDayOf
    : sub.reminderDaysBefore === 1
      ? tr.subReminder1
      : sub.reminderDaysBefore === 3
        ? tr.subReminder3
        : sub.reminderDaysBefore === 7
          ? tr.subReminder7
          : `${sub.reminderDaysBefore}`;

  return (
    <View>
      {/* Сума, період, статус */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: overdue ? OVERDUE_RED : c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
          {money(sub.amount)}
        </Text>
        <Text style={{ color: c.sub, fontSize: 14, marginBottom: 5 }}>{formatPeriod(sub.period, lang)}</Text>
      </View>
      <Text style={{ color: c.sub, fontSize: 12, marginTop: 2 }}>
        ≈ {money(monthlyEquivalent(sub))}{tr.subPerMonth} · {money(yearlyEquivalent(sub))}{tr.subPerYear}
      </Text>
      {overdue || archived ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <StatusChip
            label={overdue ? tr.subOverdue : sub.archivedAt ? tr.subArchivedChip : tr.subEnded.replace('{date}', formatDateKey(sub.endDate ?? '', locale))}
            color={overdue ? OVERDUE_RED : c.sub}
          />
        </View>
      ) : null}

      {/* Продовжено — з підтвердженням суми (ціна могла змінитися) */}
      {!archived ? (
        renewOpen ? (
          <View style={[st.renewPanel, { borderColor: overdue ? OVERDUE_RED + '66' : c.accent + '66', backgroundColor: c.dim }]}>
            <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.subRenewAmount} ({sub.currency})</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel={tr.subRenewAmount}
              style={[st.input, { color: c.text, borderColor: renewValid ? c.border : OVERDUE_RED, backgroundColor: 'transparent' }]}
            />
            <Text style={{ color: c.sub, fontSize: 12, lineHeight: 17, marginTop: 6 }}>
              {tr.subRenewHint.replace('{date}', formatDateKey(nextAfterRenew, locale))}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => onRenewOpenChange(false)}
                accessibilityRole="button"
                style={[st.btn, { flex: 1, borderWidth: 1, borderColor: c.border }]}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{tr.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (renewValid && !busy) onRenew(renewAmount); }}
                disabled={!renewValid || busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: !renewValid || busy }}
                accessibilityLabel={tr.subRenewConfirm}
                style={[st.btn, { flex: 1.4, backgroundColor: renewValid ? (overdue ? OVERDUE_RED : c.accent) : c.border }]}>
                <IconSymbol name="checkmark" size={14} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700' }}>{tr.subRenewConfirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => onRenewOpenChange(true)}
            accessibilityRole="button"
            accessibilityLabel={tr.subRenew}
            style={[st.btn, { marginTop: 14, backgroundColor: overdue ? OVERDUE_RED : c.accent }]}>
            <IconSymbol name="checkmark.circle" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{tr.subRenew}</Text>
          </TouchableOpacity>
        )
      ) : null}

      {/* Поля */}
      <View style={[st.infoBlock, { borderColor: c.border }]}>
        <InfoRow icon="calendar" label={tr.subNextPayment} c={c}
          value={`${formatDateKey(sub.nextPaymentDate, locale)}${!archived ? ` · ${paymentWhenLabel(sub.nextPaymentDate, today, tr)}` : ''}`}
          valueColor={overdue ? OVERDUE_RED : undefined} />
        <InfoRow icon="calendar.badge.plus" label={tr.subEndDate} c={c}
          value={sub.endDate ? formatDateKey(sub.endDate, locale) : tr.subIndefinite} />
        <InfoRow icon="bell" label={tr.subReminder} c={c} value={reminderLabel} />
        {project ? <InfoRow icon="folder" label={tr.project} c={c} value={project.name} dot={project.color} /> : null}
        {categoryLabel ? <InfoRow icon="tag.fill" label={tr.category} c={c} value={categoryLabel} /> : null}
        {accountLabel ? <InfoRow icon="creditcard.fill" label={tr.account} c={c} value={accountLabel} /> : null}
        {link ? (
          <TouchableOpacity
            onPress={() => { Linking.openURL(link).catch(() => {}); }}
            accessibilityRole="link"
            accessibilityLabel={`${tr.subUrl}: ${sub.url}`}>
            <InfoRow icon="link" label={tr.subUrl} c={c} value={sub.url ?? ''} valueColor={c.accent} last />
          </TouchableOpacity>
        ) : null}
      </View>
      {accountLabel ? <Text style={{ color: c.sub, fontSize: 11, marginTop: 4 }}>{tr.subAccountHint}</Text> : null}

      {sub.note ? (
        <View style={{ marginTop: 14 }}>
          <Text style={[st.sectionLabel, { color: c.sub }]}>{tr.note}</Text>
          <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{sub.note}</Text>
        </View>
      ) : null}

      {/* Історія продовжень */}
      <Text style={[st.sectionLabel, { color: c.sub, marginTop: 18 }]}>{tr.subHistory}</Text>
      {history.length === 0 ? (
        <Text style={{ color: c.sub, fontSize: 13 }}>{tr.subHistoryEmpty}</Text>
      ) : history.map((h, idx) => (
        <View
          key={`${h.date}_${h.renewedAt ?? idx}_${idx}`}
          style={[st.historyRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
          <IconSymbol name="checkmark.circle" size={14} color={c.green} />
          <Text style={{ flex: 1, color: c.text, fontSize: 13 }}>{formatDateKey(h.date, locale)}</Text>
          <Text style={{ color: c.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {money(h.amount, h.currency || sub.currency)}
          </Text>
        </View>
      ))}

      {/* Архів / відновлення / видалення */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
        {archived ? (
          <TouchableOpacity
            onPress={onRestore}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={tr.restore}
            style={[st.btn, { flex: 1, borderWidth: 1, borderColor: c.accent }]}>
            <IconSymbol name="arrow.counterclockwise" size={14} color={c.accent} />
            <Text style={{ color: c.accent, fontWeight: '700' }}>{tr.restore}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onArchive}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={tr.subArchiveAction}
            style={[st.btn, { flex: 1, borderWidth: 1, borderColor: c.border }]}>
            <IconSymbol name="archivebox" size={14} color={c.sub} />
            <Text style={{ color: c.text, fontWeight: '600' }}>{tr.subArchiveAction}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDelete}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={tr.delete}
          style={[st.btn, { flex: 1, borderWidth: 1, borderColor: OVERDUE_RED + '55' }]}>
          <IconSymbol name="trash" size={14} color={OVERDUE_RED} />
          <Text style={{ color: OVERDUE_RED, fontWeight: '600' }}>{tr.delete}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value, valueColor, dot, last, c }: {
  icon: IconSymbolName;
  label: string;
  value: string;
  valueColor?: string;
  dot?: string;
  last?: boolean;
  c: SubscriptionUiColors;
}) {
  return (
    <View style={[st.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border }]}>
      <IconSymbol name={icon} size={14} color={c.sub} />
      <Text style={{ color: c.sub, fontSize: 13, width: 118 }}>{label}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
        <Text numberOfLines={2} style={{ flexShrink: 1, textAlign: 'right', color: valueColor ?? c.text, fontSize: 13, fontWeight: '600' }}>{value}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  iconBox:     { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconBoxLg:   { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  projectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  statusChip:  { borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  renewMini:   { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  headerBtn:   { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  renewPanel:  { marginTop: 14, borderRadius: 14, borderWidth: 1, padding: 12 },
  input:       { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, fontWeight: '700', marginTop: 6 },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12 },
  infoBlock:   { marginTop: 16, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
  sectionLabel:{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
});
