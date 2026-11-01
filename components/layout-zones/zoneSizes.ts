/**
 * components/layout-zones/zoneSizes.ts — ширини зон, які людина виставила
 * перетягуванням межі (планшет).
 *
 * Локально на ЦЬОМУ пристрої (AsyncStorage `layout_zone_sizes_v1`), як і решта
 * вибору зон (`layout_zones_prefs_v1`): ширина панелі — звичка під конкретну
 * діагональ, у синхронізований ui_preferences вона не йде. Даних акаунта
 * ключ не містить — у синк, outbox і бекапи не потрапляє.
 *
 * Ключ запису — `sizeKey` з ZoneLayout (за замовчуванням спільний для всіх
 * розділів: «моя панель деталей — така»). Екран може передати свій ключ.
 */
import { useCallback, useSyncExternalStore } from 'react';

import { sanitizeZoneSize, type ZoneSizes } from './zoneWidths';

export const ZONE_SIZES_KEY = 'layout_zone_sizes_v1';
export const DEFAULT_ZONE_SIZE_KEY = 'default';

const EMPTY: ZoneSizes = Object.freeze({}) as ZoneSizes;

/** Чиста функція: збережене → придатні ширини (сміття відкидається). */
export function parseZoneSizes(raw: unknown): Record<string, ZoneSizes> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ZoneSizes> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const sizes: ZoneSizes = {};
    const s = sanitizeZoneSize(o.static);
    const d = sanitizeZoneSize(o.dynamic);
    if (s !== undefined) sizes.static = s;
    if (d !== undefined) sizes.dynamic = d;
    out[key] = sizes;
  }
  return out;
}

type Store = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };

/**
 * AsyncStorage — лінивим require: ZoneLayout рендерять і тести екранів без
 * нативного модуля; там ширини просто типові, а не падіння на імпорті.
 */
function storage(): Store | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-async-storage/async-storage');
    return (mod?.default ?? mod) as Store;
  } catch {
    return null;
  }
}

let sizes: Record<string, ZoneSizes> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach(l => l()); }

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  const store = storage();
  if (!store) return;
  Promise.resolve()
    .then(() => store.getItem(ZONE_SIZES_KEY))
    .then(raw => {
      const stored = parseZoneSizes(raw ? JSON.parse(raw) : null);
      // Те, що людина вже потягнула до завершення читання, перемагає.
      sizes = { ...stored, ...sizes };
      emit();
    })
    .catch(e => { if (__DEV__) console.warn('[zones] ширини зон не прочитались:', e); });
}

function persist() {
  const store = storage();
  if (!store) return;
  Promise.resolve()
    .then(() => store.setItem(ZONE_SIZES_KEY, JSON.stringify(sizes)))
    .catch(e => { if (__DEV__) console.warn('[zones] ширини зон не зберіглись:', e); });
}

export function getZoneSizes(key: string): ZoneSizes {
  return sizes[key] ?? EMPTY;
}

/**
 * Записати ширину зони. `undefined` — повернути типову. `persist: false` —
 * лише показати (під час перетягування), записати — у кінці жесту.
 */
export function setZoneSize(key: string, which: keyof ZoneSizes, width: number | undefined, save = true): void {
  const next: ZoneSizes = { ...getZoneSizes(key) };
  const clean = width === undefined ? undefined : sanitizeZoneSize(width);
  if (clean === undefined) delete next[which];
  else next[which] = clean;
  sizes = { ...sizes, [key]: next };
  emit();
  if (save) persist();
}

/** Зберегти поточне (кінець перетягування). */
export function persistZoneSizes(): void { persist(); }

function subscribe(l: () => void) {
  ensureLoaded();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useZoneSizes(key: string): ZoneSizes {
  const get = useCallback(() => getZoneSizes(key), [key]);
  return useSyncExternalStore(subscribe, get, get);
}
