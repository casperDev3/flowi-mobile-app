# План підвищення готовності Flowi (T2 → T3)

**Дата:** 2026-06-29
**Мета:** закрити quality-gate борг із `analysis/READINESS_AND_TIERS.md` (Gate A/B) — автотести, спостережуваність, CI, a11y — і підняти ключові модулі до RC (T3).

> Середовище агента не має `node_modules`, тож запуск (`tsc`/`jest`/`lint`) і встановлення пакетів — на машині розробника. Усі артефакти нижче **готові до запуску** після `npm install`.

---

## Фаза 1 — Тести (🔴 найбільший борг)
- `jest.config.js` (preset `jest-expo`) + devDeps (`jest-expo`, `jest`, `@types/jest`, `react-test-renderer`).
- Скрипти `test`, `test:watch`, `typecheck`.
- Unit-тести pure-utils (найризикованіший новий код):
  - `__tests__/dateUtils.test.ts`
  - `__tests__/healthUtils.test.ts` (TDEE/BMI/цілі/інсайти/агрегати)
  - `__tests__/preventionUtils.test.ts` (adherence/streak/parseTimes/report)
  - `__tests__/finance-task.test.ts` (filterByMonth/sort/overdue)

## Фаза 2 — Спостережуваність (🔴 сліпий запуск)
- `utils/reporting.ts` — `captureException`/`captureMessage` (no-op+dev-лог; готове до Sentry).
- `utils/analytics.ts` — `track(event, props)` (dev-консоль; готове до провайдера).
- Інтеграція `reporting` у `components/shared/ErrorBoundary.tsx`.

## Фаза 3 — CI + скрипти (🔴)
- `.github/workflows/ci.yml` — Node setup → `npm ci` → `typecheck` → `lint` → `test`.

## Фаза 4 — a11y (🟠) + доки
- `accessibilityLabel`/`accessibilityRole` для іконкових кнопок (хаб «Здоров'я», «Спільне»).
- Оновити `status.md` (gate-прогрес) + цей план (чек-лист).

---

## Чек-лист виконання
- [x] Ф1 jest-конфіг + скрипти (`typecheck`/`test`) + 4 тест-файли (date/health/prevention/finance-task)
- [x] Ф2 `utils/reporting.ts` + `utils/analytics.ts` + інтеграція в `ErrorBoundary` + `initReporting()` у `_layout`
- [x] Ф3 `.github/workflows/ci.yml` (typecheck · lint · test)
- [x] Ф4 a11y-мітки на ключових іконкових кнопках (хаб «Здоров'я» + «Спільне») + оновлення доків

**Залишок (потребує машини розробника / пакетів):** запуск gate-команд; реальний Sentry DSN + аналітика-провайдер; device-QA; a11y-сweep на решту екранів.

## Після цього (на машині розробника)
1. `npm install` → `npm run typecheck` → `npm run lint` → `npm test` (виправити, що спливе).
2. Device-QA за `testing/TEST_PLAN_SHARED_HEALTH.md`.
3. Підключити реальний Sentry DSN + аналітику-провайдер у scaffolds.
