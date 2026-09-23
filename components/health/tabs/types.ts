/**
 * components/health/tabs/types.ts — спільний контракт вкладок здоровʼя.
 *
 * Кожна вкладка отримує ОДИН примірник `useHealthEntries`, створений екраном
 * розділу, а не заводить свій. Хук читає сховище й тримає агрегати доби; два
 * його екземпляри на екрані означали б два незалежні читання і мить, коли
 * шапка показує одне число, а вкладка — інше.
 */
import type { useHealthEntries } from '@/hooks/use-health-entries';

/** Те, що віддає `useHealthEntries()` — записи, профіль, цілі, нагадування, HealthKit. */
export type HealthEntriesApi = ReturnType<typeof useHealthEntries>;

export interface HealthTabProps {
  h: HealthEntriesApi;
}
