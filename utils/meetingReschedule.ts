/**
 * utils/meetingReschedule.ts — «Перенести» зустріч без форми.
 *
 * Чисті функції, спільні для швидкої дії «Перенести» (пресети й «Інша
 * дата…»), перетягування в погодинній сітці і «Скасувати» в тості:
 *
 *   • звичайна зустріч — міняються її власні date/time;
 *   • екземпляр повтору — лише ЦЕЙ екземпляр: виняток у
 *     `recurrenceOverrides[первісна дата]` на оригіналі серії. Перенос назад
 *     точно на правило прибирає виняток, а не лишає порожній запис.
 *
 * Слоти часу — по 30 хв (00:00…23:30): той самий крок і в пікері форми, і в
 * «Інша дата…», і в прив'язці перетягування.
 */
import type { Meeting, MeetingOccurrenceOverride } from './meetings';

export const SLOT_MINUTES = 30;

/** 48 слотів доби: '00:00', '00:30', … '23:30'. */
export const MEETING_TIME_SLOTS: readonly string[] = Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => {
  const min = i * SLOT_MINUTES;
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
});

/** 'HH:MM' → хвилини від півночі; не час — null. */
export function parseTimeMinutes(time: string | undefined | null): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? '');
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatTimeMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Індекс слота, до якого прокрутити пікер: вибраний час (найближчий слот не
 * пізніше за нього), інакше — поточний час `now`.
 */
export function slotIndexFor(time: string | undefined | null, now: Date = new Date()): number {
  const parsed = parseTimeMinutes(time);
  const minutes = parsed ?? now.getHours() * 60 + now.getMinutes();
  return Math.min(MEETING_TIME_SLOTS.length - 1, Math.floor(minutes / SLOT_MINUTES));
}

/** Тривалість-пресети форми: 30 хв, 1 год, 1.5 год, 2 год. */
export const MEETING_DURATION_PRESETS: readonly number[] = [30, 60, 90, 120];

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function keyDate(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDaysKey(key: string, days: number): string {
  const d = keyDate(key);
  if (!d) return key;
  d.setDate(d.getDate() + days);
  return toKey(d);
}

export interface MeetingSlot {
  date: string;
  /** 'HH:MM' або '' (зустріч без часу). */
  time: string;
}

/**
 * Зсув початку на `minutes` з переходом через північ (23:45 + 30 хв →
 * завтра 00:15). Зустріч без часу зсуву в хвилинах не має — повертається як є.
 */
export function shiftSlot(slot: MeetingSlot, minutes: number): MeetingSlot {
  const start = parseTimeMinutes(slot.time);
  if (start === null) return slot;
  const total = start + minutes;
  const dayShift = Math.floor(total / 1440);
  return { date: addDaysKey(slot.date, dayShift), time: formatTimeMinutes(total) };
}

export type ReschedulePreset = 'plus30' | 'plus60' | 'tomorrow' | 'nextWeek';

export const RESCHEDULE_PRESETS: readonly ReschedulePreset[] = ['plus30', 'plus60', 'tomorrow', 'nextWeek'];

/** Куди переносить пресет. +30/+1 год без часу зустрічі не мають сенсу → null. */
export function presetTarget(preset: ReschedulePreset, from: MeetingSlot): MeetingSlot | null {
  switch (preset) {
    case 'plus30': return parseTimeMinutes(from.time) === null ? null : shiftSlot(from, 30);
    case 'plus60': return parseTimeMinutes(from.time) === null ? null : shiftSlot(from, 60);
    case 'tomorrow': return { date: addDaysKey(from.date, 1), time: from.time };
    case 'nextWeek': return { date: addDaysKey(from.date, 7), time: from.time };
    default: return null;
  }
}

/** Первісна дата екземпляра повтору (ключ винятку); для звичайної — null. */
export function occurrenceDateOf(instance: Pick<Meeting, 'id' | 'date' | '_origId' | '_occurrenceDate'>): string | null {
  if (!instance._origId) return null;
  if (instance._occurrenceDate) return instance._occurrenceDate;
  // Старий екземпляр без позначки: id = `${origId}_${YYYY-MM-DD}`.
  const tail = instance.id.slice(instance._origId.length + 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(tail) ? tail : instance.date;
}

function withoutKey<T extends object, K extends keyof T>(obj: T, key: K): T {
  if (!(key in obj)) return obj;
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

/**
 * Список зустрічей із перенесеним екземпляром. `instance` — те, що людина
 * бачила (розгорнутий екземпляр або сама зустріч). Невідома зустріч → той
 * самий масив (нічого не пишемо). Ціль, що збігається з поточним місцем,
 * теж повертає той самий масив — зайва правка не будить синк.
 */
export function rescheduleMeeting<T extends Meeting>(
  list: readonly T[],
  instance: Pick<Meeting, 'id' | 'date' | 'time' | '_origId' | '_occurrenceDate'>,
  target: MeetingSlot & { durationMinutes?: number },
): T[] {
  const origId = instance._origId ?? instance.id;
  const idx = list.findIndex(m => m.id === origId);
  if (idx < 0) return list as T[];
  const original = list[idx];
  let next: T;

  const occDate = instance._origId ? occurrenceDateOf(instance) : null;
  if (occDate && original.recurrence) {
    const prev = original.recurrenceOverrides?.[occDate];
    const dur = target.durationMinutes ?? prev?.durationMinutes;
    const ov: MeetingOccurrenceOverride = {};
    if (target.date !== occDate) ov.date = target.date;
    if (target.time !== original.time) ov.time = target.time;
    if (dur !== undefined && dur !== original.durationMinutes) ov.durationMinutes = dur;
    const same = prev?.date === ov.date && prev?.time === ov.time && prev?.durationMinutes === ov.durationMinutes && !prev?.cancelled;
    if (same || (!prev && Object.keys(ov).length === 0)) return list as T[];
    const overrides = { ...(original.recurrenceOverrides ?? {}) };
    if (Object.keys(ov).length === 0) delete overrides[occDate];
    else overrides[occDate] = ov;
    next = Object.keys(overrides).length
      ? { ...original, recurrenceOverrides: overrides }
      : withoutKey(original, 'recurrenceOverrides');
  } else {
    const dur = target.durationMinutes ?? original.durationMinutes;
    if (original.date === target.date && original.time === target.time && original.durationMinutes === dur) return list as T[];
    next = { ...original, date: target.date, time: target.time, durationMinutes: dur };
  }
  const out = list.slice();
  out[idx] = next;
  return out;
}

/** Розклад зустрічі, який повертає «Скасувати»: лише поля, що чіпає перенос. */
export type MeetingScheduleSnapshot = Pick<Meeting, 'id' | 'date' | 'time' | 'durationMinutes' | 'recurrenceOverrides'>;

export function scheduleSnapshot(m: Meeting): MeetingScheduleSnapshot {
  return {
    id: m.id, date: m.date, time: m.time, durationMinutes: m.durationMinutes,
    ...(m.recurrenceOverrides ? { recurrenceOverrides: m.recurrenceOverrides } : {}),
  };
}

/**
 * «Скасувати» переносу: повертає ЛИШЕ розклад (дата, час, тривалість,
 * винятки) — нотатки чи записи, дописані між переносом і скасуванням, лишаються.
 */
export function restoreMeetingSchedule<T extends Meeting>(list: readonly T[], snap: MeetingScheduleSnapshot): T[] {
  const idx = list.findIndex(m => m.id === snap.id);
  if (idx < 0) return list as T[];
  let restored: T = { ...list[idx], date: snap.date, time: snap.time, durationMinutes: snap.durationMinutes };
  restored = snap.recurrenceOverrides
    ? { ...restored, recurrenceOverrides: snap.recurrenceOverrides }
    : withoutKey(restored, 'recurrenceOverrides');
  const out = list.slice();
  out[idx] = restored;
  return out;
}

/**
 * Куди лягає перетягнутий блок: зсув у днях (колонки) і в хвилинах
 * (прив'язка до 30 хв), початок не виходить за межі доби [00:00, 23:30].
 */
export function dropTarget(
  from: MeetingSlot,
  dayDelta: number,
  minuteDelta: number,
): MeetingSlot {
  const start = parseTimeMinutes(from.time) ?? 0;
  const snapped = Math.round(minuteDelta / SLOT_MINUTES) * SLOT_MINUTES;
  const nextStart = Math.max(0, Math.min(24 * 60 - SLOT_MINUTES, start + snapped));
  return { date: addDaysKey(from.date, dayDelta), time: formatTimeMinutes(nextStart) };
}
