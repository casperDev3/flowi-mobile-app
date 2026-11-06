/**
 * store/startup-defer.ts — відкласти НЕтерміновий фоновий запис знімків
 * (віджет iOS, годинник) з холодного старту.
 *
 * Знімок для віджета/годинника читає й розбирає ~13 ключів (tasks,
 * transactions, time_entries, health_entries_v2, meetings…). На старті це
 * робилось одразу на монтуванні — паралельно з першим рендером, міграціями й
 * першим синком, тобто вже втретє за перші секунди розбирались ті самі
 * tasks/transactions на JS-потоці. Віджет і годинник не видно, поки
 * застосунок на екрані, тож кілька секунд затримки користувач не помітить;
 * перехід у фон і далі пише знімок одразу.
 */

/** Мить завантаження модуля ≈ старт JS-процесу застосунку. */
const PROCESS_START = Date.now();

export const STARTUP_SURFACE_DEFER_MS = 4000;

/** Скільки ще чекати з першим записом знімка (0 — старт уже позаду). */
export function startupDeferRemaining(now: number = Date.now()): number {
  return Math.max(0, PROCESS_START + STARTUP_SURFACE_DEFER_MS - now);
}
