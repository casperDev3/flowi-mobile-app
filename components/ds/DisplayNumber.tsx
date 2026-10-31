/**
 * components/ds/DisplayNumber.tsx — головний візуальний акцент DS v2:
 * велике тонке число (Manrope 300, tabular-nums, tracking −2%) і дрібніша,
 * світліша одиниця (k, s, /5, ₴, %).
 *
 * @example
 *   <DisplayNumber value="12 480" unit="₴" caption="Баланс" />
 *   <DisplayNumber value="15:25" unit=":34" size="lg" />
 */
import React from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { fontFamily, space, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

const SIZES = { sm: 40, md: 48, lg: 56 } as const;

export type DisplayNumberProps = {
  value: string | number;
  unit?: string;
  /** Валюта/знак перед числом ($12k) — тоді 'before'. */
  unitPosition?: 'after' | 'before';
  size?: keyof typeof SIZES;
  /** Підпис під числом (text.secondary). */
  caption?: string;
  /** Колір числа (за замовчуванням text.primary). */
  color?: string;
  /** Повний текст для скрінрідера («12 480 гривень»). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  valueStyle?: StyleProp<TextStyle>;
  /** Стеля Dynamic Type — великі цифри й так великі. */
  maxFontSizeMultiplier?: number;
  /** Зменшувати шрифт, щоб влізти в рядок. */
  adjustsFontSizeToFit?: boolean;
};

export function DisplayNumber({
  value, unit, unitPosition = 'after', size = 'md', caption, color,
  accessibilityLabel, testID, style, valueStyle, maxFontSizeMultiplier = 1.2, adjustsFontSizeToFit,
}: DisplayNumberProps) {
  const { t } = useDS();
  const fs = SIZES[size];
  const unitSize = Math.round(fs * 0.45);
  const unitNode = unit ? (
    <Text style={{ fontFamily: fontFamily.regular, fontSize: unitSize, letterSpacing: 0, color: t.text.secondary }}>
      {unitPosition === 'before' ? unit : ` ${unit}`.replace(/^ (?=[/:%])/, '')}
    </Text>
  ) : null;
  const label = accessibilityLabel ?? `${unitPosition === 'before' && unit ? unit : ''}${value}${unitPosition === 'after' && unit ? ` ${unit}` : ''}`;
  return (
    <View style={style} accessible accessibilityLabel={caption ? `${caption}: ${label}` : label} testID={testID}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[
          type.display,
          { fontSize: fs, lineHeight: Math.round(fs * 1.05), letterSpacing: -fs * 0.02, color: color ?? t.text.primary },
          valueStyle,
        ]}>
        {unitPosition === 'before' ? unitNode : null}
        {String(value)}
        {unitPosition === 'after' ? unitNode : null}
      </Text>
      {caption ? (
        <Text maxFontSizeMultiplier={1.4} style={[type.caption, { color: t.text.secondary, marginTop: space[1] }]}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
