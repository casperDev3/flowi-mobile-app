/**
 * utils/activeTimersBar.ts — чиста логіка глобальної панелі активних таймерів.
 *
 * Панель одна на весь застосунок (телефон — над табами, планшет — внизу
 * сайдбара) і показує або один таймер цілком, або «N таймери» з годинником
 * найстарішого. Підпис і вибір «головного» таймера винесені сюди, щоб обидва
 * компоненти погоджувались між собою і з вебом (lib/timers.ts timersSummary).
 */
import type { Lang } from '@/store/translations';
import { sortTimers, type ActiveTimer } from '@/utils/activeTimers';

export type TimerKind = 'task' | 'meeting' | 'adhoc';

/**
 * Вид таймера — за ПОЛЯМИ, а не за префіксом id: id — ключ синхронізації, і
 * його формат не має розповзатися по екранах (див. utils/activeTimers.ts).
 */
export function timerKind(timer: Pick<ActiveTimer, 'taskId' | 'meetingId'>): TimerKind {
  if (timer.taskId) return 'task';
  if (timer.meetingId) return 'meeting';
  return 'adhoc';
}

export type PluralForm = 'one' | 'few' | 'many';

/**
 * Форма множини.
 *
 * Українська: 1, 21, 31… — one; 2–4, 22–24… — few; решта (0, 5–20, 11–14) —
 * many. Англійська: лише 1 — one, решта many.
 */
export function pluralForm(count: number, lang: Lang): PluralForm {
  const n = Math.abs(Math.floor(Number.isFinite(count) ? count : 0));
  if (lang !== 'uk') return n === 1 ? 'one' : 'many';
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'one';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
  return 'many';
}

export interface TimersCountForms {
  timersCountOne: string;
  timersCountFew: string;
  timersCountMany: string;
}

/** «3 таймери» / «5 таймерів». Шаблони — зі словника, з підстановкою {n}. */
export function timersCountLabel(count: number, lang: Lang, forms: TimersCountForms): string {
  const form = pluralForm(count, lang);
  const template = form === 'one' ? forms.timersCountOne
    : form === 'few' ? forms.timersCountFew
    : forms.timersCountMany;
  return template.replace('{n}', String(Math.max(0, Math.floor(count))));
}

/**
 * Таймер, чий годинник показує згорнута панель: найстаріший. Він же і
 * найдовший, тож «скільки я вже працюю» панель відповідає чесно.
 */
export function primaryTimer(timers: readonly ActiveTimer[]): ActiveTimer | undefined {
  if (timers.length === 0) return undefined;
  return sortTimers([...timers])[0];
}
