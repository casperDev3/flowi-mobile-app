import { useEffect, useReducer } from 'react';

import { loadData, saveData } from './storage';

export type ChartType = 'bar' | 'line' | 'dots';
export const CHART_TYPES: ChartType[] = ['bar', 'line', 'dots'];

const KEY = 'health_chart_types';

// Кеш у пам'яті + pub/sub, щоб усі змонтовані графіки (зведена сторінка + підекрани)
// синхронно оновлювалися при зміні типу для метрики.
let cache: Record<string, ChartType> = {};
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function loadChartPrefs(): Promise<void> {
  if (loaded) return;
  loaded = true;
  cache = await loadData<Record<string, ChartType>>(KEY, {});
  emit();
}

export function getChartType(metric: string): ChartType {
  return cache[metric] ?? 'bar';
}

export function setChartType(metric: string, type: ChartType): void {
  cache = { ...cache, [metric]: type };
  saveData(KEY, cache);
  emit();
}

/** Реактивний тип графіка для метрики (синхронізується між усіма екранами). */
export function useChartType(metric: string): [ChartType, (t: ChartType) => void] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    loadChartPrefs();
    listeners.add(force);
    return () => { listeners.delete(force); };
  }, []);
  return [getChartType(metric), (t: ChartType) => setChartType(metric, t)];
}
