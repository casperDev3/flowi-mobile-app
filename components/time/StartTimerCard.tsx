import { Atlas } from '@/constants/atlas';
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
import type { Translations } from '@/store/translations';

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
    <View style={[s.card, { borderColor: c.border, backgroundColor: c.card }]}>
      <View style={s.head}>
        <IconSymbol name="play.fill" size={13} color={c.indigo} />
        <Text style={[s.title, { color: c.text }]} accessibilityRole="header">{tr.timeStartTimerTitle}</Text>
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr.timeStartTimerSearch}
        placeholderTextColor={c.sub}
        accessibilityLabel={tr.timeStartTimerSearch}
        autoCorrect={false}
        returnKeyType="search"
        style={[s.input, { backgroundColor: c.dim, color: c.text }]}
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
              <View style={[s.play, { backgroundColor: c.indigo + '1F' }]}>
                <IconSymbol name="play.fill" size={11} color={c.indigo} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{task.title}</Text>
                {project ? (
                  <View style={s.projectLine}>
                    <View style={[s.dot, { backgroundColor: project.color ?? c.indigo }]} />
                    <Text numberOfLines={1} style={{ color: c.sub, fontSize: 11, flex: 1 }}>{project.name}</Text>
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
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: Atlas.radius.large, borderWidth: 1, padding: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: Atlas.type.headingWeight },
  input: { borderRadius: Atlas.radius.medium, paddingHorizontal: 12, minHeight: 44, fontSize: 14, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 4 },
  play: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  projectLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  hint: { fontSize: 11, marginTop: 8 },
});
