/**
 * components/ds/splitStyle.ts — розщеплення стилю скляної поверхні:
 * компонування й тінь — на зовнішній шар, решта — на внутрішній (обрізаний).
 * Окремим модулем без залежностей: його беруть і Glass (useDS → theme-context),
 * і OverlaySurface, яку рендерять тести без моків сховища.
 */
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

const OUTER_KEYS = new Set([
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'marginStart', 'marginEnd', 'position', 'top', 'bottom', 'left', 'right', 'start', 'end', 'zIndex',
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'height', 'minWidth', 'maxWidth',
  'minHeight', 'maxHeight', 'aspectRatio', 'transform', 'opacity', 'display',
  // Тінь — на зовнішньому шарі: внутрішній обрізає (overflow hidden) і з'їв би її.
  'shadowColor', 'shadowOpacity', 'shadowRadius', 'shadowOffset', 'elevation',
]);

export function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const k of Object.keys(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = flat[k];
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

