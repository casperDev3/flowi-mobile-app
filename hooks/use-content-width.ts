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
 *
 * flexShrink:1 теж у обох гілках: колонка — прямий flex-нащадок контейнера з
 * justifyContent:'flex-end', і без здатності стискатись (у RN типове значення
 * 0) вміст, вищий за контейнер, виїздить за екран замість того, щоб віддати
 * висоту внутрішньому ScrollView. Див. sheetSurfaceStyle нижче.
 */
export function sheetColumnStyle(isWide: boolean): ViewStyle {
  return isWide
    ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', flexShrink: 1 }
    : { width: '100%', flexShrink: 1 };
}

export function useContentWidth(): ViewStyle {
  const { isWide } = useResponsive();
  return useMemo(
    () => (isWide ? { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' } : {}),
    [isWide],
  );
}

/**
 * Частка висоти вікна, вище якої аркуш-форма не росте.
 * Лишаємо смужку фону зверху, щоб було видно, що за аркушем є екран.
 */
export const SHEET_MAX_HEIGHT_RATIO = 0.9;

/**
 * Геометрія поверхні аркуша-форми (BlurView зі ScrollView всередині).
 *
 * ЧОМУ ЧИСЛО, А НЕ `maxHeight: '90%'`.
 * Відсоток у Yoga рахується від висоти БАТЬКА. Батько аркуша — обгортка з
 * відступами, у якої висота `auto`: вона сама розтягується під вміст. Від
 * невизначеної висоти відсоток не рахується — обмеження просто зникає.
 * Аркуш виростає на натуральну висоту вмісту, ScrollView всередині отримує
 * рамку рівно по вмісту (`contentSize == frameSize`) і ГОРТАТИ ЙОМУ НІЧОГО:
 * кнопки «Зберегти»/«Додати» лишаються за межами вікна, хоча й присутні в
 * дереві доступності. Саме це й спостерігалось на пристрої (NAT-01).
 *
 * `flexShrink: 1` — друга половина правки. Стеля від вікна не знає про
 * клавіатуру: KeyboardAvoidingView стискає контейнер, а аркуш і далі хоче
 * свої 90% ЕКРАНА. Здатність стискатись мусить бути і на самому аркуші, і на
 * його обгортці — у RN `flexShrink` за замовчуванням 0, тож без неї
 * flex-end-контейнер не може підтиснути вміст, що не влазить.
 * ScrollView своє `flexShrink: 1` має від RN (ScrollView.js, baseVertical).
 */
export function sheetSurfaceStyle(
  windowHeight: number,
  ratio: number = SHEET_MAX_HEIGHT_RATIO,
): ViewStyle {
  return { maxHeight: Math.round(windowHeight * ratio), flexShrink: 1 };
}

/**
 * Хук-обгортка sheetSurfaceStyle для екранів: сам бере висоту вікна
 * (і перераховується при повороті / Split View).
 */
export function useSheetSurface(ratio: number = SHEET_MAX_HEIGHT_RATIO): ViewStyle {
  const { height } = useResponsive();
  return useMemo(() => sheetSurfaceStyle(height, ratio), [height, ratio]);
}
