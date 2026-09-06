/**
 * components/time/dials/FiguralDials.tsx — циферблати, які не є ні цифрами,
 * ні колом.
 *
 * Спільне в них те, що жоден не показує час сам по собі: пісок, крапки й
 * стрічка передають рух і масштаб, але не число. Тому число під ними —
 * обовʼязкова частина, а не підпис.
 *
 * Матеріалу тут дістається СКЛО, а не тіні. Причина в товщині ліній: контур
 * пісочного годинника 2.4, риски стрічки 1.0–1.6 при непрозорості 0.28,
 * крапка в сітці від 5pt. Тінь такого порядку не додає об'єму, а з'їдає саму
 * фігуру — тож глибина тут робиться заливкою й маскою.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

import { useClockTick } from '@/hooks/use-clock-tick';
import { formatClock } from '@/utils/durationFormat';
import { elapsedSince } from '@/utils/taskTimer';
import {
  DialDefs,
  GlassSheen,
  ShapeMask,
  SunkenLabel,
  dialStyles,
  fillOf,
  maskOf,
} from './material';
import { edgeGlassFade } from '@/utils/dialMaterial';
import { cycles, useDialUid, type DialRenderProps } from './shared';
import { SmoothSlide, useSecondPhase } from './smooth';

/** Підпис часу під фігурою — однаковий у всіх трьох. */
function Readout({ seconds, size, color, m }: {
  seconds: number;
  size: number;
  color: string;
  m: DialRenderProps['material'];
}) {
  return (
    <SunkenLabel
      text={formatClock(seconds)}
      fontSize={size * 0.11}
      color={color}
      m={m}
      style={{ marginTop: 6 }}
    />
  );
}

// ─── Пісочний годинник ────────────────────────────────────────────────────────

const GLASS_SHAPE = '20,10 80,10 50,50 80,90 20,90 50,50';

export function HourglassDial({ startedAt, size, colors, material: m }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const poured = cycles(seconds).second;   // скільки пересипано за цю хвилину
  const left = 1 - poured;
  const uid = useDialUid();

  const glass = size * 0.72;

  // Верхня купка сидить біля перемички, її поверхня опускається до y=50.
  const topSand = `50,50 ${50 - 30 * left},${50 - 40 * left} ${50 + 30 * left},${50 - 40 * left}`;
  // Нижня росте від дна вгору.
  const botSand =
    `20,90 80,90 ${50 + 30 * (1 - poured)},${90 - 40 * poured} ${50 - 30 * (1 - poured)},${90 - 40 * poured}`;

  return (
    <View style={dialStyles.stack}>
      <Svg width={glass} height={glass * 0.94} viewBox="0 0 100 100">
        <DialDefs uid={uid} m={m} kinds={['glass']} />
        {/* Маска силуету: відблиск мусить лишитися ВСЕРЕДИНІ скла. Поверх
            обведення він розмив би силует, і фігура перестала б читатись як
            пісочний годинник — а форма тут важливіша за матеріал. */}
        <ShapeMask uid={uid}>
          <Polygon points={GLASS_SHAPE} fill="#FFFFFF" />
        </ShapeMask>

        {/* Пісок під контуром: контур мусить лишатися чіткою межею. */}
        <Polygon points={topSand} fill={colors.accent} opacity={0.85} />
        <Polygon points={botSand} fill={colors.accent} opacity={0.85} />
        <Line x1={50} y1={50} x2={50} y2={88} stroke={colors.accent} strokeWidth={1.4} opacity={0.5} />
        {/* Скло лягає над піском, але під обведенням. */}
        <GlassSheen uid={uid} width={100} height={100} mask={maskOf(uid)} />
        <Polygon
          points={GLASS_SHAPE}
          fill="none" stroke={colors.sub} strokeWidth={2.4} strokeLinejoin="round"
        />
      </Svg>
      <Readout seconds={seconds} size={size} color={colors.text} m={m} />
    </View>
  );
}

// ─── Сітка секунд ─────────────────────────────────────────────────────────────

const GRID_COLUMNS = 10;
const GRID_ROWS = 6;
const GRID_TOTAL = GRID_COLUMNS * GRID_ROWS;
/** Понад цю кількість риски хвилин замінюються числом — інакше ряд повзе. */
const MAX_PIPS = 30;

export function DotsDial({ startedAt, size, colors, material: m }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const inMinute = seconds % 60;
  const minutes = Math.floor(seconds / 60);
  const uid = useDialUid();

  const gap = Math.max(3, size * 0.022);
  const dot = Math.max(5, (size * 0.8 - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  const gridWidth = dot * GRID_COLUMNS + gap * (GRID_COLUMNS - 1);
  const gridHeight = dot * GRID_ROWS + gap * (GRID_ROWS - 1);

  return (
    <View style={dialStyles.stack}>
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

      {/* Шістдесят крапок ОДНИМ полотном, а не шістдесятьма View. Глибина тут
          допустима рівно одна — заповнена опукла, порожня втоплена, — і
          робиться вона заливкою: тінь під кожною дала б шістдесят брудних
          плям. Заодно вузлів стало вдвічі менше, ніж було. */}
      <Svg width={gridWidth} height={gridHeight} style={{ marginTop: 6 }}>
        <DialDefs uid={uid} m={m} kinds={['dome', 'well']} />
        {Array.from({ length: GRID_TOTAL }, (_, i) => {
          const col = i % GRID_COLUMNS;
          const row = Math.floor(i / GRID_COLUMNS);
          return (
            <Circle
              key={i}
              cx={col * (dot + gap) + dot / 2}
              cy={row * (dot + gap) + dot / 2}
              r={dot / 2}
              fill={fillOf(uid, i < inMinute ? 'dome' : 'well')}
            />
          );
        })}
      </Svg>

      <Readout seconds={seconds} size={size} color={colors.text} m={m} />
    </View>
  );
}

// ─── Лінійка ──────────────────────────────────────────────────────────────────

/** Пікселів на секунду в полотні стрічки. */
const PX_PER_SEC = 13;

export function TapeDial({ startedAt, size, colors, material: m, smooth }: DialRenderProps) {
  const now = useClockTick(true);
  const seconds = elapsedSince(startedAt, now);
  const phase = useSecondPhase(startedAt, now, !!smooth);

  const W = size;
  const H = Math.max(38, size * 0.34);
  // Скло по краях: смуга, на якій риски згасають, замість обриву на межі.
  const FADE = Math.max(2 * PX_PER_SEC, W * 0.16);
  // У плавному режимі шкала їде трансформом на секунду вліво, тож полотно
  // ширше вікна рівно на цю секунду — інакше праворуч відкривалася б порожнеча.
  const overscan = smooth ? PX_PER_SEC : 0;
  // Згасання рахується від положення риски на ЕКРАНІ, а не від того, де вона
  // стартувала. Полотно за секунду проїжджає PX_PER_SEC вліво, тож без поправки
  // непрозорість заморожена на початковій позиції й щосекунди стрибає.
  // Точну фазу тут не взяти — вона живе shared value reanimated і під час
  // рендера не читається, — тож беремо середину проїзду: похибка ділиться
  // навпіл і перестає бути видимою на смузі згасання.
  const slideBias = overscan / 2;
  const span = Math.ceil(W / PX_PER_SEC) + 4;
  const base = seconds - Math.floor(span / 2);

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i < span; i++) {
    const sec = base + i;
    if (sec < 0) continue;
    const x = W / 2 + (sec - seconds) * PX_PER_SEC;
    if (x < -2 || x > W + overscan + 2) continue;
    const major = sec % 60 === 0;
    const mid = sec % 10 === 0;
    ticks.push(
      <Line
        key={sec}
        x1={x} y1={4} x2={x} y2={4 + (major ? H - 14 : mid ? 12 : 7)}
        stroke={colors.sub}
        strokeWidth={major ? 1.6 : 1.3}
        strokeLinecap="round"
        opacity={(major ? 0.9 : mid ? 0.55 : 0.28) * edgeGlassFade(x - slideBias, W, FADE)}
      />,
    );
  }

  const scale = (
    <Svg width={W + overscan} height={H} viewBox={`0 0 ${W + overscan} ${H}`}>
      {ticks}
    </Svg>
  );

  return (
    <View style={dialStyles.stack}>
      <View style={{ width: W, height: H, overflow: 'hidden' }}>
        {smooth ? (
          <SmoothSlide pxPerSecond={PX_PER_SEC} phase={phase}>{scale}</SmoothSlide>
        ) : (
          scale
        )}
        {/* Мітка «зараз» нерухома — рухається шкала, як у тюнера. Саме тому
            в цього циферблата немає стелі: після девʼятої години нічого не
            змінюється, стрічка просто їде далі. Вона поза шаром, що їде, і поза
            склом: це єдина річ на стрічці, яка не має згасати. */}
        <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
          <Line
            x1={W / 2} y1={2} x2={W / 2} y2={H - 6}
            stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round"
          />
        </Svg>
      </View>
      <Readout seconds={seconds} size={size} color={colors.text} m={m} />
    </View>
  );
}
