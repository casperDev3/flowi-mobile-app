import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';

export default function NotesScreen() {
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const router = useRouter();
  const color = isDark ? '#F4F1FA' : '#241C32';
  return <View style={{ flex: 1, backgroundColor: isDark ? '#15131D' : '#FAF8FF' }}>
    <ScreenHeader
      title={tr.notes}
      color={color}
      back={{ onPress: () => router.back(), label: tr.back }}
    />
    <NotesWorkspace isDark={isDark} />
  </View>;
}
