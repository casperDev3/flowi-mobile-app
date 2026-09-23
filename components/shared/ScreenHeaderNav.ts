/**
 * components/shared/ScreenHeaderNav.ts
 *
 * Одне правило на весь застосунок: чи потрібна в шапці кнопка «Назад».
 *
 * ЧОМУ ЦЕ ВЗАГАЛІ ПИТАННЯ.
 * Кнопка «Назад» прийшла з телефона, де єдиний спосіб потрапити на екран —
 * покласти його в стек поверх попереднього. На планшеті поруч постійно
 * стоїть сайдбар: «Підписки» відкриваються з нього одним дотиком, і стрілка
 * ліворуч від заголовка веде не «вгору по ієрархії», а на випадковий
 * попередній екран — той, що був відкритий до натискання в сайдбарі. Це
 * рудимент: він займає місце й обіцяє ієрархію, якої немає.
 *
 * ПРАВИЛО.
 *   compact                     → «Назад» (сайдбара немає, стек — єдина навігація)
 *   широкий + розділ є в сайдбарі → нічого (перехід уже в сайдбарі)
 *   широкий + розділу немає      → крихти, якщо екран їх дав, інакше «Назад»
 *
 * Третій рядок — це «Акаунт», «Сон», «Підзадачі»: у сайдбар вони не винесені,
 * ієрархія в них справжня (Налаштування → Акаунт), і шлях нагору має лишатись.
 * Крихти кажуть ЗВІДКИ прийшов, чого стрілка ніколи не казала.
 *
 * Функції чисті й не знають про React: рішення перевіряється тестом без
 * рендера, а ScreenHeader лише виконує його.
 */
import { ADMIN_NAV_ITEM, NAV_GROUPS, isRouteActive } from '@/constants/nav';
import type { SizeClass } from '@/constants/tokens';

/**
 * Чи є цей маршрут пунктом сайдбара.
 *
 * Джерело — той самий NAV_GROUPS, що малює сайдбар, тож новий пункт меню
 * автоматично втрачає «Назад» на планшеті; окремого списку, який розійдеться
 * з меню, ми не заводимо.
 *
 * ADMIN_NAV_ITEM перевіряється окремо, бо в NAV_GROUPS його немає: сайдбар
 * додає його в рантаймі за `user.isAdmin`. Для шапки прапорець адміна не
 * потрібен — на /admin-workspace не-адмін не затримується (екран сам робить
 * router.back()), тож усі, хто цю шапку бачить, мають пункт у сайдбарі.
 */
export function isSidebarRoute(pathname: string): boolean {
  if (isRouteActive(ADMIN_NAV_ITEM.route, pathname)) return true;
  return NAV_GROUPS.some(group => group.items.some(item => isRouteActive(item.route, pathname)));
}

/** Що стоїть ліворуч від заголовка. */
export type HeaderLead = 'back' | 'crumbs' | 'none';

export function headerLead(
  sizeClass: SizeClass,
  pathname: string,
  opts: { hasBack: boolean; hasCrumbs: boolean },
): HeaderLead {
  // На телефоні крихти не показуємо НІКОЛИ: у рядку заголовка немає для них
  // місця, а стек там і є ієрархією — стрілка каже те саме коротше.
  if (sizeClass === 'compact') return opts.hasBack ? 'back' : 'none';
  if (isSidebarRoute(pathname)) return 'none';
  if (opts.hasCrumbs) return 'crumbs';
  return opts.hasBack ? 'back' : 'none';
}
