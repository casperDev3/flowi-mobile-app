/**
 * components/menu/theme.ts — палітра екрана «Меню».
 *
 * DS v2 («м'який мінімалізм»): тонка обгортка над семантичними токенами
 * (constants/theme.ts). Спільний canvas/card з рештою застосунку; акцент
 * розділу — status.info (як у Фінансів). Вибрані сегменти/дні — action.primary
 * з text.onAction (поля `primary` / `onPrimary`).
 */
import { useMemo } from 'react';

import { theme } from '@/constants/theme';
import { useDSTheme } from '@/components/shared/useDSTheme';
import { glassOf } from '@/components/shared/dsTheme';

export const MENU_ACCENT = theme.light.status.info;
export const MENU_OK = theme.light.status.success;
export const MENU_WARN = theme.light.status.warning;
export const MENU_ERR = theme.light.status.danger;

export interface MenuColors {
  isDark: boolean;
  bg1: string;
  bg2: string;
  card: string;
  border: string;
  text: string;
  sub: string;
  /** Лише декоративне/disabled (text.muted) — НЕ для підписів. */
  faint: string;
  /** Фон сегментів/неактивних контролів. */
  dim: string;
  /** Фон підсвіченої клітинки (сьогодні) і нейтральних бейджів. */
  chip: string;
  /** Фон аркушів. */
  sheet: string;
  accent: string;
  /** Тло вибраного сегмента / дня / головної дії (action.primary). */
  primary: string;
  /** Текст на `primary` (text.onAction). */
  onPrimary: string;
}

export function makeMenuColors(isDark: boolean): MenuColors {
  const t = isDark ? theme.dark : theme.light;
  return {
    isDark,
    bg1: t.bg.canvas,
    bg2: t.bg.canvas,
    // DS v2.1: скло над mesh; акцент «Меню» — success (glass.moduleAccent.menu).
    card: glassOf(t).surface,
    border: t.border.hairline,
    text: t.text.primary,
    sub: t.text.secondary,
    faint: t.text.muted,
    dim: glassOf(t).surfaceSubtle,
    chip: glassOf(t).surfaceSubtle,
    sheet: glassOf(t).sheet,
    accent: glassOf(t).accent.success.ink,
    primary: t.action.primary,
    onPrimary: t.text.onAction,
  };
}

export function useMenuColors(): MenuColors {
  const { isDark, rt } = useDSTheme();
  // rt — перерахувати скло при перемиканні «Зменшити прозорість».
  return useMemo(() => { void rt; return makeMenuColors(isDark); }, [isDark, rt]);
}
