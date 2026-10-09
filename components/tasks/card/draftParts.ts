/**
 * components/tasks/card/draftParts.ts — значення поля картки → частина чернетки.
 *
 * Картка править по одному полю, але пише через ту саму чернетку, що й
 * колишня форма (hooks/use-task-editor.ts): так спільні правила запису
 * (історія, проєкт→спринт→колонка, LWW по полю) лишаються в одному місці.
 */
import type { RecurrenceRule } from '@/components/shared/MeetingFormSheet';
import type { TaskDraft } from '@/hooks/use-task-editor';

/** Хвилини → поля «години/хвилини» чернетки. undefined — очистити. */
export function estimateDraft(minutes: number | undefined): Pick<TaskDraft, 'estHours' | 'estMins'> {
  if (!minutes || minutes <= 0) return { estHours: '', estMins: '' };
  return {
    estHours: minutes >= 60 ? String(Math.floor(minutes / 60)) : '',
    estMins: minutes % 60 ? String(minutes % 60) : '',
  };
}

/** Правило повторення → поля чернетки. undefined — вимкнути повторення. */
export function recurrenceDraft(rule: RecurrenceRule | undefined): Partial<TaskDraft> {
  if (!rule) return { repeat: false };
  return {
    repeat: true,
    repeatFreq: rule.freq,
    repeatInterval: rule.interval,
    repeatDays: rule.daysOfWeek ?? [],
    repeatEndType: rule.until ? 'until' : 'never',
    repeatUntil: rule.until ?? '',
  };
}
