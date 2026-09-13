/**
 * components/time/ActiveTimerRow.tsx — рядок активного таймера зі стопом.
 *
 * Спільний для глобальної панелі над табами (телефон) і картки внизу
 * сайдбара (планшет): «зупинити з будь-якого місця» мусить виглядати й
 * поводитись однаково, інакше це два різні інструменти.
 *
 * Зупинка йде через useTimerContext().stopTimer — той самий шлях, що з деталі
 * завдання чи режиму зосередження: реєстр → завдання/нарада → time_entries.
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { useTimerContext } from '@/store/timer-context';
import type { ActiveTimer } from '@/utils/activeTimers';
import { timerKind, type TimerKind } from '@/utils/activeTimersBar';
import { formatClock } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { elapsedSince } from '@/utils/taskTimer';

export const STOP_COLOR = '#EF4444';

export const TIMER_KIND_ICON: Record<TimerKind, IconSymbolName> = {
  task: 'checklist',
  meeting: 'calendar',
  adhoc: 'timer',
};

export function timerKindLabel(kind: TimerKind, tr: Translations): string {
  return kind === 'task' ? tr.timerKindTask : kind === 'meeting' ? tr.timerKindMeeting : tr.timerKindAdhoc;
}

/**
 * Зупинка з захистом від подвійного тапу: поки запис не завершився, кнопка
 * неактивна. Повторний stopTimer сам по собі безпечний (таймера вже немає в
 * реєстрі → no-op), але кнопка, що «не реагує», чесніша за мовчазний дубль.
 */
export function useTimerStopper() {
  const { stopTimer } = useTimerContext();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const stop = useCallback((id: string) => {
    setBusy(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    haptic.medium();
    stopTimer(id)
      .catch(e => { if (__DEV__) console.warn('[timers-bar] зупинка не вдалася:', e); })
      .finally(() => {
        setBusy(prev => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
  }, [stopTimer]);

  return { busy, stop };
}

export interface TimerRowColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export function StopTimerButton({
  busy, onPress, label, size = 32,
}: { busy: boolean; onPress: () => void; label: string; size?: number }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [
        st.stop,
        { width: size, height: size, borderRadius: size / 2, opacity: pressed || busy ? 0.6 : 1 },
      ]}>
      {busy
        ? <ActivityIndicator size="small" color="#FFFFFF" />
        : <IconSymbol name="stop.fill" size={Math.round(size * 0.42)} color="#FFFFFF" />}
    </Pressable>
  );
}

export function ActiveTimerRow({
  timer, busy, onStop, colors: c, tr, compact = false,
}: {
  timer: ActiveTimer;
  busy: boolean;
  onStop: () => void;
  colors: TimerRowColors;
  tr: Translations;
  /** Вузький рядок сайдбара: назва у два рядки, годинник під нею. */
  compact?: boolean;
}) {
  const kind = timerKind(timer);
  const label = timer.label?.trim() || timerKindLabel(kind, tr);

  return (
    <View style={[st.row, { borderBottomColor: c.border }]}>
      <View style={[st.kind, { backgroundColor: c.accent + '1F' }]}>
        <IconSymbol name={TIMER_KIND_ICON[kind]} size={14} color={c.accent} />
      </View>
      <View style={st.body}>
        <Text numberOfLines={compact ? 2 : 1} style={[st.label, { color: c.text }]}>{label}</Text>
        <ElapsedClock
          running
          seconds={now => elapsedSince(timer.startedAt, now)}
          format={formatClock}
          style={[st.clock, { color: c.sub }]}
        />
      </View>
      <StopTimerButton
        busy={busy}
        onPress={onStop}
        label={`${tr.stopTimerAction}: ${label}`}
        size={compact ? 28 : 32}
      />
    </View>
  );
}

const st = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  kind:  { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  body:  { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '600' },
  clock: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 1 },
  stop:  { backgroundColor: STOP_COLOR, alignItems: 'center', justifyContent: 'center' },
});
