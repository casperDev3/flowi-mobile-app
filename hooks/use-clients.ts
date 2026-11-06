/**
 * hooks/use-clients.ts — колекція клієнтів, жива.
 *
 * Читає 'clients' і перечитує на будь-який запис у ключ повз екран (синк,
 * сусідній екран). Запис — ЗАВЖДИ read-modify-write свіжого сховища
 * (updateSynced): saveSynced дифає масив, і запис застарілого стану видалив
 * би клієнта, що щойно приїхав синком.
 */
import { useCallback, useEffect, useState } from 'react';

import { loadDataResult } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { CLIENTS_KEY, normalizeClients, type Client } from '@/utils/clients';

import { useStorageRefresh } from './use-storage-refresh';

export interface UseClientsResult {
  clients: Client[];
  /** false, поки перше читання ще не завершилось. */
  loaded: boolean;
  /** Читання зі сховища впало — «не прочиталось» ≠ «порожньо». */
  failed: boolean;
  reload: () => Promise<void>;
  /** Створити або оновити (за id) запис клієнта. */
  upsertClient: (client: Client) => Promise<void>;
  /** Видалити (тумбстоун у синку). */
  deleteClient: (id: string) => Promise<void>;
  /** Змінити запис на свіжому сховищі; не знайдено — нічого. */
  patchClient: (id: string, patch: (record: Client) => Client) => Promise<void>;
}

export function useClients(): UseClientsResult {
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    try {
      const result = await loadDataResult<unknown>(CLIENTS_KEY, []);
      if (!result.ok) { setFailed(true); return; }
      setClients(normalizeClients(result.value));
      setFailed(false);
    } catch (e) {
      if (__DEV__) console.warn('[clients] читання не вдалося:', e);
      setFailed(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const trackWrite = useStorageRefresh([CLIENTS_KEY], reload);

  const write = useCallback(async (mutate: (fresh: Client[]) => Client[]) => {
    if (failed) return; // запис поверх непрочитаного стер би чужі дані
    await trackWrite(async () => {
      const next = await updateSynced<Client>(CLIENTS_KEY, mutate);
      setClients(normalizeClients(next));
    });
  }, [trackWrite, failed]);

  const upsertClient = useCallback((client: Client) => write(fresh => {
    const index = fresh.findIndex(c => c.id === client.id);
    if (index < 0) return [...fresh, client];
    const next = fresh.slice();
    next[index] = client;
    return next;
  }), [write]);

  const deleteClient = useCallback((id: string) => write(fresh => {
    const next = fresh.filter(c => c.id !== id);
    return next.length === fresh.length ? fresh : next;
  }), [write]);

  const patchClient = useCallback((id: string, patch: (record: Client) => Client) => write(fresh => {
    const index = fresh.findIndex(c => c.id === id);
    if (index < 0) return fresh;
    const next = fresh.slice();
    next[index] = patch(fresh[index]);
    return next;
  }), [write]);

  return { clients, loaded, failed, reload, upsertClient, deleteClient, patchClient };
}
