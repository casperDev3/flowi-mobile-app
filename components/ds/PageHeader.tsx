/**
 * components/ds/PageHeader.tsx — шапка сторінки Omni + KPI-лічильники.
 *
 * Omni: велике H1 + однорядковий підзаголовок ліворуч, праворуч 2–3
 * лічильники, за потреби — головна дія.
 *
 * Лічильник (11.2026, рішення власника): ПІДПИС ПІД ЧИСЛОМ, не поруч —
 *   12           ← велике тонке число (tabular-nums)
 *   Активних     ← підпис 12 / Medium, text.secondary, до 2 рядків
 *   3 прострочено ← дельта (коли є), колір тону
 * Поруч підпис «плив» за шириною числа: «1 Задачі» і «16 Задачі» стояли з
 * різним відступом. Тепер усі підписи стрічки починаються з лівого краю
 * свого числа, а стрічка вирівняна по верху.
 *
 * Телефон (compact): заголовок малює AppHeader, тож PageHeader зазвичай без
 * `title`; лічильники — горизонтальна стрічка з прокруткою (не переносяться й
 * не стискаються, кожен лишає своє число цілим).
 * Планшет: один ряд — заголовок ліворуч, лічильники й дія праворуч; якщо
 * ряд не вміщається, лічильники переносяться під заголовок (flexWrap).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontFamily, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';

// ─── KpiCounter ──────────────────────────────────────────────────────────────

export type KpiDeltaTone = 'up' | 'down' | 'neutral';

export type KpiCounterProps = {
  value: string | number;
  /** Підпис ПІД числом, до двох рядків («Задачі на тиждень»). */
  label: string;
  /** Маленька дельта під підписом («+12 сьогодні», «3 прострочено»). */
  delta?: string;
  /** up — зелена (success ink), down — червона (coral ink), neutral — secondary. */
  deltaTone?: KpiDeltaTone;
  /** Колір самого числа (напр. status.danger для «прострочено» > 0). */
  valueColor?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
};

/** Стеля Dynamic Type для KPI: 44pt × 1.3 ще вміщується в стрічку телефона. */
const KPI_MAX_FONT_SCALE = 1.3;

export function KpiCounter({ value, label, delta, deltaTone = 'neutral', valueColor, onPress, accessibilityLabel, testID }: KpiCounterProps) {
  const { t, g } = useDS();
  const { isCompact } = useResponsive();
  const deltaColor = deltaTone === 'up' ? g.accent.success.ink : deltaTone === 'down' ? g.accent.coral.ink : t.text.secondary;
  const a11y = accessibilityLabel ?? [String(value), label, delta].filter(Boolean).join(', ');
  const body = (
    <View style={st.kpi}>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={KPI_MAX_FONT_SCALE}
        style={[st.kpiValue, isCompact ? st.kpiValueCompact : null, { color: valueColor ?? t.text.primary }]}>
        {value}
      </Text>
      <Text numberOfLines={2} maxFontSizeMultiplier={KPI_MAX_FONT_SCALE} style={[st.kpiLabel, { color: t.text.secondary }]}>{label}</Text>
      {delta ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={KPI_MAX_FONT_SCALE} style={[st.kpiDelta, { color: deltaColor }]}>{delta}</Text>
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        style={({ pressed }) => [st.kpiHit, pressed ? { opacity: 0.6 } : null]}>
        {body}
      </Pressable>
    );
  }
  return <View testID={testID} accessible accessibilityLabel={a11y} style={st.kpiHit}>{body}</View>;
}

// ─── PageHeader ──────────────────────────────────────────────────────────────

export type PageHeaderProps = {
  /** H1. На телефоні зазвичай не передається — заголовок уже в AppHeader. */
  title?: string;
  subtitle?: string;
  /** <KpiCounter/> × 2–3. */
  kpis?: React.ReactNode;
  /** Головна дія (PillButton primary) — праворуч на планшеті, під KPI на телефоні. */
  action?: React.ReactNode;
  /** Горизонтальні поля стрічки KPI на телефоні (щоб прокрутка йшла від краю до краю). */
  bleed?: number;
  style?: StyleProp<ViewStyle>;
};

export function PageHeader({ title, subtitle, kpis, action, bleed = 0, style }: PageHeaderProps) {
  const { t } = useDS();
  const { isCompact } = useResponsive();
  const titleBlock = (title || subtitle) ? (
    <View style={{ flexShrink: 1, minWidth: 220 }}>
      {title ? (
        <Text accessibilityRole="header" numberOfLines={2} maxFontSizeMultiplier={1.4} style={[type.h1, { color: t.text.primary }]}>{title}</Text>
      ) : null}
      {subtitle ? (
        <Text numberOfLines={2} style={[type.body, { color: t.text.secondary, marginTop: title ? 4 : 0 }]}>{subtitle}</Text>
      ) : null}
    </View>
  ) : null;

  if (isCompact) {
    return (
      <View style={[{ gap: 12 }, style]}>
        {titleBlock}
        {kpis ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={bleed ? { marginHorizontal: -bleed } : null}
            contentContainerStyle={[st.kpiRow, bleed ? { paddingHorizontal: bleed } : null]}>
            {kpis}
          </ScrollView>
        ) : null}
        {action ? <View style={{ alignSelf: 'flex-start' }}>{action}</View> : null}
      </View>
    );
  }

  return (
    <View style={[st.wideRow, style]}>
      {titleBlock}
      {(kpis || action) ? (
        <View style={st.wideRight}>
          {kpis ? <View style={st.kpiRow}>{kpis}</View> : null}
          {action}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  kpiHit: { minHeight: 44, justifyContent: 'flex-start' },
  // Колонка: число → підпис → дельта. alignItems flex-start — ширина підпису
  // не прив'язана до ширини числа («2» не стискає «Активних» у стовпчик).
  kpi: { flexDirection: 'column', alignItems: 'flex-start', minWidth: 64 },
  kpiValue: { fontFamily: fontFamily.light, fontSize: 48, lineHeight: 52, letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  kpiValueCompact: { fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  kpiLabel: { marginTop: 4, maxWidth: 132, fontSize: 12, lineHeight: 16, fontFamily: fontFamily.medium },
  kpiDelta: { marginTop: 2, maxWidth: 132, fontSize: 12, lineHeight: 16, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'] },
  // Верхнє вирівнювання: числа стоять на одній лінії, навіть коли в одного
  // лічильника підпис у два рядки або є дельта.
  kpiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  wideRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  wideRight: { flexDirection: 'row', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' },
});
