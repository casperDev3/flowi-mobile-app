import { joinRoom } from 'trystero/torrent';
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

export type SyncStatus = 'idle' | 'waiting' | 'connected' | 'syncing' | 'done' | 'error';

export interface SyncSession {
  leave: () => void;
  getPeerCount: () => number;
}

export function isSyncSupported(): boolean {
  const g: any = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return Boolean(
    g &&
    typeof g.RTCPeerConnection !== 'undefined' &&
    g.crypto &&
    typeof g.crypto.getRandomValues === 'function' &&
    g.crypto.subtle &&
    typeof g.crypto.subtle.importKey === 'function' &&
    typeof g.crypto.subtle.digest === 'function',
  );
}

export function startSync(
  roomCode: string,
  onStatus: (s: SyncStatus) => void,
  onPeerCount: (n: number) => void,
  onConflicts?: (count: number) => void,
): SyncSession {
  if (!isSyncSupported()) {
    onStatus('error');
    return { leave: () => {}, getPeerCount: () => 0 };
  }

  let peerCount = 0;
  const room = joinRoom({ appId: 'flowi-sync-v1' }, roomCode.toLowerCase());
  const [sendData, onData] = room.makeAction<Record<string, any[]>>('sync');

  onStatus('waiting');

  room.onPeerJoin(async (peerId) => {
    peerCount++;
    onPeerCount(peerCount);
    onStatus('connected');
    onStatus('syncing');
    const data = await collectAllData();
    sendData(data, peerId);
  });

  room.onPeerLeave(() => {
    peerCount = Math.max(0, peerCount - 1);
    onPeerCount(peerCount);
    if (peerCount === 0) onStatus('waiting');
  });

  onData(async (data) => {
    onStatus('syncing');
    const conflictCount = await mergeAndSave(data);
    const merged = await collectAllData();
    sendData(merged);
    onStatus('done');
    onConflicts?.(conflictCount);
  });

  return {
    leave: () => room.leave(),
    getPeerCount: () => peerCount,
  };
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
