import { HEALTH_ACCENTS, fmtSleep, getHealthColors } from '@/utils/healthTheme';

describe('healthTheme', () => {
  test('fmtSleep форматує години/хвилини', () => {
    expect(fmtSleep(450)).toBe('7г 30хв');
    expect(fmtSleep(480)).toBe('8 год');
    expect(fmtSleep(45)).toBe('45 хв');
  });

  test('getHealthColors відрізняє dark/light і має всі ключі', () => {
    const dark = getHealthColors(true);
    const light = getHealthColors(false);
    expect(dark.bg1).toBe('#0D0D0F');
    expect(light.bg1).toBe('#F1F1F3');
    for (const k of ['bg1', 'bg2', 'border', 'text', 'sub', 'dim', 'sheet', 'track', 'card'] as const) {
      expect(typeof dark[k]).toBe('string');
      expect(typeof light[k]).toBe('string');
    }
  });

  test('акценти визначені', () => {
    expect(HEALTH_ACCENTS.water).toBe('#10B981');
    expect(HEALTH_ACCENTS.prevention).toBeDefined();
  });
});
