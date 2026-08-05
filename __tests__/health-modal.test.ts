import { isValidHealthEntryInput } from '@/components/health/HealthEntryModal';

describe('health modal validation', () => {
  test('звичайний показник приймає лише додатне число', () => {
    expect(isValidHealthEntryInput('water', '')).toBe(false);
    expect(isValidHealthEntryInput('water', '0')).toBe(false);
    expect(isValidHealthEntryInput('weight', '70,5')).toBe(true);
  });

  test('сон вимагає додатну тривалість і коректні хвилини', () => {
    expect(isValidHealthEntryInput('sleep', '0', '0')).toBe(false);
    expect(isValidHealthEntryInput('sleep', '0', '30')).toBe(true);
    expect(isValidHealthEntryInput('sleep', '7', '60')).toBe(false);
    expect(isValidHealthEntryInput('sleep', '7', '30')).toBe(true);
  });
});
