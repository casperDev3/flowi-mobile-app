import { BlurView } from 'expo-blur';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
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

export function TodayTaskRow({ tasks, isDark, c, tr, onToggle }: Props) {
  const today = new Date();

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
      {relevant.map(task => (
        <TouchableOpacity
          key={task.id}
          onPress={() => onToggle(task.id)}
          activeOpacity={0.8}
          style={{ marginBottom: 6 }}
          accessibilityRole="checkbox"
          accessibilityLabel={task.title}>
          <BlurView
            intensity={isDark ? 18 : 36}
            tint={isDark ? 'dark' : 'light'}
            style={[s.row, { borderColor: c.border }]}>
            <View style={[s.priorityBar, { backgroundColor: PRIORITY_COLORS[task.priority] }]} />
            <IconSymbol
              name="circle"
              size={20}
              color={c.sub}
            />
            <Text style={[s.title, { color: c.text }]} numberOfLines={1}>{task.title}</Text>
            {isOverdue(task) && (
              <View style={s.overdueBadge}>
                <Text style={s.overdueText}>!</Text>
              </View>
            )}
          </BlurView>
        </TouchableOpacity>
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
