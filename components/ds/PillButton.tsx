/**
 * components/ds/PillButton.tsx — pill-кнопка DS v2.
 *
 *  primary   — action.primary (чорна у світлій, світла у темній) + text.onAction.
 *              Лишається СУЦІЛЬНОЮ навіть у Liquid Glass — якір контрасту.
 *              `glow` — застаріле: лише нейтральна тінь, кольорового світіння немає (unslop).
 *  accent    — суцільна заливка акценту (solid) + onSolid (#111113).
 *  secondary — скляна pill (glass.surfaceSubtle + обідок) + text.primary
 *  ghost     — прозора, лише підпис
 *
 * Стани: pressed (action.primaryPressed + scale .98; при «Зменшенні руху» —
 * без масштабу), focus (2px lavender ring — клавіатура на iPad), disabled
 * (state.*), loading. Мінімальна висота — 44pt.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useResolvedAccent } from '@/components/ds/AccentContext';
import { radius, space, touchTarget, type, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export type PillButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent';

export type PillButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: PillButtonVariant;
  /** sm — 36pt візуально, але зона дотику добирається hitSlop до 44. */
  size?: 'md' | 'sm';
  icon?: IconSymbolName;
  /** Іконка праворуч від підпису (стрілка «далі»). */
  iconRight?: IconSymbolName;
  loading?: boolean;
  fullWidth?: boolean;
  /** Акцент для variant="accent" і glow (за замовчуванням — акцент модуля). */
  accent?: GlassAccent;
  /** М'яке світіння акцентом під primary/accent-кнопкою (iOS). */
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PillButton({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  accent,
  glow = false,
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  hitSlop,
  onFocus,
  onBlur,
  ...rest
}: PillButtonProps) {
  const { t, g, isDark, reduceTransparency } = useDS();
  const roles = g.accent[useResolvedAccent(accent)];
  const reduced = useReduceMotion();
  const [focused, setFocused] = useState(false);
  const inactive = !!disabled || loading;

  const fg = inactive
    ? t.state.disabledText
    : variant === 'primary'
      ? t.text.onAction
      : variant === 'accent'
        ? roles.onSolid
        : t.action.secondaryText;

  const bgFor = (pressed: boolean): string => {
    if (inactive) return variant === 'ghost' ? 'transparent' : t.state.disabledBg;
    if (variant === 'primary') return pressed ? t.action.primaryPressed : t.action.primary;
    if (variant === 'accent') return roles.solid;
    if (variant === 'secondary') {
      if (reduceTransparency) return pressed ? t.border.hairline : t.action.secondary;
      return pressed ? g.surfaceStrong : g.surfaceSubtle;
    }
    return pressed ? (reduceTransparency ? t.surface.subtle : g.surfaceSubtle) : 'transparent';
  };

  const height = size === 'sm' ? 36 : touchTarget;
  const slop = hitSlop ?? (size === 'sm' ? { top: 4, bottom: 4, left: 0, right: 0 } : undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading, ...accessibilityState }}
      disabled={inactive}
      hitSlop={slop}
      onFocus={e => { setFocused(true); onFocus?.(e); }}
      onBlur={e => { setFocused(false); onBlur?.(e); }}
      style={({ pressed }) => [
        {
          minHeight: height,
          paddingHorizontal: size === 'sm' ? space[4] : space[5],
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          backgroundColor: bgFor(pressed),
          opacity: variant === 'accent' && pressed && !inactive ? 0.85 : 1,
          borderWidth: 2,
          borderColor: focused
            ? t.focus.ring
            : variant === 'secondary' && !inactive && !reduceTransparency ? g.rim : 'transparent',
          // Unslop: кольорове світіння прибрано — `glow` лишився в API як
          // м'яка нейтральна тінь (головна дія вирізняється чорно-білою pill).
          ...(glow && !inactive && (variant === 'primary' || variant === 'accent') && Platform.OS !== 'android'
            ? { shadowColor: '#111113', shadowOpacity: isDark ? 0.4 : 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }
            : null),
          transform: pressed && !reduced && !inactive ? [{ scale: 0.98 }] : undefined,
        } as ViewStyle,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <IconSymbol name={icon} size={size === 'sm' ? 15 : 17} color={fg} /> : null}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={[type.label, size === 'sm' && { fontSize: 13 }, { color: fg }]}>
            {label}
          </Text>
          {iconRight ? <IconSymbol name={iconRight} size={size === 'sm' ? 15 : 17} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}
