/**
 * components/ds/GlassScreen.tsx — корінь екрана DS v2.1:
 * кольоровий mesh-canvas + акцент модуля для всіх примітивів усередині.
 *
 * @example
 *   return (
 *     <GlassScreen module="finance">
 *       <ScreenHeader … />
 *       <ScrollView>…<Card tint>…</Card></ScrollView>
 *     </GlassScreen>
 *   );
 */
import React from 'react';
import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { AccentProvider } from '@/components/ds/AccentContext';
import { MeshBackground } from '@/components/ds/MeshBackground';
import type { GlassAccent, ModuleKey } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

export type GlassScreenProps = ViewProps & {
  /** Модуль → акцент (glass.moduleAccent). */
  module?: ModuleKey;
  /** Явний акцент замість модульного. */
  accent?: GlassAccent;
  /** Без mesh (вкладений екран, що вже стоїть на mesh батька). */
  mesh?: boolean;
  meshIntensity?: number;
  style?: StyleProp<ViewStyle>;
};

export function GlassScreen({ module, accent, mesh = true, meshIntensity, style, children, ...rest }: GlassScreenProps) {
  const { g } = useDS();
  return (
    <AccentProvider module={module} accent={accent}>
      <View style={[{ flex: 1, backgroundColor: mesh ? g.mesh.base : 'transparent' }, style]} {...rest}>
        {mesh ? <MeshBackground intensity={meshIntensity} /> : null}
        {children}
      </View>
    </AccentProvider>
  );
}
