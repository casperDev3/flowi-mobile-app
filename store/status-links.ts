/**
 * store/status-links.ts — збереження відповіді на питання «куди перенести»
 * (utils/statusLinks.ts): зв'язок лягає на ОСОБИСТУ колонку в `task_statuses`
 * і синхронізується як звичайна правка статусу.
 */
import { updateSynced } from './synced-storage';
import { withStatusLink } from '@/utils/statusLinks';
import type { TaskStatusColumn } from '@/utils/taskStatuses';

export async function saveStatusLink(
  personal: TaskStatusColumn,
  projectId: string,
  projectColumnId: string,
): Promise<void> {
  try {
    await updateSynced<TaskStatusColumn>('task_statuses', fresh => withStatusLink(fresh, personal, projectId, projectColumnId));
  } catch (e) {
    if (__DEV__) console.warn('[status-links] зберегти зв\'язок статусів не вдалося:', e);
  }
}
