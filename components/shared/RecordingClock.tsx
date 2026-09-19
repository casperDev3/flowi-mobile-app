/**
 * components/shared/RecordingClock.tsx — таймер аудіозапису (ХХ:СС).
 *
 * Раніше секунди запису лічив екран: setInterval щосекунди робив
 * setRecordingSeconds, і перемальовувався ВЕСЬ екран (Завдання — ~3000 рядків,
 * Наради), хоча змінювались лише чотири цифри в модалці. Тепер екран знає
 * тільки мітку початку запису, а цокає цей маленький компонент — через
 * спільний тікер (hooks/use-clock-tick.ts, див. ElapsedClock).
 */
import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { formatMinutesClock } from '@/utils/durationFormat';

export function RecordingClock({ startedAt, style }: {
  /** Date.now() на момент старту запису; null — запис не йде (00:00). */
  startedAt: number | null;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <ElapsedClock
      running={startedAt != null}
      seconds={now => (startedAt == null ? 0 : (now - startedAt) / 1000)}
      format={formatMinutesClock}
      style={style}
    />
  );
}
