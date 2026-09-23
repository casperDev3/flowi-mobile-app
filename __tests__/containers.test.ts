/**
 * __tests__/containers.test.ts — модель, міграція, місця, пошук і QR
 * контейнерів. ДОСЛІВНИЙ ПОРТ flowi-web-app/lib/containers.test.mjs:
 * utils/containers.ts — порт lib/containers.ts, і однакові тести на обох
 * платформах — єдиний спосіб помітити, що формули розійшлись (§7.1).
 */

import assert from 'node:assert/strict';

import {
  asCover,
  buildPlaceTree,
  buildQrUrl,
  canPlaceUnder,
  clampQty,
  CONTAINER_COLORS,
  containerColor,
  containerStats,
  effectiveParents,
  fitWithin,
  generateQrSlug,
  highlight,
  itemsByContainer,
  itemsLabelUk,
  legacySnapshot,
  MAX_PHOTOS,
  normalizeItem,
  normalizeQrSlug,
  parseQrPayload,
  placeIdForPath,
  placePath,
  placePathLabel,
  planItemsMigration,
  planPlaceDelete,
  planPlacesMigration,
  resolveQrScan,
  selectContainers,
  splitLocation,
  staleLocations,
  totalItems,
  withPhoto,
  withStatus,
  type Container,
  type ContainerItem,
  type ContainerPlace,
  type LegacyContainerItem,
  type PlaceKind,
} from '@/utils/containers';

const item = (over: Partial<LegacyContainerItem> = {}): LegacyContainerItem =>
  ({ id: Math.random().toString(36), name: 'Річ', tags: [], ...over });
const box = (over: Partial<Container> = {}): Container => ({
  id: 'c1', name: 'Органайзер', location: 'Балкон', color: '#F97316',
  items: [], createdAt: '2026-04-05T20:09:55.655Z', ...over,
});
const rec = (over: Partial<ContainerItem> = {}): ContainerItem => ({
  id: Math.random().toString(36).slice(2), containerId: 'c1', name: 'Річ', tags: [],
  qty: 1, status: 'in_box', createdAt: '2026-09-01T00:00:00.000Z', ...over,
});
const place = (id: string, name: string, parentId: string | null = null, kind: PlaceKind = 'room'): ContainerPlace =>
  ({ id, name, parentId, kind, createdAt: '' });


test("палітра — та сама вісімка hex, що в мобільному", () => {
  assert.deepEqual([...CONTAINER_COLORS], [
    "#F97316", "#EF4444", "#EC4899", "#8B5CF6",
    "#6366F1", "#0EA5E9", "#10B981", "#F59E0B",
  ]);
});

test("CSS-змінна старого вебу зводиться до hex, а не зникає", () => {
  assert.equal(containerColor("var(--primary)"), "#8B5CF6");
  assert.equal(containerColor("var(--green)"), "#10B981");
  assert.equal(containerColor("#EC4899"), "#EC4899");
  assert.equal(containerColor(undefined), "#F97316");
  assert.equal(containerColor("щось чуже"), "#F97316");
});

test("без пошуку показуються всі контейнери з усім вмістом", () => {
  const boxes = [box({ items: [item(), item()] }), box({ id: "c2", items: [] })];
  const result = selectContainers(boxes, "");
  assert.equal(result.length, 2);
  assert.equal(result[0].items.length, 2);
  assert.equal(result[0].total, 2);
  assert.equal(result[0].byContainer, false);
});

test("пошук лишає контейнер, але в ньому — лише збіги", () => {
  const boxes = [
    box({ id: "c1", items: [item({ name: "Дріт typeC — typeC" }), item({ name: "Викрутка" })] }),
    box({ id: "c2", name: "Шухляда", location: "Стіл", items: [item({ name: "Зарядка typeC 65W" })] }),
    box({ id: "c3", name: "Ящик", items: [item({ name: "Молоток" })] }),
  ];
  const result = selectContainers(boxes, "typeC");
  assert.deepEqual(result.map((m) => m.container.id), ["c1", "c2"], "контейнер без збігів випадає");
  assert.deepEqual(result[0].items.map((i) => i.name), ["Дріт typeC — typeC"]);
  assert.equal(result[0].total, 2, "лічильник знає про повний склад — звідси «1 з 2»");
});

test("збіг за назвою контейнера показує весь вміст", () => {
  const boxes = [box({ name: "Шухляда", items: [item({ name: "Молоток" }), item({ name: "Цвяхи" })] })];
  const result = selectContainers(boxes, "шухляд");
  assert.equal(result[0].byContainer, true);
  assert.equal(result[0].items.length, 2, "питали про контейнер, а не про річ у ньому");
});

test("пошук бачить місце, теги й нотатку речі", () => {
  const boxes = [
    box({ id: "loc", location: "Гараж", items: [] }),
    box({ id: "tag", location: "", items: [item({ tags: ["зарядки"] })] }),
    box({ id: "note", location: "", items: [item({ note: "лежить у пакеті" })] }),
  ];
  assert.deepEqual(selectContainers(boxes, "гараж").map((m) => m.container.id), ["loc"]);
  assert.deepEqual(selectContainers(boxes, "ЗАРЯДКИ").map((m) => m.container.id), ["tag"]);
  assert.deepEqual(selectContainers(boxes, "пакеті").map((m) => m.container.id), ["note"]);
});

test("контейнер без масиву items не валить пошук", () => {
  const result = selectContainers([{ id: "c", name: "Без речей", location: "", color: "#F97316", createdAt: "" }], "");
  assert.deepEqual(result[0].items, []);
  assert.equal(result[0].total, 0);
});

test("підсвітка ріже оригінал, а не зведений регістр", () => {
  assert.deepEqual(highlight("Дріт TypeC білий", "typec"), [
    { text: "Дріт ", hit: false },
    { text: "TypeC", hit: true },
    { text: " білий", hit: false },
  ]);
});

test("підсвічуються всі входження", () => {
  const segments = highlight("typeC — typeC", "typec");
  assert.equal(segments.filter((s) => s.hit).length, 2);
  assert.equal(segments.map((s) => s.text).join(""), "typeC — typeC", "текст не втрачається");
});

test("порожній запит і відсутність збігу дають один цілий шматок", () => {
  assert.deepEqual(highlight("Молоток", ""), [{ text: "Молоток", hit: false }]);
  assert.deepEqual(highlight("Молоток", "дріт"), [{ text: "Молоток", hit: false }]);
});

test("збіг на початку й у кінці не додає порожніх шматків", () => {
  assert.deepEqual(highlight("дріт", "дріт"), [{ text: "дріт", hit: true }]);
  assert.deepEqual(highlight("довгий дріт", "дріт"), [
    { text: "довгий ", hit: false },
    { text: "дріт", hit: true },
  ]);
});

test("речей усього — по всіх контейнерах", () => {
  assert.equal(totalItems([box({ items: [item(), item()] }), box({ items: [item()] })]), 3);
  assert.equal(totalItems([]), 0);
});

// ─── v2: речі як записи, статуси, місця, QR ─────────────────────────────────



test("коробка з записами ігнорує легасі-масив, без записів — читає його", () => {
  const boxes = [
    box({ id: "a", items: [item({ id: "old", name: "Стара" })] }),
    box({ id: "b", items: [item({ id: "leg", name: "Легасі", note: "н" })] }),
  ];
  const map = itemsByContainer(boxes, [rec({ id: "new", containerId: "a", name: "Нова" })]);
  assert.deepEqual(map.get("a")!.map((i) => i.name), ["Нова"]);
  const legacy = map.get("b")![0];
  assert.equal(legacy.name, "Легасі");
  assert.equal(legacy.qty, 1);
  assert.equal(legacy.status, "in_box");
  assert.equal(legacy.containerId, "b");
});

test("запис з іншої збірки без qty/status і з чужим статусом читається", () => {
  const n = normalizeItem({ id: "x", containerId: "c", name: "A", createdAt: "", status: "щось" } as unknown as ContainerItem);
  assert.equal(n.qty, 1);
  assert.equal(n.status, "in_box");
  assert.deepEqual(n.tags, []);
  assert.equal(clampQty(-3), 0);
  assert.equal(clampQty(2.7), 2);
  assert.equal(clampQty("5"), 5);
  assert.equal(clampQty("abc"), 1);
  assert.equal(normalizeItem(rec({ qty: 0 })).qty, 0, "нуль дозволено — «всі роздав»");
});

test("міграція речей зберігає старі id і не повторюється", () => {
  const boxes = [
    box({ id: "a", createdAt: "2026-01-01", items: [item({ id: "1", name: "Дріт", tags: ["t"], note: "n" }), item({ id: "2" })] }),
    box({ id: "b", items: [item({ id: "3" })] }),
  ];
  const first = planItemsMigration(boxes, []);
  assert.deepEqual(first.map((i) => i.id), ["1", "2", "3"]);
  assert.deepEqual(first[0], {
    id: "1", containerId: "a", name: "Дріт", tags: ["t"], note: "n", qty: 1, status: "in_box", createdAt: "2026-01-01",
  });
  assert.deepEqual(planItemsMigration(boxes, first), [], "ідемпотентно");
  // Коробка, де вже є хоч один запис, не мігрує легасі повторно.
  assert.deepEqual(planItemsMigration(boxes, [rec({ id: "9", containerId: "a" })]).map((i) => i.id), ["3"]);
});

test("зліпок для старих збірок — лише старі поля і без викинутих", () => {
  const snap = legacySnapshot([
    rec({ id: "1", name: "A", qty: 5, status: "lent", lentTo: "Петро", note: "n" }),
    rec({ id: "2", name: "B", status: "discarded" }),
  ]);
  assert.deepEqual(snap, [{ id: "1", name: "A", tags: [], note: "n" }]);
});

test("викинуте не шукається без перемикача, позичене — шукається і за «кому»", () => {
  const boxes = [box({ id: "a", name: "Ящик", location: "" })];
  const items = [
    rec({ id: "1", containerId: "a", name: "Дриль", status: "discarded" }),
    rec({ id: "2", containerId: "a", name: "Пила", status: "lent", lentTo: "Петро" }),
  ];
  assert.deepEqual(selectContainers(boxes, "дриль", { items }), []);
  assert.equal(selectContainers(boxes, "дриль", { items, showDiscarded: true }).length, 1);
  assert.deepEqual(selectContainers(boxes, "петро", { items })[0].items.map((i) => i.id), ["2"]);
  assert.equal(selectContainers(boxes, "", { items })[0].total, 1, "лічильник без викинутих");
});

test("ранжування: точна назва → початок → тег → коробка → примітка; далі — частота відкриття", () => {
  const boxes = [
    box({ id: "note", name: "Ящик 1", location: "" }),
    box({ id: "box", name: "Кабель-бокс", location: "" }),
    box({ id: "tag", name: "Ящик 2", location: "" }),
    box({ id: "prefix", name: "Ящик 3", location: "" }),
    box({ id: "exact", name: "Ящик 4", location: "" }),
  ];
  const items = [
    rec({ containerId: "note", name: "Щось", note: "кабель тут" }),
    rec({ containerId: "tag", name: "Зарядка", tags: ["кабель"] }),
    rec({ containerId: "prefix", name: "Кабель USB" }),
    rec({ containerId: "exact", name: "Кабель" }),
  ];
  assert.deepEqual(selectContainers(boxes, "кабель", { items }).map((m) => m.container.id),
    ["exact", "prefix", "tag", "box", "note"]);
  const two = [box({ id: "x", name: "A", location: "" }), box({ id: "y", name: "B", location: "" })];
  const same = [rec({ containerId: "x", name: "Кабель" }), rec({ containerId: "y", name: "Кабель" })];
  assert.deepEqual(selectContainers(two, "кабель", { items: same, openCounts: { y: 3 } }).map((m) => m.container.id), ["y", "x"]);
});

test("збіг за назвою місця з дерева показує коробки цього місця", () => {
  const places = [place("r", "Спальня"), place("f", "Шафа", "r", "furniture")];
  const boxes = [box({ id: "a", location: "", placeId: "f" }), box({ id: "b", location: "" })];
  assert.deepEqual(selectContainers(boxes, "спальня", { items: [], places }).map((m) => m.container.id), ["a"]);
});

test("location ріжеться за →, потім /, потім ,", () => {
  assert.deepEqual(splitLocation("Спальня → Шафа, верхня"), ["Спальня", "Шафа, верхня"]);
  assert.deepEqual(splitLocation(" Гараж / Стелаж / Полиця 2 "), ["Гараж", "Стелаж", "Полиця 2"]);
  assert.deepEqual(splitLocation("Кухня, шафка"), ["Кухня", "шафка"]);
  assert.deepEqual(splitLocation("Балкон"), ["Балкон"]);
  assert.deepEqual(splitLocation("  "), []);
  assert.deepEqual(splitLocation("a //  / b"), ["a", "b"]);
});

test("похідний id місця однаковий на двох пристроях і ≤64 символів", () => {
  assert.equal(placeIdForPath(["Спальня", "Шафа"]), placeIdForPath([" спальня", "ШАФА "]));
  const long = placeIdForPath(["Дуже довга назва кімнати на першому поверсі", "Шафа-купе з дзеркалом біля вікна", "Полиця"]);
  assert.ok(long.length <= 64, long);
  assert.ok(long.startsWith("place:"));
  assert.notEqual(long, placeIdForPath(["Дуже довга назва кімнати на першому поверсі", "Шафа-купе з дзеркалом біля вікна", "Полиця 2"]));
});

test("міграція місць: дерево з рядків, спільні предки, placeId на найглибше", () => {
  const boxes = [
    box({ id: "a", location: "Спальня / Шафа" }),
    box({ id: "b", location: "спальня / Комод" }),
    box({ id: "c", location: "" }),
    box({ id: "d", location: "Гараж", placeId: "already" }),
  ];
  const plan = planPlacesMigration(boxes, [], "T");
  assert.deepEqual(plan.places.map((p) => [p.name, p.kind, p.parentId]), [
    ["Спальня", "room", null],
    ["Шафа", "furniture", plan.places[0].id],
    ["Комод", "furniture", plan.places[0].id],
  ]);
  assert.deepEqual(plan.assignments, [
    { containerId: "a", placeId: plan.places[1].id },
    { containerId: "b", placeId: plan.places[2].id },
  ]);
  // Повтор на іншому пристрої з уже зміграваними місцями — нічого нового.
  const again = planPlacesMigration(boxes.slice(0, 2), plan.places, "T");
  assert.deepEqual(again.places, []);
  assert.equal(again.assignments.length, 2);
});

test("цикл у дереві місць не валить обхід — місця читаються як корені", () => {
  const places = [place("a", "A", "b"), place("b", "B", "a"), place("c", "C", "a"), place("d", "D", "ghost")];
  const parents = effectiveParents(places);
  assert.equal(parents.get("a") ?? null, null);
  assert.equal(parents.get("b"), null);
  assert.equal(parents.get("d"), null, "неіснуючий батько — корінь");
  assert.equal(parents.get("c"), "a");
  assert.deepEqual(placePath("c", places).map((p) => p.id), ["a", "c"]);
  const tree = buildPlaceTree(places);
  assert.deepEqual(tree.map((n) => n.place.id), ["a", "b", "d"]);
  assert.deepEqual(tree[0].children.map((n) => n.place.id), ["c"]);
});

test("глибина ≤4 і заборона циклу у формі", () => {
  const places = [place("1", "1"), place("2", "2", "1"), place("3", "3", "2"), place("4", "4", "3"), place("x", "X")];
  assert.equal(canPlaceUnder(null, "3", places), true);
  assert.equal(canPlaceUnder(null, "4", places), false, "п'ятий рівень");
  assert.equal(canPlaceUnder("1", "3", places), false, "батько — власний нащадок");
  assert.equal(canPlaceUnder("x", "3", places), true);
  const withChild = [...places, place("y", "Y", "x")];
  assert.equal(canPlaceUnder("x", "3", withChild), false, "піддерево не влазить");
  assert.equal(canPlaceUnder("x", null, places), true);
});

test("видалення місця перевішує дітей і коробки на батька", () => {
  const places = [place("r", "Спальня"), place("f", "Шафа", "r"), place("s", "Полиця", "f")];
  const boxes = [box({ id: "a", placeId: "f", location: "Спальня → Шафа" })];
  const plan = planPlaceDelete("f", places, boxes);
  assert.deepEqual(plan.places.map((p) => [p.id, p.parentId]), [["s", "r"]]);
  assert.deepEqual(plan.containers.map((c) => [c.id, c.placeId, c.location]), [["a", "r", "Спальня"]]);
});

test("перейменоване місце робить location коробки застарілим", () => {
  const places = [place("r", "Спальня нова")];
  const stale = staleLocations([box({ id: "a", placeId: "r", location: "Спальня" }), box({ id: "b", location: "X" })], places);
  assert.deepEqual(stale.map((c) => [c.id, c.location]), [["a", "Спальня нова"]]);
  assert.equal(placePathLabel("r", places), "Спальня нова");
});

test("відмінювання лічильника речей", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(itemsLabelUk), [
    "1 річ", "2 речі", "4 речі", "5 речей", "11 речей", "12 речей", "14 речей",
    "21 річ", "22 речі", "25 речей", "101 річ", "111 речей",
  ]);
});

test("статус: супутні поля живуть лише у своєму статусі", () => {
  const lent = withStatus(rec(), "lent", "T1", " Петро ");
  assert.equal(lent.lentTo, "Петро");
  assert.equal(lent.lentAt, "T1");
  const back = withStatus(lent, "in_box", "T2");
  assert.equal(back.lentTo, undefined);
  assert.equal(back.lentAt, undefined);
  const gone = withStatus(lent, "discarded", "T3");
  assert.equal(gone.discardedAt, "T3");
  assert.equal(gone.lentTo, undefined);
  assert.deepEqual(containerStats([lent, back, gone, rec({ qty: 4 })]), { count: 3, units: 6, lent: 1, discarded: 1 });
});

test("фото: не більше трьох, обкладинка першою, розмір стиснення", () => {
  let ids: string[] = [];
  for (const id of ["a", "b", "c", "d"]) ids = withPhoto(ids, id);
  assert.equal(ids.length, MAX_PHOTOS);
  assert.deepEqual(asCover(["a", "b", "c"], "c"), ["c", "a", "b"]);
  assert.deepEqual(fitWithin(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test("QR: слаг — 10 символів Crockford, ручне введення прощає плутанину", () => {
  let seed = 0;
  const bytes = (n: number) => Uint8Array.from({ length: n }, () => (seed += 7) & 255);
  const slug = generateQrSlug(bytes);
  assert.match(slug, /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal(normalizeQrSlug("7k3m9-qx2td"), "7K3M9QX2TD");
  assert.equal(normalizeQrSlug("ABCDE FGHIO"), "ABCDEFGH10", "I→1, O→0");
  assert.equal(normalizeQrSlug("ABCDEFGHU1"), null, "U не з алфавіту");
  assert.equal(normalizeQrSlug("short"), null);
  const taken = new Set([slug]);
  seed = 0;
  assert.notEqual(generateQrSlug(bytes, taken), slug, "зайнятий слаг не повертається");
});

test("QR: три форми вмісту і чужий код", () => {
  const url = buildQrUrl("https://flowi.example.com/", "ws 1", "7K3M9QX2TD");
  assert.equal(url, "https://flowi.example.com/c/ws%201/7K3M9QX2TD");
  assert.deepEqual(parseQrPayload(url), { kind: "flowi", workspaceId: "ws 1", slug: "7K3M9QX2TD" });
  assert.deepEqual(parseQrPayload("https://h.example/sub/c/w/7k3m9qx2td?x=1"), { kind: "flowi", workspaceId: "w", slug: "7K3M9QX2TD" });
  assert.deepEqual(parseQrPayload("ftrackingapp://c/w/7K3M9QX2TD"), { kind: "flowi", workspaceId: "w", slug: "7K3M9QX2TD" });
  assert.deepEqual(parseQrPayload(" 7K3M9QX2TD "), { kind: "flowi", workspaceId: null, slug: "7K3M9QX2TD" });
  assert.deepEqual(parseQrPayload("WIFI:S:home;P:secret;;"), { kind: "foreign", text: "WIFI:S:home;P:secret;;" });
  assert.equal(parseQrPayload("https://evil.example/c/w/nope").kind, "foreign");
  assert.equal(parseQrPayload("javascript://c/w/7K3M9QX2TD").kind, "foreign");
});

test("QR: локальний резолв — знайдено, інший workspace, не знайдено", () => {
  const boxes = [box({ id: "a", qrSlug: "7K3M9QX2TD" })];
  assert.equal(resolveQrScan(parseQrPayload("ftrackingapp://c/w/7K3M9QX2TD"), "w", boxes).status, "found");
  assert.deepEqual(resolveQrScan(parseQrPayload("ftrackingapp://c/other/7K3M9QX2TD"), "w", boxes),
    { status: "other_workspace", workspaceId: "other" });
  assert.equal(resolveQrScan(parseQrPayload("7K3M9QX2TE"), "w", boxes).status, "not_found");
  assert.equal(resolveQrScan(parseQrPayload("hello"), "w", boxes).status, "foreign");
});
