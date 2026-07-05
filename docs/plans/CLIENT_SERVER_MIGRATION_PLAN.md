# План: перехід на класичну клієнт-серверну взаємодію (акаунти + синхронізація + навігація)

**Дата:** 2026-07-05
**Статус: ✅ РЕАЛІЗОВАНО (2026-07-05, Фази 0–5).** Виконано оркестрацією суб-агентів (Sonnet) під контролем Fable 5. Відхилення від плану: (1) на сервері використано стандартний `django.contrib.auth.User` (email в username+email) замість кастомного `accounts.User` — зміна `AUTH_USER_MODEL` на вже змігрованій БД високоризикова; (2) протокол sync розширено полем `force:true` (перезапис після ручного вирішення конфлікту) та no-op при ідентичному payload. Верифікація: сервер — 33/33 тестів, клієнт — 81/81 тестів, tsc без нових помилок. Не закомічено — обидва робочі дерева чекають на ревʼю.
**Запит:**
1. Класична взаємодія: реєстрація/логін, всі дані синхронізуються з сервером; перемикач офлайн — дані не відправляються; при перемиканні офлайн→онлайн — запитання про синхронізацію.
2. Повернути «Завдання» в нижній таб-бар, прибрати «Спільне» з табів і зробити кнопку на домашньому екрані; розширити функціональність домашнього екрана.
3. Форми реєстрації/логіну + опція «Розпочати офлайн»; якщо неавторизований користувач вмикає онлайн — просити зареєструватись або увійти.

---

## ЧАСТИНА I. Аналіз поточного стану

### 1.1. Мобільний застосунок (Expo ~54, RN 0.81, expo-router ~6)

**Дані:** повністю офлайн-first. Все в AsyncStorage через `store/storage.ts` (`loadData`/`saveData`).

**Доменні сутності (SYNC_KEYS у `store/sync.ts`, 18 колекцій):**
```
tasks, transactions, time_entries, notes, projects, meetings,
health_entries_v2, workouts, exercises, workout_programs,
savings_jars, containers, bugs, ideas,
health_meds, health_checkups, health_vaccines, health_habits
```
Додатково (не в SYNC_KEYS, але в експорті `app/data.tsx`): `categories`, `budget_limits`, `finance_balance_adjustments`, `finance_currencies`, `finance_primary_currency`.
**Не синхронізується свідомо:** `health_profile`, `health_reminders` (локальні за CLAUDE.md), налаштування UI (`lang_option_v1`, тема, `app_mode`).

**Синхронізація зараз:** P2P з десктопом по WiFi (`app/sync.tsx` → `http://{IP}:7842/`), merge за timestamp у `store/sync.ts` (`mergeArraysWithConflicts`), ручне вирішення конфліктів (`store/sync-conflicts.ts`, ключ `sync_pending_conflicts`, UI «Залишити моє / Прийняти інше»). Ключ `last_sync_timestamp`.

**Вже є заготовки (перевикористовуємо):**
- `store/app-mode.tsx` — `AppModeProvider` + `useAppMode()` + `isOnlineMode()`, персист `app_mode` ('online'|'offline'), перемикач уже в Налаштуваннях («Режим роботи»). Це ядро для пункту «офлайн не відправляє дані».
- `store/api-config.ts` — `API_BASE = 'https://api.flowi.casperdev.site/api'`, `WS_BASE` — вже вказує на наш сервер.
- `store/supabase.ts` — **невикористаний** Supabase-клієнт (мертвий код).
- `app/(tabs)/shared.tsx` (~2070 рядків) — «Спільне»: групи за секретом, device_id, sync/WS із сервером.

**Таби зараз** (`app/(tabs)/_layout.tsx`, `initialRouteName: 'today'`):
- Видимі: **Today | Спільне (shared) | Фінанси (explore) | Здоров'я | Налаштування**
- Приховані (`href:null`): **index (Завдання!)**, time, agent

**Домашній екран** `app/(tabs)/today.tsx` (171 рядок) — мінімальний: привітання за часом доби, 4 кільця здоров'я, лічильник активних/прострочених завдань, баланс місяця, час за сьогодні. Всі блоки — лише навігаційні тапи.

**Авторизація:** відсутня повністю (немає екранів, токенів, protected routes).

### 1.2. Сервер (`flowi-server-app`: Django 6 + DRF + Channels/Daphne)

- **БД:** SQLite (dev) / PostgreSQL через `DATABASE_URL` (prod: api.flowi.casperdev.site, systemd).
- **Auth:** немає (`DEFAULT_AUTHENTICATION_CLASSES: []`), `CORS_ALLOW_ALL_ORIGINS = True`. Ідентифікація — анонімний `Device` (UUID у body).
- **Моделі:** `Device`, `Group` (secret `ABCD-1234`, ротація), `GroupMember`, `SharedSection`, `SharedItem` (`local_id` + JSONField `data` + `updated_at` + soft-delete `deleted`, unique `(section, local_id)`).
- **Ендпоінти:** `devices/register`, groups create/join/leave/refresh-secret/notify, sections CRUD, items upsert, `POST /api/sync/` (bulk push + delta pull за `since`) — **тільки для групового «Спільного»**.
- **WS:** `ws://…/ws/group/{id}/` — read-only broadcast.
- **Rate limits:** IP-based (join 10/год, write 120/хв).

**Висновок:** сервер вміє *групові* дані, але не має User-auth і жодної моделі для *особистих* 18 колекцій клієнта. Патерн `SharedItem` (local_id + JSON data + updated_at + deleted) — готовий шаблон для per-user синхронізації.

### 1.3. Ключове архітектурне рішення

**Бекенд — існуючий Django-сервер** (не Supabase): він уже задеплоєний, клієнт уже ходить на нього для «Спільного», патерн sync уже відпрацьований. `store/supabase.ts` — видалити.

**Модель даних на сервері — узагальнена, НЕ 18 таблиць:** клієнт зберігає колекції як JSON-масиви, серверу не потрібно розуміти структуру Task/Transaction. Одна модель:

```python
class UserItem(models.Model):
    id         = UUIDField(pk)
    user       = FK(User, CASCADE)
    collection = CharField(choices=SYNC_COLLECTIONS, db_index=True)  # 'tasks', 'transactions', ...
    local_id   = CharField(max_length=64, db_index=True)             # client id
    data       = JSONField()                                         # весь об'єкт
    updated_at = DateTimeField(auto_now=True)
    deleted    = BooleanField(default=False)
    class Meta:
        unique_together = ('user', 'collection', 'local_id')
```
Плюси: одна міграція, один sync-ендпоінт, нові колекції додаються без змін сервера. Мінуси (прийнятні): немає серверних запитів по полях — сервер лише сховище/синк-хаб.

---

## ЧАСТИНА II. Цільова архітектура

```
┌────────────── Mobile (Expo) ──────────────┐      ┌───────── Django ─────────┐
│ AsyncStorage (source of truth локально)   │      │ User (email+password)     │
│ store/auth.tsx     — сесія, JWT (SecureStore)◄──►│ /api/auth/* (simplejwt)   │
│ store/app-mode.tsx — online/offline       │      │ UserItem (per-user sync)  │
│ store/sync-engine.ts — outbox + push/pull ◄─────►│ /api/sync/user/           │
│   saveData() → markDirty(collection)      │      │ Device → прив'язка до User│
│   online: авто-синк (debounce/focus)      │      │ Group/SharedItem (як є)   │
│   offline: НІЧОГО не відправляє           │      └───────────────────────────┘
└───────────────────────────────────────────┘
```

**Принципи:**
- **Offline-first залишається:** AsyncStorage — первинне сховище, UI ніколи не чекає мережу. Сервер — реплікація/бекап/мультидевайс.
- **Офлайн-режим** = `isOnlineMode() === false` → sync-engine повністю мовчить (жодного fetch), зміни лише накопичуються в outbox.
- **Офлайн → онлайн** = Alert «Синхронізувати дані з сервером?» (Так / Пізніше). Якщо не авторизований → екран/модал «Для онлайн-функцій потрібен акаунт» → Увійти / Зареєструватись / Залишитись офлайн.
- **Онлайн + авторизований** = авто-синк: при старті, при поверненні застосунку в active, після локальних змін (debounce ~5с), pull-to-refresh.

### 2.1. Протокол синхронізації (per-user)

`POST /api/sync/user/` (JWT у `Authorization: Bearer`):
```jsonc
// Request
{
  "since": 1730000000000,            // last_server_sync_at (0 = перший синк)
  "device_id": "uuid",               // для виключення echo у WS
  "items": [                          // dirty items з outbox
    { "collection": "tasks", "local_id": "…", "data": {…}, "deleted": false,
      "client_updated_at": "ISO" }
  ]
}
// Response
{
  "server_time": 1730000005000,
  "items": [ /* усе, що змінилось на сервері since, крім надісланого цим device */ ],
  "conflicts": [ /* item, де server.updated_at > since І client теж прислав зміну */ ]
}
```
- **Upsert:** last-write-wins за `client_updated_at` vs серверний `updated_at`; спірні пари повертаються в `conflicts` → клієнт кладе їх у наявний механізм `sync_pending_conflicts` (UI вже є в `app/sync.tsx` — перевикористати).
- **Видалення:** soft-delete (`deleted: true`) — клієнт при видаленні items пише tombstone в outbox.
- **Пагінація pull:** `items` чанками по 500 + `next_cursor` (перший синк може бути великим).
- **Перший логін на новому пристрої:** `since=0` → повний pull; локальні дані мерджаться наявним `mergeArraysWithConflicts`.

### 2.2. Sync-engine на клієнті (`store/sync-engine.ts` — новий)

- **Outbox:** ключ `sync_outbox` — `{collection, local_id, deleted, at}[]` (без data — data читається зі сховища в момент push, дедуп за collection+local_id).
- **Хук у storage:** `saveData()` не чіпаємо (низькорівневий); додаємо `saveCollection(key, items, changedIds?)` або markDirty-виклики в екранах через тонкий wrapper. **Рішення:** обгортка `store/synced-storage.ts` з `saveSynced(key, items)` — сама diff-ить проти попереднього стану (Map за id) і пише outbox; екрани мігруються поступово (Фаза 4), несмігровані колекції синкаються fallback-ом «повний push колекції».
- **Тригери:** `AppState → active`, таймер 5 хв, debounce 5с після markDirty, ручна кнопка. Всі тригери — за умови `isOnlineMode() && isAuthenticated()`.
- **Стани:** `idle | syncing | error | conflicts(n)` — індикатор у Налаштуваннях і на Today.
- **Ключі:** `last_server_sync_at`, `sync_outbox`, наявний `sync_pending_conflicts`.

### 2.3. Автентифікація

**Сервер** (`djangorestframework-simplejwt`):
- `POST /api/auth/register/` — {email, password} (+ optional name) → User + пара токенів.
- `POST /api/auth/login/` — → access (15 хв) + refresh (30 днів, rotation + blacklist).
- `POST /api/auth/refresh/`, `POST /api/auth/logout/` (blacklist refresh).
- `GET /api/auth/me/` — профіль.
- Пароль: Django validators (min 8). Rate-limit логіну per-IP+email. `CORS_ALLOW_ALL_ORIGINS` → whitelist.
- `Device.user = FK(User, null=True)` — прив'язка пристрою після логіну (`POST /api/devices/claim/`), щоб «Спільне» працювало під акаунтом; старі анонімні девайси продовжують працювати (сумісність).

**Клієнт:**
- `store/auth.tsx` — `AuthProvider`: `{ user, status: 'guest'|'authed'|'loading', login, register, logout }`. Access/refresh — в **expo-secure-store** (`npx expo install expo-secure-store`), не в AsyncStorage. Авто-refresh у fetch-обгортці `store/api.ts` (єдина точка: base URL з `api-config.ts`, Bearer, 401→refresh→retry, гейт `isOnlineMode()`).
- **Guest-режим — повноцінний:** без акаунта все працює локально (як зараз). Акаунт потрібен лише для онлайн-функцій.

### 2.4. Auth UX-флоу

```
Перший запуск (немає user і немає прапора welcome_done):
  app/welcome.tsx →  [Увійти] [Зареєструватись] [Розпочати офлайн]
       │                    │                        │
       ▼                    ▼                        ▼
  app/login.tsx      app/register.tsx      app_mode='offline', welcome_done=1 → (tabs)

Налаштування → «Режим роботи» → перемикач Онлайн:
  if (!authed)  → Alert/модал «Онлайн-функції потребують акаунта»
                  [Увійти] [Зареєструватись] [Скасувати]  (режим НЕ вмикається)
  if (authed)   → режим online + Alert «Синхронізувати дані зараз?» [Так] [Пізніше]

Логін/реєстрація успішні (з офлайну чи welcome):
  → пропозиція увімкнути онлайн і синхронізувати.
Logout:
  → Alert «Незасинхронізовані зміни буде втрачено на сервері? Дані лишаються на пристрої.»
  → clear токенів; app_mode → offline; локальні дані НЕ чіпаємо.
```
- Екрани `welcome/login/register` — Stack поза `(tabs)` (`app/welcome.tsx`, `app/login.tsx`, `app/register.tsx`), редірект у `app/_layout.tsx` за `welcome_done`. Стиль — як інші Stack-екрани (BlurView-картки, dark/light, акцент `#7C3AED`).
- «Спільне» в офлайні або без акаунта → наявний патерн OfflineOverlay (див. `docs/plans/OFFLINE_MODE_PLAN.md`) з кнопкою «Увійти».

---

## ЧАСТИНА III. Навігація та домашній екран

### 3.1. Таби (`app/(tabs)/_layout.tsx`)

| Було | Стане |
|------|-------|
| Today • **Спільне** • Фінанси • Здоров'я • Налаштування; **index (Завдання) прихований** | Today • **Завдання (index)** • Фінанси • Здоров'я • Налаштування |

- `index` — прибрати `href: null`, іконка `checklist` / `checkmark.circle.fill`, `tr.tabTasks`.
- `shared` — поставити `href: null` (екран лишається, роут працює через push). **Не видаляти файл** — 2070 рядків робочої колаборації.
- `initialRouteName: 'today'` — без змін.

### 3.2. Today — розширення (`app/(tabs)/today.tsx`)

Нове (зверху вниз):
1. **Хедер:** привітання + **бейдж режиму/синку** (офлайн `icloud.slash` / онлайн ✓ час останнього синку / конфлікти n) — тап → Налаштування або /sync.
2. **Кнопка «Спільне»** — помітна картка/рядок (`person.2.fill`, бейдж кількості групових оновлень якщо доступно) → `router.push('/(tabs)/shared')` *(або перенести shared у Stack `app/shared.tsx` — рішення на Фазі 5; мінімальний варіант — href:null таб + push)*.
3. **Швидкі дії (quick actions):** + Завдання, + Витрата, + Вода, ▶ Таймер — рядок з 4 кнопок (нове завдання → index з параметром відкриття модалки; вода → `addQuick` патерн health).
4. **Сьогоднішні завдання** — список 3–5 найближчих (deadline сьогодні/прострочені) з чекбоксом done прямо з Today (зараз — лише лічильник).
5. **Зустрічі сьогодні** — з `meetings` (час + назва), якщо є.
6. **Звички** — сьогоднішні habit-чекбокси зі streak (з `health_habits`).
7. Наявні блоки Здоров'я/Фінанси/Час — залишаються.

Компоненти виносити в `components/today/` (QuickActions.tsx, TodayTaskRow.tsx, SyncBadge.tsx) — екранний файл лише стан+layout (правило CLAUDE.md).

---

## ЧАСТИНА IV. Поетапний план впровадження

### Фаза 0 — Навігація + Today (без сервера, швидкий результат)
| Крок | Файли |
|------|-------|
| Завдання назад у таби, Спільне → href:null | `app/(tabs)/_layout.tsx` |
| Кнопка «Спільне» на Today | `app/(tabs)/today.tsx` |
| Розширення Today: quick actions, задачі сьогодні, зустрічі, звички | `app/(tabs)/today.tsx`, `components/today/*` |
| i18n нові ключі (uk+en) | `store/translations.ts` |

### Фаза 1 — Сервер: auth
| Крок | Файли (flowi-server-app) |
|------|-------|
| simplejwt + blacklist у requirements/settings; CORS whitelist | `requirements.txt`, `flowi_server/settings.py` |
| Використати Django User (email як username) або кастомний `accounts.User`; **рекомендація: кастомний `accounts.User(email unique, USERNAME_FIELD='email')` одразу** — потім міняти боляче | новий app `accounts/` |
| Ендпоінти register/login/refresh/logout/me + rate-limit | `accounts/views.py`, `accounts/urls.py`, `accounts/serializers.py` |
| `Device.user` FK (null=True) + `POST /api/devices/claim/` | `core/models.py`, міграція, `core/views.py` |

### Фаза 2 — Сервер: per-user sync
| Крок | Файли |
|------|-------|
| Модель `UserItem` (див. II) + міграція + admin | `core/models.py` (або новий app `syncdata/`) |
| `POST /api/sync/user/` — push/pull/conflicts/pagination, IsAuthenticated | `views.py`, `urls.py`, `serializers.py` |
| (опц.) WS `ws/user/` для мультидевайс-реалтайму — **відкласти**, достатньо pull-тригерів | `routing.py`, `consumers.py` |
| Тести sync-протоколу (push, delta pull, conflict, tombstone) | `tests.py` |

### Фаза 3 — Клієнт: auth
| Крок | Файли (flowi-mobile-app) |
|------|-------|
| `npx expo install expo-secure-store` | package.json |
| `store/api.ts` — fetch-обгортка (Bearer, 401→refresh, гейт isOnlineMode) | новий |
| `store/auth.tsx` — AuthProvider; підключити в root | новий, `app/_layout.tsx` |
| Екрани welcome/login/register + «Розпочати офлайн» | `app/welcome.tsx`, `app/login.tsx`, `app/register.tsx` |
| Редірект першого запуску (`welcome_done`) | `app/_layout.tsx` |
| Секція «Акаунт» у Налаштуваннях (email, вийти / кнопки увійти) | `app/(tabs)/settings.tsx` |
| Гейт перемикача онлайн: неавторизований → модал логіну; авторизований → Alert «Синхронізувати?» | `app/(tabs)/settings.tsx`, `store/app-mode.tsx` |
| Видалити `store/supabase.ts` + залежність `@supabase/supabase-js` | package.json |
| i18n (~25 ключів: auth*, sync*, account*) | `store/translations.ts` |

### Фаза 4 — Клієнт: sync-engine
| Крок | Файли |
|------|-------|
| `store/sync-engine.ts`: outbox, push/pull, конфлікти → `sync_pending_conflicts` | новий |
| `store/synced-storage.ts`: `saveSynced()` з diff → outbox; міграція екранів по колекціях (почати з tasks, transactions) | новий + екрани поступово |
| Тригери: AppState, debounce, focus; статус-контекст | `sync-engine.ts`, `app/_layout.tsx` |
| Alert «Синхронізувати дані?» при перемиканні офлайн→онлайн; повний синк після першого логіну | `settings.tsx` / `app-mode.tsx` |
| Переробити `app/sync.tsx`: серверний синк як основний режим, P2P (localhost:7842) — лишити як «Локальна синхронізація з десктопом» (запасний варіант) | `app/sync.tsx` |
| SyncBadge на Today | `components/today/SyncBadge.tsx` |

### Фаза 5 — Спільне під акаунтом + поліш
| Крок | Файли |
|------|-------|
| `claim` device після логіну; Спільне бере identity з акаунта | `shared.tsx`, `store/auth.tsx` |
| OfflineOverlay для Спільного з кнопкою «Увійти» для гостей | `shared.tsx` |
| (опц.) Перенести shared у Stack `app/shared.tsx` | `app/(tabs)/shared.tsx` → `app/shared.tsx` |
| Тести: auth-флоу, outbox diff, merge/conflict, гейт офлайну (нуль fetch) | `__tests__/` |

**Порядок:** 0 → 1 → 2 → 3 → 4 → 5. Фаза 0 незалежна і дає видимий результат одразу; 1–2 (сервер) можна вести паралельно з 0.

---

## ЧАСТИНА V. Ризики та edge cases

- **Clock skew** між пристроями (LWW за client timestamp): приймаємо для v1 (конфлікт-UI страхує); `server_time` у відповіді дозволяє клієнту знати зсув і показувати попередження.
- **Великий перший синк** (роки даних): пагінація pull + прогрес-бар; push чанками по 500.
- **Подвійна правда outbox vs дані:** outbox зберігає лише покажчики (collection+id), data читається при push — неможливо відправити застаріле.
- **Втрата токенів / протух refresh:** тихий перехід у guest + банер «Сесію завершено, увійдіть знову»; дані і outbox не чіпаємо — після логіну синк доганяє.
- **`initialized` прапор:** sync-engine пише в сховище тільки через merge existing → не перезаписує порожнім (правило CLAUDE.md зберігається).
- **Health-приватність:** `health_profile`, `health_reminders` НЕ синкати (як зараз); розглянути opt-out чекбокс «Синхронізувати дані здоров'я» у Налаштуваннях.
- **Безпека сервера:** HTTPS уже є (proxy header); додати CORS whitelist, login rate-limit, паролі — Django hasher (PBKDF2), refresh rotation+blacklist. SQLite у prod → запланувати перехід на PostgreSQL до масової синхронізації (конкурентні писання).
- **Сумісність «Спільного»:** анонімні Device лишаються валідними; `claim` — додатковий, не breaking.

## Відкриті питання (не блокують Фази 0–2)
1. Чи синкати `categories`/`budget_limits`/валютні ключі (вони не масиви з id — потрібен формат «singleton item» у UserItem: `local_id = collection`)? **Пропозиція: так, як singleton-записи, у Фазі 4.**
2. Видалення акаунта (GDPR-подібне) — ендпоінт `DELETE /api/auth/me/` з wipe UserItem: додати у Фазі 5?
3. Email-верифікація/скидання пароля — потрібен SMTP; v1 без верифікації, скидання пароля відкласти?
4. Реальна детекція мережі (`@react-native-community/netinfo`) поверх ручного режиму — окремим кроком після Фази 4 (як у OFFLINE_MODE_PLAN §6).
