import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NoteCaptureSheet } from '@/components/notes/NoteCaptureSheet';
import { NotesWorkspace } from '@/components/notes/NotesWorkspace';
// Omni (DS v2.2): AppHeader — це ScreenHeader (інсет, «Назад») + дзвіник і аватар.
import { AppHeader } from '@/components/shared/AppHeader';
import { useDS } from '@/hooks/use-ds';
import { useI18n } from '@/store/i18n';
import { GlassScreen } from '@/components/ds';

/**
 * Нотатник. Параметри маршруту:
 *  - `?create=1`   — одразу нова нотатка в повному редакторі;
 *  - `?capture=1`  — швидкий запис (міні-аркуш) поверх списку;
 *  - `?open=<id>`  — відкрити наявну нотатку («Розгорнути» зі швидкого запису,
 *                    «Нотатки» в деталі задачі/зустрічі);
 *  - `?note=<id>`  — відкрита нотатка зони деталей (Layout System, дзеркалиться).
 */
export default function NotesScreen() {
  const { t, isDark } = useDS();
  const { tr } = useI18n();
  const router = useRouter();
  const { create, capture, open } = useLocalSearchParams<{ create?: string; capture?: string; open?: string }>();
  // Закритий аркуш не має відкритись знову, поки параметр ще не прибрано.
  const [captureClosed, setCaptureClosed] = useState(false);
  useEffect(() => { if (capture !== '1') setCaptureClosed(false); }, [capture]);
  const captureVisible = capture === '1' && !captureClosed;
  // DS v2.1: фон — mesh (скло нотаток заломлює плями), акцент — amber (notes).
  const color = t.text.primary;
  return <GlassScreen module="notes">
    <AppHeader
      title={tr.notes}
      back={{ onPress: () => router.back(), label: tr.back, color }}
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
  </GlassScreen>;
}
