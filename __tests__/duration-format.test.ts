import { formatClock, formatDuration, formatDurationShort } from '../utils/durationFormat';

const uk = { hour: 'г', hourLong: 'год', minute: 'хв' };
const en = { hour: 'h', hourLong: 'hr', minute: 'min' };

describe('formatDuration', () => {
  it('години з хвилинами — обидві коротко', () => {
    expect(formatDuration(9000, uk)).toBe('2г 30хв');
  });

  it('рівні години — довге позначення', () => {
    // «2г» без хвилин поруч читається як обірваний рядок.
    expect(formatDuration(7200, uk)).toBe('2 год');
  });

  it('менше години — лише хвилини', () => {
    expect(formatDuration(2700, uk)).toBe('45 хв');
  });

  it('нуль не зникає', () => {
    expect(formatDuration(0, uk)).toBe('0 хв');
  });

  it('одиниці беруться зі словника', () => {
    // До цього чотири копії функції писали «год» незалежно від мови.
    expect(formatDuration(9000, en)).toBe('2h 30min');
    expect(formatDuration(7200, en)).toBe('2 hr');
  });

  it('секунди відкидаються, а не округлюються вгору', () => {
    expect(formatDuration(3659, uk)).toBe('1 год');
  });
});

describe('formatDurationShort', () => {
  it('одна одиниця без пробілу', () => {
    expect(formatDurationShort(9000, uk)).toBe('2г');
    expect(formatDurationShort(2700, uk)).toBe('45хв');
  });

  it('нуль — просто «0»', () => {
    expect(formatDurationShort(0, uk)).toBe('0');
  });

  it('години перекривають хвилини', () => {
    expect(formatDurationShort(9000, uk)).toBe('2г');
  });
});

describe('стійкість до зіпсованих даних', () => {
  it('відʼємне читається як нуль', () => {
    // Краще «0 хв», ніж «-1 год» через зіпсований запис.
    expect(formatDuration(-500, uk)).toBe('0 хв');
    expect(formatClock(-5)).toBe('00:00:00');
  });

  it('NaN не протікає в інтерфейс', () => {
    expect(formatDuration(NaN, uk)).toBe('0 хв');
    expect(formatDurationShort(NaN, uk)).toBe('0');
    expect(formatClock(NaN)).toBe('00:00:00');
  });
});

describe('formatClock', () => {
  it('доповнює нулями до двох розрядів', () => {
    expect(formatClock(3661)).toBe('01:01:01');
    expect(formatClock(59)).toBe('00:00:59');
  });

  it('години не переповнюються добою', () => {
    // 30 годин — це «30:00:00», а не «06:00:00»: це витрачений час,
    // а не час доби.
    expect(formatClock(108000)).toBe('30:00:00');
  });
});
