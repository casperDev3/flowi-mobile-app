import { expect, test } from "@playwright/test";

const SERVER = "http://127.0.0.1:8000";

function audit(page: any) {
  return page.evaluate(() => {
    const cyrText: string[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walk.nextNode())) {
      const t = (n.textContent || "").trim();
      if (t && /[Ѐ-ӿ]/.test(t)) cyrText.push(t.slice(0, 90));
    }
    const cyrAttrs: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[aria-label],[placeholder],[title]")) as HTMLElement[]) {
      for (const a of ["aria-label", "placeholder", "title"]) {
        const v = el.getAttribute(a);
        if (v && /[Ѐ-ӿ]/.test(v)) cyrAttrs.push(`[${a}]="${v}"`);
      }
    }
    const clipped: any[] = [];
    for (const el of Array.from(document.querySelectorAll("*")) as HTMLElement[]) {
      if (el.children.length > 0) continue;
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== "visible") {
        clipped.push({ t: t.slice(0, 50), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    return {
      body: document.body.innerText.replace(/\n+/g, " | ").slice(0, 700),
      cyrText: Array.from(new Set(cyrText)),
      cyrAttrs: Array.from(new Set(cyrAttrs)),
      clipped,
      docScrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
}

test("EN: workspace → welcome → login → register → forgot", async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem("lang_option_v1", JSON.stringify("en")); } catch {}
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  console.log("=== /workspace ===", JSON.stringify(await audit(page), null, 1));

  await page.locator("input").first().fill(SERVER);
  await page.getByText(/^Check$/i).first().click();
  await page.waitForTimeout(1500);
  console.log("=== workspace checked ===", JSON.stringify(await audit(page), null, 1));

  const cont = page.getByText(/Continue/i).first();
  if (await cont.count()) { await cont.click(); await page.waitForTimeout(1500); }
  console.log("=== after continue ===", page.url(), JSON.stringify(await audit(page), null, 1));

  for (const path of ["/login", "/register", "/forgot-password", "/welcome"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    console.log(`=== ${path} (${page.url()}) ===`, JSON.stringify(await audit(page), null, 1));
  }
  expect(true).toBe(true);
});
