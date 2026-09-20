import { test } from "@playwright/test";

/**
 * e2e-audit/layout-preauth.spec.ts — вимір КОМПОНУВАННЯ на 375/393 pt.
 *
 * Лише екрани ДО авторизації: далі падає SecureStore.
 * Нічого не правимо — тільки міряємо і друкуємо.
 */

const SERVER = "http://127.0.0.1:8000";

async function measure(page: any, label: string) {
  const res = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: any = { vw, vh, overflowX: [], clipped: [], docScrollW: 0, docScrollH: 0, belowFold: [] };
    const se = document.scrollingElement || document.documentElement;
    out.docScrollW = se.scrollWidth;
    out.docScrollH = se.scrollHeight;
    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      // 1. вилазить за правий/лівий край вікна
      if (r.right > vw + 1 || r.left < -1) {
        out.overflowX.push({
          tag: el.tagName, cls: (el.className || "").toString().slice(0, 60),
          left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
          text: (el.textContent || "").trim().slice(0, 50),
        });
      }
      // 2. текст обрізано еліпсисом
      if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow === "ellipsis") {
        out.clipped.push({ text: (el.textContent || "").trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth });
      }
      // 3. інтерактивне нижче згину
      const role = el.getAttribute("role") || "";
      const tabbable = el.tabIndex >= 0;
      if ((role === "button" || role === "link" || el.tagName === "INPUT" || tabbable) && r.top > vh) {
        out.belowFold.push({ tag: el.tagName, role, top: Math.round(r.top), text: (el.textContent || "").trim().slice(0, 40) });
      }
    }
    return out;
  });
  console.log(`\n===== ${label} =====`);
  console.log(`viewport ${res.vw}x${res.vh}  doc ${res.docScrollW}x${res.docScrollH}` + (res.docScrollW > res.vw ? "  <<< ГОРИЗОНТАЛЬНИЙ СКРОЛ" : ""));
  if (res.overflowX.length) { console.log("ВИЛІЗЛО ЗА КРАЙ:"); res.overflowX.slice(0, 15).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
  if (res.clipped.length) { console.log("ОБРІЗАНИЙ ТЕКСТ:"); res.clipped.slice(0, 20).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
  if (res.belowFold.length) { console.log("НИЖЧЕ ЗГИНУ (без скролу?):"); res.belowFold.slice(0, 12).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
}

test("компонування: екрани до авторизації", async ({ page }) => {
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 160)));

  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await measure(page, "workspace (порожній)");

  // довга адреса — перевіряємо, чи не розпирає поле
  const inp = page.locator("input").first();
  await inp.fill("http://very-long-workspace-hostname.example.internal.corp:8000/path");
  await page.waitForTimeout(300);
  await measure(page, "workspace (довга адреса)");

  await inp.fill(SERVER);
  await page.getByText("Перевірити", { exact: false }).first().click();
  await page.waitForTimeout(2000);
  await measure(page, "workspace (перевірено)");

  await page.getByText("Продовжити", { exact: false }).first().click();
  await page.waitForTimeout(1500);
  await measure(page, "welcome/login");
  console.log("URL:", page.url());
  console.log("TEXT:", (await page.evaluate(() => document.body.innerText || "")).slice(0, 400).replace(/\n+/g, " | "));
});
