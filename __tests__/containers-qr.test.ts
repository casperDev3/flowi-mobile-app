/**
 * __tests__/containers-qr.test.ts — генератор QR і HTML наліпок. ДОСЛІВНИЙ
 * ПОРТ flowi-web-app/lib/containers-qr.test.mjs із ТИМИ САМИМИ еталонними
 * відбитками: наліпка з телефона й з вебу мусить бути однаковою модуль у модуль.
 */

import assert from 'node:assert/strict';

import { fnv1a, LABEL_PRESETS, sheetMargins } from '@/utils/containers';
import { buildLabelSheetHtml, escapeHtml, groupSlug, type LabelInput } from '@/utils/containersLabels';
import { encodeQr, qrSvgPath, utf8Bytes, type QrMatrix } from '@/utils/containersQr';

const fingerprint = (qr: QrMatrix) => fnv1a(qr.modules.map((row) => row.map((cell) => (cell ? 1 : 0)).join("")).join("\n"));

// Еталони звірено декодером zbarimg (zbar 0.23): обидві матриці читаються
// рівно у вхідний текст. Зміна відбитка = зміна кожної надрукованої наліпки.
test("QR: еталонні матриці не змінюються", () => {
  const url = "https://app.flowi.casperdev.site/c/8f2c7a1e-5b3d-4c9a-9e21-0d6b4c2f1a77/7K3M9QX2TD";
  const qr = encodeQr(url);
  assert.equal(qr.size, 37, "версія 5");
  assert.equal(fingerprint(qr), "9858b491");
  const big = encodeQr("q".repeat(213));
  assert.equal(big.size, 57, "версія 10 — межа");
  assert.equal(fingerprint(big), "8eb6f19e");
});

test("QR: шукачі в трьох кутах і темний модуль", () => {
  const qr = encodeQr("ftrackingapp://c/w/7K3M9QX2TD");
  const n = qr.size;
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    assert.equal(qr.modules[y][x], true);
    assert.equal(qr.modules[y + 1][x + 1], false);
    assert.equal(qr.modules[y + 3][x + 3], true);
  }
  assert.equal(qr.modules[n - 8][8], true, "обов'язковий темний модуль");
});

test("QR: занадто довгий текст — помилка, а не тихо обрізаний код", () => {
  assert.throws(() => encodeQr("x".repeat(214)));
});

test("QR: UTF-8 без TextEncoder", () => {
  assert.deepEqual(utf8Bytes("Aї🧥"), [...new TextEncoder().encode("Aї🧥")]);
});

test("QR: SVG-шлях склеює горизонтальні серії", () => {
  const path = qrSvgPath({ size: 3, modules: [[true, true, false], [false, false, false], [true, false, true]] }, 1);
  assert.equal(path, "M1 1h2v1h-2zM1 3h1v1h-1zM3 3h1v1h-1z");
});

test("наліпки: пресети вміщаються в A4", () => {
  for (const preset of Object.values(LABEL_PRESETS)) {
    const m = sheetMargins(preset);
    assert.ok(m.left * 2 + preset.columns * preset.width <= 210.001, preset.id);
    assert.ok(m.top * 2 + preset.rows * preset.height <= 297.001, preset.id);
  }
  assert.equal(LABEL_PRESETS.small.columns * LABEL_PRESETS.small.rows, 65);
  assert.equal(LABEL_PRESETS.medium.columns * LABEL_PRESETS.medium.rows, 24);
  assert.equal(LABEL_PRESETS.large.columns * LABEL_PRESETS.large.rows, 8);
});

test("наліпки: HTML екранує назви, друкує слаг і колір, ділить на аркуші", () => {
  const label = (i: number): LabelInput => ({
    slug: "7K3M9QX2TD", url: `https://x/c/w/7K3M9QX2T${i % 10}`,
    name: `<b>Коробка</b> ${i}`, place: "Спальня → Шафа", color: "#10B981", countLabel: "5 речей",
  });
  const html = buildLabelSheetHtml(Array.from({ length: 9 }, (_, i) => label(i)), "large", { title: "Наліпки" });
  assert.match(html, /@page \{ size: A4; margin: 0; \}/);
  assert.equal((html.match(/<section class="sheet">/g) ?? []).length, 2, "8 на аркуш → 2 аркуші");
  assert.ok(!html.includes("<b>Коробка</b>"), "назва екранована");
  assert.ok(html.includes("&lt;b&gt;Коробка&lt;/b&gt;"));
  assert.ok(html.includes("7K3M9 QX2TD"));
  assert.ok(html.includes("border-left-color:#10B981"));
  assert.ok(html.includes("5 речей"));
  const small = buildLabelSheetHtml([label(1)], "small");
  assert.ok(!small.includes("Коробка"), "мала наліпка — лише QR і слаг");
  const evil = buildLabelSheetHtml([{ ...label(1), color: "red;background:url(x)" }], "medium");
  assert.ok(!evil.includes("url(x)"), "колір — лише hex");
  assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
  assert.equal(groupSlug("ABCDEFGHJK"), "ABCDE FGHJK");
});
