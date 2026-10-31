/**
 * components/ds/MeshBackground.tsx — кольоровий «mesh»-canvas DS v2.1.
 *
 * М'які великі розмиті радіальні плями (світла: лаванда / лайм / бурштин /
 * синій / корал; темна: фіолет / синій / корал / лайм / бурштин, приглушені)
 * на основі glass.mesh.base. Скло (<GlassSurface>) без них не має чого
 * заломлювати — тому mesh стоїть під КОЖНИМ екраном.
 *
 * Статичний SVG (react-native-svg, радіальні градієнти) — один шар, без
 * анімацій і без блюру: дешевий навіть під довгими списками.
 *
 * @example
 *   <View style={{ flex: 1 }}>
 *     <MeshBackground />          // замість <View absoluteFill bg={c.bg1}/>
 *     …вміст екрана…
 *   </View>
 */
import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useDS } from '@/hooks/use-ds';

export type MeshBackgroundProps = {
  /** Множник непрозорості плям (0…1.5). «Зменшити прозорість» → 0.6 автоматично. */
  intensity?: number;
  /** За замовчуванням — absoluteFill позаду вмісту. */
  style?: StyleProp<ViewStyle>;
};

export function MeshBackground({ intensity = 1, style }: MeshBackgroundProps) {
  const { g, reduceTransparency } = useDS();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const k = intensity * (reduceTransparency ? 0.6 : 1);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: g.mesh.base }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          {g.mesh.blobs.map((b, i) => (
            <RadialGradient
              key={i}
              id={`mesh${uid}${i}`}
              cx={`${b.cx * 100}%`}
              cy={`${b.cy * 100}%`}
              rx={`${b.rx * 100}%`}
              ry={`${b.ry * 100}%`}
              fx={`${b.cx * 100}%`}
              fy={`${b.cy * 100}%`}
              gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={b.color} stopOpacity={Math.min(1, b.opacity * k)} />
              <Stop offset="0.55" stopColor={b.color} stopOpacity={Math.min(1, b.opacity * k * 0.45)} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {g.mesh.blobs.map((_, i) => (
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#mesh${uid}${i})`} />
        ))}
      </Svg>
    </View>
  );
}
