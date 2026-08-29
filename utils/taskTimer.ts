/**
 * utils/taskTimer.ts — облік часу, витраченого на завдання.
 *
 * Інваріант змінився разом із появою реєстру active_timers:
 *   task.timeEntries — сесії, що ЗАВЕРШИЛИСЬ (endedAt є завжди);
 *   active_timers    — сесія, що ТРИВАЄ (див. utils/activeTimers.ts).
 *
 * Тому питання «чи йде таймер» тут більше не ставлять — на нього відповідає
 * стор, який єдиний володіє реєстром. Цьому файлу лишилась арифметика: він
 * рахує секунди, а мітку старту активної сесії отримує ззовні. Раніше він
 * шукав її сам, серед записів без endedAt — таких записів більше не буває.
 */

export interface TimeEntry {
  id: string;
  startedAt: string;
  /**
   * Після переїзду на реєстр — є завжди. Поле лишається опційним лише заради
   * даних, записаних до переїзду: міграція їх вичищає, але старий бекап або
   * пристрій зі старою версією можуть принести відкритий запис назад. Такий
   * запис не має тривалості, тож у підсумки він не потрапляє.
   */
  endedAt?: string;
  /** Секунди. Осмислене лише для завершених сесій. */
  duration: number;
}

export interface TimedTask {
  timeEntries?: TimeEntry[];
}

/**
 * Секунди від моменту старту. Ніколи не відʼємні: годинник пристрою може
 * зʼїхати назад (зміна часового поясу, ручне переведення), і показане
 * «-3 секунди» виглядало б як поламаний застосунок.
 */
export function elapsedSince(startedAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
}

/** Завершені сесії завдання — саме їх показує список і рахують підсумки. */
export function completedSessions(task: TimedTask): TimeEntry[] {
  return (task.timeEntries ?? []).filter(e => e.endedAt);
}

/** Увесь витрачений час, лише завершені сесії. */
export function totalTrackedSeconds(task: TimedTask): number {
  return completedSessions(task).reduce((acc, e) => acc + e.duration, 0);
}

/**
 * Увесь витрачений час разом із сесією, що триває.
 *
 * `activeStartedAt` приходить із реєстру активних таймерів, а не з завдання:
 * завдання про свою поточну сесію більше нічого не знає.
 */
export function totalSecondsIncludingActive(
  task: TimedTask,
  activeStartedAt?: string,
  now: number = Date.now(),
): number {
  return totalTrackedSeconds(task) + (activeStartedAt ? elapsedSince(activeStartedAt, now) : 0);
}
