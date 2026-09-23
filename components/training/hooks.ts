/**
 * components/training/hooks.ts — дані екранів тренувань.
 *
 *  - useTrainingScope   — хто я (id користувача числом, як на сервері) і
 *                         ключ розведення кешів за workspace/акаунтом;
 *  - useTrainingGroups  — список груп (кеш + GET /training-groups/);
 *  - useGroupStream     — потік групи: накладений стан, запис, синк;
 *  - usePersonalSessions— особисті `training_sessions` (їх розгортає сервер
 *                         у персональний потік, приїжджають звичайним синком).
 *
 * Правило ERR-01 (CLAUDE.md): «не прочиталось» ≠ «порожньо». Кожен хук
 * віддає окремий прапор збою читання, і екран не малює порожній стан поверх
 * нього, а в сховище поверх збою нічого не пише.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { loadDataResult, subscribeToStorage } from '@/store/storage';
import { openTrainingGroupSocket, subscribeTrainingGroupsChanged } from '@/store/training-socket';
import { updateSynced } from '@/store/synced-storage';
import { isOffline } from '@/utils/trainingApi';
import {
  collectionView,
  confirmedRevision,
  emptyGroupState,
  recordView,
  type GroupStreamState,
} from '@/utils/trainingStream';
import {
  deleteGroupRecord,
  groupsCacheKey,
  groupStateKey,
  loadCachedGroups,
  loadGroupState,
  refreshGroups,
  syncGroup,
  TrainingGroupGoneError,
  trainingScope,
  writeGroupRecord,
} from '@/utils/trainingSync';
import { isValidSession } from '@/utils/trainingSessions';
import type { TrainingGroupSummary, TrainingSession } from '@/utils/trainingTypes';

export const SESSIONS_KEY = 'training_sessions';

export interface TrainingScope {
  scope: string;
  userId: number | null;
  userName: string;
  online: boolean;
}

export function useTrainingScope(): TrainingScope {
  const { user } = useAuth();
  const { online } = useAppMode();
  const id = user?.id != null ? Number(user.id) : NaN;
  const userId = Number.isFinite(id) ? id : null;
  return useMemo(
    () => ({ scope: trainingScope(user?.id), userId, userName: user?.name || user?.email || '', online }),
    [user?.id, user?.name, user?.email, userId, online],
  );
}

export type LoadIssue = 'offline' | 'error' | null;

function issueOf(e: unknown): LoadIssue {
  return isOffline(e) ? 'offline' : 'error';
}

// ── Список груп ────────────────────────────────────────────────────────────

export function useTrainingGroups() {
  const { scope, online } = useTrainingScope();
  const [groups, setGroups] = useState<TrainingGroupSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [issue, setIssue] = useState<LoadIssue>(null);

  const readCache = useCallback(async () => {
    setGroups(await loadCachedGroups(scope));
    setLoaded(true);
  }, [scope]);

  const refresh = useCallback(async () => {
    if (!online) { setIssue('offline'); await readCache(); return; }
    try {
      setGroups(await refreshGroups(scope));
      setIssue(null);
    } catch (e) {
      setIssue(issueOf(e));
      await readCache();
    } finally {
      setLoaded(true);
    }
  }, [scope, online, readCache]);

  useEffect(() => { void readCache(); }, [readCache]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => subscribeToStorage(key => {
    if (key === groupsCacheKey(scope)) void readCache();
  }), [scope, readCache]);
  // `training_groups_changed` на ws/user/ — мене додали/видалили/група зникла.
  useEffect(() => subscribeTrainingGroupsChanged(() => { void refresh(); }), [refresh]);

  return { groups, loaded, issue, refresh };
}

export function useGroupSummary(groupId: string) {
  const { groups, loaded, issue, refresh } = useTrainingGroups();
  const group = groups.find(g => g.id === groupId) ?? null;
  return { group, loaded, issue, refresh };
}

// ── Потік групи ────────────────────────────────────────────────────────────

export function useGroupStream(groupId: string) {
  const { scope, userId, online } = useTrainingScope();
  const [state, setState] = useState<GroupStreamState>(() => emptyGroupState(groupId));
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [issue, setIssue] = useState<LoadIssue>(null);
  const [gone, setGone] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const key = groupStateKey(scope, groupId);

  const reload = useCallback(async () => {
    const s = await loadGroupState(scope, groupId);
    if (mounted.current) { setState(s); setLoaded(true); }
  }, [scope, groupId]);

  const sync = useCallback(async () => {
    if (!groupId) return;
    if (!online) { setIssue('offline'); return; }
    setSyncing(true);
    try {
      const s = await syncGroup(scope, groupId);
      if (mounted.current) { setState(s); setIssue(null); setLoaded(true); }
    } catch (e) {
      if (!mounted.current) return;
      if (e instanceof TrainingGroupGoneError) setGone(true);
      else setIssue(issueOf(e));
    } finally {
      if (mounted.current) setSyncing(false);
    }
  }, [scope, groupId, online]);

  useEffect(() => { void reload(); }, [reload]);
  useFocusEffect(useCallback(() => { void sync(); }, [sync]));
  useEffect(() => subscribeToStorage(changed => {
    if (changed === key) void reload();
  }), [key, reload]);

  // Живий канал групи (§2.5): чужі зміни, XP, склад учасників — лише сигнал,
  // у відповідь звичайний синк з дебаунсом (батч сервера шле кілька поспіль).
  // Втрата доступу / видалення групи — екран показує «групи більше немає».
  useEffect(() => {
    if (!groupId || !online) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const close = openTrainingGroupSocket(groupId, signal => {
      if (!mounted.current) return;
      if (signal.type === 'gone') {
        setGone(true);
        void refreshGroups(scope).catch(() => {});
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void sync(); }, 500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      close();
    };
  }, [groupId, online, scope, sync]);

  const write = useCallback(async (collection: string, localId: string, data: Record<string, unknown>) => {
    const s = await writeGroupRecord(scope, groupId, collection, localId, data);
    if (mounted.current) setState(s);
    void sync();
  }, [scope, groupId, sync]);

  const remove = useCallback(async (collection: string, localId: string) => {
    const s = await deleteGroupRecord(scope, groupId, collection, localId);
    if (mounted.current) setState(s);
    void sync();
  }, [scope, groupId, sync]);

  const list = useCallback(<T,>(collection: string) => collectionView<T>(state, collection), [state]);
  const get = useCallback(<T,>(collection: string, localId: string) => recordView<T>(state, collection, localId), [state]);
  const revision = useCallback(
    (collection: string, localId: string) => confirmedRevision(state, collection, localId),
    [state],
  );

  return {
    state, loaded, syncing, issue, gone, userId,
    role: state.role, list, get, revision, write, remove, sync, reload,
  };
}

export type GroupStream = ReturnType<typeof useGroupStream>;

// ── Особисті сесії ─────────────────────────────────────────────────────────

export function usePersonalSessions() {
  const [all, setAll] = useState<TrainingSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const res = await loadDataResult<unknown>(SESSIONS_KEY, []);
    if (!res.ok) { setFailed(true); setLoaded(true); return; }
    const list = Array.isArray(res.value) ? res.value.filter(isValidSession) : [];
    setAll(list);
    setFailed(false);
    setLoaded(true);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));
  useEffect(() => subscribeToStorage(key => { if (key === SESSIONS_KEY) void reload(); }), [reload]);

  /**
   * Правка під блокуванням ключа (updateSynced): рушій синку міг щойно
   * покласти в ключ нову сесію, і запис «масивом зі стану» поставив би їй
   * тумбстоун (ERR/DI-01). Тут змінюються лише ті записи, що повернув `fn`.
   */
  const update = useCallback(async (fn: (fresh: TrainingSession[]) => TrainingSession[]) => {
    if (failed) throw new Error('training_sessions: read failed, refusing to write');
    await updateSynced<TrainingSession>(SESSIONS_KEY, fresh => {
      const valid = fresh.filter(isValidSession);
      const next = fn(valid);
      if (next === valid) return fresh;
      // Биті записи, яких екран не розуміє, не видаляємо — повертаємо як були.
      const invalid = fresh.filter(s => !isValidSession(s));
      return invalid.length ? [...next, ...invalid] : next;
    });
    await reload();
  }, [failed, reload]);

  return { all, loaded, failed, reload, update };
}
