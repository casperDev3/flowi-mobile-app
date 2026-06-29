import {
  HealthEntry, HealthProfile,
  bmiCategory, calcBMI, calcBMR, calcCalorieTarget, calcProteinTarget, calcTDEE, calcWaterTarget,
  computeGoals, getWeeklyInsights, lastForDay, maxHR, stepsToKm, sumForDay,
} from '@/utils/healthUtils';

const maleProfile: HealthProfile = { sex: 'male', age: 30, heightCm: 180, activity: 'moderate', goal: 'maintain' };
const femaleProfile: HealthProfile = { ...maleProfile, sex: 'female' };

const daysAgoIso = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

describe('healthUtils — розрахунки', () => {
  test('calcBMR (Mifflin-St Jeor)', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(calcBMR(maleProfile, 80)).toBe(1780);
    // жінки: -161 замість +5 → 1614
    expect(calcBMR(femaleProfile, 80)).toBe(1614);
  });

  test('calcTDEE та цілі калорій', () => {
    expect(calcTDEE(maleProfile, 80)).toBe(Math.round(1780 * 1.55)); // 2759
    expect(calcCalorieTarget(maleProfile, 80)).toBe(2759); // maintain
    expect(calcCalorieTarget({ ...maleProfile, goal: 'lose' }, 80)).toBe(2259);
    expect(calcCalorieTarget({ ...maleProfile, goal: 'gain' }, 80)).toBe(3059);
  });

  test('білок / вода', () => {
    expect(calcProteinTarget({ ...maleProfile, goal: 'maintain' }, 80)).toBe(128);
    expect(calcProteinTarget({ ...maleProfile, goal: 'lose' }, 80)).toBe(160);
    expect(calcWaterTarget(70)).toBe(2450);
    expect(calcWaterTarget(80)).toBe(2800);
  });

  test('ІМТ і категорії', () => {
    expect(calcBMI(80, 200)).toBeCloseTo(20, 5);
    expect(bmiCategory(17)).toBe('underweight');
    expect(bmiCategory(22)).toBe('normal');
    expect(bmiCategory(27)).toBe('overweight');
    expect(bmiCategory(32)).toBe('obese');
  });

  test('maxHR та дистанція кроків', () => {
    expect(maxHR(30)).toBe(190);
    expect(stepsToKm(1000, 175)).toBeCloseTo(0.7245, 3);
  });

  test('computeGoals — fallback без профілю', () => {
    const g = computeGoals(null, 70);
    expect(g.calories).toBe(2200);
    expect(g.protein).toBe(112);
    expect(g.water).toBe(2000);
    expect(g.steps).toBe(10000);
    expect(g.sleep).toBe(480);
  });

  test('computeGoals — з профілем', () => {
    const g = computeGoals(maleProfile, 80);
    expect(g.calories).toBe(2759);
    expect(g.protein).toBe(128);
    expect(g.water).toBe(2800);
  });
});

describe('healthUtils — агрегати', () => {
  const today = new Date();
  const entries: HealthEntry[] = [
    { id: '1', type: 'water', value: 250, date: today.toISOString() },
    { id: '2', type: 'water', value: 500, date: today.toISOString() },
    { id: '3', type: 'weight', value: 80, date: today.toISOString() },
    { id: '4', type: 'weight', value: 79.5, date: today.toISOString() },
    { id: '5', type: 'water', value: 999, date: daysAgoIso(3) },
  ];

  test('sumForDay підсумовує лише сьогодні', () => {
    expect(sumForDay(entries, 'water', today)).toBe(750);
  });

  test('lastForDay повертає останнє значення дня', () => {
    expect(lastForDay(entries, 'weight', today)).toBe(79.5);
    expect(lastForDay(entries, 'pulse', today)).toBeNull();
  });
});

describe('healthUtils — тижневі інсайти', () => {
  test('виявляє зростання кроків тиждень-до-тижня', () => {
    const entries: HealthEntry[] = [];
    // поточний тиждень: 10000 кроків/день
    for (let i = 0; i < 7; i++) entries.push({ id: `c${i}`, type: 'steps', value: 10000, date: daysAgoIso(i) });
    // попередній тиждень: 8000 кроків/день
    for (let i = 7; i < 14; i++) entries.push({ id: `p${i}`, type: 'steps', value: 8000, date: daysAgoIso(i) });

    const insights = getWeeklyInsights(entries);
    const steps = insights.find(i => i.type === 'steps');
    expect(steps).toBeDefined();
    expect(steps!.deltaPct).toBe(25); // (10000-8000)/8000 = +25%
    expect(steps!.good).toBe(true);   // більше кроків — добре
  });

  test('ігнорує зміни < 5%', () => {
    const entries: HealthEntry[] = [];
    for (let i = 0; i < 7; i++) entries.push({ id: `c${i}`, type: 'water', value: 2050, date: daysAgoIso(i) });
    for (let i = 7; i < 14; i++) entries.push({ id: `p${i}`, type: 'water', value: 2000, date: daysAgoIso(i) });
    expect(getWeeklyInsights(entries).find(i => i.type === 'water')).toBeUndefined();
  });
});
