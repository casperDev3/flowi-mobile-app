/**
 * components/time/dials/TimerDial.tsx — вибір циферблата за його id.
 *
 * Диспетчер, а не «розумний» компонент: усе, що він робить, — зіставляє
 * DialId із реалізацією. Мапа повна за побудовою (Record<DialId, …>), тож
 * новий циферблат у utils/timerDials, забутий тут, не збереться — краще
 * помилка типів, ніж порожнє місце замість годинника.
 *
 * Одне виняткове знання в нього все ж є: матеріал глибини рахується ТУТ, один
 * раз на циферблат. Якби кожен із десяти кликав фабрику сам, це були б десять
 * місць, де світло може повернути в інший бік, — а сусідні клітинки з різним
 * напрямком світла читаються як різні сцени. Заразом виклики TimerDial не
 * мусять нічого знати про матеріал: їм досить теми.
 */
import React, { useMemo } from 'react';

import { dialMaterial } from '@/utils/dialMaterial';
import type { DialId } from '@/utils/timerDials';
import { DotsDial, HourglassDial, TapeDial } from './FiguralDials';
import { DigitsDial, FlipDial, SegmentDial } from './NumericDials';
import { ArcDial, ChronoDial, OrbitDial, RingsDial } from './RadialDials';
import type { DialProps, DialRenderProps } from './shared';

const IMPLEMENTATIONS: Record<DialId, React.ComponentType<DialRenderProps>> = {
  digits:    DigitsDial,
  segment:   SegmentDial,
  flip:      FlipDial,
  rings:     RingsDial,
  arc:       ArcDial,
  chrono:    ChronoDial,
  orbit:     OrbitDial,
  hourglass: HourglassDial,
  dots:      DotsDial,
  tape:      TapeDial,
};

export interface TimerDialProps extends DialProps {
  dial: DialId;
}

export function TimerDial({ dial, ...props }: TimerDialProps) {
  const Dial = IMPLEMENTATIONS[dial] ?? IMPLEMENTATIONS.digits;
  // Залежності — самі кольори, а не об'єкт: усі три виклики TimerDial
  // складають палітру літералом на кожному рендері, тож по посиланню memo не
  // спрацював би жодного разу, а матеріал перераховувався б щосекунди на
  // кожному з десяти циферблатів аркуша вибору.
  const { text, sub, border, accent } = props.colors;
  const material = useMemo(
    () => dialMaterial({ text, sub, border, accent }, !!props.isDark),
    [text, sub, border, accent, props.isDark],
  );
  return <Dial {...props} material={material} />;
}

export type { DialColors, DialProps } from './shared';
