/**
 * components/ds/AccentContext.tsx — акцент модуля для примітивів DS v2.1.
 *
 * Екран обгортається в <GlassScreen module="finance"> (або <AccentProvider>),
 * і всі примітиви всередині (IconChip, ProgressBar, вибраний Chip, Card tint,
 * SectionHeader) за замовчуванням беруть акцент модуля — один на екран,
 * тож «кольорово, але не веселка». Явний проп `accent` перекриває контекст.
 */
import React, { createContext, useContext } from 'react';

import { moduleAccent, type GlassAccent, type ModuleKey } from '@/constants/theme';

const Ctx = createContext<GlassAccent | null>(null);

export function AccentProvider({
  module,
  accent,
  children,
}: {
  module?: ModuleKey;
  accent?: GlassAccent;
  children: React.ReactNode;
}) {
  const value = accent ?? (module ? moduleAccent[module] : null);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Акцент найближчого провайдера або null (тоді — нейтральні дефолти). */
export function useModuleAccent(): GlassAccent | null {
  return useContext(Ctx);
}

/** Явний акцент → акцент модуля → fallback. */
export function useResolvedAccent(explicit?: GlassAccent | null, fallback: GlassAccent = 'lavender'): GlassAccent {
  const ctx = useContext(Ctx);
  return explicit ?? ctx ?? fallback;
}
