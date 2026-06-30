// Агрегація даних здоров'я по періодах для статистики/графіків:
// день · тиждень · місяць · 3 міс · рік.
import { EntryType, HealthEntry } from './healthUtils';

export type Period = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const PERIODS: Period[] = ['day', 'week', 'month', 'quarter', 'year'];
export type Agg = 'sum' | 'avg';

export interface TrendData {
  buckets: number[];      // значення на бакет (0 якщо нема даних)
  labels: string[];       // підписи осі X (порожній рядок = без підпису)
  hasData: boolean[];
  total: number;          // сума бакетів (для sum-типів)
  avg: number;            // середнє по бакетах з даними
  latest: number | null;  // найсвіжіше значення в періоді
  first: number | null;   // найраніше непорожнє
  delta: number | null;   // latest − first
}

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

interface Range { start: Date; end: Date; label: string; }

function ranges(period: Period, weekdays: string[], monthsShort: string[]): Range[] {
  const now = new Date();
  const out: Range[] = [];
  const daily = (count: number, labelEvery: number) => {
    for (let i = count - 1; i >= 0; i--) {
      const start = startOfDay(now); start.setDate(start.getDate() - i);
      const end = new Date(start); end.setDate(end.getDate() + 1);
      const idx = count - 1 - i;
      out.push({ start, end, label: idx % labelEvery === 0 ? String(start.getDate()) : '' });
    }
  };
  switch (period) {
    case 'day': {
      const start = startOfDay(now); const end = new Date(start); end.setDate(end.getDate() + 1);
      out.push({ start, end, label: '' });
      break;
    }
    case 'week':
      for (let i = 6; i >= 0; i--) {
        const start = startOfDay(now); start.setDate(start.getDate() - i);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        out.push({ start, end, label: weekdays[(start.getDay() + 6) % 7] });
      }
      break;
    case 'month':
      daily(30, 5);
      break;
    case 'quarter':
      for (let i = 12; i >= 0; i--) {
        const start = startOfDay(now); start.setDate(start.getDate() - i * 7 - 6);
        const end = startOfDay(now); end.setDate(end.getDate() - i * 7 + 1);
        out.push({ start, end, label: i % 2 === 0 ? String(start.getDate()) : '' });
      }
      break;
    case 'year':
      for (let i = 11; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        out.push({ start, end, label: monthsShort[start.getMonth()] ?? '' });
      }
      break;
  }
  return out;
}

export function buildTrend(
  entries: HealthEntry[],
  type: EntryType,
  period: Period,
  agg: Agg,
  weekdays: string[],
  monthsShort: string[],
): TrendData {
  const rs = ranges(period, weekdays, monthsShort);
  const buckets: number[] = [];
  const hasData: boolean[] = [];
  const labels: string[] = [];
  let latest: number | null = null;
  let first: number | null = null;

  for (const r of rs) {
    const s = r.start.getTime(), e = r.end.getTime();
    const inb = entries.filter(x => x.type === type && (() => { const t = new Date(x.date).getTime(); return t >= s && t < e; })());
    const has = inb.length > 0;
    let v = 0;
    if (has) v = agg === 'sum' ? inb.reduce((a, x) => a + x.value, 0) : inb.reduce((a, x) => a + x.value, 0) / inb.length;
    buckets.push(v); hasData.push(has); labels.push(r.label);
    if (has) { if (first === null) first = v; latest = v; }
  }

  const withData = buckets.filter((_, i) => hasData[i]);
  const total = buckets.reduce((a, v) => a + v, 0);
  const avg = withData.length ? withData.reduce((a, v) => a + v, 0) / withData.length : 0;
  const delta = first !== null && latest !== null ? latest - first : null;
  return { buckets, labels, hasData, total, avg, latest, first, delta };
}
