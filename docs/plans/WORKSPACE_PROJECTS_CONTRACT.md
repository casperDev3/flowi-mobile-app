# Workspace + проєкти + команда — технічний контракт

Версія контракту: **workspace_protocol = 1**. Складено 2026-09-19 з реального коду
`flowi-server-app` (core/views.py, core/consumers.py, core/sync_contract.py,
accounts/*), `flowi-mobile-app` (store/api.ts, store/sync-engine.tsx,
store/synced-storage.ts, store/sync-contract.ts, store/auth.tsx) і
`flowi-web-app` (lib/config.ts, lib/api.ts, lib/data-context.tsx).

Реалізує §2, §3, §4 з `WORKSPACE_PROJECTS_PLAN.md`. Три репо реалізують цей
документ **паралельно й без узгоджень** — усе, що тут не сказано явно, не
вигадується; сумнівний випадок фіксується у `WORKSPACE_PROJECTS_STATUS.md`.

---

## 0. Загальні правила

### 0.1 База URL
- `origin` — те, що користувач ввів на екрані «Адреса workspace», нормалізоване
  (див. §2.2). `API = {origin}/api`, `WS` — поле `ws_url` з `/api/workspace/`.
- Усі шляхи нижче — відносно `API` (тобто `/workspace/` = `{origin}/api/workspace/`).

### 0.2 Авторизація
- Без змін: `Authorization: Bearer <access>` (simplejwt, access 7 діб, refresh 30,
  ротація + blacklist). Жодних cookie. WS — субпротокол `['flowi-jwt', <access>]`,
  як у наявному `ws/user/`.
- Позначки в таблицях: **public** — без токена; **auth** — будь-який
  автентифікований; **admin** — адмін workspace; **owner/member/viewer** — роль у проєкті.

### 0.3 Тіло помилки (усі НОВІ ендпоінти)
```json
{ "code": "snake_case_code", "detail": "Людський текст українською", "fields": { "email": ["..."] } }
```
`fields` — лише для 400 валідації. Наявні ендпоінти (`{"error": ...}`) не
переписуються — клієнтський `parseErrorBody` уже читає `code ?? error ?? detail`.

Загальні коди: `400 invalid_request`, `401` (стандарт simplejwt, клієнт робить
refresh), `403 forbidden`, `403 not_admin`, `403 not_a_member`,
`404 not_found`, `404 project_not_found`, `409 conflict`, `410 gone`,
`426 client_outdated`, `429 throttled` (DRF: `{"detail": "..."}` — клієнт
трактує будь-який 429 як «повторити пізніше»).

### 0.4 Заголовок версії клієнта
Нові клієнти надсилають на **кожен** запит:
`X-Flowi-Client: mobile/<semver> (<ios|android>)` або `web/<semver>`.
Сервер: якщо заголовок є і `<semver>` < `min_client_version[platform]` →
`426 {"code":"client_outdated","detail":"…","min_version":"1.1.0"}` на всіх
ендпоінтах, окрім `/workspace/`, `/health/`, `/auth/*`. Заголовка немає →
легасі-клієнт, пропускаємо (зворотна сумісність sync v2).

### 0.5 Ідентифікатори
- `user.id` у REST — **integer** (як наявний `user_data`). Усередині `data`
  записів синку (assigneeId, authorId, createdBy, mentions) — **рядок**
  десяткового числа (`"42"`). Клієнти нормалізують `String(id)`.
- `project.id` — рядок `^[A-Za-z0-9_.:-]{1,64}$`, глобально унікальний на сервері.
  Нові проєкти: клієнт генерує `p-<uuid4>`. Легасі id (`Date.now().toString()`)
  приймаються як є.
- Час у REST — ISO 8601 UTC (`2026-09-19T10:00:00Z`); у sync-відповідях
  `updated_at` лишається ms epoch (як у v2).

---

## 1. Сервер: нові моделі (довідково для server-репо)

```
accounts.UserProfile(user 1:1 PK, is_workspace_admin bool=False,
                     projects_migrated_at datetime|null)
core.WorkspaceSettings(singleton pk=1, id uuid, name, color '#RRGGBB',
                       logo_url|null, registration_mode 'open'|'approval',
                       min_mobile_version, min_web_version, updated_at)
accounts.RegistrationRequest(id uuid, email unique-among-pending, name,
                       password_hash, status 'pending'|'approved'|'rejected',
                       token_hash sha256, push_token|null, push_platform|null,
                       invite FK→ProjectInvite|null, invite_snapshot json|null,
                       reject_reason, created_at, decided_at, decided_by FK|null,
                       user FK|null, tokens_issued_at|null)
core.PushToken(id, user FK, token unique, platform 'ios'|'android'|'web',
               device_name, created_at, last_seen_at)
core.Project(id Char64 PK, owner FK User, name, color, template 'work'|'simple',
             created_at, updated_at, archived_at|null, deleted_at|null,
             cursor bigint=0)
core.ProjectMember(project FK, user FK, role 'owner'|'member'|'viewer',
                   joined_at, invited_by FK|null)  unique(project,user)
core.ProjectItem(id uuid, project FK, collection Char48, local_id Char64,
                 data json, client_updated_at, revision bigint=1,
                 change_seq bigint idx, updated_at auto, deleted bool,
                 updated_by FK User|null)
                 unique(project,collection,local_id); idx(project,change_seq)
core.ProjectSyncMutation(project FK, user FK, mutation_id Char64, result json,
                 created_at)  unique(project,user,mutation_id)  (ретенція 7 діб)
core.ProjectInvite(id uuid, project FK, created_by FK, role 'member'|'viewer',
                 token_hash sha256 unique, expires_at, max_uses int|null,
                 uses int=0, revoked_at|null, created_at)
core.ProjectActivity(id bigint auto, project FK, actor FK|null, verb,
                 collection, local_id, title, changes json, created_at)
```
Наявні `UserItem`/`UserSyncState`/`UserSyncMutation` не змінюються.
`Group/SharedSection/SharedItem/Device` лишаються в БД (не видаляються в цьому релізі).

Env (seed при першому старті, далі істина — `WorkspaceSettings`):
`WORKSPACE_NAME` (типово `Flowi`), `WORKSPACE_COLOR` (`#7C3AED`),
`WORKSPACE_LOGO_URL`, `WORKSPACE_REGISTRATION_MODE` (типово **`approval`**;
Flowi Cloud задає `open`), `MIN_MOBILE_VERSION` (`1.1.0`), `MIN_WEB_VERSION`
(`0.2.0`), `PUBLIC_WS_URL` (типово `wss://<host>/ws` з запиту),
`WEB_APP_URL` (типово `https://flowi.casperdev.site`), `REDIS_URL` (є →
`channels_redis.core.RedisChannelLayer`, нема → InMemory), `EXPO_ACCESS_TOKEN`
(опційно), наявні `CORS_EXTRA_ORIGINS` тощо.

---

## 2. Workspace (§2)

### 2.1 `GET /workspace/` — public
Throttle: 60/min per IP. Відповідь 200:
```json
{
  "workspace_protocol": 1,
  "workspace_id": "3f0c…uuid",
  "name": "Flowi Cloud",
  "color": "#7C3AED",
  "logo_url": null,
  "registration_mode": "open",
  "has_users": true,
  "sync_contract_version": 2,
  "sync_protocols": [1, 2],
  "project_sync_protocol": 1,
  "project_collections": ["projects","project_budgets","task_statuses","tasks","meetings","notes","time_entries","sprints","transactions","subscriptions","comments"],
  "min_client_version": { "mobile": "1.1.0", "web": "0.2.0" },
  "ws_url": "wss://api.flowi.casperdev.site/ws",
  "web_url": "https://flowi.casperdev.site",
  "server_version": "<git sha або semver>",
  "features": ["projects", "team", "invites", "push", "comments", "activity"]
}
```
`has_users=false` → клієнт показує «Ви створюєте перший акаунт — він стане адміном».

### 2.2 Нормалізація адреси та правило сумісності (обидва клієнти однаково)
1. `trim`, прибрати кінцеві `/`, кінцеве `/api`. Без схеми → `https://`.
   `http://` дозволено лише для `localhost`, `127.0.0.1`, `10.*`, `192.168.*`,
   `172.16–31.*`, `*.local` (інакше помилка `insecure_url`).
2. `GET {origin}/api/workspace/` (таймаут 10 с).
3. Рішення (перше, що спрацювало):
   | Умова | Помилка UI (i18n) |
   |---|---|
   | мережа/таймаут | «Не вдалося з'єднатися з workspace» |
   | не 200 / не JSON / немає `workspace_protocol` (у т.ч. 404 старого сервера) | «Це не Flowi workspace або сервер застарів — оновіть сервер» |
   | `workspace_protocol` ≠ клієнтського (1) | серверний більший → «Оновіть застосунок»; менший → «Оновіть сервер» |
   | `sync_contract_version` ≠ 2 | серверний більший → «Оновіть застосунок»; менший → «Оновіть сервер» |
   | версія клієнта < `min_client_version[platform]` | «Оновіть застосунок до X» |
4. Успіх → зберегти `workspace_config` (§9) і перейти на вхід/реєстрацію.
Клієнт повторно викликає `/workspace/` при кожному холодному старті (без
блокування UI; помилка сумісності → блокувальний екран), оновлює кеш назви/кольору.

### 2.3 Зміна workspace = вихід
Клієнт (не сервер): (1) якщо outbox особистий або будь-якого проєкту не
порожній — попередження + одна спроба повного синку; (2) `DELETE /push/tokens/`;
(3) `POST /auth/logout/`; (4) очистка за §9.3; (5) новий `workspace_config`.

### 2.4 Реєстрація — `POST /auth/register/` (змінено) — public, throttle `auth`
Request:
```json
{ "email": "a@b.c", "password": "…", "name": "Ім'я",
  "invite_token": "…optional…", "push_token": "ExponentPushToken[…] optional",
  "push_platform": "ios|android|web optional" }
```
Логіка:
- Користувачів у workspace ще немає → створити користувача **адміном**
  незалежно від режиму → 201 (як нижче).
- `registration_mode == "open"` → 201:
  ```json
  { "status": "active", "user": UserOut, "access": "…", "refresh": "…",
    "joined_project": ProjectSummary | null }
  ```
  (`status` — адитивне поле; стара форма `{user, access, refresh}` збережена).
  Валідний `invite_token` → одразу `ProjectMember` з роллю інвайту.
- `registration_mode == "approval"` → **202**:
  ```json
  { "status": "pending", "request_id": "uuid", "request_token": "43-char urlsafe",
    "detail": "Заявку надіслано адміністратору workspace." }
  ```
  Сервер хешує пароль (`make_password`), зберігає `sha256(request_token)`,
  інвайт (якщо валідний на момент подання) зберігається як `invite_snapshot`
  `{project_id, project_name, role, invited_by: {id,name,email}}` і
  шанується при погодженні, навіть якщо інвайт потім протух.
  Push усім адмінам: `registration_request` (§7).
- Помилки: `409 email_taken` (наявна форма `{code, detail}`), `409 request_pending`
  (для email вже є pending-заявка), `400` валідація (наявна форма DRF — не
  міняємо), `400 invite_invalid`, `410 invite_expired` (інвайт з тіла; реєстрація
  тоді не виконується — клієнт пропонує продовжити без інвайту, повторивши без поля).

`UserOut` (розширено, адитивно — також у `/auth/login/`, `/auth/me/`):
```json
{ "id": 42, "email": "a@b.c", "name": "Ім'я", "date_joined": "ISO", "is_admin": false, "workspace_id": "uuid" }
```

### 2.5 Стан заявки — `POST /auth/register/status/` — public, throttle 60/h per IP
Request `{ "request_id": "uuid", "request_token": "…" }` (токен у тілі, не в URL — логи).
Response 200:
```json
{ "status": "pending" | "approved" | "rejected",
  "detail": "…", "reject_reason": "…|null", "decided_at": "ISO|null",
  "user": UserOut | null, "access": "…|null", "refresh": "…|null",
  "joined_project": ProjectSummary | null }
```
Токени повертаються **лише один раз** — при першому читанні `approved`
(`tokens_issued_at` проставляється); далі `approved` без токенів → клієнт показує
форму входу. `404 request_not_found` — невідомий id або невірний токен.

### 2.6 Вхід — `POST /auth/login/` (доповнено)
Якщо користувача немає, але є `RegistrationRequest` з цим email і пароль
збігається з `password_hash`:
`403 {"code":"registration_pending"}` або `403 {"code":"registration_rejected","reject_reason":"…"}`.
Інакше — як зараз (`401 {"detail":"Invalid credentials."}`).

### 2.7 Адміністрування — усі `admin`, інакше `403 not_admin`
| Метод | Шлях | Тіло / відповідь |
|---|---|---|
| GET | `/admin/workspace/` | `WorkspaceAdminOut` = поля §2.1 + `registration_mode`, `min_mobile_version`, `min_web_version`, `user_count`, `pending_requests` |
| PATCH | `/admin/workspace/` | будь-яка підмножина `{name, color, logo_url, registration_mode, min_mobile_version, min_web_version}` → `WorkspaceAdminOut`; 400 на невалідні значення |
| GET | `/admin/registration-requests/?status=pending\|approved\|rejected\|all` (типово pending) | `{"results":[RegistrationRequestOut]}` новіші зверху, ліміт 200 |
| POST | `/admin/registration-requests/{id}/approve/` | `{}` → 200 `{"request": RegistrationRequestOut, "user": UserOut}`; створює User (email, name, password_hash), інвайт → ProjectMember; push заявнику `registration_decision`; `409 already_decided`; `409 email_taken` (хтось зареєструвався інакше) |
| POST | `/admin/registration-requests/{id}/reject/` | `{"reason": "optional ≤500"}` → 200 `{"request": …}`; push `registration_decision`; `409 already_decided` |
| GET | `/admin/users/` | `{"results":[AdminUserOut]}` |
| PATCH | `/admin/users/{id}/` | `{is_admin?: bool, is_active?: bool}` → `AdminUserOut`; `409 last_admin` (зняти/деактивувати останнього активного адміна); `409 cannot_deactivate_self` |

```json
RegistrationRequestOut = { "id": "uuid", "email": "…", "name": "…",
  "status": "pending", "created_at": "ISO", "decided_at": null,
  "decided_by": { "id": 1, "name": "…", "email": "…" } | null,
  "reject_reason": "",
  "invite": { "project_id": "p-…", "project_name": "…", "role": "member",
              "invited_by": { "id": 1, "name": "…", "email": "…" } } | null }
AdminUserOut = { "id": 42, "email": "…", "name": "…", "is_admin": false,
  "is_active": true, "date_joined": "ISO", "last_login": "ISO|null" }
```
Деактивований (`is_active=false`) — логін `401`, refresh-токени blacklist.
UI: Налаштування → «Адміністрування workspace» (видно, якщо `user.is_admin`).

### 2.8 Push-токени — `auth`
| Метод | Шлях | Тіло | Відповідь |
|---|---|---|---|
| POST | `/push/tokens/` | `{"token":"ExponentPushToken[…]","platform":"ios\|android\|web","device_name":"optional"}` | 200/201 `{"id":…, "token":…, "platform":…}` — upsert за `token` (перевішується на поточного користувача) |
| DELETE | `/push/tokens/` | `{"token":"…"}` | 204 (ідемпотентно) |
Клієнт реєструє після кожного входу/старту з токенами (якщо змінився токен або
користувач — див. `push_token_registered`), видаляє перед logout.
Сервер: Expo Push API `https://exp.host/--/api/v2/push/send`; `DeviceNotRegistered`
→ видалити токен. Помилки відправки глушаться й логуються (не валять запит).
Веб у цій фазі push не реєструє (`platform: "web"` зарезервовано).

### 2.9 `DELETE /auth/me/` (доповнено)
Додатково: `409 owns_team_projects` `{"project_ids":[…]}`, якщо користувач
власник проєктів з іншими учасниками (треба передати власність); соло-проєкти
видаляються; `409 last_admin`, якщо він єдиний активний адмін і є інші користувачі.

---

## 3. Проєкти (§3)

### 3.1 `ProjectSummary`
```json
{ "id": "p-…", "name": "…", "color": "#…", "template": "work"|"simple",
  "role": "owner"|"member"|"viewer",
  "owner": { "id": 1, "name": "…", "email": "…" },
  "member_count": 3, "cursor": 1234,
  "created_at": "ISO", "updated_at": "ISO", "archived_at": "ISO|null" }
```
`name/color/archived_at` денормалізуються сервером з запису `projects/{id}` у
потоці проєкту при кожному його записі (`data.name`, `data.color`, `data.archivedAt`).

### 3.2 REST
| Метод | Шлях | Хто | Тіло → відповідь |
|---|---|---|---|
| GET | `/projects/` | auth | `{"results":[ProjectSummary]}` — проєкти, де я учасник, `deleted_at is null` |
| POST | `/projects/` | auth | `{"id":"p-…","template":"work\|simple","data":{…повний запис Project…}}` → 201 `ProjectSummary`. Атомарно: Project, ProjectMember(owner), ProjectItem `projects/{id}` (revision 1) з `data`. `409 project_id_taken` (id зайнятий іншим); повтор власником того самого id → 200 наявний (ідемпотентно) |
| GET | `/projects/{id}/` | будь-яка роль | `ProjectSummary` |
| DELETE | `/projects/{id}/` | owner | 204; soft-delete (`deleted_at`), WS `project_deleted`, `projects_changed` учасникам |
| POST | `/projects/{id}/transfer-ownership/` | owner | `{"user_id":42}` → 200 `ProjectSummary`; новий — owner, старий — member; `400 not_a_member` |
| POST | `/projects/migrate/` | auth | див. §3.6 |
| POST | `/projects/{id}/sync/` | будь-яка роль | див. §3.4 |
| GET | `/projects/{id}/activity/?before=<id>&limit=50` | будь-яка роль | §4.6 |
Спільні помилки: `404 project_not_found` (немає або deleted, або я не учасник —
не розкриваємо існування), `403 forbidden` (роль не дозволяє).

### 3.3 Запис проєкту та налаштування (у потоці проєкту)
Колекція `projects`, `local_id == project.id`, запис (надмножина наявного `Project`):
```ts
{ id, name, color, createdAt, archivedAt?, deadline?, description?,
  template: 'work'|'simple',
  modules: { meetings: bool, notes: bool, time: bool, budget: bool, sprints: bool },
  updatedAt }
```
Шаблони: `work` → усі `true`; `simple` → усі `false`. Огляд і Завдання — завжди.
Статуси проєкту: колекція `task_statuses` у потоці проєкту, записи
`TaskStatusColumn` + `projectId` + **`type: 'todo'|'in_progress'|'done'`**
(адитивне поле; особисті статуси теж отримують `type`, похідний:
`isDone→done`, `status-in-progress→in_progress`, інше → `todo`). id статусу
проєкту — випадковий `st-<uuid4>` (НЕ `status-active`, бо локально всі потоки
лежать в одному ключі `task_statuses`). При створенні клієнт пушить копії
глобальних статусів з новими id і `sourceStatusId`.
Бюджет проєкту: колекція `project_budgets`, `local_id == project.id`,
`{id, projectId, amount, currency, updatedAt}` — owner-only.
Нові поля завдання (адитивні, також в особистому потоці): `startDate?` (вже є),
`assigneeId?: string|null`, `createdBy?: string` (клієнт ставить при створенні
в проєкті).

### 3.4 Потік синку проєкту — `POST /projects/{id}/sync/`
**Ідентичний sync v2** (`/sync/user/v2/`) за формою і семантикою; відмінності
лише перелічені тут. Throttle scope `project_sync` 600/min per user.

Request:
```json
{ "cursor": 0,
  "mutations": [ { "mutation_id": "mob-…", "collection": "tasks", "local_id": "…",
    "operation": "upsert"|"delete", "data": { … }, "base_revision": 3|null,
    "client_updated_at": "ISO", "force": false } ] }
```
Response 200:
```json
{ "contract_version": 2, "protocol_version": 2, "project_sync_protocol": 1,
  "project_id": "p-…", "role": "member",
  "cursor": 1240,
  "changes": [ { "collection","local_id","data","deleted","client_updated_at",
                 "updated_at"(ms),"revision","change_seq","updated_by":"42"|null } ],
  "acknowledged": [ {"status":"applied","mutation_id","collection","local_id","revision","change_seq"} ],
  "conflicts":    [ {"status":"conflict","mutation_id","collection","local_id","server":Change|null,"client":{"data","deleted","base_revision"}} ],
  "rejected":     [ {"status":"rejected","mutation_id","collection","local_id","reason","detail"} ],
  "next_cursor": null | 1100 }
```
- Курсор — `Project.cursor` (монотонний на проєкт, лок рядка Project); `change_seq`
  зі свого простору проєкту. `_MAX_PUSH=1000`, `_PULL_PAGE=500`, пагінація
  `next_cursor` — як у v2. Ідемпотентність — `ProjectSyncMutation`
  (project,user,mutation_id). Конфлікт/`base_revision`/`force`/no-op — байт-у-байт
  логіка `UserSyncV2View`.
- Причини `rejected` (нові поряд з v2-причинами `invalid_*`):
  `invalid_collection` (не з `project_collections`), `forbidden` (роль — §4.1),
  `project_mismatch` (`data.projectId` є і ≠ `{id}`; для `projects` і
  `project_budgets` — `local_id` ≠ `{id}`), `author_mismatch` (comments: §4.4).
  Сервер **не модифікує** `data` — лише приймає або відхиляє.
- **Бюджетна фільтрація:** для `role != owner` у `changes` НЕ потрапляють рядки
  колекцій `transactions`, `subscriptions`, `project_budgets` (пропуски в
  `change_seq` дозволені; клієнт курсор бере з `cursor`/`next_cursor`, не з рядків),
  і в `conflicts[].server` для них теж `null`.
- `403 not_a_member` / `404 project_not_found` → клієнт видаляє проєкт локально (§9.4).
- `role` у відповіді ≠ кешованої → клієнт скидає курсор проєкту в 0 і робить
  повний pull (апгрейд до owner відкриває бюджет); даунгрейд з owner → локально
  стерти записи бюджетних колекцій цього проєкту.
- Після запису: WS `sync_changed` на `project_{id}` (§5), активність (§4.6), push (§7).

### 3.5 Маршрутизація записів на клієнті (outbox)
- Потік запису: `project:{P}`, якщо `record.projectId == P` і `P` є в
  `workspace_projects` (я учасник) **і** колекція в `project_collections`;
  для `projects` — `local_id == P`; для `project_budgets` — завжди проєкт.
  Інакше — `personal` (наявний `/sync/user/v2/`).
- `OutboxItem` отримує опційне поле `stream?: string` (`'personal'` |
  `'project:<id>'`); відсутнє = `personal` (сумісність зі старим outbox).
- Зміна `projectId` запису (переміщення між потоками) = дві мутації:
  `delete` у старому потоці + `upsert` (`base_revision: null`) у новому.
- Колекції лише-проєктні: `comments`, `project_budgets` (локальні ключі з тією ж назвою).
- Ревізії проєкту зберігаються окремо від особистих (§9.1 `project_sync_state_v1`).
- Застосування pull: зміна з потоку S не видаляє/не перезаписує локальний запис,
  який зараз належить іншому потоку (перевірка за правилом вище); особистий
  тумбстоун з `data._movedTo` ігнорується (§3.6).
- Коли синкати: після особистого синку — для кожного проєкту, де
  `ProjectSummary.cursor > local cursor` або є outbox-рядки потоку; плюс на WS-сигнал.

### 3.6 Міграція наявних проєктів — `POST /projects/migrate/` — auth, ідемпотентно
Клієнт викликає один раз після входу, коли особистий outbox порожній і
`projects_migrated_v1` не відповідає (workspace_id,user_id). Сервер (одна транзакція,
лок користувача):
1. Для кожного живого `UserItem(collection='projects')` користувача → `Project`
   з тим самим id (owner = користувач, template `work`, modules усі `true`)
   + ProjectItem `projects/{id}`. Id зайнятий іншим → `skipped` з
   `project_id_taken` (записи лишаються особистими).
2. Кожен живий `UserItem` колекцій `tasks, meetings, notes, time_entries,
   transactions, sprints, subscriptions` з `data.projectId` ∈ перенесених →
   ProjectItem (той самий local_id/data/client_updated_at, revision 1, новий change_seq),
   а `UserItem` → тумбстоун: `deleted=true`, `revision+1`, новий user change_seq,
   `data = {…стара data, "_movedTo": {"projectId": P}}`.
3. `UserProfile.projects_migrated_at = now`. Повторний виклик → той самий звіт без змін.
Response 200:
```json
{ "migrated_projects": ["…"], "moved_items": 123,
  "skipped": [ { "project_id": "…", "reason": "project_id_taken" } ],
  "already_migrated": false }
```
Після відповіді клієнт: `GET /projects/`, повний pull кожного проєкту з 0, особистий синк.
Старі (неоновлені) пристрої того ж користувача побачать тумбстоуни й втратять ці
записи локально — прийнятно (вони мусять оновитись; `min_client_version`).

### 3.7 «Особисте» агрегує
Локально всі потоки лежать у тих самих ключах (`tasks`, …). «Моє» завдання:
особистий потік АБО `assigneeId == me` АБО (`assigneeId` порожній і `createdBy == me`).
Мітка проєкту — з `projects` за `projectId`.

---

## 4. Команда (§4)

### 4.1 Матриця прав
| Дія | owner | member | viewer |
|---|---|---|---|
| Читати потік (крім бюджетних колекцій), учасників, активність | ✓ | ✓ | ✓ |
| Читати/писати `transactions`, `subscriptions`, `project_budgets`; бачити розділ «Бюджет» і «витрачено» в Огляді | ✓ | ✗ | ✗ |
| upsert/delete `tasks`, `meetings`, `notes`, `time_entries`, `sprints` | ✓ | ✓ | ✗ |
| upsert/delete `projects` (назва, колір, modules, дедлайн, архів), `task_statuses` (workflow) | ✓ | ✗ | ✗ |
| Створити `comments`; редагувати/видалити власний коментар | ✓ | ✓ | ✓ |
| Видалити чужий коментар | ✓ | ✗ | ✗ |
| Інвайти, ролі, видалення учасників, передача власності, видалення проєкту | ✓ | ✗ | ✗ |
| Вийти з проєкту | ✗ (спершу передати) | ✓ | ✓ |
Порушення в синку → `rejected` з `reason: "forbidden"`; у REST → `403 forbidden`.
Клієнт ховає недоступні дії (але сервер — джерело істини).

### 4.2 Учасники
| Метод | Шлях | Хто | Тіло → відповідь |
|---|---|---|---|
| GET | `/projects/{id}/members/` | будь-яка | `{"results":[MemberOut]}` |
| PATCH | `/projects/{id}/members/{user_id}/` | owner | `{"role":"member\|viewer"}` → `MemberOut`; `400 invalid_role` (owner не призначається — лише transfer) |
| DELETE | `/projects/{id}/members/{user_id}/` | owner (будь-кого, крім себе) або сам учасник (вихід) | 204; `409 owner_cannot_leave` |
`MemberOut = {"user":{"id":42,"name":"…","email":"…"},"role":"member","joined_at":"ISO","invited_by":{"id","name"}|null}`.
Зміни → WS `members_changed` (проєкт), `projects_changed` (ws/user/ зачепленого), активність.
Видаленому: WS `access_revoked` + close 4403.

### 4.3 Запрошення
| Метод | Шлях | Хто | Тіло → відповідь |
|---|---|---|---|
| POST | `/projects/{id}/invites/` | owner | Посилання: `{"role":"member\|viewer","expires_in_hours":168,"max_uses":null}` (1–720 год, max_uses ≥1 або null) → 201 `InviteOut` (з `token`, `url`, `deep_link` — лише в цій відповіді). Email: `{"role":…,"email":"x@y"}` → 201 `{"kind":"member_added","member":MemberOut}` (акаунт існує й активний; push `project_invite`); `404 user_not_found`; `409 already_member` |
| GET | `/projects/{id}/invites/` | owner | `{"results":[InviteOut без token/url/deep_link]}` активні |
| DELETE | `/projects/{id}/invites/{invite_id}/` | owner | 204 (revoke) |
| POST | `/invites/preview/` | public (throttle 60/h/IP) | `{"token":"…"}` → 200 `{"workspace":{"id","name"},"project":{"id","name","color"},"role","invited_by":{"name"},"expires_at"}`; `404 invite_invalid`; `410 invite_expired` (протух/вичерпано/відкликано/проєкт видалено) |
| POST | `/invites/accept/` | auth | `{"token":"…"}` → 200 `{"project":ProjectSummary,"already_member":false}`; помилки як у preview |
```json
InviteOut = { "id":"uuid","role":"member","expires_at":"ISO","max_uses":null,"uses":0,
  "created_at":"ISO","created_by":{"id":1,"name":"…"},
  "token":"…","url":"https://flowi.casperdev.site/invite?ws=…&p=…&t=…",
  "deep_link":"ftrackingapp://invite?ws=…&p=…&t=…" }
```
- Токен: `secrets.token_urlsafe(32)` (43 символи), у БД — лише `sha256` hex.
- Формати (усі параметри `encodeURIComponent`):
  - Deep link: `ftrackingapp://invite?ws=<origin>&p=<project_id>&t=<token>`
  - Веб: `{WEB_APP_URL}/invite?ws=<origin>&p=<project_id>&t=<token>`
  - `ws` = нормалізований origin workspace (без `/api`).
- Обробка посилання клієнтом: (a) `ws` ≠ поточного і не залогінений → перевірка
  `/workspace/` (§2.2), підтвердження, встановити workspace; (b) `ws` ≠ поточного
  і залогінений → діалог «Перейти в інший workspace? Це вихід» (§2.3);
  (c) залогінений у тому ж → `preview` → «Приєднатися» → `accept`;
  (d) без акаунта → реєстрація з `invite_token` (§2.4). До входу посилання
  тримається в `pending_invite` (§9).

### 4.4 Коментарі та @згадки (колекція потоку `comments`)
```ts
{ id: 'cm-<uuid4>', projectId, targetType: 'task'|'meeting', targetId,
  authorId: '42', body: string /* ≤ 10 000 символів, markdown */,
  mentions: string[] /* user ids учасників */, createdAt, updatedAt, editedAt? }
```
- Згадка в тексті: `@[Ім'я](user:42)`; `mentions` — авторитетний список для push.
- Сервер: create → `authorId` має == поточний користувач, інакше `rejected`
  `author_mismatch`; update → лише автор (`forbidden`); delete → автор або owner.
  `body` > 10 000 → `rejected` `invalid_data`.
- Push `mentioned` кожному з `mentions` (учасник проєкту, ≠ автор) при create
  і для нових id при update.

### 4.5 Виконавці
`task.assigneeId: string|null` — будь-який рядок приймається; push `assigned`
шлеться, лише якщо це учасник проєкту і ≠ автор зміни.

### 4.6 Активність — `GET /projects/{id}/activity/?before=<id>&limit=50` (limit ≤100)
Не синкається; генерується сервером при записі в потік і змінах учасників.
```json
{ "results": [ { "id": 981, "actor": {"id":42,"name":"…"}|null,
    "verb": "created|updated|deleted|status_changed|assigned|commented|member_joined|member_left|role_changed",
    "collection": "tasks", "local_id": "…", "title": "знімок назви",
    "changes": [ { "field": "status", "from": "active", "to": "done" } ],
    "created_at": "ISO" } ],
  "next_before": 950 | null }
```
Поля у `changes` — лише з білого списку: `title, status, kanbanColumnId,
assigneeId, deadline, startDate, priorityLevel, sprintId`. Для бюджетних колекцій
активність **не створюється**. Ретенція — 90 днів.

---

## 5. WebSocket

### 5.1 `ws/project/{project_id}/` (нове)
Auth: субпротокол `['flowi-jwt', <access>]`; сервер accept → close з кодом:
`4401` (токен), `4403` (не учасник), `4404` (проєкт не існує/видалений) — accept
ПЕРЕД close, як у `UserConsumer`. Односторонній: вхідні повідомлення ігноруються.
Сервер → клієнт:
```json
{ "type": "sync_changed",    "project_id": "p-…", "cursor": 1240 }
{ "type": "members_changed", "project_id": "p-…" }
{ "type": "project_deleted", "project_id": "p-…" }
{ "type": "access_revoked",  "project_id": "p-…" }   // далі close 4403
```
Channel-група: `project_{id}` (id санітизувати до `[A-Za-z0-9_.-]`, бо
channels дозволяє лише такі імена; `:`→`_`). Клієнт: на `sync_changed`
— дебаунс 800 мс і `POST /projects/{id}/sync/`; відкриває сокети максимум для
10 проєктів (відкритий + нещодавні), решта — поллінг `GET /projects/` раз на 60 с
на передньому плані.

### 5.2 `ws/user/` (адитивно)
Нове повідомлення лише при зміні членства (я доданий/видалений/роль/проєкт
видалено/створено на іншому пристрої):
```json
{ "type": "projects_changed" }
```
Клієнт → `GET /projects/`. Старі клієнти на будь-яке повідомлення роблять
особистий синк — нешкідливо. `sync_changed` не змінюється.

### 5.3 `ws/group/{id}/` — вимкнено: accept → close `4410`.

---

## 6. «Спільне» → проєкти: жорсткий перехід

### 6.1 Серверна data-міграція (при деплої, ідемпотентна)
Для кожної `Group`: власник = перший за `joined_at` `GroupMember`, чий
`device.user` не null; немає → пропустити (лог). Інакше:
- `Project(id = "sh-" + group.id, name = group.name, template = "simple",
  owner)`, ProjectMember(owner). Запис `projects/{id}`: `{id, name, color:"#7C3AED",
  createdAt: group.created_at, template:"simple", modules: усі false, updatedAt}`.
- Кожна `SharedSection` → `task_statuses` `{id:"st-"+section.id, projectId, name:section.name,
  color:"#64748B", position:i, isDone:false, type:"todo"}`; плюс один
  `{id:"st-done-"+group.id, name:"Виконано", isDone:true, type:"done", position:last}`.
- Кожен `SharedItem` з `deleted=false` → `tasks`
  `{id:"sh-"+item.id, projectId, title: data.text||data.title||data.name||"—",
  description: data.note||data.description||undefined, status: data.checked?"done":"active",
  kanbanColumnId: data.checked?"st-done-…":"st-"+section.id, priorityLevel:3,
  subtasks:[], createdAt: item.updated_at, updatedAt: item.updated_at,
  createdBy: String(owner.id), legacyShared: data}`.
- Інші учасники НЕ переносяться — приєднуються за новим запрошенням.
Власник отримує проєкт через `GET /projects/` (`projects_changed` не потрібен).

### 6.2 Вимкнені ендпоінти — усі відповідають `410`
`/devices/register/`, `/devices/claim/`, `/groups/**`, `/sections/**`,
`/sync/` (груповий SyncView):
```json
{ "code": "shared_removed", "detail": "«Спільне» замінено проєктами. Оновіть застосунок." }
```
`/sync/user/`, `/sync/user/v2/`, `/sync/contract/`, `/health/`, `/report/` — без змін.

### 6.3 Клієнти
Mobile: прибрати екран `(tabs)/shared.tsx`, плитку на «Сьогодні», виклик
`/devices/claim/` у login/register; міграція сховища видаляє `shared_device_id`,
`shared_group`, `shared_section_counts`, `shared_items_*`.
`app_mode` до цього списку НЕ входить (виправлено після ревʼю): ключ
перевикористаний під загальний перемикач онлайн/офлайн (`store/app-mode.tsx`,
Налаштування → Синхронізація), не пов'язаний із «Спільним» від часу
написання цього розділу контракту — видалення його міграцією скинуло б живе
налаштування, яке «Спільне» більше не займає.

---

## 7. Push (payload `data` для Expo, однаковий для iOS/Android)
```json
{ "type": "assigned|mentioned|status_changed|project_invite|registration_request|registration_decision",
  "workspace_id": "uuid", "project_id": "p-…|null",
  "collection": "tasks|meetings|comments|null", "local_id": "…|null",
  "request_id": "uuid|null", "decision": "approved|rejected|null",
  "url": "ftrackingapp://…" }
```
| Тип | Кому | Коли | `url` |
|---|---|---|---|
| assigned | новий `assigneeId` | `assigneeId` змінився, ≠ автор | `ftrackingapp://project/{pid}/task/{id}` |
| status_changed | виконавець (або `createdBy`, якщо виконавця немає) | змінився `status` або `kanbanColumnId`, адресат ≠ автор | те саме |
| mentioned | `mentions` | §4.4 | `ftrackingapp://project/{pid}/{task\|meeting}/{targetId}` |
| project_invite | доданий за email | §4.3 | `ftrackingapp://project/{pid}` |
| registration_request | усі адміни | нова заявка | `ftrackingapp://admin/requests` |
| registration_decision | `push_token` заявки | approve/reject | `ftrackingapp://registration` |
Клієнт ігнорує push, у якого `workspace_id` ≠ поточного. Заголовок/текст —
українською з сервера (`title`, `body` Expo-повідомлення).

---

## 8. Веб (§2, §3)
- `lib/config.ts`: `API_BASE`/`WS_BASE` — **runtime** з `flowi_workspace`;
  `NEXT_PUBLIC_API_BASE` лише автозаповнює поле адреси. Маршрут `/workspace`
  (крок перед `/login`, `/register`), `/register/pending`, `/invite`.
- URL проєкту: `/app/p/{id}/overview|board|list|calendar|timeline|meetings|notes|time|budget|sprints|settings`.
- Сервер: CORS за замовчуванням дозволяє офіційний веб (`https://flowi.casperdev.site`,
  `https://flowi-web-app.vercel.app` + превʼю-regex) — вже є; `CORS_EXTRA_ORIGINS` — для інших.

---

## 9. Локальне сховище клієнтів

### 9.1 Нові ключі (mobile — AsyncStorage, якщо не вказано інше)
| Ключ | Тип | Призначення |
|---|---|---|
| `workspace_config` | `{origin, apiBase, wsBase, workspaceId, name, color, logoUrl, registrationMode, webUrl, fetchedAt}` | поточний workspace |
| `data_owner` | `{workspaceId, userId} \| null` | чиї дані лежать у сховищі |
| `workspace_projects` | `ProjectSummary[]` | кеш `GET /projects/` |
| `project_sync_state_v1` | `{[projectId]: {cursor:number, revisions:Record<'coll:id',number>, role, lastSyncedAt}}` | курсори/ревізії потоків проєктів |
| `project_members_v1` | `{[projectId]: MemberOut[]}` | кеш учасників (імена, @згадки) |
| `recent_projects` | `string[]` (≤5) | свічер |
| `projects_migrated_v1` | `{workspaceId, userId, at}` | §3.6 виконано |
| `pending_registration` | `{requestId, email, workspaceId, createdAt}` | екран очікування; **`request_token` — у SecureStore `flowi_registration_token`** |
| `pending_invite` | `{ws, projectId, token, receivedAt}` | інвайт до входу |
| `push_token_registered` | `{token, userId, workspaceId}` | чи треба перереєструвати |
| `comments`, `project_budgets` | масиви | нові колекції потоку проєкту |
Веб (localStorage): `flowi_workspace` (форма як `workspace_config`),
`flowi_recent_projects`, `flowi_pending_invite`; дані — лише в пам'яті (як зараз).
Контекст «в проєкті» не зберігається: після перезапуску — завжди Особисте.

### 9.2 Простір імен
Namespacing ключів **немає**: один workspace і один користувач одночасно;
ізоляція — через очистку (§9.3) і `data_owner`.
Після входу: `data_owner == null` і є локальні дані (легасі-офлайн/до оновлення)
→ вивантаження в акаунт; якщо особистий pull з курсора 0 вже має записи —
діалог «Злити з акаунтом» (обʼєднання за id; однаковий id → переміг новіший
`updatedAt`: локальний новіший → мутація з `force:true`) / «Використати дані
акаунта» (локальні стерти). `data_owner` ≠ поточного → стерти до застосування.

### 9.3 Що очищується при виході і зміні workspace (після спроби досинку)
**Стерти:** усі `SYNC_ARRAY_KEYS` + `SYNC_SINGLETON_KEYS`, `comments`,
`project_budgets`, `sync_outbox`, `server_change_cursor_v2`,
`server_record_revisions_v2`, `last_server_sync_completed_at`,
`last_server_sync_error_v2`, `sync_rejected_v2`, `sync_known_collections_v2`,
`sync_pending_conflicts`, `auth_user`, `data_owner`, `workspace_projects`,
`project_sync_state_v1`, `project_members_v1`, `recent_projects`,
`projects_migrated_v1`, `push_token_registered`, `pending_registration`,
`gcal_refresh_token`, `gcal_last_sync`, `agent_config`, `banks_last_source`,
`timer_dials`, `pref_task_reminders`; SecureStore `flowi_access`, `flowi_refresh`,
`flowi_registration_token`; усі заплановані локальні нотифікації
(`cancelAllScheduledNotificationsAsync`).
**Лише при зміні workspace додатково:** `workspace_config` (замінюється),
`pending_invite` (якщо його `ws` ≠ новому).
**Лишити (налаштування пристрою):** `theme_option_v1`, `lang_option_v1`,
`nav_collapsed_groups`, `health_chart_types`, `auto_backup_enabled`,
`last_backup_at`, `storage_migrations_applied`. Файли авто-бекапів лишаються;
відновлення бекапу в інший workspace — лише з явним підтвердженням.
Веб: `flowi_access`, `flowi_refresh`, `agent_config`, `flowi_recent_projects`,
(`flowi_workspace` — лише при зміні), дані в пам'яті скидаються перезавантаженням.

### 9.4 Вихід із проєкту / видалення / відкликання доступу
Стерти локально всі записи з `projectId == P` у колекціях `project_collections`,
`projects/P`, `project_budgets/P`, outbox-рядки `stream == project:P` (при
добровільному виході з непорожнім outbox — попередження), `project_sync_state_v1[P]`,
`project_members_v1[P]`, прибрати з `recent_projects`; якщо користувач зараз у
цьому проєкті — повернути в Особисте.

---

## 10. Сумісність і незмінне
- `/sync/user/`, `/sync/user/v2/`, `/sync/contract/`, `ws/user/` `sync_changed` —
  без змін форми; `SYNC_CONTRACT_VERSION` лишається **2** (нові колекції
  `comments`, `project_budgets` — лише в потоці проєкту, в `SYNC_COLLECTIONS`
  особистого контракту НЕ додаються).
- Нові поля записів (`assigneeId`, `createdBy`, `type` статусу, `modules`,
  `template`) — адитивні, сервер тіла не розбирає (крім правил §3.4/§4.4).
- `/auth/register|login|me` — лише адитивні поля; `202` з `status:"pending"` —
  новий шлях, який старий клієнт побачить як помилку (очікувано: старий клієнт
  на self-host у режимі approval зареєструватись не зможе).
- Тести сервера: кожен новий ендпоінт — happy path + кожен код помилки з цього
  документа; `makemigrations --check` чисто.
