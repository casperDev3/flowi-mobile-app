/**
 * components/ds/IconChip.tsx — тонований скляний кружок з іконкою акценту.
 *
 * Тло — glass.accent[x].tint поверх скла subtle (без блюру: icon-chip живе в
 * рядках і картках), іконка — accent.ink (≥ 4.5:1 на склі в обох темах).
 * Акцент: проп → акцент модуля (<GlassScreen module>) → lavender.
 *
 * @example <IconChip icon="banknote" />  <IconChip icon="heart.fill" accent="coral" size="lg" />
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useResolvedAccent } from '@/components/ds/AccentContext';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

const SIZES = { sm: { box: 32, icon: 16 }, md: { box: 40, icon: 20 }, lg: { box: 52, icon: 26 } } as const;

export type IconChipProps = {
  icon: IconSymbolName;
  accent?: GlassAccent;
  size?: keyof typeof SIZES;
  /** Суцільна заливка акценту (solid + onSolid) замість тонованого скла. */
  solid?: boolean;
  /** Для скрінрідера; без нього — декоративна (прихована). */
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
};

export function IconChip({ icon, accent, size = 'md', solid, accessibilityLabel, testID, style }: IconChipProps) {
  const { g, reduceTransparency } = useDS();
  const a = g.accent[useResolvedAccent(accent)];
  const s = SIZES[size];
  return (
    <View
      testID={testID}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no-hide-descendants'}
      style={[
        {
          width: s.box,
          height: s.box,
          borderRadius: s.box / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: solid ? a.solid : reduceTransparency ? g.solid.subtle : g.surfaceSubtle,
          borderWidth: solid ? 0 : 1,
          borderColor: g.rim,
          borderBottomColor: g.rimShade,
          overflow: 'hidden',
        },
        style,
      ]}>
      {!solid ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: a.tint }} /> : null}
      <IconSymbol name={icon} size={s.icon} color={solid ? a.onSolid : a.ink} />
    </View>
  );
}
