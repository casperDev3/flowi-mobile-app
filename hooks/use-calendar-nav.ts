/**
 * hooks/use-calendar-nav.ts
 *
 * Навігація календарним режимом завдань: який період показано, як він
 * підписаний і як перейти до сусіднього.
 *
 * Період буває чотирьох масштабів, і кожен рахує «попередній/наступний»
 * по-своєму — тиждень зсувом на сім днів, квартал на три місяці. Раніше
 * ці правила були розписані двічі, окремо для «вперед» і «назад», у тілі
 * екрана; тут вони в одному місці й покриті тестами.
 */
import { useCallback, useMemo, useState } from 'react';

export type CalSpan = 'week' | 'month' | 'quarter' | 'year';

/** Понеділок того тижня, до якого належить дата. */
export function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // getDay() віддає 0 для неділі; у нас тиждень починається з понеділка,
  // тож неділя — це мінус шість днів, а не плюс один.
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

/** Зсунути дату на один період обраного масштабу. */
export function shiftBySpan(date: Date, span: CalSpan, direction: 1 | -1): Date {
  const d = new Date(date);
  switch (span) {
    case 'week':    d.setDate(d.getDate() + 7 * direction); break;
    case 'month':   d.setMonth(d.getMonth() + direction); break;
    case 'quarter': d.setMonth(d.getMonth() + 3 * direction); break;
    case 'year':    d.setFullYear(d.getFullYear() + direction); break;
  }
  return d;
}

export interface SpanLabelOptions {
  locale: string;
  /** Назви місяців зі словника. */
  months: string[];
  /** Готові підписи чотирьох кварталів, за порядком. */
  quarters: string[];
}

/** Підпис поточного періоду для шапки календаря. */
export function spanLabel(viewDate: Date, span: CalSpan, opts: SpanLabelOptions): string {
  if (span === 'week') {
    const from = mondayOf(viewDate);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString(opts.locale, { day: 'numeric', month: 'short' });
    return `${fmt(from)} – ${fmt(to)}`;
  }
  if (span === 'month') return `${opts.months[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  if (span === 'quarter') return `${opts.quarters[Math.floor(viewDate.getMonth() / 3)]} ${viewDate.getFullYear()}`;
  return String(viewDate.getFullYear());
}

export function useCalendarNav(labels: SpanLabelOptions) {
  const [span, setSpan] = useState<CalSpan>('month');
  const [viewDate, setViewDate] = useState(() => new Date());
  /** Обраний день у тижневому режимі — окремо від показаного періоду. */
  const [weekDay, setWeekDay] = useState(() => new Date());

  const weekMonday = useMemo(() => mondayOf(viewDate), [viewDate]);
  const headerLabel = useMemo(() => spanLabel(viewDate, span, labels), [viewDate, span, labels]);

  const step = useCallback((direction: 1 | -1) => {
    setViewDate(d => shiftBySpan(d, span, direction));
    // У тижневому режимі разом із періодом їде й обраний день: інакше
    // після переходу підсвіченим лишався б день з іншого тижня.
    if (span === 'week') setWeekDay(d => shiftBySpan(d, 'week', direction));
  }, [span]);

  const prev = useCallback(() => step(-1), [step]);
  const next = useCallback(() => step(1), [step]);

  return useMemo(
    () => ({ span, setSpan, viewDate, setViewDate, weekDay, setWeekDay, weekMonday, headerLabel, prev, next }),
    [span, viewDate, weekDay, weekMonday, headerLabel, prev, next],
  );
}
