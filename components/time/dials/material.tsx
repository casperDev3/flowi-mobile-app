/**
 * components/time/dials/material.tsx — глибина як спільні деталі.
 *
 * Тут живе ОДИН раз усе, що робить циферблат об'ємним: канавка під треком,
 * опукле тіло дуги, м'який слід секунди замість гострої риски, втоплений
 * підпис, скло під силуетом. Кольори не вигадуються — вони приходять готовими
 * з utils/dialMaterial, який і тримає різницю світлої й темної тем.
 *
 * Правило, за яким сюди щось потрапляє: деталь мусить додавати МАТЕРІАЛ, не
 * переписуючи форму. Пісочний годинник лишається пісочним годинником, стрічка
 * стрічкою — скло лише лягає всередину їхнього силуету.
 *
 * Кількість вузлів тримається на місці свідомо: трек як був одним <Circle>, так
 * ним і лишився, просто з градієнтною обводкою замість плоскої. Екран тримає
 * дисплей увімкненим годинами, а аркуш вибору монтує всі десять циферблатів
 * разом — саме тому матеріал приходить готовими парами кольорів, а не
 * накладеним півпрозорим шаром поверх кожної фігури.
 */
import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Mask,
  Rect,
  Stop,
  type NumberProp,
} from 'react-native-svg';
import type { SharedValue } from 'react-native-reanimated';

import { sunkenTextStyle, trailSteps, type DialMaterial } from '@/utils/dialMaterial';
import { TABULAR } from './shared';
import { SmoothArc, SmoothSpin } from './smooth';

/** Ідентифікатор градієнта цього екземпляра — див. useDialUid у shared.ts. */
export const gid = (uid: string, kind: string): string => `${uid}-${kind}`;
const url = (uid: string, kind: string): string => `url(#${gid(uid, kind)})`;

// ── Заготовки <Defs> ─────────────────────────────────────────────────────────

export type MaterialKind = 'track' | 'ring' | 'dome' | 'well' | 'glass';

/**
 * Градієнти матеріалу в одному напрямку світла.
 *
 * Напрямок береться з матеріалу й однаковий для всіх: різні напрямки в
 * сусідніх клітинках читаються як різні сцени, а не як одна панель приладів.
 * Різниця між втопленим і опуклим — не в куті, а в ПОРЯДКУ стопів, і саме тому
 * її неможливо випадково розвести по циферблатах.
 */
export function DialDefs({ uid, m, kinds }: {
  uid: string;
  m: DialMaterial;
  /** Які саме градієнти потрібні цьому циферблату. Зайві — зайві вузли. */
  kinds: readonly MaterialKind[];
}) {
  const pairs: Record<MaterialKind, { from: string; to: string }> = {
    track: m.track,
    ring:  m.ring,
    dome:  m.dome,
    well:  m.well,
    glass: m.glass,
  };

  return (
    <Defs>
      {kinds.map(kind => (
        <LinearGradient
          key={kind}
          id={gid(uid, kind)}
          gradientUnits="objectBoundingBox"
          x1={m.light.x1} y1={m.light.y1} x2={m.light.x2} y2={m.light.y2}>
          <Stop offset="0" stopColor={pairs[kind].from} />
          <Stop offset="1" stopColor={pairs[kind].to} />
        </LinearGradient>
      ))}
    </Defs>
  );
}

/** Заливка градієнтом матеріалу — щоб циферблати не писали url(#…) руками. */
export const fillOf = (uid: string, kind: MaterialKind): string => url(uid, kind);

// ── Кільця ───────────────────────────────────────────────────────────────────

export interface RingGeometry {
  cx: number;
  cy: number;
  r: number;
  width: number;
}

/**
 * Трек як КАНАВКА: те саме коло, що було, але його обвід має два краї —
 * затінений з боку джерела світла й освітлений навпроти. Саме ця пара, а не
 * тінь під кільцем, читається як «доріжка втоплена».
 */
export function GrooveTrack({ cx, cy, r, width, uid, opacity }: RingGeometry & {
  uid: string;
  opacity?: NumberProp;
}) {
  return (
    <Circle
      cx={cx} cy={cy} r={r} fill="none"
      stroke={url(uid, 'track')} strokeWidth={width} opacity={opacity}
    />
  );
}

export interface ProgressArcProps extends RingGeometry {
  uid: string;
  /** Цілі секунди — з них рахується і тіковий кут, і плавний. */
  seconds: number;
  /** Період повного оберту: 60 / 3600 / 43200. */
  period: number;
  circumference: number;
  opacity?: number;
  /** Не null → дуга йде плавно; null → перемальовується раз на секунду. */
  phase: SharedValue<number> | null;
}

/**
 * Дуга прогресу з ОПУКЛИМ тілом.
 *
 * Плавний і тіковий варіанти — різні компоненти, а не один із прапорцем:
 * анімовані вузли reanimated не мусять існувати там, де плавності немає.
 * Перемикання smooth трапляється лише коли міняється кількість таймерів на
 * екрані, тобто разом із перебудовою всієї сітки.
 */
export function ProgressArc(p: ProgressArcProps) {
  if (p.phase) {
    return (
      <SmoothArc
        cx={p.cx} cy={p.cy} r={p.r} width={p.width}
        stroke={url(p.uid, 'ring')}
        seconds={p.seconds} period={p.period} circumference={p.circumference}
        phase={p.phase} opacity={p.opacity}
      />
    );
  }
  const c = p.circumference;
  return (
    <Circle
      cx={p.cx} cy={p.cy} r={p.r} fill="none"
      stroke={url(p.uid, 'ring')} strokeWidth={p.width} strokeLinecap="round"
      strokeDasharray={`${c} ${c}`}
      strokeDashoffset={c * (1 - (p.seconds % p.period) / p.period)}
      opacity={p.opacity}
    />
  );
}

// ── Шар, що обертається ──────────────────────────────────────────────────────

/**
 * Окреме полотно поверх основного, повернуте на заданий кут.
 *
 * Стрілки й тіла на орбіті винесені сюди, а не лишені в <G rotation>, бо
 * плавність робиться трансформом RN-View: анімований strokeDashoffset у
 * react-native-svg перевірений (components/health/RingCell), а анімований
 * rotation у групи — ні, і його поламка виглядала б як застигла стрілка,
 * помітна лише на пристрої.
 *
 * Шар той самий і в тіковому режимі — інакше геометрія стрілки залежала б від
 * того, плавна вона чи ні, і розходилась би між двома гілками.
 */
export function RotatingLayer({ size, box, baseDeg, degPerSecond, phase, children }: {
  size: number;
  /** Сторона viewBox — та сама сітка координат, що в основного полотна. */
  box: number;
  /** Кут на цілій секунді. */
  baseDeg: number;
  /** Скільки градусів додає одна секунда: 6 для секундної стрілки. */
  degPerSecond: number;
  phase: SharedValue<number> | null;
  children: React.ReactNode;
}) {
  const canvas = (
    <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
      {children}
    </Svg>
  );

  if (phase) {
    return (
      <SmoothSpin baseDeg={baseDeg} degPerSecond={degPerSecond} phase={phase}>
        {canvas}
      </SmoothSpin>
    );
  }
  return (
    <View
      style={[dialStyles.center, { transform: [{ rotate: `${baseDeg}deg` }] }]}
      pointerEvents="none">
      {canvas}
    </View>
  );
}

// ── М'який слід ──────────────────────────────────────────────────────────────

/**
 * Комета за головою сліду: замість гострого зрізу — кілька ланок, що
 * згасають назад.
 *
 * Малюється в системі координат шару, що обертається, тобто голова завжди
 * дивиться на 12 годину, а сама геометрія СТАЛА — рухається лише шар. Це і
 * робить слід дешевим: жодних перерахунків dasharray на кожному кадрі.
 *
 * Градієнт УЗДОВЖ дуги в SVG не задається взагалі, а градієнт по bounding box
 * повертався б разом із дугою й читався як мул, — тому м'якість тут ланками.
 */
export function CometTrail({ cx, cy, r, width, m, size, color, travelled, span }: RingGeometry & {
  m: DialMaterial;
  /** Полотно — від нього залежить, скільки ланок собі дозволити. */
  size: number;
  color: string;
  /** Скільки кола вже пройдено (0…1): хвіст не має вилазити наперед себе. */
  travelled: number;
  /** Довжина комети як частка кола. */
  span: number;
}) {
  const steps = trailSteps(m, size);
  const c = 2 * Math.PI * r;
  // Хвіст не довший за пройдене: на другій секунді хвилини комета в 30° вилізла
  // б за початок відліку й читалась як «уже майже хвилина».
  const tail = Math.min(span, Math.max(0, travelled));
  if (tail <= 0) return null;

  const slice = (c * tail) / steps;

  // Поворот на −90° ВСЕРЕДИНІ комети, а не в місці виклику.
  //
  // strokeDasharray у SVG починає відлік о 3-й годині, а тіло комети стоїть о
  // 12-й — тож без цього повороту хвіст висить на чверть кола за годинниковою
  // стрілкою від голови, тобто ПОПЕРЕДУ неї, у напрямку руху. Саме так тут
  // спершу й вийшло: решта дуг у файлі загорнута в <G rotation={-90}> у місці
  // виклику, а комета цю обгортку загубила, і жоден тест кутів не перевіряє.
  // Тут поворот усередині — тоді забути його неможливо.
  return (
    <G rotation={-90} origin={`${cx}, ${cy}`}>
      {Array.from({ length: steps }, (_, j) => {
        // j = 0 — ланка впритул до голови, найяскравіша.
        const k = steps === 1 ? 0 : j / (steps - 1);
        const opacity = m.trail.head + (m.trail.tail - m.trail.head) * k;
        // Дуга йде назад від 12 години, тобто в кінець кола.
        const from = c - slice * (j + 1);
        return (
          <Circle
            key={j}
            cx={cx} cy={cy} r={r} fill="none"
            stroke={color} strokeWidth={width} strokeLinecap="butt"
            strokeDasharray={`0 ${from} ${slice} ${c}`}
            opacity={opacity}
          />
        );
      })}
    </G>
  );
}

/**
 * Градієнт уздовж стрілки: вістря повне, хвіст розчиняється.
 *
 * userSpaceOnUse, а не bounding box: у <Line> нульова ширина рамки, і градієнт
 * по ній вироджується. Координати задані в системі шару, тож градієнт
 * повертається разом зі стрілкою.
 */
export function HandFadeDef({ uid, color, x1, y1, x2, y2 }: {
  uid: string;
  color: string;
  x1: number; y1: number; x2: number; y2: number;
}) {
  return (
    <Defs>
      <LinearGradient id={gid(uid, 'hand')} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
        {/* Хвіст не гасне в нуль: противага — частина силуету секундної
            стрілки хронографа, і без неї стрілка перестає бути стрілкою. */}
        <Stop offset="0" stopColor={color} stopOpacity="0.28" />
        <Stop offset="0.45" stopColor={color} stopOpacity="0.62" />
        <Stop offset="1" stopColor={color} stopOpacity="1" />
      </LinearGradient>
    </Defs>
  );
}

export const handOf = (uid: string): string => url(uid, 'hand');

// ── Скло ─────────────────────────────────────────────────────────────────────

/**
 * Маска-силует: скло лягає ВСЕРЕДИНУ фігури, а не поверх її обведення.
 *
 * Без маски блиск розмиває контур, і пісочний годинник перестає читатись як
 * пісочний годинник — а форма тут важливіша за матеріал.
 */
export function ShapeMask({ uid, children }: { uid: string; children: React.ReactNode }) {
  return (
    <Defs>
      <Mask id={gid(uid, 'shape')} maskUnits="userSpaceOnUse">
        {children}
      </Mask>
    </Defs>
  );
}

export const maskOf = (uid: string, kind = 'shape'): string => url(uid, kind);

/** Пряма заливка склом — під маскою це і є відблиск усередині силуету. */
export function GlassSheen({ uid, x = 0, y = 0, width, height, mask }: {
  uid: string;
  x?: number;
  y?: number;
  width: NumberProp;
  height: NumberProp;
  mask?: string;
}) {
  return <Rect x={x} y={y} width={width} height={height} fill={url(uid, 'glass')} mask={mask} />;
}

// ── Типографіка ──────────────────────────────────────────────────────────────

/**
 * Підпис часу, трохи втоплений у матеріал.
 *
 * Одна деталь замість двох близнюків (CenterLabel у радіальних і Readout у
 * фігуральних) — і завдяки цьому в глибини під цифрами є один вимикач.
 * Гаситься вона кеглем, усередині sunkenTextStyle: на великому полотні зсув в
 * один пункт читається не як глибина, а як розмита копія.
 */
export function SunkenLabel({ text, fontSize, color, m, weight = '700', style }: {
  text: string;
  fontSize: number;
  color: string;
  m: DialMaterial;
  weight?: '600' | '700' | '800';
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[TABULAR, { color, fontSize, fontWeight: weight }, sunkenTextStyle(m, fontSize), style]}>
      {text}
    </Text>
  );
}

/** Число в центрі кола: RN-Text поверх SVG, щоб успадкувати шрифт застосунку. */
export function CenterOverlay({ children, style }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[dialStyles.center, style]} pointerEvents="none">{children}</View>;
}

export const dialStyles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  stack:  { alignItems: 'center', justifyContent: 'center' },
});
