/**
 * __tests__/time-anomalies.test.ts — критерій аномалій записів часу (пункт 4).
 *
 * Рішення власника: аномалія = > 8 год, АБО перетин півночі, АБО < 1 хв, АБО
 * «довше ніж утричі за типову сесію задачі І щонайменше на 30 хв довше».
 * Типова сесія — медіана задачі (≥3), інакше медіана проєкту за
 * `recordProjectId(entry, taskProjects)` (≥3).
 *
 * Фікстура паритету — ПОБАЙТОВА копія вебової
 * `flowi-web-app/lib/__fixtures__/time-anomalies-parity.json` (веб ганяє її
 * через lib/time-anomalies-parity.test.mjs).
 */
import fs from 'fs';
import path from 'path';

import {
  ANOMALY_OUTLIER_MIN_EXCESS,
  anomalyMap,
  anomalySeverity,
  detectAnomalies,
  entrySeconds,
  isOutlier,
  outlierFactor,
  trimmedSeconds,
  typicalSessionSeconds,
  type AnomalyEntry,
} from '@/utils/timeAnomalies';
import { taskProjectMap } from '@/utils/timeEntries';

const at = (local: string) => new Date(local).toISOString();
const entry = (over: Partial<AnomalyEntry> & { id: string }): AnomalyEntry => ({
  task: 'Робота',
  duration: 3600,
  date: at('2026-09-20T12:00:00'),
  ...over,
});

describe('поріг викиду', () => {
  test('утричі І на 30 хв довше за типову сесію задачі', () => {
    const list = [
      entry({ id: 'a', taskId: 't1', duration: 1200 }),
      entry({ id: 'b', taskId: 't1', duration: 1200 }),
      entry({ id: 'c', taskId: 't1', duration: 1200 }),
      entry({ id: 'big', taskId: 't1', duration: 3601 }),
    ];
    const reports = detectAnomalies(list);
    expect(reports.map(r => [r.entry.id, r.kinds, r.typicalSeconds])).toEqual([['big', ['outlier'], 1200]]);
  });

  test('коротка задача: утричі, але менше ніж на 30 хв — не викид', () => {
    const list = [
      entry({ id: 'a', taskId: 't1', duration: 600 }),
      entry({ id: 'b', taskId: 't1', duration: 600 }),
      entry({ id: 'c', taskId: 't1', duration: 600 }),
      entry({ id: 'x', taskId: 't1', duration: 1860 }),
    ];
    expect(detectAnomalies(list)).toEqual([]);
    expect(isOutlier(600 + ANOMALY_OUTLIER_MIN_EXCESS, 600)).toBe(true);
    expect(isOutlier(600 + ANOMALY_OUTLIER_MIN_EXCESS - 1, 600)).toBe(false);
  });

  test('задача з власною медіаною не судиться медіаною проєкту', () => {
    const list = [
      ...[1, 2, 3, 4, 5, 6].map(n => entry({ id: `s${n}`, projectId: 'p1', taskId: `short${n}`, duration: 300 })),
      entry({ id: 'c1', projectId: 'p1', taskId: 'call', duration: 3600 }),
      entry({ id: 'c2', projectId: 'p1', taskId: 'call', duration: 3600 }),
      entry({ id: 'c3', projectId: 'p1', taskId: 'call', duration: 3600 }),
    ];
    expect(detectAnomalies(list)).toEqual([]);
  });

  test('проєкт запису без projectId — з його задачі (taskProjects)', () => {
    const list = [
      entry({ id: 'a', taskId: 't1', duration: 600 }),
      entry({ id: 'b', taskId: 't2', duration: 600 }),
      entry({ id: 'c', taskId: 't3', duration: 600 }),
      entry({ id: 'odd', taskId: 't4', duration: 4000 }),
    ];
    const taskProjects = new Map([['t1', 'p1'], ['t2', 'p1'], ['t3', 'p1'], ['t4', 'p1']]);
    expect(detectAnomalies(list)).toEqual([]);
    expect(detectAnomalies(list, taskProjects).map(r => r.entry.id)).toEqual(['odd']);
  });

  test('мапа рядків, серйозність, множник, звичайна сесія', () => {
    const map = anomalyMap(detectAnomalies([entry({ id: 'long', duration: 9 * 3600 })]));
    expect(map.get('long')).toEqual({ kinds: ['long'], typicalSeconds: null });
    expect(anomalySeverity(['outlier'])).toBe('amber');
    expect(anomalySeverity(['midnight'])).toBe('red');
    expect(outlierFactor(3500, 1000)).toBe(3.5);
    expect(typicalSessionSeconds([entry({ id: 'x', duration: 600 }), entry({ id: 'y', duration: 900 }), entry({ id: 'z', duration: 36000 })])).toBe(900);
  });
});

describe('паритет із вебом', () => {
  const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'time-anomalies-parity-web.json');
  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
  const iso = (v?: string) => (v ? new Date(v).toISOString() : v);
  const entries: AnomalyEntry[] = fixture.entries.map((e: AnomalyEntry) => ({
    ...e, date: iso(e.date), startedAt: iso(e.startedAt), endedAt: iso(e.endedAt),
  }));
  const taskProjects = taskProjectMap(fixture.tasks);

  test('фікстура — побайтова копія вебової', () => {
    const web = path.join(__dirname, '..', '..', 'flowi-web-app', 'lib', '__fixtures__', 'time-anomalies-parity.json');
    if (!fs.existsSync(web)) return; // репозиторії можуть лежати окремо
    expect(fs.readFileSync(FIXTURE_PATH, 'utf8')).toBe(fs.readFileSync(web, 'utf8'));
  });

  test('черга з taskProjects', () => {
    const rows = detectAnomalies(entries, taskProjects).map(r => ({
      id: r.entry.id,
      kinds: r.kinds,
      typicalSeconds: r.typicalSeconds,
      factor: outlierFactor(entrySeconds(r.entry), r.typicalSeconds),
      severity: anomalySeverity(r.kinds),
      trim: trimmedSeconds(r.entry),
    }));
    expect(rows).toEqual(fixture.expected.withTaskProjects);
  });

  test('без taskProjects і звичайна сесія', () => {
    expect(detectAnomalies(entries).map(r => r.entry.id)).toEqual(fixture.expected.withoutTaskProjects);
    expect(typicalSessionSeconds(entries)).toBe(fixture.expected.typicalSessionSeconds);
  });
});
