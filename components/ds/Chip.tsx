/**
 * components/ds/Chip.tsx — чип / сегмент DS v2.1 (Liquid Glass).
 *
 * Неактивний — скло subtle (напівпрозора заливка + обідок, без блюру) +
 * text.primary. Вибраний — суцільна заливка АКЦЕНТУ (solid + onSolid #111113,
 * ≥ 4.99:1): акцент із пропа `accent` або модуля (<GlassScreen module>).
 * Поза акцентним контекстом і без пропа — pill action.primary + text.onAction.
 */
import React, { useState } from 'react';
import { Pressable, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import { useModuleAccent } from '@/components/ds/AccentContext';
import { radius, space, type, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type ChipProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  selected?: boolean;
  icon?: IconSymbolName;
  /** Необов'язковий лічильник праворуч (табличні цифри). */
  count?: number;
  /** Акцент вибраного стану; null — примусово нейтральний (action.primary). */
  accent?: GlassAccent | null;
  style?: StyleProp<ViewStyle>;
};

export function Chip({
  label, selected = false, icon, count, disabled, style, accent,
  accessibilityLabel, accessibilityState, onFocus, onBlur, ...rest
}: ChipProps) {
  const { t, g, reduceTransparency } = useDS();
  const ctxAccent = useModuleAccent();
  const a = accent === null ? null : (accent ?? ctxAccent);
  const roles = a ? g.accent[a] : null;
  const [focused, setFocused] = useState(false);
  const onSel = roles ? roles.onSolid : t.text.onAction;
  const fg = disabled ? t.state.disabledText : selected ? onSel : t.text.primary;
  const sub = disabled ? t.state.disabledText : selected ? onSel : t.text.secondary;
  const idleBg = reduceTransparency ? g.solid.subtle : g.surfaceSubtle;
  const idlePressed = reduceTransparency ? t.border.hairline : g.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: !!disabled, ...accessibilityState }}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      onFocus={e => { setFocused(true); onFocus?.(e); }}
      onBlur={e => { setFocused(false); onBlur?.(e); }}
      style={({ pressed }) => [
        {
          minHeight: 36,
          paddingHorizontal: space[4],
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          backgroundColor: disabled
            ? t.state.disabledBg
            : selected
              ? (roles ? roles.solid : pressed ? t.action.primaryPressed : t.action.primary)
              : (pressed ? idlePressed : idleBg),
          opacity: selected && roles && pressed ? 0.85 : 1,
          // Спекулярний обідок скла; при фокусі — 2px фокус-рінг замість нього.
          borderWidth: 2,
          borderColor: focused
            ? t.focus.ring
            : selected || disabled || reduceTransparency ? 'transparent' : g.rim,
          borderBottomColor: focused
            ? t.focus.ring
            : selected || disabled || reduceTransparency ? 'transparent' : g.rimShade,
        } as ViewStyle,
        style,
      ]}
      {...rest}>
      {icon ? <IconSymbol name={icon} size={14} color={fg} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[type.label, { fontSize: 13, color: fg }]}>
        {label}
      </Text>
      {count != null ? (
        <Text maxFontSizeMultiplier={1.4} style={[type.caption, type.numeric, { color: sub }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}
