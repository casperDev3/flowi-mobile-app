import { hasFeature, requireFeature, setTier } from '@/utils/entitlements';

describe('entitlements (tiers)', () => {
  afterEach(() => setTier('pro')); // дефолт — повний доступ

  test('pro розблоковує все', () => {
    setTier('pro');
    expect(hasFeature('macros')).toBe(true);
    expect(hasFeature('doctorReport')).toBe(true);
    expect(hasFeature('aiAdvisor')).toBe(true);
  });

  test('free блокує plus- і pro-фічі', () => {
    setTier('free');
    expect(hasFeature('macros')).toBe(false);        // plus
    expect(hasFeature('doctorReport')).toBe(false);  // pro
  });

  test('plus відкриває plus, блокує pro', () => {
    setTier('plus');
    expect(hasFeature('personalGoals')).toBe(true);
    expect(hasFeature('unlimitedGroups')).toBe(true);
    expect(hasFeature('profileSync')).toBe(false);   // pro
  });

  test('requireFeature повертає доступ', () => {
    setTier('free');
    expect(requireFeature('macros')).toBe(false);
    setTier('pro');
    expect(requireFeature('macros')).toBe(true);
  });
});
