/**
 * hooks/use-activity-context.ts — підписи для стрічки активності проєкту:
 * назви колонок статусів (замість сирого `st-<uuid>`) та імена учасників
 * (замість «Хтось»). Читає лише локальне сховище — мережі не чіпає.
 */
import { useEffect, useMemo, useState } from 'react';

import { useProjectMembers } from '@/hooks/use-project-members';
import { loadData, subscribeToStorage } from '@/store/storage';
import type { ActivityContext } from '@/utils/projectActivity';
import { DEFAULT_TASK_STATUS_COLUMNS, type TaskStatusColumn } from '@/utils/taskStatuses';

export function useActivityContext(projectId: string | null | undefined): ActivityContext {
  const members = useProjectMembers(projectId);
  const [columns, setColumns] = useState<TaskStatusColumn[]>([]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void loadData<TaskStatusColumn[]>('task_statuses', []).then(cols => { if (alive) setColumns(cols); });
    };
    read();
    const unsubscribe = subscribeToStorage(key => { if (key === 'task_statuses') read(); });
    return () => { alive = false; unsubscribe(); };
  }, []);

  return useMemo(() => {
    const statusNames = new Map<string, string>();
    for (const col of DEFAULT_TASK_STATUS_COLUMNS) statusNames.set(col.id, col.name);
    for (const col of columns) if (col?.id && col.name?.trim()) statusNames.set(col.id, col.name.trim());
    const memberNames = new Map<number, string>();
    for (const m of members) {
      const name = m.user.name?.trim() || m.user.email?.split('@')[0];
      if (name) memberNames.set(m.user.id, name);
    }
    return { statusNames, memberNames };
  }, [columns, members]);
}
