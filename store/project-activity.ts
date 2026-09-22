/**
 * store/project-activity.ts — стрічка активності проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.6).
 *
 * НЕ синкається — генерується сервером при записі в потік і змінах
 * учасників, тож це звичайний REST-читальний ендпоінт (як `project-team.ts`
 * для учасників), а не колекція `PROJECT_COLLECTIONS`. Кешу немає: активність
 * має сенс лише свіжою, а найновіший запис — це саме те, заради чого екран
 * відкривають.
 */
import { apiFetch } from './api';
import type { TeamUserRef } from './project-team';

export type ActivityVerb =
  | 'created' | 'updated' | 'deleted' | 'status_changed' | 'assigned'
  | 'commented' | 'member_joined' | 'member_left' | 'role_changed';

/** Лише білий список полів (contract §4.6) — інші зміни сервер не звітує. */
export type ActivityChangedField =
  | 'title' | 'status' | 'kanbanColumnId' | 'assigneeId' | 'deadline'
  | 'startDate' | 'priorityLevel' | 'sprintId';

export interface ActivityChange {
  field: ActivityChangedField | string;
  from: unknown;
  to: unknown;
}

export interface ActivityEntry {
  id: number;
  actor: TeamUserRef | null;
  verb: ActivityVerb;
  collection: string;
  local_id: string;
  title: string;
  changes: ActivityChange[];
  created_at: string;
}

export interface ActivityPage {
  results: ActivityEntry[];
  next_before: number | null;
}

const DEFAULT_LIMIT = 50;

/** `GET /projects/{id}/activity/?before=&limit=` — `before` пагінує старіше за цей id. */
export async function fetchProjectActivity(
  projectId: string,
  options: { before?: number; limit?: number } = {},
): Promise<ActivityPage> {
  const params = new URLSearchParams();
  if (options.before != null) params.set('before', String(options.before));
  params.set('limit', String(Math.min(options.limit ?? DEFAULT_LIMIT, 100)));
  const res = await apiFetch<ActivityPage>(
    `/projects/${encodeURIComponent(projectId)}/activity/?${params.toString()}`,
  );
  return {
    results: Array.isArray(res.results) ? res.results : [],
    next_before: res.next_before ?? null,
  };
}
