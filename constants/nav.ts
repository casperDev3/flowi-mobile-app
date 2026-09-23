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
 * «Ідеї та баги» — один пункт на обох платформах: на мобільному це один
 * екран `feedback.tsx` із перемикачем «Ідеї | Баги» (feedback-inbox.md §10.1);
 * старі `/ideas` і `/bugs` лишились редиректами.
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

/**
 * Ідентифікатор модуля, який можна вимкнути.
 *
 * Значення — це те, що лежить у синхронізованому 'ui_preferences'
 * (store/ui-preferences.ts) і мусить збігатися з вебом
 * (`flowi-web-app/lib/nav-groups.ts`, `ModuleId`): вимкнули на телефоні —
 * зникло і в сайдбарі веба. Саме тому ідентифікатори не прив'язані до
 * маршрутів (вони на платформах різні), а названі за модулем.
 *
 * Частина ідентифікаторів є лише на одній платформі: `archive`, `time_records`
 * і `bugs` — мобільні (веб таких сторінок не має), `health_summary`,
 * `health_profile` і `prevention` — вебові (на мобільному це вкладки одного
 * екрана «Здоров'я», а не окремі розділи меню). Це не розходження контракту:
 * платформа, яка ідентифікатора не знає, просто не показує для нього
 * перемикача і зберігає значення незмінним (parseUiPreferences копіює список
 * як є).
 */
export type ModuleId =
  | 'tasks' | 'projects' | 'meetings' | 'time' | 'notes'
  | 'finance' | 'budget' | 'subscriptions' | 'banks' | 'health'
  | 'health_summary' | 'health_profile' | 'prevention' | 'workouts' | 'training' | 'containers'
  | 'archive' | 'time_records'
  | 'ideas' | 'bugs';

export interface NavItem {
  /** Шлях для router.push. Має збігатися з тим, що дає usePathname(). */
  route: string;
  icon: IconSymbolName;
  /** Ключ у словнику, а не готовий рядок: мова змінюється в рантаймі. */
  labelKey: keyof Translations;
  /**
   * Модуль, яким керує екран налаштувань модулів. Пункт БЕЗ нього —
   * системний: «Сьогодні» (домівка, без неї застосунку нікуди приземлитись),
   * «Налаштування» (звідти ж модулі й вмикають назад) і «Адміністрування
   * workspace» (видимість дає роль, а не вибір користувача).
   */
  module?: ModuleId;
  /**
   * Пункт — ВКЛАДКА іншого розділу, а не окремий розділ меню
   * (finance-revamp.md §2.3: «Бюджет», «Підписки», «Рахунки» стали вкладками
   * «Фінансів»). Запис лишається в маніфесті, бо з нього виводяться перемикачі
   * модулів (moduleSections) і підписи заглушок; сайдбар його не малює —
   * {@link menuNavGroups}. Те саме поле, що й `NavEntry.tabOf` на вебі.
   */
  tabOf?: ModuleId;
  /**
   * Додаткові шляхи, на яких пункт теж підсвічується: підекрани без власного
   * пункту меню (налаштування сповіщень і модулів → «Налаштування»).
   */
  activeOn?: readonly string[];
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
      { route: '/(tabs)',         icon: 'checklist',    labelKey: 'tabTasks',     module: 'tasks' },
      { route: '/projects',       icon: 'folder',       labelKey: 'projects',     module: 'projects' },
      { route: '/meetings',       icon: 'calendar',     labelKey: 'navMeetings',  module: 'meetings' },
      { route: '/(tabs)/time',    icon: 'timer',        labelKey: 'navTime',      module: 'time' },
      { route: '/notes',          icon: 'note.text',    labelKey: 'notes',        module: 'notes' },
    ],
  },
  // Особисте — веб-група з id: збірна, як і на вебі, лишається розгорнутою за
  // замовчуванням (в DEFAULT_COLLAPSED_GROUP_IDS її немає).
  {
    id: 'personal',
    titleKey: 'navGroupPersonal',
    items: [
      { route: '/(tabs)/explore', icon: 'banknote',       labelKey: 'tabFinance',        module: 'finance' },
      // Бюджет, підписки і рахунки — вкладки «Фінансів» (explore?tab=…,
      // finance-revamp.md §2.3): у сайдбарі їх немає (menuNavGroups), а записи
      // лишаються заради перемикачів модулів — ModuleId не скорочуємо.
      { route: '/budget',         icon: 'chart.pie.fill', labelKey: 'navBudget',         module: 'budget',        tabOf: 'finance' },
      { route: '/subscriptions',  icon: 'repeat',         labelKey: 'navSubscriptions',  module: 'subscriptions', tabOf: 'finance' },
      { route: '/banks',          icon: 'building.columns.fill', labelKey: 'piggyBanks', module: 'banks',         tabOf: 'finance' },
      { route: '/(tabs)/health',  icon: 'figure.run',     labelKey: 'tabHealth',         module: 'health' },
    ],
  },
  {
    id: 'more',
    titleKey: 'navGroupMore',
    items: [
      // «Зведення здоровʼя», «Профіль здоровʼя» і «Профілактика» прибрані з
      // меню: розділ «Здоровʼя» тепер ОДИН екран із вкладками (Огляд ·
      // Харчування · Активність і тренування · Сон · Тіло і вітальні ·
      // Профілактика), а профіль і джерела даних — його налаштування за
      // шестернею. Чотири пункти про один розділ читались як чотири розділи,
      // і «де подивитись сон» залежало від того, який із них ви відкрили.
      // Маршрути живі: старі шляхи редиректять кожен на свою вкладку.
      //
      // «Тренування» лишаються ОКРЕМИМ пунктом навмисно — це свій модуль із
      // групами й програмами, а не вкладка здоровʼя; вкладка «Активність і
      // тренування» лише показує їхнє зведення й веде сюди.
      { route: '/workouts',          icon: 'dumbbell.fill',   labelKey: 'workoutsLabel',    module: 'workouts' },
      // Групи тренувань (training-module.md §10): окремий модуль `training`,
      // як і на вебі (`lib/nav-groups.ts`), — вимкнення особистого журналу
      // не має ховати групу, де людина тренер.
      { route: '/training',          icon: 'person.2.fill',   labelKey: 'tgNavLabel',       module: 'training' },
      { route: '/containers',        icon: 'shippingbox.fill',labelKey: 'containers',       module: 'containers' },
      // Мобільні службові пункти без веб-аналога — теж сюди.
      // («Спільне» тут стояло раніше — прибрано разом з екраном: §4 плану,
      // «Спільне зливається в проєкти», жорсткий перехід.)
      { route: '/archive',       icon: 'archivebox',    labelKey: 'archive',    module: 'archive' },
      { route: '/time-records',  icon: 'list.bullet',   labelKey: 'timeRecords', module: 'time_records' },
    ],
  },
  {
    id: 'dev',
    titleKey: 'navGroupDev',
    items: [
      // ОДИН пункт «Ідеї та баги» під модулем 'ideas' — як і на вебі
      // (feedback-inbox.md §10.1). ModuleId 'bugs' лишається в типі, бо лежить
      // у синхронізованому ui_preferences.disabledModules, але більше НІЧИМ не
      // керує: інакше той, хто колись сховав баги, втратив би й ідеї.
      { route: '/feedback',     icon: 'lightbulb.fill', labelKey: 'fbTitle', module: 'ideas' },
    ],
  },
  {
    titleKey: null,
    items: [
      {
        route: '/(tabs)/settings',
        icon: 'gearshape.fill',
        labelKey: 'tabOptions',
        activeOn: ['/notifications', '/settings-notifications', '/settings-modules'],
      },
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

// ─── Вимкнені модулі ─────────────────────────────────────────────────────────

/** Екран, де модулі вмикають назад. Звідси ж веде кнопка заглушки на телефоні. */
export const MODULE_SETTINGS_ROUTE = '/settings-modules';

/**
 * Ті самі групи без пунктів вимкнених модулів.
 *
 * Група, яка після фільтра лишилась порожньою, зникає цілком: заголовок
 * «Розробка» з лічильником 0 і без жодного рядка читається як збій, а не як
 * «ви це вимкнули».
 *
 * Системні пункти (без `module`) не фільтруються ніколи — інакше, вимкнувши
 * все, користувач лишився б без входу в налаштування, тобто без способу
 * увімкнути щось назад.
 */
export function visibleNavGroups(groups: NavGroup[], disabled: readonly string[]): NavGroup[] {
  if (!disabled.length) return groups;
  const result: NavGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter(item => !item.module || !disabled.includes(item.module));
    if (items.length) result.push(items.length === group.items.length ? group : { ...group, items });
  }
  return result;
}

/**
 * Групи САЙДБАРА: без пунктів-вкладок ({@link NavItem.tabOf}). Застосовується
 * поверх {@link visibleNavGroups}; група, що лишилась порожньою, зникає.
 * Дзеркало `menuNavGroups` у `flowi-web-app/lib/nav-groups.ts`.
 */
export function menuNavGroups(groups: NavGroup[]): NavGroup[] {
  const result: NavGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter(item => !item.tabOf);
    if (items.length) result.push(items.length === group.items.length ? group : { ...group, items });
  }
  return result;
}

/** Чи підсвічувати пункт: сам маршрут або один із його підекранів (`activeOn`). */
export function isNavItemActive(item: Pick<NavItem, 'route' | 'activeOn'>, pathname: string): boolean {
  return isRouteActive(item.route, pathname) || Boolean(item.activeOn?.includes(pathname));
}

export interface ModuleSection {
  /** null — група без заголовка; у списку модулів таких немає. */
  titleKey: keyof Translations;
  items: (NavItem & { module: ModuleId })[];
}

/**
 * Перелік модулів для екрана налаштувань — ВИВЕДЕНИЙ із NAV_GROUPS, а не
 * записаний поруч другим списком.
 *
 * Інакше два переліки розійшлися б на першому ж новому розділі: сайдбар знав
 * би про нього, а налаштування — ні, і вимкнути його було б нічим. Побічний
 * наслідок того самого рішення — групування збігається з сайдбаром само
 * собою, без окремої домовленості.
 */
/**
 * Ключ підпису модуля — щоб заглушка вимкненої вкладки називала розділ тим
 * самим словом, що й сайдбар зі списком модулів.
 */
export function moduleLabelKey(module: ModuleId): keyof Translations | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find(candidate => candidate.module === module);
    if (item) return item.labelKey;
  }
  return undefined;
}

export function moduleSections(): ModuleSection[] {
  const sections: ModuleSection[] = [];
  for (const group of NAV_GROUPS) {
    if (!group.titleKey) continue;
    const items = group.items.filter(
      (item): item is NavItem & { module: ModuleId } => Boolean(item.module),
    );
    if (items.length) sections.push({ titleKey: group.titleKey, items });
  }
  return sections;
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
  return !group.items.some(item => isNavItemActive(item, pathname));
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

// ─── Кольори й кегль підписів табів ───────────────────────────────────────────

/**
 * Фактичний колір тла панелі табів, ЗМІРЯНИЙ ПО ПІКСЕЛЯХ на пристрої
 * (iOS, скріншот таб-бара), а не порахований із токенів.
 *
 * Чому не порахований: під панеллю стоїть BlurView, і те, що видно, —
 * це вже результат розмиття плюс напівпрозора заливка. У темній темі
 * блюр виявився майже непрозорим (#191720), тобто своєї роботи там
 * практично не виконує.
 *
 * Живе в коді, а не лише в звіті, бо це база розрахунку контрасту:
 * тест __tests__/audit-tabbar-a11y.test.tsx рахує TAB_BAR_TINT саме проти
 * цих двох чисел. Змінили тло панелі — міняйте і тут, інакше тест охороняє
 * вже не ту сцену.
 */
export const TAB_BAR_BG_MEASURED = { light: '#F7F2FF', dark: '#191720' } as const;

/**
 * Тінт підписів та іконок панелі табів.
 *
 * Неактивні раніше задавались альфою (`rgba(80,60,120,0.45)` /
 * `rgba(255,255,255,0.35)`) і давали 2.23:1 у світлій темі та 3.21:1 у
 * темній — при нормі WCAG 4.5:1 для тексту 10–11pt і навіть нижче
 * пом'якшених 3:1 для іконок. Замінено на суцільні кольори з двох причин:
 *
 *  1. Альфа лежить поверх БЛЮРУ, тож фактичний колір підпису гуляє разом
 *     із контентом, що проїжджає під панеллю. Суцільний колір лишає
 *     змінною лише тло.
 *  2. Під 4.5:1 альфі довелося б дорости до ~0.76, а це вже не «приглушений
 *     колір», а той самий колір — сенс альфи зникає.
 *
 * Неактивні навмисно лишились МЕНШ контрастними за активні (4.95 проти
 * 5.18 у світлій, 5.29 проти 6.51 у темній) і знебарвленими: «ви тут»
 * має читатись і насиченістю, а не тільки яскравістю.
 */
export const TAB_BAR_TINT = {
  light: { active: '#7C3AED', inactive: '#6F6489' },
  dark:  { active: '#A78BFA', inactive: '#8E8A9C' },
} as const;

/**
 * Кегль підпису таба. Було 10pt — найдрібніший текст застосунку.
 * 11pt — мінімум, який iOS сам використовує в таб-барі.
 */
export const TAB_LABEL_FONT_SIZE = 11;

/**
 * Стеля масштабування підпису таба під Dynamic Type.
 *
 * Нуль масштабування (так було: @react-navigation вимикає його на iOS за
 * замовчуванням) — гірше за обрізання: користувач із збільшеним шрифтом
 * не отримує нічого. Але й стеля потрібна: ширина таба ~80pt, і найдовший
 * підпис («Налаштування» в англійській — «Settings», в українській —
 * «Сьогодні») при 1.4× займає ~65pt, а при 2× вже не влазить.
 * По висоті: іконка 26 + 2 + рядок ~18.5 ≈ 46.5pt у 54pt контенту панелі.
 */
export const TAB_LABEL_MAX_FONT_SCALE = 1.4;

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
