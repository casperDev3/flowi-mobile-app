/**
 * components/shared/useDSTheme.ts — токени DS v2 через `@/hooks/use-color-scheme`.
 *
 * Те саме джерело схеми, що й у `useDS()` (store/theme-context: вибір
 * користувача має пріоритет), але через хук `useColorScheme`, який тести
 * підміняють `jest.mock('@/hooks/use-color-scheme')`. Пряме `useDS()` тягнуло
 * б у такі тести theme-context → AsyncStorage і валило б їх на імпорті.
 * Без хука (isDark пропом) — `dsTheme` / `dsGlass` / `glassFill` з ./dsTheme.
 *
 * DS v2.1: також повертає `g` (токени скла) і `rt` («Зменшити прозорість»).
 */
import type { DSTheme, GlassTokens } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useReduceTransparency } from '@/hooks/use-reduce-transparency';

import { dsGlass, dsTheme } from './dsTheme';

export { dsTheme, dsGlass };
export { glassFill, accentWash, glassShadow } from './dsTheme';

export function useDSTheme(): { t: DSTheme; isDark: boolean; g: GlassTokens; rt: boolean } {
  const isDark = useColorScheme() === 'dark';
  const rt = useReduceTransparency();
  return { t: dsTheme(isDark), isDark, g: dsGlass(isDark), rt };
}
