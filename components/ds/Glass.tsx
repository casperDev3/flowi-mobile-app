/**
 * components/ds/Glass.tsx — Liquid Glass DS v2.1.
 *
 * <GlassSurface> — напівпрозора поверхня над кольоровою сіткою
 * (<MeshBackground/>): блюр + заливка + спекулярний обідок (світліший верхній
 * край) + внутрішній відблиск + м'яка розсіяна тінь.
 *
 * Рендер за можливостями пристрою:
 *   1. «Зменшити прозорість» (iOS) / prefers-reduced-transparency (веб)
 *      → суцільна surface.card + hairline. Без блюру.
 *   2. iOS 26+ з нативним Liquid Glass (expo-glass-effect: isLiquidGlassAvailable
 *      && isGlassEffectAPIAvailable) → <GlassView> (справжнє заломлення).
 *   3. iOS < 26 → expo-blur <BlurView> (ultra-thin material) + заливка + обідок.
 *   4. Android / веб → напівпрозора заливка + обідок (BlurView на Android дорогий
 *      і без experimentalBlurMethod — просто тонований прямокутник). blur
 *      можна примусити пропом `blur`.
 *   variant="subtle" НІКОЛИ не блюрить: це вкладене скло (рядки списків у
 *   картці, інпути) — десятки BlurView у списку вбивають FPS.
 *
 * Модуль expo-glass-effect вантажиться умовно: у збірці без нього (старий
 * dev-client) скло тихо падає на шлях 3.
 */
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useResolvedAccent } from '@/components/ds/AccentContext';
import { radius as R, type GlassAccent } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

// ─── Нативне Liquid Glass (iOS 26+) ──────────────────────────────────────────

type GlassViewComponent = React.ComponentType<ViewProps & {
  glassEffectStyle?: 'clear' | 'regular' | 'none';
  tintColor?: string;
  isInteractive?: boolean;
  colorScheme?: 'auto' | 'light' | 'dark';
}>;

let NativeGlassView: GlassViewComponent | null = null;
let liquidGlass = false;
if (Platform.OS === 'ios') {
  try {
    // Спершу — чи є нативний модуль у ЦІЙ збірці: без нього сам імпорт
    // expo-glass-effect сипле попередженнями requireNativeViewManager.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const native = require('expo-modules-core').requireOptionalNativeModule('ExpoGlassEffect');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = native ? require('expo-glass-effect') : null;
    if (!mod) throw new Error('ExpoGlassEffect native module is not in this build');
    liquidGlass = !!mod.isLiquidGlassAvailable?.() && !!mod.isGlassEffectAPIAvailable?.();
    if (liquidGlass) NativeGlassView = mod.GlassView as GlassViewComponent;
  } catch {
    liquidGlass = false;
  }
}

/** Чи малюється справжнє нативне Liquid Glass (iOS 26+). */
export function isNativeLiquidGlass(): boolean {
  return liquidGlass && NativeGlassView != null;
}

/**
 * Лише «матеріал» скла без заливки/обідка — для власних панелей (таб-бар,
 * шапка, сайдбар), що самі малюють fill і rim: iOS 26+ — нативне Liquid
 * Glass, iOS < 26 — BlurView, Android/веб — нічого (тільки заливка власника).
 * Абсолютний шар; при reduceTransparency не малюється.
 */
export function GlassBackdrop({ intensityBoost = 0, style }: { intensityBoost?: number; style?: StyleProp<ViewStyle> }) {
  const { g, scheme, reduceTransparency } = useDS();
  if (reduceTransparency || Platform.OS !== 'ios') return null;
  if (NativeGlassView) {
    const Native = NativeGlassView;
    return <Native pointerEvents="none" glassEffectStyle="regular" colorScheme={scheme} style={[StyleSheet.absoluteFill, style]} />;
  }
  return <BlurView pointerEvents="none" intensity={g.blurIntensity + intensityBoost} tint={g.blurTint} style={[StyleSheet.absoluteFill, style]} />;
}

// ─── Розщеплення стилю: компонування — зовні, вміст — усередині ─────────────

const OUTER_KEYS = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'marginStart', 'marginEnd', 'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'height', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'aspectRatio', 'transform', 'opacity', 'display',
  // Тінь — на зовнішньому шарі: внутрішній обрізає (overflow hidden) і з'їв би її.
  'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation',
]);

function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = flat[k];
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

// ─── GlassSurface ────────────────────────────────────────────────────────────

export type GlassVariant = 'card' | 'strong' | 'subtle' | 'pill';

export type GlassSurfaceProps = ViewProps & {
  /**
   * card   — основне скло (картки, сайдбар).
   * strong — щільніше (модалки, поповери, шапки, таб-бар; під щільний текст).
   * subtle — вкладене, без блюру й тіні (рядки списку в картці, інпути).
   * pill   — як card, радіус 999 (плаваючі панелі, сегменти).
   */
  variant?: GlassVariant;
  radius?: number;
  /**
   * Акцентна «змивка» (glass.accent[x].tint) — KPI-картки, icon-chip.
   * true — акцент модуля з контексту (<GlassScreen module>), рядок — явний.
   */
  tint?: boolean | GlassAccent;
  /** М'яке світіння акцентом (активний пункт, головна KPI). */
  glow?: boolean | GlassAccent;
  /** Примусово блюрити/не блюрити (за замовчуванням: card/strong/pill на iOS — так). */
  blur?: boolean;
  /** Тінь (за замовчуванням: усе, крім subtle). */
  shadow?: boolean;
  /** Нативне скло реагує на дотик (iOS 26, для кнопок/плаваючих панелей). */
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function GlassSurface({
  variant = 'card',
  radius,
  tint,
  glow,
  blur,
  shadow,
  interactive,
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const { t, g, isDark, scheme, reduceTransparency } = useDS();
  const ctxAccent = useResolvedAccent(typeof tint === 'string' ? tint : typeof glow === 'string' ? glow : null);
  const tintAccent: GlassAccent | null = tint ? (typeof tint === 'string' ? tint : ctxAccent) : null;
  const glowAccent: GlassAccent | null = glow ? (typeof glow === 'string' ? glow : ctxAccent) : null;

  const subtle = variant === 'subtle';
  const r = radius ?? (variant === 'pill' ? R.pill : subtle ? R.nested : R.card);
  const wantBlur = !reduceTransparency && !subtle && (blur ?? Platform.OS === 'ios');
  const wantShadow = shadow ?? !subtle;
  const { outer, inner } = splitStyle(style);

  const shadowStyle: ViewStyle | null = !wantShadow
    ? null
    : glowAccent && Platform.OS !== 'android'
      ? { shadowColor: g.accent[glowAccent].glow, shadowOpacity: isDark ? 0.55 : 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }
      : g.shadow;

  // 1. Зменшена прозорість — суцільна поверхня.
  if (reduceTransparency) {
    return (
      <View
        style={[
          {
            borderRadius: r,
            backgroundColor: subtle ? g.solid.subtle : variant === 'strong' ? g.solid.strong : g.solid.card,
            borderWidth: subtle ? 0 : 1,
            borderColor: t.border.hairline,
          },
          outer,
          inner,
        ]}
        {...rest}>
        {tintAccent ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: g.accent[tintAccent].tint }]} />
        ) : null}
        {children}
      </View>
    );
  }

  const fill = variant === 'strong' ? g.surfaceStrong : subtle ? g.surfaceSubtle : g.surface;
  const rimStyle: ViewStyle = {
    borderRadius: r,
    borderWidth: 1,
    borderColor: subtle ? g.rimShade : g.rim,
    borderTopColor: g.rim,
    borderBottomColor: g.rimShade,
  };

  // 2. Нативне Liquid Glass (iOS 26+).
  if (wantBlur && NativeGlassView) {
    const Native = NativeGlassView;
    return (
      <View style={[{ borderRadius: r }, shadowStyle, outer]}>
        <Native
          glassEffectStyle="regular"
          colorScheme={scheme}
          isInteractive={interactive}
          tintColor={tintAccent ? g.accent[tintAccent].tint : undefined}
          style={[{ borderRadius: r, overflow: 'hidden', flexGrow: 1 }, inner]}
          {...rest}>
          {/* strong — щільніший шар під текст: нативне regular-скло прозоріше за 0.72 */}
          {variant === 'strong' ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(32,32,38,0.35)' : 'rgba(255,255,255,0.35)' }]} />
          ) : null}
          {children}
        </Native>
      </View>
    );
  }

  // 3/4. Блюр (iOS < 26) або напівпрозора заливка (Android/веб).
  return (
    <View style={[{ borderRadius: r }, shadowStyle, outer]}>
      <View style={[{ borderRadius: r, overflow: 'hidden', flexGrow: 1 }, inner]} {...rest}>
        {wantBlur ? (
          <BlurView pointerEvents="none" intensity={g.blurIntensity} tint={g.blurTint} style={StyleSheet.absoluteFill} />
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
        {tintAccent ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: g.accent[tintAccent].tint }]} />
        ) : null}
        {/* Внутрішній верхній відблиск: світло падає згори. */}
        {!subtle ? (
          <LinearGradient
            pointerEvents="none"
            colors={[g.highlight, 'rgba(255,255,255,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '45%', opacity: isDark ? 0.5 : 0.35 }}
          />
        ) : null}
        {/* Спекулярний обідок — окремим шаром поверх, щоб не з'їдав padding. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, rimStyle]} />
        {children}
      </View>
    </View>
  );
}
