import React, { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { encodeQr, qrSvgPath } from '@/utils/containersQr';

/** QR на екрані — той самий генератор, що й на наліпці (без мережі). */
export function QrCodeSvg({ value, size = 180, label }: { value: string; size?: number; label: string }) {
  const { side, d } = useMemo(() => {
    const qr = encodeQr(value);
    const border = 2;
    return { side: qr.size + border * 2, d: qrSvgPath(qr, border) };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${side} ${side}`} accessibilityRole="image" accessibilityLabel={label}>
      {/* Білий фон і в темній темі: камера читає темне на світлому. */}
      <Rect width={side} height={side} fill="#fff" />
      <Path d={d} fill="#000" />
    </Svg>
  );
}
