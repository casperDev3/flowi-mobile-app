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
  /**
   * Проєкт завдання/наради, над яким іде сесія (WORKSPACE_PROJECTS_PLAN §3
   * «години за тиждень» на Огляді проєкту) — відсутнє для вільного таймера чи
   * особистого завдання. Копіюється з задачі/наради при старті, а не читається
   * з неї при зупинці: до того часу задачу могли вже перенести в інший проєкт.
   */
  projectId?: string;
  /** Назва завдання, наради або введений вручну текст. */
  label: string;
  /**
   * ISO-мітка старту і ЄДИНЕ джерело пройденого часу. Лічильника «+1 щосекунди»
   * тут навмисно немає: він розходився з реальністю щоразу, коли застосунок
   * ішов у фон, і тим більше не пережив би перезапуск.
   */
  startedAt: string;
  /**
   * ЛЕГАСІ, лише читання. Поділ доби на ранок/день/вечір/ніч прибрано з
   * продукту: за ним не будувався жоден звіт, а мітка «День» у блоці «Йде
   * зараз» нічого не казала про саму роботу — замість неї тепер проєкт
   * (timerProject нижче). Нові таймери поля не пишуть; у старих записах воно
   * лишається, і прибирати його з даних не треба — просто не читати.
   */
  shift?: Shift;
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

/** Мінімум проєкту, потрібний мітці таймера. */
export interface TimerProjectSource {
  id: string;
  name?: string;
  color?: string;
}

/** Мінімум завдання/наради: лише чий це проєкт. */
export interface TimerProjectOwner {
  id: string;
  projectId?: string | null;
}

/**
 * Чий таймер — для мітки в «Йде зараз» і в режимі зосередження.
 *
 *   personal — сесія ні до якого проєкту не належить («Особисте»);
 *   project  — проєкт знайдено: є назва й колір для крапки;
 *   unknown  — проєкт у таймера Є, але його немає в переданому списку (ще не
 *              завантажився, або доступ до проєкту втрачено). Показувати тут
 *              «Особисте» було б неправдою, тож мітки просто немає.
 */
export type TimerProject =
  | { kind: 'personal' }
  | { kind: 'project'; id: string; name: string; color?: string }
  | { kind: 'unknown'; id: string };

function ownerProject(
  owners: readonly TimerProjectOwner[] | undefined,
  id: string | undefined,
): string | undefined {
  if (!id || !Array.isArray(owners)) return undefined;
  const owner = owners.find(item => item?.id === id);
  return typeof owner?.projectId === 'string' && owner.projectId ? owner.projectId : undefined;
}

/**
 * Проєкт таймера. Однакова назва й поведінка з вебом (lib/active-timers.ts),
 * паритет — __tests__/fixtures/timer-project-parity.json.
 *
 * Порядок джерел:
 *   1. timer.projectId — його копіює стор при старті, і саме за ним сесія
 *      ляже в запис часу; мітка мусить казати те саме, що потім покаже звіт;
 *   2. проєкт завдання (tasks[taskId].projectId) — для старих таймерів, що
 *      стартували до появи timer.projectId;
 *   3. проєкт наради (meetings[meetingId].projectId), якщо наради передано.
 */
export function timerProject(
  timer: Pick<ActiveTimer, 'projectId' | 'taskId' | 'meetingId'>,
  projects: readonly TimerProjectSource[],
  tasks: readonly TimerProjectOwner[] = [],
  meetings: readonly TimerProjectOwner[] = [],
): TimerProject {
  const projectId = (typeof timer.projectId === 'string' && timer.projectId ? timer.projectId : undefined)
    ?? ownerProject(tasks, timer.taskId)
    ?? ownerProject(meetings, timer.meetingId);
  if (!projectId) return { kind: 'personal' };
  const project = Array.isArray(projects) ? projects.find(item => item?.id === projectId) : undefined;
  if (!project) return { kind: 'unknown', id: projectId };
  return {
    kind: 'project',
    id: projectId,
    name: typeof project.name === 'string' ? project.name : '',
    ...(typeof project.color === 'string' && project.color ? { color: project.color } : {}),
  };
}
