/**
 * components/notes/useNoteTargets.ts — куди можна покласти задачу, зустріч чи
 * нотатку: «Особисті» + живі проєкти, де людина має право писати.
 *
 * Спільний для листа перетворення, переміщення нотатки й списку (назви
 * проєктів у секціях). Проєкти — з локальної колекції `projects`, ролі — з
 * `useProjectRoles` (глядачу проєкт у пікерах не пропонуємо).
 */
import { useEffect, useMemo, useState } from 'react';

import { canEditProjectItem, useProjectRoles } from '@/hooks/use-project-roles';
import { loadData, subscribeToStorage } from '@/store/storage';
import { projectModules, type ProjectModules, type ProjectTemplate } from '@/utils/projectUtils';

export interface NoteProjectRow {
  id: string;
  name: string;
  color?: string;
  archivedAt?: string;
  template?: ProjectTemplate;
  modules?: ProjectModules;
}

export type NoteTargetKind = 'task' | 'meeting' | 'note';

export function useNoteProjects(): NoteProjectRow[] {
  const [projects, setProjects] = useState<NoteProjectRow[]>([]);
  useEffect(() => {
    let alive = true;
    const read = async () => {
      const values = await loadData<unknown>('projects', []);
      if (!alive) return;
      setProjects(Array.isArray(values)
        ? values.filter((p): p is NoteProjectRow => !!p && typeof (p as NoteProjectRow).id === 'string')
          .map(p => ({ ...p, name: typeof p.name === 'string' && p.name.trim() ? p.name : '—' }))
        : []);
    };
    void read();
    const off = subscribeToStorage(key => { if (key === 'projects') void read(); });
    return () => { alive = false; off(); };
  }, []);
  return projects;
}

function moduleOn(project: NoteProjectRow, kind: NoteTargetKind): boolean {
  if (kind === 'task') return true;
  try {
    const modules = projectModules(project);
    return kind === 'meeting' ? modules.meetings !== false : modules.notes !== false;
  } catch {
    return true;
  }
}

/** Проєкти, куди людина може записати `kind` (без архівних). */
export function useWritableProjects(kind: NoteTargetKind): NoteProjectRow[] {
  const projects = useNoteProjects();
  const roles = useProjectRoles();
  return useMemo(() => projects.filter(project =>
    !project.archivedAt && canEditProjectItem(project.id, roles) && moduleOn(project, kind)), [projects, roles, kind]);
}
