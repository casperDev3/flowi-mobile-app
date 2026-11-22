/**
 * RC1 (2026-11-22): темна тема — нейтрально-сіра, суцільні поверхні, AA-текст.
 * Протокол і таблиці контрасту — docs/release-rc1/dark-theme.md.
 */
import { darkScale, finColors, financeDark, glass, overlay, theme } from '@/constants/theme';

function lum(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const SURFACES = { canvas: darkScale.canvas, card: darkScale.card, elevated: darkScale.elevated, hover: darkScale.hover };

describe('темна тема RC1', () => {
  test('кожен текстовий токен ≥ 4.5:1 на кожній поверхні', () => {
    const d = theme.dark;
    for (const [name, fg] of Object.entries({ primary: d.text.primary, secondary: d.text.secondary, muted: d.text.muted })) {
      for (const [sName, bg] of Object.entries(SURFACES)) {
        expect([name, sName, contrast(fg, bg) >= 4.5]).toEqual([name, sName, true]);
      }
    }
  });

  test('кроки яскравості поверхонь видимі (кожен наступний світліший)', () => {
    // CIE L*: до RC1 кроки canvas→card→elevated були 4.8 і 3.5; тепер ≥ 4.
    const lstar = (hex: string) => { const y = lum(hex); return y <= 216 / 24389 ? (y * 24389) / 27 : 116 * Math.cbrt(y) - 16; };
    const steps = [darkScale.canvas, darkScale.card, darkScale.elevated, darkScale.hover].map(lstar);
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBeGreaterThanOrEqual(4);
    expect(lstar(darkScale.border)).toBeGreaterThan(lstar(darkScale.hover));
    expect(lstar(darkScale.borderStrong)).toBeGreaterThan(lstar(darkScale.border));
    expect(contrast(darkScale.border, darkScale.card)).toBeGreaterThanOrEqual(1.35);
  });

  test('нейтральний сірий: канали RGB розходяться не більше ніж на 10', () => {
    for (const hex of Object.values(darkScale)) {
      const h = hex.replace('#', '');
      const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
      expect(Math.max(...ch) - Math.min(...ch)).toBeLessThanOrEqual(10);
    }
  });

  test('суцільні поверхні: без мешу, скло непрозоре, canvas один', () => {
    const g = glass.dark;
    expect(g.mesh.blobs).toHaveLength(0);
    expect(g.mesh.base).toBe(theme.dark.bg.canvas);
    expect(theme.dark.bg.canvas).toBe('#0E0E10');
    for (const c of [g.surface, g.surfaceStrong, g.surfaceSubtle, g.solid.card, g.solid.strong, g.solid.subtle, overlay.dark.solid, overlay.dark.fillNoBlur]) {
      expect(c).toMatch(/^#[0-9A-F]{6}$/i);
    }
    const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(overlay.dark.fill)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.94);
  });

  test('акценти й фінанси ≥ 3:1 на усіх поверхнях', () => {
    const accents = Object.values(glass.dark.accent).flatMap(a => [a.solid, a.fill, a.ink]);
    for (const fg of [...accents, financeDark.income, financeDark.expense]) {
      for (const bg of Object.values(SURFACES)) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3);
    }
    for (const bg of Object.values(SURFACES)) {
      expect(contrast(financeDark.income, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(financeDark.expenseInk, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('фінанси: світла тема без змін, темна — #0ECB81 / #F6465D', () => {
    expect(finColors(false)).toEqual({ income: theme.light.status.success, expense: theme.light.status.danger, expenseInk: theme.light.status.danger });
    expect(finColors(true).income).toBe('#0ECB81');
    expect(finColors(true).expense).toBe('#F6465D');
  });
});
