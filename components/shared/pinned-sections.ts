/**
 * components/shared/pinned-sections.ts — закріплені розділи сайдбара планшета.
 *
 * Де живе: поле `pinnedSections: string[]` (ModuleId у порядку закріплення)
 * у СИНХРОНІЗОВАНОМУ singleton 'ui_preferences' — поруч із disabledModules.
 * Це безпечно без змін контракту: сервер зберігає singleton цілим JSON
 * (core/sync_contract.py, генеричний UserItem), а обидва клієнти при записі
 * копіюють невідомі поля як є (parseUiPreferences тут і `lib/nav-groups.ts`
 * на вебі). Тобто мобільний перемикач модулів не стирає закріплення, а запис
 * закріплення не чіпає disabledModules.
 *
 * Чому синхронізовано, а не локально: «які розділи мені потрібні першими» —
 * вибір про продукт (як вимкнені модулі), а не про діагональ екрана.
 * Діє лише в сайдбарі планшета (телефон не змінюється).
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { sanitizePinnedSections, togglePinnedSection } from '@/constants/nav';
import { loadData, subscribeToStorage } from '@/store/storage';
import { saveSyncedValue } from '@/store/synced-storage';
import { UI_PREFERENCES_KEY, parseUiPreferences, type StoredUiPreferences } from '@/store/ui-preferences';

/** Поле в ui_preferences. Те саме ім'я мусить читати веб. */
export const PINNED_SECTIONS_FIELD = 'pinnedSections';

/** Чиста функція: закріплені з об'єкта налаштувань. */
export function pinnedFromPreferences(prefs: unknown): string[] {
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return [];
  return sanitizePinnedSections((prefs as Record<string, unknown>)[PINNED_SECTIONS_FIELD]);
}

/** Чиста функція: новий об'єкт налаштувань із закріпленими (решта полів — як є). */
export function withPinnedSections(current: StoredUiPreferences, pinned: readonly string[], now: Date = new Date()): StoredUiPreferences {
  return { ...current, [PINNED_SECTIONS_FIELD]: sanitizePinnedSections(pinned), updatedAt: now.toISOString() };
}

// ─── Спільний стан (сайдбар і екран налаштувань бачать одне й те саме) ─────

let pinned: string[] = [];
let started = false;
const listeners = new Set<() => void>();
let queue: Promise<void> = Promise.resolve();

function emit() { listeners.forEach(l => l()); }

function setLocal(next: string[]) {
  if (next.length === pinned.length && next.every((id, i) => id === pinned[i])) return;
  pinned = next;
  emit();
}

async function read() {
  try {
    setLocal(pinnedFromPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null)));
  } catch (e) {
    if (__DEV__) console.warn('[nav] закріплені розділи не прочитались:', e);
  }
}

function start() {
  if (started) return;
  started = true;
  void read();
  // Ключ пишуть і повз цей модуль: pull синку з іншого пристрою, перемикач
  // модулів, «очистити всі дані».
  subscribeToStorage(key => { if (key === UI_PREFERENCES_KEY) void read(); });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getPinned = () => pinned;

/** Записати закріплені. Оптимістично + черга: два швидкі дотики не губляться. */
export function setPinnedSection(module: string, on?: boolean): void {
  const want = on ?? !pinned.includes(module);
  setLocal(togglePinnedSection(pinned, module, want));
  queue = queue
    .then(async () => {
      const current = parseUiPreferences(await loadData<unknown>(UI_PREFERENCES_KEY, null));
      const next = togglePinnedSection(pinnedFromPreferences(current), module, want);
      await saveSyncedValue(UI_PREFERENCES_KEY, withPinnedSections(current, next));
    })
    .catch(e => { if (__DEV__) console.warn('[nav] закріплені розділи не збереглись:', e); });
}

export interface PinnedSectionsState {
  pinned: readonly string[];
  isPinned: (module: string | undefined) => boolean;
  /** Без `on` — перемкнути. */
  setPinned: (module: string, on?: boolean) => void;
}

export function usePinnedSections(): PinnedSectionsState {
  const list = useSyncExternalStore(subscribe, getPinned, getPinned);
  useEffect(() => { start(); }, []);
  const isPinned = useCallback((module: string | undefined) => Boolean(module) && list.includes(module as string), [list]);
  return { pinned: list, isPinned, setPinned: setPinnedSection };
}
