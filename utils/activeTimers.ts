/**
 * utils/activeTimers.ts — реєстр таймерів, що йдуть ПРЯМО ЗАРАЗ.
 *
 * До цього в застосунку жили два незалежні таймери: відкритий запис у
 * task.timeEntries (без endedAt) і локальний секундомір вкладки Time. Перший
 * не мав власного місця в даних, другий не переживав перезапуск і не знав про
 * завдання. Тепер обидва — записи однієї синхронізованої колекції.
 *
 * Інваріант, на якому все тримається:
 *   active_timers   — сесії, що ТРИВАЮТЬ;
 *   task.timeEntries — сесії, що ЗАВЕРШИЛИСЬ (endedAt є завжди).
 * Відкритих записів у timeEntries більше не існує, тож «чи йде таймер»
 * питають у цієї колекції, а не шукають запис без endedAt.
 */

export type Shift = 'morning' | 'day' | 'evening' | 'night';

export interface ActiveTimer {
  /** Водночас local_id для синку — див. коментар до taskTimerId. */
  id: string;
  /** Є → таймер завдання. */
  taskId?: string;
  /**
   * Є → таймер наради (utils/meetings.ts). Немає ні taskId, ні meetingId —
   * вільний таймер вкладки Time.
   *
   * Окреме поле, а не розбір префікса id: id — ключ синхронізації, і читати
   * його по літерах означало б прибити формат ключа до кожного екрана.
   */
  meetingId?: string;
  /** Назва завдання, наради або введений вручну текст. */
  label: string;
  /**
   * ISO-мітка старту і ЄДИНЕ джерело пройденого часу. Лічильника «+1 щосекунди»
   * тут навмисно немає: він розходився з реальністю щоразу, коли застосунок
   * ішов у фон, і тим більше не пережив би перезапуск.
   */
  startedAt: string;
  shift: Shift;
  /** Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
}

/**
 * id таймера завдання ПОХІДНИЙ від id завдання, а не випадковий.
 *
 * Причина та сама, що в categories і finance_currencies (див. sync-contract.ts):
 * старт того самого завдання на двох пристроях мусить зійтися в ОДИН запис за
 * LWW. З випадковими id ми отримали б два паралельні таймери на одне завдання,
 * і зупинка одного лишила б другий вічно активним.
 */
export function taskTimerId(taskId: string): string {
  return `task:${taskId}`;
}

let adHocSequence = 0;

/**
 * Вільний таймер природного ключа не має — двічі запущений «Читання» це
 * справді дві різні сесії, які не мають зливатись. Тож id тут випадковий.
 */
export function adHocTimerId(): string {
  adHocSequence = (adHocSequence + 1) % 1_000_000;
  return `adhoc:${Date.now().toString(36)}-${adHocSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Найстаріший таймер — перший.
 *
 * Порядок навмисно не залежить від порядку запису в масив: у fullscreen-сітці
 * плитки не сміють мінятися місцями під пальцем користувача щоразу, як інший
 * пристрій щось дописав.
 */
export function sortTimers(timers: ActiveTimer[]): ActiveTimer[] {
  return [...timers].sort((left, right) => {
    const diff = new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime();
    // Битий startedAt дав би NaN і непередбачуваний порядок; id як
    // запасний ключ робить сортування стабільним у будь-якому разі.
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return left.id.localeCompare(right.id);
  });
}

export function findTimerForTask(
  timers: ActiveTimer[],
  taskId: string,
): ActiveTimer | undefined {
  return timers.find(timer => timer.taskId === taskId);
}

/**
 * Зміна доби за годиною старту: 06–12 ранок, 12–18 день, 18–24 вечір,
 * 00–06 ніч. Логіка була продубльована в екрані завдань і в екрані часу —
 * два незалежні джерела правди для однієї межі.
 */
export function shiftForDate(date: Date = new Date()): Shift {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'day';
  if (hour >= 18) return 'evening';
  return 'night';
}
