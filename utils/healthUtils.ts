import { isSameDay, isSameMonth } from './dateUtils';

export type EntryType = 'water' | 'sleep' | 'mood' | 'weight' | 'calories' | 'steps' | 'pulse';

export interface HealthEntry {
  id: string;
  type: EntryType;
  value: number;
  note?: string;
  date: string;
}

export const WATER_GOAL  = 2000;
export const CAL_GOAL    = 2200;
export const STEPS_GOAL  = 10000;

export function getTodayEntries(entries: HealthEntry[]): HealthEntry[] {
  const now = new Date();
  return entries.filter(e => isSameDay(new Date(e.date), now));
}

export function getMonthEntries(entries: HealthEntry[], month: Date): HealthEntry[] {
  return entries.filter(e => isSameMonth(new Date(e.date), month));
}

export function getLast7Days(entries: HealthEntry[], type: EntryType): number[] {
  const result: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayEntries = entries.filter(
      e => e.type === type && isSameDay(new Date(e.date), d),
    );
    if (type === 'weight' || type === 'pulse' || type === 'mood' || type === 'sleep') {
      // last recorded value for the day
      result.push(dayEntries.length > 0 ? dayEntries[dayEntries.length - 1].value : 0);
    } else {
      // sum for the day (water, calories, steps)
      result.push(dayEntries.reduce((s, e) => s + e.value, 0));
    }
  }
  return result;
}

export function getLatestValue(entries: HealthEntry[], type: EntryType, date?: Date): number {
  const pool = date
    ? entries.filter(e => e.type === type && isSameDay(new Date(e.date), date))
    : entries.filter(e => e.type === type);
  if (!pool.length) return 0;
  return pool[pool.length - 1].value;
}

export function getSumValue(entries: HealthEntry[], type: EntryType, date?: Date): number {
  const pool = date
    ? entries.filter(e => e.type === type && isSameDay(new Date(e.date), date))
    : entries.filter(e => e.type === type);
  return pool.reduce((s, e) => s + e.value, 0);
}
