/**
 * utils/durationFormat.ts — тривалість людською мовою.
 *
 * Одиниці приходять зі словника, а не вшиті в код: до цього чотири копії
 * цієї функції в різних екранах писали «год» і «хв» незалежно від мови
 * інтерфейсу, тож англійська версія показувала українські скорочення.
 */

export interface DurationUnits {
  /** Коротке позначення години, впритул до числа: «2г», «2h». */
  hour: string;
  /** Довге позначення години, через пробіл: «2 год», «2 hr». */
  hourLong: string;
  /** Позначення хвилини: «30хв», «30min». */
  minute: string;
}

/**
 * Повна форма.
 *
 * Рівні години показуються довгим позначенням («2 год»), бо «2г» без
 * хвилин поруч читається як обірваний рядок. З хвилинами обидві частини
 * йдуть коротко, щоб не роздувати рядок у щільних списках.
 */
export function formatDuration(seconds: number, units: DurationUnits): string {
  const { hours, minutes } = split(seconds);
  if (hours > 0 && minutes > 0) return `${hours}${units.hour} ${minutes}${units.minute}`;
  if (hours > 0) return `${hours} ${units.hourLong}`;
  return `${minutes} ${units.minute}`;
}

/** Стисла форма для підписів осей і вузьких місць: одна одиниця, без пробілу. */
export function formatDurationShort(seconds: number, units: DurationUnits): string {
  const { hours, minutes } = split(seconds);
  if (hours > 0) return `${hours}${units.hour}`;
  if (minutes > 0) return `${minutes}${units.minute}`;
  return '0';
}

/** Годинник ГГ:ХХ:СС — для часу, що біжить. Одиниці не потрібні. */
export function formatClock(seconds: number): string {
  const { hours, minutes, seconds: secs } = split(seconds);
  return [hours, minutes, secs].map(n => String(n).padStart(2, '0')).join(':');
}

function split(seconds: number) {
  // Відʼємне й NaN трактуються як нуль: краще показати «0 хв», ніж
  // «-1 год» або «NaN хв» через зіпсований запис у даних.
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/**
 * Годинник ХХ:СС (хвилини не обрізаються на 60) — таймер аудіозапису.
 * Той самий вигляд, що й до винесення годинника з екранів.
 */
export function formatMinutesClock(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
