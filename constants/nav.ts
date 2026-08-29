/**
 * constants/nav.ts
 *
 * Структура розділів для сайдбара на широкому екрані.
 *
 * Головна вигода планшета — не більші картки, а те, що розділи під рукою:
 * на телефоні до Контейнерів чи Бюджету треба пройти три тапи (Опції →
 * Інструменти → пункт), тут вони просто в списку.
 *
 * «Під рукою» — не те саме, що «усі одночасно на екрані». Повний перелік із
 * 17 пунктів вищий за альбомний 11″ iPad, тож рідше вживані групи згортаються
 * (див. isGroupCollapsed): один тап замість трьох лишається, а сайдбар
 * перестає скролитись.
 *
 * Маніфест лежить окремо від компонента, бо його читає і сайдбар, і
 * підсвітка активного пункту: обидва мусять погоджуватися, що таке
 * «поточний розділ», інакше активним світитиметься не те.
 */
import { Platform } from 'react-native';

import type { IconSymbolName } from '@/components/ui/icon-symbol';
import type { Translations } from '@/store/translations';

export interface NavItem {
  /** Шлях для router.push. Має збігатися з тим, що дає usePathname(). */
  route: string;
  icon: IconSymbolName;
  /** Ключ у словнику, а не готовий рядок: мова змінюється в рантаймі. */
  labelKey: keyof Translations;
}

export interface NavGroup {
  /**
   * Стабільний ключ для запам'ятовування згорнутості. Групи без нього
   * (найчастіші розділи вгорі й Налаштування внизу) не згортаються ніколи:
   * ховати те, чим користуються щодня, заради місця — погана угода.
   */
  id?: string;
  /** null — група без заголовка (перша, найчастіші розділи). */
  titleKey: keyof Translations | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: null,
    items: [
      { route: '/(tabs)/today',   icon: 'house.fill',      labelKey: 'tabToday' },
      { route: '/(tabs)',         icon: 'checklist',       labelKey: 'tabTasks' },
      { route: '/(tabs)/explore', icon: 'banknote',        labelKey: 'tabFinance' },
      { route: '/(tabs)/health',  icon: 'figure.run',      labelKey: 'tabHealth' },
    ],
  },
  {
    id: 'tools',
    titleKey: 'navGroupTools',
    items: [
      { route: '/(tabs)/time', icon: 'timer',           labelKey: 'navTimeTracker' },
      { route: '/projects',    icon: 'folder',          labelKey: 'projects' },
      { route: '/meetings',    icon: 'calendar',        labelKey: 'meetings' },
      { route: '/budget',      icon: 'chart.pie.fill',  labelKey: 'navBudget' },
      { route: '/containers',  icon: 'shippingbox.fill',labelKey: 'containers' },
      { route: '/(tabs)/shared', icon: 'person.2.fill', labelKey: 'sharedTitle' },
    ],
  },
  {
    id: 'more',
    titleKey: 'navGroupMore',
    items: [
      { route: '/notes',        icon: 'note.text',      labelKey: 'notes' },
      { route: '/ideas',        icon: 'lightbulb.fill', labelKey: 'ideas' },
      { route: '/archive',      icon: 'archivebox',     labelKey: 'archive' },
      { route: '/time-records', icon: 'list.bullet',    labelKey: 'timeRecords' },
      { route: '/(tabs)/agent', icon: 'brain',          labelKey: 'navAgent' },
      { route: '/bugs',         icon: 'ladybug.fill',   labelKey: 'bugList' },
    ],
  },
  {
    titleKey: null,
    items: [
      { route: '/(tabs)/settings', icon: 'gearshape.fill', labelKey: 'tabOptions' },
    ],
  },
];

/**
 * Групи, згорнуті у користувача, який ще нічого не налаштовував.
 *
 * Сайдбар із усіма 17 пунктами — це ~950pt, а альбомний 11″ iPad має 834pt
 * висоти: він скролився ЗАВЖДИ. Згорнуте «Ще» прибирає шість рядків і
 * повертає його в межі екрана. «Інструменти» лишаються відкритими: там
 * розділи, по яких ходять щодня.
 */
export const DEFAULT_COLLAPSED_GROUP_IDS: readonly string[] = ['more'];

/**
 * Чи згорнута група просто зараз.
 *
 * Група, всередині якої лежить поточний розділ, розгортається примусово —
 * навіть якщо користувач її згорнув. Інакше, перейшовши в «Баги», ви бачили б
 * сайдбар без жодного підсвіченого пункту й не могли б сказати, де ви.
 */
export function isGroupCollapsed(
  group: NavGroup,
  collapsedIds: readonly string[],
  pathname: string,
): boolean {
  if (!group.id) return false;
  if (!collapsedIds.includes(group.id)) return false;
  return !group.items.some(item => isRouteActive(item.route, pathname));
}

/**
 * Чи є `route` поточним розділом.
 *
 * Порівняння не строге, бо usePathname() віддає нормалізований шлях без
 * групи-дужок: '/(tabs)/explore' у рядку адреси виглядає як '/explore'.
 * Окремо обробляється корінь вкладок — '/' і є екраном Завдань.
 */
export function isRouteActive(route: string, pathname: string): boolean {
  const normalized = route.replace('/(tabs)', '') || '/';
  if (normalized === '/') return pathname === '/' || pathname === '/index';
  return pathname === normalized;
}

// ─── Нижня панель табів ───────────────────────────────────────────────────────

/**
 * Висота нижньої панелі табів. Живе тут, а не в (tabs)/_layout, бо її мусять
 * знати двоє: сама панель і кожен екран, що додає її до нижнього відступу
 * контенту, аби останній рядок не ховався під панеллю.
 *
 * На широкому екрані панелі немає — див. useTabBarInset().
 */
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
