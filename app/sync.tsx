import * as Clipboard from 'expo-clipboard';
import {loadRecoveryDrafts,dismissRecoveryDraft,type RecoveryDraft} from '@/store/recovery-drafts';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/shared/ScreenHeader';

import { SyncDiagnosticsPanel } from '@/components/shared/SyncDiagnosticsPanel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, shadow, space, type as dsType } from '@/constants/theme';
import { useDS, type DSTheme } from '@/hooks/use-ds';
import { useAppMode } from '@/store/app-mode';
import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import { loadConflicts, SyncConflict } from '@/store/sync-conflicts';
import {
  formatSyncError,
  loadRejected,
  pushAllToServer,
  releaseFromQuarantine,
  scanLocalOnlyRecords,
  SyncRejection,
  useSync,
} from '@/store/sync-engine';
import { EMPTY_LOCAL_ONLY, type LocalOnlyReport } from '@/utils/syncDivergence';
import { markDirty, SYNC_SINGLETON_KEYS } from '@/store/synced-storage';
import { useContentWidth } from '@/hooks/use-content-width';
import { glassStyles, type GlassStyles } from '@/components/finance/finPalette';
import { BentoCard, KpiCounter, MeshBackground, PageHeader } from '@/components/ds';
import { useResponsive } from '@/hooks/use-responsive';

const DATA_KEY_LABELS: Record<string, string> = {
  tasks: 'Завдання', transactions: 'Транзакції', time_entries: 'Час',
  notes: 'Нотатки', projects: 'Проекти', bugs: 'Баги', ideas: 'Ідеї',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Назва', name: 'Назва', description: 'Опис', status: 'Статус',
  priority: 'Пріоритет', fixed: 'Виправлено', severity: 'Серйозність',
  updatedAt: 'Оновлено', amount: 'Сума', type: 'Тип', color: 'Колір',
};

interface Palette {
  bg1: string; bg2: string; border: string; text: string; sub: string;
  accent: string; green: string; orange: string; red: string; dim: string;
  /** DS v2: тло карток і повні токени (pill-кнопки, стани). */
  card: string; t: DSTheme; isDark: boolean;
  /** DS v2.1: стилі скла й змивка акценту (info). */
  gl: GlassStyles; accentTint: string;
}

export default function SyncScreen() {
  const contentWidth = useContentWidth();
  const router = useRouter();
  const { t, g, isDark, reduceTransparency } = useDS();
  const { tr } = useI18n();
  const { online } = useAppMode();
  const { status: authStatus } = useAuth();
  const {
    state: syncState, lastSyncAt, pendingCount, conflictsCount,
    lastError, oldestPendingAt, rejectedCount, syncNow,
  } = useSync();

  const [recovery,setRecovery]=useState<RecoveryDraft[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [rejected, setRejected] = useState<SyncRejection[]>([]);
  const [localOnly, setLocalOnly] = useState<LocalOnlyReport>(EMPTY_LOCAL_ONLY);
  const [pushing, setPushing] = useState(false);

  // Палітра — у useMemo: картка конфлікту нижче обгорнута в React.memo і
  // новий об'єкт кольорів щоразу зводив би мемоізацію нанівець.
  // DS v2: токени теми. `accent` — нейтральний (text.primary): головна дія
  // малюється pill action.primary, статуси — крапками status.*.
  const { isCompact } = useResponsive();
  const c: Palette = useMemo(() => ({
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    border: t.border.hairline,
    text:   t.text.primary,
    sub:    t.text.secondary,
    accent: g.accent.info.ink, green: t.status.success, orange: t.status.warning, red: t.status.danger,
    // Omni (DS v2.2): вміст — на суцільних bento-картках, тож вкладені рядки —
    // суцільний subtle (скляний subtle на білій картці не видно).
    dim:    t.surface.subtle,
    card:   t.surface.card,
    t, isDark,
    gl: glassStyles(isDark, reduceTransparency),
    accentTint: g.accent.info.tint,
  }), [t, g, isDark, reduceTransparency]);

  const refreshConflicts = useCallback(async () => {
    setConflicts(await loadConflicts());
    setRejected(await loadRejected());
    setRecovery(await loadRecoveryDrafts());
  }, []);

  useEffect(() => { refreshConflicts(); }, [refreshConflicts, rejectedCount]);

  // Перевіряється при вході й після КОЖНОГО обміну: саме «успішний» обмін і
  // приспав пильність минулого разу — він відправив нуль записів і відзвітував
  // про успіх, поки в сховищі лежали транзакції за два дні.
  useEffect(() => {
    let cancelled = false;
    void scanLocalOnlyRecords().then(report => { if (!cancelled) setLocalOnly(report); });
    return () => { cancelled = true; };
  }, [syncState, lastSyncAt, pendingCount]);

  const handlePushAll = useCallback(async () => {
    setPushing(true);
    try {
      await pushAllToServer();
      setLocalOnly(await scanLocalOnlyRecords());
    } finally {
      setPushing(false);
    }
  }, []);

  // «Спробувати ще» — просто випустити з карантину: наступна правка запису
  // покладе його в outbox знову. «Відкинути» робить те саме, але користувач
  // свідомо погоджується, що цей запис на сервер не поїде.
  const handleRelease = useCallback(async (item: SyncRejection) => {
    await releaseFromQuarantine(item.collection, item.local_id);
    await refreshConflicts();
  }, [refreshConflicts]);

  // ─── Вирішення конфліктів ──────────────────────────────────────────────────
  const handleResolve = useCallback(async (id: string, choice: 'local' | 'remote') => {
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
  }, [conflicts, refreshConflicts]);

  const isOnlineAuthed = online && authStatus === 'authed';
  const isCloudSyncing = syncState === 'syncing';
  const hasCloudError = syncState === 'error';

  const cloudStatusColor =
    hasCloudError ? c.red :
    isCloudSyncing ? c.t.status.info :
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
      <MeshBackground />
      {/* Без edges={['top']}: верхній інсет дає ScreenHeader через
          useTopInset() (CLAUDE.md) — разом вони зсували шапку двічі. */}
      <SafeAreaView style={{ flex: 1 }} edges={[]}>

        {/* Заголовок був вшитий рядком — тепер зі словника; на планшеті
            замість стрілки — шлях «Налаштування → Синхронізація». */}
        <ScreenHeader
          title={tr.sync}
          color={c.text}
          back={{ onPress: () => router.back(), label: tr.back, color: c.text, style: { ...c.gl.card, borderColor: 'transparent' } }}
          crumbs={[
            { label: tr.tabOptions, onPress: () => router.push('/(tabs)/settings') },
            { label: tr.sync },
          ]}
          crumbColor={c.sub}>
          {/* Omni KPI: стан черги — з даних, що вже є на екрані. */}
          <PageHeader
            bleed={isCompact ? 20 : 0}
            kpis={
              <>
                <KpiCounter value={pendingCount} label={`${tr.syncPending}`}
                  valueColor={isStalled ? c.orange : undefined} />
                <KpiCounter value={conflicts.length} label="Конфлікти"
                  valueColor={conflicts.length > 0 ? c.orange : undefined} />
                {rejected.length > 0 ? (
                  <KpiCounter value={rejected.length} label="Сервер не прийняв" valueColor={c.red} />
                ) : null}
              </>
            }
          />
        </ScreenHeader>

        <ScrollView
          contentContainerStyle={[contentWidth, { padding: 20, paddingBottom: 48 }]}
          showsVerticalScrollIndicator={false}>

            {recovery.map(row=><View key={row.id} style={{padding:16,marginBottom:12,backgroundColor:c.card,borderRadius:radius.nested}}>
              <Text style={{color:c.text}}>Локальна чернетка: права змінилися, ваш текст збережено.</Text>
              <Text selectable style={{color:c.text,marginVertical:8}}>{Object.values(row.text).join('\n\n')}</Text>
              <TouchableOpacity accessibilityRole="button" onPress={()=>void Clipboard.setStringAsync(Object.values(row.text).join('\n\n'))}><Text style={{color:c.text,fontFamily:fontFamily.semibold,textDecorationLine:'underline'}}>Копіювати текст</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={()=>void dismissRecoveryDraft(row.id).then(refreshConflicts)}><Text style={{color:c.sub}}>Видалити чернетку</Text></TouchableOpacity>
            </View>)}
            {/* ── CLOUD SYNC CARD ── (Omni: bento-картка з шапкою icon-chip + назва) */}
            <BentoCard title={tr.cloudSync} icon="icloud.fill" accent="info" style={st.card}>

              {/* Cloud status row */}
              {/* Статус — кольоровою крапкою; текст text.primary (4.5:1). */}
              <View style={[st.statusRow, { backgroundColor: c.dim }]}>
                <View style={[st.statusDot, { backgroundColor: cloudStatusColor }]} />
                <Text style={[st.statusText, { color: c.text, flex: 1 }]}>
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
                <View style={[st.hintRow, { backgroundColor: c.red + '12' }]}>
                  <IconSymbol name="exclamationmark.circle" size={14} color={c.red} />
                  <Text style={[st.hintText, { color: c.text }]} numberOfLines={4}>
                    {errorText}
                  </Text>
                </View>
              )}

              {/* Застрягла черга — окремий сигнал: синк може рапортувати «ок»,
                  поки записи не доїжджають днями. */}
              {isStalled && (
                <View style={[st.hintRow, { backgroundColor: c.orange + '1A' }]}>
                  <IconSymbol name="clock" size={14} color={c.text} />
                  <Text style={[st.hintText, { color: c.text }]}>
                    Черга не рухається з {fmtSyncTime(oldestPendingAt!)}. Записи лишаються
                    на цьому пристрої й не бачать змін з сервера.
                  </Text>
                </View>
              )}

              {/* Guest / Offline hint */}
              {!online && (
                <View style={[st.hintRow, { backgroundColor: c.dim }]}>
                  <IconSymbol name="icloud.slash" size={14} color={c.sub} />
                  <Text style={[st.hintText, { color: c.sub }]}>{tr.syncOfflineHint}</Text>
                </View>
              )}
              {online && authStatus !== 'authed' && (
                <View style={[st.hintRow, { backgroundColor: c.dim }]}>
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
                    ? t.action.primary
                    : t.state.disabledBg,
                }]}>
                {isCloudSyncing
                  ? <ActivityIndicator size="small" color={t.state.disabledText} />
                  : <IconSymbol name="arrow.triangle.2.circlepath" size={16} color={isOnlineAuthed ? t.text.onAction : t.state.disabledText} />
                }
                <Text style={[st.syncBtnText, {
                  color: isOnlineAuthed && !isCloudSyncing ? t.text.onAction : t.state.disabledText,
                }]}>
                  {tr.syncNow}
                </Text>
              </TouchableOpacity>
            </BentoCard>

            {/* ── ЛИШЕ НА ЦЬОМУ ПРИСТРОЇ ──
                Стоїть ВИЩЕ за карантин навмисно: карантин каже «сервер
                відмовив», тобто зв'язок був. Тут гірше — записи до сервера не
                доїжджали жодного разу, і поки цього не видно, «синхронізовано
                успішно» читається як «усе на місці». */}
            {localOnly.total > 0 && (
              <View style={{ marginTop: 4 }}>
                <BentoCard title={tr.syncLocalOnlyTitle} icon="exclamationmark.triangle.fill" accent="coral" style={st.card}
                  headerRight={<Text style={[st.count, { color: c.sub }]}>{localOnly.total}</Text>}>
                  <Text style={[st.hintText, { color: c.sub, marginBottom: 10 }]}>
                    {tr.syncLocalOnlyHint}
                  </Text>
                  {localOnly.byCollection.map(row => (
                    <View
                      key={row.collection}
                      style={[st.hintRow, { backgroundColor: c.dim }]}>
                      <View style={[st.statusDot, { backgroundColor: c.t.accent.coral, marginRight: 0 }]} />
                      <Text style={[st.hintText, { color: c.text, flex: 1 }]} numberOfLines={1}>
                        {row.collection}
                      </Text>
                      <Text style={[st.hintText, { color: c.text, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'], flex: 0 }]}>
                        {row.count}
                      </Text>
                    </View>
                  ))}
                  <TouchableOpacity
                    onPress={() => void handlePushAll()}
                    disabled={pushing || !isOnlineAuthed}
                    accessibilityRole="button"
                    style={[st.syncBtn, {
                      backgroundColor: pushing || !isOnlineAuthed ? t.state.disabledBg : t.action.primary,
                      marginTop: 10,
                    }]}>
                    <Text style={[st.syncBtnText, { color: pushing || !isOnlineAuthed ? t.state.disabledText : t.text.onAction }]}>
                      {tr.syncLocalOnlyAction}
                    </Text>
                  </TouchableOpacity>
                </BentoCard>
              </View>
            )}

            {/* ── ЧОМУ НЕ ПОЇХАЛО САМЕ ──
                Картка вище відповідає за останній обмін, а це — про тригер:
                чи взагалі хтось збирався синхронізувати без натискання кнопки.
                Поки ланцюг цілий, панель згорнута в один рядок. */}
            <SyncDiagnosticsPanel
              c={c}
              uiOnline={online}
              uiAuthStatus={authStatus}
              uiSyncState={syncState}
            />

            {/* ── КАРАНТИН ── */}
            {rejected.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <BentoCard title="Сервер не прийняв" icon="xmark.circle.fill" accent="coral" style={st.card}
                  headerRight={<Text style={[st.count, { color: c.sub }]}>{rejected.length}</Text>}>
                  <Text style={[st.hintText, { color: c.sub, marginBottom: 10 }]}>
                    Ці записи лишаються на пристрої. Решта синхронізації працює —
                    вони більше не блокують чергу.
                  </Text>
                  {rejected.map(item => (
                    <View
                      key={`${item.collection}:${item.local_id}`}
                      style={[st.hintRow, { backgroundColor: c.dim }]}>
                      <View style={[st.statusDot, { backgroundColor: c.t.accent.coral, marginRight: 0 }]} />
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
                </BentoCard>
              </View>
            )}

            {/* ── CONFLICTS ── */}
            {conflicts.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={[st.sectionLabel, { color: c.sub }]}>Конфлікти ({conflicts.length})</Text>
                {conflicts.map(conflict => (
                  <ConflictCard key={conflict.id} conflict={conflict}
                    onResolve={handleResolve} c={c} isDark={isDark} />
                ))}
              </View>
            )}

            {/* ── SUCCESS CLOUD ── */}
            {syncState === 'idle' && conflicts.length === 0 && lastSyncAt && (
              <View style={[st.banner, { backgroundColor: c.card }, shadow[isDark ? 'dark' : 'light'].card]}>
                <View style={[st.bannerIcon, { backgroundColor: c.green + '1F' }]}>
                  <IconSymbol name="checkmark" size={18} color={c.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[st.bannerTitle, { color: c.text }]}>Синхронізовано успішно</Text>
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

interface ConflictCardProps {
  conflict: SyncConflict;
  onResolve: (id: string, choice: 'local' | 'remote') => void;
  c: Palette;
  isDark: boolean;
}

const ConflictCard = React.memo(function ConflictCard({ conflict, onResolve, c, isDark }: ConflictCardProps) {
  const label = DATA_KEY_LABELS[conflict.dataKey] ?? conflict.dataKey;
  const name = conflict.local?.title ?? conflict.local?.name ?? `#${String(conflict.local?.id ?? '').slice(0, 6)}`;
  const diffs = getFieldDiffs(conflict.local, conflict.remote);

  return (
    <View style={[st.conflictCard, { backgroundColor: c.card }, shadow[isDark ? 'dark' : 'light'].card]}>

      <View style={[st.conflictHead, { borderBottomColor: c.border }]}>
        <View style={[st.conflictDot, { backgroundColor: c.t.status.warning }]} />
        <Text style={[st.conflictLabel, { color: c.sub }]}>{label}</Text>
        <Text style={[st.conflictName, { color: c.text, flex: 1 }]} numberOfLines={1}>{name}</Text>
        <Text style={[st.diffCount, { color: c.sub }]}>{diffs.length} змін</Text>
      </View>

      <View style={st.versionsRow}>
        <VersionPanel label="Мій пристрій" accent={c.t.accent.lavender} diffs={diffs} version="local" c={c} />
        <View style={[st.vDivider, { backgroundColor: c.border }]} />
        <VersionPanel label="Інший пристрій" accent={c.t.status.info} diffs={diffs} version="remote" c={c} />
      </View>

      <View style={[st.conflictActions, { borderTopColor: c.border }]}>
        {/* Два рівноправні рішення — дві pill: основна (моє) і вторинна (інше). */}
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'local')}
          style={[st.resolveBtn, { backgroundColor: c.t.action.primary }]}>
          <IconSymbol name="checkmark" size={12} color={c.t.text.onAction} />
          <Text style={[st.resolveBtnText, { color: c.t.text.onAction }]}>Залишити моє</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onResolve(conflict.id, 'remote')}
          style={[st.resolveBtn, { backgroundColor: c.dim }]}>
          <IconSymbol name="checkmark" size={12} color={c.t.action.secondaryText} />
          <Text style={[st.resolveBtnText, { color: c.t.action.secondaryText }]}>Прийняти інше</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

function VersionPanel({ label, accent, diffs, version, c }: {
  label: string; accent: string;
  diffs: { key: string; local: string; remote: string }[];
  version: 'local' | 'remote'; c: Palette;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={st.vLabelRow}>
        <View style={[st.vDot, { backgroundColor: accent }]} />
        <Text style={[st.vLabel, { color: c.sub }]}>{label}</Text>
      </View>
      {diffs.length === 0
        ? <Text style={{ fontSize: 12, color: c.sub }}>Без змін</Text>
        : diffs.map(f => (
          <View key={f.key} style={{ marginBottom: 8 }}>
            <Text style={[st.fKey, { color: c.sub }]}>{FIELD_LABELS[f.key] ?? f.key}</Text>
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
  card:          { marginBottom: space.cardGap },
  count:         { fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  statusRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, marginBottom: 12 },
  statusDot:     { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  statusText:    { fontSize: 13, fontFamily: fontFamily.semibold, fontVariant: ['tabular-nums'] },
  pendingText:   { ...dsType.caption, fontVariant: ['tabular-nums'], marginBottom: 12, paddingHorizontal: 2 },
  hintRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.nestedCompact, marginBottom: 12 },
  hintText:      { fontSize: 12, fontFamily: fontFamily.regular, lineHeight: 17, flex: 1 },
  syncBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: radius.pill, marginTop: 4 },
  syncBtnText:   { fontSize: 14, fontFamily: fontFamily.semibold },
  banner:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space[4], borderRadius: radius.nested, marginBottom: 16 },
  bannerIcon:    { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  bannerTitle:   { ...dsType.h2, fontSize: 14 },
  bannerSub:     { ...dsType.caption, marginTop: 2 },
  sectionLabel:  { fontSize: 11, fontFamily: fontFamily.semibold, marginLeft: 4 },
  conflictCard:  { borderRadius: radius.cardCompact, overflow: 'hidden', marginBottom: 12 },
  conflictHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  conflictDot:   { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  conflictLabel: { fontSize: 10, fontFamily: fontFamily.semibold },
  conflictName:  { fontSize: 13, fontFamily: fontFamily.semibold, marginLeft: 4 },
  diffCount:     { fontSize: 10, fontFamily: fontFamily.semibold },
  versionsRow:   { flexDirection: 'row', padding: 16, gap: 12 },
  vDivider:      { width: StyleSheet.hairlineWidth },
  vLabelRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  vDot:          { width: 5, height: 5, borderRadius: 3 },
  vLabel:        { fontSize: 10, fontFamily: fontFamily.semibold },
  fKey:          { fontSize: 10, fontFamily: fontFamily.semibold, marginBottom: 2 },
  fVal:          { fontSize: 12, fontFamily: fontFamily.medium, lineHeight: 16 },
  conflictActions:{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  resolveBtn:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, borderRadius: radius.pill },
  resolveBtnText:{ fontSize: 13, fontFamily: fontFamily.semibold },
});
