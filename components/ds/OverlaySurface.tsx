/**
 * components/ds/OverlaySurface.tsx — «брудне скло» оверлеїв (Layout System v2.4).
 *
 * Усе, що з'являється ПОВЕРХ вмісту (аркуші, модалки, меню, поповери, тости,
 * шухляда сайдбара, панель масових дій), малюється цим шаром, а не
 * функціональним Liquid Glass: оверлей має сховати те, що під ним, — під ним
 * видно лише розмиту пляму кольору, а не текст.
 *
 *   iOS / веб        BlurView systemThickMaterial (intensity ≈90; на вебі —
 *                    CSS backdrop-filter) + заливка overlay.fill (0.90 / 0.92)
 *                    + зерно ≈3.5% + обідок + тінь
 *   Android          непрозора overlay.fillNoBlur + зерно + обідок
 *   «Зменшити прозорість» → суцільна overlay.solid + hairline, без зерна
 *
 * Нативне Liquid Glass (iOS 26 GlassView) тут НЕ використовується навмисно:
 * regular-скло прозоре за задумом, а оверлей просвічувати не повинен.
 *
 * Тема — через useDSTheme (useColorScheme), а не useDS: компонент рендерять
 * тести з моком схеми без theme-context/AsyncStorage.
 *
 *   <OverlaySurface radius={radius.card} style={{ padding: 20 }}>…</OverlaySurface>
 *   <OverlayScrim onPress={close} />          // затемнення + легкий блюр фону
 *   overlayFillStyle(isDark, rt)              // лише заливка+обідок (без блюру)
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Image, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { splitStyle } from '@/components/ds/splitStyle';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { overlayTokens, radius as R, shadow as SH, theme } from '@/constants/theme';

import { OVERLAY_BLUR, OVERLAY_NOISE as NOISE } from '@/components/ds/OverlayMaterial';

/** Заливка + обідок «брудного скла» без блюру (для місць, де не можна обгорнути). */
export function overlayFillStyle(isDark: boolean, reduceTransparency = false): ViewStyle {
  const o = overlayTokens(isDark);
  if (reduceTransparency) {
    return { backgroundColor: o.solid, borderWidth: 1, borderColor: theme[isDark ? 'dark' : 'light'].border.hairline };
  }
  return {
    backgroundColor: Platform.OS === 'ios' ? o.fill : o.fillNoBlur,
    borderWidth: 1,
    borderColor: o.rim,
    borderTopColor: o.rim,
    borderBottomColor: o.rimShade,
  };
}

export type OverlaySurfaceProps = ViewProps & {
  /** Радіус (за замовч. radius.card). Для аркуша — передайте лише верхні кути через style. */
  radius?: number;
  /** Зерно ≈3–4% (за замовч. так). */
  noise?: boolean;
  /** Тінь поповера (за замовч. так). */
  shadow?: boolean;
  /** Спекулярний обідок (за замовч. так). */
  rim?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function OverlaySurface({
  radius, noise = true, shadow = true, rim = true, style, children, ...rest
}: OverlaySurfaceProps) {
  const { isDark, rt } = useDSTheme();
  const o = overlayTokens(isDark);
  const r = radius ?? R.card;
  const { outer, inner } = splitStyle(style);
  // Кути з style (borderTopLeftRadius…) мають пріоритет над radius — аркуш
  // знизу заокруглює лише верх.
  const corners: ViewStyle = { borderRadius: r };
  for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const) {
    if (inner[k] != null) corners[k] = inner[k];
  }
  const shadowStyle = shadow ? SH[isDark ? 'dark' : 'light'].popover : null;

  if (rt) {
    return (
      <View
        style={[corners, shadowStyle, { backgroundColor: o.solid, borderWidth: rim ? 1 : 0, borderColor: theme[isDark ? 'dark' : 'light'].border.hairline }, outer, inner]}
        {...rest}>
        {children}
      </View>
    );
  }

  const blur = OVERLAY_BLUR;
  return (
    <View style={[corners, shadowStyle, outer]}>
      {/* flexShrink: зовнішній шар із фіксованою висотою/maxHeight (аркуш на 60%)
          стискає вміст, а не випихає футер за край екрана. */}
      <View style={[corners, { overflow: 'hidden', flexGrow: 1, flexShrink: 1 }, inner]} {...rest}>
        {blur ? (
          <BlurView pointerEvents="none" intensity={o.blurIntensity} tint={o.blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: blur ? o.fill : o.fillNoBlur }]} />
        {noise ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: o.noiseOpacity }]}>
            <Image source={NOISE} resizeMode="repeat" accessible={false} style={st.noise} />
          </View>
        ) : null}
        {rim ? (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, corners, { borderWidth: 1, borderColor: o.rim, borderTopColor: o.rim, borderBottomColor: o.rimShade }]}
          />
        ) : null}
        {children}
      </View>
    </View>
  );
}

export { OverlayMaterial } from '@/components/ds/OverlayMaterial';

/**
 * Затемнення під модальним оверлеєм (аркуш, шухляда, діалог) + легкий блюр
 * фону на iOS: навіть крізь 8–10% прозорості оверлею під ним не читається
 * текст. Тап — `onPress` (закрити); без onPress шар лише візуальний.
 * «Зменшити прозорість» → лише суцільне затемнення.
 */
export function OverlayScrim({
  onPress, accessibilityLabel, style, blur = true,
}: {
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  blur?: boolean;
}) {
  const { isDark, rt } = useDSTheme();
  const o = overlayTokens(isDark);
  const layers = (
    <>
      {blur && !rt && OVERLAY_BLUR ? (
        <BlurView pointerEvents="none" intensity={o.scrimBlurIntensity} tint={isDark ? 'dark' : 'default'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: o.scrim }]} />
    </>
  );
  if (!onPress) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>{layers}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[StyleSheet.absoluteFill, style]}>
      {layers}
    </Pressable>
  );
}

const st = StyleSheet.create({
  noise: { width: '100%', height: '100%' },
});
