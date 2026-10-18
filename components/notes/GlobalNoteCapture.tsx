/**
 * components/notes/GlobalNoteCapture.tsx — єдиний аркуш швидкого запису на
 * весь застосунок (монтується в корені, app/_layout.tsx, усередині AuthGate).
 *
 * Показує `NoteCaptureSheet` поверх поточного екрана, коли хтось попросив
 * (store/note-capture.ts): deep link `notes?capture=1` / `?create=1` віджетів
 * (app/+native-intent.tsx) і швидка дія іконки «Нова нотатка»
 * (store/quick-actions.ts). Тут же виставляються самі швидкі дії іконки —
 * мовою застосунку і лише для автентифікованого користувача.
 *
 * Модуль «Нотатки» вимкнено → аркуша немає, ведемо на `/notes`, де стоїть
 * звичайна заглушка вимкненого модуля (ModuleGate) з переходом у налаштування.
 */
import React, { useEffect, useState } from 'react';

import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import {
  NOTE_CAPTURE_STALE_MS,
  finishNoteCapture,
  pendingNoteCapture,
  subscribeNoteCapture,
  type NoteCaptureRequest,
} from '@/store/note-capture';
import { setNoteQuickAction, subscribeQuickActions } from '@/store/quick-actions';
import { isModuleEnabled, useUiModules } from '@/store/ui-preferences';

import { navigateTo } from './noteActions';
import { NoteCaptureSheet } from './NoteCaptureSheet';

export function GlobalNoteCapture() {
  const { tr } = useI18n();
  const { status } = useAuth();
  const { disabledModules, ready: modulesReady } = useUiModules();
  const notesEnabled = isModuleEnabled(disabledModules, 'notes');
  const [request, setRequest] = useState<NoteCaptureRequest | null>(() => pendingNoteCapture());

  useEffect(() => subscribeNoteCapture(setRequest), []);
  useEffect(() => subscribeQuickActions(), []);

  // Дія іконки — лише коли є куди зберігати; назва — мовою застосунку.
  const authed = status === 'authed';
  const quickTitle = authed && notesEnabled ? tr.notesCaptureTitle : null;
  useEffect(() => { void setNoteQuickAction(quickTitle); }, [quickTitle]);

  // Запит, що провисів (прийшов до входу в акаунт), мовчки відкидаємо;
  // вимкнений модуль — ведемо на заглушку замість аркуша.
  const live = !!request && authed && modulesReady;
  useEffect(() => {
    if (!request || !live) return;
    if (Date.now() - request.at > NOTE_CAPTURE_STALE_MS) { finishNoteCapture(request.seq); return; }
    if (!notesEnabled) {
      finishNoteCapture(request.seq);
      navigateTo('/notes');
    }
  }, [request, live, notesEnabled]);

  const visible = live && notesEnabled && !!request && Date.now() - request.at <= NOTE_CAPTURE_STALE_MS;
  const seq = request?.seq;

  return (
    <NoteCaptureSheet
      visible={visible}
      initialLinks={request?.links}
      onClose={() => finishNoteCapture(seq)}
    />
  );
}
