/**
 * hooks/use-project.ts — запис проєкту за id, живий.
 *
 * `projects` — та сама колекція, що читає весь застосунок (app/projects.tsx,
 * NavSidebar тощо): жодного окремого сховища для простору проєкту нема,
 * «Особисте агрегує» (§3.7) працює само собою. Хук лише читає і підписується
 * на зміни ключа — редагувати проєкт із самого простору можна тільки через
 * `updateSynced('projects', …)`, як і зі списку проєктів.
 */
import { useCallback, useEffect, useState } from 'react';

import { loadData } from '@/store/storage';
import { useStorageRefresh } from './use-storage-refresh';
import type { Project } from '@/app/projects';

export interface UseProjectResult {
  project: Project | null;
  /** false, поки перше читання ще не завершилось. */
  loading: boolean;
}

export function useProject(projectId: string | undefined | null): UseProjectResult {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const all = await loadData<Project[]>('projects', []);
    setProject(Array.isArray(all) ? all.find(p => p.id === projectId) ?? null : null);
  }, [projectId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    load().finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  // Перечитати одразу, коли проєкт (назва/колір/modules/архів) правлять деінде
  // — зі списку проєктів, з Налаштувань цього ж простору чи синком.
  useStorageRefresh(['projects'], load);

  return { project, loading };
}
