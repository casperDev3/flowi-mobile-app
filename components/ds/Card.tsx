/**
 * components/ds/Card.tsx — картка DS v2.1 (Liquid Glass).
 *
 * Скляна поверхня (<GlassSurface>) з великим радіусом над mesh-canvas:
 * блюр (iOS) / нативне Liquid Glass (iOS 26+) / напівпрозора заливка (Android),
 * спекулярний обідок і м'яка тінь. «Зменшити прозорість» → суцільна surface.card.
 *
 *   elevated — щільніше скло (strong) + тінь поповера: модалки, плаваючі панелі.
 *   nested   — вкладене скло subtle БЕЗ блюру: блоки й рядки всередині картки.
 *   tint     — акцентна «змивка» (KPI-картка): true = акцент модуля, або явний.
 *   glow     — м'яке світіння акцентом (одна головна KPI на екран).
 *   blur     — false для карток у довгих списках (FlatList): лише заливка.
 *   solid    — стара непрозора картка surface.card (рідко: щільні таблиці).
 */
import React from 'react';
import { Platform, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { GlassSurface } from '@/components/ds/Glass';
import { radius, shadow, space, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type CardProps = ViewProps & {
  /** Компактна: радіус 20 і padding 20 (телефон, щільні сітки). */
  compact?: boolean;
  /** false — без внутрішніх полів (списки з власними рядками). */
  padded?: boolean;
  /** Піднята картка (поповер, плаваюча панель): щільніше скло + сильніша тінь. */
  elevated?: boolean;
  /** Вкладений блок усередині картки: скло subtle, радіус 16/14, без блюру й тіні. */
  nested?: boolean;
  tint?: boolean | GlassAccent;
  glow?: boolean | GlassAccent;
  blur?: boolean;
  /** Непрозора surface.card замість скла. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Card({
  compact, padded = true, elevated, nested, tint, glow, blur, solid, style, children, ...rest
}: CardProps) {
  const { t, scheme } = useDS();

  if (solid) {
    const base: ViewStyle = {
      backgroundColor: elevated ? t.surface.elevated : nested ? t.surface.subtle : t.surface.card,
      borderRadius: nested ? (compact ? radius.nestedCompact : radius.nested) : compact ? radius.cardCompact : radius.card,
      padding: padded ? (nested ? space[4] : compact ? space.cardPaddingCompact : space.cardPadding) : 0,
      ...(nested ? null : elevated ? shadow[scheme].popover : shadow[scheme].card),
    };
    return <View style={[base, style]} {...rest}>{children}</View>;
  }

  if (nested) {
    return (
      <GlassSurface
        variant="subtle"
        radius={compact ? radius.nestedCompact : radius.nested}
        tint={tint}
        style={[{ padding: padded ? space[4] : 0 }, style]}
        {...rest}>
        {children}
      </GlassSurface>
    );
  }

  return (
    <GlassSurface
      variant={elevated ? 'strong' : 'card'}
      radius={compact ? radius.cardCompact : radius.card}
      tint={tint}
      glow={glow}
      blur={blur}
      style={[
        { padding: padded ? (compact ? space.cardPaddingCompact : space.cardPadding) : 0 },
        // Android: elevation просвічує крізь напівпрозоре скло — лише обідок.
        elevated && Platform.OS !== 'android' ? shadow[scheme].popover : null,
        style,
      ]}
      {...rest}>
      {children}
    </GlassSurface>
  );
}
