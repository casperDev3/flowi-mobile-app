/**
 * components/settings/model.ts — чиста логіка екрана «Налаштування».
 *
 * Порядок секцій погоджено власником (07.10.2026): профіль → інструменти →
 * вигляд і сповіщення → дані → підтримка → акаунт → версія. Профіль і
 * інструменти — на всю ширину; решта на планшеті лягає MasonryColumns у дві
 * колонки (без «дірок», які лишала сітка flexWrap 48%).
 */

export type SettingsSectionId = 'look' | 'data' | 'support' | 'account';

/** Секції під профілем та інструментами — у порядку читання. */
export const SETTINGS_SECTION_ORDER: readonly SettingsSectionId[] = Object.freeze([
  'look', 'data', 'support', 'account',
]);

/**
 * Які секції малювати. «Акаунт» без входу порожній (керувати нічим, вийти
 * нема з чого) — вхід/реєстрація живуть у картці профілю вгорі.
 */
export function settingsSectionsFor(authed: boolean): SettingsSectionId[] {
  return SETTINGS_SECTION_ORDER.filter(id => authed || id !== 'account');
}

/**
 * Розбиття секцій на масонрі і «хвіст» на всю ширину.
 *
 * «Акаунт» (з «Вийти») за рішенням власника — останній, унизу. У масонрі він
 * лягав у найкоротшу колонку — на планшеті ліворуч одразу під «Вигляд і
 * сповіщення», тобто посеред сторінки. Тож він іде окремо, після колонок.
 * На телефоні (одна колонка) порядок читання від цього не змінюється.
 */
export function settingsSectionLayout(authed: boolean): {
  columns: SettingsSectionId[];
  tail: SettingsSectionId[];
} {
  const all = settingsSectionsFor(authed);
  return {
    columns: all.filter(id => id !== 'account'),
    tail: all.filter(id => id === 'account'),
  };
}

/** Колонки секцій: телефон — одна, будь-яке широке вікно — дві. */
export function settingsColumnCount(isWide: boolean): number {
  return isWide ? 2 : 1;
}

/**
 * Ініціали для аватара: дві перші літери імені (по слову), інакше перша
 * літера пошти. Порожньо — '?', щоб коло не було пустим.
 */
export function profileInitials(name: string | null | undefined, email: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (first(words[0]) + first(words[1])).toUpperCase();
  if (words.length === 1) return first(words[0]).toUpperCase();
  const mail = (email ?? '').trim();
  return mail ? first(mail).toUpperCase() : '?';
}

/** Перший символ з урахуванням сурогатних пар (емодзі в імені не ріжемо навпіл). */
function first(s: string): string {
  return Array.from(s)[0] ?? '';
}

/** Що писати великим рядком: ім'я, а без нього — пошту. */
export function profileTitle(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? '').trim();
  return n || (email ?? '').trim();
}
