import { loadData, saveData } from './storage';

export interface SyncConflict {
  id: string;
  dataKey: string;
  local: any;
  remote: any;
}

const CONFLICTS_KEY = 'sync_pending_conflicts';
const LAST_SYNC_KEY = 'last_sync_timestamp';

export async function loadConflicts(): Promise<SyncConflict[]> {
  return loadData<SyncConflict[]>(CONFLICTS_KEY, []);
}

export async function appendConflicts(newConflicts: SyncConflict[]): Promise<void> {
  if (newConflicts.length === 0) return;
  const existing = await loadConflicts();
  const map = new Map(existing.map(c => [`${c.dataKey}:${c.local?.id}`, c]));
  for (const c of newConflicts) {
    map.set(`${c.dataKey}:${c.local?.id}`, c);
  }
  await saveData(CONFLICTS_KEY, Array.from(map.values()));
}

export async function resolveConflict(conflictId: string, choice: 'local' | 'remote'): Promise<void> {
  const conflicts = await loadConflicts();
  const conflict = conflicts.find(c => c.id === conflictId);
  if (!conflict) return;

  const winner = choice === 'local' ? conflict.local : conflict.remote;
  const items = await loadData<any[]>(conflict.dataKey, []);
  const idx = items.findIndex(item => item.id === winner.id);
  if (idx >= 0) items[idx] = winner;
  else items.push(winner);
  await saveData(conflict.dataKey, items);

  const remaining = conflicts.filter(c => c.id !== conflictId);
  await saveData(CONFLICTS_KEY, remaining);
}

export async function clearAllConflicts(): Promise<void> {
  await saveData(CONFLICTS_KEY, []);
}

export async function getLastSyncTime(): Promise<number> {
  return loadData<number>(LAST_SYNC_KEY, 0);
}

export async function setLastSyncTime(timestamp: number): Promise<void> {
  return saveData(LAST_SYNC_KEY, timestamp);
}
