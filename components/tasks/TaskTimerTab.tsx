/**
 * components/tasks/TaskTimerTab.tsx
 *
 * Вкладка таймера в деталі завдання: скільки натікло, кнопка старт/стоп
 * і перелік сесій.
 *
 * Сесія, що триває, більше не живе серед timeEntries — вона приходить
 * пропом `activeStartedAt` із реєстру active_timers. Тому список нижче — це
 * рівно завершені сесії, а активна показана окремим рядком зверху: інакше
 * довелося б вигадувати для неї запис, якого в даних завдання немає.
 *
 * Два місця тут показують час, що біжить — велике табло і рядок активної
 * сесії. Обидва йдуть через ElapsedClock: значення обчислюється від startedAt
 * на кожному тіку, а не при рендері екрана. Інакше вони оновлювалися б лише
 * тоді, коли екран перемальовується з якоїсь іншої причини, і час стояв би на
 * місці, поки його витрачають.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import {
  completedSessions,
  elapsedSince,
  totalTrackedSeconds,
  type TimedTask,
} from '@/utils/taskTimer';
import { fontFamily, radius, type } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';

export interface TaskTimerTabProps {
  task: TimedTask & { status: 'active' | 'done' };
  running: boolean;
  /** ISO-мітка старту сесії, що триває. Undefined, якщо таймер стоїть. */
  activeStartedAt?: string;
  onStart: () => void;
  onStop: () => void;
  colors: { text: string; sub: string; border: string; dim: string };
  tr: Translations;
  locale: string;
  /** Годинник ГГ:ХХ:СС для часу, що біжить. */
  fmtClock: (seconds: number) => string;
  /** Людський підпис тривалості для завершених сесій. */
  fmtDur: (seconds: number) => string;
}


export function TaskTimerTab({
  task, running, activeStartedAt, onStart, onStop, colors: c, tr, locale, fmtClock, fmtDur,
}: TaskTimerTabProps) {
  const { t } = useDS();
  // DS v2: «іде» — lime-позначка, старт/стоп — pill action.primary
  // (стоп вирізняє coral-іконка), годинник — display-цифри.
  const RUNNING = t.accent.lime;
  const sessions = completedSessions(task);
  const live = running && !!activeStartedAt;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  return (
    <View>
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Text style={[st.caption, { color: c.sub }]}>
          {live ? tr.currentSession : tr.trackedTime}
        </Text>

        <ElapsedClock
          running={live}
          seconds={now => (live && activeStartedAt ? elapsedSince(activeStartedAt, now) : totalTrackedSeconds(task))}
          format={fmtClock}
          style={[st.bigClock, { color: c.text }]}
        />

        {live && activeStartedAt ? (
          <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 6 }]}>
            {tr.startedAtLabel} {time(activeStartedAt)}
          </Text>
        ) : null}

        {!live && sessions.length > 0 ? (
          <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 6 }]}>
            {tr.sessionsCount}: {sessions.length}
          </Text>
        ) : null}
      </View>

      {/* Кнопку показуємо і завершеному завданню, поки на ньому щось іде:
          інакше таймер, який лишився з часів, коли завдання ще було активним,
          неможливо зупинити з цього екрана. */}
      {(task.status === 'active' || running) && (
        <TouchableOpacity
          onPress={running ? onStop : onStart}
          accessibilityRole="button"
          style={[st.btn, { backgroundColor: t.action.primary }]}>
          <IconSymbol name={running ? 'stop.fill' : 'play.fill'} size={15} color={running ? t.accent.coral : t.text.onAction} />
          <Text style={{ color: t.text.onAction, fontFamily: fontFamily.semibold, fontSize: 15, marginLeft: 8 }}>
            {running ? tr.stopTimer : tr.startTimer}
          </Text>
        </TouchableOpacity>
      )}

      {(live || sessions.length > 0) && (
        <View style={{ marginTop: 18 }}>
          <Text style={[st.label, { color: c.sub }]}>{tr.sessions}</Text>

          {live && activeStartedAt ? (
            <View style={[st.row, { backgroundColor: glassOf(t).surfaceSubtle, borderWidth: 1.5, borderColor: RUNNING }]}>
              <IconSymbol name="timer" size={14} color={c.text} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <ElapsedClock
                  running
                  seconds={now => elapsedSince(activeStartedAt, now)}
                  format={fmtClock}
                  style={[st.rowValue, { color: c.text }]}
                />
                <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                  {day(activeStartedAt)}{' · '}{time(activeStartedAt)}
                </Text>
              </View>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RUNNING }} />
            </View>
          ) : null}

          {/* Найновіша сесія зверху. */}
          {[...sessions].reverse().map(entry => (
            <View key={entry.id} style={[st.row, { backgroundColor: c.dim }]}>
              <IconSymbol name="timer" size={14} color={c.sub} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[st.rowValue, { color: c.text }]}>{fmtDur(entry.duration)}</Text>
                <Text style={[type.caption, type.numeric, { color: c.sub, marginTop: 2 }]}>
                  {day(entry.startedAt)}{' · '}{time(entry.startedAt)}
                  {entry.endedAt ? ` → ${time(entry.endedAt)}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {!live && sessions.length === 0 && task.status === 'active' && (
        <Text style={[type.body, { color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 12 }]}>
          {tr.timerHint}
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  caption:  { fontSize: 12, fontFamily: fontFamily.medium, letterSpacing: 0.6, marginBottom: 10, textTransform: 'uppercase' },
  bigClock: { ...type.display },
  label:    { fontSize: 11, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  btn:      { minHeight: 48, paddingVertical: 13, borderRadius: radius.pill, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  row:      { flexDirection: 'row', alignItems: 'center', borderRadius: radius.nestedCompact, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 },
  rowValue: { fontSize: 14, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
});
