import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { PriorityBadge } from '@/components/tasks/PriorityBadge';
import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';
import type { Translations } from '@/store/translations';
import { Task, isOverdue, normalizePriority } from '@/utils/taskUtils';

interface Props {
  tasks: Task[];
  isDark: boolean;
  c: { border: string; text: string; sub: string };
  tr: Translations;
  onToggle: (id: string) => void;
  /** Тап по рядку (не по чекбоксу) — відкрити деталі задачі. */
  onOpen?: (id: string) => void;
}

// ─── Per-task row component (manages local checked state for animation) ────────

interface RowProps {
  task: Task;
  isDark: boolean;
  c: { border: string; text: string; sub: string };
  onToggle: (id: string) => void;
  onOpen?: (id: string) => void;
}

function TodayTaskItem({ task, isDark, c, onToggle, onOpen }: RowProps) {
  const { reduced } = useMotion();

  const done = task.status === 'done';

  // Локальна відмітка веде анімацію, поки зміна не долетіла зі сховища.
  // Завершене завдання більше не зникає зі списку — воно лишається в дні
  // закресленим, тож стан мусить іти від САМОГО завдання, а не бути
  // одноразовим «поставили галочку й забули».
  const [localChecked, setLocalChecked] = useState(done);
  useEffect(() => { setLocalChecked(done); }, [done]);

  const titleOpacity = useSharedValue(done ? 0.45 : 1);
  const titleStyle   = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  const handleToggle = () => {
    const next = !localChecked;
    setLocalChecked(next);
    titleOpacity.value = withTiming(next ? 0.45 : 1, {
      duration: reduced ? 0 : Motion.duration.normal,
    });
    onToggle(task.id);
  };

  return (
    <PressableScale
      onPress={() => (onOpen ? onOpen(task.id) : handleToggle())}
      style={{ marginBottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={task.title}>
      <BlurView
        intensity={isDark ? 18 : 36}
        tint={isDark ? 'dark' : 'light'}
        style={[s.row, { borderColor: c.border }]}>
        <AnimatedCheck
          checked={localChecked}
          size={20}
          color="#10B981"
          borderColor={c.sub + '60'}
          radius={10}  /* circle */
          onPress={handleToggle}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}
          accessibilityState={{ checked: localChecked }}
        />
        <Animated.Text
          style={[
            s.title,
            { color: c.text },
            // Закреслення — ознака зробленого, яку видно без читання. Відмітку
            // можна зняти тим самим натисканням: завдання лишається в дні саме
            // для того, щоб помилкове «готово» можна було відкотити.
            done && { textDecorationLine: 'line-through' as const },
            titleStyle,
          ]}
          numberOfLines={1}>
          {task.title}
        </Animated.Text>
        {/* Пріоритет — бейдж P0–P5 біля назви (замість кольорової смужки зліва). */}
        <PriorityBadge level={normalizePriority(task)} />
        {!done && isOverdue(task) && (
          <View style={s.overdueBadge}>
            <Text style={s.overdueText}>!</Text>
          </View>
        )}
      </BlurView>
    </PressableScale>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function TodayTaskRow({ tasks, isDark, c, tr: _tr, onToggle, onOpen }: Props) {
  const motion = useMotion();

  // Компонент НІЧОГО не відбирає й не сортує — малює рівно те, що дали.
  //
  // Раніше тут стояв власний фільтр «дедлайн сьогодні або прострочено» плюс
  // сортування за пріоритетом і зріз до п'яти — копія правил екрана. Копія
  // мовчки розійшлася з оригіналом, щойно екран навчився показувати завдання
  // «У процесі» незалежно від дедлайну: група приходила сюди заповненою, а
  // фільтр викидав її вміст, і на екрані лишався заголовок ні над чим.
  // Відбір живе в utils/todayGroups.ts — в одному місці.
  if (!tasks.length) return null;
  const relevant = tasks;

  return (
    <View style={{ marginBottom: 4 }}>
      {relevant.map((task, i) => (
        <Animated.View
          key={task.id}
          entering={motion.entering(FadeInDown.duration(200).delay(Math.min(i, 10) * 40))}>
          <TodayTaskItem
            task={task}
            isDark={isDark}
            c={c}
            onToggle={onToggle}
            onOpen={onOpen}
          />
        </Animated.View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 12,
    gap: 10,
    overflow: 'hidden',
  },
  title: { flex: 1, fontSize: 14, fontWeight: '500' },
  overdueBadge: {
    backgroundColor: '#EF444420',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  overdueText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
});
