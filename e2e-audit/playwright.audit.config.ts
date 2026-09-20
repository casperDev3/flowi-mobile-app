import { defineConfig, devices } from "@playwright/test";

/**
 * e2e-audit/playwright.audit.config.ts — оснастка аудиту МОБІЛЬНОГО додатка.
 *
 * Додаток ганяється через react-native-web (`npm run web`, порт 8081): та сама
 * кодова база, той самий expo-router, ті самі екрани. Це НЕ заміна пристрою —
 * нативні модулі (SF Symbols, HealthKit, нотифікації, haptics) на вебі або
 * відсутні, або підмінені, і жести працюють інакше. Але логіка навігації,
 * компонування, i18n, порожні стани, контраст і робота форм — ті самі, і саме
 * вони становлять більшість поверхні аудиту.
 *
 * Сервер тут НЕ піднімається: expo вже працює назовні, і кожен паралельний
 * агент, що спробував би підняти свій, бився б за порт 8081.
 */
const SIZES = {
  se: { width: 375, height: 667 },      // найвужчий актуальний iPhone
  pro: { width: 393, height: 852 },     // типовий сучасний iPhone
};

const projects = [];
for (const engine of ["chromium", "webkit"] as const) {
  for (const [sizeName, viewport] of Object.entries(SIZES)) {
    for (const scheme of ["light", "dark"] as const) {
      projects.push({
        name: `${engine}-${sizeName}-${scheme}`,
        use: {
          ...devices[engine === "chromium" ? "Desktop Chrome" : "Desktop Safari"],
          viewport,
          colorScheme: scheme,
          isMobile: false,   // react-native-web і так рендерить мобільне компонування
          hasTouch: true,
        },
      });
    }
  }
}

export default defineConfig({
  testDir: ".",
  outputDir: "../.artifacts/rn-audit/_runs",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8081",
    locale: "uk-UA",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  projects,
});
