import type { Lang } from '@/store/translations';

/**
 * Мови пристрою, для яких інтерфейс за замовчуванням — український.
 * Російська і білоруська теж сюди: користувачеві з такою системною мовою
 * українська зрозуміліша за англійську.
 */
const UK_DEFAULT_LANGUAGES = new Set(['uk', 'ru', 'be']);

/** Мова інтерфейсу за мовами пристрою (за пріоритетом), коли людина її ще не обрала. */
export function langFromDeviceLanguages(languageCodes: readonly (string | null | undefined)[]): Lang {
  for (const code of languageCodes) {
    if (!code) continue;
    return UK_DEFAULT_LANGUAGES.has(code.toLowerCase()) ? 'uk' : 'en';
  }
  return 'uk';
}

/**
 * Початкова мова, коли збереженого вибору (`lang_option_v1`) немає.
 *
 * До цієї версії типовою завжди була українська, і більшість наявних
 * користувачів мову не обирали. Перемкнути їм інтерфейс на англійську лише
 * через системну мову телефону було б несподіванкою, тож хто вже підключав
 * workspace (`hasExistingInstall`), лишається на українській. Мова пристрою
 * діє лише для нових встановлень (зокрема для рецензентів маркетів).
 */
export function resolveInitialLang(options: {
  saved: unknown;
  hasExistingInstall: boolean;
  deviceLanguageCodes: readonly (string | null | undefined)[];
}): Lang {
  if (options.saved === 'uk' || options.saved === 'en') return options.saved;
  if (options.hasExistingInstall) return 'uk';
  return langFromDeviceLanguages(options.deviceLanguageCodes);
}
