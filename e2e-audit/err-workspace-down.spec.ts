import { expect, test } from "@playwright/test";

/**
 * e2e-audit/err-workspace-down.spec.ts — аудит: що бачить людина, коли САМЕ
 * ТОЙ workspace, який вона ввела правильно, тимчасово недоступний.
 *
 * store/workspace.ts:154 `if (!res.ok) throw new Error('not_workspace')`
 * зводить БУДЬ-ЯКИЙ не-2xx (502/503 від nginx, 429 від throttle 'workspace'
 * 60/хв на IP) до тієї самої причини, що й «адреса не від Flowi». Перевіряємо,
 * який текст із цього виходить.
 */
test("503 від справжнього workspace показано як «це не Flowi workspace»", async ({ page }) => {
  await page.route("**/api/workspace/", route =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Service Unavailable"}' }),
  );

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Адреса workspace")).toBeVisible();
  await page.locator("input").first().fill("http://127.0.0.1:8000");
  await page.getByText("Перевірити", { exact: false }).first().click();
  await page.waitForTimeout(1500);

  const body = await page.evaluate(() => document.body.innerText || "");
  console.log("AUDIT >>> екран після 503:\n" + body);
  expect(body).toContain("Це не Flowi workspace");
});
