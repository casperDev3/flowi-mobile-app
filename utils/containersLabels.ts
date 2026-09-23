/**
 * utils/containersLabels.ts — HTML аркуша QR-наліпок (flowi-web-app/docs/specs/containers.md §6.3).
 *
 * ДОСЛІВНИЙ ПОРТ flowi-web-app/components/containers/labels.ts: веб друкує
 * цей HTML через iframe, телефон рендерить його в PDF через `expo-print`.
 * Один генератор — інакше наліпки почали б розходитись у розмірах.
 *
 * Розміри — у мм, сітка — CSS Grid, `@page { size: A4; margin: 0 }`.
 * QR малюємо самі (containersQr.ts): без мережі й без чужих сервісів.
 */

import { encodeQr, qrSvgPath } from "./containersQr";
import { LABEL_PRESETS, sheetMargins, type LabelPresetId } from "./containers";

export interface LabelInput {
  slug: string;
  /** Що закодовано в QR — повний URL наліпки. */
  url: string;
  name: string;
  place: string;
  /** hex; кольорова смужка — щоб наліпку впізнавали без сканування. */
  color: string;
  /** Готовий підпис лічильника («12 речей») — мова на боці викликача. */
  countLabel?: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** «7K3M9QX2TD» → «7K3M9 QX2TD»: так слаг легше переписати руками. */
export function groupSlug(slug: string): string {
  return slug.length === 10 ? `${slug.slice(0, 5)} ${slug.slice(5)}` : slug;
}

function safeColor(color: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : "#F97316";
}

function labelHtml(label: LabelInput, presetId: LabelPresetId): string {
  const preset = LABEL_PRESETS[presetId];
  const qr = encodeQr(label.url);
  const border = 1;
  const side = qr.size + border * 2;
  const svg =
    `<svg class="qr" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" aria-hidden="true">` +
    `<rect width="${side}" height="${side}" fill="#fff"/><path d="${qrSvgPath(qr, border)}" fill="#000"/></svg>`;
  const lines: string[] = [];
  if (preset.showName && label.name) lines.push(`<div class="name">${escapeHtml(label.name)}</div>`);
  if (preset.showPlace && label.place) lines.push(`<div class="place">${escapeHtml(label.place)}</div>`);
  if (preset.showCount && label.countLabel) lines.push(`<div class="count">${escapeHtml(label.countLabel)}</div>`);
  lines.push(`<div class="slug">${escapeHtml(groupSlug(label.slug))}</div>`);
  return (
    `<div class="label" style="border-left-color:${safeColor(label.color)}">` +
    `${svg}<div class="text">${lines.join("")}</div></div>`
  );
}

/**
 * Повний HTML-документ аркуша(ів). Наліпок більше, ніж уміщає аркуш, —
 * наступні аркуші з розривом сторінки.
 */
export function buildLabelSheetHtml(
  labels: readonly LabelInput[],
  presetId: LabelPresetId,
  options: { title?: string; lang?: string } = {},
): string {
  const preset = LABEL_PRESETS[presetId];
  const margins = sheetMargins(preset);
  const perSheet = preset.columns * preset.rows;
  const sheets: string[] = [];
  for (let i = 0; i < labels.length; i += perSheet) {
    const chunk = labels.slice(i, i + perSheet).map((label) => labelHtml(label, presetId)).join("");
    sheets.push(`<section class="sheet">${chunk}</section>`);
  }
  if (!sheets.length) sheets.push(`<section class="sheet"></section>`);

  const qrSize = Math.min(preset.height - 3, preset.width * 0.55);
  const nameSize = presetId === "large" ? 14 : 9;
  const smallSize = presetId === "large" ? 10 : 7;

  const css = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #111;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { width: 210mm; height: 297mm; padding: ${margins.top}mm ${margins.left}mm;
  display: grid; grid-template-columns: repeat(${preset.columns}, ${preset.width}mm);
  grid-auto-rows: ${preset.height}mm; overflow: hidden; break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.label { width: ${preset.width}mm; height: ${preset.height}mm; display: flex; align-items: center;
  gap: 1.5mm; padding: 1.5mm 2mm 1.5mm 1.5mm; overflow: hidden; border-left: 2mm solid #F97316; }
.qr { width: ${qrSize}mm; height: ${qrSize}mm; flex: none; }
.text { min-width: 0; display: flex; flex-direction: column; gap: 0.8mm; }
.name { font-size: ${nameSize}pt; font-weight: 700; line-height: 1.15; overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.place, .count { font-size: ${smallSize}pt; color: #444; line-height: 1.2; overflow: hidden;
  white-space: nowrap; text-overflow: ellipsis; }
.slug { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: ${smallSize}pt;
  letter-spacing: 0.3pt; color: #222; }
@media screen {
  body { background: #e5e7eb; padding: 8mm 0; }
  .sheet { background: #fff; margin: 0 auto 8mm; box-shadow: 0 1px 4px rgba(0,0,0,.2); }
  .label { outline: 0.2mm dashed #d1d5db; outline-offset: -0.2mm; }
}`;

  return (
    `<!DOCTYPE html><html lang="${escapeHtml(options.lang ?? "uk")}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(options.title ?? "QR")}</title><style>${css}</style></head>` +
    `<body>${sheets.join("")}</body></html>`
  );
}
