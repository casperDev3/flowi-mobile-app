/**
 * utils/taskHistory.ts — журнал подій завдання, ОДНЕ місце на весь застосунок.
 *
 * Фабрика події жила трьома дослівними копіями: `app/(tabs)/index.tsx`,
 * `store/timer-context.tsx` і `components/time/FullscreenTimers.tsx` (остання
 * навіть підписана «локальна копія»). Копії між собою не розходились, але сам
 * факт приватності робив історію недосяжною для решти екранів: швидке
 * створення задачі в проєкті (`app/project/[id]/tasks.tsx`,
 * `app/project/[id]/sprints.tsx`) записувало задачу БЕЗ історії — і вкладка
 * «Історія» такої задачі була порожня, хоча веб те саме створення журналює
 * (`lib/task-history.ts`, `appendHistory({}, "created")`).
 *
 * Дзеркало веб-копії навмисне: історію рендерять обидва клієнти за `type`,
 * тож розбіжність у формі запису дала б порожні рядки без іконки.
 */
import type { HistoryEventType, TaskHistoryEvent } from './taskUtils';

/**
 * Нова подія журналу.
 *
 * id — час + випадковий хвіст: у межах одного тика `Date.now()` не унікальний
 * (позначити готовими кілька підзадач поспіль — звичайна річ), а ключем списку
 * подій виступає саме він.
 *
 * `note` дописується лише коли він є: `{ note: undefined }` і відсутнє поле
 * після JSON-раунд-тріпу однакові, і зайвий ключ у записі лише заважав би
 * порівнювати події між клієнтами.
 */
export function makeHistoryEvent(type: HistoryEventType, note?: string): TaskHistoryEvent {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    at: new Date().toISOString(),
    type,
    ...(note ? { note } : {}),
  };
}

/**
 * Дописує подію до НАЯВНОГО журналу завдання, не втрачаючи записів з інших
 * клієнтів (та сама сигнатура, що в `lib/task-history.ts` вебу).
 *
 * Приймає `{ history }`, а не ціле завдання: викликач часто має на руках лише
 * чернетку майбутнього запису — тоді `appendHistory({}, 'created')`.
 */
export function appendHistory(
  task: { history?: TaskHistoryEvent[] },
  type: HistoryEventType,
  note?: string,
): TaskHistoryEvent[] {
  return [...(task.history ?? []), makeHistoryEvent(type, note)];
}
