/**
 * hooks/use-content-width.ts
 *
 * Обмеження ширини читабельної колонки.
 *
 * На планшеті екран, розрахований на телефон, розтягується на всю ширину:
 * рядок тексту стає вдвічі довшим за комфортний, а поля вводу й кнопки
 * розповзаються так, що око не встигає повернутися до початку рядка.
 *
 * Тому вміст лишається колонкою сталої ширини, поставленою по центру.
 * 720pt — приблизно 90 символів у нашому кеглі; далі рядок читається гірше
 * незалежно від того, скільки місця є.
 *
 * На телефоні хук не робить нічого: там ширина й так менша за стелю.
 */
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { useResponsive } from '@/hooks/use-responsive';

export const CONTENT_MAX_WIDTH = 720;

export function useContentWidth(): ViewStyle {
  const { isWide } = useResponsive();
  return useMemo(
    () => (isWide ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } : {}),
    [isWide],
  );
}
