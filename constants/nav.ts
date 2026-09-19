/**
 * constants/nav.ts
 *
 * Структура розділів для сайдбара на широкому екрані.
 *
 * Пункти й групування дослівно повторюють веб (`flowi-web-app/app/app/layout.tsx`
 * NAV_GROUPS, `flowi-web-app/lib/nav-groups.ts`): ті самі осі групування
 * (Робота / Особисте / Ще / Розробка), той самий порядок і ті самі назви —
 * через ключі і18n, а не окремий текст, щоб мова лишалась рантайм-вибором.
 * Маршрут для кожного пункту — мобільний відповідник; веб-пункт без
 * мобільного екрана (наприклад «Зведення здоров'я», що на мобільному —
 * частина хаба «Здоров'я») сюди не потрапляє. Пункти, які є тільки на
 * мобільному (Архів, Записи часу), веб-аналога не мають, тож ідуть у «Ще» —
 * розділ, куди й на вебі складено рідше вживане.
 *
 * «Ідеї та баги» на вебі — один пункт (одна сторінка з двома вкладками); на
 * мобільному це два окремі екрани (`ideas.tsx`, `bugs.tsx`), тож у «Розробці»
 * вони йдуть двома пунктами підряд замість одного — це найближчий мобільний
 * відповідник без вигадування нового екрана.
 *
 * «Під рукою» — не те саме, що «усі одночасно на екрані». Повний перелік
 * вищий за альбомний 11″ iPad, тож рідше вживані групи згортаються (див.
 * isGroupCollapsed): один тап замість трьох лишається, а сайдбар перестає
 * скролитись.
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
   * (Робота і Налаштування внизу) не згортаються ніколи: ховати те, чим
   * користуються щодня, заради місця — погана угода. Так само й на вебі.
   */
  id?: string;
  /** null — група без заголовка. */
  titleKey: keyof Translations | null;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  // Робота — веб-група без id: завжди розгорнута, як і на вебі.
  {
    titleKey: 'navGroupWork',
    items: [
      { route: '/(tabs)/today',   icon: 'house.fill',   labelKey: 'tabToday' },
      { route: '/(tabs)',         icon: 'checklist',    labelKey: 'tabTasks' },
      { route: '/projects',       icon: 'folder',       labelKey: 'projects' },
      { route: '/meetings',       icon: 'calendar',     labelKey: 'navMeetings' },
      { route: '/(tabs)/time',    icon: 'timer',        labelKey: 'navTime' },
      { route: '/notes',          icon: 'note.text',    labelKey: 'notes' },
    ],
  },
  // Особисте — веб-група з id: збірна, як і на вебі, лишається розгорнутою за
  // замовчуванням (в DEFAULT_COLLAPSED_GROUP_IDS її немає).
  {
    id: 'personal',
    titleKey: 'navGroupPersonal',
    items: [
      { route: '/(tabs)/explore', icon: 'banknote',       labelKey: 'tabFinance' },
      { route: '/budget',         icon: 'chart.pie.fill', labelKey: 'navBudget' },
      { route: '/subscriptions',  icon: 'repeat',         labelKey: 'navSubscriptions' },
      { route: '/banks',          icon: 'building.columns.fill', labelKey: 'piggyBanks' },
      { route: '/(tabs)/health',  icon: 'figure.run',     labelKey: 'tabHealth' },
    ],
  },
  {
    id: 'more',
    titleKey: 'navGroupMore',
    items: [
      { route: '/health-summary',    icon: 'chart.bar.fill',  labelKey: 'navHealthSummary' },
      { route: '/health-profile',    icon: 'person.fill',     labelKey: 'healthProfile' },
      { route: '/health-prevention', icon: 'cross.case.fill', labelKey: 'prevention' },
      { route: '/workouts',          icon: 'dumbbell.fill',   labelKey: 'workoutsLabel' },
      { route: '/containers',        icon: 'shippingbox.fill',labelKey: 'containers' },
      // Мобільні службові пункти без веб-аналога — теж сюди.
      // («Спільне» тут стояло раніше — прибрано разом з екраном: §4 плану,
      // «Спільне зливається в проєкти», жорсткий перехід.)
      { route: '/archive',       icon: 'archivebox',    labelKey: 'archive' },
      { route: '/time-records',  icon: 'list.bullet',   labelKey: 'timeRecords' },
    ],
  },
  {
    id: 'dev',
    titleKey: 'navGroupDev',
    items: [
      { route: '/ideas',        icon: 'lightbulb.fill', labelKey: 'ideas' },
      { route: '/bugs',         icon: 'ladybug.fill',   labelKey: 'bugList' },
      { route: '/(tabs)/agent', icon: 'brain',          labelKey: 'navAgentLabel' },
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
 * Той самий вибір, що й на вебі (`DEFAULT_COLLAPSED_GROUP_IDS` у
 * `lib/nav-groups.ts`): «Ще» і «Розробка» згорнуті, «Робота» й «Особисте» —
 * розгорнуті. Повний перелік усіх пунктів вищий за альбомний 11″ iPad, тож
 * рідше вживані групи ховаються — інакше сайдбар скролився б завжди.
 */
export const DEFAULT_COLLAPSED_GROUP_IDS: readonly string[] = ['more', 'dev'];

/**
 * «Адміністрування workspace» — видиме лише адміну (контракт §2.7).
 *
 * На вебі (`app/app/layout.tsx`) цей пункт додається до групи «Особисте» в
 * рантаймі за `user.isAdmin`, а не лежить у статичному манiфесті — там-таки
 * пояснено чому: «Особисте» и є та сама група, яку §1 плану дзеркалить
 * сайдбар планшета, тож додаючи пункт сюди тим самим способом, він
 * з'являється і тут без окремого рішення про групування.
 */
export const ADMIN_NAV_ITEM: NavItem = {
  route: '/admin-workspace',
  icon: 'shield.fill',
  labelKey: 'adminWorkspaceTitle',
};

/** `NAV_GROUPS`, доповнений `ADMIN_NAV_ITEM` для адміна — інакше як є. */
export function navGroupsFor(isAdmin: boolean): NavGroup[] {
  if (!isAdmin) return NAV_GROUPS;
  return NAV_GROUPS.map(group =>
    group.id === 'personal' ? { ...group, items: [...group.items, ADMIN_NAV_ITEM] } : group,
  );
}

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

/**
 * Висота глобальної панелі активних таймерів (components/time/ActiveTimersBar),
 * що на телефоні стоїть просто над панеллю табів — як міні-плеєр.
 *
 * Живе поруч із TAB_BAR_HEIGHT з тієї ж причини: її мусять знати і сама
 * панель, і кожен екран вкладок, щоб останній рядок і FAB не ховались під нею.
 */
export const ACTIVE_TIMERS_BAR_HEIGHT = 52;

/**
 * Чи видно панель активних таймерів над табами.
 *
 * Лише на вузькому екрані: на широкому табів немає, і ту саму роль грає
 * картка внизу сайдбара (components/time/ActiveTimersSidebarCard).
 */
export function activeTimersBarVisible(isWide: boolean, timersCount: number): boolean {
  return !isWide && Number.isFinite(timersCount) && timersCount > 0;
}

/**
 * Скільки місця знизу з'їдають таб-бар і (коли видно) панель таймерів.
 * Чиста арифметика для useTabBarInset — окремо, щоб перевірити без рендера.
 */
export function tabBarInsetFor(isWide: boolean, timersCount: number): number {
  if (isWide) return 0;
  return TAB_BAR_HEIGHT + (activeTimersBarVisible(isWide, timersCount) ? ACTIVE_TIMERS_BAR_HEIGHT : 0);
}

// ─── Ширина, доступна екрану ──────────────────────────────────────────────────

/**
 * Ширина сайдбара. Живе в маніфесті, а не в самому компоненті, з практичної
 * причини: її мусять читати хуки компонування, а імпорт із компонента тягне
 * за собою i18n і AsyncStorage — і будь-який тест, що торкається розмірів,
 * падає на відсутньому нативному модулі.
 *
 * Значення підібране під найдовшу назву українською («Трекер часу»).
 */
export const SIDEBAR_WIDTH = 232;

/**
 * Маршрути, на яких сайдбара немає навіть на широкому екрані.
 *
 * Живе тут, а не в app/_layout.tsx, бо це знання потрібне двом різним речам:
 * самому лейауту (чи малювати панель) і кожному екрану, що рахує сітку від
 * ширини (чи належать йому ті 232pt). Копія цього списку в другому місці
 * розійшлася б рівно тоді, коли додасться новий такий маршрут.
 *
 * НЕ плутати з гвардом гостя: раніше та сама константа виконувала обидві
 * ролі, і дописування сюди нового екрана мовчки робило б його
 * «авторизаційним» — тобто відкритим без входу.
 */
export const SIDEBAR_HIDDEN_ON: readonly string[] = [
  '/welcome', '/login', '/register', '/forgot-password', '/workspace', '/register-pending',
  // Запрошення (§4, контракт §4.3) — досяжний і гостю без акаунта: сайдбар
  // особистого простору тут так само недоречний, як на /welcome чи /login.
  '/invite',
];

/** Чи видно сайдбар зараз. */
export function sidebarVisible(isWide: boolean, pathname: string): boolean {
  return isWide && !SIDEBAR_HIDDEN_ON.includes(pathname);
}

/**
 * Скільки ширини реально дістається екрану.
 *
 * useResponsive().width — це ширина ВІКНА, а сайдбар у app/_layout.tsx стоїть
 * у рядку поруч зі Stack, тобто ці 232pt екрану не належать. Екран, який
 * рахує сітку від width, на iPad 1194pt будує ряд на 720pt у колонці 582pt і
 * обрізає карти праворуч — саме це й сталося з Контейнерами.
 */
export function screenContentWidth(
  windowWidth: number,
  isWide: boolean,
  pathname: string,
  sidebarWidth: number,
): number {
  return sidebarVisible(isWide, pathname)
    ? Math.max(windowWidth - sidebarWidth, 0)
    : windowWidth;
}
