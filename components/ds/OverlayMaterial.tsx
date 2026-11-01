/**
 * components/ds/OverlayMaterial.tsx — лише «матеріал» брудного скла
 * (Layout System v2.4): блюр systemThickMaterial + заливка overlay.fill +
 * зерно, абсолютним шаром.
 *
 * Для наявних оверлеїв, що самі малюють рамку/обідок (`glassOf(t).sheet` =
 * overlay.fill): перший дочірній елемент контейнера.
 *   <View style={[box, { backgroundColor: glassOf(t).sheet, overflow: 'hidden' }]}>
 *     <OverlayMaterial isDark={isDark} />…
 * Контейнер з тінню (без overflow:hidden) — передайте `radius`.
 * «Зменшити прозорість» → нічого (заливка контейнера вже суцільна).
 *
 * Окремий модуль без теми зі сховища (isDark — пропом, як у dsTheme.ts):
 * його імпортують легкі компоненти (PickerField, TaskDetailHeader…), які
 * тести рендерять без моків theme-context/AsyncStorage.
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Image, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import { overlayTokens } from '@/constants/theme';
import { useReduceTransparency } from '@/hooks/use-reduce-transparency';

export const OVERLAY_NOISE = require('@/assets/images/overlay-noise.png');

/**
 * Де оверлей малює справжній блюр: iOS (BlurView) і веб (expo-blur там =
 * CSS backdrop-filter). Android без блюру — суцільна fillNoBlur, щоб крізь
 * аркуш не просвічував навіть «привид» тексту.
 */
export const OVERLAY_BLUR = Platform.OS === 'ios' || Platform.OS === 'web';

export function OverlayMaterial({ isDark, noise = true, radius }: {
  isDark: boolean;
  noise?: boolean;
  /** Радіус шару (коли контейнер не обрізає вміст — напр. через тінь). */
  radius?: number | Pick<ViewStyle, 'borderTopLeftRadius' | 'borderTopRightRadius' | 'borderBottomLeftRadius' | 'borderBottomRightRadius'>;
}) {
  const rt = useReduceTransparency();
  if (rt) return null;
  const o = overlayTokens(isDark);
  const corners: ViewStyle | null = radius == null ? null
    : typeof radius === 'number' ? { borderRadius: radius, overflow: 'hidden' } : { ...radius, overflow: 'hidden' };
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, corners]}>
      {OVERLAY_BLUR ? (
        <BlurView intensity={o.blurIntensity} tint={o.blurTint} style={StyleSheet.absoluteFill} />
      ) : null}
      {/* Заливка поверх блюру: BlurView малюється над фоном контейнера. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY_BLUR ? o.fill : o.fillNoBlur }]} />
      {noise ? (
        <View style={[StyleSheet.absoluteFill, { opacity: o.noiseOpacity }]}>
          <Image source={OVERLAY_NOISE} resizeMode="repeat" accessible={false} style={st.noise} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  noise: { width: '100%', height: '100%' },
});
