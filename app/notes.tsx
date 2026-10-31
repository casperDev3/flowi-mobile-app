import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useDS } from '@/hooks/use-ds';
import { useI18n } from '@/store/i18n';
import { GlassScreen } from '@/components/ds';

export default function NotesScreen() {
  const { t, isDark } = useDS();
  const { tr } = useI18n();
  const router = useRouter();
  // `?create=1` — одразу нова нотатка (iOS-віджет «Зробити нотатку»).
  const { create } = useLocalSearchParams<{ create?: string }>();
  // DS v2.1: фон — mesh (скло нотаток заломлює плями), акцент — amber (notes).
  const color = t.text.primary;
  return <GlassScreen module="notes">
    <ScreenHeader
      title={tr.notes}
      color={color}
      back={{ onPress: () => router.back(), label: tr.back }}
    />
    <NotesWorkspace
      isDark={isDark}
      createRequested={create === '1'}
      onCreateHandled={() => router.setParams({ create: '' })}
    />
  </GlassScreen>;
}
