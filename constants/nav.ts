/**
 * constants/nav.ts
 *
 * Структура розділів для сайдбара на широкому екрані.
 *
 * Головна вигода планшета — не більші картки, а те, що всі розділи видно
 * одразу. На телефоні до Контейнерів чи Бюджету треба пройти три тапи
 * (Опції → Інструменти → пункт); тут вони просто в списку.
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
