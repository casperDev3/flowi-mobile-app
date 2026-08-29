/**
 * components/time/dials/FiguralDials.tsx — циферблати, які не є ні цифрами,
 * ні колом.
 *
 * Спільне в них те, що жоден не показує час сам по собі: пісок, крапки й
 * стрічка передають рух і масштаб, але не число. Тому число під ними —
 * обовʼязкова частина, а не підпис.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';

import { useClockTick } from '@/hooks/use-clock-tick';
import { formatClock } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import { TABULAR, cycles, type DialProps } from './shared';

/** Підпис часу під фігурою — однаковий у всіх трьох. */
function Readout({ seconds, size, color }: { seconds: number; size: number; color: string }) {
  return (
    <Text style={[TABULAR, { color, fontSize: size * 0.11, fontWeight: '700', marginTop: 6 }]}>
      {formatClock(seconds)}
    </Text>
  );
}

// ─── Пісочний годинник ────────────────────────────────────────────────────────

export function HourglassDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const poured = cycles(seconds).second;   // скільки пересипано за цю хвилину
  const left = 1 - poured;

  const glass = size * 0.72;

  // Верхня купка сидить біля перемички, її поверхня опускається до y=50.
  const topSand = `50,50 ${50 - 30 * left},${50 - 40 * left} ${50 + 30 * left},${50 - 40 * left}`;
  // Нижня росте від дна вгору.
  const botSand =
    `20,90 80,90 ${50 + 30 * (1 - poured)},${90 - 40 * poured} ${50 - 30 * (1 - poured)},${90 - 40 * poured}`;

  return (
    <View style={st.stack}>
      <Svg width={glass} height={glass * 0.94} viewBox="0 0 100 100">
        {/* Пісок під контуром: контур мусить лишатися чіткою межею. */}
        <Polygon points={topSand} fill={colors.accent} opacity={0.85} />
        <Polygon points={botSand} fill={colors.accent} opacity={0.85} />
        <Line x1={50} y1={50} x2={50} y2={88} stroke={colors.accent} strokeWidth={1.4} opacity={0.5} />
        <Polygon
          points="20,10 80,10 50,50 80,90 20,90 50,50"
          fill="none" stroke={colors.sub} strokeWidth={2.4} strokeLinejoin="round"
        />
      </Svg>
      <Readout seconds={seconds} size={size} color={colors.text} />
    </View>
  );
}

// ─── Сітка секунд ─────────────────────────────────────────────────────────────

const GRID_COLUMNS = 10;
const GRID_TOTAL = 60;
/** Понад цю кількість риски хвилин замінюються числом — інакше ряд повзе. */
const MAX_PIPS = 30;

export function DotsDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const inMinute = seconds % 60;
  const minutes = Math.floor(seconds / 60);

  const gap = Math.max(3, size * 0.022);
  const dot = Math.max(5, (size * 0.8 - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  const gridWidth = dot * GRID_COLUMNS + gap * (GRID_COLUMNS - 1);

  return (
    <View style={st.stack}>
      <View style={{ width: gridWidth, minHeight: dot, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
        {minutes <= MAX_PIPS
          ? Array.from({ length: minutes }, (_, i) => (
              <View key={i} style={{ width: 3, height: dot * 0.8, borderRadius: 1, backgroundColor: colors.accent }} />
            ))
          : (
            <Text style={{ color: colors.sub, fontSize: size * 0.07, fontWeight: '700', letterSpacing: 0.6 }}>
              {minutes} хв
            </Text>
          )}
      </View>

      <View style={{ width: gridWidth, flexDirection: 'row', flexWrap: 'wrap', gap, marginTop: 6 }}>
        {Array.from({ length: GRID_TOTAL }, (_, i) => (
          <View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: i < inMinute ? colors.accent : colors.border,
            }}
          />
        ))}
      </View>

      <Readout seconds={seconds} size={size} color={colors.text} />
    </View>
  );
}

// ─── Лінійка ──────────────────────────────────────────────────────────────────

/** Пікселів на секунду в полотні стрічки. */
const PX_PER_SEC = 13;

export function TapeDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);

  const W = size;
  const H = Math.max(38, size * 0.34);
  const span = Math.ceil(W / PX_PER_SEC) + 4;
  const base = seconds - Math.floor(span / 2);

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < span; i++) {
    const sec = base + i;
    if (sec < 0) continue;
    const x = W / 2 + (sec - seconds) * PX_PER_SEC;
    if (x < -2 || x > W + 2) continue;
    const major = sec % 60 === 0;
    const mid = sec % 10 === 0;
    ticks.push(
      <Line
        key={sec}
        x1={x} y1={4} x2={x} y2={4 + (major ? H - 14 : mid ? 12 : 7)}
        stroke={colors.sub}
        strokeWidth={major ? 1.6 : 1.3}
        strokeLinecap="round"
        opacity={major ? 0.9 : mid ? 0.55 : 0.28}
      />,
    );
  }

  return (
    <View style={st.stack}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {ticks}
        {/* Мітка «зараз» нерухома — рухається шкала, як у тюнера. Саме тому
            в цього циферблата немає стелі: після девʼятої години нічого не
            змінюється, стрічка просто їде далі. */}
        <Line
          x1={W / 2} y1={2} x2={W / 2} y2={H - 6}
          stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round"
        />
      </Svg>
      <Readout seconds={seconds} size={size} color={colors.text} />
    </View>
  );
}

const st = StyleSheet.create({
  stack: { alignItems: 'center', justifyContent: 'center' },
});
