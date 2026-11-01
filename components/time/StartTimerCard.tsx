/**
 * components/time/StartTimerCard.tsx — «Почати таймер» у правій панелі
 * широкого екрана «Час».
 *
 * НЕ вільний секундомір: правило сторінки лишається — таймер стартує із
 * задачі або зустрічі (див. шапку app/(tabs)/time.tsx). Тут — мої незавершені
 * задачі з пошуком, а старт іде через той самий стор, що кнопка ▶ на картці
 * задачі (`startTaskTimer`): колонка «У процесі», подія в історії, одна сесія
 * на всіх пристроях.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { TimeColors } from '@/components/time/TimePalette';
import { timerCandidates, type TimerCandidateTask } from '@/components/time/timerCandidates';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, space, touchTarget, type as dsType } from '@/constants/theme';
import type { Translations } from '@/store/translations';
import { BentoCard } from '@/components/ds';

/** Скільки задач видно без пошуку: панель — підказка, а не другий список задач. */
const PREVIEW = 5;

export interface StartTimerCardProps {
  c: TimeColors;
  tr: Translations;
  /** Уже відфільтровані до МОЇХ (isMyTask). */
  tasks: readonly TimerCandidateTask[];
  /** id задач, на яких таймер уже йде. */
  running: ReadonlySet<string>;
  projectById: ReadonlyMap<string, { name: string; color?: string }>;
  onStart: (task: TimerCandidateTask) => void;
}

export function StartTimerCard({ c, tr, tasks, running, projectById, onStart }: StartTimerCardProps) {
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => timerCandidates(tasks, running, query), [tasks, running, query]);
  const shown = candidates.slice(0, PREVIEW);
  const more = candidates.length - shown.length;

  return (
    // Omni: bento-картка, шапка — icon-chip акценту «Часу» (amber) + назва.
    <BentoCard compact icon="play.fill" accent="amber" title={tr.timeStartTimerTitle}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr.timeStartTimerSearch}
        placeholderTextColor={c.muted}
        accessibilityLabel={tr.timeStartTimerSearch}
        autoCorrect={false}
        returnKeyType="search"
        style={[s.input, { backgroundColor: c.t.surface.subtle, color: c.text }]}
      />
      {shown.length > 0 ? (
        shown.map(task => {
          const project = task.projectId ? projectById.get(task.projectId) : undefined;
          return (
            <TouchableOpacity
              key={task.id}
              onPress={() => onStart(task)}
              accessibilityRole="button"
              accessibilityLabel={tr.timeStartTimerA11y.replace('{task}', task.title)}
              style={s.row}>
              <View style={[s.play, { backgroundColor: c.t.action.primary }]}>
                <IconSymbol name="play.fill" size={12} color={c.t.text.onAction} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 14, fontFamily: fontFamily.medium }}>{task.title}</Text>
                {project ? (
                  <View style={s.projectLine}>
                    <View style={[s.dot, { backgroundColor: project.color ?? c.indigo }]} />
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 12, fontFamily: fontFamily.regular, flex: 1 }}>{project.name}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })
      ) : (
        <Text style={[s.hint, { color: c.sub }]}>
          {query.trim() ? tr.timeStartTimerNothingFound : tr.timeStartTimerNoTasks}
        </Text>
      )}
      {more > 0 ? (
        <Text style={[s.hint, { color: c.sub }]}>{tr.timeStartTimerMore.replace('{count}', String(more))}</Text>
      ) : null}
      <Text style={[s.hint, { color: c.sub }]}>{tr.timeStartTimerMeetingHint}</Text>
    </BentoCard>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.cardCompact, padding: space.cardPaddingCompact },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { ...dsType.h2 },
  input: { borderRadius: radius.pill, paddingHorizontal: space[4], minHeight: touchTarget, fontSize: 14, fontFamily: fontFamily.regular, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 4 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  projectLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  hint: { ...dsType.caption, marginTop: 8 },
});
