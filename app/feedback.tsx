/**
 * app/feedback.tsx — «Ідеї та баги»: ОДИН екран замість ideas.tsx + bugs.tsx
 * (flowi-server-app/docs/specs/feedback-inbox.md §10).
 *
 * Дані лишаються у ДВОХ синхронізованих колекціях `ideas` і `bugs` (§3.1) —
 * спільний тут лише погляд. Надсилання йде на СВІЙ сервер через клієнтську
 * чергу (api/feedback.ts): «Надіслано» з'являється лише після 2xx, статус і
 * коментар власника продукту приходять із `GET /api/feedback/reports/`.
 *
 * Компонування (§10.1): compact — список, форма й деталь аркушами;
 * medium — список на всю ширину, деталь аркушем; expanded — список +
 * колонка деталі (DetailPane).
 *
 * Параметри маршруту: `kind=idea|bug` — відкрита вкладка, `open=<id>` —
 * запис, на який веде push `feedback.status_changed`, `from=<шлях>` — екран,
 * з якого прийшли (для контексту бага; береться лише ШАБЛОН, §8.2).
 */
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import * as DocumentPicker from 'expo-document-picker';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  FEEDBACK_FILES_KEY,
  FEEDBACK_STATUS_CACHE_KEY,
  FEEDBACK_STATUS_SYNC_KEY,
  discardLocalFiles,
  dropFromQueue,
  enqueueFeedback,
  fileSizeOf,
  importPickedFiles,
  loadLocalFiles,
  loadStatusCache,
  loadSyncedStatuses,
  mergeStatuses,
  processFeedbackQueue,
  refreshStatusCache,
  retryFeedbackReport,
  startFeedbackQueue,
  type StatusCache,
} from '@/api/feedback';
import { FeedbackCard } from '@/components/feedback/FeedbackCard';
import { FeedbackDetailBody, FeedbackDetailHeader } from '@/components/feedback/FeedbackDetail';
import { FeedbackForm } from '@/components/feedback/FeedbackForm';
import { KIND_COLOR, requiredFieldLabel } from '@/components/feedback/labels';
import {
  COLLECTION_FOR_KIND,
  MAX_ATTACHMENTS,
  applyDraft,
  buildContext,
  checkAttachments,
  combineEntries,
  draftFromEntry,
  emptyDraft,
  filterAndSort,
  isDone,
  isSubmitted,
  mimeFor,
  missingForSubmit,
  resolveState,
  statusKey,
  type Bug,
  type FeedbackAttachment,
  type FeedbackDraft,
  type FeedbackEntry,
  type FeedbackFilter,
  type FeedbackKind,
  type FeedbackRecord,
  type FeedbackSort,
  type Idea,
} from '@/components/feedback/model';
import { DetailPane } from '@/components/shared/DetailPane';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useContentWidth } from '@/hooks/use-content-width';
import { useResponsive } from '@/hooks/use-responsive';
import { useSyncedList } from '@/hooks/use-synced-list';
import { CLIENT_VERSION, getCachedWorkspace } from '@/store/api-config';
import { useI18n } from '@/store/i18n';
import { hasStorageReadFailure, subscribeToStorage } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';

/** Між закриттям одного аркуша й відкриттям наступного (NEW-02 у CLAUDE.md). */
const SHEET_HANDOFF_MS = 260;

type FormState = { key: number; entry: FeedbackEntry | null; initial: FeedbackDraft } | null;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function FeedbackScreen() {
  const params = useLocalSearchParams<{ kind?: string; open?: string; from?: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const { tr, lang } = useI18n();
  const { width, height, isExpanded } = useResponsive();
  const contentWidth = useContentWidth();
  const locale = lang === 'uk' ? 'uk-UA' : 'en-US';

  const initialKind: FeedbackKind = firstParam(params.kind) === 'bug' ? 'bug' : 'idea';
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [filter, setFilter] = useState<FeedbackFilter>('all');
  const [sort, setSort] = useState<FeedbackSort>('newest');
  const [selected, setSelected] = useState<{ kind: FeedbackKind; id: string } | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [statusCache, setStatusCache] = useState<StatusCache>({ fetchedAt: null, forwardingConfigured: null, byKey: {} });
  // Живі статуси з синку (`feedback_status`, лише читання) — приходять одразу
  // після зміни власником, без відкриття екрана.
  const [syncedStatuses, setSyncedStatuses] = useState<StatusCache['byKey']>({});
  const [localFileUids, setLocalFileUids] = useState<ReadonlySet<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** Файли, додані у ВІДКРИТІЙ формі: скасування форми має їх прибрати з диска. */
  const sessionFilesRef = useRef<Set<string>>(new Set());
  const detailScrollRef = useRef<ScrollView | null>(null);

  // Екран лише ЧИТАЄ колекції через хук — усі правки йдуть через
  // updateSynced (читання-зміна-запис під блокуванням ключа), бо ту саму
  // колекцію паралельно правлять черга подання і рушій синку.
  const ideasList = useSyncedList<Idea>('ideas', { enabled: false });
  const bugsList = useSyncedList<Bug>('bugs', { enabled: false });
  const reloadIdeas = ideasList.reload;
  const reloadBugs = bugsList.reload;

  const c = useMemo(() => ({
    bg1:    isDark ? '#0C0C14' : '#F5F0FF',
    bg2:    isDark ? '#14121E' : '#EDE8FF',
    border: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
    text:   isDark ? '#F0EEFF' : '#1A1433',
    sub:    isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
    dim:    isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    sheet:  isDark ? 'rgba(18,15,30,0.98)' : 'rgba(252,250,255,0.98)',
  }), [isDark]);
  const cardColors = useMemo(() => ({ border: c.border, text: c.text, sub: c.sub }), [c]);
  const accent = KIND_COLOR[kind];

  const loadAll = useCallback(async () => {
    await Promise.all([reloadIdeas(), reloadBugs()]);
    setLoadFailed(hasStorageReadFailure('ideas') || hasStorageReadFailure('bugs'));
    const [cache, files, synced] = await Promise.all([loadStatusCache(), loadLocalFiles(), loadSyncedStatuses()]);
    setStatusCache(cache);
    setSyncedStatuses(synced);
    setLocalFileUids(new Set(Object.keys(files)));
    setLoaded(true);
  }, [reloadIdeas, reloadBugs]);

  const refreshStatuses = useCallback(async () => {
    try {
      setStatusCache(await refreshStatusCache());
    } catch (e) {
      // Статуси — не критичні: список і черга працюють і без них.
      if (__DEV__) console.warn('[feedback] статуси не оновились:', e);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadAll();
    startFeedbackQueue();
    void refreshStatuses();
  }, [loadAll, refreshStatuses]));

  useEffect(() => subscribeToStorage(key => {
    if (key === FEEDBACK_FILES_KEY) {
      void loadLocalFiles().then(files => setLocalFileUids(new Set(Object.keys(files))));
    } else if (key === FEEDBACK_STATUS_CACHE_KEY) {
      void loadStatusCache().then(setStatusCache);
    } else if (key === FEEDBACK_STATUS_SYNC_KEY) {
      void loadSyncedStatuses().then(setSyncedStatuses);
    }
  }), []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadAll(), processFeedbackQueue(), refreshStatuses()]).finally(() => setRefreshing(false));
  }, [loadAll, refreshStatuses]);

  const entries = useMemo(
    () => combineEntries(ideasList.items, bugsList.items),
    [ideasList.items, bugsList.items],
  );

  const statusByKey = useMemo(
    () => mergeStatuses(statusCache.byKey, syncedStatuses),
    [statusCache.byKey, syncedStatuses],
  );
  const stateOf = useCallback(
    (entry: FeedbackEntry) => resolveState(entry.item, statusByKey[statusKey(entry.kind, entry.item.id)]),
    [statusByKey],
  );

  const ofKind = useMemo(() => entries.filter(e => e.kind === kind), [entries, kind]);
  const visible = useMemo(() => filterAndSort(ofKind, filter, sort, stateOf), [ofKind, filter, sort, stateOf]);
  const counts = useMemo(() => ({
    open: ofKind.filter(e => !isDone(e)).length,
    done: ofKind.filter(isDone).length,
    sent: ofKind.filter(e => isSubmitted(stateOf(e))).length,
  }), [ofKind, stateOf]);

  const selectedEntry = useMemo(
    () => (selected ? entries.find(e => e.kind === selected.kind && e.item.id === selected.id) ?? null : null),
    [entries, selected],
  );

  // Deep link `?open=<id>` (push feedback.status_changed): id шукаємо в обох
  // колекціях — з нього ж видно, яку вкладку відкрити.
  const openParam = firstParam(params.open);
  const handledOpenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !openParam || handledOpenRef.current === openParam) return;
    // Сервер кладе в deep link `local_id` колекції feedback_status —
    // `<kind>:<id>`; старі посилання несуть голий id.
    const prefixed = /^(idea|bug):(.+)$/.exec(openParam);
    const wantedKind = prefixed?.[1];
    const wantedId = prefixed ? prefixed[2] : openParam;
    const target = entries.find(e => e.item.id === wantedId && (!wantedKind || e.kind === wantedKind))
      ?? entries.find(e => e.item.id === openParam);
    if (!target) return;
    handledOpenRef.current = openParam;
    setKind(target.kind);
    setSelected({ kind: target.kind, id: target.item.id });
  }, [loaded, openParam, entries]);

  const contextNow = useCallback(() => buildContext({
    windowWidth: width,
    appVersion: CLIENT_VERSION,
    screen: firstParam(params.from) ?? '/feedback',
    osName: Device.osName,
    osVersion: Device.osVersion,
    locale: lang,
    workspace: getCachedWorkspace()?.name ?? null,
  }), [width, params.from, lang]);

  // ─── Запис і черга ─────────────────────────────────────────────────────────

  const writeRecord = useCallback(async (
    entryKind: FeedbackKind,
    mutate: (fresh: FeedbackRecord[]) => FeedbackRecord[],
  ): Promise<boolean> => {
    try {
      await updateSynced<FeedbackRecord>(COLLECTION_FOR_KIND[entryKind], mutate);
      return true;
    } catch (e) {
      if (__DEV__) console.warn('[feedback] запис не вдався:', e);
      Alert.alert(tr.fbSaveFailed);
      return false;
    }
  }, [tr]);

  const send = useCallback(async (entryKind: FeedbackKind, id: string) => {
    setBusy(true);
    try {
      await enqueueFeedback(entryKind, id, contextNow());
      await processFeedbackQueue();
      await refreshStatuses();
    } catch (e) {
      if (__DEV__) console.warn('[feedback] постановка в чергу не вдалась:', e);
      Alert.alert(tr.fbSaveFailed);
    } finally {
      setBusy(false);
    }
  }, [contextNow, refreshStatuses, tr]);

  // ─── Форма ─────────────────────────────────────────────────────────────────

  const openForm = useCallback((entry: FeedbackEntry | null) => {
    sessionFilesRef.current = new Set();
    const initial = entry ? draftFromEntry(entry) : emptyDraft(kind);
    const show = () => setForm(prev => ({ key: (prev?.key ?? 0) + 1, entry, initial }));
    // На вузькому екрані деталь — теж модалка: спершу закриваємо її.
    if (selected && !isExpanded) {
      setSelected(null);
      setTimeout(show, SHEET_HANDOFF_MS);
    } else {
      show();
    }
  }, [kind, selected, isExpanded]);

  const closeForm = useCallback(() => {
    const leftovers = [...sessionFilesRef.current];
    sessionFilesRef.current = new Set();
    setForm(null);
    void discardLocalFiles(leftovers);
  }, []);

  const saveForm = useCallback(async (draft: FeedbackDraft, sendNow: boolean) => {
    if (!form) return;
    const editing = form.entry;
    const id = editing?.item.id ?? Date.now().toString();
    const now = new Date().toISOString();
    const ok = await writeRecord(draft.kind, fresh => {
      const current = editing ? fresh.find(r => r.id === id) : undefined;
      const base = current ? ({ kind: draft.kind, item: current } as FeedbackEntry) : null;
      const next = applyDraft(base, draft, id, now).item;
      return current ? fresh.map(r => (r.id === id ? next : r)) : [next, ...fresh];
    });
    if (!ok) return;
    // Прибрані з форми локальні файли — геть із диска; додані й збережені —
    // більше не «сесійні».
    const kept = new Set(draft.attachments.map(a => a.uid));
    const removed = [
      ...(form.initial.attachments.map(a => a.uid)),
      ...sessionFilesRef.current,
    ].filter(uid => !kept.has(uid));
    sessionFilesRef.current = new Set();
    setForm(null);
    void discardLocalFiles(removed);
    setKind(draft.kind);
    if (isExpanded) setSelected({ kind: draft.kind, id });
    if (sendNow) void send(draft.kind, id);
  }, [form, writeRecord, isExpanded, send]);

  const pickAttachments = useCallback(async (existing: readonly FeedbackAttachment[]): Promise<FeedbackAttachment[]> => {
    let result: DocumentPicker.DocumentPickerResult;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*'],
        multiple: true,
        copyToCacheDirectory: true,
      });
    } catch (e) {
      if (__DEV__) console.warn('[feedback] пікер не відкрився:', e);
      return [];
    }
    if (result.canceled || !result.assets?.length) return [];
    const candidates = result.assets.map(asset => ({
      uri: asset.uri,
      name: asset.name,
      mime: mimeFor(asset.name, asset.mimeType),
      bytes: typeof asset.size === 'number' ? asset.size : fileSizeOf(asset.uri),
    }));
    const { accepted, rejected } = checkAttachments(existing, candidates);
    if (rejected.length) {
      const lines = rejected.map(({ candidate, reason }) => {
        if (reason === 'too_many') return tr.fbAttachTooMany.replace('{max}', String(MAX_ATTACHMENTS));
        if (reason === 'bad_type') return tr.fbAttachBadType.replace('{name}', candidate.name);
        if (reason === 'too_big') return tr.fbAttachTooBig.replace('{name}', candidate.name);
        return tr.fbAttachTotal;
      });
      Alert.alert(tr.fbFieldAttachments, [...new Set(lines)].join('\n'));
    }
    if (!accepted.length) return [];
    try {
      const { attachments, evicted } = await importPickedFiles(accepted);
      attachments.forEach(a => sessionFilesRef.current.add(a.uid));
      if (evicted.length) Alert.alert(tr.fbFieldAttachments, tr.fbAttachCacheEvicted);
      return attachments;
    } catch (e) {
      if (__DEV__) console.warn('[feedback] не вдалося зберегти вкладення:', e);
      Alert.alert(tr.fbSaveFailed);
      return [];
    }
  }, [tr]);

  // ─── Дії над записом ───────────────────────────────────────────────────────

  const toggleDone = useCallback((entry: FeedbackEntry) => {
    void writeRecord(entry.kind, fresh => fresh.map(r => {
      if (r.id !== entry.item.id) return r;
      if (entry.kind === 'bug') return { ...(r as Bug), fixed: !(r as Bug).fixed };
      const idea = r as Idea;
      return { ...idea, status: idea.status === 'done' ? 'idea' : 'done' };
    }));
  }, [writeRecord]);

  const deleteEntry = useCallback((entry: FeedbackEntry) => {
    Alert.alert(tr.fbDeleteTitle, tr.fbDeleteBody, [
      { text: tr.cancel, style: 'cancel' },
      {
        text: tr.delete,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const ok = await writeRecord(entry.kind, fresh => fresh.filter(r => r.id !== entry.item.id));
            if (!ok) return;
            setSelected(null);
            await dropFromQueue(entry.kind, entry.item.id);
            await discardLocalFiles((entry.item.attachments ?? []).map(a => a.uid));
          })();
        },
      },
    ]);
  }, [tr, writeRecord]);

  const copyEntry = useCallback(async (entry: FeedbackEntry) => {
    const parts = [entry.item.title, entry.item.description];
    if (entry.kind === 'bug') {
      if (entry.item.steps) parts.push(`${tr.fbFieldSteps}:\n${entry.item.steps}`);
      if (entry.item.expected) parts.push(`${tr.fbFieldExpected}: ${entry.item.expected}`);
      if (entry.item.actual) parts.push(`${tr.fbFieldActual}: ${entry.item.actual}`);
    }
    await Clipboard.setStringAsync(parts.filter(Boolean).join('\n\n'));
    Alert.alert(tr.fbCopied);
  }, [tr]);

  const sendEntry = useCallback((entry: FeedbackEntry) => {
    const missing = missingForSubmit(draftFromEntry(entry));
    if (missing.length) {
      // Легасі-запис без кроків відтворення: спершу дописати, потім надіслати.
      Alert.alert(
        tr.fbSend,
        tr.fbRequiredMissing.replace('{fields}', missing.map(f => requiredFieldLabel(tr, f)).join(', ')),
        [
          { text: tr.cancel, style: 'cancel' },
          { text: tr.edit, onPress: () => openForm(entry) },
        ],
      );
      return;
    }
    void send(entry.kind, entry.item.id);
  }, [tr, openForm, send]);

  const retryEntry = useCallback(async (entry: FeedbackEntry) => {
    const state = stateOf(entry);
    if (state.retry === 'client') {
      sendEntry(entry);
      return;
    }
    const reportUid = statusByKey[statusKey(entry.kind, entry.item.id)]?.reportUid || entry.item.reportUid;
    if (!reportUid) return;
    setBusy(true);
    try {
      await retryFeedbackReport(reportUid);
      await refreshStatuses();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      Alert.alert(tr.fbRetry, tr.fbSendError.replace('{reason}', message));
    } finally {
      setBusy(false);
    }
  }, [stateOf, sendEntry, statusByKey, refreshStatuses, tr]);

  const openEntry = useCallback((entry: FeedbackEntry) => {
    setSelected({ kind: entry.kind, id: entry.item.id });
  }, []);

  const renderItem = useCallback(({ item }: { item: FeedbackEntry }) => (
    <FeedbackCard
      entry={item}
      state={stateOf(item)}
      selected={!!selected && selected.kind === item.kind && selected.id === item.item.id}
      isDark={isDark}
      colors={cardColors}
      locale={locale}
      tr={tr}
      onOpen={openEntry}
      onToggleDone={toggleDone}
    />
  ), [stateOf, selected, isDark, cardColors, locale, tr, openEntry, toggleDone]);

  const selectedState = selectedEntry ? stateOf(selectedEntry) : null;
  const forwardingOff = statusCache.forwardingConfigured === false;

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/settings');
  };

  const filterLabels: Record<FeedbackFilter, string> = {
    all: tr.fbFilterAll, open: tr.fbFilterOpen, done: tr.fbFilterDone, sent: tr.fbFilterSent,
  };
  const sortOptions: { key: FeedbackSort; label: string; icon: string }[] = [
    { key: 'newest', label: tr.fbSortNewest, icon: 'arrow.down.circle' },
    { key: 'oldest', label: tr.fbSortOldest, icon: 'arrow.up.circle' },
    { key: 'weight', label: kind === 'bug' ? tr.fbFieldSeverity : tr.fbFieldPriority, icon: 'bolt' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[c.bg1, c.bg2]} style={StyleSheet.absoluteFill} />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1 }}>
          <ScreenHeader
            title={tr.fbTitle}
            color={c.text}
            titleStyle={st.pageTitle}
            paddingBottom={6}
            back={{ onPress: back, label: tr.back, color: c.text }}
            actions={
              <HeaderButton
                onPress={() => openForm(null)}
                accessibilityLabel={kind === 'bug' ? tr.fbNewBug : tr.fbNewIdea}
                style={{ backgroundColor: accent, borderColor: accent }}>
                <IconSymbol name="plus" size={18} color="#fff" />
              </HeaderButton>
            }
          />

          <View style={[contentWidth, { paddingHorizontal: 20 }]}>
            {/* Тип: Ідеї | Баги (§10.1) */}
            <View style={[st.segment, { borderColor: c.border, backgroundColor: c.dim }]} accessibilityRole="tablist">
              {(['idea', 'bug'] as const).map(k => {
                const active = kind === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => setKind(k)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={[st.segmentBtn, active && { backgroundColor: KIND_COLOR[k] }]}>
                    <IconSymbol name={k === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={13} color={active ? '#fff' : c.sub} />
                    <Text style={{ color: active ? '#fff' : c.sub, fontWeight: '700', fontSize: 13 }}>
                      {k === 'bug' ? tr.fbTabBugs : tr.fbTabIdeas}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={st.stats}>
              {([
                { label: tr.fbStatOpen, value: counts.open, color: accent },
                { label: tr.fbStatDone, value: counts.done, color: '#10B981' },
                { label: tr.fbStatSent, value: counts.sent, color: '#F59E0B' },
              ]).map(stat => (
                <View key={stat.label} style={[st.statCard, { backgroundColor: stat.color + '18', borderColor: stat.color + '30' }]}>
                  <Text style={{ color: stat.color, fontSize: 20, fontWeight: '800' }}>{stat.value}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: stat.color, fontSize: 11, fontWeight: '600', marginTop: 2 }}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <BlurView intensity={isDark ? 18 : 35} tint={isDark ? 'dark' : 'light'} style={[st.filterRow, { borderColor: c.border }]}>
              {(['all', 'open', 'done', 'sent'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f }}
                  style={[st.filterBtn, filter === f && { backgroundColor: accent }]}>
                  <Text style={{ color: filter === f ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {filterLabels[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </BlurView>

            <View style={st.sortRow}>
              {sortOptions.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setSort(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === opt.key }}
                  style={[st.sortChip, {
                    backgroundColor: sort === opt.key ? accent + '20' : c.dim,
                    borderColor: sort === opt.key ? accent : c.border,
                  }]}>
                  <IconSymbol name={opt.icon as never} size={11} color={sort === opt.key ? accent : c.sub} />
                  <Text style={{ color: sort === opt.key ? accent : c.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {forwardingOff ? (
              <View style={[st.banner, { borderColor: c.border, backgroundColor: c.dim }]}>
                <IconSymbol name="info.circle" size={14} color={c.sub} />
                <Text style={{ color: c.sub, fontSize: 12, flex: 1 }}>{tr.fbForwardingOff}</Text>
              </View>
            ) : null}
          </View>

          <FlatList
            data={visible}
            keyExtractor={entry => `${entry.kind}:${entry.item.id}`}
            contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24 }]}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={Separator}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
            renderItem={renderItem}
            ListEmptyComponent={
              !loaded ? null : loadFailed ? (
                // «Не прочиталось» і «порожньо» — різні речі (CLAUDE.md, ERR-01).
                <View style={st.empty}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={36} color="#EF4444" />
                  <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{tr.fbLoadFailed}</Text>
                  <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={[st.retryBtn, { borderColor: c.border }]}>
                    <Text style={{ color: c.text, fontWeight: '600' }}>{tr.fbRetry}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={st.empty}>
                  <IconSymbol name={kind === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={40} color={c.sub} />
                  <Text style={{ color: c.sub, fontSize: 15, fontWeight: '600' }}>{kind === 'bug' ? tr.fbEmptyBugs : tr.fbEmptyIdeas}</Text>
                  <Text style={{ color: c.sub, fontSize: 13 }}>{tr.fbEmptyHint}</Text>
                </View>
              )
            }
          />
        </View>

        <DetailPane
          open={!!selectedEntry}
          wide={isExpanded}
          onClose={() => setSelected(null)}
          isDark={isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.88}
          scrollRef={detailScrollRef}
          header={selectedEntry ? (
            <FeedbackDetailHeader
              entry={selectedEntry}
              colors={c}
              tr={tr}
              onEdit={() => openForm(selectedEntry)}
              onClose={() => setSelected(null)}
            />
          ) : undefined}
          empty={
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>{tr.fbSelectHint}</Text>
          }>
          {selectedEntry && selectedState ? (
            <FeedbackDetailBody
              entry={selectedEntry}
              state={selectedState}
              localFileUids={localFileUids}
              forwardingOff={forwardingOff}
              busy={busy}
              locale={locale}
              colors={c}
              tr={tr}
              onSend={() => sendEntry(selectedEntry)}
              onRetry={() => { void retryEntry(selectedEntry); }}
              onToggleDone={() => toggleDone(selectedEntry)}
              onCopy={() => { void copyEntry(selectedEntry); }}
              onDelete={() => deleteEntry(selectedEntry)}
            />
          ) : null}
        </DetailPane>
      </View>

      <SheetModal visible={!!form} onClose={closeForm}>
        {form ? (
          <FeedbackForm
            key={form.key}
            initial={form.initial}
            isNew={!form.entry}
            attachmentsLocked={!!form.entry && !stateOf(form.entry).canSend}
            canSend={!form.entry || stateOf(form.entry).canSend}
            contextPreview={contextNow()}
            localFileUids={localFileUids}
            isDark={isDark}
            maxHeight={height * 0.86}
            colors={c}
            tr={tr}
            onPickAttachments={pickAttachments}
            onSave={(draft, sendNow) => { void saveForm(draft, sendNow); }}
            onCancel={closeForm}
          />
        ) : null}
      </SheetModal>
    </View>
  );
}

function Separator() {
  return <View style={{ height: 10 }} />;
}

const st = StyleSheet.create({
  pageTitle:  { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  segment:    { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 3, marginTop: 6 },
  segmentBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, minHeight: 40 },
  stats:      { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 12 },
  statCard:   { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  filterRow:  { flexDirection: 'row', borderRadius: 13, borderWidth: 1, padding: 3, overflow: 'hidden' },
  filterBtn:  { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  sortRow:    { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 12 },
  sortChip:   { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 12 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  retryBtn:   { borderWidth: 1, borderRadius: 11, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
});
