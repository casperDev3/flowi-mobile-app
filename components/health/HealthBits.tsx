/**
 * components/health/HealthBits.tsx — дрібні будівельні блоки вкладок здоровʼя.
 *
 * HealthCard — Omni BentoCard (DS v2.2): СУЦІЛЬНА картка вмісту (surface.card
 * + м'яка тінь, без рамки; скло лишається функціональному шару), поле 20,
 * відступ знизу 12. Шапка за Omni: кругла icon-chip (акцент модуля — coral,
 * або власний) + назва 16/600, праворуч — кнопка «+», значення чи перемикач.
 * Заголовок живе ВСЕРЕДИНІ картки: у masonry заголовок, відірваний від своєї
 * картки, опинявся б в іншій колонці. `variant="ai"` — лавандово-рожева
 * змивка для інсайтів (AI-блок).
 *
 * Кольори розділів (калорії, сон, кроки…) лишаються лише на ДАНИХ —
 * кільцях, смужках і графіках. Елементи керування — один акцент розділу.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, space, type, type GlassAccent } from '@/constants/theme';
import { BentoCard, type BentoVariant } from '@/components/ds';
import { ds, useDS } from '@/hooks/use-ds';
import { type HealthColors } from '@/utils/healthTheme';

/** Палітра, якої досить картці: підходить і HealthColors, і FinColors. */
type CardColors = Pick<HealthColors, 'card' | 'border' | 'sub'>;

export function HealthCard({ c, title, icon = 'heart.fill', accent = 'coral', variant = 'default', right, children, style, testID }: {
  c: CardColors;
  /** Заголовок секції. */
  title?: string;
  /** Іконка icon-chip у шапці (Omni). */
  icon?: IconSymbolName;
  accent?: GlassAccent;
  variant?: BentoVariant;
  /** Вміст праворуч від заголовка: кнопка «+», значення, перемикач. */
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  void c;
  // Без назви, але з «правим» вмістом — лише правий ряд (як і раніше).
  return (
    <BentoCard
      testID={testID}
      compact
      variant={variant}
      title={title}
      icon={title ? icon : undefined}
      accent={accent}
      headerRight={title ? right : undefined}
      style={[st.card, style]}>
      {!title && right ? <View style={st.head}><View style={{ flex: 1 }} />{right}</View> : null}
      {children}
    </BentoCard>
  );
}

/** Кнопка «додати» в заголовку картки — кругла pill action.primary (DS v2). */
export function HealthAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { t } = useDS();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[st.add, { backgroundColor: t.action.primary }]}>
      <IconSymbol name="plus" size={18} color={t.text.onAction} />
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
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: top, marginBottom: 10, gap: 8 }}>
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
        <IconSymbol name={icon} size={16} color={color} />
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
  // Поле й радіус дає BentoCard (compact); тут — лише відступ між картками.
  card:  { marginBottom: HEALTH_CARD_STYLE.marginBottom },
  head:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, minHeight: 22 },
  title: { flex: 1, ...type.h2 },
  add:   { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
