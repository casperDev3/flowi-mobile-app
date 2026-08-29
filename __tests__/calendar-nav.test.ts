import { mondayOf, shiftBySpan, spanLabel } from '../hooks/use-calendar-nav';

const d = (iso: string) => new Date(`${iso}T12:00:00`);

describe('mondayOf', () => {
  it('середа веде до понеділка того ж тижня', () => {
    expect(mondayOf(d('2026-08-26')).toDateString()).toBe(d('2026-08-24').toDateString());
  });

  it('понеділок лишається собою', () => {
    expect(mondayOf(d('2026-08-24')).toDateString()).toBe(d('2026-08-24').toDateString());
  });

  it('неділя веде НАЗАД, а не вперед', () => {
    // getDay() віддає 0 для неділі; наївне 1 - 0 = +1 день перекинуло б
    // на понеділок НАСТУПНОГО тижня, і тиждень поїхав би весь.
    expect(mondayOf(d('2026-08-30')).toDateString()).toBe(d('2026-08-24').toDateString());
  });

  it('обнуляє час', () => {
    const m = mondayOf(new Date('2026-08-26T23:59:59'));
    expect([m.getHours(), m.getMinutes(), m.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe('shiftBySpan', () => {
  it('тиждень — сім днів', () => {
    expect(shiftBySpan(d('2026-08-26'), 'week', 1).toDateString()).toBe(d('2026-09-02').toDateString());
    expect(shiftBySpan(d('2026-08-26'), 'week', -1).toDateString()).toBe(d('2026-08-19').toDateString());
  });

  it('квартал — три місяці', () => {
    expect(shiftBySpan(d('2026-08-15'), 'quarter', 1).getMonth()).toBe(10);
    expect(shiftBySpan(d('2026-08-15'), 'quarter', -1).getMonth()).toBe(4);
  });

  it('переходить через межу року', () => {
    const r = shiftBySpan(d('2026-12-15'), 'month', 1);
    expect([r.getFullYear(), r.getMonth()]).toEqual([2027, 0]);
    const l = shiftBySpan(d('2026-01-15'), 'month', -1);
    expect([l.getFullYear(), l.getMonth()]).toEqual([2025, 11]);
  });

  it('не мутує вхідну дату', () => {
    const input = d('2026-08-26');
    const before = input.getTime();
    shiftBySpan(input, 'year', 1);
    expect(input.getTime()).toBe(before);
  });
});

describe('spanLabel', () => {
  const months = ['Січень','Лютий','Березень','Квітень','Травень','Червень',
                  'Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
  const opts = { locale: 'uk-UA', months, quarters: ['I квартал','II квартал','III квартал','IV квартал'] };

  it('місяць — назва зі словника плюс рік', () => {
    expect(spanLabel(d('2026-08-15'), 'month', opts)).toBe('Серпень 2026');
  });

  it('рік — самé число', () => {
    expect(spanLabel(d('2026-08-15'), 'year', opts)).toBe('2026');
  });

  it('квартал рахується від нуля правильно', () => {
    expect(spanLabel(d('2026-01-15'), 'quarter', opts)).toBe('I квартал 2026');
    expect(spanLabel(d('2026-08-15'), 'quarter', opts)).toBe('III квартал 2026');
    expect(spanLabel(d('2026-12-15'), 'quarter', opts)).toBe('IV квартал 2026');
  });

  it('тиждень — діапазон від понеділка до неділі', () => {
    // Береться від понеділка, а не від самої дати: інакше підпис залежав
    // би від того, який день тижня випадково обрано.
    expect(spanLabel(d('2026-08-26'), 'week', opts)).toBe(
      spanLabel(d('2026-08-24'), 'week', opts),
    );
  });

  it('підписи кварталів приходять зі словника, а не вшиті', () => {
    const en = { ...opts, locale: 'en-US', quarters: ['Q1','Q2','Q3','Q4'] };
    expect(spanLabel(d('2026-08-15'), 'quarter', en)).toBe('Q3 2026');
  });
});
