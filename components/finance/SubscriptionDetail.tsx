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
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, touchTarget, type as dsType } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
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
import { useGlassStyles } from '@/components/finance/finPalette';

export interface SubscriptionUiColors {
  text: string;
  sub: string;
  border: string;
  dim: string;
  accent: string;
  red: string;
  green: string;
}

/** Прострочка — status.danger DS v2 (гліфи/крапки; текст лишається text.primary). */
export const OVERDUE_RED = '#E8543F';

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
  accessibilityActions, onAccessibilityAction,
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
  /** Layout System v2.4: дії свайпу рядка — і для VoiceOver (SwipeRow). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
}) {
  const status = subscriptionStatus(sub, today);
  const overdue = status === 'overdue';
  const archived = status === 'archived';
  const tint = sub.color || '#8B5CF6';
  const { t: ds, isDark } = useDS();
  // Omni (DS v2.2): рядок — суцільна картка списку (surface.card + м'яка тінь),
  // вкладені чипи — surface.subtle (скляний subtle на білій картці зникав).
  return (
    <TouchableOpacity
      onPress={() => onPress(sub.id)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={sub.name}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={[st.row, {
        // Вибраний — 2px рамка action.primary (прозора у спокої — без сіпання).
        borderColor: selected ? ds.action.primary : 'transparent',
        backgroundColor: ds.surface.card,
        opacity: archived ? 0.6 : 1,
      }, shadow[isDark ? 'dark' : 'light'].card]}>
      <View style={[st.iconBox, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={18} color={tint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: c.text, fontSize: 15, fontFamily: fontFamily.semibold }}>{sub.name}</Text>
          {overdue ? <StatusChip label={tr.subOverdue} color={ds.accent.coral} /> : null}
        </View>
        <Text numberOfLines={1} style={{ ...dsType.caption, ...dsType.numeric, color: overdue ? ds.text.primary : ds.text.secondary, marginTop: 2 }}>
          {archived
            ? (sub.archivedAt ? tr.subArchivedChip : tr.subEnded.replace('{date}', formatDateKey(sub.endDate ?? '', locale)))
            : `${formatDateKey(sub.nextPaymentDate, locale)} · ${paymentWhenLabel(sub.nextPaymentDate, today, tr)}`}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <Text numberOfLines={1} style={{ color: ds.text.secondary, fontSize: 11, fontFamily: fontFamily.regular }}>{formatPeriod(sub.period, lang)}</Text>
          {project ? (
            <View style={[st.projectChip, { backgroundColor: ds.surface.subtle }]}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: project.color }} />
              <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, maxWidth: 120 }}>{project.name}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ color: ds.text.primary, fontSize: 16, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
          {formatSubscriptionMoney(sub.amount, sub.currency, currencies, locale)}
        </Text>
        {!archived && onRenew ? (
          <TouchableOpacity
            onPress={() => onRenew(sub.id)}
            accessibilityRole="button"
            accessibilityLabel={`${tr.subPayNow}: ${sub.name}`}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={[st.renewMini, { backgroundColor: overdue ? ds.action.primary : ds.surface.subtle }]}>
            <IconSymbol name="checkmark" size={11} color={overdue ? ds.text.onAction : ds.action.secondaryText} />
            <Text style={{ color: overdue ? ds.text.onAction : ds.action.secondaryText, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.subPayNow}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

function StatusChip({ label, color }: { label: string; color: string }) {
  // DS v2: статус — крапкою кольору, підпис text.primary (корал не тримає дрібний текст).
  const { t: ds } = useDS();
  return (
    <View style={[st.statusChip, { backgroundColor: ds.surface.subtle }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: ds.text.primary, fontSize: 11, fontFamily: fontFamily.semibold }}>{label}</Text>
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
  const { t: ds } = useDS();
  const gs = useGlassStyles();
  return (
    <View style={st.headerRow}>
      <View style={[st.iconBoxLg, { backgroundColor: tint + '22' }]}>
        <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={20} color={tint} />
      </View>
      <Text numberOfLines={2} style={{ flex: 1, color: ds.text.primary, fontSize: 20, lineHeight: 26, fontFamily: fontFamily.semibold }}>{sub.name}</Text>
      <TouchableOpacity
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={tr.edit}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        style={[st.headerBtn, { ...gs.subtle }]}>
        <IconSymbol name="pencil" size={15} color={ds.text.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={tr.close}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        style={[st.headerBtn, { ...gs.subtle }]}>
        <IconSymbol name="xmark" size={15} color={ds.text.primary} />
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
  const { t: ds } = useDS();
  const gs = useGlassStyles();
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
        {/* Сума — display-цифри (тонкі, великі, табличні). */}
        <Text style={{ ...dsType.display, fontSize: 44, lineHeight: 48, color: ds.text.primary }}>
          {money(sub.amount)}
        </Text>
        <Text style={{ ...dsType.displayUnit, fontSize: 16, color: ds.text.secondary, marginBottom: 6 }}>{formatPeriod(sub.period, lang)}</Text>
      </View>
      <Text style={{ ...dsType.caption, ...dsType.numeric, color: ds.text.secondary, marginTop: 4 }}>
        ≈ {money(monthlyEquivalent(sub))}{tr.subPerMonth} · {money(yearlyEquivalent(sub))}{tr.subPerYear}
      </Text>
      {overdue || archived ? (
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <StatusChip
            label={overdue ? tr.subOverdue : sub.archivedAt ? tr.subArchivedChip : tr.subEnded.replace('{date}', formatDateKey(sub.endDate ?? '', locale))}
            color={overdue ? ds.accent.coral : ds.text.secondary}
          />
        </View>
      ) : null}

      {/* Продовжено — з підтвердженням суми (ціна могла змінитися) */}
      {!archived ? (
        renewOpen ? (
          <View style={[st.renewPanel, { ...gs.subtle }]}>
            <Text style={{ color: ds.text.secondary, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.subRenewAmount} ({sub.currency})</Text>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              autoFocus
              accessibilityLabel={tr.subRenewAmount}
              style={[st.input, { backgroundColor: (gs.card.backgroundColor as string), color: ds.text.primary, borderColor: renewValid ? 'transparent' : ds.status.danger }]}
            />
            <Text style={{ ...dsType.caption, color: ds.text.secondary, lineHeight: 17, marginTop: 6 }}>
              {tr.subRenewHint.replace('{date}', formatDateKey(nextAfterRenew, locale))}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => onRenewOpenChange(false)}
                accessibilityRole="button"
                style={[st.btn, { ...gs.card, flex: 1 }]}>
                <Text style={{ ...dsType.label, color: ds.text.primary }}>{tr.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { if (renewValid && !busy) onRenew(renewAmount); }}
                disabled={!renewValid || busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: !renewValid || busy }}
                accessibilityLabel={tr.subRenewConfirm}
                style={[st.btn, { flex: 1.4, backgroundColor: renewValid ? ds.action.primary : ds.state.disabledBg }]}>
                <IconSymbol name="checkmark" size={14} color={renewValid ? ds.text.onAction : ds.state.disabledText} />
                <Text style={{ ...dsType.label, color: renewValid ? ds.text.onAction : ds.state.disabledText }}>{tr.subRenewConfirm}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => onRenewOpenChange(true)}
            accessibilityRole="button"
            accessibilityLabel={tr.subPayNow}
            style={[st.btn, { marginTop: 16, minHeight: 52, backgroundColor: ds.action.primary }]}>
            <IconSymbol name="checkmark.circle" size={16} color={ds.text.onAction} />
            <Text style={{ ...dsType.label, fontSize: 15, color: ds.text.onAction }}>{tr.subPayNow}</Text>
          </TouchableOpacity>
        )
      ) : null}

      {/* Поля */}
      <View style={[st.infoBlock, { ...gs.subtle }]}>
        <InfoRow icon="calendar" label={tr.subNextPayment} c={c}
          value={`${formatDateKey(sub.nextPaymentDate, locale)}${!archived ? ` · ${paymentWhenLabel(sub.nextPaymentDate, today, tr)}` : ''}`}
          valueColor={undefined} dot={overdue ? ds.accent.coral : undefined} />
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
            <InfoRow icon="link" label={tr.subUrl} c={c} value={sub.url ?? ''} valueColor={ds.text.primary} last />
          </TouchableOpacity>
        ) : null}
      </View>
      {accountLabel ? <Text style={{ ...dsType.caption, color: ds.text.secondary, marginTop: 6 }}>{tr.subAccountHint}</Text> : null}

      {sub.note ? (
        <View style={{ marginTop: 14 }}>
          <Text style={[st.sectionLabel, { color: ds.text.secondary }]}>{tr.note}</Text>
          <Text style={{ ...dsType.body, color: ds.text.primary }}>{sub.note}</Text>
        </View>
      ) : null}

      {/* Історія продовжень */}
      <Text style={[st.sectionLabel, { color: ds.text.secondary, marginTop: 20 }]}>{tr.subHistory}</Text>
      {history.length === 0 ? (
        <Text style={{ ...dsType.body, color: ds.text.secondary }}>{tr.subHistoryEmpty}</Text>
      ) : history.map((h, idx) => (
        <View
          key={`${h.date}_${h.renewedAt ?? idx}_${idx}`}
          style={[st.historyRow, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.border.hairline }]}>
          <IconSymbol name="checkmark.circle" size={14} color={ds.status.success} />
          <Text style={{ flex: 1, color: ds.text.primary, fontSize: 13, fontFamily: fontFamily.regular, ...dsType.numeric }}>{formatDateKey(h.date, locale)}</Text>
          <Text style={{ color: c.text, fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
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
            style={[st.btn, { flex: 1, backgroundColor: ds.action.primary }]}>
            <IconSymbol name="arrow.counterclockwise" size={14} color={ds.text.onAction} />
            <Text style={{ ...dsType.label, color: ds.text.onAction }}>{tr.restore}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onArchive}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={tr.subArchiveAction}
            style={[st.btn, { ...gs.subtle, flex: 1 }]}>
            <IconSymbol name="archivebox" size={14} color={ds.action.secondaryText} />
            <Text style={{ ...dsType.label, color: ds.action.secondaryText }}>{tr.subArchiveAction}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDelete}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={tr.delete}
          style={[st.btn, { flex: 1, backgroundColor: ds.status.danger + '14' }]}>
          <IconSymbol name="trash" size={14} color={ds.status.danger} />
          <Text style={{ ...dsType.label, color: ds.status.danger }}>{tr.delete}</Text>
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
  const { t: ds } = useDS();
  return (
    <View style={[st.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.border.hairline }]}>
      <IconSymbol name={icon} size={14} color={ds.text.secondary} />
      <Text style={{ color: ds.text.secondary, fontSize: 13, fontFamily: fontFamily.regular, width: 118 }}>{label}</Text>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
        {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
        <Text numberOfLines={2} style={{ flexShrink: 1, textAlign: 'right', color: valueColor ?? ds.text.primary, fontSize: 13, fontFamily: fontFamily.semibold, ...dsType.numeric }}>{value}</Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row:         { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.nested, borderWidth: 2, padding: 14 },
  iconBox:     { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconBoxLg:   { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  projectChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  statusChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  renewMini:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, minHeight: 30, paddingHorizontal: 12, paddingVertical: 4 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12 },
  headerBtn:   { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  renewPanel:  { marginTop: 16, borderRadius: radius.nested, padding: space[4] },
  input:       { borderRadius: radius.control, borderWidth: 1, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: 10, fontSize: 20, fontFamily: fontFamily.medium, marginTop: 6, ...dsType.numeric },
  btn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, minHeight: 48, paddingHorizontal: 16 },
  infoBlock:   { marginTop: 16, borderRadius: radius.nested, paddingHorizontal: space[4] },
  infoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  sectionLabel:{ fontSize: 11, fontFamily: fontFamily.semibold, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  historyRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
});
