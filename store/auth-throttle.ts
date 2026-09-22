/**
 * store/auth-throttle.ts — ERR-03: 429 від серверного throttle більше не
 * читається як «Невірний email або пароль».
 *
 * На проді відро `auth` — 20/год на IP (`flowi_server/settings.py`), тож офіс
 * за NAT або кілька спроб пригадати пароль його вичерпують. Далі КОЖНА спроба
 * з правильним паролем падала в `else` і показувала «Невірний email або
 * пароль»: людина йшла скидати пароль, а `/auth/forgot/` сидить на тому ж
 * відрі й теж відмовляв.
 *
 * Заголовок `Retry-After` до застосунку не доходить (`store/api.ts` віддає
 * лише тіло), тож час беремо з тіла DRF: `{"detail":"Request was throttled.
 * Expected available in 59 seconds."}` або числового `retry_after`.
 */

import type { Translations } from './translations';

/** Мінімум того, що нам треба від ApiError — щоб не тягнути сюди store/api.ts. */
export interface ThrottleLike {
  status: number;
  message?: string;
  details?: Record<string, unknown>;
}

export function isThrottleError(e: unknown): e is ThrottleLike {
  return !!e && typeof e === 'object' && (e as ThrottleLike).status === 429;
}

/** Секунди до повтору з тіла відповіді; null — сервер не сказав. */
export function throttleRetrySeconds(e: ThrottleLike): number | null {
  const raw = e.details?.retry_after ?? e.details?.retryAfter;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return Math.ceil(raw);
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return parseInt(raw.trim(), 10);

  const text = [e.details?.detail, e.message]
    .filter((v): v is string => typeof v === 'string')
    .join(' ');
  const m = text.match(/(\d+)\s*(second|sec|секунд)/i);
  if (m) return parseInt(m[1], 10);
  const mm = text.match(/(\d+)\s*(minute|min|хвилин)/i);
  if (mm) return parseInt(mm[1], 10) * 60;
  return null;
}

/**
 * Текст для екрана: із часом, коли сервер його назвав, і без — коли ні.
 * Округлюємо ВГОРУ й ніколи не кажемо «за 0 хв».
 */
export function throttleMessage(
  tr: Pick<Translations, 'authTooManyAttempts' | 'authTooManyAttemptsIn'>,
  e: ThrottleLike,
): string {
  const seconds = throttleRetrySeconds(e);
  if (seconds === null) return tr.authTooManyAttempts;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return tr.authTooManyAttemptsIn.replace('{n}', String(minutes));
}
