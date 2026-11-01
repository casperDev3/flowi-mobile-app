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
import { requiredFieldLabel } from '@/components/feedback/labels';
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
import { SwipeRow, ZoneLayout, ZoneSkeleton, zoneWidths, type SwipeAction } from '@/components/layout-zones';
import { useZoneState } from '@/hooks/use-zone-state';
import { Atlas } from '@/constants/atlas';
import { useFinanceLayoutStrings } from '@/components/finance/layoutStrings';
import { AppHeader } from '@/components/shared/AppHeader';
import { HeaderButton } from '@/components/shared/ScreenHeader';
import { SheetModal } from '@/components/shared/SheetModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { dsTokens, glassTokens, useDS } from '@/hooks/use-ds';
import { useContentWidth } from '@/hooks/use-content-width';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useSyncedList } from '@/hooks/use-synced-list';
import { CLIENT_VERSION, getCachedWorkspace } from '@/store/api-config';
import { useI18n } from '@/store/i18n';
import { hasStorageReadFailure, subscribeToStorage } from '@/store/storage';
import { updateSynced } from '@/store/synced-storage';
import { fontFamily } from '@/constants/theme';
import { glassStyles } from '@/components/finance/finPalette';
import { KpiCounter, MeshBackground, SectionTabs } from '@/components/ds';

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
  const { width, height, isWide } = useResponsive();
  const screenWidth = useScreenWidth();
  /**
   * Layout System v2.4: деталь — панель праворуч (планшет, коли вміщається)
   * або нижній аркуш ~60% (телефон / вузьке вікно; це Modal — форма після
   * нього відкривається з паузою, NEW-02).
   */
  const detailInPanel = isWide && zoneWidths({
    windowWidth: width, screenWidth, wide: isWide, wantStatic: false, wantDynamic: true,
  }).dynamicMode === 'panel';
  const lz = useFinanceLayoutStrings();
  // Вибраний запис дзеркалиться в `?fb=<kind>:<id>`; старий `?open=` працює.
  const zoneState = useZoneState({ section: 'feedback', selectedParam: 'fb', label: tr.fbTitle });
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

  const k = dsTokens(isDark);
  const g = glassTokens(isDark);
  const { reduceTransparency } = useDS();

  // DS v2.1: mesh-основа, скляні картки/аркуш (gl), акцент екрана — amber (ідеї).
  const c = useMemo(() => ({
    bg1:    g.mesh.base,
    bg2:    g.mesh.base,
    border: k.border.hairline,
    text:   k.text.primary,
    sub:    k.text.secondary,
    dim:    g.surfaceSubtle,
    sheet:  g.surfaceStrong,
    card:   reduceTransparency ? g.solid.card : g.surface,
    action: k.action.primary,
    onAction: k.text.onAction,
    accent: g.accent.amber.ink,
    accentTint: g.accent.amber.tint,
    gl:     glassStyles(isDark, reduceTransparency),
  }), [k, g, isDark, reduceTransparency]);
  const cardColors = useMemo(() => ({ border: c.border, text: c.text, sub: c.sub }), [c]);

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

  // ?fb=<kind>:<id> (Layout System v2.4): перший прохід після читання
  // відкриває запис з адреси, далі вибір дзеркалиться в адресу.
  const zoneSelectRef = useRef(zoneState.select);
  useEffect(() => { zoneSelectRef.current = zoneState.select; });
  const fbParamConsumed = useRef(false);
  const fbParam = zoneState.selectedId;
  useEffect(() => {
    if (!loaded || fbParamConsumed.current) return;
    fbParamConsumed.current = true;
    const m = fbParam ? /^(idea|bug):(.+)$/.exec(fbParam) : null;
    if (!m) return;
    const target = entries.find(e => e.kind === m[1] && e.item.id === m[2]);
    if (!target) return;
    setKind(target.kind);
    setSelected({ kind: target.kind, id: target.item.id });
  }, [loaded, fbParam, entries]);
  const selectedKey = selected ? `${selected.kind}:${selected.id}` : null;
  useEffect(() => {
    if (!fbParamConsumed.current) return;
    zoneSelectRef.current(selectedKey);
  }, [selectedKey]);

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
    if (selected && !detailInPanel) {
      setSelected(null);
      setTimeout(show, SHEET_HANDOFF_MS);
    } else {
      show();
    }
  }, [kind, selected, detailInPanel]);

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
    if (detailInPanel) setSelected({ kind: draft.kind, id });
    if (sendNow) void send(draft.kind, id);
  }, [form, writeRecord, detailInPanel, send]);

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

  /**
   * Свайп уліво (Layout System v2.4): «Виконано / Відкрити знову» і
   * «Видалити» без входу в деталь — ті самі toggleDone і deleteEntry (з
   * підтвердженням), що й у картці та деталі.
   */
  const swipeActionsFor = useCallback((entry: FeedbackEntry): SwipeAction[] => [
    isDone(entry)
      ? { key: 'reopen', label: tr.fbReopen, icon: 'arrow.uturn.backward', tone: 'neutral', onPress: () => toggleDone(entry) }
      : { key: 'done', label: entry.kind === 'bug' ? tr.fbDoneBug : tr.fbDoneIdea, icon: 'checkmark', tone: 'success', onPress: () => toggleDone(entry) },
    { key: 'delete', label: lz.swipeDelete, icon: 'trash.fill', tone: 'danger', onPress: () => deleteEntry(entry) },
  ], [tr, lz, toggleDone, deleteEntry]);

  const renderItem = useCallback(({ item }: { item: FeedbackEntry }) => (
    <SwipeRow actions={swipeActionsFor(item)} radius={Atlas.radius.xlarge}>
      {a11y => (
    <FeedbackCard
      {...a11y}
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
      )}
    </SwipeRow>
  ), [stateOf, selected, isDark, cardColors, locale, tr, openEntry, toggleDone, swipeActionsFor]);

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
      <MeshBackground />
      {/* Layout System v2.4: [стрічка — головна зона] [деталь — панель
          праворуч з ✕ / нижній аркуш ~60% на телефоні]. */}
      <ZoneLayout
        testID="feedback-zones"
        main={
        <View style={{ flex: 1 }}>
          {/* Omni: AppHeader (ScreenHeader + 🔔 + аватар), KPI стану праворуч/
              стрічкою, під ними — SectionTabs «Ідеї | Баги» (§10.1). */}
          <AppHeader
            title={tr.fbTitle}
            titleStyle={st.pageTitle}
            paddingBottom={6}
            back={{ onPress: back, label: tr.back, color: c.text }}
            kpis={loaded && !loadFailed ? (
              <>
                <KpiCounter value={counts.open} label={tr.fbStatOpen} onPress={() => setFilter('open')} />
                <KpiCounter value={counts.done} label={tr.fbStatDone} onPress={() => setFilter('done')} />
                <KpiCounter value={counts.sent} label={tr.fbStatSent} onPress={() => setFilter('sent')} />
              </>
            ) : undefined}
            actions={
              <HeaderButton
                onPress={() => openForm(null)}
                accessibilityLabel={kind === 'bug' ? tr.fbNewBug : tr.fbNewIdea}
                style={{ backgroundColor: c.action, borderColor: c.action }}>
                <IconSymbol name="plus" size={18} color={c.onAction} />
              </HeaderButton>
            }>
            <SectionTabs
              tabs={[
                { key: 'idea' as const, label: tr.fbTabIdeas, icon: 'lightbulb.fill' as const },
                { key: 'bug' as const, label: tr.fbTabBugs, icon: 'ladybug.fill' as const },
              ]}
              value={kind}
              onChange={setKind}
              accessibilityLabel={tr.fbTitle}
            />
          </AppHeader>

          <View style={[contentWidth, { paddingHorizontal: 20 }]}>
            {/* Фільтр стану — тиха pill-група (вторинна до вкладок типу). */}
            <View style={[st.filterRow, { backgroundColor: k.surface.card, borderWidth: 1, borderColor: c.border }]}>
              {(['all', 'open', 'done', 'sent'] as const).map(f => (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === f }}
                  style={[st.filterBtn, filter === f && { backgroundColor: c.action }]}>
                  <Text style={{ color: filter === f ? c.onAction : c.text, fontSize: 12, fontFamily: fontFamily.semibold }} numberOfLines={1}>
                    {filterLabels[f]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.sortRow}>
              {sortOptions.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setSort(opt.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sort === opt.key }}
                  style={[st.sortChip, {
                    backgroundColor: sort === opt.key ? c.action : k.surface.card,
                  }]}>
                  <IconSymbol name={opt.icon as never} size={11} color={sort === opt.key ? c.onAction : c.sub} />
                  <Text style={{ color: sort === opt.key ? c.onAction : c.text, fontSize: 12, fontFamily: fontFamily.semibold, marginLeft: 4 }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {forwardingOff ? (
              <View style={[st.banner, { backgroundColor: k.surface.card }]}>
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
            renderItem={renderItem}
            ListEmptyComponent={
              // Стан зони «завантаження» — скелет рядків, а не порожнеча.
              !loaded ? <ZoneSkeleton variant="list" rows={4} /> : loadFailed ? (
                // «Не прочиталось» і «порожньо» — різні речі (CLAUDE.md, ERR-01).
                <View style={st.empty}>
                  <IconSymbol name="exclamationmark.triangle.fill" size={36} color={k.status.danger} />
                  <Text style={{ color: c.text, fontSize: 15, fontFamily: fontFamily.semibold, textAlign: 'center' }}>{tr.fbLoadFailed}</Text>
                  <TouchableOpacity onPress={onRefresh} accessibilityRole="button" style={[st.retryBtn, { ...c.gl.subtle }]}>
                    <Text style={{ color: c.text, fontFamily: fontFamily.semibold }}>{tr.fbRetry}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={st.empty}>
                  <IconSymbol name={kind === 'bug' ? 'ladybug.fill' : 'lightbulb.fill'} size={40} color={c.accent} />
                  <Text style={{ color: c.sub, fontSize: 15, fontFamily: fontFamily.semibold }}>{kind === 'bug' ? tr.fbEmptyBugs : tr.fbEmptyIdeas}</Text>
                  <Text style={{ color: c.sub, fontSize: 13 }}>{tr.fbEmptyHint}</Text>
                </View>
              )
            }
          />
        </View>
        }
        dynamic={selectedEntry && selectedState ? (
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
        dynamicOpen={!!selectedEntry && zoneState.panels.dynamic}
        onCloseDynamic={() => setSelected(null)}
        dynamicHeader={selectedEntry ? (
            <FeedbackDetailHeader
              entry={selectedEntry}
              colors={c}
              tr={tr}
              onEdit={() => openForm(selectedEntry)}
              onClose={() => setSelected(null)}
            />
          ) : undefined}
        // ✕ дає шапка самої деталі (FeedbackDetailHeader).
        dynamicChrome={false}
        dynamicLabel={selectedEntry?.item.title ?? lz.feedbackDetails}
        dynamicScrollRef={detailScrollRef}
        panels={detailInPanel ? zoneState.panels : undefined}
        onTogglePanel={zoneState.togglePanel}
      />

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
  pageTitle: { fontSize: 32, fontFamily: fontFamily.medium, letterSpacing: -0.32 },
  filterRow:  { flexDirection: 'row', borderRadius: 999, padding: 4, overflow: 'hidden', marginTop: 4 },
  filterBtn:  { flex: 1, minHeight: 36, justifyContent: 'center', paddingVertical: 8, borderRadius: 999, alignItems: 'center' },
  sortRow:    { flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 12 },
  sortChip:   { flexDirection: 'row', alignItems: 'center', borderRadius: 999, minHeight: 36, paddingHorizontal: 14, paddingVertical: 7 },
  banner:     { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, padding: 14, marginBottom: 12 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 10 },
  retryBtn:   { borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
});
