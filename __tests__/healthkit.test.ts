const mockHealthKit = {
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(async () => true),
  // Явні типи: без них jest.fn(async () => []) виводить never[], і мок не
  // приймає жодного семпла.
  queryStatisticsForQuantity: jest.fn<Promise<any>, [string, ...any[]]>(
    async () => ({ sumQuantity: { quantity: 0 } }),
  ),
  queryQuantitySamples: jest.fn<Promise<any[]>, any[]>(async () => []),
  // ERR-14: метод мусить бути в моку — інакше його відсутність рахується
  // як провал запиту (саме так і має бути в продукті).
  getMostRecentQuantitySample: jest.fn<Promise<any>, any[]>(async () => null),
  queryCategorySamples: jest.fn<Promise<any[]>, any[]>(async () => []),
  queryWorkoutSamples: jest.fn<Promise<any[]>, any[]>(async () => []),
};

jest.mock('@kingstinct/react-native-healthkit', () => ({
  __esModule: true,
  default: mockHealthKit,
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import {
  fetchTodayData, fetchTodayDataResult, fetchWorkouts, initHealthKit, readHealthKitDay, readHealthKitWeights,
} from '@/store/healthkit';

const STEPS = 'HKQuantityTypeIdentifierStepCount';
const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning';

/** Сумарні величини за ідентифікатором — так їх питає querySum. */
function mockSums(byIdentifier: Record<string, number>): void {
  mockHealthKit.queryStatisticsForQuantity.mockImplementation(
    async (identifier: string) => ({
      sumQuantity: { quantity: byIdentifier[identifier] ?? 0 },
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHealthKit.isHealthDataAvailable.mockReturnValue(true);
  mockHealthKit.requestAuthorization.mockResolvedValue(true);
  mockHealthKit.queryStatisticsForQuantity.mockResolvedValue({ sumQuantity: { quantity: 0 } });
  mockHealthKit.queryQuantitySamples.mockResolvedValue([]);
  mockHealthKit.getMostRecentQuantitySample.mockResolvedValue(null);
  mockHealthKit.queryCategorySamples.mockResolvedValue([]);
  mockHealthKit.queryWorkoutSamples.mockResolvedValue([]);
});

describe('HealthKit v13 initialization', () => {
  test('requests read access using v13 identifier strings', async () => {
    await expect(initHealthKit()).resolves.toBe(true);

    expect(mockHealthKit.requestAuthorization).toHaveBeenCalledWith({
      toRead: expect.arrayContaining([
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierHeartRate',
        'HKCategoryTypeIdentifierSleepAnalysis',
      ]),
    });
  });
});

describe('відʼємні величини від Apple', () => {
  // Спостережено на пристрої: активні калорії приходять зі знаком мінус.
  // Усе, що читається з HealthKit, — фізичні величини, які відʼємними бути не
  // можуть, тож мінус там завжди помилка знаку.
  //
  // Симптом був подвійним: на екрані «Apple Health» число показувалось як є,
  // тобто з мінусом, а в журнал calories_out воно не потрапляло взагалі —
  // там стоїть фільтр `> 0`. Те саме з дистанцією (queryDistance) і пульсом.

  test('відʼємні активні калорії стають додатними', async () => {
    mockSums({ [ACTIVE_ENERGY]: -437 });

    const data = await fetchTodayData();

    expect(data.activeCalories).toBe(437);
  });

  test('відʼємні кроки стають додатними', async () => {
    mockSums({ [STEPS]: -8421 });

    const data = await fetchTodayData();

    expect(data.steps).toBe(8421);
  });

  test('відʼємна дистанція не зникає через фільтр > 0', async () => {
    // queryDistance повертає null для значень <= 0, тож без модуля дистанція
    // просто пропадала з екрана.
    mockSums({ [DISTANCE]: -5300 });

    const data = await fetchTodayData();

    expect(data.distanceKm).toBe(5.3);
  });

  test('додатні значення не змінюються', async () => {
    mockSums({ [STEPS]: 1200, [ACTIVE_ENERGY]: 350 });

    const data = await fetchTodayData();

    expect(data.steps).toBe(1200);
    expect(data.activeCalories).toBe(350);
  });

  test('відʼємний пульс не проходить фільтр діапазону', async () => {
    // Модуль застосовується до вилучення, тож -72 стає 72 і потрапляє в
    // діапазон 30–300 як валідне значення.
    mockHealthKit.queryQuantitySamples.mockResolvedValue([
      { quantity: -72 }, { quantity: -74 },
    ]);

    const data = await fetchTodayData();

    expect(data.heartRateAvg).toBe(73);
  });

  test('калорії тренування зі знаком мінус стають додатними', async () => {
    mockHealthKit.queryWorkoutSamples.mockResolvedValue([{
      workoutActivityType: 37,
      totalEnergyBurned: { quantity: -256 },
      totalDistance: { quantity: -3200 },
      duration: { quantity: 1800 },
      startDate: new Date('2026-08-05T10:00:00Z'),
      endDate: new Date('2026-08-05T10:30:00Z'),
    }]);

    const [workout] = await fetchWorkouts();

    expect(workout.calories).toBe(256);
    expect(workout.distance).toBe(3200);
  });

  test('нечислові та нескінченні значення дають 0, а не NaN', async () => {
    mockHealthKit.queryStatisticsForQuantity.mockResolvedValue({
      sumQuantity: { quantity: Number.NaN },
    });

    const data = await fetchTodayData();

    expect(data.steps).toBe(0);
    expect(data.activeCalories).toBe(0);
  });
});

/**
 * ERR-14. До правки `querySum`/`querySamples` ковтали будь-яку помилку і
 * віддавали 0/[], тож «запит упав» і «сьогодні нуль кроків» приходили на
 * екран однаковими — а зверху ще й стояло «Оновлено HH:MM».
 */
describe('HealthKit — збій читання відрізняється від справжнього нуля', () => {
  test('усі запити впали → outcome.ok === false', async () => {
    mockHealthKit.queryStatisticsForQuantity.mockRejectedValue(new Error('HKError 5: authorization denied'));
    mockHealthKit.queryQuantitySamples.mockRejectedValue(new Error('HKError 5'));
    mockHealthKit.queryCategorySamples.mockRejectedValue(new Error('HKError 5'));
    mockHealthKit.getMostRecentQuantitySample.mockRejectedValue(new Error('HKError 5'));

    const { data, outcome } = await fetchTodayDataResult();

    expect(outcome.ok).toBe(false);
    expect(outcome.failures).toBeGreaterThan(0);
    expect(outcome.failures).toBe(outcome.queries);
    // Нулі нікуди не поділись — але тепер їх нема кому видати за факт.
    expect(data.steps).toBe(0);
  });

  test('справжній нуль: запити вдались → outcome.ok === true', async () => {
    const { data, outcome } = await fetchTodayDataResult();

    expect(outcome.ok).toBe(true);
    expect(outcome.failures).toBe(0);
    expect(data.steps).toBe(0);
  });

  test('частковий збій не оголошується повною відмовою', async () => {
    // Падає лише вибірка пульсу; суми читаються.
    mockHealthKit.queryQuantitySamples.mockRejectedValue(new Error('HKError 5'));

    const { outcome } = await fetchTodayDataResult();

    expect(outcome.ok).toBe(true);
    expect(outcome.failures).toBeGreaterThan(0);
  });

  test('сумісна обгортка fetchTodayData поводиться як раніше', async () => {
    const data = await fetchTodayData();
    expect(data.steps).toBe(0);
    expect(data.heartRateAvg).toBeNull();
  });
});

/**
 * ВАДА-1 / ВАДА-2 / H2 — нове читання доби.
 */
describe('readHealthKitDay / readHealthKitWeights', () => {
  const SLEEP = 'HKCategoryTypeIdentifierSleepAnalysis';
  const REST = 'HKQuantityTypeIdentifierRestingHeartRate';
  const SPO2 = 'HKQuantityTypeIdentifierOxygenSaturation';
  const d = (day: number, h: number, m = 0) => new Date(2026, 8, day, h, m);

  test('сон читається з вікна [D-1 18:00, D 12:00], а не з «учора 00:00»', async () => {
    const now = d(22, 20);
    await readHealthKitDay(d(22, 0), now);
    const call = mockHealthKit.queryCategorySamples.mock.calls.find(c => c[0] === SLEEP)!;
    expect(call[1].filter.date.startDate.getTime()).toBe(d(21, 18).getTime());
    expect(call[1].filter.date.endDate.getTime()).toBe(d(22, 12).getTime());
  });

  test('подвійний запис ночі не подвоює сон; inBed не рахується; фази окремо', async () => {
    mockHealthKit.queryCategorySamples.mockResolvedValue([
      { value: 0, startDate: d(21, 22), endDate: d(22, 7, 30) },  // inBed
      { value: 3, startDate: d(21, 23), endDate: d(22, 3) },
      { value: 4, startDate: d(22, 3), endDate: d(22, 4) },
      { value: 5, startDate: d(22, 4), endDate: d(22, 6) },
      { value: 2, startDate: d(22, 6), endDate: d(22, 6, 15) },
      { value: 1, startDate: d(21, 23), endDate: d(22, 6) },      // друге джерело, та сама ніч
    ]);
    const { read } = await readHealthKitDay(d(22, 0), d(22, 20));
    expect(read.sleep).toEqual({ total: 420, deep: 60, rem: 120, light: 420, awake: 15 });
  });

  test('пульс спокою — останній семпл ДОБИ; SpO2 частка → %', async () => {
    mockHealthKit.queryQuantitySamples.mockImplementation(async (id: string) => {
      if (id === REST) return [{ quantity: 58, startDate: d(22, 7) }, { quantity: 54, startDate: d(22, 23) }];
      if (id === SPO2) return [{ quantity: 0.95 }, { quantity: 0.97 }, { quantity: 0.98 }];
      return [];
    });
    const { read } = await readHealthKitDay(d(22, 0), d(22, 23, 30));
    expect(read.restingHeartRate).toBe(54);
    expect(read.spo2).toBe(97);
  });

  test('вага — кожен семпл зі своєю датою й uuid', async () => {
    mockHealthKit.queryQuantitySamples.mockResolvedValue([
      { quantity: 80.4, startDate: d(1, 7), uuid: 'A' },
      { quantity: 80.1, startDate: d(5, 7) },
    ]);
    const { samples, outcome } = await readHealthKitWeights(d(1, 0), d(7, 0));
    expect(outcome.ok).toBe(true);
    expect(samples[0]).toEqual({ value: 80.4, measuredAt: d(1, 7).toISOString(), sourceKey: 'A' });
    expect(samples[1].sourceKey).toBe(`${d(5, 7).toISOString()}:801`);
  });

  test('fetchTodayDataResult: вага приходить разом із датою заміру', async () => {
    mockHealthKit.getMostRecentQuantitySample.mockResolvedValue({ quantity: 79.9, startDate: d(1, 7) });
    const { data } = await fetchTodayDataResult();
    expect(data.weight).toBe(79.9);
    expect(data.weightAt).toBe(d(1, 7).toISOString());
  });
});
