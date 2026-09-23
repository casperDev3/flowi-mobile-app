/**
 * utils/pushLink.ts — куди веде тап по push (WORKSPACE_PROJECTS_CONTRACT.md §7)
 * і по картці центру сповіщень (docs/specs/notifications-module.md §11).
 *
 * Чиста функція окремо від `store/push.ts` (той тягне expo-notifications/
 * expo-device/expo-secure-store — важкі нативні модулі для юніт-тесту):
 * маршрут — це просто рядок з полів payload-а, без жодного стору чи мережі.
 *
 * Тут же — до якого модуля інтерфейсу належить подія (`modulesForEvent`):
 * це теж чиста функція від коду події, і її потребують і обробник push
 * (`store/notifications.ts`), і центр сповіщень (`api/notifications.ts`).
 */
export interface PushLinkData {
  /**
   * Легасі-тип (`core/notifications/channels/expo.py::LEGACY_TYPES`) — для
   * подій, яких старі збірки не знали, сервер кладе сюди сам код події.
   */
  type?: string;
  /** Код події реєстру сервера (`task.assigned`, `meeting.reminder`, …) — нові пуші. */
  event_type?: string | null;
  /** id запису інбоксу — тап по пушу позначає саме його прочитаним. */
  notification_id?: string | null;
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
  collection?: string | null;
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


// ─── Модулі інтерфейсу ──────────────────────────────────────────────────────

/**
 * Подія → модулі, без яких вона не має сенсу. Подія вимкненого модуля не
 * показується ні в інбоксі, ні в матриці налаштувань (самі записи на сервері
 * лишаються — увімкнули модуль назад, і вони знову видні).
 *
 * Порожній список — системна подія, видна завжди.
 */
const EVENT_MODULES: Record<string, readonly string[]> = {
  'task.assigned': ['projects'],
  'task.status_changed': ['projects'],
  'task.mentioned': ['projects'],
  'task.commented': ['projects'],
  'task.deadline_soon': ['tasks'],
  'task.overdue': ['tasks'],
  'task.reminder': ['tasks'],
  'sprint.started': ['projects'],
  'sprint.closed': ['projects'],
  'project.invite': ['projects'],
  'meeting.reminder': ['meetings'],
  'subscription.due_today': ['subscriptions'],
  'budget.limit_exceeded': ['budget'],
  'finance.balance_forecast_negative': ['finance'],
  'workout.program_assigned': ['workouts'],
  'workout.today': ['workouts'],
  'health.quest_closed': ['health'],
  'health.streak_at_risk': ['health', 'prevention'],
  'health.measurement_reminder': ['health'],
  'feedback.status_changed': [],
  'feedback.incoming': [],
  // Групи тренувань (training-module.md §9) — окремий модуль `training`.
  'training.invite': ['training'],
  'training.program_assigned': ['training'],
  'training.session_completed': ['training'],
  'training.quest_assigned': ['training'],
  'training.quest_completed': ['training'],
  'training.comment': ['training'],
  'training.leaderboard_weekly': ['training'],
  'registration.requested': [],
  'app.update_required': [],
};

/** Невідомий код — за префіксом, а не «завжди видно»: так нова подія того самого модуля теж ховається. */
const PREFIX_MODULES: [string, readonly string[]][] = [
  ['task.', ['tasks']],
  ['sprint.', ['projects']],
  ['project.', ['projects']],
  ['meeting.', ['meetings']],
  ['subscription.', ['subscriptions']],
  ['budget.', ['budget']],
  ['finance.', ['finance']],
  ['workout.', ['workouts']],
  ['health.', ['health']],
  ['training.', ['training']],
];

export function modulesForEvent(eventType: string): readonly string[] {
  const exact = EVENT_MODULES[eventType];
  if (exact) return exact;
  const prefix = PREFIX_MODULES.find(([p]) => eventType.startsWith(p));
  return prefix ? prefix[1] : [];
}

// ─── Deep link сервера → маршрут застосунку ─────────────────────────────────

const SCHEME = 'ftrackingapp://';

/**
 * `payload.url` сервера (`EventType.deep_link` у реєстрі) → маршрут expo-router.
 *
 * Список форм — рівно ті шаблони, що лежать у `core/notifications/registry.py`.
 * Невідома форма → `null`: краще лишити людину в центрі сповіщень, ніж
 * відкрити екран, який про цей запис нічого не знає.
 */
export function deepLinkRoute(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(SCHEME)) return null;
  const [rest, afterPath = ''] = url.slice(SCHEME.length).split('?', 2) as [string, string?];
  const pathOnly = rest.split('#')[0];
  let parts: string[];
  let query: URLSearchParams;
  try {
    parts = pathOnly.split('/').filter(Boolean).map(part => decodeURIComponent(part));
    // Рядок запиту потрібен лише формам із `?open=` (feedback) — розбираємо
    // його тут, до switch, бо шлях вище обрізано по `?`.
    query = new URLSearchParams(afterPath.split('#')[0]);
  } catch {
    return null;
  }
  const enc = encodeURIComponent;
  const [head, a, b, c] = parts;
  switch (head) {
    case 'project': {
      if (!a) return null;
      if (!b) return `/project/${enc(a)}/overview`;
      if (b === 'task' && c) return `/(tabs)?open=${enc(c)}`;
      if (b === 'meeting' && c) return `/project/${enc(a)}/meetings?open=${enc(c)}`;
      if (b === 'sprint') return c ? `/project/${enc(a)}/sprints?sprint=${enc(c)}` : `/project/${enc(a)}/sprints`;
      return `/project/${enc(a)}/overview`;
    }
    case 'task':
      return a ? `/(tabs)?open=${enc(a)}` : '/(tabs)';
    case 'meeting':
      return a ? `/meetings?open=${enc(a)}` : '/meetings';
    case 'subscriptions':
      return '/subscriptions';
    case 'finance':
      return '/(tabs)/explore';
    case 'workouts':
      return '/workouts';
    case 'health':
      return '/(tabs)/health';
    // Ідеї й баги — один екран (feedback-inbox.md §10.1); `/ideas` лишився
    // редиректом, але зайвий стрибок тут ні до чого.
    case 'ideas':
      return '/feedback';
    case 'feedback': {
      const open = query.get('open');
      return open ? `/feedback?open=${enc(open)}` : '/feedback';
    }
    case 'training':
      return trainingDeepLinkRoute(parts.slice(1));
    case 'admin':
      return '/admin-workspace';
    default:
      return null;
  }
}

/**
 * `ftrackingapp://training/…` (core/notifications/registry.py, training-module.md §9)
 * → маршрути `app/training/**`. Невідома форма всередині групи — на екран групи.
 */
function trainingDeepLinkRoute(parts: readonly string[]): string | null {
  const enc = encodeURIComponent;
  const [groupId, kind, id] = parts;
  if (!groupId) return '/training';
  if (groupId === 'session') return kind ? `/training/session/${enc(kind)}` : '/training';
  const base = `/training/${enc(groupId)}`;
  switch (kind) {
    case undefined:
      return base;
    case 'program':
      return id ? `${base}/program/${enc(id)}` : `${base}/programs`;
    case 'member':
      return id ? `${base}/member/${enc(id)}` : `${base}/members`;
    case 'quest':
      return id ? `${base}/quest/${enc(id)}` : `${base}/quests`;
    case 'log':
      return id ? `${base}/log/${enc(id)}` : base;
    case 'leaderboard':
      return `${base}/leaderboard`;
    default:
      return base;
  }
}

/**
 * Куди веде картка інбоксу чи тап по новому push. Порядок: deep link сервера
 * (він знає тип цілі точно), потім легасі-правила `pushTapUrl` за типом.
 */
export function notificationRoute(data: PushLinkData): string | null {
  const fromUrl = deepLinkRoute(data.url);
  if (fromUrl) return fromUrl;
  if (data.type === 'registration_request' || data.event_type === 'registration.requested') return '/admin-workspace';
  return pushTapUrl(data);
}
