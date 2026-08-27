/**
 * utils/taskTimer.ts — облік часу, витраченого на завдання.
 *
 * Сесія вважається активною, доки в неї немає endedAt. Її тривалість не
 * зберігається в даних, бо вона змінюється щосекунди: поле `duration`
 * заповнюється лише при зупинці. Тому «скільки зараз» доводиться щоразу
 * рахувати від startedAt, і саме тут живе ця різниця.
 */

export interface TimeEntry {
  id: string;
  startedAt: string;
  endedAt?: string;
  /** Секунди. Осмислене лише для завершених сесій. */
  duration: number;
}

export interface TimedTask {
  timeEntries?: TimeEntry[];
}

/** Сесія, що триває просто зараз. undefined, якщо таймер стоїть. */
export function getActiveTimerEntry(task: TimedTask): TimeEntry | undefined {
  return (task.timeEntries ?? []).find(e => !e.endedAt);
}

/** Скільки триває активна сесія, у секундах. 0, якщо таймер стоїть. */
export function activeSessionSeconds(task: TimedTask, now: number = Date.now()): number {
  const active = getActiveTimerEntry(task);
  if (!active) return 0;
  return elapsedSince(active.startedAt, now);
}

/**
 * Секунди від моменту старту. Ніколи не відʼємні: годинник пристрою може
 * зʼїхати назад (зміна часового поясу, ручне переведення), і показане
 * «-3 секунди» виглядало б як поламаний застосунок.
 */
export function elapsedSince(startedAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** Увесь витрачений час, включно з незавершеною сесією. */
export function totalSecondsIncludingActive(task: TimedTask, now: number = Date.now()): number {
  return (task.timeEntries ?? []).reduce(
    (acc, e) => acc + (e.endedAt ? e.duration : elapsedSince(e.startedAt, now)),
    0,
  );
}

/** Увесь витрачений час, лише завершені сесії. */
export function totalTrackedSeconds(task: TimedTask): number {
  return (task.timeEntries ?? []).reduce((acc, e) => acc + (e.endedAt ? e.duration : 0), 0);
}

/** Кількість завершених сесій. */
export function completedSessionCount(task: TimedTask): number {
  return (task.timeEntries ?? []).filter(e => e.endedAt).length;
}
