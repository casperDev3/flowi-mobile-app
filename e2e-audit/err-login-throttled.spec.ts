import { expect, test } from "@playwright/test";

import { connectWorkspace } from "./connect";

/**
 * Аудит: сервер відповів 429 (throttle 'auth' — 20/год на IP у проді,
 * flowi-server-app/flowi_server/settings.py), а app/login.tsx:118 має для
 * всього нерозпізнаного одну гілку — `setPasswordError(tr.authInvalidCreds)`.
 * Дивимось, що з цього бачить людина з ПРАВИЛЬНИМ паролем.
 */
test("429 на /auth/login/ показано як «Невірний email або пароль»", async ({ page }) => {
  await connectWorkspace(page);

  await page.route("**/api/auth/login/", route =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: '{"detail":"Request was throttled. Expected available in 3472 seconds."}',
    }),
  );

  await page.getByText(/Увійти/i).first().click();
  await page.waitForTimeout(900);
  const inputs = page.locator("input");
  await inputs.nth(0).fill("real.user@example.test");
  await inputs.nth(1).fill("CorrectHorse42!");
  await page.getByText(/Увійти/i).last().click();
  await page.waitForTimeout(1500);

  const body = await page.evaluate(() => document.body.innerText || "");
  console.log("AUDIT >>> екран після 429:\n" + body);
});
