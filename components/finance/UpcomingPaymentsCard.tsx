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
import { BlurView } from 'expo-blur';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
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

const RED = '#EF4444';

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
  data, isDark, c, tr, lang, style, withinDays = 7,
}: {
  data: UpcomingPaymentsData;
  isDark: boolean;
  c: { text: string; sub: string; border: string };
  tr: Translations;
  lang: string;
  style?: StyleProp<ViewStyle>;
  /** Той самий горизонт, що й у useUpcomingPayments — лише для підпису секції. */
  withinDays?: number;
}) {
  const router = useRouter();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';
  const { items, currencies } = data;
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
        style={[st.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
        <View style={[st.iconBox, { backgroundColor: (sub.color || '#8B5CF6') + '22' }]}>
          <IconSymbol name={(sub.icon || 'repeat') as IconSymbolName} size={15} color={sub.color || '#8B5CF6'} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{sub.name}</Text>
          <Text numberOfLines={1} style={{ color: isOverdue ? RED : c.sub, fontSize: 12, marginTop: 1, fontWeight: isOverdue ? '700' : '400' }}>
            {whenLabel(item)}
          </Text>
        </View>
        <Text style={{ color: c.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {formatSubscriptionMoney(sub.amount, sub.currency, currencies, locale)}
        </Text>
        {/* Як у вебі: оплата просто з блоку. Підтвердження суми — на екрані
            підписок (pay=1 відкриває його одразу), бо там живе вся логіка
            свіжого читання, запису витрати й захисту від повторної оплати. */}
        <TouchableOpacity
          onPress={() => router.push({ pathname: '/subscriptions', params: { open: sub.id, pay: '1' } })}
          accessibilityRole="button"
          accessibilityLabel={`${tr.payAction}: ${sub.name}`}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          style={[st.renewBtn, { backgroundColor: isOverdue ? RED + '1A' : 'transparent', borderColor: isOverdue ? RED + '40' : c.border }]}>
          <Text style={{ color: isOverdue ? RED : c.text, fontSize: 12, fontWeight: '700' }}>{tr.payAction}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const sectionLabel = (text: string, color: string, first: boolean) => (
    <View style={[st.sectionHead, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
      <Text style={[st.sectionText, { color }]}>{text}</Text>
    </View>
  );
  const split = overdue.length > 0 && soon.length > 0;

  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <View style={st.headRow}>
        <Text style={[st.title, { color: overdue.length && !soon.length ? RED : c.sub }]}>
          {overdue.length && !soon.length ? tr.subOverdue : tr.subUpcoming}
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/subscriptions')}
          accessibilityRole="link"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: c.sub, fontSize: 12, fontWeight: '700' }}>{tr.navSubscriptions}</Text>
        </TouchableOpacity>
      </View>
      <BlurView intensity={isDark ? 18 : 36} tint={isDark ? 'dark' : 'light'} style={[st.card, { borderColor: c.border }]}>
        {split ? sectionLabel(`${tr.subOverdue} · ${overdue.length}`, RED, true) : null}
        {overdue.map((item, idx) => renderRow(item, split ? idx + 1 : idx))}
        {split ? sectionLabel(tr.subUpcomingWithin.replace('{n}', String(withinDays)), c.sub, false) : null}
        {soon.map((item, idx) => renderRow(item, split ? idx + 1 : idx))}
      </BlurView>
    </View>
  );
}

const st = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  badge:   { borderRadius: 8, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  card:    { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  iconBox: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  renewBtn: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  sectionHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  sectionText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
