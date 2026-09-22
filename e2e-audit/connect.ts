import { expect, type Page } from "@playwright/test";

/**
 * e2e-audit/connect.ts — вхід у додаток для аудиту.
 *
 * Заводимо ЖИВОГО користувача через реальний інтерфейс, а не підкладаємо
 * сховище: у мобільному токени живуть у SecureStore, а не в AsyncStorage
 * (store/auth.tsx), і на вебі це різні бекенди. Підкладене сховище дало б
 * стан, якого на пристрої не буває, і аудит перевіряв би вигадку.
 *
 * Шлях той самий, що й у людини: адреса workspace → перевірка → реєстрація.
 */
const SERVER = "http://127.0.0.1:8000";

export function freshEmail(prefix: string): string {
  return `rn-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.test`;
}

/** Крок 1: підключити workspace. Лишає застосунок на екрані входу. */
export async function connectWorkspace(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("Адреса workspace")).toBeVisible();
  await page.locator("input").first().fill(SERVER);
  await page.getByText("Перевірити", { exact: false }).first().click();
  await expect(page.getByText("Продовжити", { exact: false })).toBeVisible();
  await page.getByText("Продовжити", { exact: false }).first().click();
  await page.waitForTimeout(800);
}

/** Крок 2: зареєструвати свіжого користувача. Повертає його пошту. */
export async function registerFresh(page: Page, prefix: string): Promise<string> {
  const email = freshEmail(prefix);
  const body = await page.evaluate(() => document.body.innerText || "");
  if (!/Створіть акаунт|Ім.я/i.test(body)) {
    await page.getByText(/Зареєструва/i).first().click();
    await page.waitForTimeout(600);
  }
  const inputs = page.locator("input");
  const n = await inputs.count();
  /*
   * Порядок полів: ім'я (необов'язкове), email, пароль, повтор пароля.
   * Четверте поле обов'язкове — без нього форма лишається на «Паролі не
   * збігаються» і кнопка нічого не робить.
   */
  const pass = "FlowiAudit2026!";
  await inputs.nth(0).fill(`Audit ${prefix}`);
  await inputs.nth(1).fill(email);
  await inputs.nth(2).fill(pass);
  if (n >= 4) await inputs.nth(3).fill(pass);
  await page.getByText(/Зареєструва/i).last().click();
  await page.waitForTimeout(2500);
  return email;
}

/** Обидва кроки разом — типовий старт сценарію аудиту. */
export async function enterApp(page: Page, prefix: string): Promise<string> {
  await connectWorkspace(page);
  return registerFresh(page, prefix);
}
