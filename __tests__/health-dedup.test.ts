/**
 * D6 — HealthKit дедуплікація
 * Перевіряє, що sumForDay не подвоює кумулятивні типи (steps, calories_out),
 * коли є одночасно записи від HealthKit і ручні.
 */
import { HealthEntry, sumForDay } from '@/utils/healthUtils';

const TODAY = new Date();
const iso = TODAY.toISOString();

function entry(
  id: string,
  type: HealthEntry['type'],
  value: number,
  source?: HealthEntry['source'],
): HealthEntry {
  return { id, type, value, date: iso, source };
}

// ─── Кейс 1: тільки ручні записи ─────────────────────────────────────────────
describe('sumForDay — тільки manual', () => {
  const entries: HealthEntry[] = [
    entry('m1', 'steps', 3000),          // source = undefined → manual
    entry('m2', 'steps', 2000, 'manual'),
  ];

  test('підсумовує всі manual-записи', () => {
    expect(sumForDay(entries, 'steps', TODAY)).toBe(5000);
  });
});

// ─── Кейс 2: тільки HealthKit ─────────────────────────────────────────────────
describe('sumForDay — тільки healthkit', () => {
  const entries: HealthEntry[] = [
    entry('hk1', 'steps',        8000, 'healthkit'),
    entry('hk2', 'calories_out', 350,  'healthkit'),
  ];

  test('повертає HK-значення (один запис)', () => {
    expect(sumForDay(entries, 'steps', TODAY)).toBe(8000);
    expect(sumForDay(entries, 'calories_out', TODAY)).toBe(350);
  });
});

// ─── Кейс 3: обидва джерела — має брати MAX ───────────────────────────────────
describe('sumForDay — і healthkit, і manual', () => {
  test('steps: MAX(hk, manual), не сума', () => {
    // HK говорить 9000 кроків (повний день-агрегат)
    // Ручний ввід: два записи по 3000 = 6000
    const entries: HealthEntry[] = [
      entry('hk1', 'steps', 9000, 'healthkit'),
      entry('m1',  'steps', 3000),          // manual (undefined)
      entry('m2',  'steps', 3000, 'manual'),
    ];
    // Без дедупу: 9000+3000+3000=15000 — неправильно
    // З дедупом: MAX(9000, 6000)=9000 — правильно
    expect(sumForDay(entries, 'steps', TODAY)).toBe(9000);
  });

  test('calories_out: MAX вибирається правильно, коли manual більший', () => {
    // HK says 200 kcal, user manually logged 500 kcal workout (external device)
    const entries: HealthEntry[] = [
      entry('hk1', 'calories_out', 200, 'healthkit'),
      entry('m1',  'calories_out', 500, 'manual'),
    ];
    expect(sumForDay(entries, 'calories_out', TODAY)).toBe(500);
  });

  test('water (тільки manual) — звичайна сума не змінилась', () => {
    // Water never comes from HK → no dedup, normal sum
    const entries: HealthEntry[] = [
      entry('w1', 'water', 300, 'manual'),
      entry('w2', 'water', 200),
    ];
    expect(sumForDay(entries, 'water', TODAY)).toBe(500);
  });
});
