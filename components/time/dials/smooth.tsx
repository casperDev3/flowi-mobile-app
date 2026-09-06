/**
 * components/time/dials/smooth.tsx — плавний хід великого циферблата.
 *
 * Reanimated живе В ОКРЕМОМУ файлі навмисно. По-перше, щоб було видно межу:
 * усе, що тут, стосується ЛИШЕ циферблата, який на екрані один і великий
 * (правило в utils/dialSmooth). По-друге, щоб дрібні не платили: поки smooth
 * вимкнений, жоден компонент звідси не монтується, анімованих вузлів немає, і
 * спільний тікер лишається єдиним джерелом руху — раз на секунду.
 *
 * Фаза не крутиться власним нескінченним циклом. Вона наново прив'язується до
 * справжнього годинника на кожному тіку (smoothPhaseAnchor), тож за годину
 * стрілка не обганяє власні цифри — похибка обнуляється щосекунди.
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Circle } from 'react-native-svg';

import { smoothPhaseAnchor } from '@/utils/dialSmooth';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Частка поточної секунди, 0 → 1, у вигляді shared value.
 *
 * Значення живе на UI-потоці: воно НЕ викликає рендер React, тому плавність не
 * коштує жодного зайвого перемальовування. Коли enabled = false, таймінг не
 * запускається взагалі — shared value просто стоїть на нулі.
 */
export function useSecondPhase(startedAt: string, now: number, enabled: boolean): SharedValue<number> {
  const phase = useSharedValue(0);
  // Коли плавності немає, тік у залежності НЕ входить: інакше кожен із десяти
  // циферблатів аркуша вибору писав би нуль у власний shared value щосекунди —
  // робота, яка нічого не рухає.
  const anchor = enabled ? now : 0;

  useEffect(() => {
    if (!enabled) {
      phase.value = 0;
      return;
    }
    const { from, duration } = smoothPhaseAnchor(startedAt, anchor);
    phase.value = from;
    phase.value = withTiming(1, { duration, easing: Easing.linear });
    // phase — стабільний shared value; рух перезапускається на кожному тіку.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, anchor, enabled]);

  return phase;
}

// ── Дуга ─────────────────────────────────────────────────────────────────────

export interface SmoothArcProps {
  cx: number;
  cy: number;
  r: number;
  width: number;
  stroke: string;
  /** Цілі секунди на момент рендеру: до них додається дробова фаза. */
  seconds: number;
  /** Період повного оберту в секундах: 60, 3600 або 43200. */
  period: number;
  circumference: number;
  phase: SharedValue<number>;
  opacity?: number;
  cap?: 'round' | 'butt';
}

export function SmoothArc({
  cx, cy, r, width, stroke, seconds, period, circumference: c, phase, opacity, cap = 'round',
}: SmoothArcProps) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - ((seconds + phase.value) % period) / period),
  }));

  return (
    <AnimatedCircle
      cx={cx} cy={cy} r={r} fill="none"
      stroke={stroke} strokeWidth={width} strokeLinecap={cap}
      strokeDasharray={`${c} ${c}`}
      opacity={opacity}
      animatedProps={animatedProps}
    />
  );
}

// ── Оберт ────────────────────────────────────────────────────────────────────

export interface SmoothSpinProps {
  /** Кут на цілій секунді — далі до нього додається дробова частка. */
  baseDeg: number;
  /** Скільки градусів дає одна секунда: 6 для секундної стрілки. */
  degPerSecond: number;
  phase: SharedValue<number>;
  children: React.ReactNode;
}

/**
 * Обертає вміст навколо ЦЕНТРУ свого шару.
 *
 * Оберт зроблено трансформом RN-View, а не rotation у <G>: анімований
 * strokeDashoffset у react-native-svg перевірений (components/health/RingCell),
 * а анімований rotation у групи — ні, і його поламка виглядала б як застигла
 * стрілка, яку помітно лише на пристрої.
 */
export function SmoothSpin({ baseDeg, degPerSecond, phase, children }: SmoothSpinProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${baseDeg + phase.value * degPerSecond}deg` }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

// ── Зсув ─────────────────────────────────────────────────────────────────────

export interface SmoothSlideProps {
  /** Скільки пунктів проїжджає шкала за секунду. */
  pxPerSecond: number;
  phase: SharedValue<number>;
  children: React.ReactNode;
}

/** Стрічка тюнера: їде шкала, мітка «зараз» лишається на місці. */
export function SmoothSlide({ pxPerSecond, phase, children }: SmoothSlideProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: -phase.value * pxPerSecond }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
