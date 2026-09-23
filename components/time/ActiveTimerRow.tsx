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
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol, type IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { useTimerContext } from '@/store/timer-context';
import type { ActiveTimer, TimerProject } from '@/utils/activeTimers';
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

/**
 * Чий таймер: крапка кольору проєкту + назва, або «Особисте».
 *
 * Замінила частину доби (ранок/день/вечір/ніч): та нічого не казала про саму
 * роботу, а проєкт — саме те, за чим сесія потім ляже у звіт. Для проєкту,
 * якого ще немає в завантаженому списку (kind 'unknown'), мітки немає зовсім:
 * «Особисте» там було б неправдою.
 */
export function TimerProjectTag({
  project, tr, color, size = 12, style,
}: {
  project: TimerProject | undefined;
  tr: Translations;
  /** Колір тексту — приглушений колір контейнера. */
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  if (!project || project.kind === 'unknown') return null;
  const name = project.kind === 'project' ? project.name.trim() || tr.project : tr.timerProjectPersonal;
  return (
    <View style={[st.tag, style]} accessibilityLabel={`${tr.project}: ${name}`}>
      {project.kind === 'project' && project.color
        ? <View style={[st.tagDot, { backgroundColor: project.color }]} />
        : null}
      <Text numberOfLines={1} style={[st.tagText, { color, fontSize: size }]}>{name}</Text>
    </View>
  );
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
  timer, project, busy, onStop, colors: c, tr, compact = false,
}: {
  timer: ActiveTimer;
  /** Проєкт таймера (useTimerProjects); undefined — мітки немає. */
  project?: TimerProject;
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
        <View style={st.meta}>
          <ElapsedClock
            running
            seconds={now => elapsedSince(timer.startedAt, now)}
            format={formatClock}
            style={[st.clock, { color: c.sub }]}
          />
          <TimerProjectTag project={project} tr={tr} color={c.sub} style={st.metaTag} />
        </View>
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
  meta:    { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  metaTag: { flexShrink: 1, marginTop: 1 },
  tag:     { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  tagDot:  { width: 7, height: 7, borderRadius: 4 },
  tagText: { fontWeight: '600', flexShrink: 1 },
});
