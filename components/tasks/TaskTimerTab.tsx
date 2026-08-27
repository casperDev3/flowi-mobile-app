/**
 * components/tasks/TaskTimerTab.tsx
 *
 * Вкладка таймера в деталі завдання: скільки натікло, кнопка старт/стоп
 * і перелік сесій.
 *
 * Два місця тут показують час, що біжить — велике табло і рядок сесії,
 * яка триває. Обидва йдуть через ElapsedClock: значення обчислюється від
 * startedAt на кожному тіку, а не при рендері екрана. Інакше вони
 * оновлювалися б лише тоді, коли екран перемальовується з якоїсь іншої
 * причини, і час стояв би на місці, поки його витрачають.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import {
  activeSessionSeconds,
  completedSessionCount,
  elapsedSince,
  getActiveTimerEntry,
  totalTrackedSeconds,
  type TimedTask,
} from '@/utils/taskTimer';

export interface TaskTimerTabProps {
  task: TimedTask & { status: 'active' | 'done' };
  running: boolean;
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

const RUNNING = '#6366F1';
const STOP = '#EF4444';

export function TaskTimerTab({
  task, running, onStart, onStop, colors: c, tr, locale, fmtClock, fmtDur,
}: TaskTimerTabProps) {
  const entries = task.timeEntries ?? [];
  const active = getActiveTimerEntry(task);
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <View>
      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
        <Text style={[st.caption, { color: c.sub }]}>
          {running ? tr.currentSession : tr.trackedTime}
        </Text>

        <ElapsedClock
          running={running}
          seconds={() => running ? activeSessionSeconds(task) : totalTrackedSeconds(task)}
          format={fmtClock}
          style={[st.bigClock, { color: c.text }]}
        />

        {running && active ? (
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>
            {tr.startedAtLabel} {time(active.startedAt)}
          </Text>
        ) : null}

        {!running && entries.length > 0 ? (
          <Text style={{ color: c.sub, fontSize: 12, marginTop: 6 }}>
            {tr.sessionsCount}: {completedSessionCount(task)}
          </Text>
        ) : null}
      </View>

      {task.status === 'active' && (
        <TouchableOpacity
          onPress={running ? onStop : onStart}
          accessibilityRole="button"
          style={[st.btn, { backgroundColor: running ? STOP : RUNNING }]}>
          <IconSymbol name={running ? 'stop.fill' : 'play.fill'} size={15} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', marginLeft: 8 }}>
            {running ? tr.stopTimer : tr.startTimer}
          </Text>
        </TouchableOpacity>
      )}

      {entries.length > 0 && (
        <View style={{ marginTop: 18 }}>
          <Text style={[st.label, { color: c.sub }]}>{tr.sessions}</Text>
          {/* Найновіша сесія зверху. */}
          {[...entries].reverse().map(entry => {
            const live = !entry.endedAt;
            return (
              <View
                key={entry.id}
                style={[st.row, {
                  borderColor: live ? RUNNING + '40' : c.border,
                  backgroundColor: live ? RUNNING + '08' : c.dim,
                }]}>
                <IconSymbol name="timer" size={14} color={live ? RUNNING : c.sub} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  {live ? (
                    <ElapsedClock
                      running
                      seconds={() => elapsedSince(entry.startedAt)}
                      format={fmtClock}
                      style={[st.rowValue, { color: c.text }]}
                    />
                  ) : (
                    <Text style={[st.rowValue, { color: c.text }]}>{fmtDur(entry.duration)}</Text>
                  )}
                  <Text style={{ color: c.sub, fontSize: 11, marginTop: 2 }}>
                    {new Date(entry.startedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    {' · '}
                    {time(entry.startedAt)}
                    {entry.endedAt ? ` → ${time(entry.endedAt)}` : ''}
                  </Text>
                </View>
                {live && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RUNNING }} />}
              </View>
            );
          })}
        </View>
      )}

      {entries.length === 0 && task.status === 'active' && (
        <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', marginTop: 12 }}>
          {tr.timerHint}
        </Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  caption:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  bigClock: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  label:    { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 14 },
  btn:      { paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  row:      { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 7 },
  rowValue: { fontSize: 13, fontWeight: '600' },
});
