/**
 * utils/focusMode.ts
 *
 * Правила входу в режим зосередження (повноекранна сітка таймерів).
 *
 * Кнопка входу живе в кореневому лейауті — одна на весь застосунок, бо
 * «увімкнути з будь-якого місця» інакше означало б копію кнопки в кожній
 * шапці, а Stack-екрани мають власні хедери й спільної шапки не існує.
 * Через це рішення «де стоїть кнопка і чи стоїть узагалі» доводиться
 * приймати з одного маршруту — і саме ця арифметика лежить тут, окремо від
 * компонента, щоб її можна було перевірити тестом без рендера.
 */
import { SIDEBAR_HIDDEN_ON } from '@/constants/nav';

/**
 * Маршрути екранів під нижньою панеллю табів.
 *
 * Список саме маршрутів, а не «усе, що не Stack»: панель табів малює лише
 * (tabs)/_layout, і решта два десятки екранів (Проєкти, Нотатки, Бюджет…)
 * її не мають. Значення — те, що віддає usePathname(): група (tabs) зі шляху
 * зникає, а корінь вкладок виглядає як '/' або '/index'.
 */
export const TAB_ROUTES: readonly string[] = [
  '/', '/index', '/today', '/explore', '/health', '/time', '/settings', '/shared', '/agent',
];

/** Чи стоїть цей екран під панеллю табів. */
export function isTabScreen(pathname: string): boolean {
  return TAB_ROUTES.includes(pathname);
}

/**
 * Чи показувати кнопку режиму зосередження.
 *
 * На екранах входу її бути не повинно: там користувач ще не авторизований, і
 * таймерів у нього немає за визначенням. Список береться з SIDEBAR_HIDDEN_ON
 * НА ЧИТАННЯ — дописувати туди маршрути заборонено, бо та сама константа
 * працює гвардом редіректу гостя.
 */
export function focusButtonVisible(pathname: string): boolean {
  return !SIDEBAR_HIDDEN_ON.includes(pathname);
}

export interface FocusButtonOffsets {
  bottom: number;
  left: number;
}

/**
 * Відступи плаваючої кнопки від краю колонки контенту.
 *
 * Нижній відступ не можна брати з useTabBarInset(): той хук не знає маршруту
 * й на широкому екрані віддає 0, а на вузькому — TAB_BAR_HEIGHT завжди. На
 * Stack-екрані панелі табів немає, і кнопка висіла б на 88pt над порожнечею.
 *
 * TAB_BAR_HEIGHT уже включає домашній індикатор, тому insets.bottom до нього
 * НЕ додається — вийшов би подвійний відступ. Панель справді накриває
 * контент (tabBarStyle position: 'absolute'), тож ігнорувати її не можна.
 *
 * Кут — лівий нижній, а не правий: праворуч унизу на Завданнях, Нотатках,
 * Нарадах, Банках і ще пів десятку екранів стоїть їхній власний FAB, і
 * кнопка режиму накрила б його.
 */
export function focusButtonOffsets(params: {
  pathname: string;
  isWide: boolean;
  /** Безпечні поля вікна (useSafeAreaInsets). */
  insets: { bottom: number; left: number };
  /** Висота панелі табів — параметром, бо вона залежить від платформи. */
  tabBarHeight: number;
}): FocusButtonOffsets {
  const { pathname, isWide, insets, tabBarHeight } = params;
  const overTabBar = !isWide && isTabScreen(pathname);
  return {
    bottom: overTabBar ? tabBarHeight + 12 : insets.bottom + 16,
    // На iPhone у ландшафті ліву сторону з'їдає виріз.
    left: insets.left + 16,
  };
}

/**
 * Підпис лічильника на кнопці.
 *
 * null означає «бейджа немає»: нуль малювати нема сенсу — порожній кружечок
 * читався б як «щось іде», хоч не йде нічого. Сама кнопка при цьому
 * лишається видимою, бо режим має порожній стан і відкривається завжди.
 *
 * Понад дев'ять — «9+», так само як у вебі (lib/focus-mode.ts focusBadgeText).
 * Межа саме дев'ять, а не дев'яносто дев'ять: точна кількість одночасних
 * таймерів після дев'ятого вже нічого не означає, а два різні пороги на двох
 * клієнтах давали б різний підпис на тих самих даних — тобто виглядали б як
 * розбіжність у даних, а не в оформленні.
 */
export function focusBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const whole = Math.floor(count);
  if (whole <= 0) return null;
  return whole > 9 ? '9+' : String(whole);
}
