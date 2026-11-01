/**
 * components/ds/Bento.tsx — bento-сітка й картки Omni (DS v2.2).
 *
 * BentoCard — суцільна картка вмісту (НЕ скло: скло — функціональний шар
 * навігації за Apple HIG; вміст лежить на непрозорих картках). Заголовок
 * картки за Omni: кругла icon-chip + назва 16/600 ліворуч, праворуч —
 * period-pill («Цей місяць ⌄») або кругла ↗-кнопка.
 *
 * Варіанти:
 *   default — surface.card + м'яка тінь (темна — світлий верхній край);
 *   dark    — «виділена» чорнильна картка (featured.*), ОДНА на сторінку;
 *   ai      — лавандово-рожева змивка gradient.aiCard + сфера.
 * Дочірні елементи беруть кольори тексту з useBentoColors() — інакше на
 * dark-картці text.primary стає чорним по чорному.
 *
 * BentoGrid — 1 колонка на телефоні, 2 на medium, 3 на expanded (за
 * sizeClass з use-responsive), але не більше, ніж вміщує реальна ширина
 * (мін. ~280pt на колонку: на iPad у Split View sizeClass «medium», а місця
 * на одну картку). Дитина може займати кілька колонок: <BentoCard span={2}>
 * або span="full".
 */
import { LinearGradient } from 'expo-linear-gradient';
import React, { createContext, useContext, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AIOrb } from '@/components/ds/AIBlock';
import { useResolvedAccent } from '@/components/ds/AccentContext';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, type GlassAccent } from '@/constants/theme';
import { type BySizeClass, pickBySizeClass } from '@/constants/tokens';
import { useDS } from '@/hooks/use-ds';
import { useResponsive } from '@/hooks/use-responsive';

// ─── Кольори всередині картки ────────────────────────────────────────────────

export type BentoVariant = 'default' | 'dark' | 'ai';

export type BentoColors = {
  variant: BentoVariant;
  text: string;
  textSecondary: string;
  /** Підкладка icon-chip / круглих кнопок у шапці. */
  chipBg: string;
  /** Вкладені рядки всередині картки. */
  nestedBg: string;
  hairline: string;
  /** Головна дія всередині картки (на dark — біла pill). */
  actionBg: string;
  actionText: string;
};

const BentoColorsContext = createContext<BentoColors | null>(null);

function useBentoPalette(variant: BentoVariant): BentoColors {
  const { t, isDark } = useDS();
  if (variant === 'dark') {
    return {
      variant,
      text: t.featured.text,
      textSecondary: t.featured.textSecondary,
      chipBg: 'rgba(255,255,255,0.12)',
      nestedBg: 'rgba(255,255,255,0.08)',
      hairline: t.featured.hairline,
      actionBg: t.featured.action,
      actionText: t.featured.actionText,
    };
  }
  return {
    variant,
    text: t.text.primary,
    textSecondary: t.text.secondary,
    chipBg: variant === 'ai' ? (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)') : t.surface.subtle,
    nestedBg: variant === 'ai' ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.6)') : t.surface.subtle,
    hairline: t.border.hairline,
    actionBg: t.action.primary,
    actionText: t.text.onAction,
  };
}

/** Кольори тексту/підкладок поточної BentoCard (поза карткою — default). */
export function useBentoColors(): BentoColors {
  const ctx = useContext(BentoColorsContext);
  const fallback = useBentoPalette('default');
  return ctx ?? fallback;
}

// ─── Шапка картки ────────────────────────────────────────────────────────────

/**
 * Кругла ↗-кнопка в шапці картки (перехід у розділ). Ціль дотику 44.
 * Без onPress — декоративний знак «картка веде далі» для картки, яка сама
 * є кнопкою (вкладати кнопку в кнопку не можна — скрінрідер склеює їх).
 */
export function BentoArrowButton({ onPress, accessibilityLabel, testID }: {
  onPress?: () => void; accessibilityLabel?: string; testID?: string;
}) {
  const c = useBentoColors();
  if (!onPress) {
    return (
      <View
        testID={testID}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[st.roundBtn, { backgroundColor: c.chipBg }]}>
        <IconSymbol name="arrow.up.right" size={15} color={c.text} />
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [st.roundBtn, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
      <IconSymbol name="arrow.up.right" size={15} color={c.text} />
    </Pressable>
  );
}

/** Pill-перемикач періоду («Цей місяць ⌄»). Без onPress — просто мітка. */
export function BentoPeriodPill({ label, onPress, accessibilityLabel }: {
  label: string; onPress?: () => void; accessibilityLabel?: string;
}) {
  const c = useBentoColors();
  const body = (
    <>
      <Text numberOfLines={1} style={[st.periodText, { color: c.text }]}>{label}</Text>
      {onPress ? <IconSymbol name="chevron.down" size={11} color={c.textSecondary} /> : null}
    </>
  );
  if (!onPress) return <View style={[st.period, { backgroundColor: c.chipBg }]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={({ pressed }) => [st.period, { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  );
}

export type BentoCardHeaderProps = {
  title: string;
  icon?: IconSymbolName;
  /** Колір іконки — ink акценту модуля (на dark — білий). */
  accent?: GlassAccent;
  /** Праворуч: BentoPeriodPill / BentoArrowButton / бейдж. */
  right?: React.ReactNode;
  /** Рядок під назвою (caption). */
  subtitle?: string;
};

export function BentoCardHeader({ title, icon, accent, right, subtitle }: BentoCardHeaderProps) {
  const { g } = useDS();
  const c = useBentoColors();
  const a = g.accent[useResolvedAccent(accent)];
  return (
    <View style={st.head}>
      <View style={st.headLead}>
        {icon ? (
          <View style={[st.chip, { backgroundColor: c.variant === 'default' ? a.tint : c.chipBg }]}>
            <IconSymbol name={icon} size={16} color={c.variant === 'dark' ? c.text : a.ink} />
          </View>
        ) : null}
        <View style={{ flexShrink: 1 }}>
          <Text accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={1.6} style={[st.title, { color: c.text }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text numberOfLines={1} style={[st.subtitle, { color: c.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {right ? <View style={st.headRight}>{right}</View> : null}
    </View>
  );
}

// ─── Картка ──────────────────────────────────────────────────────────────────

export type BentoCardProps = {
  variant?: BentoVariant;
  /** Шапка за Omni-патерном (або власна — через children). */
  title?: string;
  icon?: IconSymbolName;
  accent?: GlassAccent;
  headerRight?: React.ReactNode;
  subtitle?: string;
  /** Уся картка — кнопка (перехід у розділ). */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Колонок у BentoGrid (за замовч. 1). */
  span?: number | 'full';
  compact?: boolean;
  padded?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function BentoCard({
  variant = 'default', title, icon, accent, headerRight, subtitle, onPress, accessibilityLabel,
  compact, padded = true, testID, style, children,
}: BentoCardProps) {
  const { t, scheme } = useDS();
  const palette = useBentoPalette(variant);
  const pad = padded ? (compact ? space.cardPaddingCompact : space.cardPadding) : 0;
  const base: ViewStyle = {
    borderRadius: compact ? radius.cardCompact : radius.card,
    padding: pad,
    overflow: 'hidden',
    backgroundColor: variant === 'dark' ? t.featured.bg : variant === 'ai' ? t.surface.card : t.surface.card,
    ...(variant === 'dark' ? shadow[scheme].popover : shadow[scheme].card),
  };
  const content = (
    <BentoColorsContext.Provider value={palette}>
      {variant === 'ai' ? (
        <>
          <LinearGradient
            pointerEvents="none"
            colors={t.gradient.aiCard}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={st.orb} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <AIOrb size={120} />
          </View>
        </>
      ) : null}
      {title ? (
        <BentoCardHeader title={title} icon={icon} accent={accent} right={headerRight} subtitle={subtitle} />
      ) : null}
      {children}
    </BentoColorsContext.Provider>
  );
  if (onPress) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        style={({ pressed }) => [base, pressed ? { opacity: 0.92, transform: [{ scale: 0.99 }] } : null, style]}>
        {content}
      </Pressable>
    );
  }
  return <View testID={testID} style={[base, style]}>{content}</View>;
}

// ─── Сітка ───────────────────────────────────────────────────────────────────

/** Мінімальна ширина колонки bento: вужче — картки з графіками ламаються. */
export const BENTO_MIN_COLUMN = 280;
export const BENTO_COLUMNS: BySizeClass<number> = { compact: 1, medium: 2, expanded: 3 };

export type BentoGridProps = {
  columns?: BySizeClass<number>;
  /** Відступ між картками (за замовч. 12 на телефоні, 16 ширше). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function BentoGrid({ columns = BENTO_COLUMNS, gap, style, children }: BentoGridProps) {
  const { sizeClass } = useResponsive();
  const [w, setW] = useState(0);
  const g = gap ?? (sizeClass === 'compact' ? space.cardGapCompact : space.cardGap);
  const wanted = pickBySizeClass(sizeClass, columns);
  const cols = w > 0 ? Math.max(1, Math.min(wanted, Math.floor((w + g) / (BENTO_MIN_COLUMN + g)))) : 1;
  const colW = w > 0 ? (w - g * (cols - 1)) / cols : 0;
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const items = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{ span?: number | 'full' }>[];
  return (
    <View onLayout={onLayout} style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: g }, style]}>
      {items.map((child, i) => {
        const raw = child.props.span;
        const span = raw === 'full' ? cols : Math.max(1, Math.min(cols, raw ?? 1));
        const width = cols === 1 || !colW ? '100%' : colW * span + g * (span - 1);
        return (
          <View key={child.key ?? i} style={{ width }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, minHeight: 36 },
  headLead: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  chip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22, fontFamily: fontFamily.semibold },
  subtitle: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.regular },
  roundBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  period: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32,
    paddingHorizontal: 12, borderRadius: radius.pill,
  },
  periodText: { fontSize: 12, fontFamily: fontFamily.medium },
  orb: { position: 'absolute', right: -36, top: -36, opacity: 0.35 },
});
