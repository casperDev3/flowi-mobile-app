/**
 * components/time/ActiveTimersSidebarCard.tsx — активні таймери внизу
 * сайдбара на широкому екрані (планшет).
 *
 * Та сама роль, що ActiveTimersBar над табами телефона, і та сама поведінка:
 *   • 0 таймерів — картки немає;
 *   • 1 — назва + годинник + ■ стоп; тап по назві — Трекер часу;
 *   • N > 1 — «N таймери» + годинник найстарішого; тап розгортає список прямо
 *     в картці (не модалкою: сайдбар і так поруч, а модалка над планшетом
 *     закрила б те, заради чого таймер зупиняють), а під ним в один рядок —
 *     «Трекер часу» і «Зосередження», як в аркуші на телефоні.
 */
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ActiveTimerRow,
  StopTimerButton,
  TIMER_KIND_ICON,
  TimerProjectTag,
  timerKindLabel,
  useTimerStopper,
} from '@/components/time/ActiveTimerRow';
import { useTimerProjects } from '@/components/time/useTimerProjects';
import { FullscreenTimers } from '@/components/time/FullscreenTimers';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useI18n } from '@/store/i18n';
import { useTimerContext } from '@/store/timer-context';
import { primaryTimer, timerKind, timersCountLabel } from '@/utils/activeTimersBar';
import { formatClock } from '@/utils/durationFormat';
import { haptic } from '@/utils/haptics';
import { elapsedSince } from '@/utils/taskTimer';

export interface SidebarCardColors {
  text: string;
  sub: string;
  border: string;
  accent: string;
  activeBg: string;
}

export function ActiveTimersSidebarCard({ colors: c }: { colors: SidebarCardColors }) {
  const router = useRouter();
  const { tr, lang } = useI18n();
  const { activeTimers } = useTimerContext();
  const { busy, stop } = useTimerStopper();
  const projectOf = useTimerProjects(activeTimers);
  const [expanded, setExpanded] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  const count = activeTimers.length;
  const primary = primaryTimer(activeTimers);

  // Лишився один таймер (або жодного) — список більше не потрібен; наступна
  // поява кількох знову почнеться згорнутою.
  useEffect(() => {
    if (count <= 1) setExpanded(false);
  }, [count]);

  // Режим живе поза карткою: коли в ньому зупинили останній таймер, картка
  // зникає, а режим лишається відкритим у своєму порожньому стані.
  const focusLayer = <FullscreenTimers visible={focusOpen} onClose={() => setFocusOpen(false)} />;

  if (!primary) return focusOpen ? focusLayer : null;

  const single = count === 1;
  const primaryLabel = primary.label?.trim() || timerKindLabel(timerKind(primary), tr);
  const rowColors = { text: c.text, sub: c.sub, border: c.border, accent: c.accent };

  return (
    <View style={[st.card, { borderColor: c.border, backgroundColor: c.activeBg }]}>
      <View style={st.head}>
        <Pressable
          onPress={() => {
            haptic.light();
            if (single) router.push('/(tabs)/time' as never);
            else setExpanded(v => !v);
          }}
          accessibilityRole="button"
          accessibilityState={single ? undefined : { expanded }}
          accessibilityLabel={single ? `${tr.navTimeTracker}: ${primaryLabel}` : tr.activeTimersExpandA11y}
          style={st.headBody}>
          <View style={[st.icon, { backgroundColor: c.accent + '22' }]}>
            <IconSymbol name={single ? TIMER_KIND_ICON[timerKind(primary)] : 'timer'} size={14} color={c.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={single ? 2 : 1} style={[st.title, { color: c.text }]}>
              {single ? primaryLabel : timersCountLabel(count, lang, tr)}
            </Text>
            <View style={st.meta}>
              <ElapsedClock
                running
                seconds={now => elapsedSince(primary.startedAt, now)}
                format={formatClock}
                style={[st.clock, { color: c.accent }]}
              />
              {single && (
                <TimerProjectTag project={projectOf(primary)} tr={tr} color={c.sub} size={11} style={st.tag} />
              )}
            </View>
          </View>
          {!single && (
            <IconSymbol name={expanded ? 'chevron.down' : 'chevron.up'} size={13} color={c.sub} />
          )}
        </Pressable>
        {single && (
          <StopTimerButton
            busy={busy.has(primary.id)}
            onPress={() => stop(primary.id)}
            label={`${tr.stopTimerAction}: ${primaryLabel}`}
            size={28}
          />
        )}
      </View>

      {!single && expanded && (
        <ScrollView
          style={st.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled>
          {activeTimers.map(timer => (
            <ActiveTimerRow
              key={timer.id}
              timer={timer}
              project={projectOf(timer)}
              busy={busy.has(timer.id)}
              onStop={() => stop(timer.id)}
              colors={rowColors}
              tr={tr}
              compact
            />
          ))}
        </ScrollView>
      )}

      {!single && expanded && (
        <View style={st.actions}>
          <Pressable
            onPress={() => router.push('/(tabs)/time' as never)}
            accessibilityRole="button"
            style={[st.action, { borderColor: c.border }]}>
            <IconSymbol name="timer" size={13} color={c.accent} />
            <Text numberOfLines={1} style={[st.actionText, { color: c.accent }]}>{tr.navTimeTracker}</Text>
          </Pressable>
          <Pressable
            onPress={() => { haptic.light(); setFocusOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel={`${tr.focusMode}, ${tr.activeTimers}: ${count}`}
            style={[st.action, { borderColor: c.accent, backgroundColor: c.accent + '20' }]}>
            <IconSymbol name="viewfinder" size={13} color={c.accent} />
            <Text numberOfLines={1} style={[st.actionText, { color: c.accent }]}>{tr.focusMode}</Text>
          </Pressable>
        </View>
      )}
      {focusLayer}
    </View>
  );
}

const st = StyleSheet.create({
  card:     { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, marginTop: 8 },
  head:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 0 },
  icon:     { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 13, fontWeight: '700' },
  clock:    { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  tag:      { flexShrink: 1, marginTop: 1 },
  list:     { maxHeight: 260, marginTop: 4 },
  actions:  { flexDirection: 'row', gap: 6, marginTop: 6 },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 36,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
  },
  actionText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
