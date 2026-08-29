/**
 * components/time/dials/TimerDial.tsx — вибір циферблата за його id.
 *
 * Диспетчер, а не «розумний» компонент: усе, що він робить, — зіставляє
 * DialId із реалізацією. Мапа повна за побудовою (Record<DialId, …>), тож
 * новий циферблат у utils/timerDials, забутий тут, не збереться — краще
 * помилка типів, ніж порожнє місце замість годинника.
 */
import React from 'react';

import type { DialId } from '@/utils/timerDials';
import { DotsDial, HourglassDial, TapeDial } from './FiguralDials';
import { DigitsDial, FlipDial, SegmentDial } from './NumericDials';
import { ArcDial, ChronoDial, OrbitDial, RingsDial } from './RadialDials';
import type { DialProps } from './shared';

const IMPLEMENTATIONS: Record<DialId, React.ComponentType<DialProps>> = {
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
  return <Dial {...props} />;
}

export type { DialColors, DialProps } from './shared';
