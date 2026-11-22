# rc1 — перевірка flowi-mobile-app (2026-11-22)

Прогін після паралельних агентів S3-01…S3-09 на `release/rc1`, без коміту.

## Команди і результат

| Крок | Команда | Результат |
|---|---|---|
| Типи | `npx tsc --noEmit` | 0 помилок |
| Лінт | `npm run lint` | чисто |
| Тести | `npx jest` | 266/266 наборів, 3514/3514 тестів |
| Номер збірки | `npm run build-number:check` | узгоджено (1.4.0 / 2611221) |
| Контраст dark | `node scripts/dark-contrast.mjs --check` | OK |

## Виправлено під час перевірки

- `__tests__/notification-device.test.ts` — тест чекав старий контракт (`kind:'expo'`).
  Після rc1 `store/push.ts` спершу реєструє нативний токен (`getDevicePushTokenAsync`),
  тож мок доповнено `getDevicePushTokenAsync`/`addPushTokenListener`, а перший тест
  чекає `kind:'apns'`. Запасний шлях Expo → `/push/tokens/` (сервер без модуля, 404)
  лишився покритим.
- Перші прогони `project-metrics` (бюджет 120 мс) і `finance-feed-perf` падали лише
  під навантаженням (одночасно з tsc/lint). Окремо і в повторному повному прогоні
  вони проходять. Якщо CI знову їх зловить, запускайте з `--runInBand`.
- Стара прод-адреса в прозі оновлена: `CLAUDE.md` (правило аудиту),
  `memory/architecture.md`, `memory/server-api.md`, коментар у `e2e-native/flows/00-onboarding.yaml`.

## Залишки `com.casper3` / `casperdev` / `f-tracking-app` (свідомо)

| Де | Чому лишається |
|---|---|
| `store/api-config.ts` `LEGACY_CLOUD_ORIGINS`, `utils/deepLinks.ts` | аліас старого хоста: invite `ws=` → api.flowi.com.ua |
| `app/update-required.tsx`, `__tests__/rc1-update-required.test.ts` | визначає стару збірку com.casper3.* і показує «Встановіть новий Flowi» |
| `modules/flowi-android/**` `com.casper3.flowi.surfaces` | Kotlin namespace бібліотеки, не applicationId; дії broadcast внутрішні і узгоджені |
| `app.json` `slug: f-tracking-app`, `package.json` `name` | внутрішні імена; slug пов'язаний з EAS projectId (запасний Expo-токен), зміна його розірве |
| `__tests__/invite-link.test.ts`, `workspace.test.ts`, `containers-qr.test.ts`, `deep-links.test.ts` | перевіряють розбір старих посилань (N-1) |
| `scripts/owner-setup-wizard.sh` | ALLOWED_HOSTS і curl-перевірки старого хоста (проксі/301) |
| `docs/plans`, `docs/reviews`, `docs/specs`, `docs/AUDIT_RUNBOOK.md`, `docs/S2-reporting.md` | історичні документи |
| `docs/release-rc1/*` | таблиці «було → стало» |

`noreply@flowi.app` — 0 входжень. Локальні `ios/` і `android/` (gitignored) —
0 входжень `com.casper3.ftrackingapp` / `com.casper3.f-tracking-app` / `group.com.casper3`.

## Не перевірено тут (потрібен пристрій або прод)

Нативні збірки Xcode/Gradle, пуші, universal links і AASA/assetlinks на живому
домені — див. матриці в `identity-signing-domains.md`, `push.md`, `deeplinks.md`.
