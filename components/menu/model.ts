/**
 * components/menu/model.ts — чиста логіка екрана «Меню» (без React).
 *
 * Тут лише похідні від відповіді `store/menu-api.ts`: підписи дат, порядок
 * прийомів їжі, зведення дня для списку на планшеті, кількість порожніх
 * слотів перед затвердженням, видимі групи у перемикачі. Контракт API не
 * змінюється — модуль лише читає `MenuDetail`/`MenuSpace`.
 */
import type { IconSymbolName } from '@/components/ui/icon-symbol';
import {
  addDays,
  weekDays,
  type Meal,
  type MenuDetail,
  type MenuEntry,
  type MenuFeedback,
  type MenuSpace,
} from '@/store/menu-api';

/** Що зараз відкрито в редакторі (модалка форм). */
export type Editor = {
  kind:
    | 'dish'
    | 'proposal'
    | 'complaint'
    | 'review'
    | 'create'
    | 'join'
    | 'invite'
    | 'settings';
  entry?: MenuEntry;
  item?: MenuFeedback;
  date?: string;
  meal?: Meal;
};

/** Вкладки екрана: Меню · Звернення · Учасники · Група. */
export type MenuTab = 'menu' | 'requests' | 'members' | 'settings';
export const MENU_TABS: readonly MenuTab[] = ['menu', 'requests', 'members', 'settings'];

/** Фіксований порядок прийомів їжі та їхні іконки/кольори — однакові з вебом. */
export const MEAL_ORDER: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MEAL_META: Record<Meal, { icon: IconSymbolName; color: string }> = {
  breakfast: { icon: 'sun.horizon.fill', color: '#F59E0B' },
  lunch: { icon: 'sun.max.fill', color: '#0EA5E9' },
  dinner: { icon: 'moon.fill', color: '#6366F1' },
  snack: { icon: 'leaf.fill', color: '#10B981' },
};

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const dateLabel = (d: string) =>
  new Date(d + 'T12:00').toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });

export const weekdayLabel = (d: string, weekday: 'short' | 'long') =>
  new Date(d + 'T12:00').toLocaleDateString('uk-UA', { weekday });

export const longDayLabel = (d: string) =>
  cap(
    new Date(d + 'T12:00').toLocaleDateString('uk-UA', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );

/** Прийоми їжі тижня у фіксованому порядку (сервер віддає довільний). */
export function orderedMealsOf(menu: Pick<MenuDetail, 'week_meals'> | null): Meal[] {
  return menu ? MEAL_ORDER.filter((m) => menu.week_meals.includes(m)) : [];
}

export function entriesOf(entries: readonly MenuEntry[], day: string, meal: Meal): MenuEntry[] {
  return entries.filter((e) => e.date === day && e.meal === meal);
}

export interface DaySummaryLine {
  meal: Meal;
  /** Назви страв слота (опис — коли назви немає). */
  titles: string[];
}

/** Коротке зведення дня для рядка списку днів (планшет). */
export function daySummary(
  entries: readonly MenuEntry[],
  day: string,
  meals: readonly Meal[],
): { lines: DaySummaryLine[]; dishes: number } {
  let dishes = 0;
  const lines = meals.map((meal) => {
    const titles = entriesOf(entries, day, meal)
      .map((e) => (e.title || e.description).trim())
      .filter(Boolean);
    dishes += titles.length;
    return { meal, titles };
  });
  return { lines, dishes };
}

/** Скільки слотів «день × прийом» тижня ще без страв (попередження перед затвердженням). */
export function emptySlotCount(
  menu: Pick<MenuDetail, 'week' | 'week_meals' | 'entries'>,
): number {
  return weekDays(menu.week).reduce(
    (n, d) =>
      n +
      menu.week_meals.filter((m) => !menu.entries.some((e) => e.date === d && e.meal === m))
        .length,
    0,
  );
}

/** Підпис тижня під діапазоном дат. */
export function weekKindLabel(week: string, current: string, next: string, archived: boolean): string {
  if (archived) return 'Архів';
  if (week === current) return 'Цей тиждень';
  if (week === next) return 'Наступний тиждень';
  if (week === addDays(current, -7)) return 'Минулий тиждень';
  return 'Архів';
}

/**
 * Групи у перемикачі. Архівні ховаємо, поки не попросили, — але поточна
 * лишається завжди, інакше перемикач не показав би, де людина зараз.
 */
export function visibleSpaces(
  spaces: readonly MenuSpace[],
  showArchive: boolean,
  currentId: string,
): MenuSpace[] {
  return spaces.filter((x) => showArchive || !x.archived || x.id === currentId);
}

/**
 * Ширина лівої колонки (список днів) на планшеті: третина екрана, але не
 * вужча за 280 (влазять зведення страв) і не ширша за 360 (решта — дню).
 */
export function dayListWidthFor(screenWidth: number): number {
  return Math.round(Math.min(360, Math.max(280, screenWidth * 0.36)));
}

/** День, що лишається вибраним після перезавантаження тижня. */
export function pickDay(old: string, week: string, today: string): string {
  const days = weekDays(week);
  if (days.includes(old)) return old;
  return days.includes(today) ? today : week;
}
