/**
 * components/time/dials/RadialDials.tsx — циферблати, побудовані на колі.
 *
 * Спільне в них не форма, а спосіб читання: положення на колі видно боковим
 * зором, не читаючи цифр. Тому в кожного все одно є число — коло каже «майже
 * хвилина», але не каже «сорок три».
 *
 * Матеріал (канавка під треком, опукле тіло дуги, м'який слід) береться з
 * ./material і НЕ вигадується тут: три радіальні — саме те місце, де глибина
 * найбезпечніша, і воно ж задає планку, до якої підтягуються решта сім.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line } from 'react-native-svg';

import { useClockTick } from '@/hooks/use-clock-tick';
import { formatClock } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import {
  CenterOverlay,
  CometTrail,
  DialDefs,
  GrooveTrack,
  HandFadeDef,
  ProgressArc,
  RotatingLayer,
  SunkenLabel,
  fillOf,
  handOf,
} from './material';
import { BOX, circumference, cycles, pad, useDialUid, type DialRenderProps } from './shared';
import { useSecondPhase } from './smooth';

const CENTER = BOX / 2;
/** Довжина комети за головою сліду — трохи менше шостої частини кола. */
const COMET_SPAN = 0.15;

// ─── Кільця ───────────────────────────────────────────────────────────────────

const RINGS = [
  { r: 45, w: 7, key: 'second' as const, period: 60,    opacity: 1 },
  { r: 34, w: 6, key: 'minute' as const, period: 3600,  opacity: 0.62 },
  { r: 24, w: 5, key: 'hour'   as const, period: 43200, opacity: 0.34 },
];

export function RingsDial({ startedAt, size, colors, material: m, smooth }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const uid = useDialUid();
  const phase = useSecondPhase(startedAt, now, !!smooth);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        {/* Матеріал ОДИН на всі три кільця. Дати кожному власний градієнт
            означало б убити градацію 1 / 0.62 / 0.34, а саме вона — і є
            ієрархія «секунда, хвилина, година». */}
        <DialDefs uid={uid} m={m} kinds={['track', 'ring']} />
        <G rotation={-90} origin={`${CENTER}, ${CENTER}`}>
          {RINGS.map(ring => (
            <React.Fragment key={ring.key}>
              <GrooveTrack cx={CENTER} cy={CENTER} r={ring.r} width={ring.w} uid={uid} />
              <ProgressArc
                cx={CENTER} cy={CENTER} r={ring.r} width={ring.w} uid={uid}
                seconds={seconds} period={ring.period}
                circumference={circumference(ring.r)}
                opacity={ring.opacity}
                // Плавно йде лише секундне: за кадр хвилинне кільце
                // просувається на тисячні частки пункта, і платити за це
                // шістдесятьма кадрами на секунду нема за що.
                phase={smooth && ring.key === 'second' ? phase : null}
              />
            </React.Fragment>
          ))}
        </G>
      </Svg>
      <CenterOverlay>
        <SunkenLabel text={formatClock(seconds)} fontSize={size * 0.11} color={colors.text} m={m} />
      </CenterOverlay>
    </View>
  );
}

// ─── Дуга ─────────────────────────────────────────────────────────────────────

export function ArcDial({ startedAt, size, colors, material: m, smooth }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const h = Math.floor(seconds / 3600);
  const uid = useDialUid();
  const phase = useSecondPhase(startedAt, now, !!smooth);
  const r = 43;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <DialDefs uid={uid} m={m} kinds={['track', 'ring']} />
        <G rotation={-90} origin={`${CENTER}, ${CENTER}`}>
          <GrooveTrack cx={CENTER} cy={CENTER} r={r} width={9} uid={uid} />
          <ProgressArc
            cx={CENTER} cy={CENTER} r={r} width={9} uid={uid}
            seconds={seconds} period={60} circumference={circumference(r)}
            phase={smooth ? phase : null}
          />
        </G>
      </Svg>
      <CenterOverlay>
        <SunkenLabel
          text={`${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`}
          fontSize={size * 0.17}
          color={colors.text}
          m={m}
        />
        {h > 0 && (
          <SunkenLabel
            text={`${h} год`}
            fontSize={size * 0.075}
            color={colors.sub}
            m={m}
            weight="600"
            style={{ letterSpacing: 0.8, marginTop: 2 }}
          />
        )}
      </CenterOverlay>
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

export function ChronoDial({ startedAt, size, colors, material: m, smooth }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const frac = cycles(seconds);
  const h = Math.floor(seconds / 3600);
  const uid = useDialUid();
  const phase = useSecondPhase(startedAt, now, !!smooth);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <DialDefs uid={uid} m={m} kinds={['track']} />
        {/* Безель — та сама канавка, що трек у решти радіальних. */}
        <GrooveTrack cx={CENTER} cy={CENTER} r={46} width={1.5} uid={uid} />
        {/* Риски лишаються плоскими навмисно: шістдесят затінених рисок дають
            кашу, а хронограф читається саме по шкалі й стрілках. */}
        {TICKS.map(t => (
          <Line
            key={t.key}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={t.major ? colors.sub : colors.border}
            strokeWidth={t.major ? 1.8 : 1}
            strokeLinecap="round"
          />
        ))}
        {/* Хвилинна лишається суцільною: вона тут «важка» стрілка, і саме
            контраст із тонкою секундною тримає читання. */}
        <G rotation={frac.minute * 360} origin="50, 50">
          <Line x1={50} y1={50} x2={50} y2={24} stroke={colors.text} strokeWidth={3.4} strokeLinecap="round" />
        </G>
      </Svg>

      {/* Секундна стрілка живе в окремому шарі: у плавному режимі рухається
          він, а не перемальовується полотно. */}
      <RotatingLayer size={size} box={BOX} baseDeg={frac.second * 360} degPerSecond={6} phase={smooth ? phase : null}>
        <DialDefs uid={uid} m={m} kinds={['dome']} />
        {/* Хвіст стрілки розчиняється замість того, щоб обриватися рискою. */}
        <HandFadeDef uid={uid} color={colors.accent} x1={50} y1={56} x2={50} y2={12} />
        <Line x1={50} y1={56} x2={50} y2={12} stroke={handOf(uid)} strokeWidth={1.6} strokeLinecap="round" />
        <Circle cx={50} cy={50} r={3} fill={fillOf(uid, 'dome')} />
      </RotatingLayer>

      {/* Лічильник годин знімає стелю: після години циферблат не ламається,
          а просто починає новий оберт. */}
      {h > 0 && (
        <CenterOverlay style={{ paddingTop: size * 0.42 }}>
          <SunkenLabel text={`${h} год`} fontSize={size * 0.08} color={colors.sub} m={m} />
        </CenterOverlay>
      )}
    </View>
  );
}

// ─── Орбіта ───────────────────────────────────────────────────────────────────

export function OrbitDial({ startedAt, size, colors, material: m, smooth }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const frac = cycles(seconds);
  const uid = useDialUid();
  const phase = useSecondPhase(startedAt, now, !!smooth);
  const R = 40;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${BOX} ${BOX}`}>
        <DialDefs uid={uid} m={m} kinds={['track', 'ring']} />
        <GrooveTrack cx={CENTER} cy={CENTER} r={R} width={1.2} uid={uid} />
        <G rotation={-90} origin="50, 50">
          <ProgressArc
            cx={CENTER} cy={CENTER} r={R} width={2.6} uid={uid}
            seconds={seconds} period={60} circumference={circumference(R)}
            opacity={0.28}
            phase={smooth ? phase : null}
          />
        </G>
        {/* Хвилинне тіло лишається на тіку: за кадр воно проходить менше
            сотої пункта. */}
        <G rotation={frac.minute * 360} origin="50, 50">
          <Circle cx={50} cy={26} r={3} fill={colors.sub} />
        </G>
      </Svg>

      <RotatingLayer size={size} box={BOX} baseDeg={frac.second * 360} degPerSecond={6} phase={smooth ? phase : null}>
        <DialDefs uid={uid} m={m} kinds={['dome']} />
        {/* Комета за тілом: слід перестає обриватися гострим зрізом. */}
        <CometTrail
          cx={CENTER} cy={CENTER} r={R} width={2.6}
          m={m} size={size} color={colors.accent}
          travelled={frac.second} span={COMET_SPAN}
        />
        <Circle cx={50} cy={10} r={5} fill={fillOf(uid, 'dome')} />
      </RotatingLayer>

      <CenterOverlay>
        <SunkenLabel text={formatClock(seconds)} fontSize={size * 0.105} color={colors.text} m={m} weight="600" />
      </CenterOverlay>
    </View>
  );
}
