/**
 * utils/projectStream.ts — маршрутизація записів між особистим і проєктними
 * потоками синку (контракт WORKSPACE_PROJECTS_CONTRACT.md §3.4/§3.5).
 *
 * Чисті функції без AsyncStorage — рушій (`store/project-sync.ts`,
 * `store/synced-storage.ts`) тримає стан окремо, а тут лежить лише правило
 * «яка колекція з яким projectId у який потік іде».
 */

/** Колекції, що існують у потоці проєкту (контракт §2.1 `project_collections`). */
export const PROJECT_COLLECTIONS = [
  'projects',
  'project_budgets',
  'task_statuses',
  'tasks',
  'meetings',
  'notes',
  'time_entries',
  'sprints',
  'transactions',
  'subscriptions',
  // Регулярний дохід проєкту (finance-revamp.md §4.3) — бюджетна колекція,
  // як транзакції й підписки; той самий перелік, що й core/sync_contract.py.
  'recurring_incomes',
  'comments',
] as const;
export type ProjectCollection = (typeof PROJECT_COLLECTIONS)[number];

/** Колекції, чиї записи ЗАВЖДИ належать проєкту — особистої версії не існує. */
export const PROJECT_ONLY_COLLECTIONS: ReadonlySet<string> = new Set(['comments', 'project_budgets']);

export const PERSONAL_STREAM = 'personal';

/**
 * Ключ сховища для id проєктів з відомою колізією `409 project_id_taken`
 * (`store/project-sync.ts` `markProjectIdConflicted`). Живе тут (а не лише в
 * `project-sync.ts`), бо його мусять читати ОБИДВА рушії, що рахують «мої
 * проєкти»: `getMyProjectIds()` (`project-sync.ts`, для outbox-маршрутизації)
 * і `loadMyProjectIdsForPull()` (`sync-engine.tsx`, для §3.5 pull-guard
 * особистого синку) — вони не можуть імпортувати одне одного напряму
 * (`project-sync.ts` уже імпортує з `sync-engine.tsx`, зустрічний імпорт
 * замкнув би цикл), а розбіжність виключення давала мінор із ревʼю: легасі
 * проєкт з конфліктом id лишався б «своїм» для одного рушія і «чужим» для
 * іншого.
 */
export const PROJECT_ID_CONFLICTS_KEY = 'project_id_conflicts_v1';

export function isProjectCollection(collection: string): collection is ProjectCollection {
  return (PROJECT_COLLECTIONS as readonly string[]).includes(collection);
}

export function projectStreamId(projectId: string): string {
  return `project:${projectId}`;
}

export function isProjectStream(stream: string | null | undefined): boolean {
  return !!stream && stream.startsWith('project:');
}

/** id проєкту з рядка потоку, або null для 'personal'/невідомого формату. */
export function streamProjectId(stream: string | null | undefined): string | null {
  if (!stream || !stream.startsWith('project:')) return null;
  const id = stream.slice('project:'.length);
  return id.length ? id : null;
}

/**
 * «Мої проєкти» — обʼєднання кешу `GET /projects/` (workspace_projects) і
 * локально наявних проєктів (`projects` array). Друге — навмисний запасний
 * шлях: до першого успішного `GET /projects/` (або в соло-режимі, доки §3.6
 * міграція не виконана) кеш порожній, а локальні проєкти — це якраз ті, де
 * користувач власник.
 */
export function computeMyProjectIds(
  workspaceProjectIds: readonly string[],
  localProjectIds: readonly string[],
): Set<string> {
  return new Set([...workspaceProjectIds, ...localProjectIds]);
}

/**
 * Куди йде запис — контракт §3.5.
 *
 * `localId` — `local_id` мутації; для колекції `projects` це і є id проєкту,
 * для `project_budgets` — теж (`local_id == project.id`).
 *
 * `excludedProjectIds` — id з відомою колізією (`project_id_conflicts_v1`,
 * `store/project-sync.ts` `markProjectIdConflicted`): навіть якщо `data.id`
 * фолбек нижче інакше визнав би їх «своїм» потоком, контракт вимагає, щоб
 * такі записи лишались особистими (§3.5 fallback, §3.6). Необовʼязковий —
 * виклики, яким колізії не стосуються (напр. чисті тести хелперів), можуть
 * його не передавати.
 */
export function resolveOutboxStream(
  collection: string,
  localId: string,
  data: Record<string, unknown> | undefined,
  myProjectIds: ReadonlySet<string>,
  excludedProjectIds?: ReadonlySet<string>,
): string {
  if (collection === 'projects') {
    if (myProjectIds.has(localId)) return projectStreamId(localId);
    // Мінор із ревʼю: без цієї перевірки фолбек нижче (для delete, де
    // `myProjectIds` уже не бачить localId) повертав би 'project:<id>' і
    // для проєкту з ВІДОМОЮ колізією id (`409 project_id_taken`,
    // `project_id_conflicts_v1`) — `getMyProjectIds()` навмисно виключає такі
    // id (контракт §3.5 fallback «лишаються особистими»), а фолбек ігнорував
    // цю відмітку повністю, тож його upserts/delete осідали в outbox
    // потоку 'project:<id>' навіки (сервер тримає цей id за іншим власником).
    if (excludedProjectIds?.has(localId)) return PERSONAL_STREAM;
    // Видалення власного проєкту рахується ПІСЛЯ того, як рядок уже прибрано
    // з локального масиву `projects` (enqueueChanges передає СТАРИЙ знімок) —
    // на цю мить `myProjectIds` (що читає той самий масив) більше не бачить
    // localId, і без цієї гілки delete падав би на 'personal', а щойно
    // застосований upsert того самого id пішов у 'project:<id>' (мінор з
    // ревʼю: «A project's delete can go to a different stream than its
    // upserts»). Сам факт, що record — це запис ПРО ЦЕЙ проєкт (його id ==
    // localId), достатній: 'projects' завжди належить своєму потоку.
    if (data && typeof data === 'object' && data.id === localId) return projectStreamId(localId);
    return PERSONAL_STREAM;
  }
  if (collection === 'project_budgets') {
    return projectStreamId(localId);
  }
  if (!isProjectCollection(collection)) return PERSONAL_STREAM;

  const projectId = typeof data?.projectId === 'string' ? data.projectId : undefined;
  if (projectId && myProjectIds.has(projectId)) return projectStreamId(projectId);
  // Колекції лише-проєктні без розпізнаного projectId — трактувати як
  // особисті було б помилкою (сервер їх там не прийме), але без валідного
  // projectId мутацію нема куди слати коректно; лишаємо 'personal', аби вона
  // не губилась мовчки — сервер особистого /sync/ відхилить її як
  // invalid_collection, і запис піде в карантин, а не пропаде.
  return PERSONAL_STREAM;
}

/** ≤5, найновіший — першим, без дублікатів. */
export const RECENT_PROJECTS_MAX = 5;

export function pushRecentProject(
  list: readonly string[],
  projectId: string,
  max: number = RECENT_PROJECTS_MAX,
): string[] {
  const next = [projectId, ...list.filter(id => id !== projectId)];
  return next.slice(0, max);
}

export function removeFromRecentProjects(list: readonly string[], projectId: string): string[] {
  return list.filter(id => id !== projectId);
}

// ─── Стан синку проєктного потоку (курсор/ревізії на проєкт) ─────────────────

export interface ProjectSyncStateEntry {
  cursor: number;
  /** `${collection}:${local_id}` → revision, той самий формат, що й особистий. */
  revisions: Record<string, number>;
  role: 'owner' | 'member' | 'viewer';
  lastSyncedAt: number | null;
}

export type ProjectSyncStateMap = Record<string, ProjectSyncStateEntry>;

export function emptyProjectSyncState(role: ProjectSyncStateEntry['role'] = 'owner'): ProjectSyncStateEntry {
  return { cursor: 0, revisions: {}, role, lastSyncedAt: null };
}

/**
 * Проєкти, які варто синкати просто зараз: серверний курсор (з
 * `ProjectSummary`) пішов далі за локальний, АБО в outbox лежить хоч один
 * запис цього потоку (контракт §3.5 «коли синкати»).
 */
export function projectsNeedingSync(
  summaries: readonly { id: string; cursor: number }[],
  state: ProjectSyncStateMap,
  outboxStreams: ReadonlySet<string>,
): string[] {
  const result: string[] = [];
  for (const summary of summaries) {
    const local = state[summary.id]?.cursor ?? 0;
    const dirty = outboxStreams.has(projectStreamId(summary.id));
    if (summary.cursor > local || dirty) result.push(summary.id);
  }
  return result;
}

/**
 * До скількох проєктів тримати живий WebSocket одночасно (контракт §5.1:
 * «максимум для 10 проєктів»). Пріоритет — нещодавні (початок recent),
 * решта — поллінгом.
 */
export const MAX_PROJECT_SOCKETS = 10;

export function socketProjectIds(
  recent: readonly string[],
  allKnown: readonly string[],
  max: number = MAX_PROJECT_SOCKETS,
): string[] {
  const ordered = [...recent, ...allKnown.filter(id => !recent.includes(id))];
  return ordered.slice(0, max);
}

/**
 * Те саме, але ВІДКРИТИЙ ЗАРАЗ проєкт (`activeId`) отримує сокет завжди —
 * першим у списку.
 *
 * Без цього проєкт, у який користувач щойно зайшов, міг лишитись зовсім без
 * живого сокета: `recent` перечитується не миттєво, а коли своїх проєктів
 * більше за `MAX_PROJECT_SOCKETS`, «нещодавній» з хвоста списку взагалі не
 * потрапляв у зріз — екран оновлювався лише 60-секундним поллінгом. Саме це
 * й виглядало як «на мобільному в задачах проєкту старі дані, на вебі все
 * добре» (веб тримає один потік на всі проєкти, ліміту сокетів там немає).
 *
 * `activeId` витісняє САМИЙ ХВІСТ (найменш свіжий), а не додається понад
 * ліміт — контракт §5.1 обмежує кількість сокетів, а не їхній порядок.
 * Викликач передає сюди лише id, підтверджений сервером (кеш
 * `workspace_projects`): сокет на ще не створений проєкт сервер одразу
 * закриває 4404.
 */
export function socketProjectIdsWithActive(
  activeId: string | null,
  recent: readonly string[],
  allKnown: readonly string[],
  max: number = MAX_PROJECT_SOCKETS,
): string[] {
  const base = socketProjectIds(recent, allKnown, max);
  if (!activeId || max <= 0) return base;
  return [activeId, ...base.filter(id => id !== activeId)].slice(0, max);
}
