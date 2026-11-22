#!/usr/bin/env node
/**
 * scripts/dark-contrast.mjs — WCAG 2.x contrast tables for the dark theme (RC1).
 *
 * Prints Markdown tables (before → after) used in docs/release-rc1/dark-theme.md:
 * every text token on every surface, accents/finance on surfaces, borders, and
 * rgba tints composited over the surface they sit on.
 *
 *   node scripts/dark-contrast.mjs            # Markdown to stdout
 *   node scripts/dark-contrast.mjs --check    # exit 1 if any AFTER text < 4.5 or accent < 3
 *
 * Values are copied from constants/theme.ts (darkScale, glassDark.accent,
 * financeDark) and flowi-web-app/app/globals.css dark blocks — keep in sync.
 */

const BEFORE = {
  surfaces: { canvas: '#0B0B0D', card: '#17171A', elevated: '#1E1E22', subtle: '#202024' },
  text: { primary: '#F4F4F5', secondary: '#A1A1AA', muted: '#6B6B73' },
  borders: { hairline: '#2A2A2F' },
  finance: { income: '#30D158', expense: '#FF453A', 'expense-ink': '#FF6961' },
};

const AFTER = {
  surfaces: { canvas: '#0E0E10', card: '#1A1A1D', elevated: '#232327', hover: '#2C2C31' },
  text: { primary: '#F2F2F3', secondary: '#B9B9BF', muted: '#93939B' },
  borders: { hairline: '#34343A', strong: '#45454C', control: '#6D6D6D' },
  finance: { income: '#0ECB81', expense: '#F6465D', 'expense-ink': '#FF6B7D' },
};

/** Accents (unchanged in RC1): web --ds-* and mobile glass.dark.accent roles. */
const ACCENTS = {
  'lime (web+mob)': '#CDEB3A',
  'amber (web+mob)': '#F2B135',
  'lavender (web+mob, focus)': '#B8A4F8',
  'lavender-ink (web)': '#C4B4FF',
  'coral (web fill)': '#E8543F',
  'coral-ink (web) / coral (mob)': '#FF8A75',
  'info (web)': '#6A90FA',
  'info-ink (web)': '#8FADFF',
  'info (mob)': '#8FAEFF',
  'success (web)': '#2FBF6C',
  'success-ink (web)': '#4ED68A',
  'success (mob)': '#4CD787',
  'danger (web+mob)': '#EF6450',
};

/** Tinted washes (rgba) — composited over card before measuring the ink on them. */
const TINTS = [
  { name: 'lime tint + lime ink', tint: [205, 235, 58, 0.2], ink: '#CDEB3A' },
  { name: 'amber tint + amber ink', tint: [242, 177, 53, 0.2], ink: '#F2B135' },
  { name: 'lavender tint + lavender-ink', tint: [184, 164, 248, 0.24], ink: '#C4B4FF' },
  { name: 'coral tint + coral-ink', tint: [232, 84, 63, 0.2], ink: '#FF8A75' },
  { name: 'info tint + info-ink', tint: [106, 144, 250, 0.22], ink: '#8FADFF' },
  { name: 'success tint + success-ink', tint: [47, 191, 108, 0.2], ink: '#4ED68A' },
  { name: 'income tint + income', tint: [14, 203, 129, 0.16], ink: '#0ECB81' },
  { name: 'expense tint + expense-ink', tint: [246, 70, 93, 0.18], ink: '#FF6B7D' },
  { name: 'glass hover (white 7%) + secondary', tint: [255, 255, 255, 0.07], ink: '#B9B9BF' },
];

const ch = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const lin = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = hex => { const [r, g, b] = ch(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const lstar = hex => { const y = lum(hex); return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16; };
const over = ([r, g, b, a], bg) => toHex(ch(bg).map((v, i) => [r, g, b][i] * a + v * (1 - a)));
const f = n => n.toFixed(2);
const mark = (n, min) => `${f(n)}${n >= min ? '' : ' ✗'}`;

const out = [];
const failures = [];

function surfaceRow(set) {
  const names = Object.keys(set.surfaces);
  return { names, vals: names.map(n => set.surfaces[n]) };
}

out.push('### Surfaces (CIE L* and step to previous)\n');
for (const [label, set] of [['before', BEFORE], ['after', AFTER]]) {
  const { names, vals } = surfaceRow(set);
  out.push(`**${label}:** ` + names.map((n, i) => `${n} \`${vals[i]}\` L*${lstar(vals[i]).toFixed(1)}` + (i ? ` (ΔL* ${(lstar(vals[i]) - lstar(vals[i - 1])).toFixed(1)}, ${f(ratio(vals[i], vals[i - 1]))}:1)` : '')).join(' → '));
  out.push('');
}

for (const [label, set, min] of [['before', BEFORE, 4.5], ['after', AFTER, 4.5]]) {
  const { names, vals } = surfaceRow(set);
  out.push(`### Text on surfaces — ${label} (AA ≥ 4.5)\n`);
  out.push(`| token | ${names.map((n, i) => `${n} \`${vals[i]}\``).join(' | ')} |`);
  out.push(`|---|${names.map(() => '---:').join('|')}|`);
  for (const [t, hex] of Object.entries(set.text)) {
    const cells = vals.map(bg => ratio(hex, bg));
    if (label === 'after') cells.forEach((c, i) => c < min && failures.push(`text ${t} on ${names[i]} ${f(c)}`));
    out.push(`| ${t} \`${hex}\` | ${cells.map(c => mark(c, min)).join(' | ')} |`);
  }
  out.push('');
}

for (const [label, set] of [['before', BEFORE], ['after', AFTER]]) {
  const { names, vals } = surfaceRow(set);
  out.push(`### Borders — ${label} (informational; 1.4.11 does not require card borders ≥ 3:1)\n`);
  out.push(`| border | ${names.join(' | ')} |`);
  out.push(`|---|${names.map(() => '---:').join('|')}|`);
  for (const [b, hex] of Object.entries(set.borders)) out.push(`| ${b} \`${hex}\` | ${vals.map(bg => f(ratio(hex, bg))).join(' | ')} |`);
  out.push('');
}

{
  const { names, vals } = surfaceRow(AFTER);
  out.push('### Accents on surfaces — after (non-text ≥ 3:1; ✗ = below)\n');
  out.push(`| accent | ${names.join(' | ')} |`);
  out.push(`|---|${names.map(() => '---:').join('|')}|`);
  for (const [a, hex] of Object.entries(ACCENTS)) {
    const cells = vals.map(bg => ratio(hex, bg));
    cells.forEach((c, i) => c < 3 && failures.push(`accent ${a} on ${names[i]} ${f(c)}`));
    out.push(`| ${a} \`${hex}\` | ${cells.map(c => mark(c, 3)).join(' | ')} |`);
  }
  out.push('');
  out.push('### Finance colours — before → after (amount text needs 4.5)\n');
  out.push(`| token | before on card \`${BEFORE.surfaces.card}\` | ${names.map(n => `after on ${n}`).join(' | ')} |`);
  out.push(`|---|---:|${names.map(() => '---:').join('|')}|`);
  for (const k of Object.keys(AFTER.finance)) {
    const min = k === 'expense' ? 3 : 4.5;
    const cells = vals.map(bg => ratio(AFTER.finance[k], bg));
    cells.forEach((c, i) => c < min && failures.push(`finance ${k} on ${names[i]} ${f(c)}`));
    out.push(`| ${k} \`${BEFORE.finance[k]}\` → \`${AFTER.finance[k]}\` | ${f(ratio(BEFORE.finance[k], BEFORE.surfaces.card))} | ${cells.map(c => mark(c, min)).join(' | ')} |`);
  }
  out.push('');
  out.push('### Tinted washes composited over card / elevated — after\n');
  out.push('| wash + foreground | over card | ratio | over elevated | ratio |');
  out.push('|---|---|---:|---|---:|');
  for (const t of TINTS) {
    const c1 = over(t.tint, AFTER.surfaces.card), c2 = over(t.tint, AFTER.surfaces.elevated);
    const r1 = ratio(t.ink, c1), r2 = ratio(t.ink, c2);
    [r1, r2].forEach(r => r < 4.5 && failures.push(`tint ${t.name} ${f(r)}`));
    out.push(`| ${t.name} | \`${c1}\` | ${mark(r1, 4.5)} | \`${c2}\` | ${mark(r2, 4.5)} |`);
  }
  out.push('');
  out.push('### On-fill text — after\n');
  out.push('| pair | ratio |');
  out.push('|---|---:|');
  for (const [n, fg, bg] of [
    ['text.onAction `#111113` on action.primary `#F4F4F5`', '#111113', '#F4F4F5'],
    ['text.onAccent `#111113` on lime', '#111113', '#CDEB3A'],
    ['text.onAccent `#111113` on coral-ink (mob solid)', '#111113', '#FF8A75'],
    ['`#111113` on income `#0ECB81`', '#111113', '#0ECB81'],
    ['`#111113` on expense `#F6465D`', '#111113', '#F6465D'],
    ['white on expense `#F6465D` (avoid)', '#FFFFFF', '#F6465D'],
    ['featured text `#F2F2F3` on `#2C2C31`', '#F2F2F3', '#2C2C31'],
    ['featured secondary `#C7C7CC` on `#2C2C31`', '#C7C7CC', '#2C2C31'],
    ['high-contrast secondary `#D4D4D8` on card', '#D4D4D8', AFTER.surfaces.card],
  ]) out.push(`| ${n} | ${f(ratio(fg, bg))} |`);
  out.push('');
}

process.stdout.write(out.join('\n') + '\n');
if (process.argv.includes('--check') && failures.length) {
  console.error('FAIL:\n' + failures.join('\n'));
  process.exit(1);
}
