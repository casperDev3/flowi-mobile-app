/**
 * hooks/use-project-role.ts — моя роль в ОДНОМУ проєкті просто зараз.
 *
 * Тонка обгортка над `useProjectRoles()` (мапа по всіх проєктах, той самий
 * `project_sync_state_v1`/`workspace_projects` фолбек і той самий модульний
 * кеш останнього прочитаного — див. коментар там): «одне значення» тут, бо
 * більшість екранів (Огляд, Налаштування, Учасники проєкту) знають ЄДИНИЙ
 * `projectId` наперед і хуку-мапи їм не треба.
 */
import type { ProjectRole } from '@/constants/projectNav';
import { useProjectRoles } from './use-project-roles';

export function useProjectRole(projectId: string | undefined | null): ProjectRole {
  const roles = useProjectRoles();
  if (!projectId) return 'owner';
  return roles[projectId] ?? 'owner';
}
