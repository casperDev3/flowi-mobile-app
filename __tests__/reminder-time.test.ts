import { initialReminderDraft, resolveReminderMoment } from '../utils/reminderTime';

const at = (iso: string) => new Date(iso);

describe('resolveReminderMoment', () => {
  const now = at('2026-08-27T18:00:00');

  it('бере день з дати, а час — з полів', () => {
    const r = resolveReminderMoment({ date: at('2026-08-30T05:00:00').toISOString(), hours: '09', mins: '30' }, now);
    expect(r.getDate()).toBe(30);
    expect([r.getHours(), r.getMinutes()]).toEqual([9, 30]);
  });

  it('минулий момент переноситься на завтра', () => {
    // О 18:00 задати «9:00» майже напевно означає завтрашній ранок;
    // нагадування в минулому не спрацює ніколи.
    const r = resolveReminderMoment({ date: now.toISOString(), hours: '09', mins: '00' }, now);
    expect(r.getDate()).toBe(28);
    expect(r.getHours()).toBe(9);
  });

  it('майбутній момент того ж дня лишається', () => {
    const r = resolveReminderMoment({ date: now.toISOString(), hours: '20', mins: '00' }, now);
    expect(r.getDate()).toBe(27);
  });

  it('затискає години й хвилини в межі доби', () => {
    // У поле можна набрати «99»; Date мовчки перенесла б це на наступні
    // доби, і нагадування спрацювало б за чотири дні замість сьогодні.
    const r = resolveReminderMoment({ date: now.toISOString(), hours: '99', mins: '99' }, now);
    expect([r.getHours(), r.getMinutes()]).toEqual([23, 59]);
    expect(r.getDate()).toBe(27);
  });

  it('порожні поля означають північ, а не NaN', () => {
    const r = resolveReminderMoment({ date: now.toISOString(), hours: '', mins: '' }, now);
    expect([r.getHours(), r.getMinutes()]).toEqual([0, 0]);
    expect(Number.isNaN(r.getTime())).toBe(false);
  });

  it('без дати бере сьогодні', () => {
    const r = resolveReminderMoment({ date: null, hours: '20', mins: '15' }, now);
    expect(r.getDate()).toBe(27);
  });

  it('секунди й мілісекунди обнулені', () => {
    const r = resolveReminderMoment({ date: now.toISOString(), hours: '20', mins: '00' }, now);
    expect([r.getSeconds(), r.getMilliseconds()]).toEqual([0, 0]);
  });
});

describe('initialReminderDraft', () => {
  const now = at('2026-08-27T18:05:00');

  it('без наявного нагадування — за пів години', () => {
    const d = initialReminderDraft(undefined, now);
    expect([d.hours, d.mins]).toEqual(['18', '35']);
  });

  it('переносить через межу години', () => {
    const d = initialReminderDraft(undefined, at('2026-08-27T18:45:00'));
    expect([d.hours, d.mins]).toEqual(['19', '15']);
  });

  it('наявне нагадування показується як є', () => {
    const existing = at('2026-09-01T07:05:00').toISOString();
    const d = initialReminderDraft(existing, now);
    expect([d.hours, d.mins]).toEqual(['07', '05']);
    expect(d.date).toBe(existing);
  });

  it('однозначні числа доповнюються нулем', () => {
    // Поле показує «07», а не «7»: інакше воно виглядає напівзаповненим.
    const d = initialReminderDraft(at('2026-08-27T07:05:00').toISOString(), now);
    expect(d.hours).toHaveLength(2);
    expect(d.mins).toHaveLength(2);
  });
});
