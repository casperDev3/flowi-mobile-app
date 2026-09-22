/**
 * hooks/use-project-roles.ts — моя роль у КОЖНОМУ проєкті одразу, живо.
 *
 * Те саме джерело істини, що й `useProjectRole` (по одному проєкту), тепер
 * мапою: `useProjectRole` — хук, і викликати його в циклі по задачах різних
 * проєктів не можна (правило хуків), а «Особисте агрегує» (§3.7) якраз
 * показує задачі БУДЬ-ЯКОГО проєкту одним списком («Сьогодні», Завдання) —
 * кожен рядок мусить знати роль САМЕ свого проєкту, щоб приховати
 * редагування/видалення глядачу (review finding: contract §4.1 «Role-aware
 * UI» перевірявся лише всередині `app/project/[id]/*`, а спільний редактор
 * задачі й агрегація «Сьогодні»/«Завдання» дозволяли глядачу редагувати,
 * видаляти й відмічати чужі проєктні задачі так, ніби він owner).
 *
 * Джерела й фолбек — як у `useProjectRole`:
 *  1. `project_sync_state_v1` — з відповіді `/projects/{id}/sync/` (найточніше).
 *  2. `workspace_projects` (`GET /projects/`) — поки конкретний проєкт ще не
 *     синкався жодного разу.
 *  3. Відсутність обох — 'owner' (соло-проєкт, якого сервер ще не бачив).
 *
 * Модульний кеш (`lastKnown`) — не бізнес-дані, а лише «що читали востаннє
 * цього сеансу»: нове монтування хука (відкрили ще одну задачу проєкту)
 * стартує з нього, а не з порожньої мапи, поки перший `loadData` у польоті —
 * інакше кожен новий екран на мить бачив би ролі як undefined → 'owner' і
 * owner-only контроли блимали б (мінор із ревʼю на `use-project-role.ts`).
 * Для ПЕРШОГО монтування за холодний старт кеш усе одно порожній —
 * AsyncStorage синхронно не читається, і ця частина мінору лишається:
 * задокументовано в звіті воркфлоу, а не вигадана тут «синхронна» підміна.
 */
import { useEffect, useState } from 'react';

import { loadData, subscribeToStorage } from '@/store/storage';
import type { ProjectRole } from '@/constants/projectNav';
import type { ProjectSyncStateMap } from '@/utils/projectStream';

const PROJECT_SYNC_STATE_KEY = 'project_sync_state_v1';
const WORKSPACE_PROJECTS_KEY = 'workspace_projects';

export type ProjectRoleMap = Readonly<Record<string, ProjectRole>>;

function isProjectRole(value: unknown): value is ProjectRole {
  return value === 'owner' || value === 'member' || value === 'viewer';
}

let lastKnown: ProjectRoleMap = {};

async function readRoleMap(): Promise<ProjectRoleMap> {
  const [state, summaries] = await Promise.all([
    loadData<ProjectSyncStateMap>(PROJECT_SYNC_STATE_KEY, {}),
    loadData<{ id: string; role?: string }[]>(WORKSPACE_PROJECTS_KEY, []),
  ]);
  const next: Record<string, ProjectRole> = {};
  if (Array.isArray(summaries)) {
    for (const s of summaries) {
      if (isProjectRole(s?.role)) next[s.id] = s.role;
    }
  }
  // `project_sync_state_v1` точніше й свіжіше — перекриває кеш GET /projects/.
  for (const [id, entry] of Object.entries(state ?? {})) {
    if (isProjectRole(entry?.role)) next[id] = entry.role;
  }
  lastKnown = next;
  return next;
}

/** Ролі в усіх проєктах, живі: перечитує на будь-яку зміну обох джерел. */
export function useProjectRoles(): ProjectRoleMap {
  const [roles, setRoles] = useState<ProjectRoleMap>(lastKnown);

  useEffect(() => {
    let mounted = true;
    const read = () => { void readRoleMap().then(next => { if (mounted) setRoles(next); }); };
    read();
    const unsubscribe = subscribeToStorage(key => {
      if (key === PROJECT_SYNC_STATE_KEY || key === WORKSPACE_PROJECTS_KEY) read();
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  return roles;
}

/**
 * Чи можна редагувати/видаляти/відмічати запис із цим `projectId` (contract
 * §4.1): особистий запис (без `projectId`) — завжди; проєктний — усе, крім
 * ролі `'viewer'`. Невідома роль (проєкт ще не в мапі) трактується як
 * 'owner' — та сама заглушка, що й `useProjectRole`, з тією самою причиною
 * (соло-проєкт до першого синку належить тому, хто його створив).
 */
export function canEditProjectItem(projectId: string | null | undefined, roles: ProjectRoleMap): boolean {
  if (!projectId) return true;
  return roles[projectId] !== 'viewer';
}
