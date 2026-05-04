import { loadData, saveData } from './storage';
import {
  appendConflicts,
  getLastSyncTime,
  setLastSyncTime,
  SyncConflict,
} from './sync-conflicts';

const SYNC_KEYS = [
  'tasks',
  'transactions',
  'time_entries',
  'notes',
  'projects',
  'meetings',
  'health_entries_v2',
  'workouts',
  'exercises',
  'workout_programs',
  'savings_jars',
  'containers',
  'bugs',
  'ideas',
] as const;

function mergeArraysWithConflicts(
  local: any[],
  remote: any[],
  lastSyncTime: number,
  dataKey: string,
): { merged: any[]; conflicts: SyncConflict[] } {
  const map = new Map(local.map((item: any) => [item.id, item]));
  const conflicts: SyncConflict[] = [];

  remote.forEach((item: any) => {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    } else {
      const loc = map.get(item.id);
      const locTime = new Date(loc.updatedAt ?? loc.createdAt ?? 0).getTime();
      const remTime = new Date(item.updatedAt ?? item.createdAt ?? 0).getTime();
      const locModified = locTime > lastSyncTime;
      const remModified = remTime > lastSyncTime;

      if (locModified && remModified && JSON.stringify(loc) !== JSON.stringify(item)) {
        conflicts.push({ id: `${dataKey}:${item.id}`, dataKey, local: loc, remote: item });
        // Keep local until user resolves
      } else if (remTime > locTime) {
        map.set(item.id, item);
      }
    }
  });

  return { merged: Array.from(map.values()), conflicts };
}

export async function collectAllData() {
  const results = await Promise.all(SYNC_KEYS.map(k => loadData<any[]>(k, [])));
  const payload: Record<string, any[]> = {};
  SYNC_KEYS.forEach((k, i) => { payload[k] = results[i]; });
  return payload;
}

export async function mergeAndSave(remote: Record<string, any[]>): Promise<number> {
  const lastSyncTime = await getLastSyncTime();
  const allConflicts: SyncConflict[] = [];

  for (const key of SYNC_KEYS) {
    if (!remote[key]) continue;
    const local = await loadData<any[]>(key, []);
    const { merged, conflicts } = mergeArraysWithConflicts(local, remote[key], lastSyncTime, key);
    await saveData(key, merged);
    allConflicts.push(...conflicts);
  }

  await appendConflicts(allConflicts);
  await setLastSyncTime(Date.now());
  return allConflicts.length;
}

