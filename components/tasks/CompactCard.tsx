import { BlurView } from 'expo-blur';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { isOverdue, PRIORITY_COLORS } from '@/utils/taskUtils';
import type { Task } from '@/utils/taskUtils';
import type { Project } from '../../app/projects';

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
  const overdue = isOverdue(task);
  const proj = task.projectId ? projects.find(p => p.id === task.projectId) : null;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}>
      <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={s.compactCard}>
        <TouchableOpacity
          onPress={e => { e.stopPropagation(); onToggle(); }}
          style={[s.subCheck, { borderColor: task.status === 'done' ? '#10B981' : c.border, backgroundColor: task.status === 'done' ? '#10B981' : 'transparent' }]}>
          {task.status === 'done' && <IconSymbol name="checkmark" size={10} color="#fff" />}
        </TouchableOpacity>
        <Text
          style={{ color: c.text, fontSize: 13, fontWeight: '600', flex: 1, marginHorizontal: 10, opacity: task.status === 'done' ? 0.45 : 1, textDecorationLine: task.status === 'done' ? 'line-through' : 'none' }}
          numberOfLines={1}>
          {task.title}
        </Text>
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
    </TouchableOpacity>
  );
}
