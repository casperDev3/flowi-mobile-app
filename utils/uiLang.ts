/**
 * Поточна мова інтерфейсу для чистих форматерів, яким нема як дістати
 * `useI18n()` (fmtSleep, тривалості в картках). Виставляє I18nProvider
 * (store/i18n.tsx) синхронно під час рендеру.
 */
export type UiLang = 'uk' | 'en';

let current: UiLang = 'uk';

export function setUiLang(lang: UiLang): void {
  current = lang;
}

export function getUiLang(): UiLang {
  return current;
}

/** Коротка тривалість у хвилинах: «1г 30хв» / «1h 30m», «2 год» / «2 h», «30 хв» / «30 min». */
export function formatDurationShort(mins: number, lang: UiLang = current): string {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60), m = total % 60;
  if (lang === 'en') {
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h} h`;
    return `${m} min`;
  }
  if (h > 0 && m > 0) return `${h}г ${m}хв`;
  if (h > 0) return `${h} год`;
  return `${m} хв`;
}

const UNIT_EN: Record<string, string> = {
  'кк': 'kcal', 'ккал': 'kcal', 'т': 'k', 'л': 'L', 'мл': 'ml', 'кг': 'kg', 'см': 'cm',
  'уд': 'bpm', 'с': 's', 'уд/хв': 'bpm', 'кр': 'steps', 'год': 'h', 'хв': 'min', 'г': 'g', 'км': 'km',
};

/** Одиниця виміру мовою інтерфейсу (у коді вони записані українською). */
export function unitLabel(unit: string, lang: UiLang = current): string {
  return lang === 'en' ? (UNIT_EN[unit] ?? unit) : unit;
}

/** «7.8т» / «7.8k» для кроків, інакше ціле число. */
export function formatSteps(steps: number, lang: UiLang = current): string {
  return steps >= 1000 ? `${(steps / 1000).toFixed(1)}${lang === 'en' ? 'k' : 'т'}` : `${Math.round(steps)}`;
}

/** «1.0л» / «1.0 L», «500мл» / «500 ml». */
export function formatWater(ml: number, lang: UiLang = current): string {
  if (lang === 'en') return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)}л` : `${Math.round(ml)}мл`;
}

/** «1540кк» / «1540 kcal». */
export function formatKcal(kcal: number, lang: UiLang = current): string {
  return lang === 'en' ? `${Math.round(kcal)} kcal` : `${Math.round(kcal)}кк`;
}
