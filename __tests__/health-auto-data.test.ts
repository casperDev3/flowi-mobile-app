/**
 * __tests__/health-auto-data.test.ts — автоматичні дані здоровʼя
 * (flowi-server-app/docs/specs/health-auto-data.md).
 *
 * Чисті правила, однакові для HealthKit і Health Connect: вікно сну, union
 * інтервалів, якість сну, похідні id, злиття, бекфіл, прибирання ваги.
 * Кожен блок падав би на старому коді (ВАДА-1/2/3).
 */
import {
  type AutoDayRead,
  type HealthEntry,
  MIN_NIGHT_SLEEP_MIN,
  aggregateSleep,
  autoEntryId,
  buildAutoDayEntries,
  buildWeightEntries,
  burnedForDay,
  collapseStaleHkWeights,
  daysToSync,
  hcSleepStage,
  hkSleepStage,
  isDerivedAutoId,
  mergeAutoEntries,
  sleepNightForDay,
  sleepQuality,
  sleepWindow,
  spo2Percent,
  stableHash,
  sumForDay,
  unionMinutes,
  weightEntryId,
} from '@/utils/healthUtils';
import { hcSleepIntervals } from '@/store/health-connect';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const MIN = 60000;

describe('вікно сну (ВАДА-1)', () => {
  test('ніч належить даті пробудження: [D-1 18:00, D 12:00]', () => {
    const now = new Date(2026, 8, 22, 20, 0);
    const w = sleepWindow(new Date(2026, 8, 22), now);
    expect(w.from.getTime()).toBe(at(2026, 9, 21, 18));
    expect(w.to.getTime()).toBe(at(2026, 9, 22, 12));
  });

  test('кінець вікна не пізніше «зараз»', () => {
    const now = new Date(2026, 8, 22, 8, 30);
    expect(sleepWindow(new Date(2026, 8, 22), now).to.getTime()).toBe(now.getTime());
  });

  test('денний сон учора і сьогодні вдень не потрапляють у ніч', () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    const night = aggregateSleep([
      { start: at(2026, 9, 21, 14), end: at(2026, 9, 21, 15, 30), stage: 'light' }, // дрімота вчора
      { start: at(2026, 9, 21, 23), end: at(2026, 9, 22, 7), stage: 'light' },      // ніч
      { start: at(2026, 9, 22, 15), end: at(2026, 9, 22, 16), stage: 'light' },     // дрімота сьогодні
    ], w);
    expect(night?.total).toBe(8 * 60);
  });

  test('та сама ніч із двох джерел не подвоюється (union, не сума)', () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    const night = aggregateSleep([
      { start: at(2026, 9, 21, 23), end: at(2026, 9, 22, 7), stage: 'asleep' },
      { start: at(2026, 9, 21, 23, 10), end: at(2026, 9, 22, 6, 50), stage: 'asleep' },
    ], w);
    expect(night?.total).toBe(8 * 60);
    expect(unionMinutes([{ start: 0, end: 10 * MIN }, { start: 5 * MIN, end: 20 * MIN }, { start: 30 * MIN, end: 40 * MIN }])).toBe(30);
  });

  test('семпл, що виходить за межі вікна, обрізається', () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    const night = aggregateSleep([{ start: at(2026, 9, 21, 16), end: at(2026, 9, 21, 20), stage: 'light' }], w);
    expect(night?.total).toBe(120);
  });

  test(`менше ${MIN_NIGHT_SLEEP_MIN} хв — ночі не було`, () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    expect(aggregateSleep([{ start: at(2026, 9, 22, 1), end: at(2026, 9, 22, 1, 30), stage: 'light' }], w)).toBeNull();
  });

  test('фази розкладаються окремо, awake не входить у сон', () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    const night = aggregateSleep([
      { start: at(2026, 9, 21, 23), end: at(2026, 9, 22, 1), stage: 'light' },
      { start: at(2026, 9, 22, 1), end: at(2026, 9, 22, 2), stage: 'deep' },
      { start: at(2026, 9, 22, 2), end: at(2026, 9, 22, 2, 20), stage: 'awake' },
      { start: at(2026, 9, 22, 2, 20), end: at(2026, 9, 22, 4), stage: 'rem' },
    ], w)!;
    expect(night.total).toBe(120 + 60 + 100);
    expect(night.deep).toBe(60);
    expect(night.rem).toBe(100);
    expect(night.light).toBe(120);
    expect(night.awake).toBe(20);
  });

  test('без глибокого й REM фази вважаються невідомими', () => {
    const w = sleepWindow(new Date(2026, 8, 22), new Date(2026, 8, 22, 20));
    const night = aggregateSleep([{ start: at(2026, 9, 21, 23), end: at(2026, 9, 22, 7), stage: 'light' }], w)!;
    expect(night.deep).toBeNull();
    expect(night.rem).toBeNull();
  });

  test('HealthKit: inBed (0) ігнорується, awake (2) окремо', () => {
    expect(hkSleepStage(0)).toBeNull();
    expect(hkSleepStage(1)).toBe('light');
    expect(hkSleepStage(2)).toBe('awake');
    expect(hkSleepStage(3)).toBe('light');
    expect(hkSleepStage(4)).toBe('deep');
    expect(hkSleepStage(5)).toBe('rem');
  });

  test('Health Connect: сесія без фаз дає лише тривалість', () => {
    expect(hcSleepStage(3)).toBeNull(); // OUT_OF_BED
    expect(hcSleepStage(7)).toBe('awake');
    const intervals = hcSleepIntervals([
      { startTime: new Date(at(2026, 9, 21, 23)).toISOString(), endTime: new Date(at(2026, 9, 22, 7)).toISOString(), stages: [] },
    ]);
    expect(intervals).toEqual([{ start: at(2026, 9, 21, 23), end: at(2026, 9, 22, 7), stage: 'asleep' }]);
  });
});

describe('якість сну (§6.2)', () => {
  test('без фаз — лише тривалість, і це позначено', () => {
    expect(sleepQuality(240, null, null, null, 480)).toEqual({ score: 50, byDurationOnly: true });
  });

  test('ідеальні частки фаз і мета → 100', () => {
    expect(sleepQuality(480, 480 * 0.18, 480 * 0.22, 0, 480)).toEqual({ score: 100, byDurationOnly: false });
  });

  test('нема глибокого сну і багато пробуджень — оцінка падає', () => {
    const q = sleepQuality(480, 0, 480 * 0.22, 60, 480)!;
    // 0.45*100 + 0.25*0 + 0.20*100 + 0.10*0
    expect(q.score).toBe(65);
  });

  test('немає сну — немає оцінки', () => {
    expect(sleepQuality(null, null, null, null, 480)).toBeNull();
    expect(sleepQuality(0, 0, 0, 0, 480)).toBeNull();
  });
});

describe('одиниці', () => {
  test('SpO2: частка HealthKit → відсоток; відсоток Health Connect не множиться', () => {
    expect(spo2Percent(0.97)).toBe(97);
    expect(spo2Percent(96.4)).toBe(96);
    expect(spo2Percent(null)).toBeNull();
    expect(spo2Percent(0)).toBeNull();
  });
});

const read = (over: Partial<AutoDayRead> = {}): AutoDayRead => ({
  day: '2026-09-21', steps: 8000, activeCalories: 400, heartRateAvg: 75, restingHeartRate: 56,
  spo2: 97, distanceKm: 6.1, sleep: { total: 450, deep: 80, rem: 100, light: 250, awake: 15 }, ...over,
});

describe('похідні id і записи (ВАДА-3)', () => {
  test('id стабільні й однакові для обох ОС', () => {
    expect(autoEntryId('sleep_awake', '2026-09-22')).toBe('hk:sleep_awake:2026-09-22');
    expect(weightEntryId('2026-09-22', 'abc')).toBe(weightEntryId('2026-09-22', 'abc'));
    expect(stableHash('abc')).not.toBe(stableHash('abd'));
    expect(weightEntryId('2026-09-22', 'x'.repeat(100)).length).toBeLessThanOrEqual(64);
  });

  test('доба дає окремі pulse і pulse_rest, spo2, distance, сон і фази', () => {
    const now = new Date(2026, 8, 23, 10);
    const entries = buildAutoDayEntries(read(), 'healthconnect', now);
    const byType = Object.fromEntries(entries.map(e => [e.type, e]));
    expect(byType.pulse.value).toBe(75);
    expect(byType.pulse_rest.value).toBe(56);
    expect(byType.spo2.value).toBe(97);
    expect(byType.distance.value).toBe(6.1);
    expect(byType.sleep_deep.value).toBe(80);
    expect(byType.sleep.id).toBe('hk:sleep:2026-09-21');
    expect(entries.every(e => e.source === 'healthconnect')).toBe(true);
    // Минула доба — дата в межах цієї доби, а не «зараз».
    expect(new Date(byType.steps.date).getDate()).toBe(21);
  });

  test('null не стає нулем', () => {
    const entries = buildAutoDayEntries(read({ restingHeartRate: null, spo2: null, sleep: null, steps: 0 }), 'healthkit');
    const types = entries.map(e => e.type);
    expect(types).not.toContain('pulse_rest');
    expect(types).not.toContain('spo2');
    expect(types).not.toContain('sleep');
    expect(types).not.toContain('steps');
  });
});

describe('вага за датою заміру (ВАДА-2)', () => {
  test('кожен семпл — зі своєю датою, а не датою синку', () => {
    const measuredAt = new Date(2026, 8, 1, 7, 30).toISOString();
    const [w] = buildWeightEntries([{ value: 81.26, measuredAt, sourceKey: 'uuid-1' }], 'healthkit');
    expect(w.date).toBe(measuredAt);
    expect(w.value).toBe(81.3);
    expect(w.id).toBe(weightEntryId('2026-09-01', 'uuid-1'));
  });

  test('повторний синк того самого семпла не дублює запис', () => {
    const measuredAt = new Date(2026, 8, 1, 7, 30).toISOString();
    const fresh = buildWeightEntries([{ value: 81, measuredAt, sourceKey: 'uuid-1' }], 'healthkit');
    const once = mergeAutoEntries([], fresh);
    const twice = mergeAutoEntries(once, buildWeightEntries([{ value: 81, measuredAt, sourceKey: 'uuid-1' }], 'healthkit'));
    expect(twice).toBe(once);
    expect(twice).toHaveLength(1);
  });

  test('прибирання: ланцюжок однакових HK-значень → лишається найраніший; ручні не чіпаються', () => {
    const e = (id: string, day: number, value: number, source: HealthEntry['source']): HealthEntry =>
      ({ id, type: 'weight', value, source, date: new Date(2026, 8, day, 9).toISOString() });
    const entries = [
      e('a', 1, 80, 'healthkit'), e('b', 2, 80, 'healthkit'), e('c', 3, 80, 'healthkit'),
      e('m', 3, 80, 'manual'),
      e('d', 4, 79.5, 'healthkit'), e('e', 5, 79.5, 'healthkit'),
      e('hk:weight:2026-09-06:x', 6, 79.5, 'healthkit'), // справжній замір — не чіпати
    ];
    const { entries: out, removed } = collapseStaleHkWeights(entries);
    expect(removed).toBe(3);
    expect(out.map(x => x.id)).toEqual(['a', 'm', 'd', 'hk:weight:2026-09-06:x']);
  });
});

describe('злиття з наявними записами', () => {
  const now = new Date(2026, 8, 23, 10);

  test('старий запис синку (`__hk__`) того ж типу й доби замінюється, а не складається', () => {
    const legacy: HealthEntry = { id: '1726000000_1', type: 'steps', value: 5000, note: '__hk__', source: 'healthkit', date: new Date(2026, 8, 21, 22).toISOString() };
    const manual: HealthEntry = { id: 'm1', type: 'steps', value: 3000, date: new Date(2026, 8, 21, 12).toISOString() };
    const merged = mergeAutoEntries([legacy, manual], buildAutoDayEntries(read(), 'healthkit', now));
    const steps = merged.filter(e => e.type === 'steps');
    expect(steps.map(e => e.id).sort()).toEqual(['hk:steps:2026-09-21', 'm1']);
    // Ручний + авто — MAX, не сума (дедуплікацію не зламано).
    expect(sumForDay(merged, 'steps', new Date(2026, 8, 21))).toBe(8000);
  });

  test('повторний синк без змін — той самий масив (нуль мутацій)', () => {
    const fresh = buildAutoDayEntries(read(), 'healthkit', now);
    const once = mergeAutoEntries([], fresh);
    expect(mergeAutoEntries(once, buildAutoDayEntries(read(), 'healthkit', now))).toBe(once);
  });

  test('змінене значення перезаписує той самий id', () => {
    const once = mergeAutoEntries([], buildAutoDayEntries(read(), 'healthkit', now));
    const next = mergeAutoEntries(once, buildAutoDayEntries(read({ steps: 9100 }), 'healthkit', now));
    expect(next.filter(e => e.id === 'hk:steps:2026-09-21')).toHaveLength(1);
    expect(next.find(e => e.id === 'hk:steps:2026-09-21')!.value).toBe(9100);
  });

  test('видалений людиною автоматичний запис не відтворюється', () => {
    const merged = mergeAutoEntries([], buildAutoDayEntries(read(), 'healthkit', now), new Set(['hk:steps:2026-09-21']));
    expect(merged.some(e => e.id === 'hk:steps:2026-09-21')).toBe(false);
  });

  test('провалене читання нічого не видаляє', () => {
    const once = mergeAutoEntries([], buildAutoDayEntries(read(), 'healthkit', now));
    expect(mergeAutoEntries(once, [])).toBe(once);
  });

  test('Health Connect підпадає під «авто + тренування = максимум»', () => {
    const entries = mergeAutoEntries([], buildAutoDayEntries(read(), 'healthconnect', now));
    const day = new Date(2026, 8, 21);
    expect(burnedForDay(entries, [{ calories: 300, date: new Date(2026, 8, 21, 18).toISOString() }], day)).toBe(400);
    expect(burnedForDay(entries, [{ calories: 650, date: new Date(2026, 8, 21, 18).toISOString() }], day)).toBe(650);
  });

  test('ніч доби збирається з sleep + фаз', () => {
    const entries = mergeAutoEntries([], buildAutoDayEntries(read(), 'healthkit', now));
    expect(sleepNightForDay(entries, new Date(2026, 8, 21))).toEqual({ total: 450, deep: 80, rem: 100, light: 250, awake: 15 });
    expect(isDerivedAutoId('hk:sleep:2026-09-21')).toBe(true);
  });
});

describe('бекфіл (§8)', () => {
  const now = new Date(2026, 8, 23, 10);

  test('перший запуск — усі 7 діб, від найстарішої', () => {
    const days = daysToSync(null, now);
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-09-17');
    expect(days[6]).toBe('2026-09-23');
  });

  test('синк сьогодні вже був — учора й сьогодні (ніч могла дописатись)', () => {
    expect(daysToSync('2026-09-23', now)).toEqual(['2026-09-22', '2026-09-23']);
  });

  test('пропущені дні — від останньої синхронізованої включно', () => {
    expect(daysToSync('2026-09-20', now)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);
  });

  test('давно не відкривали — не глибше 7 діб', () => {
    expect(daysToSync('2026-08-01', now)).toHaveLength(7);
  });
});
