/**
 * components/time/dials/NumericDials.tsx — циферблати, що показують саме цифри.
 *
 * Три варіанти однієї ідеї, які відрізняються не інформацією, а характером:
 * звичайні табличні цифри, семисегментне табло секундоміра й вокзальні картки.
 * Розділяє їх ціна за шириною — і саме вона, а не смак, вирішує, який із них
 * переживе вузьку клітинку.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useClockTick } from '@/hooks/use-clock-tick';
import { formatClock } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import { TABULAR, pad, type DialProps } from './shared';

// ─── Цифри ────────────────────────────────────────────────────────────────────

export function DigitsDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  return (
    <Text
      style={[
        st.digits,
        TABULAR,
        { color: colors.text, fontSize: size * 0.3, lineHeight: size * 0.34 },
      ]}>
      {formatClock(elapsedSince(startedAt, now))}
    </Text>
  );
}

// ─── Семисегментний ───────────────────────────────────────────────────────────

/** Геометрія однієї цифри в клітинці 26×46. Ключі — канонічні a…g. */
const CELL_W = 26;
const CELL_H = 46;
const T = 4.6;
const SEGMENTS: Record<string, [number, number, number, number]> = {
  a: [5, 0, 16, T],
  g: [5, (CELL_H - T) / 2, 16, T],
  d: [5, CELL_H - T, 16, T],
  f: [0, 4, T, 16],
  b: [CELL_W - T, 4, T, 16],
  e: [0, CELL_H / 2, T, 16],
  c: [CELL_W - T, CELL_H / 2, T, 16],
};
const DIGIT_SEGMENTS = [
  'abcdef', 'bc', 'abged', 'abgcd', 'fgbc',
  'afgcd', 'afgedc', 'abc', 'abcdefg', 'abfgcd',
];
/** Погашений сегмент не зникає, а тьмяніє — інакше цифра щосекунди міняє вагу. */
const OFF_OPACITY = 0.09;

export function SegmentDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);

  // Місце під години тримаємо завжди: інакше о 59:59 табло стрибнуло б у
  // ширину на цілу пару розрядів.
  const h = Math.floor(seconds / 3600);
  const text = pad(h) + pad(Math.floor((seconds % 3600) / 60)) + pad(seconds % 60);

  const gapMinor = 4;
  const gapMajor = 10;
  const width = CELL_W * 6 + gapMinor * 3 + gapMajor * 2;
  const scale = Math.min(size / width, size / (CELL_H * 2.4));

  let x = 0;
  const digits: React.ReactNode[] = [];
  const dots: React.ReactNode[] = [];
  for (let i = 0; i < 6; i++) {
    const lit = DIGIT_SEGMENTS[Number(text[i])];
    const offset = x;
    for (const key of Object.keys(SEGMENTS)) {
      const [sx, sy, sw, sh] = SEGMENTS[key];
      digits.push(
        <Rect
          key={`${i}${key}`}
          x={offset + sx}
          y={sy}
          width={sw}
          height={sh}
          rx={T / 2}
          fill={colors.accent}
          opacity={lit.includes(key) ? 1 : OFF_OPACITY}
        />,
      );
    }
    x += CELL_W + gapMinor;
    if (i === 1 || i === 3) {
      for (const cy of [CELL_H * 0.34, CELL_H * 0.68]) {
        dots.push(
          <Rect key={`d${i}${cy}`} x={x - 1} y={cy} width={3.2} height={3.2} rx={1.6} fill={colors.sub} />,
        );
      }
      x += gapMajor - gapMinor;
    }
  }

  return (
    <Svg width={width * scale} height={CELL_H * scale} viewBox={`0 0 ${width} ${CELL_H}`}>
      {digits}
      {dots}
    </Svg>
  );
}

// ─── Табло ────────────────────────────────────────────────────────────────────

export function FlipDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const h = Math.floor(seconds / 3600);

  // Години зʼявляються лише коли вони є: третя пара карток забирає стільки
  // ширини, що в тісній клітинці витісняє решту.
  const parts = h > 0
    ? [String(h), pad(Math.floor((seconds % 3600) / 60)), pad(seconds % 60)]
    : [pad(Math.floor(seconds / 60)), pad(seconds % 60)];

  const cardW = Math.min(size * 0.22, 64);
  const fontSize = cardW * 0.86;

  return (
    <View style={st.flipRow}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Text style={{ color: colors.sub, fontSize: fontSize * 0.42, marginHorizontal: 2 }}>:</Text>
          )}
          <View
            style={[
              st.flipCard,
              { width: cardW, borderColor: colors.border, backgroundColor: colors.border },
            ]}>
            <Text
              style={[
                st.flipText,
                TABULAR,
                { color: colors.text, fontSize, lineHeight: fontSize * 1.06 },
              ]}>
              {part}
            </Text>
            {/* Поперечний шов — те, що робить картку табло, а не цифрою в рамці. */}
            <View style={[st.seam, { backgroundColor: colors.border }]} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  digits:   { fontWeight: '800', letterSpacing: -1 },
  flipRow:  { flexDirection: 'row', alignItems: 'center' },
  flipCard: {
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  flipText: { fontWeight: '800', textAlign: 'center' },
  seam:     { position: 'absolute', left: 0, right: 0, top: '50%', height: StyleSheet.hairlineWidth },
});
