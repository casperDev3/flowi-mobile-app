/**
 * utils/timeMigration.ts — одноразове перенесення сесій із `task.timeEntries`
 * у колекцію `time_entries`.
 *
 * Навіщо. До обʼєднання екранів «Час» і «Записи часу» в застосунку було ДВА
 * джерела правди про відпрацьований час: `time_entries` (дзеркало таймера й
 * ручні записи) і `task.timeEntries` (сесії всередині задачі). Екран «Записи
 * часу» читав ЛИШЕ друге, екран «Час» — ЛИШЕ перше, і два екрани про одне й те
 * саме показували різні підсумки. Тепер джерело одне — `time_entries`, а старі
 * сесії задач треба в нього перенести.
 *
 * Сесії в задачах ЛИШАЮТЬСЯ на місці: їх показує деталь задачі, і видалення
 * половини даних заради міграції списку — надто дорога ціна. Перенесення тут
 * означає «додати копію в спільну колекцію», а не «переїхати».
 *
 * ІДЕМПОТЕНТНІСТЬ — головна вимога. Функція виконується на КОЖНОМУ старті
 * застосунку (`store/migrations.ts`) і ще раз на першому відкритті екрана часу,
 * тож мусить бути no-op, щойно дані перенесені: id перенесеного запису
 * детермінований, а дублі з дзеркалом таймера (у нього id випадковий)
 * відсікаються за природним ключем «задача + кінець + тривалість».
 *
 * Старт застосунку — головна точка виклику саме тому, що цілісність даних не
 * має залежати від навігації: доки перенос жив лише на екрані «Час», людина,
 * яка туди не заходила, бачила розʼїхані підсумки на Огляді та в проєкті, а
 * синк розносив по пристроях неповну колекцію.
 */

import type { TimeRecord } from './timeEntries';

/** Сесія всередині задачі. Відкриті (без endedAt) не переносяться. */
export interface TaskSession {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
}

export interface MigratableTask {
  id: string;
  title: string;
  projectId?: string;
  timeEntries?: TaskSession[];
}

/**
 * id перенесеного запису — ПОХІДНИЙ від задачі й сесії.
 *
 * Причина та сама, що в `taskTimerId`: та сама сесія, перенесена на двох
 * пристроях, мусить зійтися в ОДИН запис за LWW. З випадковими id синк дав би
 * по копії на кожен пристрій, і час подвоївся б.
 */
export function migratedEntryId(taskId: string, sessionId: string): string {
  return `task-session:${taskId}:${sessionId}`;
}

/**
 * Природні ключі запису — для відсіву дублів.
 *
 * Ключів два, бо дзеркало таймера писало саму НАЗВУ задачі й не писало її id.
 * Нові дзеркала (`store/timer-context.tsx`) id уже пишуть, але СТАРІ записи
 * лишаються в сховищі назавжди, і саме їх цей перенос мусить упізнати. Тому
 * порівнюємо і так, і так: збіг за будь-яким ключем означає, що цей час у
 * колекції вже є.
 */
export function sessionKeys(record: {
  task?: string;
  taskId?: string;
  duration?: number;
  date?: string;
  endedAt?: string;
}): string[] {
  const endMs = Date.parse(record?.endedAt ?? record?.date ?? '');
  if (!Number.isFinite(endMs)) return [];
  const duration = Math.floor(Number(record?.duration) || 0);
  if (duration <= 0) return [];
  const keys: string[] = [];
  if (record?.taskId) keys.push(`id:${record.taskId}|${endMs}|${duration}`);
  const title = (record?.task ?? '').trim().toLowerCase();
  if (title) keys.push(`title:${title}|${endMs}|${duration}`);
  return keys;
}

export interface MigrationResult {
  /** Уся колекція після перенесення — найсвіжіші зверху. */
  entries: TimeRecord[];
  /** Скільки записів додано; 0 — писати в сховище нічого не треба. */
  added: number;
}

/**
 * Злиття сесій задач у колекцію записів часу.
 *
 * Чиста функція: нічого не читає й не пише — зі сховищем її поєднують
 * `store/migrations.ts` (на старті застосунку) і `app/(tabs)/time.tsx`.
 */
export function migrateTaskSessions(
  tasks: readonly MigratableTask[] | undefined,
  existing: readonly TimeRecord[] | undefined,
): MigrationResult {
  const current = (existing ?? []).filter(Boolean);
  const ids = new Set(current.map(entry => String(entry.id)));
  const keys = new Set<string>();
  for (const entry of current) for (const key of sessionKeys(entry)) keys.add(key);

  const added: TimeRecord[] = [];
  for (const task of tasks ?? []) {
    if (!task?.id) continue;
    for (const session of task.timeEntries ?? []) {
      // Без endedAt сесія ще ЙДЕ: її місце в `active_timers`, а не в історії.
      if (!session?.id || !session.endedAt) continue;
      const duration = Math.floor(Number(session.duration) || 0);
      if (duration <= 0) continue;
      const endMs = Date.parse(session.endedAt);
      if (!Number.isFinite(endMs)) continue;

      const id = migratedEntryId(task.id, session.id);
      if (ids.has(id)) continue;
      const candidate: TimeRecord = {
        id,
        task: task.title?.trim() || 'Без назви',
        taskId: task.id,
        projectId: task.projectId,
        duration,
        date: new Date(endMs).toISOString(),
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      };
      const candidateKeys = sessionKeys(candidate);
      if (candidateKeys.some(key => keys.has(key))) continue;

      ids.add(id);
      for (const key of candidateKeys) keys.add(key);
      added.push(candidate);
    }
  }

  if (!added.length) return { entries: current, added: 0 };
  return {
    entries: [...added, ...current].sort(
      (a, b) => Date.parse(b.date ?? '') - Date.parse(a.date ?? ''),
    ),
    added: added.length,
  };
}
