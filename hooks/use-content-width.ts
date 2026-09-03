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

/**
 * Те саме правило для bottom-sheet-ів.
 *
 * Аркуш притиснутий до низу й тягнеться на всю ширину контейнера, тож на
 * iPad у ландшафті це ~1170pt суцільної форми від краю до краю. Обмежуємо
 * так само, як вміст екрана, і центруємо.
 *
 * Чиста функція, а не хук: аркуші живуть у StyleSheet-ах екранів, і кожному
 * з них свій хук був би зайвим — `isWide` там уже є з useResponsive().
 * width:'100%' у ОБОХ гілках навмисне: без нього аркуш у контейнері з
 * alignSelf:'center' стиснувся б до ширини свого вмісту.
 */
export function sheetColumnStyle(isWide: boolean): ViewStyle {
  return isWide
    ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' }
    : { width: '100%' };
}

export function useContentWidth(): ViewStyle {
  const { isWide } = useResponsive();
  return useMemo(
    () => (isWide ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } : {}),
    [isWide],
  );
}
