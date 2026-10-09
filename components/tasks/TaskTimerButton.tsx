/**
 * components/tasks/TaskTimerButton.tsx — кнопка «Старт / Стоп таймера» картки.
 *
 * Стоїть у липкій шапці картки (TaskDetailHeader → `timerSlot`), під назвою,
 * тож видна на будь-якій вкладці: раніше вона жила лише вгорі «Основного», і на
 * «Деталях» чи «Команді» запустити облік часу було нічим. Одна на особисту й
 * проєктну картку — раніше це були дві копії розмітки.
 *
 * Поки таймер іде, поруч із «Стоп» цокає загальний час задачі (завершені сесії
 * + поточна) — через ElapsedClock, щоб годинник ішов сам, а не лише тоді, коли
 * екран перемальовується з іншої причини.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { Atlas } from '@/constants/atlas';
import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { formatClock } from '@/utils/durationFormat';
import { totalSecondsIncludingActive, type TimedTask } from '@/utils/taskTimer';

const RUNNING = '#6366F1';

export function TaskTimerButton({ task, running, activeStartedAt, onStart, onStop, tr }: {
  task: TimedTask;
  running: boolean;
  /** ISO-мітка старту сесії, що триває, — для годинника. */
  activeStartedAt?: string;
  onStart: () => void;
  onStop: () => void;
  tr: Translations;
}) {
  return (
    <TouchableOpacity
      onPress={running ? onStop : onStart}
      accessibilityRole="button"
      accessibilityLabel={running ? tr.stopTimer : tr.startTimerAction}
      style={[st.btn, running ? st.btnRunning : st.btnIdle]}>
      <IconSymbol name={running ? 'stop.fill' : 'play.fill'} size={14} color={running ? RUNNING : '#fff'} />
      {/* Годинник — СУСІД підпису, а не вкладений <Text>: на iOS вкладений
          текст згортається в рядок батька й не перемальовується сам. */}
      <Text style={[st.label, { color: running ? RUNNING : '#fff' }]}>
        {activeStartedAt ? `${tr.stopTimer} · ` : tr.startTimerAction}
      </Text>
      {activeStartedAt ? (
        <ElapsedClock
          running
          seconds={now => totalSecondsIncludingActive(task, activeStartedAt, now)}
          format={formatClock}
          style={st.clock}
        />
      ) : null}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn:        { minHeight: 44, borderRadius: Atlas.radius.medium, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnIdle:    { backgroundColor: RUNNING + 'EE' },
  btnRunning: { backgroundColor: RUNNING + '20', borderWidth: 1, borderColor: RUNNING + '50' },
  label:      { fontWeight: '700', marginLeft: 7 },
  clock:      { color: RUNNING, fontWeight: '700' },
});
