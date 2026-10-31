import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { ContainerDetail } from '@/components/containers/ContainerDetail';
import { ContainerFormSheet, type ContainerFormRequest } from '@/components/containers/ContainerFormSheet';
import { ContainerTile } from '@/components/containers/ContainerTile';
import { fill } from '@/components/containers/i18n';
import { ItemFormSheet, type ItemFormRequest } from '@/components/containers/ItemFormSheet';
import type { ItemRowActions } from '@/components/containers/ItemRow';
import { createPhotoAsset, type PhotoSource, useUploadQueueRunner } from '@/components/containers/media';
import { PlaceFormSheet, type PlaceFormRequest } from '@/components/containers/PlaceFormSheet';
import { NO_PLACE, PlaceTreeList } from '@/components/containers/PlaceTreeList';
import { PrintLabelsSheet } from '@/components/containers/PrintLabelsSheet';
import { qrContext } from '@/components/containers/qr';
import { QrScannerModal } from '@/components/containers/QrScannerModal';
import { QrSheet } from '@/components/containers/QrSheet';
import { SearchHitRow } from '@/components/containers/SearchHitRow';
import { CONTAINERS_ACCENT as ACCENT, useContainersColors } from '@/components/containers/theme';
import { useContainersData, type PhotoTarget } from '@/components/containers/useContainersData';
import { DetailPane } from '@/components/shared/DetailPane';
import { HeaderButton, ScreenHeader } from '@/components/shared/ScreenHeader';
import { EmptyState, MeshBackground } from '@/components/ds';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { fontFamily, radius, type as dsType } from '@/constants/theme';
import { detailColumnWidthFor, sizeClassFor } from '@/constants/tokens';
import { WIDE_CONTENT_MAX_WIDTH, useContentWidth } from '@/hooks/use-content-width';
import { useResponsive, useScreenWidth } from '@/hooks/use-responsive';
import { useI18n } from '@/store/i18n';
import { loadData, saveData } from '@/store/storage';
import {
  asCover,
  containerPlaceLabel,
  containerStats,
  descendantPlaceIds,
  parseQrPayload,
  resolveQrScan,
  selectContainers,
  withoutPhoto,
  withPhoto,
  type Container,
  type ContainerItem,
  type ContainerStats,
} from '@/utils/containers';

/** Відступ між плитками сітки — і по горизонталі, і між рядами. */
const GRID_GAP = 12;
/** Ліва колонка дерева місць на широкому планшеті (§8.2). */
const TREE_COLUMN_WIDTH = 260;
/** Локальний (не синхронізований) лічильник відкриттів — ранжування пошуку (§7.1). */
const OPEN_COUNTS_KEY = 'containers_open_counts';
/** Пауза між закриттям одного модального шару й відкриттям наступного (NEW-02). */
const SHEET_HANDOFF_MS = 350;

const EMPTY_STATS: ContainerStats = { count: 0, units: 0, lent: 0, discarded: 0 };

type ViewMode = 'grid' | 'places';

export default function ContainersScreen() {
  const c = useContainersColors();
  const { tr } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string; slug?: string; qr?: string; scan?: string; q?: string }>();
  const contentWidth = useContentWidth();
  const { width, height, isWide, isExpanded } = useResponsive();
  const screenWidth = useScreenWidth();
  const data = useContainersData();
  useUploadQueueRunner();

  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState(typeof params.q === 'string' ? params.q : '');
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const [containerForm, setContainerForm] = useState<ContainerFormRequest | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormRequest | null>(null);
  const [placeForm, setPlaceForm] = useState<PlaceFormRequest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPayload, setScanPayload] = useState<string | null>(null);
  const [printIds, setPrintIds] = useState<string[] | null>(null);
  const [qrBoxId, setQrBoxId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openCounts, setOpenCounts] = useState<Record<string, number>>({});
  const detailScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    void loadData<Record<string, number>>(OPEN_COUNTS_KEY, {}).then(v => setOpenCounts(v && typeof v === 'object' ? v : {}));
  }, []);

  const placesMode = view === 'places';
  /** Колонка деталі росте на дуже широкому вікні — та сама, що в DetailPane нижче. */
  const detailWidth = detailColumnWidthFor(width);
  const treeColumn = placesMode && isExpanded;

  /**
   * Ширина, що лишається сітці: мінус колонка деталі на expanded і мінус
   * колонка дерева в режимі «За місцями» (§8.2).
   */
  const listWidth = Math.max(
    screenWidth - (isExpanded ? detailWidth : 0) - (treeColumn ? TREE_COLUMN_WIDTH : 0),
    0,
  );
  const listClass = sizeClassFor(listWidth);
  const columns = listClass === 'expanded' ? 4 : listClass === 'medium' ? 3 : 2;
  const cardWidth = useMemo(() => {
    // Телефон: формула дослівно та сама, що була, — нуль регресії.
    if (!isWide) return (width - 48) / 2;
    // Стеля — «широка» (Layout.wideMaxWidth): сітка коробок — це плитки, а не
    // текст; зі стелею 720 на великому iPad лишалась смуга порожнечі праворуч.
    const available = Math.min(listWidth, WIDE_CONTENT_MAX_WIDTH) - 32;
    return (available - GRID_GAP * (columns - 1)) / columns;
  }, [width, listWidth, isWide, columns]);
  /** Сітка плиток — у широкій колонці; пошук і дерево лишаються колонкою для читання. */
  const gridWidth = useMemo(
    () => (isWide ? { ...contentWidth, maxWidth: WIDE_CONTENT_MAX_WIDTH } : contentWidth),
    [isWide, contentWidth],
  );

  const statsById = useMemo(() => {
    const out = new Map<string, ContainerStats>();
    for (const [id, list] of data.itemsMap) out.set(id, containerStats(list));
    return out;
  }, [data.itemsMap]);
  const statsFor = useCallback((id: string) => statsById.get(id) ?? EMPTY_STATS, [statsById]);
  const discardedTotal = useMemo(() => {
    let n = 0;
    for (const stats of statsById.values()) n += stats.discarded;
    return n;
  }, [statsById]);

  const detail = useMemo(() => data.containers.find(box => box.id === detailId) ?? null, [data.containers, detailId]);
  const qrBox = useMemo(() => data.containers.find(box => box.id === qrBoxId) ?? null, [data.containers, qrBoxId]);

  const openBox = useCallback((id: string) => {
    setDetailId(id);
    setOpenCounts(prev => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      void saveData(OPEN_COUNTS_KEY, next);
      return next;
    });
  }, []);

  // ── Вхід за посиланням: ?open=<id>, ?slug=<qrSlug>, ?qr=<вміст>, ?scan=1 ──
  const handledParams = useRef<string | null>(null);
  useEffect(() => {
    if (data.status !== 'ready') return;
    const key = JSON.stringify([params.open, params.slug, params.qr, params.scan]);
    if (handledParams.current === key) return;
    handledParams.current = key;
    if (params.scan) { setScanning(true); return; }
    if (typeof params.open === 'string' && params.open) {
      if (data.containers.some(box => box.id === params.open)) openBox(params.open);
      return;
    }
    const raw = typeof params.qr === 'string' && params.qr ? params.qr
      : typeof params.slug === 'string' && params.slug ? params.slug : null;
    if (!raw) return;
    const result = resolveQrScan(parseQrPayload(raw), qrContext().workspaceId, data.containers);
    if (result.status === 'found') openBox(result.container.id);
    else if (result.status === 'other_workspace') Alert.alert(tr.ctrScanOtherWorkspace);
    else if (result.status === 'not_found') {
      // Локально немає — сканер покаже чесне «перевіряємо на сервері» / «немає мережі».
      setScanPayload(raw);
      setScanning(true);
    }
  }, [data.status, data.containers, params.open, params.slug, params.qr, params.scan, openBox, tr]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await data.reload();
    setRefreshing(false);
  }, [data]);

  // ── Видача ────────────────────────────────────────────────────────────
  const isSearching = search.trim().length > 0;
  const placeFilter = useMemo(() => {
    if (!treeColumn || selectedPlace === null || selectedPlace === NO_PLACE) return null;
    return descendantPlaceIds(selectedPlace, data.places);
  }, [treeColumn, selectedPlace, data.places]);

  const matches = useMemo(() => {
    const all = selectContainers(data.containers, search, {
      items: data.items, places: data.places, showDiscarded, openCounts, placeIds: placeFilter,
    });
    if (treeColumn && selectedPlace === NO_PLACE) {
      const known = new Set(data.places.map(p => p.id));
      return all.filter(m => !m.container.placeId || !known.has(m.container.placeId));
    }
    return all;
  }, [data.containers, data.items, data.places, search, showDiscarded, openCounts, placeFilter, treeColumn, selectedPlace]);

  /**
   * Тап по знайденому. Телефон: деталь перекриває список — пошук чиститься.
   * Широкий екран: пошук ЛИШАЄТЬСЯ, праворуч відкривається коробка — так
   * результати можна перебирати, не набираючи запит заново.
   */
  const openSearchHit = useCallback((id: string) => {
    if (!isExpanded) setSearch('');
    openBox(id);
  }, [isExpanded, openBox]);

  // ── Дії ───────────────────────────────────────────────────────────────
  const confirmDeleteContainer = useCallback((box: Container) => {
    Alert.alert(tr.deleteContainer, tr.cannotUndo, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.delete, style: 'destructive', onPress: () => { data.deleteContainer(box.id); setDetailId(null); } },
    ]);
  }, [data, tr]);

  const itemActions: ItemRowActions = useMemo(() => ({
    onEdit: item => setItemForm({ containerId: item.containerId, item }),
    onDelete: item => Alert.alert(tr.ctrDeleteItem, tr.ctrDeleteItemMsg, [
      { text: tr.cancel, style: 'cancel' },
      { text: tr.ctrDiscard, onPress: () => data.setItemStatus(item, 'discarded') },
      { text: tr.delete, style: 'destructive', onPress: () => data.deleteItem(item) },
    ]),
    onQty: (item, delta) => data.changeQty(item, delta),
    onLend: item => setItemForm({ containerId: item.containerId, item, status: 'lent' }),
    onReturn: item => data.setItemStatus(item, 'in_box'),
    onDiscard: item => data.setItemStatus(item, 'discarded'),
  }), [data, tr]);

  const addPhoto = useCallback(async (target: PhotoTarget, source: PhotoSource) => {
    const asset = await createPhotoAsset(source, data.media);
    if (!asset) return;
    data.addMediaAsset(asset);
    data.setPhotos(target, ids => withPhoto(ids, asset.id));
  }, [data]);

  const handoff = (fn: () => void) => setTimeout(fn, SHEET_HANDOFF_MS);

  const openNew = useCallback(() => {
    setContainerForm({ mode: 'new', placeId: treeColumn && selectedPlace && selectedPlace !== NO_PLACE ? selectedPlace : null });
  }, [treeColumn, selectedPlace]);

  const renderDetail = (box: Container) => (
    <ContainerDetail
      container={box}
      items={data.itemsMap.get(box.id) ?? []}
      places={data.places}
      mediaById={data.mediaById}
      c={c}
      actions={itemActions}
      onClose={() => setDetailId(null)}
      onEdit={() => setContainerForm({ mode: 'edit', container: box })}
      onDelete={() => confirmDeleteContainer(box)}
      onQr={() => setQrBoxId(box.id)}
      onQuickAdd={fields => data.addItem(box.id, fields)}
      onAddPhoto={source => addPhoto({ kind: 'container', id: box.id }, source)}
      onRemovePhoto={id => data.setPhotos({ kind: 'container', id: box.id }, ids => withoutPhoto(ids, id))}
      onCoverPhoto={id => data.setPhotos({ kind: 'container', id: box.id }, ids => asCover(ids, id))}
    />
  );

  const emptyState = (
    <View style={{ paddingVertical: 28 }}>
      <EmptyState
        icon="shippingbox.fill"
        title={data.containers.length ? tr.ctrNoBoxesHere : tr.noContainers}
        caption={data.containers.length ? undefined : tr.ctrEmptyHint}
        actionLabel={data.containers.length ? undefined : tr.newContainer}
        onAction={data.containers.length ? undefined : openNew}
      />
    </View>
  );

  const grid = (
    /* key прив'язаний до кількості колонок: FlatList не вміє міняти numColumns на льоту. */
    <FlatList
      key={`grid-${columns}`}
      data={matches}
      numColumns={columns}
      keyExtractor={m => m.container.id}
      contentContainerStyle={[gridWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
      columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}
      renderItem={({ item: m }) => (
        <ContainerTile
          container={m.container}
          stats={statsFor(m.container.id)}
          placeLabel={containerPlaceLabel(m.container, data.places)}
          cover={m.container.photoIds?.[0] ? data.mediaById.get(m.container.photoIds[0]) : undefined}
          width={cardWidth}
          selected={m.container.id === detailId}
          c={c}
          onPress={openBox}
        />
      )}
      ListEmptyComponent={emptyState}
    />
  );

  const searchList = (
    /* Пошук іде по ВСІХ речах усіх коробок — результатів можуть бути сотні. */
    <FlatList
      data={matches}
      keyExtractor={m => m.container.id}
      contentContainerStyle={[contentWidth, { paddingHorizontal: 16, paddingBottom: 100 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ color: c.sub, fontSize: 11, fontFamily: fontFamily.semibold, textTransform: 'uppercase', letterSpacing: 0.5, ...dsType.numeric }}
            accessibilityLiveRegion="polite">
            {matches.length > 0 ? fill(tr.ctrFound, { n: matches.length }) : tr.ctrNothingFound}
          </Text>
          {discardedTotal ? (
            <TouchableOpacity onPress={() => setShowDiscarded(v => !v)} accessibilityRole="switch"
              accessibilityState={{ checked: showDiscarded }} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: c.text, fontSize: 12, fontFamily: fontFamily.semibold, textDecorationLine: 'underline' }}>
                {showDiscarded ? tr.ctrHideDiscarded : fill(tr.ctrShowDiscarded, { n: discardedTotal })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      }
      renderItem={({ item: m }) => (
        <SearchHitRow match={m} search={search} placeLabel={containerPlaceLabel(m.container, data.places)}
          selected={m.container.id === detailId} c={c} onPress={openSearchHit} />
      )}
    />
  );

  const treeProps = {
    places: data.places,
    containers: data.containers,
    statsFor,
    c,
    accent: ACCENT,
    onOpenBox: openBox,
    onEditPlace: (place: (typeof data.places)[number]) => setPlaceForm({ mode: 'edit', place }),
    onAddPlace: (parentId: string | null) => setPlaceForm({ mode: 'new', parentId }),
  };

  let body: React.ReactNode;
  if (data.status === 'failed') {
    // ERR-01: «не прочиталось» ≠ «порожньо»; запис вимкнено, доки не прочитаємо.
    body = (
      <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24, gap: 14 }}>
        <IconSymbol name="exclamationmark.triangle" size={28} color={c.t.status.warning} />
        <Text style={{ ...dsType.body, fontSize: 15, color: c.text, textAlign: 'center' }}>{tr.ctrReadFailed}</Text>
        <TouchableOpacity onPress={() => void data.retry()} accessibilityRole="button"
          style={{ minHeight: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: c.t.action.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ ...dsType.label, color: c.t.text.onAction }}>{tr.ctrRetry}</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (isSearching) {
    body = searchList;
  } else if (placesMode && !treeColumn) {
    body = (
      <ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 8, paddingBottom: 100 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.sub} />}>
        <PlaceTreeList {...treeProps} mode="nested" />
      </ScrollView>
    );
  } else if (treeColumn) {
    body = (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* Колонка дерева — біла картка на canvas, без рамки-роздільника (DS v2). */}
        <ScrollView style={{ ...c.gl.card, width: TREE_COLUMN_WIDTH, flexGrow: 0, marginLeft: 16, marginBottom: 16, borderRadius: radius.cardCompact }}
          contentContainerStyle={{ padding: 8, paddingBottom: 100 }}>
          <PlaceTreeList {...treeProps} mode="column" selected={selectedPlace} onSelect={setSelectedPlace} />
        </ScrollView>
        <View style={{ flex: 1 }}>{grid}</View>
      </View>
    );
  } else {
    body = grid;
  }

  const segment = (value: ViewMode, label: string, icon: 'square.grid.2x2' | 'folder') => {
    const active = view === value;
    return (
      <TouchableOpacity onPress={() => setView(value)} accessibilityRole="tab" accessibilityState={{ selected: active }}
        style={{ flex: 1, flexDirection: 'row', gap: 6, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? c.t.action.primary : 'transparent' }}>
        <IconSymbol name={icon} size={13} color={active ? c.t.text.onAction : c.sub} />
        <Text style={{ color: active ? c.t.text.onAction : c.text, fontSize: 13, fontFamily: fontFamily.semibold }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg1 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <MeshBackground />
      {/* Широкий екран: коробки зліва, вміст обраної — праворуч. Вузький:
          деталь — модальний лист поверх списку. Верхній інсет дає ScreenHeader. */}
      <View style={{ flex: 1, flexDirection: isExpanded ? 'row' : 'column' }}>
        <View style={{ flex: 1 }}>
          <ScreenHeader
            title={tr.containers}
            color={c.text}
            paddingBottom={14}
            back={{
              onPress: () => router.back(),
              label: tr.back,
              color: c.sub,
              style: { ...c.gl.card, borderColor: 'transparent' },
            }}
            actions={
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <HeaderButton onPress={() => setScanning(true)} accessibilityLabel={tr.ctrScan}
                  style={{ ...c.gl.card, borderColor: 'transparent', borderRadius: radius.pill }}>
                  <IconSymbol name="viewfinder" size={17} color={c.text} />
                </HeaderButton>
                <HeaderButton onPress={() => setPrintIds([])} accessibilityLabel={tr.ctrPrint}
                  style={{ ...c.gl.card, borderColor: 'transparent', borderRadius: radius.pill }}>
                  <IconSymbol name="doc.text" size={16} color={c.text} />
                </HeaderButton>
                {/* Головна дія екрана — pill action.primary. */}
                <HeaderButton onPress={openNew} accessibilityLabel={tr.add}
                  style={{ backgroundColor: c.t.action.primary, borderColor: 'transparent', borderRadius: radius.pill }}>
                  <IconSymbol name="plus" size={17} color={c.t.text.onAction} />
                </HeaderButton>
              </View>
            }
          />

          <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill,
            paddingHorizontal: 16, gap: 8, marginHorizontal: 20, marginBottom: 12, minHeight: 44,
            ...c.gl.card }}>
            <IconSymbol name="magnifyingglass" size={15} color={c.accent} />
            <TextInput placeholder={tr.searchItems} placeholderTextColor={c.muted} value={search} onChangeText={setSearch}
              accessibilityLabel={tr.searchItems} returnKeyType="search"
              style={{ flex: 1, fontSize: 14, fontFamily: fontFamily.regular, color: c.text, paddingVertical: 10 }} />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={tr.close}
                style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <IconSymbol name="xmark.circle.fill" size={16} color={c.sub} />
              </TouchableOpacity>
            ) : null}
          </View>

          {!isSearching && data.status !== 'failed' ? (
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, padding: 4,
              borderRadius: radius.pill, ...c.gl.card }}>
              {segment('grid', tr.ctrViewGrid, 'square.grid.2x2')}
              {segment('places', tr.ctrViewPlaces, 'folder')}
            </View>
          ) : null}

          {body}
        </View>

        <DetailPane
          open={!!detail}
          wide={isExpanded}
          columnWidth={detailWidth}
          onClose={() => setDetailId(null)}
          isDark={c.isDark}
          sheetColor={c.sheet}
          borderColor={c.border}
          maxHeight={height * 0.86}
          scrollRef={detailScrollRef}
          empty={
            <Text style={{ ...dsType.caption, fontSize: 13, color: c.sub, textAlign: 'center', paddingHorizontal: 24 }}>
              {tr.containerPickHint}
            </Text>
          }>
          {detail ? renderDetail(detail) : null}
        </DetailPane>
      </View>

      <ContainerFormSheet
        request={containerForm}
        places={data.places}
        c={c}
        onClose={() => setContainerForm(null)}
        onSubmit={fields => {
          if (containerForm?.mode === 'edit') data.updateContainer(containerForm.container.id, fields);
          else data.createContainer(fields);
        }}
        onCreatePlace={(name, parentId) => data.createPlace({ name, kind: parentId ? 'furniture' : 'room', parentId })}
      />

      <ItemFormSheet
        request={itemForm}
        c={c}
        accent={detail ? detail.color : ACCENT}
        mediaById={data.mediaById}
        livePhotoIds={itemForm?.item ? data.items.find(i => i.id === itemForm.item?.id)?.photoIds : undefined}
        onClose={() => setItemForm(null)}
        onSave={(item: ContainerItem) => data.saveItem(item, itemForm?.item?.containerId)}
        onAddPhoto={(itemId, source) => addPhoto({ kind: 'item', id: itemId }, source)}
        onRemovePhoto={(itemId, photoId) => data.setPhotos({ kind: 'item', id: itemId }, ids => withoutPhoto(ids, photoId))}
        onCoverPhoto={(itemId, photoId) => data.setPhotos({ kind: 'item', id: itemId }, ids => asCover(ids, photoId))}
      />

      <PlaceFormSheet
        request={placeForm}
        places={data.places}
        c={c}
        onClose={() => setPlaceForm(null)}
        onSubmit={fields => (placeForm?.mode === 'edit'
          ? data.updatePlace(placeForm.place.id, fields)
          : !!data.createPlace(fields))}
        onDelete={place => {
          data.deletePlace(place.id);
          if (selectedPlace === place.id) setSelectedPlace(null);
        }}
      />

      <QrSheet
        container={qrBox}
        c={c}
        onClose={() => setQrBoxId(null)}
        onCreate={id => { data.ensureSlugs([id]); }}
        onPrint={id => { setQrBoxId(null); handoff(() => setPrintIds([id])); }}
      />

      <PrintLabelsSheet
        visible={printIds !== null}
        containers={data.containers}
        places={data.places}
        statsFor={statsFor}
        preselected={printIds ?? []}
        c={c}
        onClose={() => setPrintIds(null)}
        ensureSlugs={data.ensureSlugs}
      />

      <QrScannerModal
        visible={scanning}
        containers={data.containers}
        initialPayload={scanPayload}
        onClose={() => { setScanning(false); setScanPayload(null); }}
        onFound={openBox}
        onSearch={setSearch}
      />
    </View>
  );
}
