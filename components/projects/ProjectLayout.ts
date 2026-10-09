/**
 * components/projects/ProjectLayout.ts — ширина вмісту розділів проєкту на
 * планшеті (рішення 6).
 *
 * Розділи проєкту — два різні типи сторінок:
 *   'reading' — форми й стрічки (налаштування, активність, бюджет): колонка
 *               Layout.readingMaxWidth (720), як і було через useContentWidth;
 *   'wide'    — дашборди й сітки карток (огляд, спринти, час): стеля
 *               Layout.wideMaxWidth (1200), щоб плитки й картки ставали поруч,
 *               а не тягнулись смугою на 720pt посеред порожнього екрана.
 *
 * Поля 20pt — ті самі, що екрани проєкту мали вручну; на телефоні стиль
 * еквівалентний старому (стеля ширини там недосяжна).
 */
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { Layout } from '@/constants/tokens';
import { useResponsive } from '@/hooks/use-responsive';

export type ProjectContentVariant = 'reading' | 'wide';

export function projectContentStyle(variant: ProjectContentVariant, isWide: boolean): ViewStyle {
  if (!isWide) return { paddingHorizontal: 20 };
  return {
    width: '100%',
    alignSelf: 'center',
    maxWidth: variant === 'wide' ? Layout.wideMaxWidth : Layout.readingMaxWidth,
    paddingHorizontal: 20,
  };
}

export function useProjectContentStyle(variant: ProjectContentVariant): ViewStyle {
  const { isWide } = useResponsive();
  return useMemo(() => projectContentStyle(variant, isWide), [variant, isWide]);
}
