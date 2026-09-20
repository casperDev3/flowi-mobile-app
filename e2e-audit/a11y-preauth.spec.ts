import { test, expect, type Page } from "@playwright/test";
import { connectWorkspace } from "./connect";

/**
 * e2e-audit/a11y-preauth.spec.ts — спостережний прогін доступності
 * на екранах ДО авторизації (react-native-web рендер тієї ж кодової бази).
 *
 * Нічого не править: лише рахує кнопки без доступного імені та
 * контраст реально відрендереного тексту на його реальному тлі.
 */

async function namelessButtons(page: Page) {
  return page.evaluate(() => {
    const out: { tag: string; role: string; html: string }[] = [];
    const nodes = Array.from(
      document.querySelectorAll('[role="button"], button, [tabindex="0"]'),
    );
    for (const el of nodes) {
      const h = el as HTMLElement;
      const label =
        h.getAttribute("aria-label") ||
        h.getAttribute("title") ||
        (h.innerText || "").trim();
      if (!label) {
        out.push({
          tag: h.tagName,
          role: h.getAttribute("role") || "",
          html: h.outerHTML.slice(0, 200),
        });
      }
    }
    return out;
  });
}

async function lowContrastText(page: Page) {
  return page.evaluate(() => {
    function parse(c: string): [number, number, number, number] {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const p = m[1].split(",").map((x) => parseFloat(x));
      return [p[0], p[1], p[2], p[3] === undefined ? 1 : p[3]];
    }
    function lum(r: number, g: number, b: number) {
      const a = [r, g, b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }
    function bgOf(el: HTMLElement): [number, number, number] {
      let n: HTMLElement | null = el;
      while (n) {
        const [r, g, b, a] = parse(getComputedStyle(n).backgroundColor);
        if (a > 0.9) return [r, g, b];
        n = n.parentElement;
      }
      return [255, 255, 255];
    }
    const out: { text: string; color: string; ratio: number; size: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<HTMLElement>();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const t = (node.textContent || "").trim();
      if (!t) continue;
      const el = node.parentElement as HTMLElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const [fr, fg, fb, fa] = parse(cs.color);
      const [br, bg2, bb] = bgOf(el);
      const cr = fr * fa + br * (1 - fa);
      const cg = fg * fa + bg2 * (1 - fa);
      const cb = fb * fa + bb * (1 - fa);
      const l1 = lum(cr, cg, cb);
      const l2 = lum(br, bg2, bb);
      const ratio =
        (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) {
        out.push({ text: t.slice(0, 40), color: cs.color, ratio: +ratio.toFixed(2), size });
      }
    }
    return out;
  });
}

test("a11y: workspace + login + register", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const report: string[] = [];

  const snap = async (name: string) => {
    const nb = await namelessButtons(page);
    const lc = await lowContrastText(page);
    report.push(`\n### ${name}`);
    report.push(`nameless interactive: ${nb.length}`);
    nb.slice(0, 8).forEach((b) => report.push(`  - ${b.tag}[${b.role}] ${b.html}`));
    report.push(`low contrast text: ${lc.length}`);
    lc.slice(0, 15).forEach((x) =>
      report.push(`  - ${x.ratio}:1 "${x.text}" ${x.color} ${x.size}px`),
    );
  };

  await snap("workspace");

  await connectWorkspace(page);
  await snap("welcome/login-entry");

  // до реєстрації
  const reg = page.getByText(/Зареєструва/i).first();
  if (await reg.count()) {
    await reg.click();
    await page.waitForTimeout(800);
    await snap("register");
  }

  console.log(report.join("\n"));
  expect(true).toBe(true);
});
