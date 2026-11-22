# rc1 · S3-03 — єдина політика deep link

Стан: код готовий, не закомічено. Домени й ID — з S3-01/02 (`identity-signing-domains.md`), тут не змінювались.

## 1. Правила (коротко)

1. **Один URL на все.** Будь-яке посилання, яке Flowi надсилає людям (email, push, копіювання), — це веб-URL `https://app.flowi.com.ua/...`. Якщо застосунок встановлено, ОС відкриває його (AASA / assetlinks для `/invite*` і `/app/*`). Якщо ні, той самий URL працює у браузері.
2. **Схема застосунку:** канонічна — `flowi://`, аліас — `ftrackingapp://`. Обидві розбираються скрізь: `utils/deepLinks.ts`, `utils/pushLink.ts`, `store/invite-link.ts`. Сервер мінтить `flowi://` у `deep_link` запрошень. Реєстр push (`core/notifications/registry.py`) і віджети поки шлють `ftrackingapp://`, і це працює через аліас.
3. **Навігацію за зовнішнім посиланням робить лише `app/+native-intent.tsx`.** Хук `use-incoming-invite-links` тепер тільки зберігає `pending_invite`. Раніше він ще й робив `router.push`, і одне посилання відкривало екран двічі.
4. **Кожна сторінка `/app/*` має мобільний відповідник.** Таблиця `WEB_TO_MOBILE_ROUTES` дублюється в спільній фікстурі. Невідомий шлях веде на найближчий батьківський маршрут без query, а якщо його нема — на «Сьогодні» (`/(tabs)/today`).
5. **Намір переживає вхід.**
   - **Веб:** `?next=` проходить `safeNextPath` (тільки шлях того самого origin).
   - **Мобільний:** `store/deep-link-intent.ts` (`pending_deep_link`, TTL 30 хв, одноразовий) → `/open-link`.
6. **Доступ перевіряється до відкриття, а не після.**
   - `/open-link` бере свіжий `GET /projects/` (офлайн — кеш).
   - Людина не учасник → `/no-access`. Ні назви, ні id, ні тексту цілі цей екран не показує.
   - Учасник, але зараз в іншому просторі проєкту → аркуш «Відкрити в просторі «B»?».

### Що таке «інший простір»

На сервері немає мультиворкспейсного членства, тобто списку серверів, де людина має акаунт. Зміна workspace (сервера) — це вихід зі стиранням локальних даних (`switchWorkspace`). Тому:

| «Простір» | Як визначається | Поведінка |
|---|---|---|
| **Простір проєкту** (`/app/p/<id>/…`, `flowi://project/<id>/…`) | `projectId` цілі проти `getActiveProjectId()` і проти списку членства | учасник + інший активний проєкт → аркуш «Відкрити в просторі B?» → відкрити; не учасник → «Немає доступу» |
| **Workspace / сервер** | лише посилання-запрошення несуть `ws=<origin>` | екрани `/invite`, `/menu-invite`, `/training-invite` мають власний switch-confirm (`app/invite.tsx`). Стара адреса `api.flowi.casperdev.site` канонізується в `api.flowi.com.ua` (`canonicalCloudOrigin`), тому «інший workspace» тут не виникає |

Посилання `/app/*` не несуть `ws`. Сервер будує їх від свого `WEB_APP_URL`, тому вони завжди про поточний workspace цього хоста.

## 2. Інвентар URL

### 2.1 Запрошення (сервер, URL-будівники цього етапу)

| Що | Веб-URL (`url`) | `deep_link` | Де будується |
|---|---|---|---|
| Проєкт (посилання/email) | `WEB_APP_URL/invite?ws=<origin>&p=<pid>&t=<token>` | `flowi://invite?ws=&p=&t=` | `core/invites.py::invite_link_urls` |
| Меню (за посиланням) | `WEB_APP_URL/invite/menu?ws=&t=` | `flowi://menu-invite?ws=&t=` | `core/menu_views.py::MenuInvitesView` |
| Меню (вже є акаунт, додано одразу) | `WEB_APP_URL/app/menu?space=<id>` (у листі) | — | там само |
| Група тренувань | `WEB_APP_URL/invite/training?ws=&g=&t=` | `flowi://training-invite?ws=&g=&t=` | `core/training_views.py` |

Усі три будівники тепер ідуть через `core/invites.py::web_app_url()`. Кінцевий `/` у `WEB_APP_URL` прибирається, тож посилань виду `//invite` більше нема; раніше їх давав training. `ws` береться з хоста запиту (`_current_origin`). Якщо запрошення створив N-1-клієнт на старому хості, у `ws` буде старий origin, і клієнти канонізують його самі (§1).

### 2.2 Інші веб-URL сервера (не змінювались)

| Що | URL | Де |
|---|---|---|
| Проєкт після додавання учасника (лист) | `WEB_APP_URL/app/p/<pid>/overview` | `core/team_views.py` |
| Звернення (Telegram-кнопка) | `WEB_APP_URL/app/inbox?open=<id>` | `core/operations/telegram.py` |
| Листи сповіщень | `WEB_APP_URL` + `web_link` події | `core/notifications/channels/email.py` |
| `web_url` у `GET /api/workspace/` | `WEB_APP_URL` | `core/workspace_views.py` |

### 2.3 Push / центр сповіщень (`registry.py` `deep_link`, схема `ftrackingapp://`)

| Форма | Мобільний маршрут (`utils/pushLink.ts::deepLinkRoute`) |
|---|---|
| `project/<pid>` | `/project/<pid>/overview` |
| `project/<pid>/task/<id>` | `/project/<pid>/tasks?open=<id>` |
| `project/<pid>/meeting/<id>` | `/project/<pid>/calendar?open=<id>` |
| `project/<pid>/discussions?discussion=<id>` | `/project/<pid>/discussions?discussion=<id>` |
| `project/<pid>/sprint/<id>` | `/project/<pid>/sprints?sprint=<id>` |
| `project/<pid>/workload` | `/project/<pid>/workload` |
| `task/<id>` | `/(tabs)?open=<id>` (з `project_id` у payload — картка в проєкті) |
| `meeting/<id>` | `/calendar?open=<id>` |
| `invites?invite=<id>` | `/invites?invite=<id>` |
| `menu?space=<id>` | `/menu?space=<id>` |
| `subscriptions` / `finance` / `workouts` / `health` | `/subscriptions` / `/(tabs)/explore` / `/workouts` / `/(tabs)/health` |
| `feedback?open=<id>`, `ideas` | `/feedback?open=<id>`, `/feedback` |
| `admin/...` | `/admin-workspace` |
| `training/<g>[/program|member|quest|log/<id>|leaderboard]`, `training/session/<id>` | `/training/...` |
| `registration` (expo_push) | `null` → без навігації (як і раніше) |

Тап по push навігує через `store/push.ts → notificationRoute`, а не через native-intent. Ті самі форми, що приходять як системне посилання, `+native-intent` веде через `/open-link`, тобто з перевіркою доступу.

### 2.4 Посилання, які native-intent пропускає без змін

`ftrackingapp:///…` (віджети: `/time`, `/explore?create=1`, `/calendar?create=meeting`, `/?create=1`), `…/notes?capture=1` (швидкий запис), `ftrackingapp://integrations/google?gcal=…` (повернення з Google OAuth), `ftrackingapp://c/<ws>/<slug>` (QR коробки), посилання з чужих хостів і dev-client `exp+…://`.

### 2.5 Таблиця веб → мобільний

Джерело правди — `flowi-web-app/lib/__fixtures__/deeplinks.json` (`routes`). Побайтова копія лежить у `flowi-mobile-app/__tests__/fixtures/deeplinks-web.json`. Неочевидні рядки:

| Веб | Мобільний | Чому |
|---|---|---|
| `/app` | `/(tabs)/today` | корінь кабінету = «Сьогодні» |
| `/app/tasks` | `/(tabs)` | таб «Завдання» — це `index` |
| `/app/finance` | `/(tabs)/explore` | |
| `/app/meetings` | `/calendar` | `/meetings` на мобільному — редирект |
| `/app/ideas` | `/feedback` | один екран «Ідеї та баги» |
| `/app/inbox` | `/admin-workspace` | «Вхідні ідеї та баги» команди, як `admin/inbox` реєстру |
| `/app/admin`, `/app/admin/inbox`, `/app/admin-workspace/analytics` | `/admin-workspace` | аналітики на мобільному нема |
| `/app/agent` | `/(tabs)/today` | екрана на мобільному нема |
| `/app/p/<id>` | `/project/<id>/overview` | |
| `/app/p/<id>/board`, `/list`, `/timeline` | `/project/<id>/tasks` | вигляди одного екрана «Завдання» |
| `/app/p/<id>/feedback` | `/project/<id>/overview` | екрана нема |
| `/app/training/<g>/members/<u>` | `/training/<g>/member/<u>` | однина на мобільному |
| `/app/training/<g>/programs/<p>` | `/training/<g>/program/<p>` | |
| `/app/training/<g>/activity`, `/settings` | `/training/<g>` | |
| `/app/menu/join`, `/app/training/join` | `/menu-invite`, `/training-invite` | це запрошення: без перевірки членства |
| `/app/notifications/verify-email` | `/settings-notifications` | |

Статичний сегмент сильніший за `[param]`, тому `/app/training/join` не потрапляє в `/app/training/[groupId]`.

Імена параметрів вебу й мобільного (`QUERY_ALIASES`): `web_link` сервера несуть `?task=` і `?meeting=`, а мобільні екрани відкривають картку за `?open=`. Тому перейменовуються `task→open` для `/(tabs)` і `/project/[id]/tasks` (зокрема з `board`), а `meeting→open` для `/calendar` і `/project/[id]/calendar`. Інші параметри передаються як є.

`web_link` на сторінки, яких у вебі нема (`/app/p/<id>/team`, `/app/admin/requests`), ведуть на батьківський маршрут: Огляд проєкту і `/admin-workspace`.

Посилання `flowi://project/<id>/<розділ>` на розділ, якого не знає реєстр (`notes`, `time` і т.п., так відкриває Maestro), ведуть прямо в цей розділ, а не на Огляд.

## 3. Збереження наміру крізь вхід

### Веб

| Крок | Що відбувається |
|---|---|
| Гість на `/app/…` | `app/app/layout.tsx` → `/login?next=<path+query>` (`loginHrefWithNext`) |
| Без workspace | `useRequireWorkspace` → `/workspace?next=<path+query>`. Query тепер теж передається, інакше внутрішній `next` губився |
| `/workspace` | `next` → `safeNextPath`. Раніше значення йшло в `router.replace` без жодної перевірки — це був open redirect |
| `/login` успіх | Пріоритет: pending-запрошення в проєкт → меню → тренування → **`?next=`** → список запрошень `/app/invites` → `/app` |
| `/login`, уже authed | `?next=` або `/app` |

`safeNextPath` пропускає лише рядок, що починається з одного `/`. Відкидає: `//…` і `/\…`, будь-який `\`, `/%2F…`, `/%5C…`, керівні символи, пробіли по краях, абсолютні URL, `javascript:`. Остання перевірка: `new URL(next, base).origin === base`. Сторінки `/login`, `/register`, `/forgot-password`, `/workspace` ціллю після входу не стають (`postLoginTarget`), щоб не було петлі.

### Мобільний

| Крок | Що відбувається |
|---|---|
| Посилання прийшло (холодний старт чи живий застосунок) | `+native-intent`: `setDeepLinkIntent()` (пам'ять + `pending_deep_link`) → `/open-link` |
| Нема workspace / гість | `AuthGate` → `/workspace` або `/welcome`. Намір лишається |
| Вхід | `login.tsx`: намір є → `/open-link`, нема → `/(tabs)` |
| Реєстрація / інший шлях до сесії | `DeepLinkIntentResume` (app/_layout.tsx): authed у цій сесії + намір + не на екрані входу чи запрошення → `/open-link` |
| `/open-link` | `takeDeepLinkIntent()` (одноразово) → рішення доступу → ціль / аркуш / `/no-access` |

Захисти: TTL 30 хв. Маршрут зі сховища ще раз проходить `isSafeInternalRoute`, ті самі правила, що веб `safeNextPath`, перевірено тією самою фікстурою. Намір нічого не дозволяє: збережений до виходу чи зміни workspace, він однаково перевіряється в новому акаунті.

## 4. Матриця очікуваної поведінки

Скорочення: **A** — застосунок встановлено (iOS/Android, verified links), **W** — застосунку нема (браузер). Сесія: **in** / **out**. Workspace/простір: **same** — той самий workspace і (для проєктів) учасник; **other-m** — учасник, але зараз в іншому просторі проєкту (для запрошень: інший workspace-сервер); **non-m** — не учасник.

| # | URL | Інст. | Сесія | Простір | Очікувано |
|---|---|---|---|---|---|
| 1 | `/app/p/P/tasks?open=T` | A | in | same | Застосунок → картка задачі T у просторі P |
| 2 | ″ | A | in | other-m (зараз у проєкті Q) | Аркуш «Відкрити в просторі «P»?» → «Відкрити» → картка; «Скасувати» → назад у Q |
| 3 | ″ | A | in | non-m | «Немає доступу», без назви проєкту і задачі; «На головну» → Сьогодні |
| 4 | ″ | A | out | будь-який | Вхід → після входу `/open-link` → як у 1/2/3 |
| 5 | ″ | A | out, нема workspace | — | `/workspace` → вхід → `/open-link` |
| 6 | ″ | W | in | same | Веб відкриває сторінку |
| 7 | ″ | W | in | non-m | Веб: «Проєкт не знайдено» (гейт `app/app/p/[id]/layout.tsx`), без даних |
| 8 | ″ | W | out | будь-який | `/login?next=…` → після входу та сама сторінка (далі як 6/7) |
| 9 | `/app/p/P/brand-new` (невідома) | A | in | same | `/project/P/overview` (батько) |
| 10 | `/app/brand-new` | A | in | — | Сьогодні |
| 11 | `/app/tasks?open=T` (особиста) | A | in | будь-який | Таб «Завдання», картка T |
| 12 | `/invite?ws=WS&p=P&t=TOK` | A | in | same | Екран запрошення: прев'ю → «Приєднатися» |
| 13 | ″ | A | in | other-m (інший сервер) | Екран запрошення: «Перейти в інший workspace?» → вихід → вхід → прев'ю |
| 14 | ″ | A | out | same | Прев'ю → «Увійти» → після входу автоприєднання (`PendingInviteAutoJoin`) |
| 15 | ″, `ws=https://api.flowi.casperdev.site` | A | in | same (новий хост) | `ws` канонізується в `+native-intent` (`utils/deepLinks.ts`) ще до екрана: перемикання не пропонується |
| 16 | ″ | W | out | — | Веб `/invite` → вхід → приєднання (pending-invite) |
| 17 | `/invite/menu?ws=&t=` | A | in/out | — | `/menu-invite` (одна навігація, не дві) |
| 18 | `/invite/training?ws=&g=&t=` | A | in/out | — | `/training-invite` → `/training/invite` |
| 19 | `flowi://project/P/task/T` / `ftrackingapp://…` | A | in | як 1–3 | Як 1–3 (через `/open-link`) |
| 20 | Push «task.assigned» (тап) | A | in | same | Картка задачі в P (`notificationRoute`) |
| 21 | Віджет `ftrackingapp:///time` | A | in | — | Екран «Час», без `/open-link` |
| 22 | `https://app.flowi.com.ua/login?next=//evil.example` | W | out | — | Після входу `/app`, а не evil |
| 23 | `/workspace?next=https://evil.example` | W | — | — | Після вибору → `/login`, а не evil |
| 24 | `https://api.flowi.casperdev.site/app/p/P` | W | — | — | Caddy 301 → `https://app.flowi.com.ua/app/p/P` → як 6/8 |

## 5. Перевірка на пристрої (власник / QA)

Передумова: DNS і Caddy для `app.flowi.com.ua` живі, AASA і assetlinks віддаються з 200 (кроки 7 і 16 `identity-signing-domains.md`). Без цього verified links не спрацюють, і пункти з «A» перевіряються лише через схему.

1. **iOS, verified links.** У Notes на пристрої вставити посилання з рядків 1, 12, 17, 18 і натиснути. Має відкритися застосунок, а не Safari. Довге натискання → «Відкрити у Flowi».
2. **Android:** `adb shell pm get-app-links app.flowi.mobile` → `app.flowi.com.ua: verified`. Далі `adb shell am start -a android.intent.action.VIEW -d "https://app.flowi.com.ua/app/p/P/tasks?open=T"`.
3. **Схема:** `xcrun simctl openurl booted "flowi://project/P/task/T"`, `adb shell am start -d "ftrackingapp://invite?ws=…&p=…&t=…"`.
4. **Холодний старт гостем:** вбити застосунок, вийти з акаунта, відкрити посилання з рядка 1 → вхід → має відкритися задача (рядок 4).
5. **Non-member (рядок 3):** акаунт B без доступу до проєкту P → «Немає доступу». На екрані не має бути назви проєкту.
6. **Інший простір (рядок 2):** зайти в проєкт Q, відкрити посилання на P → аркуш.
7. **Веб `next`:** у приватному вікні відкрити `/app/notes?x=1` → `/login?next=%2Fapp%2Fnotes%3Fx%3D1` → увійти → `/app/notes?x=1`. Те саме з `next=//evil.example` має привести на `/app`.

## 6. Тести

| Де | Команда | Що покриває |
|---|---|---|
| web | `node --test lib/deep-links.test.mjs` | `safeNextPath` (19 рядків фікстури), `postLoginTarget`, `loginHrefWithNext` → `nextFromSearch` (повний цикл), повнота таблиці проти `app/app/**/page.tsx` в обидва боки, побайтова рівність фікстур |
| mobile | `npx jest __tests__/deep-links.test.ts __tests__/invite-link.test.ts __tests__/push-link.test.ts` | таблиця == фікстура, кожна ціль існує в `app/`, усі `cases` (зокрема legacy `ws`, `?task=`→`?open=`), ті самі правила безпечного шляху, обидві схеми, +native-intent для кожного виду, TTL, одноразовість, битий маршрут зі сховища, переживання «перезапуску», рішення доступу |
| server | `.venv/bin/python manage.py test core.test_rc1_deeplinks core.test_invites_pending core.test_training core.test_menu` | хост `WEB_APP_URL` (з кінцевим `/`), `flowi://` у трьох будівниках, однаковий query у `url` і `deep_link` |

**Нова сторінка кабінету = рядок у `lib/__fixtures__/deeplinks.json` + копія фікстури в мобільний + рядок у `WEB_TO_MOBILE_ROUTES`.** Інакше впаде тест у вебі або в мобільному.

### Легасі-хост у мобільному (rc1-polish)

`api.flowi.casperdev.site` — той самий прод-сервер, що й `api.flowi.com.ua`. `store/api-config.ts::canonicalCloudOrigin` і `LEGACY_CLOUD_ORIGINS` тепер підключені:

- `store/workspace.ts::normalizeWorkspaceOrigin` канонізує origin, тому всі порівняння «той самий workspace?» (`app/invite.tsx`, меню- й тренувальні інвайти, екран адреси, `switchWorkspace`) бачать старе посилання з `ws=https://api.flowi.casperdev.site` як поточний простір. Перемикання й виходу немає.
- `store/invite-link.ts` канонізує `ws`, а `PendingInviteAutoJoin` (`app/_layout.tsx`) канонізує `pending_invite`, збережений старою збіркою.
- `loadWorkspaceConfig` на старті переписує збережений `workspace_config` зі старим origin (`origin`, `apiBase`, `wsBase`) на новий хост. `workspaceId`, токени в SecureStore, `data_owner` і локальні дані лишаються як були (`migrateLegacyWorkspaceConfig`).
- `store/push.ts`: черга `push_pending_unregister`, записана на старому хості, порівнюється за канонічною адресою.
- Тести: `__tests__/workspace.test.ts` («легасі-адреса Flowi Cloud»).

## 7. Відкриті питання

- **Веб, legacy origin у pending-запрошеннях.** `lib/pending-invite.ts::getPendingInviteFor` і `lib/workspace.ts::isSameWorkspaceOrigin` не канонізують `api.flowi.casperdev.site` → `api.flowi.com.ua` (це не мої файли). Посилання N-1-клієнта на новому вебі запропонує «інший workspace».
- **Реєстр push** (`registry.py`) і віджети ще шлють `ftrackingapp://`. Аліас це покриває; перейти на `flowi://` можна після вікна N-1.
- **Веб `/register`** не передає `?next=` далі. Після реєстрації людина потрапляє на `/app`.
- **`deep_link` тренувань** («Копіювати для застосунку» на вебі) тепер `flowi://`, тож старий застосунок (`com.casper3.*`) його не відкриє. Посилання `url` працює в обох.
- **QR коробок** (`/c/<ws>/<slug>`) не входять у associated domains (`/invite*`, `/app/*`). На пристрої з застосунком такий https-QR відкриється в браузері. Якщо треба, додати `/c/*` в AASA, assetlinks і `app.json`.
- **Членство в проєкті.** Онлайн рішення приймається лише за свіжим `GET /projects/`, і відкликаний доступ дає «Немає доступу». Офлайн рішення приймається за кешем `workspace_projects` ∪ локальних `projects`: щойно відкликаний доступ може пропустити до екрана проєкту, але нових даних сервер не віддасть, а layout вичистить проєкт на першому 403/404. Онлайн-посилання на власний проєкт, який ще не вивантажено на сервер, покаже «Немає доступу».
- **Workspace-сервер для `/app/*`:** посилання `ws` не несуть, а «учасник іншого сервера» до входу на клієнті не визначити. Детальніше в §1.
