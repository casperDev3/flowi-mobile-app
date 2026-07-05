import { BlurView } from 'expo-blur';
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AnimatedCheck } from '@/components/shared/AnimatedCheck';
import { PressableScale } from '@/components/shared/PressableScale';
import { Motion } from '@/constants/motion';
import { useMotion } from '@/hooks/use-motion';
import { isOverdue, PRIORITY_COLORS } from '@/utils/taskUtils';
import type { Task } from '@/utils/taskUtils';
import type { Project } from '../../app/projects';

const AnimatedText = Animated.createAnimatedComponent(Text);

function deadlineLabel(iso: string, todayLabel: string, yesterdayLabel: string, tomorrowLabel: string, locale: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return todayLabel;
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000);
  if (diff === 1) return tomorrowLabel;
  if (diff > 1 && diff <= 7) return `+${diff} ${locale === 'uk-UA' ? 'дн' : 'd'}`;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

interface CompactCardProps {
  task: Task;
  onPress: () => void;
  onToggle: () => void;
  c: any;
  isDark: boolean;
  projects: Project[];
  todayLabel: string;
  yesterdayLabel: string;
  tomorrowLabel: string;
  locale: string;
  styles: { compactCard: any; subCheck: any; dot: any };
}

export function CompactCard({
  task, onPress, onToggle, c, isDark, projects,
  todayLabel, yesterdayLabel, tomorrowLabel, locale, styles: s,
}: CompactCardProps) {
  const { reduced } = useMotion();
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  const isDone = task.status === 'done';

  /* Animate text opacity when done state changes */
  const titleOpacity = useSharedValue(isDone ? 0.45 : 1);
  useEffect(() => {
    titleOpacity.value = withTiming(isDone ? 0.45 : 1, {
      duration: reduced ? 0 : Motion.duration.normal,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  const titleAnimStyle = useAnimatedStyle(() => ({ opacity: titleOpacity.value }));

  return (
    <PressableScale onPress={onPress}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={s.compactCard}>
        <AnimatedCheck
          checked={isDone}
          size={s.subCheck?.width ?? 18}
          radius={s.subCheck?.borderRadius ?? 5}
          color="#10B981"
          borderColor={c.border}
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}
          accessibilityState={{ checked: isDone }}
        />
        <AnimatedText
          style={[{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginHorizontal: 10, textDecorationLine: isDone ? 'line-through' : 'none' } as any, titleAnimStyle]}
          numberOfLines={1}>
          {task.title}
        </AnimatedText>
        {task.deadline && (
          <Text style={{ color: overdue ? '#EF4444' : c.sub, fontSize: 10, fontWeight: '600', marginRight: 8 }}>
            {deadlineLabel(task.deadline, todayLabel, yesterdayLabel, tomorrowLabel, locale)}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={[s.dot, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
          {proj && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: proj.color }} />}
        </View>
      </BlurView>
    </PressableScale>
  );
}
