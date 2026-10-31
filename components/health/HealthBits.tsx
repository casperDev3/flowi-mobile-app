/**
 * components/health/HealthBits.tsx — дрібні будівельні блоки вкладок здоровʼя.
 *
 * HealthCard — скляна картка DS v2.1 (<GlassSurface>: блюр на iOS, заливка
 * glass.surface + спекулярний обідок), радіус 20, поле 20, відступ знизу 12;
 * перед заголовком — крапка акценту модуля (coral). Заголовок секції живе
 * ВСЕРЕДИНІ картки (H2 16/600); окремих заголовків над картками з
 * кольоровою іконкою більше немає: у masonry заголовок, відірваний від своєї
 * картки, опинявся б в іншій колонці.
 *
 * Кольори розділів (калорії, сон, кроки…) лишаються лише на ДАНИХ —
 * кільцях, смужках і графіках. Елементи керування — один акцент розділу.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, space, type } from '@/constants/theme';
import { GlassSurface } from '@/components/ds';
import { ds, useDS } from '@/hooks/use-ds';
import { type HealthColors } from '@/utils/healthTheme';

/** Палітра, якої досить картці: підходить і HealthColors, і FinColors. */
type CardColors = Pick<HealthColors, 'card' | 'border' | 'sub'>;

export function HealthCard({ c, title, right, children, style, testID }: {
  c: CardColors;
  /** Заголовок секції (верхній регістр робить стиль, не рядок). */
  title?: string;
  /** Вміст праворуч від заголовка: кнопка «+», значення, перемикач. */
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { t, g } = useDS();
  return (
    <GlassSurface testID={testID} radius={radius.cardCompact} style={[st.card, style]}>
      {title || right ? (
        <View style={st.head}>
          {/* DS v2.1: крапка акценту модуля (coral) перед заголовком секції. */}
          {title ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.accent.coral.fill }} /> : null}
          {title ? (
            <Text accessibilityRole="header" numberOfLines={1} style={[st.title, { color: t.text.primary }]}>{title}</Text>
          ) : <View style={{ flex: 1 }} />}
          {right}
        </View>
      ) : null}
      {children}
    </GlassSurface>
  );
}

/** Кнопка «додати» в заголовку картки — кругла pill action.primary (DS v2). */
export function HealthAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { t } = useDS();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[st.add, { backgroundColor: t.action.primary }]}>
      <IconSymbol name="plus" size={17} color={t.text.onAction} />
    </TouchableOpacity>
  );
}

/**
 * Старий заголовок секції над карткою. Вкладки здоровʼя його вже не беруть
 * (див. HealthCard); лишається для сумісності з екранами поза вкладками.
 */
export function SectionHeader({ title, icon, color, textColor, top = 22 }: {
  title: string; icon: any; color: string; textColor: string; top?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: top, marginBottom: 10, gap: 9 }}>
      <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={14} color={color} />
      </View>
      <Text style={[type.h2, { color: textColor, fontSize: 17 }]}>{title}</Text>
    </View>
  );
}

export function QuickStatCard({ value, label, icon, color, isDark, border, sub, text }: {
  value: string; label: string; icon: any; color: string;
  isDark: boolean; border: string; sub: string; text: string;
}) {
  return (
    <View
      style={{ flex: 1, borderRadius: radius.nested, padding: 12, alignItems: 'center',
        ...ds.glass(isDark, 'subtle') }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.pill, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <Text style={{ color: text, fontSize: 14, fontFamily: fontFamily.medium, fontVariant: ['tabular-nums'], textAlign: 'center' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 11, fontFamily: fontFamily.regular, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export function CalStat({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  const { t } = useDS();
  return (
    <View style={{ flex: 1 }}>
      {/* Колір метрики — тонкою позначкою; саме число — text.primary, тонке й табличне. */}
      <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: color, marginBottom: 6 }} />
      <Text style={{ color: t.text.primary, fontSize: 24, lineHeight: 28, letterSpacing: -0.48, fontFamily: fontFamily.light, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 12, fontFamily: fontFamily.regular, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

/** Картка DS v2: радіус 20, поле 20, без рамки; між картками 12. */
export const HEALTH_CARD_STYLE = {
  borderRadius: radius.cardCompact,
  padding: space.cardPaddingCompact,
  marginBottom: space.cardGapCompact,
} as const;

const st = StyleSheet.create({
  card:  HEALTH_CARD_STYLE,
  head:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, minHeight: 22 },
  title: { flex: 1, ...type.h2 },
  add:   { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
