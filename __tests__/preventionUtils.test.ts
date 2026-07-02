import {
  Habit, Medication,
  buildHealthReport, genId, habitDoneToday, habitStreak, medAdherence, medDueToday, medTakenToday, parseTimes,
} from '@/utils/preventionUtils';

const todayIso = () => new Date().toISOString();
const daysAgoIso = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

const mkMed = (over: Partial<Medication> = {}): Medication => ({
  id: 'm1', name: 'Вітамін D', times: ['08:00', '20:00'],
  startDate: todayIso(), active: true, log: [], createdAt: todayIso(), ...over,
});

const mkHabit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h1', title: 'Вода', icon: 'drop.fill', color: '#10B981', log: [], createdAt: todayIso(), ...over,
});

describe('preventionUtils — parseTimes', () => {
  test('фільтрує невалідне і доповнює години нулем', () => {
    expect(parseTimes('08:00, 9:30, bad, 20:00')).toEqual(['08:00', '09:30', '20:00']);
    expect(parseTimes('')).toEqual([]);
    expect(parseTimes('7:05')).toEqual(['07:05']);
  });
});

describe('preventionUtils — ліки', () => {
  test('medTakenToday рахує лише сьогоднішні прийоми', () => {
    const med = mkMed({ log: [{ date: todayIso(), takenAt: todayIso() }, { date: daysAgoIso(1), takenAt: daysAgoIso(1) }] });
    expect(medTakenToday(med)).toBe(1);
  });

  test('medDueToday = разів на день − прийнято', () => {
    expect(medDueToday(mkMed())).toBe(2); // 2 рази, 0 прийнято
    expect(medDueToday(mkMed({ log: [{ date: todayIso(), takenAt: todayIso() }] }))).toBe(1);
    expect(medDueToday(mkMed({ active: false }))).toBe(0); // неактивні не рахуються
  });

  test('medAdherence — % за 7 днів', () => {
    const med = mkMed({ times: ['08:00'], log: [{ date: todayIso(), takenAt: todayIso() }] });
    // очікувано 1 прийом / (1×7) ≈ 14%
    expect(medAdherence(med, 7)).toBe(14);
  });
});

describe('preventionUtils — звички', () => {
  test('habitDoneToday', () => {
    expect(habitDoneToday(mkHabit({ log: [todayIso()] }))).toBe(true);
    expect(habitDoneToday(mkHabit({ log: [daysAgoIso(1)] }))).toBe(false);
  });

  test('habitStreak рахує послідовні дні', () => {
    expect(habitStreak(mkHabit({ log: [todayIso(), daysAgoIso(1), daysAgoIso(2)] }))).toBe(3);
    // без сьогодні, але вчора+позавчора → серія 2 (рахується до вчора)
    expect(habitStreak(mkHabit({ log: [daysAgoIso(1), daysAgoIso(2)] }))).toBe(2);
    // розрив → серія обривається
    expect(habitStreak(mkHabit({ log: [todayIso(), daysAgoIso(2)] }))).toBe(1);
    expect(habitStreak(mkHabit({ log: [] }))).toBe(0);
  });
});

describe('preventionUtils — звіт та id', () => {
  test('buildHealthReport містить ключові розділи', () => {
    const report = buildHealthReport({
      meds: [mkMed()], checkups: [], vaccines: [],
      latestWeight: 80, bmi: 24.7, todayPulse: 68, locale: 'uk-UA',
    });
    expect(report).toContain('ЗВЕДЕННЯ');
    expect(report).toContain('80');
    expect(report).toContain('Вітамін D');
  });

  test('genId унікальний', () => {
    expect(genId()).not.toBe(genId());
  });
});
