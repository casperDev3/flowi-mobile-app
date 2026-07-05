import { BlurView } from 'expo-blur';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';
import type { Translations } from '@/store/translations';
import { isSameDay } from '@/utils/dateUtils';
import { PRIORITY_COLORS, Task, isOverdue } from '@/utils/taskUtils';

interface Props {
  tasks: Task[];
  isDark: boolean;
  c: { border: string; text: string; sub: string };
  tr: Translations;
  onToggle: (id: string) => void;
}

// ─── Per-task row component (manages local checked state for animation) ────────

interface RowProps {
  task: Task;
  isDark: boolean;
  c: { border: string; text: string; sub: string };
  onToggle: (id: string) => void;
}

function TodayTaskItem({ task, isDark, c, onToggle }: RowProps) {
  const { reduced } = useMotion();

  // Local checked state drives the animation; the task disappears from
  // the filtered list after onToggle propagates, so this is transient.
  const [localChecked, setLocalChecked] = useState(false);

  const titleOpacity = useSharedValue(1);
  const titleStyle   = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  const handlePress = () => {
    setLocalChecked(true);
    titleOpacity.value = withTiming(0.45, {
      duration: reduced ? 0 : Motion.duration.normal,
    });
    onToggle(task.id);
  };

  return (
    <PressableScale
      onPress={handlePress}
      style={{ marginBottom: 6 }}
      accessibilityRole="checkbox"
      accessibilityLabel={task.title}
      accessibilityState={{ checked: localChecked }}>
      <BlurView
        intensity={isDark ? 18 : 36}
        tint={isDark ? 'dark' : 'light'}
        style={[s.row, { borderColor: c.border }]}>
        <View style={[s.priorityBar, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
        <AnimatedCheck
          checked={localChecked}
          size={20}
          color="#10B981"
          borderColor={c.sub + '60'}
          radius={10}  /* circle */
        />
        <Animated.Text
          style={[s.title, { color: c.text }, titleStyle]}
          numberOfLines={1}>
          {task.title}
        </Animated.Text>
        {isOverdue(task) && (
          <View style={s.overdueBadge}>
            <Text style={s.overdueText}>!</Text>
          </View>
        )}
      </BlurView>
    </PressableScale>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function TodayTaskRow({ tasks, isDark, c, tr: _tr, onToggle }: Props) {
  const today = new Date();
  const motion = useMotion();

  const relevant = tasks
    .filter(t =>
      t.status === 'active' &&
      ((t.deadline && isSameDay(new Date(t.deadline), today)) || isOverdue(t)),
    )
    .sort((a, b) => {
      const p: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (p[a.priority] ?? 1) - (p[b.priority] ?? 1);
    })
    .slice(0, 5);

  if (!relevant.length) return null;

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
  priorityBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
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
