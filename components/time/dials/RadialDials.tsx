/**
 * components/time/dials/RadialDials.tsx — циферблати, побудовані на колі.
 *
 * Спільне в них не форма, а спосіб читання: положення на колі видно боковим
 * зором, не читаючи цифр. Тому в кожного все одно є число — коло каже «майже
 * хвилина», але не каже «сорок три».
 *
 * Обертання зроблено через <G rotation origin>, а не через рядковий transform:
 * react-native-svg підтримує обидва, але числові пропси не треба щосекунди
 * складати в рядок.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { useClockTick } from '@/hooks/use-clock-tick';
import { formatClock } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import { TABULAR, cycles, pad, type DialProps } from './shared';

/** Полотно всіх радіальних — 100×100, щоб геометрію можна було читати як відсотки. */
const BOX = 100;
const circumference = (r: number) => 2 * Math.PI * r;

/** Число в центрі кола. Живе як RN-Text поверх SVG, а не як SvgText: так воно
 *  успадковує шрифт застосунку й табличні цифри. */
function CenterLabel({ text, size, color, weight = '700' }: {
  text: string; size: number; color: string; weight?: '600' | '700';
}) {
  return (
    <View style={st.center} pointerEvents="none">
      <Text style={[TABULAR, { color, fontSize: size, fontWeight: weight }]}>{text}</Text>
    </View>
  );
}

// ─── Кільця ───────────────────────────────────────────────────────────────────

const RINGS = [
  { r: 45, w: 7, key: 'second' as const, opacity: 1 },
  { r: 34, w: 6, key: 'minute' as const, opacity: 0.62 },
  { r: 24, w: 5, key: 'hour'   as const, opacity: 0.34 },
];

export function RingsDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const frac = cycles(seconds);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <G rotation={-90} origin={`${BOX / 2}, ${BOX / 2}`}>
          {RINGS.map(ring => {
            const c = circumference(ring.r);
            return (
              <React.Fragment key={ring.key}>
                <Circle
                  cx={BOX / 2} cy={BOX / 2} r={ring.r} fill="none"
                  stroke={colors.border} strokeWidth={ring.w}
                />
                <Circle
                  cx={BOX / 2} cy={BOX / 2} r={ring.r} fill="none"
                  stroke={colors.accent} strokeWidth={ring.w} strokeLinecap="round"
                  strokeDasharray={`${c} ${c}`}
                  strokeDashoffset={c * (1 - frac[ring.key])}
                  opacity={ring.opacity}
                />
              </React.Fragment>
            );
          })}
        </G>
      </Svg>
      <CenterLabel text={formatClock(seconds)} size={size * 0.11} color={colors.text} />
    </View>
  );
}

// ─── Дуга ─────────────────────────────────────────────────────────────────────

export function ArcDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const h = Math.floor(seconds / 3600);
  const r = 43;
  const c = circumference(r);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <G rotation={-90} origin={`${BOX / 2}, ${BOX / 2}`}>
          <Circle cx={BOX / 2} cy={BOX / 2} r={r} fill="none" stroke={colors.border} strokeWidth={9} />
          <Circle
            cx={BOX / 2} cy={BOX / 2} r={r} fill="none"
            stroke={colors.accent} strokeWidth={9} strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - cycles(seconds).second)}
          />
        </G>
      </Svg>
      <View style={st.center} pointerEvents="none">
        <Text style={[TABULAR, { color: colors.text, fontSize: size * 0.17, fontWeight: '700' }]}>
          {pad(Math.floor((seconds % 3600) / 60))}:{pad(seconds % 60)}
        </Text>
        {h > 0 && (
          <Text style={{ color: colors.sub, fontSize: size * 0.075, letterSpacing: 0.8, marginTop: 2 }}>
            {h} год
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── Хронограф ────────────────────────────────────────────────────────────────

/** Позначки: довші кожні пʼять секунд — око чіпляється за них замість цифр. */
const TICKS = Array.from({ length: 60 }, (_, i) => {
  const major = i % 5 === 0;
  const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
  const inner = major ? 37 : 41;
  return {
    key: i,
    major,
    x1: 50 + Math.cos(a) * inner,
    y1: 50 + Math.sin(a) * inner,
    x2: 50 + Math.cos(a) * 44,
    y2: 50 + Math.sin(a) * 44,
  };
});

export function ChronoDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const frac = cycles(seconds);
  const h = Math.floor(seconds / 3600);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <Circle cx={50} cy={50} r={46} fill="none" stroke={colors.border} strokeWidth={1.5} />
        {TICKS.map(t => (
          <Line
            key={t.key}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? colors.sub : colors.border}
            strokeWidth={t.major ? 1.8 : 1}
            strokeLinecap="round"
          />
        ))}
        <G rotation={frac.minute * 360} origin="50, 50">
          <Line x1={50} y1={50} x2={50} y2={24} stroke={colors.text} strokeWidth={3.4} strokeLinecap="round" />
        </G>
        <G rotation={frac.second * 360} origin="50, 50">
          <Line x1={50} y1={56} x2={50} y2={12} stroke={colors.accent} strokeWidth={1.6} strokeLinecap="round" />
        </G>
        <Circle cx={50} cy={50} r={3} fill={colors.accent} />
      </Svg>
      {/* Лічильник годин знімає стелю: після години циферблат не ламається,
          а просто починає новий оберт. */}
      {h > 0 && (
        <View style={[st.center, { paddingTop: size * 0.42 }]} pointerEvents="none">
          <Text style={{ color: colors.sub, fontSize: size * 0.08, fontWeight: '700' }}>{h} год</Text>
        </View>
      )}
    </View>
  );
}

// ─── Орбіта ───────────────────────────────────────────────────────────────────

export function OrbitDial({ startedAt, size, colors }: DialProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const frac = cycles(seconds);
  const R = 40;
  const c = circumference(R);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <Circle cx={50} cy={50} r={R} fill="none" stroke={colors.border} strokeWidth={1.2} />
        <G rotation={-90} origin="50, 50">
          <Circle
            cx={50} cy={50} r={R} fill="none"
            stroke={colors.accent} strokeWidth={2.6} strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - frac.second)}
            opacity={0.28}
          />
        </G>
        <G rotation={frac.minute * 360} origin="50, 50">
          <Circle cx={50} cy={26} r={3} fill={colors.sub} />
        </G>
        <G rotation={frac.second * 360} origin="50, 50">
          <Circle cx={50} cy={10} r={5} fill={colors.accent} />
        </G>
      </Svg>
      <CenterLabel text={formatClock(seconds)} size={size * 0.105} color={colors.text} weight="600" />
    </View>
  );
}

const st = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
