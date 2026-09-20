import { expect, test } from "@playwright/test";
import { enterApp } from "./connect";

test("оснастка: вхід у додаток працює", async ({ page }) => {
  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await enterApp(page, "smoke");
  const text = await page.evaluate(() => document.body.innerText || "");
  console.log("URL:", page.url().replace("http://127.0.0.1:8081", ""));
  console.log("ЕКРАН:", text.slice(0, 260).replace(/\n+/g, " | "));
  console.log("pageErrors:", errs.slice(0, 3));
  expect(errs).toEqual([]);
});
