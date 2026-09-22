/**
 * utils/pushLink.ts — куди веде тап по push (WORKSPACE_PROJECTS_CONTRACT.md §7).
 *
 * Чиста функція окремо від `store/push.ts` (той тягне expo-notifications/
 * expo-device/expo-secure-store — важкі нативні модулі для юніт-тесту):
 * маршрут — це просто рядок з полів payload-а, без жодного стору чи мережі.
 */
export interface PushLinkData {
  type?: 'assigned' | 'mentioned' | 'status_changed' | 'project_invite' | 'registration_request' | 'registration_decision';
  project_id?: string | null;
  /**
   * Реальний сервер (`flowi-server-app/core/expo_push.py notify_mentioned`)
   * шле для `mentioned` `collection: 'comments'` — незалежно від того, чи
   * коментар лежить під задачею, чи під нарадою. Тип цілі тоді несе лише
   * `url` (review finding: раніше клієнт чекав тут `'meetings'`, чого
   * сервер НІКОЛИ не надсилає, і кожна згадка під нарадою відкривала
   * редактор задачі з чужим id). `'tasks'`/`'meetings'` лишені як фолбек —
   * не той payload, що шле сервер, але безпечний, якщо колись пришле.
   */
  collection?: 'tasks' | 'meetings' | 'comments' | null;
  local_id?: string | null;
  /**
   * `ftrackingapp://project/{pid}/{task|meeting}/{targetId}` (контракт §7) —
   * для `mentioned` це ЄДИНЕ поле, що несе тип цілі; сервер `collection` не
   * розбирає його з тіла, а лише передає як є.
   */
  url?: string | null;
}

/** Тип цілі згадки з `url` — `.../project/{pid}/task/{id}` або `.../meeting/{id}`. */
function mentionedTargetFromUrl(url: string | null | undefined): { type: 'task' | 'meeting'; id: string } | null {
  if (!url) return null;
  const match = /\/project\/[^/]+\/(task|meeting)\/([^/?#]+)/.exec(url);
  if (!match) return null;
  try {
    return { type: match[1] as 'task' | 'meeting', id: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

/**
 * Маршрут для тапу по проєктному пушу — «вхід у проєкт = повна зміна
 * контексту» (план §3) стосується й приходу з пушу так само, як звичайного
 * відкриття проєкту зі списку:
 *  - `project_invite` → Огляд проєкту.
 *  - `assigned`/`status_changed` (завжди `tasks`) → повний редактор задачі
 *    (`(tabs)?open=`) — той самий шлях, що й `openTask` з деталі проєкту;
 *    редактор сам визначає `returnToProject` з `task.projectId` і закриється
 *    назад у простір проєкту.
 *  - `mentioned` → тип цілі береться з `url` (сервер завжди шле
 *    `collection: 'comments'`, §7); задача → той самий редактор, нарада →
 *    екран нарад проєкту з `?open=`.
 *
 * `null` — тип не веде нікуди в цьому релізі (registration_*, обробляються
 * окремо в `store/push.ts`) або даних недостатньо (немає `project_id`/id цілі).
 */
export function pushTapUrl(data: PushLinkData): string | null {
  if (!data.project_id) return null;

  if (data.type === 'project_invite') {
    return `/project/${encodeURIComponent(data.project_id)}/overview`;
  }

  if (data.type === 'assigned' || data.type === 'status_changed') {
    if (!data.local_id) return null;
    return `/(tabs)?open=${encodeURIComponent(data.local_id)}`;
  }

  if (data.type === 'mentioned') {
    const fromUrl = mentionedTargetFromUrl(data.url);
    // Легасі-фолбек: `collection` явно 'meetings'/'tasks' — не той payload,
    // що шле сервер сьогодні (він шле 'comments'), але якщо колись зміниться —
    // не регресимо. `url` (реальне джерело істини) має пріоритет.
    const targetType = fromUrl?.type ?? (data.collection === 'meetings' ? 'meeting' : data.collection === 'tasks' ? 'task' : null);
    const targetId = fromUrl?.id ?? data.local_id ?? null;
    if (!targetType || !targetId) return null;
    if (targetType === 'meeting') {
      return `/project/${encodeURIComponent(data.project_id)}/meetings?open=${encodeURIComponent(targetId)}`;
    }
    return `/(tabs)?open=${encodeURIComponent(targetId)}`;
  }

  return null;
}
