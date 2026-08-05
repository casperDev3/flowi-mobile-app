const mockHealthKit = {
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(async () => true),
  // Явні типи: без них jest.fn(async () => []) виводить never[], і мок не
  // приймає жодного семпла.
  queryStatisticsForQuantity: jest.fn<Promise<any>, [string, ...any[]]>(
    async () => ({ sumQuantity: { quantity: 0 } }),
  ),
  queryQuantitySamples: jest.fn<Promise<any[]>, any[]>(async () => []),
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

import { fetchTodayData, fetchWorkouts, initHealthKit } from '@/store/healthkit';

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
