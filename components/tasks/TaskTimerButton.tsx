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

import { ElapsedClock } from '@/components/tasks/ElapsedClock';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';
import { formatClock } from '@/utils/durationFormat';
import { totalSecondsIncludingActive, type TimedTask } from '@/utils/taskTimer';
import { fontFamily, radius } from '@/constants/theme';
import { useDS } from '@/hooks/use-ds';
import { glassOf } from '@/components/shared/dsTheme';

/**
 * DS v2: idle — pill action.primary («Почати»), running — secondary pill
 * (surface.subtle) з coral-стопом і годинником tabular-nums.
 */
export function TaskTimerButton({ task, running, activeStartedAt, onStart, onStop, tr }: {
  task: TimedTask;
  running: boolean;
  /** ISO-мітка старту сесії, що триває, — для годинника. */
  activeStartedAt?: string;
  onStart: () => void;
  onStop: () => void;
  tr: Translations;
}) {
  const { t } = useDS();
  const fg = running ? t.action.secondaryText : t.text.onAction;
  return (
    <TouchableOpacity
      onPress={running ? onStop : onStart}
      accessibilityRole="button"
      accessibilityLabel={running ? tr.stopTimer : tr.startTimerAction}
      style={[st.btn, { backgroundColor: running ? glassOf(t).surfaceSubtle : t.action.primary }]}>
      <IconSymbol name={running ? 'stop.fill' : 'play.fill'} size={14} color={running ? t.accent.coral : fg} />
      {/* Годинник — СУСІД підпису, а не вкладений <Text>: на iOS вкладений
          текст згортається в рядок батька й не перемальовується сам. */}
      <Text style={[st.label, { color: fg }]}>
        {activeStartedAt ? `${tr.stopTimer} · ` : tr.startTimerAction}
      </Text>
      {activeStartedAt ? (
        <ElapsedClock
          running
          seconds={now => totalSecondsIncludingActive(task, activeStartedAt, now)}
          format={formatClock}
          style={[st.clock, { color: fg }]}
        />
      ) : null}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn:        { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  label:      { fontFamily: fontFamily.semibold, marginLeft: 7 },
  clock:      { fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
});
