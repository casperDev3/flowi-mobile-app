/**
 * hooks/use-zone-state.ts — стан зон Layout System v2.4 (паритет із вебом
 * `useZoneState`): режим головної зони (Список / Колонки), видимість панелей
 * (статична, динамічна) і вибраний запис.
 *
 * Де живе стан:
 *   • вибраний запис, режим і відкрита панель — у ПАРАМЕТРАХ МАРШРУТУ
 *     (`?task=142&view=list&panel=open`): диплінк відкриває той самий стан,
 *     що бачив автор посилання. Наявні посилання без параметрів працюють як
 *     і раніше — типові значення беруться з налаштувань пристрою;
 *   • вибір людини (режим, статична/динамічна панель) — локально на ЦЬОМУ
 *     пристрої (AsyncStorage `layout_zones_prefs_v1`), як і сортування
 *     «Проєктів» (utils/projectListPrefs.ts): на планшеті зручно одне, на
 *     телефоні інше, тож у синхронізований `ui_preferences` це не йде.
 *     Ключ не містить даних акаунта — у синк, outbox і бекапи не потрапляє.
 *
 * Активний розділ (`useActiveZone`) — для перемикача «Список / Колонки» внизу
 * шухляди сайдбара: розділ, що зараз у фокусі й уміє обидва режими,
 * реєструється тут, і шухляда показує перемикач саме для нього.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

export type ZoneView = 'list' | 'columns';
export type ZonePanel = 'static' | 'dynamic';

export interface ZoneSectionPrefs {
  view: ZoneView;
  /** Статична зона поруч (лише там, де вистачає ширини). */
  static: boolean;
  /** Динамічна панель деталей дозволена (вимкнена → «фокус» на головній). */
  dynamic: boolean;
}

export const ZONE_PREFS_KEY = 'layout_zones_prefs_v1';

export const DEFAULT_ZONE_PREFS: ZoneSectionPrefs = Object.freeze({ view: 'list', static: true, dynamic: true }) as ZoneSectionPrefs;

/** Чиста функція: збережене → придатні налаштування (сміття → типові). */
export function parseZonePrefs(raw: unknown): Record<string, ZoneSectionPrefs> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, ZoneSectionPrefs> = {};
  for (const [section, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    out[section] = {
      view: o.view === 'columns' ? 'columns' : 'list',
      static: typeof o.static === 'boolean' ? o.static : true,
      dynamic: typeof o.dynamic === 'boolean' ? o.dynamic : true,
    };
  }
  return out;
}

// ─── Сховище налаштувань (одне на застосунок) ────────────────────────────────

let prefs: Record<string, ZoneSectionPrefs> = {};
let loaded = false;
const prefListeners = new Set<() => void>();

function emitPrefs() { prefListeners.forEach(l => l()); }

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(ZONE_PREFS_KEY)
    .then(raw => {
      const stored = parseZonePrefs(raw ? JSON.parse(raw) : null);
      // Те, що людина вже змінила до завершення читання, перемагає збережене.
      prefs = { ...stored, ...prefs };
      emitPrefs();
    })
    .catch(e => { if (__DEV__) console.warn('[zones] налаштування зон не прочитались:', e); });
}

function persist() {
  AsyncStorage.setItem(ZONE_PREFS_KEY, JSON.stringify(prefs))
    .catch(e => { if (__DEV__) console.warn('[zones] налаштування зон не зберіглись:', e); });
}

export function getZonePrefs(section: string): ZoneSectionPrefs {
  return prefs[section] ?? DEFAULT_ZONE_PREFS;
}

export function setZonePrefs(section: string, patch: Partial<ZoneSectionPrefs>): void {
  prefs = { ...prefs, [section]: { ...getZonePrefs(section), ...patch } };
  emitPrefs();
  persist();
}

function subscribePrefs(l: () => void) {
  ensureLoaded();
  prefListeners.add(l);
  return () => { prefListeners.delete(l); };
}

/** Налаштування розділу (реактивно). */
export function useZonePrefs(section: string): ZoneSectionPrefs {
  const get = useCallback(() => getZonePrefs(section), [section]);
  return useSyncExternalStore(subscribePrefs, get, get);
}

// ─── Активний розділ (для перемикача в шухляді) ─────────────────────────────

export interface ActiveZone {
  section: string;
  /** Підпис розділу для озвучення перемикача. */
  label?: string;
}

let active: ActiveZone | null = null;
const activeListeners = new Set<() => void>();

function setActive(next: ActiveZone | null) {
  if (active === next) return;
  active = next;
  activeListeners.forEach(l => l());
}

function subscribeActive(l: () => void) {
  activeListeners.add(l);
  return () => { activeListeners.delete(l); };
}

const getActive = () => active;

/** Розділ у фокусі, що вміє «Список / Колонки» (або null). */
export function useActiveZone(): ActiveZone | null {
  return useSyncExternalStore(subscribeActive, getActive, getActive);
}

// ─── useZoneState ───────────────────────────────────────────────────────────

export interface UseZoneStateOptions {
  /** Ключ розділу: 'tasks', 'finance'… (той самий, що на вебі). */
  section: string;
  /** Параметр маршруту вибраного запису (за замовч. 'id'; для завдань — 'task'). */
  selectedParam?: string;
  /** Розділ уміє «Колонки» — тоді шухляда показує перемикач. */
  columns?: boolean;
  /** Підпис розділу (озвучення перемикача в шухляді). */
  label?: string;
}

export interface ZoneState {
  view: ZoneView;
  setView: (v: ZoneView) => void;
  /** Видимість панелей за вибором людини. */
  panels: { static: boolean; dynamic: boolean };
  setPanel: (panel: ZonePanel, on: boolean) => void;
  togglePanel: (panel: ZonePanel) => void;
  /** Вибраний запис (з параметра маршруту або локально). */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Динамічна панель відкрита: є вибір і панель не вимкнена. */
  panelOpen: boolean;
  /** Закрити панель деталей (знімає вибір). */
  closePanel: () => void;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || '';

export function useZoneState({ section, selectedParam = 'id', columns = false, label }: UseZoneStateOptions): ZoneState {
  const router = useRouter();
  const params = useLocalSearchParams() as Params;
  const p = useZonePrefs(section);

  const paramView = one(params.view);
  const paramSelected = one(params[selectedParam]);
  const paramPanel = one(params.panel);

  // Параметр маршруту (диплінк) перемагає збережений вибір — один раз на
  // кожне нове значення, далі людина перемикає сама.
  const seenView = useRef('');
  useEffect(() => {
    if ((paramView === 'list' || paramView === 'columns') && paramView !== seenView.current) {
      seenView.current = paramView;
      if (paramView !== getZonePrefs(section).view) setZonePrefs(section, { view: paramView });
    }
  }, [paramView, section]);
  const seenPanel = useRef('');
  useEffect(() => {
    if ((paramPanel === 'open' || paramPanel === 'closed') && paramPanel !== seenPanel.current) {
      seenPanel.current = paramPanel;
      const on = paramPanel === 'open';
      if (on !== getZonePrefs(section).dynamic) setZonePrefs(section, { dynamic: on });
    }
  }, [paramPanel, section]);

  // Вибір — локальний стан для миттєвої реакції + дзеркало в параметрі.
  const [selectedId, setSelectedId] = useState<string | null>(paramSelected || null);
  useEffect(() => {
    if (paramSelected) setSelectedId(paramSelected);
  }, [paramSelected]);

  const setParams = useCallback((next: Record<string, string>) => {
    try { router.setParams(next as never); } catch { /* поза навігатором (тести) */ }
  }, [router]);

  const setView = useCallback((v: ZoneView) => {
    setZonePrefs(section, { view: v });
    setParams({ view: v });
  }, [section, setParams]);

  const setPanel = useCallback((panel: ZonePanel, on: boolean) => {
    setZonePrefs(section, panel === 'static' ? { static: on } : { dynamic: on });
    if (panel === 'dynamic') setParams({ panel: on ? 'open' : 'closed' });
  }, [section, setParams]);

  const togglePanel = useCallback((panel: ZonePanel) => {
    const cur = getZonePrefs(section);
    setPanel(panel, !(panel === 'static' ? cur.static : cur.dynamic));
  }, [section, setPanel]);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    setParams({ [selectedParam]: id ?? '' });
    // Вибір запису при вимкненій панелі вмикає її назад: інакше тап по рядку
    // «нічого не робив» би.
    if (id && !getZonePrefs(section).dynamic) setZonePrefs(section, { dynamic: true });
  }, [section, selectedParam, setParams]);

  const closePanel = useCallback(() => select(null), [select]);

  // Реєстрація активного розділу — поки екран у фокусі.
  const zoneRef = useRef<ActiveZone>({ section, label });
  zoneRef.current = { section, label };
  useFocusEffect(useCallback(() => {
    if (!columns) return undefined;
    const z: ActiveZone = { section: zoneRef.current.section, label: zoneRef.current.label };
    setActive(z);
    return () => { if (getActive() === z) setActive(null); };
  }, [columns]));

  return useMemo(() => ({
    view: p.view,
    setView,
    panels: { static: p.static, dynamic: p.dynamic },
    setPanel,
    togglePanel,
    selectedId,
    select,
    panelOpen: !!selectedId && p.dynamic,
    closePanel,
  }), [p.view, p.static, p.dynamic, setView, setPanel, togglePanel, selectedId, select, closePanel]);
}
