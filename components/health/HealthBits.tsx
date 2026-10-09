import { Atlas } from '@/constants/atlas';
/**
 * components/health/HealthBits.tsx — дрібні будівельні блоки вкладок здоровʼя.
 *
 * HealthCard — суцільна картка в стилі Фінансів (components/finance/OverviewTab):
 * фон c.card, рамка c.border, Atlas.radius.xlarge, поле 16, відступ знизу 12.
 * Заголовок секції живе ВСЕРЕДИНІ картки дрібними великими літерами — як
 * «cardTitle» у Фінансах; окремих заголовків над картками з кольоровою
 * іконкою більше немає: у masonry заголовок, відірваний від своєї картки,
 * опинявся б в іншій колонці.
 *
 * Кольори розділів (калорії, сон, кроки…) лишаються лише на ДАНИХ —
 * кільцях, смужках і графіках. Елементи керування — один акцент розділу.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { ACCENT, type HealthColors } from '@/utils/healthTheme';

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
  return (
    <View testID={testID} style={[st.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {title || right ? (
        <View style={st.head}>
          {title ? (
            <Text accessibilityRole="header" numberOfLines={1} style={[st.title, { color: c.sub }]}>{title}</Text>
          ) : <View style={{ flex: 1 }} />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Кнопка «додати» в заголовку картки — завжди акцент розділу. */
export function HealthAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[st.add, { backgroundColor: ACCENT }]}>
      <IconSymbol name="plus" size={17} color="#fff" />
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
      <View style={{ width: 28, height: 28, borderRadius: Atlas.radius.small, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <IconSymbol name={icon} size={14} color={color} />
      </View>
      <Text style={{ color: textColor, fontSize: 17, fontWeight: Atlas.type.headingWeight }}>{title}</Text>
    </View>
  );
}

export function QuickStatCard({ value, label, icon, color, isDark, border, sub, text }: {
  value: string; label: string; icon: any; color: string;
  isDark: boolean; border: string; sub: string; text: string;
}) {
  return (
    <View
      style={{ flex: 1, borderRadius: Atlas.radius.large, borderWidth: 1, borderColor: border, padding: 12, alignItems: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)' }}>
      <View style={{ width: 32, height: 32, borderRadius: Atlas.radius.medium, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <IconSymbol name={icon} size={15} color={color} />
      </View>
      <Text style={{ color: text, fontSize: 12, fontWeight: Atlas.type.headingWeight, textAlign: 'center' }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export function CalStat({ label, value, color, sub }: { label: string; value: string; color: string; sub: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontSize: 16, fontWeight: Atlas.type.headingWeight }}>{value}</Text>
      <Text style={{ color: sub, fontSize: 10, fontWeight: '600', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

/** Ті самі числа, що й у картки Фінансів (OverviewTab st.card / st.cardTitle). */
export const HEALTH_CARD_STYLE = {
  borderWidth: 1,
  borderRadius: Atlas.radius.xlarge,
  padding: 16,
  marginBottom: 12,
} as const;

const st = StyleSheet.create({
  card:  HEALTH_CARD_STYLE,
  head:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 20 },
  title: { flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  add:   { width: 38, height: 38, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center' },
});
