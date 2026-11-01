/**
 * hooks/use-soft-safe-area-insets.ts
 *
 * Safe-area інсети, що не кидають без SafeAreaInsetsProvider (тести шару
 * вкладок і екранів, де react-native-safe-area-context замокано лише
 * `useSafeAreaInsets`) — тоді нулі, як на пристрої без вирізу. Окремий модуль
 * без залежностей від сховища: його імпортує app/(tabs)/_layout.tsx.
 */
import { useContext } from 'react';
import * as SafeArea from 'react-native-safe-area-context';

type Insets = { top: number; right: number; bottom: number; left: number };
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Safe-area інсети, що не кидають без SafeAreaInsetsProvider (тести шару
 * вкладок і екранів, де react-native-safe-area-context замокано лише
 * `useSafeAreaInsets`). Вибір — ОДИН раз на рівні модуля, тож порядок хуків
 * між рендерами не змінюється (той самий прийом, що useRoutePathname у
 * ScreenHeader).
 */
export const useSoftSafeAreaInsets: () => Insets = SafeArea.SafeAreaInsetsContext
  ? () => useContext(SafeArea.SafeAreaInsetsContext) ?? NO_INSETS
  : typeof SafeArea.useSafeAreaInsets === 'function'
    ? () => SafeArea.useSafeAreaInsets() ?? NO_INSETS
    : () => NO_INSETS;
