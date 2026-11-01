/**
 * components/ds/Signature.tsx — фірмовий градієнт Omni (DS v2.2).
 *
 * `t.gradient.signature` (світла #7F0BE8 → #F4AA2D, темна #9B3BFF → #F7B84A)
 * — ЛИШЕ для підсвітки даних: активний стовпець, сегментний прогрес, повзунок
 * таймлайну, AI-сфера. Не фон карток і не текст (контраст тексту на ньому
 * не гарантований).
 */
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import type { DSTheme } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Колір фірмового градієнта в точці `p` (0..1) — для дискретних елементів
 * (сегменти прогресу), де LinearGradient на кожен шматок був би дорогим.
 */
export function signatureAt(t: DSTheme, p: number): string {
  const [a, b] = t.gradient.signature;
  const k = Math.max(0, Math.min(1, p));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
  return `#${mix.map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export type SignatureGradientProps = {
  /** vertical — згори фіолет (стовпці); horizontal — зліва фіолет (прогрес, таймлайн). */
  direction?: 'vertical' | 'horizontal';
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

export function SignatureGradient({ direction = 'horizontal', style, children }: SignatureGradientProps) {
  const { t } = useDS();
  return (
    <LinearGradient
      colors={t.gradient.signature}
      start={{ x: 0, y: 0 }}
      end={direction === 'vertical' ? { x: 0, y: 1 } : { x: 1, y: 0 }}
      style={style}>
      {children}
    </LinearGradient>
  );
}
