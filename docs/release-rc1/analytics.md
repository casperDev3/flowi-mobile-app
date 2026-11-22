# rc1 — продуктова аналітика пілоту (S3-07)

Код: сервер `analytics/` (models, emit, views, admin, tests), хуки
`core/invites.py`, `core/team_views.py` (accept за посиланням),
`accounts/views.py` (реєстрація з invite_token), `core/workspace_views.py`
(погодження заявки), `core/project_views.py` і `core/teamwork_policy.py`
(запис задач), контекст платформи `core/middleware.py`. Веб:
`lib/analytics.ts`, `app/app/admin-workspace/analytics/page.tsx`,
`components/settings/analytics-consent-card.tsx`. Мобільний:
`store/analytics-consent.ts`, `components/settings/AnalyticsConsentCard.tsx`.

## 1. Таблиця `analytics_analyticsevent`

| Поле | Зміст |
|---|---|
| `event_id` | UUID, UNIQUE — дедуп |
| `name` | одна з подій нижче |
| `occurred_at` | час дії (сервер) |
| `user_ref` | псевдонім: перші 16 hex `HMAC-SHA256(ANALYTICS_SALT або SECRET_KEY, "user:<id>")` |
| `workspace_id` | `WorkspaceSettings.id` |
| `project_id` | id проєкту |
| `role` | роль актора в проєкті (owner/manager/member/viewer) |
| `cohort` | `ANALYTICS_COHORT` або місяць реєстрації `YYYY-MM` |
| `platform` | `ios`/`android`/`web`/`mobile`/`unknown` з `X-Flowi-Client` |

Немає: тексту задач, назв, email, імен, IP. Сіль не змінювати посеред пілоту.

## 2. Події (усі — серверні, у транзакції дії, через savepoint)

| Подія | Коли | Актор | `event_id` |
|---|---|---|---|
| `invite_sent` | перше надсилання email-запрошення (повтори не рахуються) | той, хто запросив | uuid5(invite) |
| `invite_accepted` | членство створено: email-запрошення, посилання, реєстрація з токеном, погоджена заявка | новий учасник | uuid5(invite або `request:<id>`, user) |
| `member_activated` | перша дія учасника (не власника) з задачами проєкту | учасник | uuid5(project, user) |
| `task_assigned` | `assigneeId` змінився на непорожній | хто призначив | uuid5(project, task, assignee, revision) |
| `result_submitted` | `reviewState` → `pending` (не з `needs_reviewer`) | виконавець | uuid5(project, task, revision) |
| `result_returned` | `reviewState` → `changes_requested` | перевіряючий | те саме |
| `result_accepted` | `reviewState` → `approved` | перевіряючий | те саме |

Відкат дії відкочує подію; помилка вставки події (дублікат, будь-що) відкочує
лише savepoint і ніколи не валить дію. `ANALYTICS_ENABLED=False` — вимикач.

## 3. Дедуп

Детермінований `event_id` (uuid5, фіксований namespace у `analytics/emit.py` —
не змінювати) + UNIQUE: ретрай sync-батчу, гонка двох пристроїв, повторне
прийняття — один рядок. Для `member_activated` додатково кеш у пам'яті процесу
(лише після того, як рядок точно є в БД).

## 4. Згода

Вимикач «Ділитися анонімною статистикою» (веб `/app/settings`, мобільний
«Налаштування → Підтримка») = `ui_preferences.shareAnonymousStats` (синхронізований
singleton, спільний для всіх пристроїв). Відсутнє поле = згода (дефолт увімкнено).
`false` → сервер не пише жодної події, де ця людина — актор. Минулі події не
видаляються (вони псевдонімні); видалення акаунта не каскадить (рядки без PII).

## 5. Воронка — `GET /api/admin/analytics/funnel/?from=YYYY-MM-DD&to=YYYY-MM-DD&cohort=&project=`

Лише `is_workspace_admin` (інакше 403 `not_admin`), вікно ≤ 366 днів (дефолт 30).
Агрегати рахує БД:

```sql
-- totals
SELECT name, COUNT(id) AS events, COUNT(DISTINCT user_ref) AS users
FROM analytics_analyticsevent
WHERE occurred_at >= :start AND occurred_at < :end [AND cohort = :cohort]
GROUP BY name;
-- за когортами
SELECT cohort, name, COUNT(id), COUNT(DISTINCT user_ref) FROM analytics_analyticsevent
WHERE occurred_at >= :start AND occurred_at < :end GROUP BY cohort, name;
-- по днях
SELECT DATE(occurred_at) AS day, name, COUNT(id) FROM analytics_analyticsevent
WHERE occurred_at >= :start AND occurred_at < :end GROUP BY day, name ORDER BY day;
```

Звірка (`reconciliation`, лише без фільтрів cohort/project), користувачі з
відмовою виключені з обох сторін:

| Крок | Сире джерело |
|---|---|
| invite_sent | `core_projectinvite` kind=email, send_count≥1, created_at у вікні |
| invite_accepted | `core_projectmember` з `invited_by`, joined_at у вікні (включає легасі-додавання без запрошення → очікувана додатна різниця на сервері) |
| member_activated | перша `core_projectactivity` (tasks) пари проєкт×актор (не власник) у вікні |
| task_assigned / result_* | `core_projectactivity.changes` (assigneeId / reviewState), ті самі правила |

Різниця ≠ 0 очікувана для вікна, що захоплює час до деплою rc1.

Веб-сторінка `/app/admin-workspace/analytics`: період (7/30/90/365), когорта,
воронка з конверсією (люди від попереднього кроку), звірка, когорти, дні.

## 6. Перевірка

| # | Крок | Очікування |
|---|---|---|
| 1 | Адмін запрошує email → адресат приймає → менеджер призначає задачу → виконавець подає → перевіряючий повертає → подає → приймає | на сторінці: 1/1/…; звірка delta=0 для task_assigned/result_* |
| 2 | Учасник вимикає статистику на телефоні | на вебі вимикач теж вимкнений після синку; його дії не з'являються |
| 3 | Не-адмін відкриває сторінку | «Немає прав адміністратора», 0 запитів |
| 4 | `SELECT * FROM analytics_analyticsevent LIMIT 20` | жодних назв задач/email |

Автотести: `.venv/bin/python manage.py test analytics`, веб `node --test lib/analytics.test.mjs`,
мобільний `npx jest __tests__/rc1-update-required.test.ts`.
