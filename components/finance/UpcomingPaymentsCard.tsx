/**
 * components/finance/UpcomingPaymentsCard.tsx — блок «Найближчі оплати / Прострочено».
 *
 * Показується на «Сьогодні» і у «Фінансах». Дані — підписки, у яких оплата
 * протягом тижня або вже прострочена (upcomingPayments), усі — прострочені
 * окремою секцією першими, як у вебі. Блок сам сховище не пише: «Оплачено»
 * відкриває підтвердження суми на екрані підписок (params open + pay=1) — саме
 * там живе read-modify-write і захист від повторної оплати циклу.
 *
 * Дані винесені в хук окремо від розмітки, щоб екран міг вирішити, чи взагалі
 * малювати обгортку секції: на планшетній сітці «Сьогодні» порожня секція
 * лишила б дірку в дві колонки.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, type as dsType } from '@/constants/theme';
import { dsTokens } from '@/hooks/use-ds';
import { useStorageRefresh } from '@/hooks/use-storage-refresh';
import { useTodayKey } from '@/hooks/use-today-key';
import { loadData } from '@/store/storage';
import type { Translations } from '@/store/translations';
import { BUILTIN_CURRENCIES, type Currency } from '@/utils/financeUtils';
import {
  formatSubscriptionMoney,
  normalizeSubscriptions,
  upcomingPayments,
  type Subscription,
  type UpcomingPayment,
} from '@/utils/subscriptions';
import { BentoCard } from '@/components/ds';


export interface UpcomingPaymentsData {
  items: UpcomingPayment[];
  currencies: Currency[];
}

/** Підписки з оплатою протягом `withinDays` днів + прострочені. Перечитує при фокусі й записах. */
export function useUpcomingPayments(withinDays = 7): UpcomingPaymentsData {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>(BUILTIN_CURRENCIES);
  // «Сьогодні» не застигає: фокус + повернення з фону + північ (hooks/use-today-key.ts).
  const today = useTodayKey();

  const load = useCallback(async () => {
    const [raw, custom] = await Promise.all([
      loadData<unknown>('subscriptions', []),
      loadData<Currency[]>('finance_currencies', []),
    ]);
    setSubs(normalizeSubscriptions(raw));
    setCurrencies([...BUILTIN_CURRENCIES, ...(Array.isArray(custom) ? custom : [])]);
  }, []);

  useFocusEffect(useCallback(() => {
    load().catch(e => { if (__DEV__) console.warn('[subscriptions] завантаження блоку оплат не вдалося:', e); });
  }, [load]));
  useStorageRefresh(['subscriptions', 'finance_currencies'], load);

  const items = useMemo(() => upcomingPayments(subs, today, withinDays), [subs, today, withinDays]);
  // Обʼєкт-результат мемоізуємо разом із вмістом: новий літерал щорендера
  // робив би нестабільним усе, що його читає, — зокрема мемоізовану шапку
  // стрічки Фінансів (PERF-4).
  return useMemo(() => ({ items, currencies }), [items, currencies]);
}

export function UpcomingPaymentsCard({
  data, isDark, c, tr, lang, style, withinDays = 7, todayOnly = false,
}: {
  data: UpcomingPaymentsData;
  isDark: boolean;
  c: { text: string; sub: string; border: string };
  tr: Translations;
  lang: string;
  style?: StyleProp<ViewStyle>;
  /** Той самий горизонт, що й у useUpcomingPayments — лише для підпису секції. */
  withinDays?: number;
  /**
   * Лише оплати з датою СЬОГОДНІ — без прострочених і найближчих. Так блок
   * стоїть на вкладці «Операції» Фінансів (рішення власника): повний список
   * підписок живе у вкладці «Підписки».
   */
  todayOnly?: boolean;
}) {
  const router = useRouter();
  const t = dsTokens(isDark);
  const RED = t.status.danger;
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { currencies } = data;
  const items = todayOnly ? data.items.filter(item => item.daysUntil === 0) : data.items;
  const overdue = items.filter(item => item.status === 'overdue');
  const soon = items.filter(item => item.status !== 'overdue');

  if (items.length === 0) return null;

  const whenLabel = (item: UpcomingPayment): string => {
    if (item.daysUntil < 0) return tr.subOverdueDays.replace('{n}', String(-item.daysUntil));
    if (item.daysUntil === 0) return tr.today;
    if (item.daysUntil === 1) return tr.tomorrow;
    return tr.subInDays.replace('{n}', String(item.daysUntil));
  };

  const renderRow = (item: UpcomingPayment, idx: number) => {
    const sub = item.subscription;
    const isOverdue = item.status === 'overdue';
    return (
      <TouchableOpacity
        key={sub.id}
        onPress={() => router.push({ pathname: '/subscriptions', params: { open: sub.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${sub.name}, ${whenLabel(item)}`}
        activeOpacity={0.75}
        style={[st.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.hairline }]}>
        <View style={[st.iconBox, { backgroundColor: (sub.color || '#8B6CFF') + '22' }]}>
          <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={16} color={sub.color || '#8B6CFF'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ ...dsType.bodyMedium, color: t.text.primary }}>{sub.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
            {isOverdue ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent.coral }} /> : null}
            <Text numberOfLines={1} style={{ ...dsType.caption, color: isOverdue ? t.text.primary : t.text.secondary, fontFamily: isOverdue ? fontFamily.semibold : fontFamily.regular }}>
              {whenLabel(item)}
            </Text>
          </View>
        </View>
        <Text style={{ color: t.text.primary, fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] }}>
          {formatSubscriptionMoney(sub.amount, sub.currency, currencies, locale)}
        </Text>
        {/* Як у вебі: оплата просто з блоку. Підтвердження суми — на екрані
            підписок (pay=1 відкриває його одразу), бо там живе вся логіка
            свіжого читання, запису витрати й захисту від повторної оплати. */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/subscriptions', params: { open: sub.id, pay: '1' } })}
          accessibilityRole="button"
          accessibilityLabel={`${tr.subPayNow}: ${sub.name}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={[st.renewBtn, { backgroundColor: isOverdue ? t.action.primary : t.surface.subtle }]}>
          <Text style={{ color: isOverdue ? t.text.onAction : t.action.secondaryText, fontSize: 12, fontFamily: fontFamily.semibold }}>{tr.subPayNow}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const sectionLabel = (text: string, color: string, first: boolean) => (
    <View style={[st.sectionHead, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border.hairline }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color === RED ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent.coral }} /> : null}
        <Text style={[st.sectionText, { color: t.text.secondary }]}>{text}</Text>
      </View>
    </View>
  );
  const split = overdue.length > 0 && soon.length > 0;

  // Omni (DS v2.2): суцільна BentoCard — «icon-chip + назва», праворуч
  // pill-посилання на «Підписки»; рядки розділені волосиною.
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <BentoCard
        compact
        title={todayOnly ? tr.finTodayDue : overdue.length && !soon.length ? tr.subOverdue : tr.subUpcoming}
        icon="calendar"
        accent={overdue.length ? 'coral' : 'lime'}
        headerRight={
          <TouchableOpacity
            onPress={() => router.push('/subscriptions')}
            accessibilityRole="link"
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            style={[st.link, { backgroundColor: t.surface.subtle }]}>
            <Text style={{ color: t.text.primary, fontSize: 12, fontFamily: fontFamily.medium }}>{tr.navSubscriptions}</Text>
            <IconSymbol name="chevron.right" size={10} color={t.text.secondary} />
          </TouchableOpacity>
        }
        style={st.card}>
        {split ? sectionLabel(`${tr.subOverdue} · ${overdue.length}`, RED, true) : null}
        {overdue.map((item, idx) => renderRow(item, split ? idx + 1 : idx))}
        {split ? sectionLabel(tr.subUpcomingWithin.replace('{n}', String(withinDays)), t.text.secondary, false) : null}
        {soon.map((item, idx) => renderRow(item, split ? idx + 1 : idx))}
      </BentoCard>
    </View>
  );
}

const st = StyleSheet.create({
  badge:   { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  card:    { paddingBottom: 8 },
  link:    { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 12, borderRadius: radius.pill },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 56 },
  iconBox: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  renewBtn: { borderRadius: radius.pill, minHeight: 32, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 6 },
  sectionHead: { paddingTop: 10, paddingBottom: 2 },
  sectionText: { fontSize: 13, fontFamily: fontFamily.medium },
});
