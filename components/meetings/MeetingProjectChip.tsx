/**
 * components/meetings/MeetingProjectChip.tsx — проєкт зустрічі на картці.
 *
 * Маленький чип: крапка 8pt кольором проєкту + назва (обрізається). Без
 * проєкту чи з висячим id (проєкт видалили) — нічого не малює (CONTRACT §C.1).
 * Один компонент для картки на екрані зустрічей, рядків «Зустрічі» на екрані
 * Завдань і перегляду зустрічі — щоб вигляд не розійшовся.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface MeetingChipProject {
  id: string;
  name: string;
  color: string;
}

export function MeetingProjectChip({
  project, textColor, size = 'sm', maxWidth = 140,
}: {
  project: MeetingChipProject | null | undefined;
  textColor: string;
  size?: 'sm' | 'md';
  maxWidth?: number;
}) {
  if (!project) return null;
  const md = size === 'md';
  return (
    <View
      style={[st.chip, { backgroundColor: project.color + '1F', borderColor: project.color + '40', maxWidth }, md && st.chipMd]}
      accessibilityLabel={project.name}>
      <View style={[st.dot, { backgroundColor: project.color }]} />
      <Text numberOfLines={1} style={{ color: textColor, fontSize: md ? 12 : 10, fontWeight: '600', flexShrink: 1 }}>
        {project.name}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  chip:   { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 7, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  chipMd: { paddingHorizontal: 8, paddingVertical: 4, gap: 6, borderRadius: 9 },
  dot:    { width: 8, height: 8, borderRadius: 4 },
});
