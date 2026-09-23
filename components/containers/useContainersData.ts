/**
 * components/containers/useContainersData.ts — дані модуля «Контейнери» на телефоні.
 *
 * Чотири синхронізовані колекції (containers, container_items,
 * container_places, media_assets) через useSyncedList: зберігаються лише
 * ЛОКАЛЬНІ зміни, тож запис, що приїхав синком у живий екран, не отримає
 * тумбстоун (ERR/DI-01).
 *
 * Читання розрізняє «порожньо» і «не прочиталось» (ERR-01): поки хоч один ключ
 * не прочитався, запис вимкнено, а екран показує помилку з повтором.
 *
 * Міграція (flowi-web-app/docs/specs/containers.md §4) — ідемпотентна за
 * побудовою (утиліти в utils/containers.ts), але перед ПЕРШОЮ міграцією на
 * пристрої робиться локальна копія `containers` (§11), і ставиться прапорець
 * `containers_migrated_v2 = { at, userId, workspaceId }` — локальний, бо
 * кожен пристрій проходить міграцію сам.
 *
 * Фаза A подвійного запису (§4.1): кожна правка речей ще й переписує
 * `container.items` зліпком актуальних речей для старих збірок.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSyncedList } from '@/hooks/use-synced-list';
import { getDataOwner } from '@/store/data-ownership';
import { hasStorageReadFailure, loadData, retryStorageRead, saveData } from '@/store/storage';
import {
  canPlaceUnder,
  generateQrSlug,
  itemsByContainer,
  legacySnapshot,
  normalizeItem,
  placePathLabel,
  planItemsMigration,
  planPlaceDelete,
  planPlacesMigration,
  staleLocations,
  withStatus,
  type Container,
  type ContainerItem,
  type ContainerPlace,
  type ItemStatus,
  type MediaAsset,
  type PlaceKind,
} from '@/utils/containers';
import { uuidV4 } from '@/utils/uuid';

export const CONTAINER_KEYS = ['containers', 'container_items', 'container_places', 'media_assets'] as const;
export const MIGRATION_FLAG_KEY = 'containers_migrated_v2';
export const MIGRATION_BACKUP_KEY = 'containers_backup_v1';

export type LoadStatus = 'loading' | 'ready' | 'failed';
export type PhotoTarget = { kind: 'container' | 'item'; id: string };

export interface ContainerFields {
  name: string;
  color: string;
  placeId: string | null;
}

export interface PlaceFields {
  name: string;
  kind: PlaceKind;
  parentId: string | null;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  // crypto.getRandomValues — полефіл react-native-get-random-values з app/_layout.tsx.
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(out);
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useContainersData() {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const writable = status === 'ready';
  const boxes = useSyncedList<Container>('containers', { enabled: writable });
  const itemList = useSyncedList<ContainerItem>('container_items', { enabled: writable });
  const placeList = useSyncedList<ContainerPlace>('container_places', { enabled: writable });
  const mediaList = useSyncedList<MediaAsset>('media_assets', { enabled: writable });

  const containers = boxes.items;
  const items = itemList.items;
  const places = placeList.items;
  const media = mediaList.items;

  // Refs — щоб кілька правок в одному тіку рахувались від уже зміненого стану.
  const boxesRef = useRef(containers);
  const itemsRef = useRef(items);
  const placesRef = useRef(places);
  boxesRef.current = containers;
  itemsRef.current = items;
  placesRef.current = places;

  const reloads = useMemo(
    () => [boxes.reload, itemList.reload, placeList.reload, mediaList.reload],
    [boxes.reload, itemList.reload, placeList.reload, mediaList.reload],
  );

  const load = useCallback(async () => {
    await Promise.all(reloads.map(reload => reload()));
    setStatus(CONTAINER_KEYS.some(key => hasStorageReadFailure(key)) ? 'failed' : 'ready');
  }, [reloads]);

  useEffect(() => { void load(); }, [load]);

  const retry = useCallback(async () => {
    setStatus('loading');
    await Promise.all(CONTAINER_KEYS.map(key => retryStorageRead(key, [])));
    await load();
  }, [load]);

  // ── Міграція ───────────────────────────────────────────────────────────
  const migrating = useRef(false);
  useEffect(() => {
    if (status !== 'ready' || migrating.current) return;
    const itemPlan = planItemsMigration(containers, items);
    const placePlan = planPlacesMigration(containers, places, new Date().toISOString());
    if (!itemPlan.length && !placePlan.places.length && !placePlan.assignments.length) return;
    migrating.current = true;
    void (async () => {
      try {
        const flag = await loadData<unknown>(MIGRATION_FLAG_KEY, null);
        if (!flag) {
          // Резервна копія ДО першої міграції на пристрої (§11): якщо щось
          // піде не так, легасі-масиви лишаються тут дослівно.
          await saveData(MIGRATION_BACKUP_KEY, { at: new Date().toISOString(), containers });
        }
        if (itemPlan.length) itemList.setItems(prev => [...prev, ...planItemsMigration(boxesRef.current, prev)]);
        if (placePlan.places.length) {
          placeList.setItems(prev => {
            const known = new Set(prev.map(place => place.id));
            return [...prev, ...placePlan.places.filter(place => !known.has(place.id))];
          });
        }
        if (placePlan.assignments.length) {
          const target = new Map(placePlan.assignments.map(a => [a.containerId, a.placeId]));
          // location НЕ чиститься — старі збірки читають лише його.
          boxes.setItems(prev => prev.map(box =>
            !box.placeId && target.has(box.id) ? { ...box, placeId: target.get(box.id) ?? null } : box));
        }
        const owner = await getDataOwner();
        await saveData(MIGRATION_FLAG_KEY, {
          at: new Date().toISOString(),
          userId: owner?.userId ?? null,
          workspaceId: owner?.workspaceId ?? null,
        });
      } catch (e) {
        if (__DEV__) console.warn('[containers] міграцію відкладено:', e);
      } finally {
        migrating.current = false;
      }
    })();
  }, [status, containers, items, places, boxes, itemList, placeList]);

  // ── Похідне ────────────────────────────────────────────────────────────
  const itemsMap = useMemo(() => itemsByContainer(containers, items), [containers, items]);
  const mediaById = useMemo(() => new Map(media.map(asset => [asset.id, asset])), [media]);

  // ── Речі ───────────────────────────────────────────────────────────────
  /**
   * Одна правка речей: мігрує легасі-речі зачеплених коробок, застосовує
   * зміну й одразу пише зліпок у `container.items` (фаза A).
   */
  const mutateItems = useCallback((touched: readonly string[], change: (list: ContainerItem[]) => ContainerItem[]) => {
    const touchedBoxes = boxesRef.current.filter(box => touched.includes(box.id));
    let next = itemsRef.current;
    const migration = planItemsMigration(touchedBoxes, next);
    if (migration.length) next = [...next, ...migration];
    next = change(next);
    itemsRef.current = next;
    itemList.setItems(next);

    const snapshots = new Map(touched.map(id => [
      id,
      legacySnapshot(next.filter(item => item.containerId === id).map(normalizeItem)),
    ]));
    boxes.setItems(prev => {
      let changed = false;
      const out = prev.map(box => {
        const snapshot = snapshots.get(box.id);
        if (!snapshot || sameJson(box.items ?? [], snapshot)) return box;
        changed = true;
        return { ...box, items: snapshot };
      });
      return changed ? out : prev;
    });
  }, [itemList, boxes]);

  const saveItem = useCallback((item: ContainerItem, previousContainerId?: string) => {
    const touched = previousContainerId && previousContainerId !== item.containerId
      ? [item.containerId, previousContainerId]
      : [item.containerId];
    const clean = { ...item, qty: Math.max(0, Math.floor(item.qty)) };
    mutateItems(touched, list => list.some(i => i.id === item.id)
      ? list.map(i => (i.id === item.id ? clean : i))
      : [...list, clean]);
  }, [mutateItems]);

  const addItem = useCallback((containerId: string, fields: { name: string; tags: string[]; note?: string }) => {
    const item: ContainerItem = {
      id: uuidV4(),
      containerId,
      name: fields.name,
      tags: fields.tags,
      qty: 1,
      status: 'in_box',
      createdAt: new Date().toISOString(),
    };
    if (fields.note) item.note = fields.note;
    saveItem(item);
    return item;
  }, [saveItem]);

  const setItemStatus = useCallback((item: ContainerItem, status: ItemStatus, lentTo?: string) => {
    const now = new Date().toISOString();
    mutateItems([item.containerId], list => list.map(i =>
      i.id === item.id ? withStatus(normalizeItem(i), status, now, lentTo) : i));
  }, [mutateItems]);

  const changeQty = useCallback((item: ContainerItem, delta: number) => {
    mutateItems([item.containerId], list => list.map(i => {
      if (i.id !== item.id) return i;
      const base = normalizeItem(i);
      return { ...base, qty: Math.max(0, base.qty + delta) };
    }));
  }, [mutateItems]);

  const deleteItem = useCallback((item: ContainerItem) => {
    mutateItems([item.containerId], list => list.filter(i => i.id !== item.id));
  }, [mutateItems]);

  // ── Коробки ────────────────────────────────────────────────────────────
  const createContainer = useCallback((fields: ContainerFields): Container => {
    const box: Container = {
      id: uuidV4(),
      name: fields.name,
      color: fields.color,
      placeId: fields.placeId,
      location: placePathLabel(fields.placeId, placesRef.current),
      items: [],
      createdAt: new Date().toISOString(),
    };
    boxes.setItems(prev => [box, ...prev]);
    return box;
  }, [boxes]);

  const updateContainer = useCallback((id: string, fields: ContainerFields) => {
    const location = placePathLabel(fields.placeId, placesRef.current);
    boxes.setItems(prev => prev.map(box => box.id === id
      ? { ...box, name: fields.name, color: fields.color, placeId: fields.placeId, location: location || (fields.placeId ? box.location : '') }
      : box));
  }, [boxes]);

  const deleteContainer = useCallback((id: string) => {
    itemsRef.current = itemsRef.current.filter(item => item.containerId !== id);
    itemList.setItems(itemsRef.current);
    boxes.setItems(prev => prev.filter(box => box.id !== id));
  }, [itemList, boxes]);

  /** Слаги — лениво, при першому друці чи показі QR (§4 крок 3). Повертає id → слаг. */
  const ensureSlugs = useCallback((ids: readonly string[]): Map<string, string> => {
    const taken = new Set(boxesRef.current.flatMap(box => (box.qrSlug ? [box.qrSlug] : [])));
    const out = new Map<string, string>();
    const created = new Map<string, string>();
    for (const box of boxesRef.current) {
      if (!ids.includes(box.id)) continue;
      if (box.qrSlug) { out.set(box.id, box.qrSlug); continue; }
      const slug = generateQrSlug(randomBytes, taken);
      taken.add(slug);
      out.set(box.id, slug);
      created.set(box.id, slug);
    }
    if (created.size) {
      boxes.setItems(prev => prev.map(box =>
        !box.qrSlug && created.has(box.id) ? { ...box, qrSlug: created.get(box.id) } : box));
    }
    return out;
  }, [boxes]);

  // ── Місця ──────────────────────────────────────────────────────────────
  const refreshLocations = useCallback((nextPlaces: readonly ContainerPlace[]) => {
    const stale = new Map(staleLocations(boxesRef.current, nextPlaces).map(box => [box.id, box.location]));
    if (!stale.size) return;
    boxes.setItems(prev => prev.map(box => (stale.has(box.id) ? { ...box, location: stale.get(box.id) ?? box.location } : box)));
  }, [boxes]);

  /** null — вкласти не можна (глибина чи цикл). */
  const createPlace = useCallback((fields: PlaceFields): ContainerPlace | null => {
    if (!canPlaceUnder(null, fields.parentId, placesRef.current)) return null;
    const place: ContainerPlace = {
      id: uuidV4(),
      name: fields.name,
      kind: fields.kind,
      parentId: fields.parentId,
      createdAt: new Date().toISOString(),
    };
    placesRef.current = [...placesRef.current, place];
    placeList.setItems(placesRef.current);
    return place;
  }, [placeList]);

  const updatePlace = useCallback((id: string, fields: PlaceFields): boolean => {
    if (!canPlaceUnder(id, fields.parentId, placesRef.current)) return false;
    const next = placesRef.current.map(place => (place.id === id ? { ...place, ...fields } : place));
    placesRef.current = next;
    placeList.setItems(next);
    refreshLocations(next);
    return true;
  }, [placeList, refreshLocations]);

  const deletePlace = useCallback((id: string) => {
    const plan = planPlaceDelete(id, placesRef.current, boxesRef.current);
    const reparent = new Map(plan.places.map(place => [place.id, place.parentId ?? null]));
    const moved = new Map(plan.containers.map(box => [box.id, box]));
    const nextPlaces = placesRef.current
      .filter(place => place.id !== id)
      .map(place => (reparent.has(place.id) ? { ...place, parentId: reparent.get(place.id) ?? null } : place));
    placesRef.current = nextPlaces;
    placeList.setItems(nextPlaces);
    if (moved.size) {
      boxes.setItems(prev => prev.map(box => {
        const target = moved.get(box.id);
        return target ? { ...box, placeId: target.placeId, location: target.location } : box;
      }));
    }
  }, [placeList, boxes]);

  // ── Фото ───────────────────────────────────────────────────────────────
  const setPhotos = useCallback((target: PhotoTarget, change: (ids: string[] | undefined) => string[]) => {
    if (target.kind === 'container') {
      boxes.setItems(prev => prev.map(box => (box.id === target.id ? { ...box, photoIds: change(box.photoIds) } : box)));
      return;
    }
    const item = itemsRef.current.find(i => i.id === target.id);
    if (!item) return;
    mutateItems([item.containerId], list => list.map(i =>
      i.id === target.id ? { ...normalizeItem(i), photoIds: change(i.photoIds) } : i));
  }, [boxes, mutateItems]);

  const addMediaAsset = useCallback((asset: MediaAsset) => {
    mediaList.setItems(prev => (prev.some(existing => existing.id === asset.id) ? prev : [...prev, asset]));
  }, [mediaList]);

  return {
    status,
    retry,
    reload: load,
    containers,
    items,
    places,
    media,
    itemsMap,
    mediaById,
    addItem,
    saveItem,
    setItemStatus,
    changeQty,
    deleteItem,
    createContainer,
    updateContainer,
    deleteContainer,
    ensureSlugs,
    createPlace,
    updatePlace,
    deletePlace,
    setPhotos,
    addMediaAsset,
  };
}

export type ContainersData = ReturnType<typeof useContainersData>;
