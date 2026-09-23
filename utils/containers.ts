/**
 * utils/containers.ts — модель, міграція, дерево місць, пошук і QR-наліпки
 * модуля «Контейнери» (flowi-web-app/docs/specs/containers.md).
 *
 * ДОСЛІВНИЙ ПОРТ flowi-web-app/lib/containers.ts — джерела правди для обох
 * клієнтів. Зміна формули тут без того самого там дає дві різні видачі для
 * однакових даних (§7.1); тести — __tests__/containers.test.ts.
 *
 * Кольори тут hex і тільки hex. Веб раніше зберігав у `container.color` рядок
 * виду `var(--primary)`, а мобільний робить із того самого поля напівпрозорий
 * варіант конкатенацією — `container.color + '40'`. Із CSS-змінної виходило
 * `"var(--primary)40"`, чого React Native не розуміє: рамка, смужка й теги
 * лишались без кольору. Палітра нижче — та сама вісімка й у тому самому
 * порядку, що в мобільному.
 *
 * Жодних рантайм-імпортів — як і в оригіналі на вебі.
 */

// ─── Модель v2 (§3) ──────────────────────────────────────────────────────────

export type ItemStatus = "in_box" | "lent" | "discarded";
export const ITEM_STATUSES: readonly ItemStatus[] = ["in_box", "lent", "discarded"];

export type PlaceKind = "room" | "furniture" | "shelf" | "other";
export const PLACE_KINDS: readonly PlaceKind[] = ["room", "furniture", "shelf", "other"];

/** Річ у старій формі — елемент масиву `container.items` (до v2). */
export interface LegacyContainerItem {
  id: string;
  name: string;
  tags: string[];
  note?: string;
}

/** Річ — власний запис колекції `container_items` (§3.1). */
export interface ContainerItem {
  id: string;
  /** Належність зберігає РІЧ, а не масив у коробці. */
  containerId: string;
  name: string;
  tags: string[];
  note?: string;
  /** Ціле ≥ 0; за замовчуванням 1. */
  qty: number;
  status: ItemStatus;
  /** Лише при status === 'lent'. */
  lentTo?: string;
  lentAt?: string;
  discardedAt?: string;
  /** ≤3; перше — обкладинка. */
  photoIds?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface Container {
  id: string;
  name: string;
  color: string;
  placeId?: string | null;
  /** Денормалізований шлях місця — для старих збірок, що не знають місць. */
  location: string;
  /**
   * @deprecated Легасі-масив. Нові клієнти ще ПИШУТЬ його (фаза A подвійного
   * запису, §4.1), але читають лише для коробок без жодного запису в
   * `container_items`.
   */
  items?: LegacyContainerItem[];
  photoIds?: string[];
  /** Стабільний код наліпки (§6.1); генерується при першому друці. */
  qrSlug?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ContainerPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  /** null / відсутнє = корінь. */
  parentId?: string | null;
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Легкі метадані фото; байти — окремим ендпоінтом (§5). */
export interface MediaAsset {
  id: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
  /** id на сервері, якщо той видав свій замість клієнтського. */
  remoteId?: string;
  createdAt: string;
  updatedAt?: string;
}

export const CONTAINER_COLLECTIONS = {
  containers: "containers",
  items: "container_items",
  places: "container_places",
  media: "media_assets",
} as const;

export const MAX_PHOTOS = 3;
/** Глибина дерева місць: кімната → меблі → полиця → ще один рівень (§3.3). */
export const MAX_PLACE_DEPTH = 4;
export const STATUS_COLORS: Record<ItemStatus, string> = {
  in_box: "#94A3B8",
  lent: "#F59E0B",
  // Не червоний: викинути річ свідомо — не помилка (§8.4).
  discarded: "#9CA3AF",
};

// ─── Кольори ─────────────────────────────────────────────────────────────────

export const CONTAINER_COLORS = [
  "#F97316", "#EF4444", "#EC4899", "#8B5CF6",
  "#6366F1", "#0EA5E9", "#10B981", "#F59E0B",
] as const;

/** Кольори, які встиг записати старий веб, — щоб вони не зникли з екрана. */
const LEGACY_COLORS: Record<string, string> = {
  "var(--primary)": "#8B5CF6",
  "var(--secondary)": "#6366F1",
  "var(--blue)": "#0EA5E9",
  "var(--green)": "#10B981",
  "var(--orange)": "#F97316",
  "var(--red)": "#EF4444",
};

export function containerColor(raw: string | undefined): string {
  if (!raw) return CONTAINER_COLORS[0];
  if (raw.startsWith("#")) return raw;
  return LEGACY_COLORS[raw] ?? CONTAINER_COLORS[0];
}

// ─── Нормалізація записів ───────────────────────────────────────────────────

export function normalize(value: string): string {
  return value.toLocaleLowerCase("uk-UA");
}

/** Кількість із будь-чого: ціле ≥ 0; сміття → 1 (річ є, скільки — невідомо). */
export function clampQty(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.floor(n));
}

export function isItemStatus(raw: unknown): raw is ItemStatus {
  return raw === "in_box" || raw === "lent" || raw === "discarded";
}

/**
 * Запис речі в передбачуваній формі. Запис міг приїхати з іншої (старшої чи
 * новішої) збірки, тож відсутні поля заповнюються, а невідомий статус
 * читається як «у коробці» — річ не зникає з екрана через одне поле.
 */
export function normalizeItem(raw: ContainerItem): ContainerItem {
  const status = isItemStatus(raw.status) ? raw.status : "in_box";
  return {
    ...raw,
    name: raw.name ?? "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    qty: raw.qty === undefined ? 1 : clampQty(raw.qty),
    status,
    photoIds: Array.isArray(raw.photoIds) ? raw.photoIds.slice(0, MAX_PHOTOS) : undefined,
  };
}

/** Легасі-річ у форму v2 — так само, як її створює міграція (§4 крок 1). */
export function legacyToItem(item: LegacyContainerItem, container: Container): ContainerItem {
  const out: ContainerItem = {
    id: item.id,
    containerId: container.id,
    name: item.name ?? "",
    tags: Array.isArray(item.tags) ? item.tags : [],
    qty: 1,
    status: "in_box",
    createdAt: container.createdAt,
  };
  if (item.note) out.note = item.note;
  return out;
}

export function parseTags(raw: string): string[] {
  return raw.split(",").map((tag) => tag.trim()).filter(Boolean);
}

// ─── Речі коробки: колекція + легасі (§4.1) ─────────────────────────────────

/**
 * Речі кожної коробки. Коробка, для якої є хоч один запис у
 * `container_items`, показує ЛИШЕ записи — легасі-масив ігнорується. Коробка
 * без записів (ще не мігрована, або створена старою збіркою) показує масив,
 * зведений до форми v2. Тобто старі дані читаються завжди.
 */
export function itemsByContainer(
  containers: readonly Container[],
  items: readonly ContainerItem[] | undefined,
): Map<string, ContainerItem[]> {
  const out = new Map<string, ContainerItem[]>();
  for (const raw of items ?? []) {
    if (!raw || !raw.containerId) continue;
    const list = out.get(raw.containerId);
    const item = normalizeItem(raw);
    if (list) list.push(item);
    else out.set(raw.containerId, [item]);
  }
  for (const container of containers) {
    if (out.has(container.id)) continue;
    out.set(container.id, (container.items ?? []).map((item) => legacyToItem(item, container)));
  }
  return out;
}

/**
 * Зліпок речей для легасі-поля `container.items` (фаза A). Лише поля старої
 * форми; викинутих речей тут немає — стара збірка не знає статусів і
 * показала б їх як наявні.
 */
export function legacySnapshot(items: readonly ContainerItem[]): LegacyContainerItem[] {
  return items
    .filter((item) => item.status !== "discarded")
    .map((item) => {
      const out: LegacyContainerItem = { id: item.id, name: item.name, tags: item.tags ?? [] };
      if (item.note) out.note = item.note;
      return out;
    });
}

/**
 * Крок 1 міграції: легасі-речі → записи `container_items`.
 *
 * Ідемпотентно без прапорця: мігрується лише коробка, в якої ще НЕМАЄ жодного
 * запису, і лише речі, чийого id ще немає в колекції. id — СТАРИЙ: два
 * пристрої, що мігрували незалежно, дають той самий `local_id` і зливаються
 * в один запис, а не подвоюють інвентар.
 */
export function planItemsMigration(
  containers: readonly Container[],
  items: readonly ContainerItem[],
): ContainerItem[] {
  const hasRecords = new Set(items.map((item) => item.containerId));
  const knownIds = new Set(items.map((item) => item.id));
  const out: ContainerItem[] = [];
  for (const container of containers) {
    if (hasRecords.has(container.id)) continue;
    for (const legacy of container.items ?? []) {
      if (!legacy?.id || knownIds.has(legacy.id)) continue;
      knownIds.add(legacy.id);
      out.push(legacyToItem(legacy, container));
    }
  }
  return out;
}

// ─── Місця (§3.3) ────────────────────────────────────────────────────────────

/**
 * Рядок `location` → частини шляху. Роздільники пробуються в порядку
 * `→`, `/`, `,` — перший наявний і ріже; решта лишається частиною назви
 * («Шафа, верхня» після `→` — одна назва).
 */
export function splitLocation(location: string | undefined): string[] {
  const text = (location ?? "").trim();
  if (!text) return [];
  for (const sep of ["→", "/", ","]) {
    if (text.includes(sep)) {
      return text.split(sep).map((part) => part.trim()).filter(Boolean);
    }
  }
  return [text];
}

/** FNV-1a 32 біти — короткий детермінований відбиток без crypto. */
export function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const LOCAL_ID_MAX = 64;

/**
 * Похідний id місця з міграції: `place:<шлях>`. Два пристрої, що офлайн
 * мігрували ту саму «Спальня / Шафа», мусять зійтись в ОДНЕ місце (§4 крок 2).
 * `local_id` на сервері ≤64 символів — довгий шлях обрізається й отримує
 * відбиток повного шляху, щоб різні довгі шляхи не злиплись.
 */
export function placeIdForPath(parts: readonly string[]): string {
  const key = parts.map((part) => normalize(part.trim()).replace(/\s+/g, "-")).join("/");
  const plain = `place:${key}`;
  if (plain.length <= LOCAL_ID_MAX) return plain;
  const hash = fnv1a(key);
  return `place:${key.slice(0, LOCAL_ID_MAX - "place:".length - hash.length - 1)}~${hash}`;
}

function kindForLevel(level: number): PlaceKind {
  return level === 0 ? "room" : level === 1 ? "furniture" : "shelf";
}

export interface PlacesMigrationPlan {
  places: ContainerPlace[];
  /** Коробки, яким треба поставити `placeId` (location НЕ чиститься). */
  assignments: { containerId: string; placeId: string }[];
}

/** Крок 2 міграції: рядок `location` → дерево місць + `placeId`. */
export function planPlacesMigration(
  containers: readonly Container[],
  places: readonly ContainerPlace[],
  now: string,
): PlacesMigrationPlan {
  const all = [...places];
  const created: ContainerPlace[] = [];
  const assignments: PlacesMigrationPlan["assignments"] = [];
  const find = (name: string, parentId: string | null) =>
    all.find((place) => normalize(place.name) === normalize(name) && (place.parentId ?? null) === parentId);

  for (const container of containers) {
    if (container.placeId) continue;
    let parts = splitLocation(container.location);
    if (!parts.length) continue;
    if (parts.length > MAX_PLACE_DEPTH) {
      parts = [...parts.slice(0, MAX_PLACE_DEPTH - 1), parts.slice(MAX_PLACE_DEPTH - 1).join(" / ")];
    }
    let parentId: string | null = null;
    parts.forEach((name, level) => {
      const existing = find(name, parentId);
      if (existing) {
        parentId = existing.id;
        return;
      }
      const place: ContainerPlace = {
        id: placeIdForPath(parts.slice(0, level + 1)),
        name,
        kind: kindForLevel(level),
        parentId,
        createdAt: now,
      };
      // Похідний id міг уже існувати під іншим батьком (перейменували) —
      // тоді беремо його, а не плодимо дубль із тим самим local_id.
      const clash = all.find((p) => p.id === place.id);
      if (clash) {
        parentId = clash.id;
        return;
      }
      all.push(place);
      created.push(place);
      parentId = place.id;
    });
    if (parentId) assignments.push({ containerId: container.id, placeId: parentId });
  }
  return { places: created, assignments };
}

/**
 * Фактичний батько кожного місця. Цикл (A→B→A) може приїхати синком із двох
 * пристроїв; обхід обривається на повторі, і місце в циклі читається як
 * корінь — падати чи зависати не можна (§3.3). Батько, якого немає, — теж корінь.
 */
export function effectiveParents(places: readonly ContainerPlace[]): Map<string, string | null> {
  const byId = new Map(places.map((place) => [place.id, place]));
  const out = new Map<string, string | null>();
  for (const place of places) {
    const parentId = place.parentId ?? null;
    if (!parentId || !byId.has(parentId) || parentId === place.id) {
      out.set(place.id, null);
      continue;
    }
    // Корінь стає лише місце, що САМЕ лежить на циклі; місце, що висить на
    // циклі збоку, лишається під своїм батьком (той і стане коренем).
    const seen = new Set<string>();
    let cursor: string | null = parentId;
    let cyclic = false;
    while (cursor) {
      if (cursor === place.id) { cyclic = true; break; }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const next: string | null = byId.get(cursor)?.parentId ?? null;
      cursor = next && byId.has(next) ? next : null;
    }
    out.set(place.id, cyclic ? null : parentId);
  }
  return out;
}

/** Шлях місця від кореня до нього самого. Невідомий id — порожній шлях. */
export function placePath(placeId: string | null | undefined, places: readonly ContainerPlace[]): ContainerPlace[] {
  if (!placeId) return [];
  const byId = new Map(places.map((place) => [place.id, place]));
  const parents = effectiveParents(places);
  const path: ContainerPlace[] = [];
  const seen = new Set<string>();
  let cursor: string | null = placeId;
  while (cursor && byId.has(cursor) && !seen.has(cursor)) {
    seen.add(cursor);
    path.unshift(byId.get(cursor) as ContainerPlace);
    cursor = parents.get(cursor) ?? null;
  }
  return path;
}

export const PLACE_PATH_SEPARATOR = " → ";

export function placePathLabel(placeId: string | null | undefined, places: readonly ContainerPlace[]): string {
  return placePath(placeId, places).map((place) => place.name).join(PLACE_PATH_SEPARATOR);
}

/** Що показати як місце коробки: шлях дерева, а без нього — легасі-рядок. */
export function containerPlaceLabel(container: Container, places: readonly ContainerPlace[]): string {
  return placePathLabel(container.placeId, places) || (container.location ?? "");
}

export interface PlaceNode {
  place: ContainerPlace;
  depth: number;
  children: PlaceNode[];
}

function byName(a: ContainerPlace, b: ContainerPlace): number {
  return a.name.localeCompare(b.name, "uk-UA");
}

export function buildPlaceTree(places: readonly ContainerPlace[]): PlaceNode[] {
  const parents = effectiveParents(places);
  const childrenOf = new Map<string | null, ContainerPlace[]>();
  for (const place of places) {
    const parent = parents.get(place.id) ?? null;
    const list = childrenOf.get(parent) ?? [];
    list.push(place);
    childrenOf.set(parent, list);
  }
  const build = (parent: string | null, depth: number, seen: Set<string>): PlaceNode[] =>
    (childrenOf.get(parent) ?? [])
      .filter((place) => !seen.has(place.id))
      .sort(byName)
      .map((place) => {
        const nextSeen = new Set(seen).add(place.id);
        return { place, depth, children: build(place.id, depth + 1, nextSeen) };
      });
  return build(null, 0, new Set());
}

/** Дерево пласким списком у порядку показу — для `<select>` і пікерів. */
export function flattenPlaceTree(nodes: readonly PlaceNode[]): { place: ContainerPlace; depth: number }[] {
  const out: { place: ContainerPlace; depth: number }[] = [];
  const walk = (list: readonly PlaceNode[]) => {
    for (const node of list) {
      out.push({ place: node.place, depth: node.depth });
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** Місце разом з усіма нащадками. */
export function descendantPlaceIds(placeId: string, places: readonly ContainerPlace[]): Set<string> {
  const parents = effectiveParents(places);
  const out = new Set<string>([placeId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const place of places) {
      const parent = parents.get(place.id);
      if (parent && out.has(parent) && !out.has(place.id)) {
        out.add(place.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Висота піддерева (саме місце = 1). */
function subtreeHeight(placeId: string, places: readonly ContainerPlace[]): number {
  const parents = effectiveParents(places);
  let best = 1;
  for (const id of descendantPlaceIds(placeId, places)) {
    let depth = 1;
    let cursor = parents.get(id) ?? null;
    const seen = new Set<string>([id]);
    while (cursor && cursor !== placeId && !seen.has(cursor)) {
      seen.add(cursor);
      depth++;
      cursor = parents.get(cursor) ?? null;
    }
    if (id !== placeId) depth++;
    best = Math.max(best, depth);
  }
  return best;
}

/**
 * Чи можна покласти місце `placeId` (нове — null) під `parentId`: глибина
 * ≤ MAX_PLACE_DEPTH і жодного циклу — батько не може бути нащадком.
 */
export function canPlaceUnder(
  placeId: string | null,
  parentId: string | null,
  places: readonly ContainerPlace[],
): boolean {
  if (!parentId) return true;
  if (placeId && descendantPlaceIds(placeId, places).has(parentId)) return false;
  const parentDepth = placePath(parentId, places).length;
  if (!parentDepth) return false;
  const height = placeId ? subtreeHeight(placeId, places) : 1;
  return parentDepth + height <= MAX_PLACE_DEPTH;
}

export interface PlaceDeletePlan {
  /** Прямі діти з новим батьком. */
  places: ContainerPlace[];
  /** Коробки з новим `placeId` і `location`. */
  containers: Container[];
}

/**
 * Видалення місця: дітей і коробки перевішуємо на батька видаленого (або в
 * корінь). Каскадно нічого не стирається (§3.3).
 */
export function planPlaceDelete(
  placeId: string,
  places: readonly ContainerPlace[],
  containers: readonly Container[],
): PlaceDeletePlan {
  const parents = effectiveParents(places);
  const newParent = parents.get(placeId) ?? null;
  const children = places
    .filter((place) => place.id !== placeId && parents.get(place.id) === placeId)
    .map((place) => ({ ...place, parentId: newParent }));
  const remaining = places.filter((place) => place.id !== placeId).map((place) =>
    children.find((child) => child.id === place.id) ?? place);
  const moved = containers
    .filter((container) => container.placeId === placeId)
    .map((container) => ({
      ...container,
      placeId: newParent,
      location: placePathLabel(newParent, remaining),
    }));
  return { places: children, containers: moved };
}

/**
 * Коробки, чий денормалізований `location` розійшовся з деревом (місце
 * перейменували чи перевісили) — їх треба переписати для старих збірок.
 */
export function staleLocations(
  containers: readonly Container[],
  places: readonly ContainerPlace[],
): Container[] {
  return containers.flatMap((container) => {
    if (!container.placeId) return [];
    const label = placePathLabel(container.placeId, places);
    if (!label || label === container.location) return [];
    return [{ ...container, location: label }];
  });
}

// ─── Лічильники ──────────────────────────────────────────────────────────────

/** Індекс форми українського числівника: 0 — «1 річ», 1 — «2 речі», 2 — «5 речей». */
export function pluralIndexUk(n: number): 0 | 1 | 2 {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return 0;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
  return 2;
}

export function itemsLabelUk(n: number): string {
  return `${n} ${["річ", "речі", "речей"][pluralIndexUk(n)]}`;
}

export interface ContainerStats {
  /** Речей у коробці (не викинутих) — записів, не штук. */
  count: number;
  /** Штук разом із кількостями. */
  units: number;
  lent: number;
  discarded: number;
}

export function containerStats(items: readonly ContainerItem[]): ContainerStats {
  const stats: ContainerStats = { count: 0, units: 0, lent: 0, discarded: 0 };
  for (const item of items) {
    if (item.status === "discarded") { stats.discarded++; continue; }
    stats.count++;
    stats.units += item.qty;
    if (item.status === "lent") stats.lent++;
  }
  return stats;
}

// ─── Пошук (§7) ──────────────────────────────────────────────────────────────

export function itemMatches(item: Pick<ContainerItem, "name" | "note" | "tags" | "lentTo">, needle: string): boolean {
  const haystack = [item.name, item.note ?? "", item.lentTo ?? "", ...(item.tags ?? [])].join(" ");
  return normalize(haystack).includes(needle);
}

/**
 * Ранг збігу речі (менше — вище): точна назва → початок назви → назва
 * містить → тег → (коробка/місце — див. selectContainers) → примітка й
 * «кому позичено». −1 — не збіглося.
 */
export function itemRank(item: Pick<ContainerItem, "name" | "note" | "tags" | "lentTo">, needle: string): number {
  const name = normalize(item.name ?? "");
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.includes(needle)) return 2;
  if ((item.tags ?? []).some((tag) => normalize(tag).includes(needle))) return 3;
  if (normalize(`${item.note ?? ""} ${item.lentTo ?? ""}`).includes(needle)) return 5;
  return -1;
}
const RANK_CONTAINER = 4;

export interface ContainerMatch {
  container: Container;
  /** Речі, які треба показати: збіги при пошуку, усе — без пошуку. */
  items: ContainerItem[];
  /** Скільки речей у контейнері всього — для підпису «1 з 7». */
  total: number;
  /** true — контейнер потрапив у видачу за власною назвою чи місцем. */
  byContainer: boolean;
  /** Найкращий ранг збігу в коробці (0 без пошуку). */
  rank: number;
}

export interface SelectOptions {
  /** Записи `container_items`; без них — легасі `container.items`. */
  items?: readonly ContainerItem[];
  places?: readonly ContainerPlace[];
  /** Показувати викинуті речі (інакше їх немає ні у видачі, ні в лічильниках). */
  showDiscarded?: boolean;
  /** Локальний лічильник відкриттів коробок — ранжування всередині групи. */
  openCounts?: Readonly<Record<string, number>>;
  /** Лише коробки цих місць (разом із нащадками — викликач сам їх розгортає). */
  placeIds?: ReadonlySet<string> | null;
}

/**
 * Контейнери під запит.
 *
 * Свідомо лишаємо сітку контейнерів, а не плоский список знайдених речей:
 * відповідь на «де лежить дріт» — це назва контейнера, і вона має бути
 * заголовком картки, а не приміткою збоку.
 *
 * Викинуті речі без `showDiscarded` у видачу не потрапляють: річ, якої вже
 * немає, — не відповідь на «де воно». Збіг за назвою місця (шлях дерева або
 * легасі-рядок) показує коробку цілком.
 */
export function selectContainers(
  containers: readonly Container[],
  search: string,
  options: SelectOptions = {},
): ContainerMatch[] {
  const needle = normalize(search.trim());
  const places = options.places ?? [];
  const byBox = itemsByContainer(containers, options.items);
  const visible = (item: ContainerItem) => options.showDiscarded || item.status !== "discarded";

  const matches = containers.flatMap((container): ContainerMatch[] => {
    if (options.placeIds && !(container.placeId && options.placeIds.has(container.placeId))) return [];
    const items = (byBox.get(container.id) ?? []).filter(visible);
    if (!needle) {
      return [{ container, items, total: items.length, byContainer: false, rank: 0 }];
    }

    const placeText = `${placePathLabel(container.placeId, places)} ${container.location ?? ""}`;
    const byContainer = normalize(`${container.name} ${placeText}`).includes(needle);
    let rank = byContainer ? RANK_CONTAINER : Infinity;
    const hits: ContainerItem[] = [];
    for (const item of items) {
      const r = itemRank(item, needle);
      if (r < 0) continue;
      hits.push(item);
      rank = Math.min(rank, r);
    }
    if (!byContainer && !hits.length) return [];

    // Збіг за назвою контейнера показує весь вміст: питали про контейнер,
    // а не про річ у ньому.
    return [{ container, items: byContainer ? items : hits, total: items.length, byContainer, rank }];
  });

  if (!needle) return matches;
  const opens = options.openCounts ?? {};
  // Array.prototype.sort стабільний — рівні лишаються в порядку колекції.
  return matches
    .map((match, index) => ({ match, index }))
    .sort((a, b) =>
      a.match.rank - b.match.rank ||
      (opens[b.match.container.id] ?? 0) - (opens[a.match.container.id] ?? 0) ||
      a.index - b.index)
    .map(({ match }) => match);
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Розбити текст на шматки для підсвітки збігу.
 *
 * Порівняння йде по зведеному до нижнього регістру рядку, а нарізається
 * ОРИГІНАЛ — інакше на екран потрапив би текст із втраченими великими
 * літерами.
 */
export function highlight(text: string, search: string): Segment[] {
  const needle = normalize(search.trim());
  if (!needle) return [{ text, hit: false }];

  const hay = normalize(text);
  // Зведення регістру може змінити довжину рядка (напр. 'İ'); тоді індекси
  // з hay не лягли б на оригінал, і підсвітка з'їхала б — краще без неї.
  if (hay.length !== text.length) return [{ text, hit: false }];

  const segments: Segment[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) segments.push({ text: text.slice(from, at), hit: false });
    segments.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (!segments.length) return [{ text, hit: false }];
  if (from < text.length) segments.push({ text: text.slice(from), hit: false });
  return segments;
}

/** Речей усього (без викинутих). Без `items` — за легасі-масивами. */
export function totalItems(containers: readonly Container[], items?: readonly ContainerItem[]): number {
  const withRecords = new Set<string>();
  const live = new Map<string, number>();
  for (const item of items ?? []) {
    withRecords.add(item.containerId);
    if (normalizeItem(item).status !== "discarded") live.set(item.containerId, (live.get(item.containerId) ?? 0) + 1);
  }
  return containers.reduce((sum, container) => sum + (withRecords.has(container.id)
    ? live.get(container.id) ?? 0
    : container.items?.length ?? 0), 0);
}

// ─── Статус речі ─────────────────────────────────────────────────────────────

/**
 * Перехід статусу з супутніми полями: `lentTo`/`lentAt` живуть лише при
 * «позичено», `discardedAt` — лише при «викинуто».
 */
export function withStatus(
  item: ContainerItem,
  status: ItemStatus,
  now: string,
  lentTo?: string,
): ContainerItem {
  const next: ContainerItem = { ...item, status };
  if (status === "lent") {
    next.lentTo = (lentTo ?? item.lentTo ?? "").trim() || undefined;
    next.lentAt = item.status === "lent" && item.lentAt ? item.lentAt : now;
  } else {
    delete next.lentTo;
    delete next.lentAt;
  }
  if (status === "discarded") next.discardedAt = item.status === "discarded" && item.discardedAt ? item.discardedAt : now;
  else delete next.discardedAt;
  return next;
}

// ─── Фото ────────────────────────────────────────────────────────────────────

export function withPhoto(ids: readonly string[] | undefined, id: string): string[] {
  const list = (ids ?? []).filter((existing) => existing !== id);
  return [...list, id].slice(0, MAX_PHOTOS);
}

export function withoutPhoto(ids: readonly string[] | undefined, id: string): string[] {
  return (ids ?? []).filter((existing) => existing !== id);
}

/** Зробити фото обкладинкою — перше в масиві. */
export function asCover(ids: readonly string[] | undefined, id: string): string[] {
  const list = ids ?? [];
  return list.includes(id) ? [id, ...list.filter((existing) => existing !== id)] : [...list];
}

/** Розмір після стиснення: довша сторона ≤ `max`, пропорції зберігаються. */
export function fitWithin(width: number, height: number, max = 1600): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max || longest <= 0) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Фото, на які посилається хоч одна коробка чи річ. */
export function referencedPhotoIds(
  containers: readonly Container[],
  items: readonly ContainerItem[],
): Set<string> {
  const out = new Set<string>();
  for (const record of [...containers, ...items]) for (const id of record.photoIds ?? []) out.add(id);
  return out;
}

// ─── QR-наліпки (§6) ─────────────────────────────────────────────────────────

/** Crockford base32: без I, L, O, U — не сплутати з 1, 0 і V на затертій наліпці. */
export const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const QR_SLUG_LENGTH = 10;
export const APP_SCHEME = "ftrackingapp";

/**
 * Новий слаг. `randomBytes` — джерело випадковості (у тестах — детерміноване).
 * 5 біт на символ: 10 символів = 50 біт, тобто не вгадується перебором.
 */
export function generateQrSlug(randomBytes: (n: number) => Uint8Array, taken?: ReadonlySet<string>): string {
  for (;;) {
    const bytes = randomBytes(QR_SLUG_LENGTH);
    let slug = "";
    for (let i = 0; i < QR_SLUG_LENGTH; i++) slug += CROCKFORD[bytes[i] & 31];
    if (!taken?.has(slug)) return slug;
  }
}

/**
 * Слаг, введений руками чи прочитаний із наліпки: верхній регістр, без
 * пробілів і дефісів, I/L → 1, O → 0 (правило декодування Crockford).
 * null — це не слаг.
 */
export function normalizeQrSlug(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
  if (cleaned.length !== QR_SLUG_LENGTH) return null;
  for (const ch of cleaned) if (!CROCKFORD.includes(ch)) return null;
  return cleaned;
}

export function buildQrUrl(webOrigin: string, workspaceId: string, slug: string): string {
  const origin = webOrigin.replace(/\/+$/, "");
  return `${origin}/c/${encodeURIComponent(workspaceId)}/${slug}`;
}

export type QrPayload =
  | { kind: "flowi"; workspaceId: string | null; slug: string }
  | { kind: "foreign"; text: string };

/**
 * Вміст QR → що це. Приймаємо три форми (§6.2): повний URL
 * `https://…/c/<ws>/<slug>`, `ftrackingapp://c/<ws>/<slug>` і голий слаг.
 * Усе інше — чужий QR: викликач показує текст і пропонує шукати.
 */
export function parseQrPayload(raw: string): QrPayload {
  const text = raw.trim();
  const bare = normalizeQrSlug(text);
  if (bare && !text.includes("/")) return { kind: "flowi", workspaceId: null, slug: bare };

  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1]?.toLowerCase();
  if (scheme === "https" || scheme === "http" || scheme === APP_SCHEME) {
    const segments = text.slice(scheme.length + 3).split(/[?#]/)[0].split("/").filter(Boolean);
    // http(s): перший сегмент — хост (origin може мати й підшлях).
    // `ftrackingapp://c/ws/slug`: `c` стоїть на місці хоста.
    const path = scheme === APP_SCHEME ? segments : segments.slice(1);
    const at = path.length - 3;
    if (at >= 0 && path[at] === "c") {
      const slug = normalizeQrSlug(path[at + 2]);
      if (slug) {
        let workspaceId = path[at + 1];
        try { workspaceId = decodeURIComponent(workspaceId); } catch { /* лишаємо як є */ }
        return { kind: "flowi", workspaceId, slug };
      }
    }
  }
  return { kind: "foreign", text };
}

export type QrResolution =
  | { status: "found"; container: Container }
  | { status: "other_workspace"; workspaceId: string }
  | { status: "not_found"; slug: string }
  | { status: "foreign"; text: string };

/**
 * Локальний резолв скану (§6.2): мережа не потрібна, колекція `containers`
 * повністю тут. Наліпка з іншого workspace далі не шукається — той самий
 * слаг у чужому просторі нічого не означає.
 */
export function resolveQrScan(
  payload: QrPayload,
  currentWorkspaceId: string | null | undefined,
  containers: readonly Container[],
): QrResolution {
  if (payload.kind === "foreign") return { status: "foreign", text: payload.text };
  if (payload.workspaceId && currentWorkspaceId && payload.workspaceId !== currentWorkspaceId) {
    return { status: "other_workspace", workspaceId: payload.workspaceId };
  }
  const container = containers.find((box) => box.qrSlug && normalizeQrSlug(box.qrSlug) === payload.slug);
  return container ? { status: "found", container } : { status: "not_found", slug: payload.slug };
}

// ─── Наліпки: пресети аркуша (§6.3) ─────────────────────────────────────────

export type LabelPresetId = "small" | "medium" | "large";

export interface LabelPreset {
  id: LabelPresetId;
  columns: number;
  rows: number;
  /** Розмір наліпки, мм. */
  width: number;
  height: number;
  showName: boolean;
  showPlace: boolean;
  showCount: boolean;
}

export const LABEL_PRESETS: Record<LabelPresetId, LabelPreset> = {
  small: { id: "small", columns: 5, rows: 13, width: 38, height: 21, showName: false, showPlace: false, showCount: false },
  medium: { id: "medium", columns: 3, rows: 8, width: 63, height: 34, showName: true, showPlace: true, showCount: false },
  large: { id: "large", columns: 2, rows: 4, width: 99, height: 67, showName: true, showPlace: true, showCount: true },
};

/** Поля аркуша A4 (мм), щоб сітка наліпок стала по центру. */
export function sheetMargins(preset: LabelPreset): { top: number; left: number } {
  return {
    top: Math.max(0, (297 - preset.rows * preset.height) / 2),
    left: Math.max(0, (210 - preset.columns * preset.width) / 2),
  };
}
