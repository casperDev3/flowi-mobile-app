import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { loadConflicts, SyncConflict } from '@/store/sync-conflicts';
import {
  formatSyncError,
  loadRejected,
  releaseFromQuarantine,
  SyncRejection,
  useSync,
} from '@/store/sync-engine';
import { markDirty, SYNC_SINGLETON_KEYS } from '@/store/synced-storage';

const DATA_KEY_LABELS: Record<string, string> = {
  tasks: 'Завдання', transactions: 'Транзакції', time_entries: 'Час',
  notes: 'Нотатки', projects: 'Проекти', bugs: 'Баги', ideas: 'Ідеї',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Назва', name: 'Назва', description: 'Опис', status: 'Статус',
  priority: 'Пріоритет', fixed: 'Виправлено', severity: 'Серйозність',
  updatedAt: 'Оновлено', amount: 'Сума', type: 'Тип', color: 'Колір',
};

export default function SyncScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { tr } = useI18n();
  const { online } = useAppMode();
  const { status: authStatus } = useAuth();
  const {
    state: syncState, lastSyncAt, pendingCount, conflictsCount,
    lastError, oldestPendingAt, rejectedCount, syncNow,
  } = useSync();

  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [rejected, setRejected] = useState<SyncRejection[]>([]);

  const c = {
    bg1:    isDark ? '#0C0C14' : '#F5F5FA',
    bg2:    isDark ? '#14121E' : '#EBEBF5',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    accent: '#7C3AED', green: '#10B981', orange: '#F59E0B', red: '#EF4444',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
  };

  const refreshConflicts = useCallback(async () => {
    setConflicts(await loadConflicts());
    setRejected(await loadRejected());
  }, []);

  useEffect(() => { refreshConflicts(); }, [refreshConflicts, rejectedCount]);

  // «Спробувати ще» — просто випустити з карантину: наступна правка запису
  // покладе його в outbox знову. «Відкинути» робить те саме, але користувач
  // свідомо погоджується, що цей запис на сервер не поїде.
  const handleRelease = useCallback(async (item: SyncRejection) => {
    await releaseFromQuarantine(item.collection, item.local_id);
    await refreshConflicts();
  }, [refreshConflicts]);

  // ─── Вирішення конфліктів ──────────────────────────────────────────────────
  const handleResolve = async (id: string, choice: 'local' | 'remote') => {
    const conflict = conflicts.find(c => c.id === id);
    if (!conflict) return;

    if (choice === 'local') {
      // Залишити моє: force-push на сервер
      const [collection, local_id] = id.split(':');
      if (collection && local_id) {
        await markDirty(collection, local_id, false, true /* force */);
      }
      // Видаляємо конфлікт зі списку (він піде через outbox)
      const remaining = (await loadConflicts()).filter(c => c.id !== id);
      await saveData('sync_pending_conflicts', remaining);
    } else {
      // Прийняти серверне: upsert/delete локально, без outbox
      const remote = conflict.remote;
      if (remote) {
        const isSingleton = (SYNC_SINGLETON_KEYS as readonly string[]).includes(conflict.dataKey);
        if (isSingleton) {
          await saveData(
            conflict.dataKey,
            remote._deleted ? null : (remote.value ?? remote),
          );
        } else {
          const items = await loadData<any[]>(conflict.dataKey, []);
          const withoutRemote = items.filter((item: any) => item.id !== remote.id);
          if (!remote._deleted && remote.id) withoutRemote.push(remote);
          await saveData(conflict.dataKey, withoutRemote);
        }
      }
      const remaining = (await loadConflicts()).filter(c => c.id !== id);
      await saveData('sync_pending_conflicts', remaining);
    }

    await refreshConflicts();
  };

  const isOnlineAuthed = online && authStatus === 'authed';
  const isCloudSyncing = syncState === 'syncing';
  const hasCloudError = syncState === 'error';

  const cloudStatusColor =
    hasCloudError ? c.red :
    isCloudSyncing ? c.accent :
    conflictsCount > 0 ? c.orange : c.green;

  const errorText = formatSyncError(lastError);
  // Година — поріг, за яким черга вже не «щойно поставлена», а справді застрягла:
  // за цей час встигають відпрацювати і дебаунс (5 с), і поллінг (5 хв), і всі
  // три кроки backoff (30 с / 2 хв / 5 хв).
  const isStalled = pendingCount > 0
    && oldestPendingAt != null
    && Date.now() - oldestPendingAt > 60 * 60 * 1000;

  const cloudStatusText = isCloudSyncing
    ? 'Синхронізація…'
    : hasCloudError
    ? tr.syncError
    : conflictsCount > 0
    ? `${conflictsCount} ${tr.syncConflictsCount}`
    : lastSyncAt
    ? `${tr.lastSyncAt}: ${fmtSyncTime(lastSyncAt)}`
    : 'Ще не синхронізовано';

  // ─── Main screen ────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <IconSymbol name="chevron.left" size={22} color={c.accent} />
          </TouchableOpacity>
          <Text style={[st.headerTitle, { color: c.text }]}>Синхронізація</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          showsVerticalScrollIndicator={false}>

            {/* ── CLOUD SYNC CARD ── */}
            <Text style={[st.sectionLabel, { color: c.sub, marginBottom: 8 }]}>
              {tr.cloudSync.toUpperCase()}
            </Text>

            <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
              style={[st.card, { borderColor: c.border }]}>

              {/* Cloud status row */}
              <View style={[st.statusRow, { backgroundColor: cloudStatusColor + '15', borderColor: cloudStatusColor + '30' }]}>
                <View style={[st.statusDot, { backgroundColor: cloudStatusColor }]} />
                <Text style={[st.statusText, { color: cloudStatusColor, flex: 1 }]}>
                  {cloudStatusText}
                </Text>
                {isCloudSyncing && (
                  <ActivityIndicator size="small" color={cloudStatusColor} style={{ marginLeft: 6 }} />
                )}
              </View>

              {/* Черга: скільки і, головне, як довго висить */}
              {pendingCount > 0 && !isCloudSyncing && (
                <Text style={[st.pendingText, { color: c.sub }]}>
                  {pendingCount} {tr.syncPending}
                  {oldestPendingAt ? ` · найстаріший ${fmtSyncTime(oldestPendingAt)}` : ''}
                </Text>
              )}

              {/* Причина провалу. Без неї «помилка» — це глухий кут: рушій знає
                  {status, code, message}, а користувач не бачив нічого. */}
              {errorText && (
                <View style={[st.hintRow, { backgroundColor: c.red + '12', borderColor: c.red + '28' }]}>
                  <IconSymbol name="exclamationmark.circle" size={14} color={c.red} />
                  <Text style={[st.hintText, { color: c.red }]} numberOfLines={4}>
                    {errorText}
                  </Text>
                </View>
              )}

              {/* Застрягла черга — окремий сигнал: синк може рапортувати «ок»,
                  поки записи не доїжджають днями. */}
              {isStalled && (
                <View style={[st.hintRow, { backgroundColor: c.orange + '12', borderColor: c.orange + '28' }]}>
                  <IconSymbol name="clock" size={14} color={c.orange} />
                  <Text style={[st.hintText, { color: c.orange }]}>
                    Черга не рухається з {fmtSyncTime(oldestPendingAt!)}. Записи лишаються
                    на цьому пристрої й не бачать змін з сервера.
                  </Text>
                </View>
              )}

              {/* Guest / Offline hint */}
              {!online && (
                <View style={[st.hintRow, { backgroundColor: c.sub + '12', borderColor: c.sub + '20' }]}>
                  <IconSymbol name="icloud.slash" size={14} color={c.sub} />
                  <Text style={[st.hintText, { color: c.sub }]}>{tr.syncOfflineHint}</Text>
                </View>
              )}
              {online && authStatus !== 'authed' && (
                <View style={[st.hintRow, { backgroundColor: c.sub + '12', borderColor: c.sub + '20' }]}>
                  <IconSymbol name="person.slash" size={14} color={c.sub} />
                  <Text style={[st.hintText, { color: c.sub }]}>{tr.syncGuestHint}</Text>
                </View>
              )}

              {/* Sync Now button */}
              <TouchableOpacity
                onPress={() => void syncNow()}
                disabled={!isOnlineAuthed || isCloudSyncing}
                style={[st.syncBtn, {
                  backgroundColor: isOnlineAuthed && !isCloudSyncing
                    ? c.accent
                    : c.dim,
                }]}>
                {isCloudSyncing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <IconSymbol name="arrow.triangle.2.circlepath" size={16} color="#fff" />
                }
                <Text style={[st.syncBtnText, {
                  color: isOnlineAuthed && !isCloudSyncing ? '#fff' : c.sub,
                }]}>
                  {tr.syncNow}
                </Text>
              </TouchableOpacity>
            </BlurView>

            {/* ── КАРАНТИН ── */}
            {rejected.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={[st.sectionLabel, { color: c.sub }]}>
                  СЕРВЕР НЕ ПРИЙНЯВ ({rejected.length})
                </Text>
                <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
                  style={[st.card, { borderColor: c.red + '28', marginTop: 8 }]}>
                  <Text style={[st.hintText, { color: c.sub, marginBottom: 10 }]}>
                    Ці записи лишаються на пристрої. Решта синхронізації працює —
                    вони більше не блокують чергу.
                  </Text>
                  {rejected.map(item => (
                    <View
                      key={`${item.collection}:${item.local_id}`}
                      style={[st.hintRow, { backgroundColor: c.red + '10', borderColor: c.red + '24' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.hintText, { color: c.text }]} numberOfLines={1}>
                          {DATA_KEY_LABELS[item.collection] ?? item.collection}
                          {' · '}
                          {item.local_id}
                        </Text>
                        <Text style={[st.hintText, { color: c.sub }]} numberOfLines={2}>
                          {item.detail ?? item.reason}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => void handleRelease(item)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Прибрати з карантину">
                        <IconSymbol name="xmark" size={14} color={c.sub} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </BlurView>
              </View>
            )}

            {/* ── CONFLICTS ── */}
            {conflicts.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={[st.sectionLabel, { color: c.sub }]}>КОНФЛІКТИ ({conflicts.length})</Text>
                {conflicts.map(conflict => (
                  <ConflictCard key={conflict.id} conflict={conflict}
                    onResolve={handleResolve} c={c} isDark={isDark} />
                ))}
              </View>
            )}

            {/* ── SUCCESS CLOUD ── */}
            {syncState === 'idle' && conflicts.length === 0 && lastSyncAt && (
              <View style={[st.banner, { backgroundColor: c.green + '12', borderColor: c.green + '28' }]}>
                <View style={[st.bannerIcon, { backgroundColor: c.green + '20' }]}>
                  <IconSymbol name="checkmark" size={18} color={c.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.bannerTitle, { color: c.green }]}>Синхронізовано успішно</Text>
                  <Text style={[st.bannerSub, { color: c.sub }]}>Всі дані актуальні</Text>
                </View>
              </View>
            )}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ─── ConflictCard ─────────────────────────────────────────────────────────────

function ConflictCard({ conflict, onResolve, c, isDark }: {
  conflict: SyncConflict;
  onResolve: (id: string, choice: 'local' | 'remote') => void;
  c: any; isDark: boolean;
}) {
  const label = DATA_KEY_LABELS[conflict.dataKey] ?? conflict.dataKey;
  const name = conflict.local?.title ?? conflict.local?.name ?? `#${String(conflict.local?.id ?? '').slice(0, 6)}`;
  const diffs = getFieldDiffs(conflict.local, conflict.remote);

  return (
    <BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'}
      style={[st.conflictCard, { borderColor: '#F59E0B28' }]}>

      <View style={[st.conflictHead, { borderBottomColor: c.border }]}>
        <View style={[st.conflictDot, { backgroundColor: '#F59E0B' }]} />
        <Text style={st.conflictLabel}>{label.toUpperCase()}</Text>
        <Text style={[st.conflictName, { color: c.text, flex: 1 }]} numberOfLines={1}>{name}</Text>
        <Text style={[st.diffCount, { color: c.sub }]}>{diffs.length} змін</Text>
      </View>

      <View style={st.versionsRow}>
        <VersionPanel label="Мій пристрій" accent="#7C3AED" diffs={diffs} version="local" c={c} />
        <View style={[st.vDivider, { backgroundColor: c.border }]} />
        <VersionPanel label="Інший пристрій" accent="#6366F1" diffs={diffs} version="remote" c={c} />
      </View>

      <View style={[st.conflictActions, { borderTopColor: c.border }]}>
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'local')}
          style={[st.resolveBtn, { backgroundColor: 'rgba(124,58,237,0.1)', borderRightColor: c.border }]}>
          <IconSymbol name="checkmark" size={13} color="#7C3AED" />
          <Text style={[st.resolveBtnText, { color: '#7C3AED' }]}>Залишити моє</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'remote')}
          style={[st.resolveBtn, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
          <IconSymbol name="checkmark" size={13} color="#6366F1" />
          <Text style={[st.resolveBtnText, { color: '#6366F1' }]}>Прийняти інше</Text>
        </TouchableOpacity>
      </View>
    </BlurView>
  );
}

function VersionPanel({ label, accent, diffs, version, c }: {
  label: string; accent: string;
  diffs: { key: string; local: string; remote: string }[];
  version: 'local' | 'remote'; c: any;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={st.vLabelRow}>
        <View style={[st.vDot, { backgroundColor: accent }]} />
        <Text style={[st.vLabel, { color: accent }]}>{label.toUpperCase()}</Text>
      </View>
      {diffs.length === 0
        ? <Text style={{ fontSize: 12, color: c.sub }}>Без змін</Text>
        : diffs.map(f => (
          <View key={f.key} style={{ marginBottom: 7 }}>
            <Text style={[st.fKey, { color: c.sub }]}>{(FIELD_LABELS[f.key] ?? f.key).toUpperCase()}</Text>
            <Text style={[st.fVal, { color: c.text }]} numberOfLines={2}>
              {version === 'local' ? f.local : f.remote}
            </Text>
          </View>
        ))
      }
    </View>
  );
}

function getFieldDiffs(local: any, remote: any) {
  const IGNORE = new Set(['id', 'createdAt']);
  return [...new Set([...Object.keys(local ?? {}), ...Object.keys(remote ?? {})])]
    .filter(k => !IGNORE.has(k))
    .map(key => ({ key, local: fmt(local?.[key]), remote: fmt(remote?.[key]) }))
    .filter(f => f.local !== f.remote)
    .slice(0, 5);
}

function fmt(v: any): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Так' : 'Ні';
  if (Array.isArray(v)) return `${v.length} ел.`;
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 40);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s))
    return new Date(s).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return s.slice(0, 60);
}

function fmtSyncTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'щойно';
  if (mins < 60) return `${mins} хв тому`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} год тому`;
  return new Date(ms).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle:   { fontSize: 17, fontWeight: '700' },
  card:          { borderRadius: 20, borderWidth: 1, overflow: 'hidden', padding: 20, marginBottom: 16 },
  statusRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  statusDot:     { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  statusText:    { fontSize: 13, fontWeight: '600' },
  pendingText:   { fontSize: 12, color: '#888', marginBottom: 12, paddingHorizontal: 2 },
  hintRow:       { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginBottom: 14 },
  hintText:      { fontSize: 12, fontWeight: '500', flex: 1 },
  syncBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, marginTop: 4 },
  syncBtnText:   { fontSize: 14, fontWeight: '700' },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  bannerIcon:    { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  bannerTitle:   { fontSize: 14, fontWeight: '700' },
  bannerSub:     { fontSize: 12, marginTop: 2 },
  sectionLabel:  { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginLeft: 2 },
  conflictCard:  { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  conflictHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  conflictDot:   { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  conflictLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: '#F59E0B' },
  conflictName:  { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  diffCount:     { fontSize: 10, fontWeight: '600' },
  versionsRow:   { flexDirection: 'row', padding: 14, gap: 12 },
  vDivider:      { width: 1 },
  vLabelRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  vDot:          { width: 5, height: 5, borderRadius: 3 },
  vLabel:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fKey:          { fontSize: 10, fontWeight: '600', letterSpacing: 0.3, marginBottom: 2 },
  fVal:          { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  conflictActions:{ flexDirection: 'row', borderTopWidth: 1 },
  resolveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 13, borderRightWidth: 1 },
  resolveBtnText:{ fontSize: 13, fontWeight: '700' },
});
