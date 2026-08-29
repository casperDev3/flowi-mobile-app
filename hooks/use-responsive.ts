/**
 * hooks/use-responsive.ts
 *
 * ЄДИНЕ джерело розмірів вікна для компонування.
 *
 * Пряме звертання до `Dimensions.get('window')` заборонене: воно читає
 * розмір ОДИН раз, у момент виконання модуля. Значення, обчислене на рівні
 * файлу (`const W = Dimensions.get('window').width`), назавжди лишається
 * тим, яким екран був при першому імпорті — після повороту, Split View або
 * зміни вікна в Stage Manager воно бреше, і жоден ререндер його не полагодить.
 *
 * `useWindowDimensions()` навпаки підписаний на зміни, тож компонування
 * перераховується разом із вікном.
 */
import { useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';

import { SIDEBAR_WIDTH, screenContentWidth } from '@/constants/nav';

import { type SizeClass, sizeClassFor } from '@/constants/tokens';

export interface Responsive {
  /** Поточна ширина вікна (не екрана — у Split View це різні речі). */
  width: number;
  /** Поточна висота вікна. */
  height: number;
  sizeClass: SizeClass;
  /** Телефон або вузьке вікно на планшеті: одна колонка, таби внизу. */
  isCompact: boolean;
  /** Достатньо місця для сайдбара, але не для колонки з деталлю. */
  isMedium: boolean;
  /** Сайдбар + список + деталь. */
  isExpanded: boolean;
  /**
   * Будь-яке НЕ компактне вікно — тобто там, де показуємо сайдбар замість
   * табів. Окрема назва тому, що це найчастіша перевірка в компонуванні, і
   * `!isCompact` у розмітці читається як заперечення заперечення.
   */
  isWide: boolean;
  landscape: boolean;
}

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const sizeClass = sizeClassFor(width);

  return {
    width,
    height,
    sizeClass,
    isCompact: sizeClass === 'compact',
    isMedium: sizeClass === 'medium',
    isExpanded: sizeClass === 'expanded',
    isWide: sizeClass !== 'compact',
    landscape: width > height,
  };
}

/**
 * Ширина, доступна САМОМУ екрану: вікно мінус постійний сайдбар.
 *
 * Окремий хук, а не поле Responsive, бо він читає маршрут (usePathname) — на
 * авторизаційних екранах сайдбара немає навіть на планшеті, і віднімати там
 * 232pt означало б звужувати екран ні за що.
 *
 * Будь-яка сітка, що ділить ширину на колонки, мусить брати ЦЕ значення, а не
 * responsive.width.
 */
export function useScreenWidth(): number {
  const { width, isWide } = useResponsive();
  const pathname = usePathname();
  return screenContentWidth(width, isWide, pathname, SIDEBAR_WIDTH);
}
