# Статус виконання: Workspace + проєкти + команда

**План:** `WORKSPACE_PROJECTS_PLAN.md`. **Контракт:** `WORKSPACE_PROJECTS_CONTRACT.md`
(`workspace_protocol = 1`, обидва в цьому каталозі). Журнал охоплює всі три
репозиторії: `flowi-server-app` (Django + Channels), `flowi-mobile-app`
(Expo), `flowi-web-app` (Next.js). Гілка в усіх трьох —
`feat/sync-copy-perf-2026-09`. **Нічого не закомічено й не задеплоєно**
(так вимагав план). Уся робота лежить у робочих деревах як незакомічені зміни.

Нижче спершу зведення по розділах плану §0–§5, далі ручні кроки власника,
відкриті ризики й інструкція з тестування. Детальний журнал проходів
мобільного репо — у додатку в кінці файлу.

---

## Зведення перевірок (§0 / §5)

| Репо | Команда | Базовий стан (§0) | Зараз |
|------|---------|-------------------|-------|
| server | `.venv/bin/python manage.py test` | 118 OK | 327 OK |
| server | `manage.py makemigrations --check --dry-run` | No changes | No changes |
| server | `manage.py check` | 0 issues | 0 issues |
| mobile | `npx tsc --noEmit` | 0 помилок | 0 помилок |
| mobile | `npx eslint .` | 0 помилок | 0 помилок, 146 попереджень (усі старі) |
| mobile | `npx jest` | 97 сюїт / 1258 | 112 сюїт / 1518 |
| web | `npx tsc --noEmit` | 0 помилок | 0 помилок |
| web | `npm run lint` | 0 | 0 |
| web | `npm test` (`node --test lib/*.test.mjs`) | 730 | 830 |
| web | `npm run build` | OK | OK (усі `/app/p/[id]/*` збираються) |

Нових помилок у жодному репо немає. Playwright e2e вебу оновлено
(`e2e/workspace.ts` засіває `flowi_workspace`), але **не запускались** —
потрібен живий сервер з новими ендпоінтами.

---

## §0 Базовий стан + контракт — виконано

- Базові результати перевірок зафіксовано (таблиця вище).
- `docs/plans/WORKSPACE_PROJECTS_CONTRACT.md` (~650 рядків): загальні правила
  (помилки `{code, detail, fields?}`, заголовок `X-Flowi-Client`, 426
  `client_outdated`, id проєктів `p-<uuid4>`), `GET /api/workspace/`,
  реєстрація open/approval, адмін-ендпоінти, push, REST проєктів,
  `POST /projects/{id}/sync/`, видимість бюджету, ролі, запрошення,
  коментарі/активність, `ws/project/{id}/`, жорсткий перехід «Спільне» →
  проєкти, локальні ключі клієнтів (§9).

**Відхилення від контракту, які варто внести в нього:**
- `POST /projects/migrate/` може повернути в `skipped` причину
  `project_deleted` — у контракті §3.6 є лише `project_id_taken`.
- `GET /api/workspace/` віддає `features: []` замість прикладу з контракту
  (див. §2 нижче).
- Веб зберігає заявку на реєстрацію під ключем `flowi_pending_registration`,
  якого немає в §9.1/§9.3 (див. додаток, розділ «Веб — нотатки з рев'ю»).

## §1 Сайдбар планшета = веб — виконано (mobile)

- `constants/nav.ts`: `NAV_GROUPS` дослівно повторює веб (`flowi-web-app/lib/nav-groups.ts`):
  **Робота** (завжди розгорнута), **Особисте**, **Ще** та **Розробка**
  (згорнуті за замовчуванням, `DEFAULT_COLLAPSED_GROUP_IDS = ['more','dev']`).
  Налаштування внизу. «Спільне» після §4 з сайдбара прибрано.
- `store/translations.ts`: нові ключі `navGroupWork/Personal/Dev`,
  `navMeetings`, `navTime`, `navHealthSummary`, `navAgentLabel` (uk/en).
- `__tests__/nav.test.ts` оновлено; `nav-routes-exist.test.ts` перевіряє, що
  кожен пункт веде на наявний екран.
- **Частково:** веб має одну сторінку «Ідеї та баги», а на мобільному це два
  окремі екрани. Їх показано двома сусідніми пунктами, нового об'єднаного
  екрана не створювали: план забороняє вигадувати пункти.
- «Архів» і «Записи часу» (службові, без веб-аналога) — у групі «Ще».

## §2 Workspace — виконано (усі репо), з відомими пробілами

**Server** (`flowi-server-app`):
- Моделі й міграції: `accounts.UserProfile` (`is_workspace_admin`,
  `projects_migrated_at`), `accounts.RegistrationRequest`,
  `core.WorkspaceSettings` (singleton, стартові значення з env), `core.PushToken`.
  Міграції `accounts/0002`–`0005`, `core/0006`. `accounts/0003_promote_first_admin`
  робить адміном першого користувача на сервері, де користувачі вже є.
- Ендпоінти (`core/workspace_views.py`, `accounts/views.py`, `core/urls.py`,
  `accounts/urls.py`): `GET /api/workspace/`, `GET/PATCH /api/admin/workspace/`,
  `/api/admin/registration-requests/` (+`approve/`, `reject/`),
  `/api/admin/users/` (+`PATCH {id}/`), `POST /api/auth/register/status/`,
  `POST/DELETE /api/push/tokens/`. Реєстрація/вхід: перший користувач стає
  адміном; `open` → 201, `approval` → 202; вхід повертає 403
  `registration_pending|registration_rejected`.
- `core/client_version.py` + `core/middleware.py` — 426 `client_outdated`.
  `core/expo_push.py` — Expo Push API у фоновому потоці; при
  `DeviceNotRegistered` токен видаляється.
- `flowi_server/settings.py`: `channels_redis`, якщо заданий `REDIS_URL`;
  env `WORKSPACE_*`, `MIN_*_VERSION`, `WEB_APP_URL` (автоматично додається в
  CORS), `PUBLIC_WS_URL`, `EXPO_ACCESS_TOKEN`; CORS пропускає `x-flowi-client`;
  нові scope тротлінгу `workspace` і `register_status`.
- Self-host: `docker-compose.selfhost.yml` (server + Postgres з healthcheck +
  Redis + Caddy), `Caddyfile`, `.env.example`, `.github/workflows/publish-image.yml`
  (GHCR `ghcr.io/casperdev3/flowi-server-app`, ім'я в нижньому регістрі),
  розділ Self-host у `README.md`. У `.github/workflows/main.yml` (деплой Flowi
  Cloud) у `.env` додається `WORKSPACE_REGISTRATION_MODE=open`, якщо рядка ще немає.
- Тести: `accounts/test_registration.py`, `accounts/test_promote_first_admin.py`,
  `core/test_workspace.py`.

**Mobile** (`flowi-mobile-app`):
- `store/workspace.ts` + `store/api-config.ts`: нормалізація адреси,
  перевірка `GET /api/workspace/`, сумісність версій, `workspace_config`,
  повторна перевірка при кожному холодному старті (включно з guard на зміну `workspace_id`).
- `app/workspace.tsx` (екран «Адреса workspace»), `app/_layout.tsx` `AuthGate`
  (без workspace_config застосунок далі не пускає; гість → `/welcome`),
  `app/welcome.tsx` (прибрано «Розпочати офлайн»).
- `store/auth.tsx`: заголовок `X-Flowi-Client`, `is_admin`, реєстрація 202 →
  очікування, `switchWorkspace()` (синк outbox → DELETE push-токена →
  logout → повне стирання). `closeSyncSessionBeforeWipe()` чекає, поки
  завершаться синки, що вже йдуть, щоб дані не просочились між workspace.
- `store/data-ownership.ts` — міграція офлайн-користувачів (§9.2): якщо акаунт
  порожній, локальні дані вивантажуються; інакше — діалог «злити / взяти з акаунта».
- `store/registration.ts` + `app/register-pending.tsx` (опитування кожні 65 с),
  `app/admin-workspace.tsx` (заявки, користувачі, режим реєстрації; вхід з
  Налаштувань і Акаунта лише для адміна), `store/push.ts`.
- Тести: `__tests__/workspace.test.ts`, `data-ownership.test.ts`, `push-token.test.ts`.
- `app.json` / `package.json` → версія **1.1.0** (= `MIN_MOBILE_VERSION`).

**Web** (`flowi-web-app`):
- `lib/workspace.ts` (localStorage `flowi_workspace`), `lib/config.ts`
  (`getApiBase()`/`getWsBase()` під час виконання; `NEXT_PUBLIC_API_BASE` лише
  попередньо заповнює поле), `lib/api.ts` (`X-Flowi-Client: web/0.2.0`, 426 →
  `components/client-outdated-gate.tsx`), `lib/auth-context.tsx` (`isAdmin`,
  `completeSession`, `changeWorkspace`), `lib/registration.ts`, `lib/admin.ts`,
  `lib/use-require-workspace.ts`.
- Сторінки `app/workspace/`, `app/register/pending/`, `app/app/admin/`;
  «Змінити workspace» у `app/app/layout.tsx`. `package.json` → 0.2.0.

**Не зроблено / частково:**
- **Push на мобільному фактично не працює:** в `app.json` немає
  `expo.extra.eas.projectId`, а в репо немає `eas.json`. Тому
  `getExpoPushTokenAsync` не викликається й токен не реєструється. Серверна
  частина готова. **Блокер релізу**, потрібен ручний крок (див. нижче).
- `GET /api/workspace/` → `features: []` (задумано: сервер не рекламує
  можливості, яких на момент §2 не було). Клієнти від `features` не залежать.
- Веб-адмінка редагує лише `registration_mode`; назву, колір, лого й мінімальні
  версії через UI змінити не можна, лише через API.
- Мобільна адмінка: відхилення заявки з причиною є, але поле причини лише
  там, де його підтримує платформа (`Alert.prompt` — тільки iOS).
- Нормалізація адреси в клієнтах відрізняється: мобільний парсить через
  `URL()` (нижній регістр хоста, прибирає порт за замовчуванням, `/api` у
  будь-якому регістрі). Веб працює з рядком (`lib/workspace.ts`
  `normalizeWorkspaceOrigin`): регістр хоста не змінює, `/API` не прибирає.
  Та сама адреса може зберегтися в клієнтах по-різному. Мінор.
- Веб `lib/errors.ts` не має українських текстів для `last_admin`,
  `cannot_deactivate_self` і `already_decided`, тож показується `detail` сервера.

## §3 Простір проєкту (соло) — виконано (усі репо)

**Server:**
- Моделі `Project`, `ProjectMember`, `ProjectItem`, `ProjectSyncMutation`
  (`core/models.py`, міграція `core/0007`).
- `core/project_views.py`: `ProjectListCreateView` (409 `project_id_taken`),
  `ProjectDetailView` (м'яке видалення), `ProjectTransferOwnershipView`,
  `ProjectSyncView` (`POST /projects/{id}/sync/`, та сама семантика, що
  `/sync/user/v2/`, + `role` і причини `forbidden|project_mismatch|author_mismatch`),
  фільтрація бюджетних колекцій для не-власників, скидання курсора при зміні
  ролі. `ProjectMigrateView` (`POST /projects/migrate/`) — ідемпотентний, з
  блокуванням рядків, залишає tombstone-и `_movedTo`.
- `core/consumers.py` `ProjectConsumer` + `core/routing.py` — `ws/project/{id}/`
  (коди 4401/4403/4404; `sync_changed`, `members_changed`, `project_deleted`,
  `access_revoked`); `ws/user/` отримує `projects_changed`.
- Тести: `core/test_projects.py`.

**Mobile:**
- `store/project-sync.ts`: окремий курсор на проєкт (`project_sync_state_v1`),
  сокети `ws/project/{id}/` (до `MAX_PROJECT_SOCKETS`, решта опитуються),
  клієнтська частина міграції §3.6, `waitForAllProjectSyncsIdle()`.
- `utils/projectStream.ts`: маршрутизація outbox (`resolveOutboxStream`,
  `PROJECT_COLLECTIONS`), `recent_projects` (≤5).
- Опційні поля `projectId`/`startDate`/`assigneeId`/`createdBy`
  (`utils/taskUtils.ts`, `utils/financeUtils.ts`, `app/notes.tsx`,
  `utils/activeTimers.ts`); типи статусів `todo|in_progress|done`
  (`utils/taskStatuses.ts`); агрегація «Сьогодні»/«Завдання» (`isMyTask`).
- Простір проєкту: `app/project/[id]/_layout.tsx` +
  `overview|tasks|meetings|notes|time|budget|sprints|settings.tsx`,
  `components/projects/ProjectScreenShell.tsx`, `ProjectSwitcherSheet.tsx`,
  `components/shared/ProjectSidebar.tsx`, `constants/projectNav.ts`,
  `hooks/use-project-role.ts`, `utils/projectOverview.ts`. На телефоні таби
  змінюються на таби проєкту, на планшеті — сайдбар проєкту з «← Особисте».
  `app/projects.tsx` лише відкриває простір (стару вбудовану панель прибрано).
- Завдання проєкту: Дошка / Список (з групуванням за статусом, пріоритетом
  чи спринтом, `utils/taskListView.ts`) / Календар / Таймлайн (`ProjectGantt`,
  тягнення країв на планшеті).
- Міграції сховища (`store/migrations.ts`): `migratePersonalStatusTypes`,
  `backfillProjectTaskCreatedBy`.

**Web:**
- `lib/project-sync.ts` (`exchangeProjectV2`, `streamForRecord`),
  `lib/projects-api.ts`, `lib/data-context.tsx` (сокет на кожен проєкт,
  debounce 800 мс), `lib/project-status-seed.ts`, `lib/project-modules.ts`,
  `lib/project-move.ts`, `lib/task-filters.ts` (агрегація «моє»).
- Маршрути `app/app/p/[id]/{overview,board,list,calendar,timeline,meetings,notes,time,budget,sprints,settings,members,activity}`,
  `app/app/p/[id]/layout.tsx` (сайдбар проєкту, свічер, гейт модулів і
  бюджету), `components/projects/*` (overview, tasks-view, calendar,
  timeline-editor + `lib/gantt-drag.ts`, settings, budget, notes, time).

**Не зроблено / частково:**
- Дошка на мобільному **без справжнього drag-and-drop**. Замість нього довге
  натискання відкриває вибір колонки. Рішення свідоме, в коді є коментар.
- Мобільний Список проєкту: «Всі (N)» для великих груп за статусом чи
  пріоритетом немає (`app/task-group.tsx` уміє відкривати лише групу-спринт).
- Особисті `task_statuses` із `projectId` серверна міграція §3.6 не
  переносить: контракт їх не перелічує, а клієнт надалі шле такі записи в
  потік проєкту. Прогалина в специфікації, треба вирішити в контракті.

## §4 Команда — виконано (усі репо), з відомими пробілами

**Server:** `core/team_views.py` (учасники, ролі, запрошення за посиланням і
за email, preview/accept, стрічка активності), `core/invites.py` (токен 43
символи, у базі лише sha256), моделі `ProjectInvite` і `ProjectActivity`
(`core/0008`), `accounts/0005_registrationrequest_invite` (реєстрація з
`invite_token`), push `assigned|mentioned|status_changed|project_invite` через
`core/expo_push.py`. Жорсткий перехід «Спільне»: `core/0009_migrate_shared_to_projects`
(кожна група стає проєктом «Простий»), старі ендпоінти `groups/*` і `ws/group/` →
410 `shared_removed`. Тести: `core/test_team.py`, `core/test_shared_migration.py`, `core/tests.py`.

**Mobile:** `app/project/[id]/members.tsx` + `store/project-team.ts`;
deep link `store/invite-link.ts`, `hooks/use-incoming-invite-links.ts`,
`app/invite.tsx` (сценарії (a)–(d) контракту §4.3); інтерфейс залежно від ролі
(`useProjectRole`); виконавець (`TaskEditForm`, бейдж на
`components/tasks/TaskCompactCard.tsx`, `hooks/use-project-members.ts`);
коментарі й @згадки (`utils/comments.ts`, `components/shared/CommentsSection.tsx`,
у деталях завдання та в `MeetingFormSheet`); активність
(`store/project-activity.ts`, `utils/projectActivity.ts`,
`app/project/[id]/activity.tsx`); переходи з push (`utils/pushLink.ts`).
«Спільне» прибрано: видалено `app/(tabs)/shared.tsx`, прибрано таб,
пункт сайдбара й плитку на «Сьогодні»; міграція `removeSharedFeatureKeys()`.

**Web:** `lib/members-api.ts`, `lib/invites-api.ts`, `lib/pending-invite.ts`,
`app/invite/`, `lib/comments.ts` + `components/comments/`, `lib/activity*.ts`,
`lib/project-roles.ts`, `components/projects/project-members.tsx`, `project-activity.tsx`.

**Не зроблено / частково:**
- Мобільний: немає екрана передачі власності (функція
  `transferProjectOwnership` є, UI немає). Власник, що хоче вийти з проєкту,
  бачить лише пояснення.
- Мобільний: у формі запрошення немає ліміту використань (`max_uses` завжди `null`).
- Мобільний: автодоповнення `@` бере текст після останнього `@` без
  урахування позиції курсора.
- Мобільний: глядач не може відкрити нараду зі списку нарад проєкту (рядок
  досі гейтований `canEdit`), а через push чи загальний `app/meetings.tsx` —
  може.
- Push-тап на згадку відкриває завдання чи нараду, але не прокручує до
  конкретного коментаря (контракт цього не вимагає).
- Весь push-ланцюжок на мобільному заблоковано відсутнім EAS `projectId` (див. §2).
- Ланцюжок deep link → workspace → preview → accept покритий лише юніт-тестом
  `parseInviteLink`; інтеграційних тестів немає.

## §5 Підсумкова перевірка + документація — виконано

- Перевірки: див. таблицю на початку, регресій немає; `makemigrations --check`
  чисто.
- `CLAUDE.md` (mobile) оновлено: стек (`expo-secure-store`, `expo-clipboard`),
  структура (`app/project/[id]/*`, workspace/auth-екрани, нові
  store/hooks/utils/components), таблиці storage-ключів (включно з ключами
  §9.1: `workspace_config`, `data_owner`, `workspace_projects`,
  `project_sync_state_v1`, `project_members_v1`, `recent_projects`,
  `projects_migrated_v1`, `project_id_conflicts_v1`, `pending_registration`,
  `pending_invite`, `push_token_registered`, `comments`, `project_budgets`).
- `README.md` сервера: розділ Self-host, таблиці ендпоінтів і env, моделі.
- Цей журнал.

---

## Ручні кроки для власника (перед релізом)

Порядок деплою важливий: **сервер першим**, бо нові клієнти (mobile 1.1.0,
web 0.2.0) без `GET /api/workspace/` не пройдуть екран workspace, а
`MIN_MOBILE_VERSION=1.1.0` відріже старі клієнти (426) лише після того, як
нові вже доступні в сторах.

1. **Закомітити** зміни в трьох репо (зараз усе незакомічене; у вебі й
   сервері є ще чуже незавершене WIP на тій самій гілці: `task-copy`,
   `task-group-panel`, `lib/clipboard.ts` у вебі, sync-perf у сервері —
   розібрати, що куди йде).
2. **Сервер (Flowi Cloud):**
   - Зробити бекап БД, **потім** `python manage.py migrate`. Міграції
     `accounts/0002–0005` і `core/0006–0009` включають **незворотну** дата-
     міграцію «Спільне» → проєкти (`0009`) і призначення першого адміна (`0003`).
   - У `.env` на VPS: `WORKSPACE_REGISTRATION_MODE=open` (main.yml додасть сам,
     якщо рядка немає), **`PUBLIC_WS_URL=wss://api.flowi.casperdev.site/ws`**
     (інакше `ws_url` може прийти як `ws://`, якщо nginx не передає
     `X-Forwarded-Proto`, і тоді веб та iOS не відкриють сокет),
     `WORKSPACE_NAME`, `WEB_APP_URL`, опційно `EXPO_ACCESS_TOKEN`,
     `MIN_MOBILE_VERSION` / `MIN_WEB_VERSION`.
   - Опційно `REDIS_URL` для `channels_redis`. Без нього WS працює лише в
     одному процесі (Daphne має лишатися одним процесом).
   - Перевірити `curl https://api.flowi.casperdev.site/api/workspace/`.
3. **Веб:** задеплоїти 0.2.0 (Vercel) після сервера.
4. **Мобільний / Expo push:**
   - `eas init` (або вручну `expo.extra.eas.projectId` в `app.json`) + `eas.json`
     з профілями збірки.
   - Push-креденшли: APNs key (iOS) і FCM (Android) в EAS (`eas credentials`).
   - На сервері за бажанням `EXPO_ACCESS_TOKEN` (якщо в Expo ввімкнено
     «enhanced security for push»).
   - Зібрати й опублікувати 1.1.0. Лише після цього піднімати
     `MIN_MOBILE_VERSION` на Cloud, якщо його ще не встановлено (він
     відріже 1.0.x до оновлення).
5. **GHCR (self-host образ):** workflow `publish-image.yml` бере
   `secrets.GITHUB_TOKEN`, окремий секрет не потрібен. Але в налаштуваннях
   репо (Actions → Workflow permissions) має бути дозволено `packages: write`.
   Після першого пушу пакет у GHCR треба **зробити публічним** (Package
   settings → Visibility), інакше `docker compose pull` у самохостерів
   вимагатиме логіну.
6. **Self-host (для тих, хто піднімає свій сервер):** DNS A/AAAA-запис домену
   → IP хоста; порти 80/443 відкриті (Caddy отримує сертифікат Let's Encrypt);
   `cp .env.example .env`, заповнити `DOMAIN`, `SECRET_KEY`, `POSTGRES_PASSWORD`,
   `WORKSPACE_*`; `docker compose -f docker-compose.selfhost.yml up -d`.
   Перший зареєстрований користувач стає адміном. Django `/admin/` на
   self-host не працюватиме (див. ризики про CSRF), API — працюватиме.

---

## Відкриті ризики

**Високі:**
- **Push не працює** без EAS `projectId` (див. ручні кроки, п. 4).
  Заявки й рішення поки доходять лише через опитування.
- **`ws_url` на Cloud може бути `ws://`**, якщо не задати `PUBLIC_WS_URL`
  (`core/workspace_views.py` `_default_ws_url()` залежить від
  `request.is_secure()`). Не підтверджено: конфіг nginx не лежить у репо.
- **Незворотна міграція «Спільне»** (`core/0009`): учасники груп втрачають
  доступ і мають приєднатися знову за запрошенням (так задумано планом). Бекап БД обов'язковий.

**Середні / мінорні (server, знайдено в рев'ю, не виправлено):**
- `core/consumers.py`: WS-автентифікація не перевіряє `user.is_active`.
  Деактивований адміном користувач із ще чинним access-токеном (до 7 днів)
  може тримати `ws/user/` і `ws/project/` відкритими.
- `AdminUserDetailView` при деактивації не видаляє `PushToken` користувача,
  тож він і далі отримує push.
- `_blacklist_all_tokens` мовчки ковтає будь-яку помилку без логування.
- `RegisterStatusView`: видача токенів «рівно один раз» працює без
  `select_for_update`. Два одночасні опитування можуть обидва отримати токени.
- `CSRF_TRUSTED_ORIGINS` захардкоджено на `api.flowi.casperdev.site`, тому на
  self-host вхід у Django `/admin/` падає на CSRF. JWT API це не зачіпає.
- `ClientVersionMiddleware` робить запит до БД (`WorkspaceSettings.load()`) на
  кожен `/api/` з заголовком.
- `ProjectSyncView` після блокування рядка не перевіряє `deleted_at`: запис у
  проєкт, який якраз видаляють, підтверджується.
- `ProjectMigrateView`: легасі-колір копіюється без перевірки `_COLOR_RE`, а
  легасі-id — без `_PROJECT_ID_RE`. Одночасні перші виклики з двох
  пристроїв можуть дати 500 (`get_or_create` поза транзакцією); клієнт
  повторює запит.
- Немає тестів рівня consumer для `ProjectConsumer` (коди закриття, `access_revoked`).

**Клієнти:**
- Різна нормалізація адреси workspace у вебі й мобільному (див. §2).
- `jest` попереджає «worker failed to exit gracefully» — схоже на витік у
  teardown тестів, не на падіння.
- Легасі-міграція офлайн-даних (§9.2) перевіряє, чи в акаунті є дані,
  «пробою» — порожнім батчем в особистий sync-ендпоінт. Окремого ендпоінта немає.

---

## Як тестувати

**Автоматично:**
```
# server
cd flowi-server-app && .venv/bin/python manage.py makemigrations --check --dry-run && .venv/bin/python manage.py test
# mobile
cd flowi-mobile-app && npx tsc --noEmit && npx eslint . && npx jest
# web
cd flowi-web-app && npx tsc --noEmit && npm run lint && npm test && npm run build
# web e2e (потрібен локальний сервер з новими ендпоінтами)
npx playwright test
```

**Вручну (локальний сервер `DEBUG=True`, `WORKSPACE_REGISTRATION_MODE=approval`):**
1. Workspace: на свіжому інсталі видно екран «Адреса workspace». Ввести
   `http://<LAN-IP>:8000`: http дозволено лише для локальної мережі.
   Неправильна адреса чи несумісна версія мають дати зрозумілу помилку.
2. Реєстрація: перший користувач одразу стає адміном. Другий отримує екран
   очікування. Адмін у «Налаштування → Адміністрування workspace» погоджує
   заявку, і другий автоматично входить. Відхилення → при вході 403 з причиною.
3. Оновлення з 1.0.x з офлайн-даними: вхід у порожній акаунт мовчки вивантажує
   дані, вхід у непорожній показує діалог злиття.
4. Зміна workspace з непорожнім outbox: попередження, потім повне стирання.
   Дані не мають з'явитися на іншому сервері.
5. Проєкт: створити за шаблоном «Робочий» і «Простий», вимкнути модулі,
   відредагувати статуси, Таймлайн (тягнути краї на планшеті; дати в UTC+3
   не мають зсуватися), перезапуск → Особисте, свічер пам'ятає нещодавні.
   Завдання проєкту видно в «Сьогодні» / «Завдання» з міткою проєкту.
6. Команда: запрошення за посиланням (`ftrackingapp://invite?ws=&p=&t=` і
   `{WEB_APP_URL}/invite?...`) як учасник і як глядач. Глядач не бачить
   кнопок редагування, не-власник не бачить бюджету. Виконавець, коментар з
   @згадкою, стрічка активності.
7. Двоє клієнтів (мобільний + веб) на одному проєкті: правка з'являється на
   іншому клієнті без перезавантаження (`ws/project/{id}/`).
8. «Спільне»: після `migrate` старі групи стали проєктами, `/api/groups/...` → 410.
9. Push — лише після кроку 4 ручних дій, на реальному пристрої.

---

# Додаток: детальний журнал проходів (mobile)

## §1 Сайдбар планшета = веб — виконано раніше

`constants/nav.ts`/`components/shared/NavSidebar.tsx` уже дослівно
повторюють `NAV_GROUPS` вебу (Робота / Особисте / Ще / Розробка, той самий
порядок і назви через i18n) — перевірено в цьому проході, змін не
знадобилось.

## §2–§3 Workspace / Простір проєкту — виконано раніше

На момент цього проходу вже існували: `app/workspace.tsx`, `app/login.tsx`,
`app/register.tsx`, `app/register-pending.tsx`, `app/admin-workspace.tsx`,
`store/workspace.ts`, `store/auth.tsx` (без `invite_token`), `store/registration.ts`,
`store/project-sync.ts` (повний §3.2–§3.6), `app/project/[id]/*`
(Огляд/Завдання/Наради/Нотатки/Час/Бюджет/Спринти/Налаштування),
`hooks/use-project-role.ts`, `constants/projectNav.ts` (бюджет уже owner-only).

### §3 Завдання проєкту — Список: групування (2026-09-19)

Аудит `app/project/[id]/tasks.tsx` виявив: Дошка/Список(плаский)/Календар/
Таймлайн з попереднього проходу вже повні (горизонтальна дошка =
«телефон — горизонтальний свайп колонок», тягнення країв Ганта на
планшеті/вебі, довге натискання = вибір колонки як заміна drag-n-drop
дошки — свідомо, задокументовано раніше), АЛЕ Список не мав «групування за
статусом/пріоритетом/спринтом» з тексту плану §3 — лише фільтр
активні/всі/виконані. Додано:
- `utils/taskListView.ts` `buildProjectListGroups` (чиста функція,
  `ProjectListGroupBy = 'none'|'status'|'priority'|'sprint'`) — 'status'
  повторно використовує `buildStatusListSections(…, 'all')` (без денного
  скоупу — список проєкту завжди повний беклог), 'priority' групує
  P0…P5 + «Без пріоритету» (порожні рівні прибираються), 'sprint' —
  `projectTaskGroups` (той самий розподіл, що вже живив «Всі (N)»
  `mode=project` у `app/task-group.tsx`, раніше нізвідки не викликаний для
  Списку). Порожні групи скрізь прибираються.
- Тести — `__tests__/task-list-view.test.ts` (`buildProjectListGroups`,
  5 кейсів: none/status/priority/sprint/порожній проєкт).
- Екран: перемикач-чипи над Списком (`tr.projectGroupByLabel` +
  `tr.projectGroupByNone`/`tr.sortStatus`/`tr.sortPriority`/`tr.sprints`,
  нові ключі `projectGroupByLabel`/`projectGroupByNone` — uk/en), заголовки
  секцій з лічильником замість плаского `.map`, коли групування ввімкнено.
  `groupBy` за замовчуванням `'none'` — попередня поведінка не змінюється,
  доки користувач сам не ввімкне групу.

**Свідомо не зроблено:** «Всі (N)» для великих status/priority-груп у
Списку проєкту (як має Список задач `(tabs)`) — `app/task-group.tsx`
`mode=project` уміє адресувати лише групу-СПРИНТ (`projectGroupTasks`),
не статус/пріоритет; список проєкту в соло-фазі короткий, тож ліміт
15 карток поки не потрібен. Розширення `task-group.tsx` під усі три
розрізи — окремий дрібний крок, якщо колись знадобиться.

## §4 Команда — Крок A (цей прохід, 2026-09-19)

**Реалізовано:**
- **Учасники** — `app/project/[id]/members.tsx` (прихований таб у
  `app/project/[id]/_layout.tsx`, вхід через «Налаштування → Учасники»):
  список із мережі (не з кешу), зміна ролі власником, видалення учасника,
  вихід самого учасника/глядача (власник — з поясненням «спершу передайте
  власність», без окремого UI передачі — див. «Свідомо не зроблено»).
- **Запрошення** — там-таки: посилання (роль + термін 24г/7д/30д, без
  ліміту використань у формі — `max_uses` завжди `null`), «Поділитися»
  (`Share.share`) і «Скопіювати» (`expo-clipboard`), список активних
  посилань з відкликанням, запрошення за email з обробкою `404`/`409`.
  REST-обгортка — `store/project-team.ts`.
- **Deep link** `ftrackingapp://invite?ws=&p=&t=` — `store/invite-link.ts`
  (парсинг + `pending_invite`, §9.1) і `hooks/use-incoming-invite-links.ts`
  (слухач, змонтований у `RootLayoutContent` ПОЗА `<AuthGate>`, бо посилання
  може прийти до того, як workspace/сесія готові). Екран `app/invite.tsx`
  проходить контракт §4.3 (a)–(d): інший workspace + гість → мовчки
  підставити; інший workspace + автентифікований → явне «це вихід»; той
  самий workspace + автентифікований → preview → «Приєднатися»; без акаунта
  → banner на `app/register.tsx` («Запрошення в проєкт X») + `invite_token`
  у тілі `/auth/register/`. `PendingInviteAutoJoin` (у `app/_layout.tsx`)
  довершує приєднання, якщо людина пішла з `/invite` на «Увійти» й
  повернулась автентифікованою в той самий workspace.
  `constants/nav.ts` (`SIDEBAR_HIDDEN_ON`) і `app/_layout.tsx` (`AuthGate`)
  отримали виняток для `/invite`, інакше гостя без workspace_config
  відкидало на `/workspace` раніше, ніж екран встигав підставити адресу з
  посилання.
- **Role-aware UI (contract §4.1)** — глядач (`viewer`) не бачить кнопок
  створення/редагування/видалення в `app/project/[id]/{tasks,meetings,notes,time,sprints}.tsx`
  (перевірка `useProjectRole(projectId) !== 'viewer'`); notes-модалка
  для глядача відкривається read-only (`editable={canEdit}` замість
  повного приховування — читати вміст усе одно можна). Візуальна плашка
  «Лише перегляд — роль «Глядач»» на Огляді проєкту
  (`app/project/[id]/overview.tsx`). Бюджет-owner-only уже існував
  (`constants/projectNav.ts`, `overview.tsx`, `settings.tsx`) — лише
  перевірено, не чіпалось.
- **Виконавець (§4.5) + «призначене мені»** — `assigneeId` уже існував у
  типі `Task`, але без UI. Додано: пікер «Виконавець» у
  `components/tasks/TaskEditForm.tsx` (через `PickerField`, з учасників
  проєкту — `hooks/use-project-members.ts` читає кеш `project_members_v1`),
  поле `assigneeId` у `TaskDraft`/`editedDraftFields` (`hooks/use-task-editor.ts`),
  запис при створенні/правці в `app/(tabs)/index.tsx`. Саме ж «призначене
  мені» (агрегація «Сьогодні»/«Завдання» з усіх проєктів, мітка проєкту)
  виявилось УЖЕ реалізованим раніше (`utils/taskUtils.ts` `isMyTask`,
  `utils/todayGroups.ts`, `utils/taskListView.ts`) — новий UI лише вперше
  дає мобільному клієнту СТАВИТИ `assigneeId`, а не тільки читати його.

**Свідомо не зроблено в цьому кроці (не входило в «Крок A»):**
- Коментарі та @згадки (§4.4), стрічка активності (§4.6), push (§7) —
  наступні кроки §4; мобільний REST-шар (`store/project-team.ts`) уже має
  типи `TeamUserRef`/`MemberOut`, якими коментарі скористаються напряму.
- Передача власності (`POST /projects/{id}/transfer-ownership/`) —
  функція `transferProjectOwnership` є в `store/project-team.ts`, але
  немає екрана вибору нового власника; власник, що хоче вийти, бачить
  лише пояснення. Мінор — власники рідко виходять із власних проєктів.
- «Змінити роль» — простий `Alert` («Учасник ↔ Глядач»), не сегмент-контрол
  у самому рядку. Функціонально достатньо для двох ролей, які власник може
  призначити (§4.2: власника призначає лише transfer).
- Активний таб/картка завдання ще не показує аватар/ім'я виконавця —
  лише пікер у формі. Бейдж на `TaskCompactCard` — наступний дрібний крок.
- Автентичне тестування самого deep-link ланцюжка (workspace-switch,
  preview, accept) — вкрито лише чистою `parseInviteLink`
  (`__tests__/invite-link.test.ts`); мережеві сценарії `app/invite.tsx`
  без integration-тестів (сітка тут та сама, що й у решти auth-екранів
  репо — жоден з них так само не вкритий).

## Перевірки (§0, після Кроку A)

```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок (144 попередження, усі наявні до цього кроку)
npx jest            → 108 сюїт / 1425 тестів ✅ (було 107/1418; +1 сюїта invite-link, +6 тестів assignee/invite-link, 1 існуючий тест підправлено під нове поле 'assignee')
```

## §4 Команда — Крок B (2026-09-19)

**Реалізовано:**
- **Коментарі та @згадки (§4.4)** — `utils/comments.ts` (тип `Comment`,
  `@[Ім'я](user:id)` формат згадки, парсинг/рендер, `canEditComment`/
  `canDeleteComment` за матрицею §4.1), `components/shared/CommentsSection.tsx`
  (спільна секція: стрічка коментарів + інпут з автодоповненням `@`,
  редагування власного, видалення власного/будь-чого власником проєкту).
  Підключена у ДВОХ місцях: вкладка «Коментарі» деталі завдання
  (`TaskDetailHeader` — нова вкладка, `app/(tabs)/index.tsx`, показується
  лише коли `task.projectId` є) і у `MeetingFormSheet` (лише коли форма
  редагує ЗБЕРЕЖЕНУ нараду проєкту) — обидва місця вже єдині редактори
  завдань/нарад на застосунок, тож нового екрана не знадобилось.
  Читання/запис — `loadData`/`updateSynced('comments', …)`, той самий
  патерн, що й `app/project/[id]/meetings.tsx`; колекція `comments` уже була
  в `PROJECT_COLLECTIONS`/маршрутизації outbox (Крок A), тут лише вперше
  щось у неї пише.
- **Стрічка активності (§4.6)** — `store/project-activity.ts` (REST
  `GET /projects/{id}/activity/`, не синкається), `utils/projectActivity.ts`
  (чисте форматування рядка з білого списку verb/changes), новий екран
  `app/project/[id]/activity.tsx` (прихований таб у `_layout.tsx`, як
  `members`) з пагінацією `before`. Точки входу: картка на Огляді (останні 5
  записів + «Уся активність») і рядок у Налаштуваннях проєкту (видно всім
  ролям — читання, не редагування).
- **Push у простір проєкту (§7)** — `utils/pushLink.ts` (чиста
  `pushTapUrl`, окремо від `store/push.ts` заради юніт-тесту без нативних
  модулів): `project_invite` → Огляд проєкту; `assigned`/`status_changed`/
  `mentioned` на `tasks` → повний редактор задачі (`(tabs)?open=`, той
  самий шлях, що й `openTask` з деталі проєкту — редактор сам підхоплює
  `returnToProject` з `task.projectId`); `mentioned` на `meetings` → новий
  `?open=<id>` у `app/project/[id]/meetings.tsx` (відкриває аркуш наради
  БЕЗ гейта `canEdit` — контракт §4.1 дозволяє глядачу читати/коментувати).
  `store/push.ts` `PushPayloadData` розширено полями `project_id`/
  `collection`/`local_id` контракту §7.
- **«Спільне» прибрано (§6.3) — жорсткий перехід:** видалено
  `app/(tabs)/shared.tsx` (2394 рядки), пункт таба (`_layout.tsx`), пункт
  сайдбара планшета (`constants/nav.ts` — групування «Особисте»/«Ще» тепер
  дослівно збігається з веб-переліком без легасі-хвоста), плитку й секцію на
  «Сьогодні» (`app/(tabs)/today.tsx`, картки завдань/оплат тепер зсуваються
  під «Фінанси + Час» замість «Спільного»), рядок у Налаштуваннях, згадку в
  `offlineDesc` (uk/en), аналітичні події `SharedGroupCreated`/
  `SharedSecretShared` (`utils/analytics.ts`). Нова міграція сховища
  `store/migrations.ts` `removeSharedFeatureKeys()` — прибирає
  `shared_device_id`/`shared_groups_list`/`shared_group`/
  `shared_section_counts` і всі динамічні `shared_items_<sid>` через
  `AsyncStorage.getAllKeys()`, ідемпотентно.

**Свідомо не зроблено / залишено як є в цьому кроці:**
- Автодоповнення `@` у `CommentsSection` бере хвіст ПІСЛЯ ОСТАННЬОГО `@` в
  усьому тексті (без відстеження позиції курсора через `onSelectionChange`) —
  коректно для типового «пишу в кінці» на мобільному, але не для вставки
  згадки посеред уже написаного тексту. Мінор, легко донести пізніше.
- Глядач (`viewer`) і далі не бачить рядок наради в списку
  `app/project/[id]/meetings.tsx` (`onPress` лишився гейтованим `canEdit` —
  преіснуюча поведінка, не чіпалась навмисно, щоб не розширювати периметр
  зміни), тож коментувати нараду з ЦЬОГО списку глядач поки не може; той
  самий екран через push (`?open=`) чи через агрегований `app/meetings.tsx`
  (де гейта немає) — може. Повний viewer-паритет нарад (read-only форма,
  як уже зроблено для нотаток) — окремий дрібний крок.
- Стрічка активності не має власного розділу в `constants/projectNav.ts`
  (як і «Учасники») — навмисно, контракт не вимагає таба, лише ендпоінт;
  вхід через Огляд/Налаштування.
- Push-тап на `mentioned` для `comments`-колекції безпосередньо (відкрити
  саме коментар, підсвітити його) не робиться — відкривається ціла
  задача/нарада, де стрічка коментарів унизу; прокрутка до конкретного
  коментаря не реалізована (contract §7 вимагає лише «відкрити елемент», не
  скрол до коментаря).

## Перевірки (§0, після Кроку B)

```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок (143 попередження — усі наявні раніше, жодного нового)
npx jest            → 111 сюїт / 1452 тести ✅ (було 108/1425; +3 сюїти:
                       comments, push-link, project-activity-format; +3 тести
                       в migrations.test.ts на removeSharedFeatureKeys)
```

## Веб (flowi-web-app) — нотатки з рев'ю §2/§4 (2026-09-19)

Журнал прогресу веба свій репо не веде (див. шапку файлу), але наступні дві
розбіжності з контрактом зафіксовано тут за прямою вимогою рев'ю — обидві
свідомі, не блокують план, але мають бути видимі, а не лише в git-історії.

- **`lib/registration.ts` (веб) зберігає `request_id`/`request_token`
  заявки на реєстрацію (§2.4–2.5) під ключем localStorage
  `flowi_pending_registration`.** Контракт §9.1 перелічує веб-ключі
  (`flowi_workspace`, `flowi_recent_projects`, `flowi_pending_invite`) і не
  згадує цей — там для нього прописано лише мобільний бік
  (`pending_registration` в AsyncStorage + токен окремо в SecureStore
  `flowi_registration_token`). Для веба окремого SecureStore немає (весь
  localStorage і так лише текст), тож пара `requestId`/`requestToken`
  лежить в одному записі — прийнятно для веб-політики «online-only, без
  чутливих локальних даних», але контракт про це мовчить. §9.3 так само не
  згадує цей ключ у списку веб-очистки при звичайному `logout()` — і він
  туди свідомо НЕ входить (заявка на реєстрацію ще не привʼязана до
  жодного акаунта, вихід із щойно створеного акаунта не повинен губити
  чужу заявку в тому самому браузері); чистить його лише
  `changeWorkspace()` (`lib/auth-context.tsx`), бо там ідентифікатор заявки
  прив'язаний до workspace, який людина покидає.
- **`app/app/admin/page.tsx` дозволяє міняти лише `registration_mode`.**
  Контракт §2.7 `PATCH /admin/workspace/` приймає й `name`, `color`,
  `logo_url`, `min_mobile_version`, `min_web_version` — жодне з них не
  редагується у веб-UI. План (§2) вимагає для веба лише перемикач режиму,
  список заявок і список користувачів (усі три є), тож це не блокує §2, а
  зафіксований тут пробіл: за потреби змінити назву/колір/мін.версії
  workspace адмін має редагувати їх напряму через API чи інший клієнт.

## Runtime workspace (мобільний) — виправлення з рев'ю (2026-09-19)

**Виправлено:**
- **`_firstCompatCheckPending` міг лишитись `true` увесь перший сеанс**
  (major) — на свіжому інсталі й апгрейді з 1.0.x `workspace_config` ще
  нема, а `AuthGate` (`app/_layout.tsx`) викликав `refreshWorkspaceCompatibility()`
  лише `if (config)`. Прапорець (стартове значення `true`,
  `store/api-config.ts`) тоді не скидався до рестарту застосунку, і
  `SyncGate` тримав `isAuthed=false` для `SyncProvider`/`ProjectSyncProvider`
  навіть ПІСЛЯ входу — ні `ws/user/`, ні синк/сокети проєктів. Виклик тепер
  БЕЗ УМОВИ на `config`: `refreshWorkspaceCompatibility()` вже сама коротко
  виходить і скидає прапорець, коли конфігу нема. Тести —
  `__tests__/workspace.test.ts` (`isFirstCompatCheckPending` скидається і
  без конфігу, і після мережевої помилки, і після успіху).
- **Рейс `logout()`/`switchWorkspace()`/`deleteAccount()` з обміном, що вже
  йде** (major, контракт §2.3 «дані одного сервера ніколи не потрапляють на
  інший») — `setIsAuthed(false)` ставили лише ПІСЛЯ `clearLocalDataForWorkspaceSwitch()`,
  тож `doSync`/`syncProject`, що встиг стартувати ДО виходу (WS-сигнал,
  5-хвилинний поллінг, повернення з фону), міг дописати курсор/ревізії/пул
  покинутого акаунта в щойно витерте сховище — наступний вхід бачив
  `data_owner == null` при непорожніх локальних даних і мовчки вивантажував
  чи пропонував злити чужі дані. Додано `closeSyncSessionBeforeWipe()`
  (`store/auth.tsx`): `setIsAuthed(false)` зачиняє гейт СИНХРОННО, далі
  чекаємо (з тайм-аутом 8с) на `waitForSyncIdle()` (`store/sync-engine.tsx`)
  і `waitForAllProjectSyncsIdle()` (`store/project-sync.ts`) — обидва нові
  експорти дочікуються обміну, що вже стартував, — і лише тоді стираємо
  сховище. Викликається в усіх трьох місцях (`logout`, `switchWorkspace`,
  `deleteAccount`) перед `clearLocalDataForWorkspaceSwitch()`.
- **`resolveDataOwnership` міг зависнути назавжди** (minor) — проміс
  резолвився лише всередині `.then(resolve)` обробників кнопок `Alert`, без
  `.catch`: помилка в `wipeLocalSyncedData()`/`uploadLocalDataToAccount()`/
  `setDataOwner()` лишала `login`/`register`/approve-реєстрацію висіти
  назавжди зі спінером. Додано `.catch(...).finally(resolve)` — сесія
  завершується (чи явно падає) навіть якщо злиття даних не вдалось.
- **Легасі-outbox міг піти в непорожній акаунт до §9.2-діалогу** (minor) —
  коли власника не визначено (`ownerUnresolvedAtStart`/`retry_later`),
  `doSync` уже пропускав `generateFullOutbox`, але фільтр `isPersonalOutboxItem`
  усе одно штовхав ЛЕГАСІ-рядки, що вже лежали в outbox до входу. Фільтр
  тепер додатково виключає легасі-мутації (без `workspace_id`/до-релізні),
  доки власника не визначено.
- **`push_token`/`registerPushToken` без EAS `projectId`** (major, §2.8) —
  `resolveEasProjectId()` не знаходить `expo.extra.eas.projectId` (нема в
  `app.json`) і нема `eas.json`, тож `getExpoPushTokenAsync` ніколи не
  викликається: жоден push-токен не реєструється, і §7 (пуш про заявку
  адміну, пуш про рішення заявнику) працює лише поллінгом. **Це не
  виправлено кодом** — потрібен реальний EAS project id (створення проєкту
  в Expo/EAS не робиться з цього репо) — зафіксовано тут як **блокер
  релізу**: перед продакшн-збіркою потрібно (1) `eas init` або ручний
  запис `expo.extra.eas.projectId` в `app.json`, (2) `eas.json` з профілями
  збірки. `store/push.ts` уже логує `__DEV__`-попередження при відсутньому
  `projectId`.
- **`refreshProfile()`/`completeSession()` з порожнім `workspaceId`** (minor)
  — для апгрейд-користувача, що вже автентифікований, але ще на `/workspace`
  (нема `workspace_config`), `cachedWorkspaceConfig()?.workspaceId ?? ''`
  міг записати `data_owner`/`push_token_registered` з порожнім
  `workspaceId`. `refreshProfile()` тепер пропускає виклик, доки
  `workspace_config` не з'явиться (`AuthGate` і так не пускає далі `/workspace`
  без нього) — `completeSession()` не займали, бо туди `workspaceId` завжди
  приходить разом із щойно встановленим `workspace_config` (login/register
  ідуть ПІСЛЯ вибору workspace).

## Перевірки (§0, після виправлень рев'ю)

```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок (145 попереджень — на 1 менше, ніж до цього
                       проходу; жодного нового)
npx jest            → 112 сюїт / 1475 тестів ✅ (+4 тести:
                       __tests__/workspace.test.ts — isFirstCompatCheckPending)
```

## §5 — оновлення CLAUDE.md (2026-09-19)

Аудит підтвердив: §1–§4 плану (workspace, простір проєкту соло, синк-рушій
проєктів `store/project-sync.ts` з окремим курсором на проєкт і
`ws/project/{id}/`, маршрутизація outbox `utils/projectStream.ts`,
опційні `projectId`/`startDate`, налаштування проєкту `template`/`modules`/
типізовані статуси, `recent_projects`, команда) — уже реалізовані й
перевірені попередніми проходами (див. розділи вище), коду не бракує.
Єдина незакрита вимога §5 — **`CLAUDE.md` не встигав за структурою й
переліком storage-ключів** (не згадував `app/workspace.tsx`,
`app/project/[id]/*`, `store/project-sync.ts`, `store/auth.tsx`, нові
хуки/утиліти команди, нові ключі `workspace_config`, `project_sync_state_v1`,
`recent_projects`, `comments` тощо, а також адитивні поля `startDate`/
`projectId`/`assigneeId` в наявних масивах). Оновлено розділи «Стек»,
«Структура» і «Storage ключі» відповідно до `WORKSPACE_PROJECTS_CONTRACT.md`
§9.1 і фактичного дерева репо. Кодових змін не робилось — лише документація;
`npx tsc --noEmit` після правки так само чистий.

Залишок §5 (`makemigrations --check`, README сервера self-host) — поза
периметром мобільного репо, ведеться відповідними репо самостійно (як і
сказано в шапці цього файлу).

## Виправлення з ревʼю простору проєкту (2026-09-19, другий прохід)

**Виправлено:**
- **Переміщення запису між потоками могло тихо загубитись назавжди** (major,
  §3.5) — і `applyProjectPull` (`store/project-sync.ts`), і `applyPullResponse`
  (`store/sync-engine.tsx`) трактували вхідний upsert як «чужий потік» і
  пропускали його, щойно ЛОКАЛЬНА копія (за старим `projectId`) маршрутизувалась
  деінде — не перевіряючи, куди веде сама вхідна мутація. Переміщення §3.5 —
  це `delete` у старому потоці + `upsert` у новому; який pull приходить першим,
  залежить від WS/дебаунсу й недетерміновано. У програшному порядку guard
  блокував саме той upsert, що мав завершити переміщення, а тумбстоун іншого
  потоку потім видаляв запис остаточно (P1→P2, і симетрично P→Personal).
  Тепер guard пропускає upsert, чиї ВЛАСНІ дані маршрутизуються саме в потік,
  що синкається, — навіть якщо стара локальна копія ще належить іншому. Тести:
  `__tests__/project-sync-orchestration.test.ts` (`syncProject`) та
  `__tests__/sync-orchestration.test.ts` (`pullAllFromServer`) — обидва
  падають на старому коді й проходять на новому.
- **Діалог видалення проєкту обіцяв менше втрат, ніж насправді, і мав гонитву**
  (minor) — `app/projects.tsx`: `"Завдання проекту залишаться, але без
  прив'язки"` мовчав про наради/нотатки/записи часу/фінанси проєкту, які
  `wipeLocalProject` (§9.4) видаляє з пристрою разом із проєктом; текст був ще
  й хардкодом повз i18n (`tr.projectTasksRemain` існував, але не
  використовувався). Переписано `tr.projectTasksRemain` (uk/en) на чесний
  опис, `app/projects.tsx` тепер бере текст/заголовок/кнопки з `tr`. Гонитва:
  `queueProjectDeletion` (DELETE + `wipeLocalProject`) ставилась ПАРАЛЕЛЬНО
  (void) з відв'язкою задач/спринтів від проекту — швидкий DELETE міг
  випередити відв'язку і видалити задачі проєкту разом із ним замість того,
  щоб лишити їх без прив'язки. Тепер видалення ставиться в чергу лише в
  `finally` після відв'язки.
- **`isMyTask` рахував будь-яку непризначену задачу без `createdBy` «моєю» для
  КОЖНОГО учасника** (minor, §3.7) — `utils/taskUtils.ts`: легасі/мігровані
  задачі без автора з'являлись би в «Сьогодні»/«Завдання» всіх учасників
  команди (§4 уже реалізовано) одночасно. Контракт вимагає дослівну рівність
  `createdBy == me`, без фолбеку на відсутність поля — так і зроблено. Тести:
  `__tests__/task-today.test.ts`, `__tests__/task-list-view.test.ts` (оновлено
  сценарії, що раніше фіксували стару поведінку).
- **Особисті статуси синкались без явного `type`** (minor, §3.3) —
  `mergeTaskStatusColumns` рахує `type` лише ПРИ ПОКАЗІ, сам запис у сховищі
  (і те, що йде в синк на інші пристрої/web) лишався без поля для колонок,
  створених до його появи. Додано одноразову ідемпотентну міграцію
  `migratePersonalStatusTypes` (`store/migrations.ts`, `saveSynced` — щоб
  зміну побачили й інші пристрої), що дописує похідний `type` кожній
  ОСОБИСТІЙ колонці без нього. Тести — новий блок у `__tests__/migrations.test.ts`.
- **`deduplicateOutbox` губив `force` при наступній звичайній правці** (minor)
  — `store/synced-storage.ts`: дедуп «останній перемагає» брав ОСЬ ВЕСЬ
  запис останнього елемента, тож `force: true` від `markDirty` (конфлікт,
  вирішений на користь локальної сторони) зникав, якщо до відправки встигала
  лягти звичайна правка того самого запису — сервер підняв би той самий
  конфлікт знову. Тепер форма береться з останнього елемента, а `force` —
  якщо його мав БУДЬ-ЯКИЙ елемент цього ключа. Тест — новий кейс у
  `__tests__/sync-engine.test.ts` (`deduplicateOutbox`).

**Перевірки:**
```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок, 146 попереджень (усі наявні раніше — жодного
                       нового в змінених файлах)
npx jest            → 112 сюїт / 1487 тестів ✅
```

## Виправлення з ревʼю простору проєкту (2026-09-19, третій прохід)

**Виправлено:**
- **`isMyTask` (дослівна рівність) ховала власні задачі власника одразу
  після потрапляння в проєкт без `createdBy`** (major, §3.7) — попередній
  прохід прибрав фолбек навмисно (щоб задача без автора не «моя» для КОЖНОГО
  учасника команди), але нічого не заповнювало `createdBy` двом джерелам
  таких записів: (a) соло-задачі, перенесені §3.6-міграцією сервера (копіює
  дані як є), і (b) особиста задача, якій просто вибрали проєкт у редакторі
  `(tabs)/index.tsx` (`use-task-editor` фіксує лише сам факт зміни поля
  «Проєкт», не авторство). Обидва власник більше не бачив у «Сьогодні»/
  «Завдання». Додано: `createdByAfterProjectChange` (`utils/taskUtils.ts`,
  чиста функція) — застосовується в `saveTaskEdit` одразу після
  `retargetTaskProject`, коли `edited.has('project')`; і одноразова
  ідемпотентна міграція `backfillProjectTaskCreatedBy` (`store/migrations.ts`)
  — дописує `createdBy` поточного користувача задачам БЕЗ автора лише в
  проєктах, де він **owner** (роль — з `project_sync_state_v1`, фолбек
  `workspace_projects`, той самий фолбек-на-owner, що й
  `hooks/use-project-roles.ts`); чужі задачі команди (member/viewer) не
  чіпає — авторство собі приписати не можна. Тести: новий блок у
  `__tests__/task-editor.test.ts` (`createdByAfterProjectChange`) і в
  `__tests__/migrations.test.ts` (`backfillProjectTaskCreatedBy`, 5 кейсів).
- **Таймлайн проєкту зсував дати на день раніше для UTC+2/+3 (Україна)**
  (major) — `app/project/[id]/tasks.tsx` переднаповнював поля редактора
  `task.startDate.slice(0, 10)`/`.slice(0, 10)` — зрізом УТС-компонентів ISO
  замість локальної дати: північ 20 вересня за Києвом лежить у сховищі як
  `…T21:00Z` 19-го, і зріз показував «19». «Зберегти» без жодної правки (чи
  правка лише одного поля) тоді тихо переписувало ОБИДВІ дати на день
  раніше. Виправлено: переднаповнення тепер через `localDateKey(new
  Date(...))` (локальні `getFullYear`/`getMonth`/`getDate`, не зріз рядка);
  нова чиста функція `resolveTimelineDatePatch` (`utils/dateUtils.ts`)
  порівнює поточне значення поля з тим, що форма показувала при відкритті
  (`orig*`), і повертає патч лише для РЕАЛЬНО зміненого поля — друге лишається
  байт-у-байт тим, що вже в задачі, навіть якщо круговий парсинг дав би той
  самий день. Тести — новий блок у `__tests__/dateUtils.test.ts`
  (`parseLocalDateInput` межові кейси + `resolveTimelineDatePatch` 5 кейсів,
  включно зі сценарієм UTC-півночі попереднього дня).
- **Застарілий коментар над Таймлайном** (minor) — рядок над `ProjectGantt`
  досі стверджував, що тягнення країв не реалізоване, хоча
  `onGanttEdgeDrag`/`shiftGanttEdge` (попередній прохід) якраз це й додали.
  Виправлено формулювання на місці; коментар угорі файлу вже був точним.
- **Редундантна мутація `projects` у перший `/sync/` щойно створеного
  проєкту** (minor, §3.2) — `ensureProjectOnServer` (POST `/projects/`)
  заводить `projects/{id}` на сервері з ревізією 1, але `ProjectSummary` у
  відповіді цю ревізію не несе, тож outbox-рядок upsert того самого запису
  (поставлений локальним створенням проєкту) все одно йшов у ЦЕЙ ЖЕ
  `/projects/{id}/sync/` з `base_revision: null` — зайвий конфлікт або no-op
  проти щойно надісланих даних. `syncProject` тепер прибирає цей рядок з
  outbox одразу після успішного `ensureProjectOnServer` у гілці «проєкт ще
  не знайомий серверу», а не будує з нього мутацію. Тест —
  `__tests__/project-sync-orchestration.test.ts` (перевіряє порожній
  `mutations` у тілі `/sync/` і порожній outbox після).

**Перевірки:**
```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок, 146 попереджень (той самий набір, що й до
                       цього проходу — жодного нового в змінених файлах)
npx jest            → 112 сюїт / 1512 тестів ✅ (+25 тестів)
```

## §4 Крок A — залишок «бейдж виконавця» (2026-09-19, четвертий прохід)

Статус (Крок A) фіксував: «Активний таб/картка завдання ще не показує
аватар/ім'я виконавця — лише пікер у формі. Бейдж на `TaskCompactCard» —
наступний дрібний крок.» Зроблено цей крок:

- **`utils/taskUtils.ts` `assigneeDisplayName`** (чиста функція) — «Я», коли
  `assigneeId` дорівнює поточному користувачу (той самий фолбек, що вже
  показує пікер `TaskEditForm`), інакше ім'я/email учасника з кешу
  `project_members_v1`, `null` — коли виконавця нема або кеш ще не знає
  такого учасника (щоб не показати «невідомий» після видалення з команди).
  Приймає мінімальну структурну форму `{ user: { id, name, email } }`
  (`AssigneeLookupMember`), а не сам `MemberOut` — щоб утиліта не тягла
  залежність на конкретний REST-тип.
- **`hooks/use-project-members.ts`** — новий `useAllProjectMembers()`
  (увесь кеш `project_members_v1` одразу, усі проєкти), поверх нього
  переписаний наявний `useProjectMembers(projectId)` (той самий контракт,
  без зміни викликів). Потрібен там, де картки одного списку належать
  РІЗНИМ проєктам одночасно («Сьогодні»/«Завдання», «Всі (N)») — на
  відміну від пікера форми, якому досить учасників ОДНОГО обраного проєкту.
- **`components/tasks/TaskCompactCard.tsx`** — новий необов'язковий пропс
  `assigneeLabel`: чіп «person.fill + ім'я» поруч із лічильником підзавдань
  (лише коли є), ім'я додано в `a11ySummary` картки для VoiceOver.
  Рахується ЗАВЖДИ на екрані-джерелі, не в самій картці — компонент і так
  не знає ні поточного користувача, ні складу команд інших проєктів.
- Підключено в трьох місцях, де рендериться `TaskCompactCard`:
  `app/(tabs)/index.tsx` (список + прострочені; `useAllProjectMembers`,
  бо завдання йдуть з усіх проєктів разом), `app/task-group.tsx` («Всі
  (N)», та сама причина), `app/project/[id]/tasks.tsx` (усі чотири
  подання — Список/Дошка/Календар/Таймлайн-картки; тут досить
  `useProjectMembers(projectId)`, бо проєкт один).
- Тести — `__tests__/task-editor.test.ts` (`assigneeDisplayName`,
  6 кейсів: без assigneeId, «Я», чуже ім'я, фолбек на email, видалений
  учасник, без сесії).

**Перевірки:**
```
npx tsc --noEmit   → 0 помилок
npx eslint .        → 0 помилок, 146 попереджень (той самий набір — жодного
                       нового)
npx jest            → 112 сюїт / 1518 тестів ✅ (+6 тестів)
```

