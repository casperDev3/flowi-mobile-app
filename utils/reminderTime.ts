/**
 * utils/reminderTime.ts — коли саме спрацює нагадування.
 *
 * Користувач задає дату й час двома окремими полями вводу, у які можна
 * набрати що завгодно. Перетворення цієї пари на конкретний момент має
 * два правила, які легко втратити при переписуванні форми, тому вони
 * живуть тут, а не в обробнику кнопки.
 */

export interface ReminderDraft {
  /** ISO-дата, з якої береться день. Порожня — береться сьогодні. */
  date: string | null;
  /** Години й хвилини як рядки з поля вводу; можуть бути порожні чи поза межами. */
  hours: string;
  mins: string;
}

/**
 * Момент спрацювання.
 *
 * Години й хвилини затискаються в межі доби: у полі вводу можна набрати
 * «99», і Date мовчки перенесла б це на наступні дні, а нагадування
 * спрацювало б за чотири доби замість сьогодні.
 *
 * Момент у минулому переноситься на завтра. Це навмисне: людина, яка о
 * 18:00 ставить «нагадай о 9:00», майже напевно має на увазі завтрашній
 * ранок, а нагадування в минулому не спрацює ніколи.
 */
export function resolveReminderMoment(draft: ReminderDraft, now: Date = new Date()): Date {
  const h = clamp(parseInt(draft.hours || '0', 10), 0, 23);
  const m = clamp(parseInt(draft.mins || '0', 10), 0, 59);

  const moment = draft.date ? new Date(draft.date) : new Date(now);
  moment.setHours(h, m, 0, 0);
  if (moment <= now) moment.setDate(moment.getDate() + 1);
  return moment;
}

/** Початкове наповнення форми: наявний час або «за пів години». */
export function initialReminderDraft(existingIso: string | undefined, now: Date = new Date()): ReminderDraft {
  const base = existingIso ? new Date(existingIso) : withMinutesAdded(now, 30);
  return {
    date: existingIso ?? base.toISOString(),
    hours: String(base.getHours()).padStart(2, '0'),
    mins: String(base.getMinutes()).padStart(2, '0'),
  };
}

function withMinutesAdded(date: Date, minutes: number): Date {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + minutes, 0, 0);
  return d;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}
