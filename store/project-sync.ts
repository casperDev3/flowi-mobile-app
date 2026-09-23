/**
 * store/project-sync.ts — синк потоків проєктів (WORKSPACE_PROJECTS_CONTRACT §3.4–3.5, §5.1).
 *
 * Особистий обмін (`store/sync-engine.tsx`, `/sync/user/v2/`) лишається без
 * змін по формі — цей модуль додає ПАРАЛЕЛЬНИЙ обмін по кожному проєкту,
 * куди клієнт належить: власний курсор і мапа ревізій на проєкт
 * (`project_sync_state_v1`), власний ендпоінт (`/projects/{id}/sync/`),
 * власний WebSocket-канал (`ws/project/{id}/`).
 *
 * Локальні дані лежать у ТИХ САМИХ ключах (`tasks`, `meetings`, `notes`,
 * `time_entries`, `sprints`, `transactions`, `subscriptions`,
 * `task_statuses`, `projects`) — «Особисте агрегує» (§3.7) працює само
 * собою: екрани й так читають ці ключі цілком, не питаючи, з якого потоку
 * прийшов конкретний рядок. Двоє нових колекцій (`comments`,
 * `project_budgets`) існують ЛИШЕ в потоці проєкту.
 *
 * Маршрутизація outbox (§3.5) реєструється тут через
 * `setOutboxStreamResolver()` у `store/synced-storage.ts` — так особистий
 * рушій і звичайні `saveSynced`/`updateSynced` виклики екранів не знають
 * нічого про проєкти, а резолвер підключається одним викликом при монтуванні
 * `ProjectSyncProvider`.
 */

import { AppState, AppStateStatus } from 'react-native';
import React, { useEffect, useRef } from 'react';

import { apiFetch, ApiError, getFreshAccessToken, OfflineError, refreshSession } from './api';
import { getWsBase } from './api-config';
import { isOnlineMode, subscribeOnlineMode } from './app-mode';
import { useAuth } from './auth';
import { loadData, saveData, saveDataChecked } from './storage';
import { withStorageLock } from './storage-lock';
import { appendConflicts, type SyncConflict } from './sync-conflicts';
import {
  applyRevisionUpdates,
  normalizeSyncLocalId,
  quarantineRejections,
  resolveConflictSide,
  setProjectsChangedHandler,
  setProjectSyncsIdleWaiter,
  syncRecordKey,
  type SyncRevisionMap,
} from './sync-engine';
import {
  applyPullItems,
  createMutationId,
  loadOutbox,
  markDirty,
  OutboxItem,
  removeFromOutbox,
  removeMutationsFromOutbox,
  removeOutboxByStream,
  revalidateOutboxStreams,
  setOutboxStreamResolver,
  setProjectSyncNotifier,
} from './synced-storage';
import { cachedWorkspaceConfig, getWorkspaceIncompatibility, loadWorkspaceConfig, subscribeWorkspaceIncompatibility } from './workspace';
import {
  computeMyProjectIds,
  isProjectStream,
  MAX_PROJECT_SOCKETS,
  PROJECT_COLLECTIONS,
  PROJECT_ID_CONFLICTS_KEY,
  projectsNeedingSync,
  projectStreamId,
  pushRecentProject,
  removeFromRecentProjects,
  resolveOutboxStream,
  socketProjectIdsWithActive,
  streamProjectId,
  type ProjectSyncStateEntry,
  type ProjectSyncStateMap,
} from '@/utils/projectStream';

// ─── Ключі сховища (контракт §9.1) ───────────────────────────────────────────
const WORKSPACE_PROJECTS_KEY = 'workspace_projects';
const PROJECT_SYNC_STATE_KEY = 'project_sync_state_v1';
export const RECENT_PROJECTS_KEY = 'recent_projects';

export interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  template: 'work' | 'simple';
  role: 'owner' | 'member' | 'viewer';
  member_count: number;
  cursor: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export async function getWorkspaceProjects(): Promise<ProjectSummary[]> {
  return loadData<ProjectSummary[]>(WORKSPACE_PROJECTS_KEY, []);
}

export async function setWorkspaceProjects(list: ProjectSummary[]): Promise<void> {
  await saveData(WORKSPACE_PROJECTS_KEY, list);
}

export async function getProjectSyncState(): Promise<ProjectSyncStateMap> {
  return loadData<ProjectSyncStateMap>(PROJECT_SYNC_STATE_KEY, {});
}

export async function setProjectSyncState(state: ProjectSyncStateMap): Promise<void> {
  await saveData(PROJECT_SYNC_STATE_KEY, state);
}

export async function getRecentProjects(): Promise<string[]> {
  return loadData<string[]>(RECENT_PROJECTS_KEY, []);
}

export async function addRecentProject(projectId: string): Promise<void> {
  const current = await getRecentProjects();
  await saveData(RECENT_PROJECTS_KEY, pushRecentProject(current, projectId));
}

export async function forgetRecentProject(projectId: string): Promise<void> {
  const current = await getRecentProjects();
  await saveData(RECENT_PROJECTS_KEY, removeFromRecentProjects(current, projectId));
}

// ─── Відкритий зараз проєкт (пріоритет сокета + негайний обмін) ──────────────

/**
 * Проєкт, у просторі якого користувач ЗАРАЗ (`app/project/[id]/_layout.tsx`).
 *
 * Модульний стан, а не React-контекст: його читає `ProjectSyncProvider`, що
 * стоїть у корені дерева ВИЩЕ за layout проєкту, тож знизу вгору контекстом
 * це не передати, а піднімати весь стан проєкту в корінь заради одного id —
 * забагато.
 */
let _activeProjectId: string | null = null;
const _activeProjectListeners = new Set<(id: string | null) => void>();

export function getActiveProjectId(): string | null {
  return _activeProjectId;
}

export function subscribeActiveProject(listener: (id: string | null) => void): () => void {
  _activeProjectListeners.add(listener);
  return () => { _activeProjectListeners.delete(listener); };
}

function notifyActiveProject(): void {
  for (const listener of [..._activeProjectListeners]) {
    try {
      listener(_activeProjectId);
    } catch (e) {
      if (__DEV__) console.warn('[project-sync] слухач активного проєкту впав:', e);
    }
  }
}

/**
 * Вхід у простір проєкту: зробити його «нещодавнім», підняти йому сокет
 * першим у черзі (`socketProjectIdsWithActive`) і ОДРАЗУ обміняти дані.
 *
 * До цього вхід у проєкт лише дописував id у `recent_projects` — жодного
 * обміну не відбувалось, і відкритий проєкт показував рівно те, що лежало в
 * AsyncStorage з минулого разу, доки не спрацює 60-секундний поллінг (а якщо
 * своїх проєктів більше за `MAX_PROJECT_SOCKETS` — і сокета в нього могло не
 * бути взагалі). Веб робить повний pull кожного приєднаного проєкту на вхід і
 * на повернення вкладки — це його мобільний відповідник.
 *
 * Офлайн (`isOnlineMode()` false) — тихо нічого не робить: `syncProject`
 * однаково вийде на першій же перевірці, а локальні дані лишаються, як були.
 */
export async function enterProject(projectId: string): Promise<void> {
  _activeProjectId = projectId;
  notifyActiveProject();
  await addRecentProject(projectId);
  await primeProjectSyncStatus(projectId);
  await syncProject(projectId);
  // Ще раз, уже ПІСЛЯ обміну: перший прохід міг застати проєкт ще не
  // підтвердженим сервером (кеш `workspace_projects` порожній — щойно
  // створений проєкт), а такому id сокет не відкривають навмисно. Обмін це
  // якраз і виправляє (`ensureProjectOnServer`), тож список сокетів варто
  // перерахувати ще раз, а не чекати наступного такту поллінгу.
  if (_activeProjectId === projectId) notifyActiveProject();
}

/** Вихід зі простору проєкту — знімає пріоритет сокета, якщо він ще за цим id. */
export function leaveProject(projectId: string): void {
  if (_activeProjectId !== projectId) return;
  _activeProjectId = null;
  notifyActiveProject();
}

// ─── Стан обміну для UI (індикатор у шапці розділів проєкту) ────────────────

export interface ProjectSyncStatus {
  phase: 'idle' | 'syncing';
  /** Момент останнього УСПІШНОГО обміну цього проєкту, або null. */
  lastSyncedAt: number | null;
}

/**
 * Зріз стану на проєкт для `useSyncExternalStore`: об'єкт заміняється лише
 * коли справді змінився, інакше React крутив би рендер по колу (getSnapshot
 * мусить повертати стабільне посилання).
 */
const IDLE_UNKNOWN: ProjectSyncStatus = { phase: 'idle', lastSyncedAt: null };
const _statusByProject = new Map<string, ProjectSyncStatus>();
const _statusListeners = new Set<() => void>();

export function getProjectSyncStatus(projectId: string): ProjectSyncStatus {
  return _statusByProject.get(projectId) ?? IDLE_UNKNOWN;
}

export function subscribeProjectSyncStatus(listener: () => void): () => void {
  _statusListeners.add(listener);
  return () => { _statusListeners.delete(listener); };
}

function setProjectSyncStatus(projectId: string, patch: Partial<ProjectSyncStatus>): void {
  const current = getProjectSyncStatus(projectId);
  const next: ProjectSyncStatus = { ...current, ...patch };
  if (next.phase === current.phase && next.lastSyncedAt === current.lastSyncedAt) return;
  _statusByProject.set(projectId, next);
  for (const listener of [..._statusListeners]) {
    try {
      listener();
    } catch (e) {
      if (__DEV__) console.warn('[project-sync] слухач стану обміну впав:', e);
    }
  }
}

/**
 * Підтягує `lastSyncedAt` зі сховища в модульний кеш — щоб індикатор показав
 * «оновлено о…» ще до першого обміну в цьому сеансі (після перезапуску
 * застосунку кеш порожній, а стан у `project_sync_state_v1` лишається).
 */
export async function primeProjectSyncStatus(projectId: string): Promise<void> {
  if (getProjectSyncStatus(projectId).lastSyncedAt != null) return;
  const entry = (await getProjectSyncState())[projectId];
  if (entry?.lastSyncedAt != null) setProjectSyncStatus(projectId, { lastSyncedAt: entry.lastSyncedAt });
}

/**
 * Pull-to-refresh на екрані проєкту: піти НА СЕРВЕР, а не перечитати
 * AsyncStorage (саме це й робили `onRefresh` Огляду й Завдань — спінер
 * крутився, дані лишались ті самі).
 *
 * `fetchWorkspaceProjects()` перед обміном — щоб жест заразом підхоплював
 * зміну ролі/назви й підтверджував проєкт, якому ще не підняли сокет.
 * Офлайн — просто виходить: показувати помилку на свідомий офлайн-режим нема
 * за що.
 */
export async function refreshProjectNow(projectId: string): Promise<void> {
  if (!isOnlineMode()) return;
  await fetchWorkspaceProjects();
  await syncProject(projectId);
  // Той самий перерахунок сокетів, що й у `enterProject`: жест міг бути
  // першим моментом, коли сервер узагалі підтвердив цей проєкт.
  if (_activeProjectId === projectId) notifyActiveProject();
}

/**
 * Чи є непроштовхнуті мутації потоку ЦЬОГО проєкту в outbox (контракт §9.4:
 * «при добровільному виході з непорожнім outbox — попередження») — review
 * finding: `app/project/[id]/members.tsx` виходив без цієї перевірки взагалі,
 * тож незбережена локальна правка (офлайн) тихо губилась разом з
 * `wipeLocalProject` після виходу.
 */
export async function hasPendingProjectOutbox(projectId: string): Promise<boolean> {
  const stream = projectStreamId(projectId);
  const outbox = await loadOutbox();
  return outbox.some(item => item.stream === stream);
}

/**
 * Id локальних проєктів, чий `POST /projects/` стабільно ловить
 * `409 project_id_taken` (легасі-колізія — контракт §0.5). Такий id
 * зайнятий ЧУЖИМ проєктом на сервері: `ensureProjectOnServer` ніколи не
 * створить його там, а `/projects/{id}/sync/` для нього означав би або
 * `404`, або (гірше) обмін із записами зовсім іншого власника. Контракт:
 * «такі записи мають лишатись особистими» — ця відмітка й виключає їх із
 * `getMyProjectIds()` нижче, інакше `resolveOutboxStream` продовжував би
 * маршрутизувати їхні мутації в `project:<id>` і вони висіли б у outbox
 * назавжди (мінор з ревʼю).
 */
async function markProjectIdConflicted(projectId: string): Promise<void> {
  const current = await loadData<string[]>(PROJECT_ID_CONFLICTS_KEY, []);
  if (!current.includes(projectId)) await saveData(PROJECT_ID_CONFLICTS_KEY, [...current, projectId]);
}

async function getConflictedProjectIds(): Promise<Set<string>> {
  return new Set(await loadData<string[]>(PROJECT_ID_CONFLICTS_KEY, []));
}

/**
 * «Мої проєкти» просто зараз: кеш `GET /projects/` ∪ локальний масив
 * `projects` (контракт §3.5 коментар у `utils/projectStream.ts`— перш ніж
 * §3.6-міграція й `GET /projects/` запрацюють, локальні проєкти й є єдиним
 * джерелом істини про те, що належить користувачу) МІНУС id з відомою
 * колізією (`project_id_conflicts_v1` — лишаються особистими, див. вище).
 */
export async function getMyProjectIds(): Promise<Set<string>> {
  const [workspaceProjects, localProjects, conflicted] = await Promise.all([
    getWorkspaceProjects(),
    loadData<{ id: string }[]>('projects', []),
    getConflictedProjectIds(),
  ]);
  const localIds = Array.isArray(localProjects)
    ? localProjects.map(p => p.id).filter(id => !conflicted.has(id))
    : [];
  return computeMyProjectIds(workspaceProjects.map(p => p.id), localIds);
}

/** Реєструє маршрутизацію outbox у synced-storage — викликається один раз при монтуванні провайдера. */
export function installOutboxStreamResolver(): () => void {
  setOutboxStreamResolver(async (collection, localId, record) => {
    // Мінор із ревʼю: `myProjectIds` уже виключає конфліктні id, але
    // `resolveOutboxStream`'ів фолбек для 'projects' (delete-кейс) ігнорував
    // цей факт і все одно повертав 'project:<id>' — передаємо ту саму
    // множину явно, щоб фолбек теж її поважав.
    const [myProjectIds, conflicted] = await Promise.all([getMyProjectIds(), getConflictedProjectIds()]);
    return resolveOutboxStream(collection, localId, record, myProjectIds, conflicted);
  });
  return () => setOutboxStreamResolver(null);
}

const _pendingProjectSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Дебаунсить негайний обмін ОДНОГО проєкту (800 мс — той самий такт, що й
 * WS-сигнал у `useProjectSockets`). Кілька правок поспіль в одному проєкті
 * штовхають лише один обмін після паузи, а не по одному на кожне натискання.
 */
function scheduleProjectSyncNow(projectId: string): void {
  const existing = _pendingProjectSyncTimers.get(projectId);
  if (existing) clearTimeout(existing);
  _pendingProjectSyncTimers.set(projectId, setTimeout(() => {
    _pendingProjectSyncTimers.delete(projectId);
    void syncProject(projectId);
  }, 800));
}

/**
 * Реєструє негайне пробудження проєктного обміну на кожну правку запису
 * проєктного потоку (WORKSPACE_PROJECTS_CONTRACT §3.5 «коли синкати» —
 * пункт про outbox-рядки конкретного проєкту). Без цього правка всередині
 * проєкту чекала б до 5-хвилинного поллінгу/повернення з фону/WS-сигналу
 * (той самий сервер про неї ще не знає) — тоді як особистий синк на ту саму
 * правку реагує за секунди (`setSyncScheduler`). Монтується поруч із
 * `installOutboxStreamResolver()`.
 */
export function installProjectSyncNotifier(): () => void {
  setProjectSyncNotifier(projectIds => {
    for (const id of projectIds) scheduleProjectSyncNow(id);
  });
  return () => {
    setProjectSyncNotifier(null);
    for (const timer of _pendingProjectSyncTimers.values()) clearTimeout(timer);
    _pendingProjectSyncTimers.clear();
  };
}

// ─── REST: створення / список / міграція проєктів (контракт §3.2, §3.6) ─────

/** GET /projects/ — оновлює кеш `workspace_projects` (§9.1); мовчить офлайн. */
export async function fetchWorkspaceProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await apiFetch<{ results: ProjectSummary[] }>('/projects/');
    const list = Array.isArray(res.results) ? res.results : [];
    await setWorkspaceProjects(list);
    return list;
  } catch (error) {
    if (!(error instanceof OfflineError) && __DEV__) {
      console.warn('[project-sync] GET /projects/ не вдалося:', error);
    }
    return getWorkspaceProjects();
  }
}

/**
 * Створює проєкт на сервері (§3.2), якщо клієнт про нього ще не знає (немає
 * в кеші `workspace_projects`). Викликається ПЕРЕД першим
 * `/projects/{id}/sync/`: без цього перший обмін щойно створеного проєкту
 * завжди впав би в `404 project_not_found`, а §9.4 трактує 404 як «доступу
 * більше немає» і стер би локальний проєкт, який просто ще не встиг
 * доїхати до сервера. Ідемпотентно для власника — контракт дозволяє повторний
 * POST того самого id (200 з наявним записом), тож викликати це на кожен
 * невідомий проєкт щоцикл безпечно.
 */
export async function ensureProjectOnServer(projectId: string): Promise<ProjectSummary | null> {
  const cached = (await getWorkspaceProjects()).find(p => p.id === projectId);
  if (cached) return cached;
  const localProjects = await loadData<Record<string, unknown>[]>('projects', []);
  const local = localProjects.find(p => p.id === projectId);
  if (!local) return null; // проєкт прибрали локально до першого синку — нема чого створювати
  try {
    const summary = await apiFetch<ProjectSummary>('/projects/', {
      method: 'POST',
      body: { id: projectId, template: local.template === 'simple' ? 'simple' : 'work', data: local },
    });
    const list = await getWorkspaceProjects();
    await setWorkspaceProjects([...list.filter(p => p.id !== summary.id), summary]);
    return summary;
  } catch (error) {
    if (error instanceof ApiError && error.status === 409 && error.code === 'project_id_taken') {
      // Легасі-колізія id (напр. Date.now().toString() зіткнувся з чужим) —
      // поза контролем клієнта; лишаємо проєкт локальним і не намагаємось
      // знову щоцикл (він однаково не мінятиме id сам). Позначаємо конфлікт
      // і одразу переприв'язуємо вже поставлені outbox-рядки цього проєкту
      // назад у 'personal' — інакше вони й далі лишались би адресовані
      // `project:<id>` (§3.5 fallback «лишаються особистими»).
      await markProjectIdConflicted(projectId);
      await revalidateOutboxStreams();
      if (__DEV__) console.warn(`[project-sync] id ${projectId} зайнятий іншим власником — див. WORKSPACE_PROJECTS_STATUS.md`);
    } else if (!(error instanceof OfflineError) && __DEV__) {
      console.warn(`[project-sync] створення проєкту ${projectId} не вдалося:`, error);
    }
    return null;
  }
}

const PENDING_PROJECT_DELETES_KEY = 'pending_project_deletes';

/**
 * Черга проєктів, видалених локально (`app/projects.tsx`), яким ще треба
 * `DELETE /projects/{id}/` (§3.2). Видалення проєкту — REST-дія власника, а
 * НЕ мутація потоку синку: `projects`-запис не можна прибрати через
 * `/projects/{id}/sync/` (сервер відповів би `invalid_operation` — запис
 * проєкту сервер видаляє лише через сам DELETE-ендпоінт). До цієї черги —
 * клієнт лишень видаляв локальний рядок `projects`, а diff у `enqueueChanges`
 * ставив мутацію `delete` у чергу outbox потоку `project:{id}`, яку сервер
 * стабільно відхиляв: проєкт лишався живим на сервері й на інших пристроях
 * назавжди (blocker з ревʼю).
 */
export async function getPendingProjectDeletes(): Promise<string[]> {
  return loadData<string[]>(PENDING_PROJECT_DELETES_KEY, []);
}

/**
 * Ставить проєкт у чергу на `DELETE /projects/{id}/` і одразу прибирає з
 * outbox усі непроштовхнуті мутації його потоку — без цього вони й далі
 * штовхались би в `/projects/{id}/sync/` і отримували reject паралельно з
 * REST-видаленням. Викликається з `app/projects.tsx` ОДРАЗУ після локального
 * видалення рядка `projects` (offline-friendly: сам факт видалення не чекає
 * мережі, а REST-виклик підхоплює `flushPendingProjectDeletes` нижче — на
 * найближчому `syncAllMyProjects`, тобто одразу, якщо онлайн, і повторно
 * після відновлення мережі).
 */
export async function queueProjectDeletion(projectId: string): Promise<void> {
  const current = await getPendingProjectDeletes();
  if (!current.includes(projectId)) {
    await saveData(PENDING_PROJECT_DELETES_KEY, [...current, projectId]);
  }
  await removeOutboxByStream(projectStreamId(projectId));
  if (isOnlineMode()) await flushPendingProjectDeletes();
}

/**
 * Проштовхує чергу `pending_project_deletes`. `404`/`403` (проєкт уже
 * видалено кимось іншим, або доступу вже нема) рахуються успіхом — мета
 * (проєкту на сервері немає) уже досягнута. Будь-яка інша помилка лишає id в
 * черзі для наступної спроби.
 */
export async function flushPendingProjectDeletes(): Promise<void> {
  if (!isOnlineMode()) return;
  const pending = await getPendingProjectDeletes();
  if (!pending.length) return;
  const stillPending: string[] = [];
  for (const projectId of pending) {
    try {
      await apiFetch(`/projects/${encodeURIComponent(projectId)}/`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
        // проєкту вже нема / доступу нема — досягнуто того самого результату
      } else if (error instanceof OfflineError) {
        stillPending.push(projectId);
        continue;
      } else {
        if (__DEV__) console.warn(`[project-sync] DELETE /projects/${projectId}/ не вдалося:`, error);
        stillPending.push(projectId);
        continue;
      }
    }
    // Успіх (або вже неіснуючий/недоступний проєкт) — прибираємо й локальні
    // рештки на випадок, якщо викликач ще не встиг (`wipeLocalProject` — та
    // сама утиліта, що й на 404 фонового синку, ідемпотентна).
    await wipeLocalProject(projectId);
  }
  if (stillPending.length !== pending.length) {
    await saveData(PENDING_PROJECT_DELETES_KEY, stillPending);
  }
}

const PROJECTS_MIGRATED_KEY = 'projects_migrated_v1';

interface ProjectsMigratedMark {
  workspaceId: string;
  userId: string;
  at: number;
}

interface MigrateProjectsResponse {
  migrated_projects: string[];
  moved_items: number;
  skipped: { project_id: string; reason: string }[];
  already_migrated: boolean;
}

/**
 * `POST /projects/migrate/` (§3.6) — переносить наявні локальні проєкти й
 * записи з projectId у простір проєкту на сервері. Клієнтська частина
 * ідемпотентності: позначка `projects_migrated_v1` на (workspace,user), щоб
 * не бити цей ендпоінт щоцикл — сам запит на сервері ідемпотентний, тож
 * повторний виклик тут не катастрофа, лише зайвий раунд.
 *
 * Викликається ЛИШЕ коли особистий outbox порожній (контракт §3.6): міграція
 * рухає записи з UserItem, і непроштовхнута локальна правка загубилась би
 * між «локально є» і «сервер уже вважає файл переміщеним».
 */
export async function migrateLegacyProjectsIfNeeded(workspaceId: string, userId: string): Promise<void> {
  if (!isOnlineMode()) return;
  const mark = await loadData<ProjectsMigratedMark | null>(PROJECTS_MIGRATED_KEY, null);
  if (mark && mark.workspaceId === workspaceId && mark.userId === userId) return;

  const outbox = await loadOutbox();
  if (outbox.some(item => !isProjectStream(item.stream))) return; // особистий outbox не порожній

  try {
    await apiFetch<MigrateProjectsResponse>('/projects/migrate/', { method: 'POST', body: {} });
    await saveData(PROJECTS_MIGRATED_KEY, { workspaceId, userId, at: Date.now() } satisfies ProjectsMigratedMark);
    // §3.6 «Після відповіді клієнт: GET /projects/, повний pull кожного
    // проєкту з 0, особистий синк» — курсори проєктів у 0, аби наступний
    // syncAllMyProjects перетягнув усе заново з мігрованого простору.
    await setProjectSyncState({});
    await fetchWorkspaceProjects();
    // Рядки outbox, поставлені ДО міграції для записів, чий projectId тепер
    // веде на мігрований проєкт, лишались би 'personal' проти серверного
    // тумбстоуна `_movedTo` (§3.5/§3.6) — переприв'язуємо їх до правильного
    // потоку тут-таки, а не чекаємо наступної реальної правки екрана.
    await revalidateOutboxStreams();
  } catch (error) {
    if (!(error instanceof OfflineError) && __DEV__) {
      console.warn('[project-sync] /projects/migrate/ не вдалося:', error);
    }
  }
}

// ─── Обмін одного проєкту (форма ідентична /sync/user/v2/ — контракт §3.4) ───

interface ProjectSyncResponseItem {
  collection: string;
  local_id: string;
  data: any;
  deleted: boolean;
  client_updated_at: string | null;
  updated_at: number;
  revision: number;
  change_seq: number;
}

interface ProjectSyncResponse {
  contract_version?: number;
  protocol_version: 2;
  project_sync_protocol?: number;
  project_id: string;
  role: 'owner' | 'member' | 'viewer';
  cursor: number;
  changes: ProjectSyncResponseItem[];
  acknowledged: { status: 'applied'; mutation_id: string; collection: string; local_id: string; revision: number; change_seq: number }[];
  conflicts: { status: 'conflict'; mutation_id: string; collection: string; local_id: string; server: ProjectSyncResponseItem | null; client: { data: any; deleted: boolean; base_revision: number | null } }[];
  rejected?: { status: 'rejected'; mutation_id: string; collection: string; local_id: string; reason: string; detail?: string }[];
  next_cursor: number | null;
}

interface ProjectMutation {
  mutation_id: string;
  collection: string;
  local_id: string;
  operation: 'upsert' | 'delete';
  data: Record<string, unknown>;
  base_revision: number | null;
  client_updated_at: string | null;
  force?: boolean;
}

async function buildProjectMutation(item: OutboxItem, revisions: SyncRevisionMap): Promise<ProjectMutation | null> {
  const localId = normalizeSyncLocalId(item.local_id);
  if (!localId) return null;
  let data: Record<string, unknown>;
  if (item.deleted) {
    data = {};
  } else {
    const stored = await loadData<unknown>(item.collection, []);
    const rows = Array.isArray(stored) ? (stored as Record<string, unknown>[]) : [];
    const found = rows.find(row => normalizeSyncLocalId(row.id) === localId);
    if (!found) return null;
    data = found;
  }
  const clientUpdatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : null;
  return {
    mutation_id: item.mutation_id ?? createMutationId(),
    collection: item.collection,
    local_id: localId,
    operation: item.deleted ? 'delete' : 'upsert',
    data,
    base_revision: revisions[syncRecordKey(item.collection, localId)] ?? null,
    client_updated_at: clientUpdatedAt,
    ...(item.force ? { force: true } : {}),
  };
}

/**
 * Застосовує рядки одного проєктного pull до тих самих локальних ключів, що й
 * особистий обмін (`tasks`, `meetings`, …), плюс `comments`/`project_budgets`
 * — колекції, що існують лише в потоці проєкту. Dirty-wins: рядок, який
 * лежить в outbox цього ж потоку непушеним, локальні дані не чіпає.
 */
async function applyProjectPull(
  projectId: string,
  items: ProjectSyncResponseItem[],
): Promise<Set<string>> {
  const skipped = new Set<string>();
  if (!items.length) return skipped;

  const outbox = await loadOutbox();
  const dirty = new Set(
    outbox
      .filter(o => streamProjectId(o.stream) === projectId)
      .map(o => syncRecordKey(o.collection, o.local_id)),
  );
  const expectedStream = projectStreamId(projectId);
  const myProjectIds = await getMyProjectIds();

  const byCollection = new Map<string, ProjectSyncResponseItem[]>();
  for (const item of items) {
    const list = byCollection.get(item.collection) ?? [];
    list.push(item);
    byCollection.set(item.collection, list);
  }

  for (const [collection, rows] of byCollection) {
    await withStorageLock(collection, async () => {
      const freshDirty = new Set(dirty);
      for (const o of await loadOutbox()) {
        if (streamProjectId(o.stream) === projectId) freshDirty.add(syncRecordKey(o.collection, o.local_id));
      }
      const storedRaw = await loadData<unknown>(collection, []);
      const local = Array.isArray(storedRaw) ? (storedRaw as Record<string, unknown>[]) : [];
      // §3.5 (симетрично до `store/sync-engine.tsx`): рядок цього проєкту не
      // має видаляти/перезаписувати локальний запис, який зараз (за власним
      // `projectId`) маршрутизується в ІНШИЙ потік — інший проєкт (переміщено
      // деінде) або особистий (переміщено назад у Особисте). Не стосується
      // `projects`/`project_budgets` — `local_id == projectId`, вони завжди
      // цього потоку.
      //
      // review finding (major): порівняння лише проти ІСНУЮЧОГО локального
      // рядка блокувало й ЛЕГІТИМНЕ переміщення В цей потік — §3.5
      // «переміщення = delete у старому потоці + upsert (base_revision: null)
      // у новому»: доки upsert цього ж запису не приїхав, старий local-рядок
      // ще маршрутизується у старий потік, і guard заблокував би саме той
      // upsert, що мав завершити переміщення СЮДИ. Порядок надходження двох
      // pull'ів (WS/дебаунс різних потоків) недетермінований, тож запис
      // губився назавжди в одному з двох порядків (P1→P2, і симетрично в
      // `applyPullResponse` нижче — P→Personal). Тепер: upsert, чиї ВЛАСНІ
      // дані (`row.data.projectId`) маршрутизуються саме в цей потік,
      // застосовується завжди — він і є завершенням переміщення. Guard і далі
      // захищає протилежний напрямок: тумбстоун (delete) чи upsert, чиї власні
      // дані ведуть в ІНШИЙ потік, для запису, що зараз (за старою локальною
      // копією) уже вважається таким, що належить іншому потоку.
      if (collection !== 'projects' && collection !== 'project_budgets') {
        const localById = new Map(local.map(row => [String(row.id), row]));
        for (const row of rows) {
          const existing = localById.get(row.local_id);
          if (!existing) continue;
          const currentStream = resolveOutboxStream(collection, row.local_id, existing, myProjectIds);
          if (currentStream === expectedStream) continue;
          if (!row.deleted) {
            const incomingStream = resolveOutboxStream(collection, row.local_id, row.data, myProjectIds);
            if (incomingStream === expectedStream) continue; // завершує переміщення СЮДИ — не блокувати
          }
          freshDirty.add(syncRecordKey(collection, row.local_id));
        }
      }
      for (const row of rows) {
        const key = syncRecordKey(collection, row.local_id);
        if (freshDirty.has(key)) skipped.add(key);
      }
      // Пункт 7: `saveData` ковтає помилку `setItem` (переповнене сховище,
      // збій нативного модуля) — а курсор проєкту після цього все одно
      // зсувався, і ці рядки вже ніколи не приїхали б повторно. `Checked`
      // прокидає помилку: обмін падає, курсор лишається там, де був.
      await saveDataChecked(collection, applyPullItems(local as { id: string }[], rows, freshDirty, collection));
    });
  }
  return skipped;
}

interface ProjectExchangeResult {
  cursor: number;
  serverCursor: number;
  role: 'owner' | 'member' | 'viewer';
  revisions: SyncRevisionMap;
  conflicts: ProjectSyncResponse['conflicts'];
  /**
   * Сервер відхилив бодай одну мутацію з `reason: "forbidden"` (contract
   * §3.4/§4.1 — роль не дозволяла upsert/delete). `syncProject` тоді скидає
   * курсор/ревізії в 0, як і на зміну ролі: review finding — раніше
   * `removeMutationsFromOutbox` просто прибирав рядок з черги, а локальний
   * запис (уже змінений чи видалений UI, що мав ховати цю дію, але не
   * встиг/не зміг — застаріла роль у кеші, гонитва) назавжди лишався
   * розбіжним із сервером. Повний pull повертає його до правди сервера.
   */
  hadForbiddenRejection: boolean;
}

async function exchangeProject(
  projectId: string,
  initialCursor: number,
  mutations: ProjectMutation[],
  initialRevisions: SyncRevisionMap,
): Promise<ProjectExchangeResult> {
  let pageCursor = initialCursor;
  let finalCursor = initialCursor;
  let serverCursor = initialCursor;
  let revisions = initialRevisions;
  let role: ProjectExchangeResult['role'] = 'owner';
  const conflicts: ProjectSyncResponse['conflicts'] = [];
  let hadForbiddenRejection = false;

  for (let page = 0; page < 200; page++) {
    const response = await apiFetch<ProjectSyncResponse>(`/projects/${encodeURIComponent(projectId)}/sync/`, {
      method: 'POST',
      body: { cursor: pageCursor, mutations: page === 0 ? mutations : [] },
    });
    if (response.protocol_version !== 2) {
      throw new Error(`Unsupported project sync protocol ${String(response.protocol_version)}`);
    }
    role = response.role;

    const rejections = response.rejected ?? [];
    const finishedIds = new Set([
      ...response.acknowledged.map(i => i.mutation_id),
      ...response.conflicts.map(i => i.mutation_id),
      ...rejections.map(i => i.mutation_id),
    ]);
    await removeMutationsFromOutbox(finishedIds);
    if (rejections.some(r => r.reason === 'forbidden')) hadForbiddenRejection = true;
    if (rejections.length) {
      // ERR-06: відхилену мутацію прибирали з outbox, курсор скидали в 0, і
      // наступний pull повертав запис до серверної правди — введене зникало
      // з екрана без жодного слова. Особистий потік для цього давно має
      // карантин (`sync_rejected_v2` + список на /sync із «спробувати ще» /
      // «відкинути»); проєктний писав лише в __DEV__ console, тобто в релізі
      // не писав нікуди. Тепер обидва потоки ведуть ОДИН журнал.
      await quarantineRejections(rejections.map(r => ({ ...r, status: 'rejected' as const })));
      if (__DEV__) {
        console.warn(`[project-sync] ${projectId} відхилено:`, rejections.map(r => `${r.collection}:${r.local_id} (${r.reason})`));
      }
    }

    const conflictRows = response.conflicts.flatMap(c => c.server ? [c.server] : []);
    const conflictKeys = new Set(response.conflicts.map(c => syncRecordKey(c.collection, c.local_id)));
    const pulled = [...response.changes, ...conflictRows];
    const skippedDirty = await applyProjectPull(projectId, pulled.filter(item => !conflictKeys.has(syncRecordKey(item.collection, item.local_id))));
    revisions = applyRevisionUpdates(
      revisions,
      response.changes.filter(c => !skippedDirty.has(syncRecordKey(c.collection, c.local_id))),
      response.acknowledged,
    );
    conflicts.push(...response.conflicts);
    finalCursor = Math.max(finalCursor, response.cursor);
    serverCursor = response.cursor;

    if (response.next_cursor == null) return { cursor: finalCursor, serverCursor, role, revisions, conflicts, hadForbiddenRejection };
    if (response.next_cursor <= pageCursor) throw new Error('Server returned a non-advancing project sync cursor');
    pageCursor = response.next_cursor;
  }
  throw new Error('Project sync page limit exceeded');
}

let _projectSyncing = new Set<string>();
const _projectSyncIdleWaiters = new Set<() => void>();

/**
 * Дочекатись завершення обмінів по ВСІХ проєктах, що вже йдуть — той самий
 * major з ревʼю, що й `waitForSyncIdle` у `store/sync-engine.tsx`:
 * `logout()`/`switchWorkspace()` (store/auth.tsx) ставлять `setIsAuthed(false)`
 * і чекають на це ПЕРЕД витиранням локальних даних, бо `syncProject`, що вже
 * стартував (WS `projects_changed`, поллінг, повернення з фону), про цей
 * прапорець не знає і без очікування дописав би пул-результати вже покинутого
 * проєкту в щойно витерте сховище.
 */
export function waitForAllProjectSyncsIdle(): Promise<void> {
  if (_projectSyncing.size === 0) return Promise.resolve();
  return new Promise(resolve => { _projectSyncIdleWaiters.add(resolve); });
}

// «Витягнути все з сервера» (sync-engine.pullAllFromServer) скидає курсори
// проєктів і мусить спершу дочекатись обмінів, що вже йдуть. Реєстрація, а не
// імпорт, — sync-engine не може імпортувати цей модуль (цикл).
setProjectSyncsIdleWaiter(waitForAllProjectSyncsIdle);

/**
 * Повне локальне видалення проєкту (§9.4): усі записи `projectId == P` з
 * колекцій потоку проєкту, сам `projects/P` і `project_budgets/P`, outbox-рядки
 * `stream == project:P`, стан синку й кеші. Викликається як з добровільного
 * виходу/видалення (майбутнє §4), так і з фонового `syncProject` на
 * `404 project_not_found`/`403 not_a_member` — сервер каже «доступу більше
 * немає», тримати локальну копію даних сенсу нема.
 *
 * Навігація «якщо користувач зараз у цьому проєкті — повернути в Особисте»
 * (§9.4) тут НЕ робиться: модуль без доступу до router, а фоновий синк може
 * спрацювати, коли проєкт взагалі не відкритий — рішення, куди саме
 * повертати, лишене екрану проєкту (перевірка «мій проєкт ще існує?» при
 * фокусі), а не цій утиліті.
 */
async function wipeLocalProject(projectId: string): Promise<void> {
  const stream = projectStreamId(projectId);
  for (const collection of PROJECT_COLLECTIONS) {
    if (collection === 'projects' || collection === 'project_budgets') continue; // local_id == projectId, окремо нижче
    await withStorageLock(collection, async () => {
      const rows = await loadData<{ id: string; projectId?: string }[]>(collection, []);
      if (!Array.isArray(rows)) return;
      const next = rows.filter(row => row.projectId !== projectId);
      if (next.length !== rows.length) await saveData(collection, next);
    });
  }
  for (const collection of ['projects', 'project_budgets'] as const) {
    await withStorageLock(collection, async () => {
      const rows = await loadData<{ id: string }[]>(collection, []);
      if (!Array.isArray(rows)) return;
      const next = rows.filter(row => row.id !== projectId);
      if (next.length !== rows.length) await saveData(collection, next);
    });
  }
  await removeOutboxByStream(stream);

  const stateMap = await getProjectSyncState();
  delete stateMap[projectId];
  await setProjectSyncState(stateMap);

  const members = await loadData<Record<string, unknown>>('project_members_v1', {});
  if (members && projectId in members) {
    const { [projectId]: _removed, ...rest } = members;
    await saveData('project_members_v1', rest);
  }

  const workspaceProjects = await getWorkspaceProjects();
  if (workspaceProjects.some(p => p.id === projectId)) {
    await setWorkspaceProjects(workspaceProjects.filter(p => p.id !== projectId));
  }

  await forgetRecentProject(projectId);
  _statusByProject.delete(projectId);
}

/** Стирає лише бюджетні колекції проєкту — даунгрейд з owner (§3.4), доступ до решти лишається. */
async function wipeProjectBudgetData(projectId: string): Promise<void> {
  for (const collection of ['transactions', 'subscriptions', 'recurring_incomes'] as const) {
    await withStorageLock(collection, async () => {
      const rows = await loadData<{ id: string; projectId?: string }[]>(collection, []);
      if (!Array.isArray(rows)) return;
      const next = rows.filter(row => row.projectId !== projectId);
      if (next.length !== rows.length) await saveData(collection, next);
    });
  }
  await withStorageLock('project_budgets', async () => {
    const rows = await loadData<{ id: string }[]>('project_budgets', []);
    if (!Array.isArray(rows)) return;
    const next = rows.filter(row => row.id !== projectId);
    if (next.length !== rows.length) await saveData('project_budgets', next);
  });
}

/**
 * Повний обмін ОДНОГО проєкту: збирає його мутації з outbox (за `stream`),
 * штовхає їх, застосовує pull, вирішує конфлікти тим самим правилом LWW, що
 * й особистий синк (`resolveConflictSide` — свіжіший `updatedAt` перемагає).
 *
 * `404 project_not_found` / `403 not_a_member` (§3.5, §9.4) — проєкт мені
 * більше не доступний: стираємо ВСІ його локальні дані (`wipeLocalProject`),
 * а не лише стан синку — інакше рядки лишались би в outbox назавжди
 * (нескінченний повтор того самого 404) і в лічильнику pending.
 */
const _projectSyncPromises = new Map<string, Promise<void>>();

/**
 * Обмін одного проєкту. Паралельні виклики (жест pull-to-refresh поверх
 * WS-сигналу, вхід у проєкт поверх поллінгу) СКЛЕЮЮТЬСЯ в один обмін і
 * чекають на нього разом — раніше другий виклик просто виходив, і
 * pull-to-refresh знімав би спінер, поки обмін ще триває.
 */
export function syncProject(projectId: string): Promise<void> {
  const running = _projectSyncPromises.get(projectId);
  if (running) return running;
  const started = runProjectSync(projectId).finally(() => { _projectSyncPromises.delete(projectId); });
  _projectSyncPromises.set(projectId, started);
  return started;
}

async function runProjectSync(projectId: string): Promise<void> {
  // Мінор із ревʼю (той самий, що й у store/sync-engine.tsx currentGate):
  // workspace_changed/несумісна версія лишень редиректили UI на /workspace —
  // проєктний обмін проти старих токенів того самого origin продовжував іти.
  if (!isOnlineMode() || getWorkspaceIncompatibility() || _projectSyncing.has(projectId)) return;
  _projectSyncing.add(projectId);
  setProjectSyncStatus(projectId, { phase: 'syncing' });
  // Винесено з try — потрібне і в catch (нижче), щоб розрізнити «доступу
  // більше нема» від «сервер ще не бачив цей проєкт» на 404 (blocker з ревʼю).
  let hadPriorSync = false;
  try {
    const stateMap = await getProjectSyncState();
    const priorEntry = stateMap[projectId] ?? null;
    hadPriorSync = priorEntry != null && priorEntry.lastSyncedAt != null;
    const state: ProjectSyncStateEntry = priorEntry ?? { cursor: 0, revisions: {}, role: 'owner', lastSyncedAt: null };

    // Blocker з ревʼю: `syncProject` викликають і НАПРЯМУ, в обхід
    // `syncAllMyProjects()` (де ensureProjectOnServer уже гарантовано
    // відпрацював) — дебаунс-нотифаєр на кожен запис проєктного потоку
    // (`installProjectSyncNotifier`, 800 мс після будь-якої правки) і
    // WS `onclose` на 4404. Обидва шляхи для ЩОЙНО створеного проєкту
    // (ще не в кеші `workspace_projects`, ще без `lastSyncedAt`) без цієї
    // перевірки одразу впали б у `404 project_not_found` нижче й стерли б
    // проєкт, який просто ще не встиг доїхати до сервера. Створюємо явно —
    // `ensureProjectOnServer` ідемпотентний, повторний виклик безпечний.
    // review finding: якщо цей прохід сам щойно створив проєкт на сервері
    // (POST /projects/, §3.2 — сервер заводить `projects/{id}` з ревізією 1),
    // окремий outbox-рядок upsert `projects`/`projectId` (той самий запис,
    // що щойно поїхав у тілі POST) інакше штовхнувся б у ЦЕЙ ЖЕ /sync/ з
    // `base_revision: null` — ревізії щойно створеного рядка ми з POST не
    // знаємо (`ProjectSummary` її не несе), і сервер міг би повернути
    // конфлікт або no-op на власні щойно надіслані дані.
    let justCreatedOnServer = false;
    if (!hadPriorSync) {
      const knownOnServer = (await getWorkspaceProjects()).some(p => p.id === projectId);
      if (!knownOnServer) {
        const created = await ensureProjectOnServer(projectId);
        // Не вдалось (офлайн/мережа/легасі-колізія id) — не продовжуємо цей
        // цикл обміну проєктом, який сервер іще (чи вже ніколи) не визнає;
        // наступний виклик (нотифаєр/поллінг) спробує знову. НЕ стираємо
        // нічого — це не «доступу нема», а «ще не доїхало».
        if (!created) return;
        justCreatedOnServer = true;
      }
    }

    const outbox = await loadOutbox();
    const stream = `project:${projectId}`;
    if (justCreatedOnServer) {
      // Дропаємо його тут же — до формування мутацій, а не через staleIds
      // нижче: рядок валідний (`buildProjectMutation` знайшов би сам запис і
      // побудував би мутацію), просто зайвий у ЦЬОМУ обміні.
      await removeFromOutbox(new Set([`projects:${projectId}`]));
    }
    const projectOutbox = outbox
      .filter(item => item.stream === stream)
      .filter(item => !(justCreatedOnServer && item.collection === 'projects' && item.local_id === projectId));
    const mutations: ProjectMutation[] = [];
    const staleIds = new Set<string>();
    for (const item of projectOutbox) {
      const mutation = await buildProjectMutation(item, state.revisions);
      if (mutation) mutations.push(mutation);
      else if (item.mutation_id) staleIds.add(item.mutation_id);
    }
    if (staleIds.size) await removeMutationsFromOutbox(staleIds);

    let result = await exchangeProject(projectId, state.cursor, mutations, state.revisions);

    // Пункт 7 (симетрично до особистого `doSync`): курсор сервера, менший за
    // мій, означає, що потік проєкту на сервері перезібрано/відновлено. З
    // моїм старим курсором сервер віддавав би «змін нема» назавжди, і нові
    // записи (задачі з інших пристроїв) до цього пристрою не доходили б.
    // Обнуляємо курсор і ревізії й одразу повторюємо обмін з 0.
    if (state.cursor > 0 && result.serverCursor < state.cursor) {
      if (__DEV__) console.log(`[project-sync] ${projectId}: курсор сервера ${result.serverCursor} < мого ${state.cursor} — повний pull`);
      const retry = await exchangeProject(projectId, 0, [], {});
      result = {
        ...retry,
        conflicts: [...result.conflicts, ...retry.conflicts],
        hadForbiddenRejection: result.hadForbiddenRejection || retry.hadForbiddenRejection,
      };
    }

    // §3.4: роль у відповіді ≠ кешованої (і це НЕ перший синк цього проєкту —
    // щойно створений/приєднаний проєкт завжди «змінює» роль із дефолтного
    // 'owner'-заглушки, і це не даунгрейд) → скинути курсор/ревізії в 0, аби
    // наступний обмін зробив повний pull; даунгрейд з owner стирає бюджетні
    // колекції цього проєкту локально.
    const roleChanged = hadPriorSync && priorEntry.role !== result.role;
    if (roleChanged) {
      if (priorEntry.role === 'owner' && result.role !== 'owner') {
        await wipeProjectBudgetData(projectId);
      }
      if (__DEV__) console.log(`[project-sync] ${projectId} роль ${priorEntry.role} → ${result.role}: повний pull наступного разу`);
    }
    // review finding: сервер відхилив мутацію(ї) `forbidden` — роль,
    // з якою UI ЩОЙНО дозволив цю дію, застаріла (кеш, гонитва, або UI-гейт
    // цього конкретного місця взагалі не питав роль). `removeMutationsFromOutbox`
    // вище прибрав рядок із черги, але локальний запис (відредагований чи
    // видалений) без цього назавжди лишався б розбіжним із сервером — тут
    // так само, як при зміні ролі: скидаємо курсор/ревізії, щоб НАСТУПНИЙ
    // обмін ПОВНІСТЮ перечитав потік проєкту й повернув запис до правди
    // сервера (upsert — переписує назад; delete, якого сервер не прийняв, —
    // повертає рядок, якого локально вже нема).
    const needsFullResync = roleChanged || result.hadForbiddenRejection;
    if (result.hadForbiddenRejection && __DEV__) {
      console.warn(`[project-sync] ${projectId}: forbidden-відхилення — повний pull наступного разу для відкату локальних змін`);
    }

    const syncedAt = Date.now();
    const nextMap = await getProjectSyncState();
    nextMap[projectId] = {
      cursor: needsFullResync ? 0 : result.cursor,
      revisions: needsFullResync ? {} : result.revisions,
      role: result.role,
      lastSyncedAt: syncedAt,
    };
    await setProjectSyncState(nextMap);
    setProjectSyncStatus(projectId, { lastSyncedAt: syncedAt });

    if (result.conflicts.length) {
      const needsUser: SyncConflict[] = [];
      for (const conflict of result.conflicts) {
        const side = resolveConflictSide(
          conflict.client.data?.updatedAt,
          conflict.server?.client_updated_at,
          { localDeleted: conflict.client.deleted, serverMissing: !conflict.server },
        );
        if (side === 'local') {
          await markDirty(conflict.collection, conflict.local_id, conflict.client.deleted, true, stream);
        } else if (side === 'server' && conflict.server) {
          await applyProjectPull(projectId, [conflict.server]);
        } else {
          // 'manual' — та сама черга ручного вирішення, що й особистий синк
          // (store/sync-conflicts.ts, показує app/sync.tsx і app/data.tsx):
          // без явного рішення запис не має тихо зникати з жодної сторони.
          // Префікс id проєктом — інакше конфлікт того самого local_id у
          // двох різних проєктах ліг би в чергу під одним ключем.
          needsUser.push({
            id: `${projectId}:${syncRecordKey(conflict.collection, conflict.local_id)}`,
            dataKey: conflict.collection,
            local: { id: conflict.local_id, ...(conflict.client.data ?? {}) },
            remote: conflict.server ? { id: conflict.local_id, ...(conflict.server.data ?? {}) } : null,
          });
        }
      }
      if (needsUser.length) await appendConflicts(needsUser);
    }
  } catch (error) {
    // Контракт §3.4 називає конкретний код — `404 project_not_found`. Будь-який
    // ІНШИЙ 404 (проксі, помилковий шлях) не мусить стирати локальні дані
    // проєкту разом із непроштовхнутим outbox — це вже сталось (мінор з ревʼю).
    if (error instanceof ApiError && (
      (error.status === 404 && error.code === 'project_not_found')
      || (error.status === 403 && error.code === 'not_a_member')
    )) {
      // Blocker з ревʼю: стираємо лише якщо проєкт РАНІШЕ вже синкався
      // успішно (`hadPriorSync`) — саме тоді 404/403 і означає «доступу
      // більше нема» (§9.4). Перевірка вище (`ensureProjectOnServer`) мала
      // б перехопити «ще не існує» до цього місця, але лишається як
      // остання страховка: без неї гонитва (двоє викликів syncProject
      // одночасно, чи офлайн саме між перевіркою і цим обміном) і далі
      // стирала б щойно створений проєкт.
      if (hadPriorSync) {
        await wipeLocalProject(projectId);
      } else if (__DEV__) {
        console.warn(`[project-sync] ${projectId}: 404/403 без попереднього успішного синку — пропускаємо, не стираємо (спробуємо ще раз пізніше)`);
      }
      return;
    }
    if (!(error instanceof OfflineError) && __DEV__) {
      console.warn(`[project-sync] ${projectId} помилка:`, error);
    }
  } finally {
    _projectSyncing.delete(projectId);
    setProjectSyncStatus(projectId, { phase: 'idle' });
    if (_projectSyncing.size === 0) {
      for (const resolve of [..._projectSyncIdleWaiters]) resolve();
      _projectSyncIdleWaiters.clear();
    }
  }
}

/**
 * Синкає кожен проєкт, де користувач є учасником: `computeMyProjectIds()`
 * (кеш `GET /projects/` ∪ локальні проєкти).
 *
 * `GET /projects/` викликається БЕЗУМОВНО, ще до першого читання
 * `myProjectIds` (major з ревʼю): пристрій із нульовою кількістю локальних
 * проєктів і порожнім кешем інакше НІКОЛИ не дізнався б про проєкт, створений
 * деінде — ані тут, ані на WS-сигнал `projects_changed` (§5.2, обробник
 * зареєстрований у `ProjectSyncProvider` нижче й теж кличе цю функцію), бо
 * обидва шляхи впирались би в той самий ранній `return` за старим,
 * доfetch-овим кешем. Із тієї ж причини `myProjectIds` рахується ПІСЛЯ
 * fetch-у, а не до нього — інакше проєкт, уперше побачений у цій самій
 * відповіді, випадав би з `knownSummaries` і чекав би ще один цикл.
 */
export async function syncAllMyProjects(): Promise<void> {
  if (!isOnlineMode() || getWorkspaceIncompatibility()) return;
  // Черга видалених проєктів (§3.2) — перед звичайним обміном: проєкт, який
  // усе ще тут, або вже видалено на сервері (просто ще не підтверджено), або
  // взагалі ще не дійшов до DELETE через офлайн — жоден із цих випадків не
  // повинен брати участь у синку нижче.
  await flushPendingProjectDeletes();

  const summaries = await fetchWorkspaceProjects();
  // 426 на GET /projects/ уже підняв несумісність (reportClientOutdated) —
  // далі кожен POST/sync однаково впав би тим самим 426.
  if (getWorkspaceIncompatibility()) return;
  const summaryIds = new Set(summaries.map(s => s.id));

  // §9.4 / major з ревʼю: проєкт, видалений або з відкликаним доступом деінде,
  // відсутній у `GET /projects/`. Якщо він УЖЕ був синканий раніше
  // (`lastSyncedAt` записаний), відсутність зараз означає «доступу більше
  // немає» — а не «ще не дійшов до сервера». Без цієї перевірки нижчий цикл
  // прийняв би його за щойно створений локально й покликав
  // `ensureProjectOnServer`, що ловить `409 project_id_taken` (для
  // soft-deleted/чужого проєкту), позначає id конфліктним і переганяє його
  // записи в особистий потік — сам видалений проєкт лишається на пристрої.
  const state = await getProjectSyncState();
  for (const [id, entry] of Object.entries(state)) {
    if (entry.lastSyncedAt != null && !summaryIds.has(id)) {
      await wipeLocalProject(id);
    }
  }

  const myProjectIds = await getMyProjectIds();
  if (!myProjectIds.size) return;

  const freshState = await getProjectSyncState();
  const outbox = await loadOutbox();
  const dirtyStreams = new Set(
    outbox.map(item => item.stream).filter((s): s is string => isProjectStream(s)),
  );

  const knownSummaries = summaries.filter(s => myProjectIds.has(s.id));
  const due = new Set(projectsNeedingSync(knownSummaries, freshState, dirtyStreams));
  for (const id of myProjectIds) {
    if (summaryIds.has(id)) continue;
    if (getWorkspaceIncompatibility()) return;
    // Сервер ще не знає про цей проєкт (щойно створений локально, або
    // офлайн-створення) — контракт §3.2: створюємо ЯВНО, перш ніж пробувати
    // `/projects/{id}/sync/`. Без цього перший обмін ловив би 404, а §9.4
    // стирав би локальний проєкт, прийнявши «ще не існує» за «доступу
    // більше немає» (blocker з ревʼю). Проєкти, щойно стерті циклом вище
    // (`wipeLocalProject`), сюди вже не потраплять — вони прибрані з
    // локального масиву `projects`, а отже й з `myProjectIds`.
    const created = await ensureProjectOnServer(id);
    if (created) due.add(id);
    // Не вдалось (офлайн/мережа/колізія id) — пропускаємо цей цикл,
    // наступний виклик syncAllMyProjects спробує знову.
  }

  for (const id of due) {
    // Послідовно, а не Promise.all: кожен обмін пише в ті самі ключі сховища
    // (tasks, meetings, …), і паралельні обміни різних проєктів створювали б
    // зайву чергу на storage-lock без жодної вигоди — мережевий виграш
    // паралелізму тут не вартий ризику.
    await syncProject(id);
  }
}

// ─── WebSocket: ws/project/{id}/ (контракт §5.1) ─────────────────────────────

interface ProjectSocketState {
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  attempt: number;
  opening: boolean;
}

/**
 * Тримає до `MAX_PROJECT_SOCKETS` живих сокетів — по одному на
 * найнещодавніші проєкти. Кожне повідомлення (сигнал, без даних) дебаунсить
 * повний обмін ЦЬОГО проєкту. Решта проєктів (понад ліміт) синкаються лише
 * поллінгом — той самий `useEffect` з інтервалом, що й для WS-проєктів,
 * запускає `syncAllMyProjects()` для всіх.
 *
 * Перепідключення дзеркалить `useUserSyncSocket` (`store/sync-engine.tsx`):
 * експоненційний backoff (макс 30 с) на будь-яке закриття, `4401` (протух
 * токен) оновлює його ПЕРЕД повторною спробою — інакше повторювала б ту саму
 * відмову з кешованим токеном, а фонове мовчазне закриття (мережа, `4403`
 * після відкликання доступу тощо) взагалі ніколи не намагалось би
 * підключитись знову (blocker з ревʼю: сокет живе рівно до першого closе).
 */
function useProjectSockets(isAuthed: boolean, projectIds: readonly string[]): void {
  const statesRef = useRef(new Map<string, ProjectSocketState>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    if (!isAuthed) return;
    let cancelled = false;
    const states = statesRef.current;
    const timers = timersRef.current;

    const scheduleProjectSync = (id: string) => {
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(id, setTimeout(() => {
        timers.delete(id);
        void syncProject(id);
      }, 800));
    };

    const stateFor = (id: string): ProjectSocketState => {
      let state = states.get(id);
      if (!state) {
        state = { ws: null, reconnectTimer: null, attempt: 0, opening: false };
        states.set(id, state);
      }
      return state;
    };

    const scheduleReconnect = (id: string) => {
      const state = stateFor(id);
      if (cancelled || state.reconnectTimer || !projectIds.includes(id)) return;
      const delay = Math.min(30_000, 1_000 * 2 ** Math.min(state.attempt, 5));
      state.attempt += 1;
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        void openOne(id);
      }, delay);
    };

    const openOne = async (id: string) => {
      const state = stateFor(id);
      // Мінор із ревʼю — той самий гейт, що й у store/sync-engine.tsx
      // useUserSyncSocket: сокет проєкту не має права піднятись зі старими
      // токенами проти origin, чий workspace_id вже розійшовся з тим, на який
      // вони видані.
      if (cancelled || state.ws || state.opening || !isOnlineMode() || getWorkspaceIncompatibility() || !projectIds.includes(id)) return;
      state.opening = true;
      let token: string | null;
      try {
        token = await getFreshAccessToken();
      } finally {
        state.opening = false;
      }
      if (cancelled || state.ws || !token || !isOnlineMode() || getWorkspaceIncompatibility() || !projectIds.includes(id)) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${getWsBase()}/project/${encodeURIComponent(id)}/`, ['flowi-jwt', token]);
      } catch {
        scheduleReconnect(id);
        return;
      }
      state.ws = ws;
      ws.onopen = () => { state.attempt = 0; scheduleProjectSync(id); };
      ws.onmessage = (event: { data?: unknown }) => {
        scheduleProjectSync(id);
        // `members_changed` (контракт §5.1) — оновити кеш `project_members_v1`
        // ОДРАЗУ (review finding): раніше будь-яке повідомлення лише
        // дебаунсило `syncProject`, а кеш учасників наповнюється тільки коли
        // хтось сам відкриє екран Учасників чи Коментарі — пікер виконавця на
        // свіжо приєднаного учасника міг не бачити взагалі ніколи. Динамічний
        // імпорт — щоб не тягнути `project-team.ts` у статичний граф цього
        // модуля заради одного сигналу.
        const raw = event?.data;
        if (typeof raw !== 'string') return;
        try {
          const msg = JSON.parse(raw) as { type?: string };
          if (msg.type === 'members_changed') {
            void import('./project-team')
              .then(({ fetchProjectMembers }) => fetchProjectMembers(id))
              .catch(e => { if (__DEV__) console.warn(`[project-sync] ${id} оновлення кешу учасників не вдалося:`, e); });
          }
        } catch {
          /* не JSON — ігноруємо, scheduleProjectSync і так уже спрацював */
        }
      };
      ws.onerror = () => { /* onclose handles it */ };
      ws.onclose = (event: { code?: number }) => {
        if (state.ws === ws) state.ws = null;
        if (cancelled || !projectIds.includes(id)) return;
        // §5.1: 4403 (не учасник) / 4404 (проєкт не існує/видалено) — доступу
        // більше немає, стукати далі сенсу нема; `syncProject` зробить той
        // самий REST-виклик і сам стирає локальні дані на 403/404 (§9.4).
        if (event?.code === 4403 || event?.code === 4404) {
          void syncProject(id);
          return;
        }
        if (event?.code === 4401) {
          void refreshSession().then(outcome => {
            if (cancelled) return;
            if (outcome === 'invalid') return; // сесії нема — session-expired уже надіслано деінде
            if (outcome === 'ok') state.attempt = 0;
            scheduleReconnect(id);
          });
          return;
        }
        scheduleReconnect(id);
      };
    };

    for (const id of projectIds) void openOne(id);

    // Ідентифікатори, що випали з ліміту (проєкт більше не «нещодавній»),
    // закриваються — інакше сокети росли б без обмеження весь сеанс.
    for (const [id, state] of states) {
      if (!projectIds.includes(id)) {
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        if (state.ws) { state.ws.onclose = null; state.ws.close(); }
        states.delete(id);
      }
    }

    // Несумісність workspace виявили ПОКИ сокети проєктів уже відкриті (той
    // самий мінор із ревʼю, що й у store/sync-engine.tsx useUserSyncSocket) —
    // закриваємо негайно всі, не чекаючи природного onclose/backoff. Знята
    // несумісність — пробуємо підняти назад ті ж id.
    const unsubscribeIncompatible = subscribeWorkspaceIncompatibility(v => {
      if (v) {
        for (const state of states.values()) {
          if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer = null; }
          if (state.ws) { const ws = state.ws; state.ws = null; ws.onclose = null; ws.close(); }
        }
      } else {
        for (const id of projectIds) void openOne(id);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeIncompatible();
      for (const state of states.values()) {
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        if (state.ws) { state.ws.onclose = null; state.ws.close(); }
      }
      states.clear();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, projectIds.join(',')]);
}

/**
 * Провайдер синку проєктів. Монтується поруч із `SyncProvider` в
 * `app/_layout.tsx` — реєструє маршрутизацію outbox і запускає обмін на
 * старті/поверненні з фону/раз на 5 хв, той самий ритм, що й особистий синк.
 */
export function ProjectSyncProvider({ children, isAuthed }: { children: React.ReactNode; isAuthed: boolean }) {
  const [socketIds, setSocketIds] = React.useState<string[]>([]);
  const { user } = useAuth();

  const refreshSocketIds = React.useCallback(async () => {
    const [recent, myIds, workspaceProjects] = await Promise.all([
      getRecentProjects(), getMyProjectIds(), getWorkspaceProjects(),
    ]);
    // Blocker з ревʼю, друга половина: `getMyProjectIds()` домішує ЛОКАЛЬНІ
    // (ще не підтверджені сервером) проєкти — сокет для такого id сервер
    // прийме й одразу закриє 4404 (проєкту в нього ще нема), а `onclose`
    // покликав би `syncProject`. Сам wipe на 404 вище тепер захищений
    // (`hadPriorSync`), але зайвий сокет/4404-раунд на щойно створений
    // проєкт — усе одно шум, якого можна уникнути: сокет відкриваємо лише
    // для id, які сервер УЖЕ підтвердив (кеш `workspace_projects`, той самий,
    // що оновлює `ensureProjectOnServer`/`GET /projects/`).
    const confirmed = new Set(workspaceProjects.map(p => p.id));
    const confirmedRecent = recent.filter(id => confirmed.has(id));
    const confirmedKnown = [...myIds].filter(id => confirmed.has(id));
    // Відкритий зараз проєкт — першим і завжди (навіть якщо `recent` ще не
    // перезаписався, а своїх проєктів більше за ліміт сокетів): саме він
    // мусить оновлюватись наживо, поки на нього дивляться.
    const activeId = getActiveProjectId();
    const selected = socketProjectIdsWithActive(
      activeId && confirmed.has(activeId) ? activeId : null,
      confirmedRecent,
      confirmedKnown,
      MAX_PROJECT_SOCKETS,
    );
    // Порядок для сокетів не значить нічого (він лише вирішив, КОГО взяти в
    // ліміт), а `useProjectSockets` перевідкриває геть усі сокети на будь-яку
    // зміну свого списку — тож зріз сортуємо: інакше вхід у проєкт, який і
    // так уже був у списку, лише переставляв би id і рвав живі з'єднання
    // решти проєктів на рівному місці.
    const next = [...selected].sort();
    setSocketIds(prev => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
  }, []);

  /**
   * §5.1, мінор із ревʼю: список сокетів раніше перераховувався лише на
   * монтуванні й поверненні мережі — щойно створений чи вперше побачений
   * проєкт чекав до перезапуску застосунку, хоча вже синкався поллінгом.
   * `syncAllMyProjects()` — єдине місце, що оновлює кеш `workspace_projects`
   * і створює проєкт на сервері (`ensureProjectOnServer`), тож саме після
   * нього список сокетів і варто перерахувати — усюди, звідки цей обмін
   * запускається (старт, інтервали, WS-сигнал), замість голого виклику.
   */
  const syncAllAndRefreshSockets = React.useCallback(async () => {
    await syncAllMyProjects();
    await refreshSocketIds();
  }, [refreshSocketIds]);

  /**
   * Мінор із ревʼю: `migrateLegacyProjectsIfNeeded` раніше викликався ЛИШЕ
   * з одноразового `[isAuthed, user]` ефекту нижче. Якщо саме тоді особистий
   * outbox був непорожній (типово одразу після логіну, поки застаріле
   * "легасі" завантаження ще заливається) — §3.6-міграція мовчки
   * пропускалась на всю сесію: ані 60-секундний, ані 5-хвилинний поллінг, ані
   * повернення з фону її не повторювали, лише наступний запуск застосунку.
   * Обгортка нижче ретраїть міграцію на КОЖЕН такт, яким і так уже
   * викликається `syncAllAndRefreshSockets` — сама функція ідемпотентна
   * (мітка `projects_migrated_v1` + перевірка порожнього outbox), тож зайвий
   * виклик безпечний, а не зайвий 5-хвилинний цикл очікування.
   */
  const migrateThenSyncAll = React.useCallback(async () => {
    if (user) {
      const workspace = cachedWorkspaceConfig() ?? (await loadWorkspaceConfig());
      if (workspace) await migrateLegacyProjectsIfNeeded(workspace.workspaceId, user.id);
    }
    await syncAllAndRefreshSockets();
  }, [syncAllAndRefreshSockets, user]);

  useEffect(() => installOutboxStreamResolver(), []);
  useEffect(() => installProjectSyncNotifier(), []);

  /**
   * §5.2 WS `ws/user/` `{"type":"projects_changed"}` — я доданий/видалений з
   * проєкту, роль змінилась, проєкт видалено/створено деінде (major з ревʼю,
   * друга половина: без обробника клієнт дізнавався б про це лише на
   * наступному 5-хвилинному/60-секундному такті). Реєстрація тут, а не
   * прямий виклик у `sync-engine.tsx`, — той самий цикл-імпорт, що й у
   * `installOutboxStreamResolver`/`installProjectSyncNotifier` вище.
   */
  useEffect(() => {
    if (!isAuthed) return;
    setProjectsChangedHandler(() => { void migrateThenSyncAll(); });
    return () => setProjectsChangedHandler(null);
  }, [isAuthed, migrateThenSyncAll]);

  useEffect(() => {
    if (!isAuthed || !user) return;
    // §3.6: `migrateThenSyncAll` сама лишень пробує міграцію ПЕРЕД
    // syncAllMyProjects() — послідовно, а не паралельно, щоб паралельний
    // виклик не застав непорожній особистий outbox через власні мутації.
    void migrateThenSyncAll();
  }, [isAuthed, user, migrateThenSyncAll]);

  useEffect(() => {
    if (!isAuthed) return;
    // Страховка на фон (де RN може притримувати короткі інтервали) — той
    // самий такт, що й у особистого синку. Той самий такт ретраїть і
    // §3.6-міграцію (мінор з ревʼю — див. коментар над `migrateThenSyncAll`).
    const id = setInterval(() => void migrateThenSyncAll(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthed, migrateThenSyncAll]);

  useEffect(() => {
    if (!isAuthed) return;
    // §5.1: «поллінг GET /projects/ раз на 60 с на передньому плані» — для
    // проєктів понад ліміт `MAX_PROJECT_SOCKETS` (без живого сокета) це
    // єдиний спосіб узнати про чужу зміну без 5-хвилинного очікування.
    // `syncAllMyProjects()` і так робить `GET /projects/` щоцикл (§3.2) —
    // просто на коротшому такті, і лише поки застосунок на передньому плані.
    // Той самий такт (і повернення з фону) ретраїть §3.6-міграцію.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!interval) interval = setInterval(() => void migrateThenSyncAll(), 60 * 1000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') { void migrateThenSyncAll(); start(); } else { stop(); }
    });
    return () => { stop(); subscription.remove(); };
  }, [isAuthed, migrateThenSyncAll]);

  useEffect(() => {
    if (!isAuthed) { setSocketIds([]); return; }
    let cancelled = false;
    void (async () => { if (!cancelled) await refreshSocketIds(); })();
    const unsubscribe = subscribeOnlineMode(online => { if (online) void refreshSocketIds(); });
    // Вхід/вихід зі простору проєкту — перерахувати список НЕГАЙНО, а не
    // чекати наступного `syncAllMyProjects` (до 60 с): інакше щойно відкритий
    // проєкт лишався без живого сокета рівно тоді, коли він найпотрібніший.
    const unsubscribeActive = subscribeActiveProject(() => { void refreshSocketIds(); });
    return () => { cancelled = true; unsubscribe(); unsubscribeActive(); };
  }, [isAuthed, refreshSocketIds]);

  useProjectSockets(isAuthed, socketIds);

  return React.createElement(React.Fragment, null, children);
}
