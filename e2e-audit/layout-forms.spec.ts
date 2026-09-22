import { test } from "@playwright/test";

const SERVER = "http://127.0.0.1:8000";

async function measure(page: any, label: string) {
  const res = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const out: any = { vw, vh, overflow: [], clipped: [], scrollers: [] };
    const all = Array.from(document.querySelectorAll("*")) as HTMLElement[];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      if (r.right > vw + 1 || r.left < -1)
        out.overflow.push({ tag: el.tagName, l: Math.round(r.left), rt: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40) });
      if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow === "ellipsis")
        out.clipped.push({ text: (el.textContent || "").trim().slice(0, 70), sw: el.scrollWidth, cw: el.clientWidth });
      // контейнери, що мають ПРИХОВАНЕ переповнення по вертикалі й НЕ скролять
      if (el.scrollHeight > el.clientHeight + 2 && cs.overflowY === "hidden" && el.clientHeight > 40)
        out.scrollers.push({ tag: el.tagName, sh: el.scrollHeight, ch: el.clientHeight, text: (el.textContent || "").trim().slice(0, 60) });
      // контейнери зі скролом по вертикалі (щоб знати, що скрол Є)
    }
    const se = document.scrollingElement || document.documentElement;
    out.doc = `${se.scrollWidth}x${se.scrollHeight}`;
    return out;
  });
  console.log(`\n===== ${label} ===== vp ${res.vw}x${res.vh} doc ${res.doc}`);
  if (res.overflow.length) { console.log(" ВИЛІЗЛО:"); res.overflow.slice(0, 12).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
  if (res.clipped.length) { console.log(" ОБРІЗАНО ЕЛІПСИСОМ:"); res.clipped.slice(0, 20).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
  if (res.scrollers.length) { console.log(" ПЕРЕПОВНЕНО БЕЗ СКРОЛУ (overflow:hidden):"); res.scrollers.slice(0, 12).forEach((o: any) => console.log("  ", JSON.stringify(o))); }
}

test("компонування: форми входу/реєстрації", async ({ page }) => {
  page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 160)));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.locator("input").first().fill(SERVER);
  await page.getByText("Перевірити", { exact: false }).first().click();
  await page.waitForTimeout(2000);
  await page.getByText("Продовжити", { exact: false }).first().click();
  await page.waitForTimeout(1200);

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await measure(page, "login (порожній)");
  const li = page.locator("input");
  await li.nth(0).fill("oleksandr.kovalenko-dovgyi-email@subdomain.example.internal.test");
  await li.nth(1).fill("SuperLongPassword2026!!!");
  await page.waitForTimeout(400);
  await measure(page, "login (довга пошта)");

  await page.goto("/register", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await measure(page, "register (порожній)");
  const ri = page.locator("input");
  const n = await ri.count();
  console.log("register inputs:", n);
  await ri.nth(0).fill("Олександр Володимирович Коваленко-Дорошенко");
  await ri.nth(1).fill("oleksandr.kovalenko-dovgyi-email@subdomain.example.internal.test");
  await ri.nth(2).fill("SuperLongPassword2026!!!");
  if (n >= 4) await ri.nth(3).fill("Different!");
  await page.waitForTimeout(500);
  await measure(page, "register (заповнений + помилка пароля)");
  // чи видно кнопку сабміту?
  const btn = page.getByText(/Зареєструва/i).last();
  const box = await btn.boundingBox();
  console.log("кнопка Зареєструватись box:", JSON.stringify(box), " vh=", await page.evaluate(() => window.innerHeight));

  await page.goto("/forgot-password", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await measure(page, "forgot-password");
  console.log("TEXT:", (await page.evaluate(() => document.body.innerText || "")).slice(0, 300).replace(/\n+/g, " | "));
});
