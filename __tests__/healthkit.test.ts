const mockHealthKit = {
  isHealthDataAvailable: jest.fn(() => true),
  requestAuthorization: jest.fn(async () => true),
};

jest.mock('@kingstinct/react-native-healthkit', () => ({
  __esModule: true,
  default: mockHealthKit,
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import { initHealthKit } from '@/store/healthkit';

describe('HealthKit v13 initialization', () => {
  beforeEach(() => {
    mockHealthKit.isHealthDataAvailable.mockClear();
    mockHealthKit.requestAuthorization.mockClear();
  });

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
