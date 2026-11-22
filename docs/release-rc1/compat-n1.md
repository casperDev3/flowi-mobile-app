# rc1 — сумісність N-1 (S3-04)

Стан на 2026-11-22. Код: сервер `core/client_version.py`, `core/middleware.py`,
`core/workspace_views.py` (`store_urls`); мобільний `store/api-config.ts`,
`store/api.ts`, `store/workspace.ts`, `app/update-required.tsx`, `app/_layout.tsx`.
Тести: `core/test_rc1_compat.py`, `__tests__/rc1-update-required.test.ts`.

## 1. Що змінилось

- `426 client_outdated` для мобільного клієнта тепер несе `store_url` (для ОС із
  заголовка `X-Flowi-Client: mobile/<semver> (ios|android)`) і `store_urls`
  `{ios, android}`. Поля адитивні — N-1 клієнт читає лише `code`/`min_version`.
- `GET /api/workspace/` (винятковий, без 426) віддає `store_urls`.
- Джерело посилань — env сервера `FLOWI_IOS_STORE_URL` / `FLOWI_ANDROID_STORE_URL`
  (порожньо до публікації). Fallback у застосунку: `expo.extra.storeUrls` →
  `EXPO_PUBLIC_FLOWI_{IOS,ANDROID}_STORE_URL`. Приймаються лише `https://`.
- Мобільний 1.4.0: будь-яка `update_app`/`update_app_to` несумісність веде на
  екран `/update-required` («Оновіть застосунок»; для збірки не під
  `app.flowi.mobile` — «Встановіть новий Flowi») з кнопкою стору, «Перевірити
  ще раз» і «Змінити адресу workspace». `update_server`/`workspace_changed` —
  як і раніше, на `/workspace`.

## 2. Матриця

| Клієнт | API rc1, `min_mobile=1.1.0` (до релізу) | API rc1, `min_mobile=1.4.0` (після) | Старий API (до rc1) |
|---|---|---|---|
| Легасі без заголовка (≤1.0.x) | 200 | 200 (не блокується ніколи) | 200 |
| N-1 mobile 1.3.x, `com.casper3.*` | 200 | 426 + `store_url` нового застосунку; старий клієнт показує свій рядок «Оновіть до 1.4.0» на `/workspace` | 200 |
| Поточний mobile 1.4.0, `app.flowi.mobile` | 200 | 200 | 200; `store_urls` відсутні → екран без кнопки (fallback extra/env) |
| Web (свій `min_web_version`) | 200 | 200 (mobile-мінімум не впливає) | 200 |
| Нерозпізнаний заголовок | 200 | 200 | 200 |

Легасі дані:

| Дані | Поведінка |
|---|---|
| `ui_preferences` без `shareAnonymousStats` | згода = так (сервер, веб, мобільний) |
| `ProjectInvite` до міграції `core.0031` | `delivery_status='unknown'`, `delivery_error=''`, `delivery_attempted_at=null` |
| N-1 клієнт і нові поля запрошення (`delivery_*`) | ігнорує (адитивні поля) |
| Аналітика | подій до розгортання немає; звірка показує різницю — очікувано |

Виняткові шляхи без 426: `/api/workspace/`, `/api/health/`, `/api/auth/*`,
`/api/inbox/`, `/api/feedback/callback/`.

## 3. Порядок розгортання (server → web → mobile)

1. **Server**: `migrate` (`core.0031`, `analytics.0001` — лише ADD COLUMN з
   дефолтом і нова таблиця, без блокувань даних). Env: `FLOWI_IOS_STORE_URL`,
   `FLOWI_ANDROID_STORE_URL` (коли є записи сторів), блок пошти (email.md).
   `MIN_MOBILE_VERSION` **не чіпати** — лишається 1.1.0.
   Перевірка: `curl -s https://api.flowi.com.ua/api/workspace/ | jq .store_urls`.
2. **Web**: деплой; перевірити `/app/settings` (картка «Статистика») і
   `/app/admin-workspace/analytics` під адміном.
3. **Mobile 1.4.0**: TestFlight / internal track → прод у сторах.
4. **Лише після** того, як 1.4.0 доступна в обох сторах і переважна частина
   активних пристроїв оновилась (дивитись `X-Flowi-Client` у логах / аналітиці
   `platform`): власник піднімає мінімум через
   `PATCH /api/admin/workspace/ {"min_mobile_version":"1.4.0"}` (або веб-адмінка).
   Рядок `WorkspaceSettings` — джерело істини; env `MIN_MOBILE_VERSION` лише
   насіює першу інсталяцію.

## 4. Відкат

- Mobile-мінімум підняли зарано → `PATCH min_mobile_version` назад на `1.1.0`;
  1.3.x розблоковується на наступному запиті, екран 1.4.0 сам повертається в
  застосунок (кнопка «Перевірити ще раз» або фонова перевірка).
- Server rc1 відкат коду: міграції відкочувати не обов'язково (нові колонки з
  дефолтами старий код ігнорує; таблицю `analytics_analyticsevent` — теж).
  Якщо треба: `migrate analytics zero` і `migrate core 0030`.
- Web — попередній деплой; поле `shareAnonymousStats` старий веб зберігає
  (невідомі поля ui_preferences не стираються).

## 5. Ручна перевірка (пристрій)

| # | Крок | Очікування |
|---|---|---|
| 1 | Staging: `min_mobile_version=9.0.0`, 1.4.0 на iPhone | одразу/після першого запиту — «Оновіть застосунок», кнопка «Відкрити App Store» веде на `FLOWI_IOS_STORE_URL` |
| 2 | Те саме на Android | «Відкрити Google Play» |
| 3 | Env store URL порожні | екран без кнопки, «Знайдіть Flowi у магазині» |
| 4 | Повернути `1.1.0`, «Перевірити ще раз» | повертає в застосунок |
| 5 | N-1 1.3.x при `1.4.0` | старий екран workspace з «Оновіть до 1.4.0», дані на сервері цілі |
| 6 | Гість (вийшов) при `9.0.0` | теж екран оновлення, «Змінити адресу workspace» працює |
