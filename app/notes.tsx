import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NoteCaptureSheet } from '@/components/notes/NoteCaptureSheet';
import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
import { notesPalette } from '@/components/notes/notesTheme';
import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/store/i18n';

/**
 * Нотатник. Параметри маршруту:
 *  - `?create=1`   — одразу нова нотатка в повному редакторі;
 *  - `?capture=1`  — швидкий запис (міні-аркуш) поверх списку;
 *  - `?open=<id>`  — відкрити наявну нотатку («Розгорнути» зі швидкого запису).
 */
export default function NotesScreen() {
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const router = useRouter();
  const c = notesPalette(isDark);
  const { create, capture, open } = useLocalSearchParams<{ create?: string; capture?: string; open?: string }>();
  // Закритий аркуш не має відкритись знову, поки параметр ще не прибрано.
  const [captureClosed, setCaptureClosed] = useState(false);
  useEffect(() => { if (capture !== '1') setCaptureClosed(false); }, [capture]);
  const captureVisible = capture === '1' && !captureClosed;
  return <View style={{ flex: 1, backgroundColor: c.bg }}>
    <ScreenHeader
      title={tr.notes}
      color={c.text}
      back={{ onPress: () => router.back(), label: tr.back }}
    />
    <NotesWorkspace
      isDark={isDark}
      createRequested={create === '1'}
      onCreateHandled={() => router.setParams({ create: '' })}
      openRequested={typeof open === 'string' && open ? open : undefined}
      onOpenHandled={() => router.setParams({ open: '' })}
    />
    <NoteCaptureSheet
      visible={captureVisible}
      isDark={isDark}
      onClose={() => { setCaptureClosed(true); router.setParams({ capture: '' }); }}
      onExpand={id => router.setParams({ open: id })}
    />
  </View>;
}
