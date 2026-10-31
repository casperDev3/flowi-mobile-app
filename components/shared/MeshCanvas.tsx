/**
 * components/shared/MeshCanvas.tsx — той самий кольоровий mesh-canvas DS v2.1,
 * що <MeshBackground/> з components/ds, але схема — пропом `isDark`, без
 * useDS()/theme-context. Для компонентів, які тести монтують без моків
 * AsyncStorage (IntegrationsScreen, оболонки проєкту тощо).
 */
import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReduceTransparency } from '@/hooks/use-reduce-transparency';

import { dsGlass } from './dsTheme';

export function MeshCanvas({ isDark, intensity = 1, style }: { isDark: boolean; intensity?: number; style?: StyleProp<ViewStyle> }) {
  const g = dsGlass(isDark);
  const rt = useReduceTransparency();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const k = intensity * (rt ? 0.6 : 1);
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
              id={`meshc${uid}${i}`}
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
          <Rect key={i} x="0" y="0" width="100%" height="100%" fill={`url(#meshc${uid}${i})`} />
        ))}
      </Svg>
    </View>
  );
}
