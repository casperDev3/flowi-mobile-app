/**
 * utils/taskRecurrence.ts — наступна дата повторюваної задачі.
 *
 * Жила приватною функцією в `app/(tabs)/index.tsx`. Тепер ту саму наступну
 * копію створюють ще двоє: застосувальник дій пристроїв (store/device-actions.ts,
 * годинник/Live Activity) і сервер (`watch/recurrence.py`, порт цього файлу).
 * Щоб копія задачі, закритої з годинника, мала той самий дедлайн, що й закрита
 * з телефона, алгоритм лишився ДОСЛІВНО тим самим — з усіма його особливостями
 * (watch-lockscreen-v1.md §3.1 п.6):
 *
 *   • weekly з `daysOfWeek` (0=Пн … 6=Нд): найближчий пізніший обраний день
 *     цього тижня, інакше перший обраний день через `interval` тижнів;
 *   • monthly/yearly — арифметика `Date.setMonth`/`setFullYear` без обрізання
 *     (31 січня + 1 місяць = 3 березня);
 *   • `until` порівнюється рядком `YYYY-MM-DD`.
 *
 * Перед розрахунком правило проходить sanitizeRecurrenceRule (контракт C5) —
 * ІДЕНТИЧНИЙ санітайзер у сервері (`watch/recurrence.py`), щоб биті правила
 * (interval 0 / "2" / відсутній, daysOfWeek [-1, 7, 3, 3]) давали однакову
 * наступну дату з обох боків.
 */
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';

import { localDateKey } from './dateUtils';

const KNOWN_FREQS: readonly RecurrenceRule['freq'][] = ['daily', 'weekly', 'monthly', 'yearly'];
/** Той самий формат, що `_NUMERIC_RE` у watch/recurrence.py (після trim): без `.5`, `2.`, експоненти. */
const NUMERIC_RE = /^[+-]?[0-9]+(\.[0-9]+)?$/;

function sanitizeInterval(raw: unknown): number {
  let n: number | null = null;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && NUMERIC_RE.test(raw.trim())) n = Number(raw.trim());
  if (n === null || !Number.isFinite(n)) return 1;
  const floored = Math.floor(n);
  return floored < 1 ? 1 : floored;
}

/**
 * Нормалізоване правило повторення або null («повторення немає») — C5:
 * • `freq` — лише відома частота, інакше null;
 * • `interval` — скінченне число → floor, <1 → 1; числовий рядок — так само;
 *   будь-що інше → 1;
 * • `daysOfWeek` — лише цілі 0..6, унікальні, за зростанням; порожньо після
 *   фільтра — «не задано»;
 * • `until` — непорожній рядок, інакше «не задано».
 */
export function sanitizeRecurrenceRule(rule: unknown): RecurrenceRule | null {
  if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return null;
  const raw = rule as Record<string, unknown>;
  const freq = raw.freq as RecurrenceRule['freq'];
  if (typeof freq !== 'string' || !KNOWN_FREQS.includes(freq)) return null;
  const out: RecurrenceRule = { freq, interval: sanitizeInterval(raw.interval) };
  if (Array.isArray(raw.daysOfWeek)) {
    const days = [...new Set(raw.daysOfWeek.filter(
      (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6,
    ))].sort((a, b) => a - b);
    if (days.length > 0) out.daysOfWeek = days;
  }
  if (typeof raw.until === 'string' && raw.until) out.until = raw.until;
  return out;
}

export function nextRecurrenceDate(fromDateStr: string, rawRule: RecurrenceRule): string | null {
  const rule = sanitizeRecurrenceRule(rawRule);
  if (!rule) return null;
  const d = new Date(fromDateStr + 'T00:00');
  if (Number.isNaN(d.getTime())) return null;
  const { freq, interval, daysOfWeek, until } = rule;
  let next: Date;
  if (freq === 'weekly' && daysOfWeek && daysOfWeek.length > 0) {
    // Find next matching day-of-week after `d`
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    const curDow = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
    // Look in the same week first, then next interval weeks
    let found: Date | null = null;
    for (let week = 0; week < 200 && !found; week++) {
      for (const day of sortedDays) {
        const candidate = new Date(d);
        const weekOffset = week * interval * 7;
        const dayOffset = day - curDow + weekOffset;
        if (dayOffset <= 0 && week === 0) continue;
        candidate.setDate(d.getDate() + (week === 0 ? day - curDow : weekOffset - curDow + day));
        if (candidate > d) { found = candidate; break; }
      }
    }
    if (!found) return null;
    next = found;
  } else {
    next = new Date(d);
    switch (freq) {
      case 'daily':   next.setDate(next.getDate() + interval); break;
      case 'weekly':  next.setDate(next.getDate() + interval * 7); break;
      case 'monthly': next.setMonth(next.getMonth() + interval); break;
      case 'yearly':  next.setFullYear(next.getFullYear() + interval); break;
    }
  }
  // Дата за межами календаря (величезний interval) — кінець повторення, як
  // OverflowError у Python (date.max — 9999-12-31).
  if (Number.isNaN(next.getTime()) || next.getFullYear() > 9999) return null;
  const nextStr = localDateKey(next);
  if (until && nextStr > until) return null;
  return nextStr;
}

/** Хвіст id наступної копії: `-nYYYYMMDD`. Ланцюжок копій його не нарощує. */
const NEXT_SUFFIX_RE = /-n\d{8}$/;
/** Ліміт id запису на сервері (core/models.py — CharField(max_length=64)). */
const MAX_ID_LENGTH = 64;

/**
 * Детермінований id наступної копії — ДОСЛІВНО як web lib/task-recurrence.ts
 * nextOccurrenceId: id задачі (без попереднього `-nYYYYMMDD`) + доба копії.
 * Та сама задача, закрита і на вебі, і на телефоні (чи двічі тут після
 * «Скасувати»), дає ОДИН id — копія зливається синком, а не дублюється.
 */
export function nextOccurrenceId(taskId: string, nextDayKey: string): string {
  const suffix = `-n${nextDayKey.replace(/-/g, '')}`;
  const base = taskId.replace(NEXT_SUFFIX_RE, '').slice(0, MAX_ID_LENGTH - suffix.length);
  return `${base}${suffix}`;
}
