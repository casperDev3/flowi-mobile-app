import { File, Paths } from 'expo-file-system';
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { localDateKey } from '@/utils/dateUtils';

import { BACKUP_KEYS } from './backup-keys';
import { loadData, saveData } from './storage';

const AUTO_BACKUP_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 години
const LAST_BACKUP_KEY = 'last_backup_at';
const AUTO_BACKUP_ENABLED_KEY = 'auto_backup_enabled';

interface AutoBackupContextType {
  triggerBackup: () => Promise<string | null>;
  getLastBackupTime: () => Promise<Date | null>;
  getLastBackupUri: () => Promise<string | null>;
  isAutoBackupEnabled: () => Promise<boolean>;
  setAutoBackupEnabled: (enabled: boolean) => Promise<void>;
}

const AutoBackupContext = createContext<AutoBackupContextType>({
  triggerBackup: async () => null,
  getLastBackupTime: async () => null,
  getLastBackupUri: async () => null,
  isAutoBackupEnabled: async () => true,
  setAutoBackupEnabled: async () => {},
});

export function AutoBackupProvider({ children }: { children: React.ReactNode }) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doBackup = useCallback(async (): Promise<string | null> => {
    try {
      const values = await Promise.all(BACKUP_KEYS.map(k => loadData(k, null)));
      const payload: Record<string, unknown> = {
        version: '2.0',
        exportedAt: new Date().toISOString(),
      };
      BACKUP_KEYS.forEach((k, i) => {
        if (values[i] !== null) payload[k] = values[i];
      });
      // Локальна доба в імені файлу: UTC-доба (`toISOString().slice`) після
      // опівночі на схід від UTC підписувала копію вчорашнім числом.
      const dateStr = localDateKey(new Date());
      const fileName = `flowi-backup-${dateStr}.json`;
      const file = new File(Paths.document, fileName);
      file.create({ overwrite: true });
      file.write(JSON.stringify(payload, null, 2));
      await saveData(LAST_BACKUP_KEY, new Date().toISOString());
      return file.uri;
    } catch {
      return null;
    }
  }, []);

  const checkAndBackup = useCallback(async () => {
    const enabled = await loadData<boolean>(AUTO_BACKUP_ENABLED_KEY, true);
    if (!enabled) return;

    const lastRaw = await loadData<string | null>(LAST_BACKUP_KEY, null);
    if (!lastRaw) {
      await doBackup();
      return;
    }
    if (Date.now() - new Date(lastRaw).getTime() >= AUTO_BACKUP_INTERVAL_MS) {
      await doBackup();
    }
  }, [doBackup]);

  useEffect(() => {
    checkAndBackup();

    intervalRef.current = setInterval(checkAndBackup, AUTO_BACKUP_INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkAndBackup();
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [checkAndBackup]);

  const getLastBackupTime = useCallback(async (): Promise<Date | null> => {
    const raw = await loadData<string | null>(LAST_BACKUP_KEY, null);
    return raw ? new Date(raw) : null;
  }, []);

  const getLastBackupUri = useCallback(async (): Promise<string | null> => {
    const raw = await loadData<string | null>(LAST_BACKUP_KEY, null);
    if (!raw) return null;
    const at = new Date(raw);
    if (Number.isNaN(at.getTime())) return null;
    // Нові копії названо локальною добою; старі — UTC-добою (колишній
    // `toISOString().slice(0, 10)`), тож шукаємо обидва ключі.
    const keys = Array.from(new Set([localDateKey(at), at.toISOString().slice(0, 10)]));
    // Prefer new naming convention; fall back to legacy f-tracking-* files
    for (const dateStr of keys) {
      const newFile = new File(Paths.document, `flowi-backup-${dateStr}.json`);
      if (newFile.exists) return newFile.uri;
    }
    for (const dateStr of keys) {
      const oldFile = new File(Paths.document, `f-tracking-backup-${dateStr}.json`);
      if (oldFile.exists) return oldFile.uri;
    }
    return null;
  }, []);

  const isAutoBackupEnabled = useCallback(async (): Promise<boolean> => {
    return loadData<boolean>(AUTO_BACKUP_ENABLED_KEY, true);
  }, []);

  const setAutoBackupEnabled = useCallback(async (enabled: boolean): Promise<void> => {
    await saveData(AUTO_BACKUP_ENABLED_KEY, enabled);
  }, []);

  return (
    <AutoBackupContext.Provider value={{ triggerBackup: doBackup, getLastBackupTime, getLastBackupUri, isAutoBackupEnabled, setAutoBackupEnabled }}>
      {children}
    </AutoBackupContext.Provider>
  );
}

export const useAutoBackup = () => useContext(AutoBackupContext);
