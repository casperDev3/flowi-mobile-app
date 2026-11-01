/**
 * components/calendar/calendarZoneStrings.ts — підписи зон «Календаря» на
 * планшеті (статична зона: міні-місяць і список дня; динамічна: деталі події).
 *
 * Окремий маленький словник, а не store/translations.ts: зони — лише
 * планшетна розкладка цього екрана. Мова — з useI18n().lang. Телефон цих
 * рядків не бачить.
 */
import { useI18n } from '@/store/i18n';

const uk = {
  staticZone: 'Огляд дня',
  miniMonth: 'Міні-календар',
  prevMonth: 'Попередній місяць',
  nextMonth: 'Наступний місяць',
  eventDetails: 'Деталі події',
};

type CalendarZoneStrings = typeof uk;

const en: CalendarZoneStrings = {
  staticZone: 'Day overview',
  miniMonth: 'Mini calendar',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  eventDetails: 'Event details',
};

export function calendarZoneStrings(lang: string): CalendarZoneStrings {
  return lang === 'en' ? en : uk;
}

export function useCalendarZoneStrings(): CalendarZoneStrings {
  const { lang } = useI18n();
  return calendarZoneStrings(lang);
}
