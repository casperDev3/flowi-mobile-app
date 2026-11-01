# Контракт задач S1-06—S1-09, версія 1

## «Моє» і спільне джерело

`contracts/task-matrix.json` — одна нормативна fixture-матриця, ідентичні копії
в server/web/mobile. Кожен репозиторій виконує її своїми production selectors.
Канонічна копія — server. Оновлювати три копії в одному релізі; перевірка
`python3 scripts/check_task_contract.py` з server звіряє SHA-256 у трьох checkout.

Виконуваний запис: немає `backlogKind`, `archivedAt`, `deleted`. Idea/bug до
конвертації не входять у персональні черги, workload, progress та діаграми.
Конвертація прибирає `backlogKind` у тому самому записі; копію не створює.

| Контекст | Особистий список | Assigned | Review | Action |
|---|---|---|---|---|
| owner / manager | Особисті + явно призначені мені | Незавершені, assignee = me | pending, reviewer = me | blockedBy = me; needs_reviewer у проєкті |
| member | Особисті + явно призначені мені | Незавершені, assignee = me | pending, reviewer = me | blockedBy = me |
| viewer | Лише особистий потік | Немає | Немає | Немає |

Автор/owner не стає виконавцем автоматично. `available` містить незавершені
непризначені задачі для активних учасників; це окрема черга, не особистий список.
Завершені призначені задачі залишаються в особистому списку/історії, але не в
робочих чергах. Approved завершує review-required задачу тільки разом зі status done.

Legacy: без projectId — особистий запис. Якщо roles-cache передано, але projectId
відсутній у ньому, старий локальний router відносить запис до особистого потоку:
беремо лише непризначені або призначені мені. Чужий assignee виключений.
Без roles-cache projectId вважається спільним: потрібне явне призначення me.
Без відомого userId записи з projectId не включаються. Відкликані спільні записи
видаляє sync; fallback не дає серверних прав і не відновлює доступ.

Усі учасники можуть читати дозволений спільний потік. My Work — проєкція тих
самих ProjectItem, не копіювання в UserItem. REST `/projects/{id}/my-work/`
повертає local_id чотирьох черг; сервер перевіряє членство.

## Атомарна зміна команди й pending

PATCH role=viewer та DELETE membership блокують рядок Project в atomic transaction.
Sync-write бере той самий lock і повторно читає права. Запит зі старою роллю,
який дочекався downgrade, відхиляється; успішний попередній запис очищується
наступним downgrade. Жодного проміжного видимого стану.

В активних задачах assigneeId/reviewerId/blockedById замінюються на валідного
не-viewer `replacement_id` або очищуються. Self-review не допускається.
Завершена історія зберігає колишнього учасника. Кожна змінена задача отримує
revision/change_seq, activity і sync_changed після commit; membership events
оновлюють роль та доступ клієнтів. Workload перезавантажується при зміні задач.

| Подія | Стан після транзакції | Наступна дія |
|---|---|---|
| pending reviewer виходить / видаляється / стає viewer, без заміни | needs_reviewer, reviewerId=null | Lead обирає reviewer → pending |
| Та сама подія з валідною заміною | pending, новий reviewer | Новий reviewer approve або changes_requested |
| Заміна reviewer на assignee | needs_reviewer | Lead обирає іншу людину |
| Assignee виходить, reviewer лишається | pending збережено | Reviewer приймає вже поданий результат |
| Lead прямо замінює reviewer у pending | pending, результат незмінний | Новий reviewer приймає |

Summary/links/files зберігаються. Під час needs_reviewer → pending не можна
підмінити результат, assignee, requirements. Попередній reviewer не може approve.
`task.review_reassignment` повідомляє керівників/виконавця, новий reviewer
отримує review_requested. UI пояснює причину та наступну дію; start/submit
при needs_reviewer приховані. Lead може свідомо вимкнути обов’язкову перевірку
(стан none); це не автоматичне прийняття результату.

## Докази та release checklist

- Server: `python manage.py test core.test_s1_team_contract`.
- Web: `npm test` (task-contract, task-filters, project stats/charts).
- Mobile: `npm test -- --runInBand` (та сама JSON матриця).
- Конкурентний тест обов’язково на PostgreSQL; SQLite skip не є доказом locking.
  CI `transactional-role-gate` запускає його на PostgreSQL 16.
- Повні tests/types/build та стандартний web Playwright перед релізом.
- Випускати server перед клієнтами, щоб сервер розумів needs_reviewer.
- Схема БД не змінюється. При rollback server спершу перевірити відсутність
  активних needs_reviewer або завершити handoff; старий сервер не розуміє цей стан.
- Фізичні пристрої: окрема smoke-перевірка ролі, sync та reviewer handoff.

## Дедлайн: дата чи момент (версія 2, C1–C5)

### C1. Дедлайн із часом — самоперевірний прапорець

- `deadline?: string` — повний ISO-8601 UTC (`toISOString()`); читачі
  приймають і голий `YYYY-MM-DD` з імпортів (Jira, Notion, Worksection).
- Запис дедлайну з часом: ОБИДВА ключі разом —
  `deadlineHasTime: true` і `deadlineTimeAt: <той самий рядок, що в deadline>`.
- Запис дедлайну без часу: обидва ключі ВИДАЛЯЄМО (ніколи не пишемо `false`).
  Очищення дедлайну видаляє і їх.
- Читання: дедлайн «з часом» ⇔ `deadlineHasTime === true`
  && `typeof deadlineTimeAt === 'string'` && `deadlineTimeAt === deadline`
  (Python: `is True` і обидва `str` і рівні). Усе інше — лише ДЕНЬ.
  Голий `YYYY-MM-DD` ніколи не дорівнює ISO-моменту, тож — завжди день.
- Навіщо: старі збірки (app.json ≤ 1.2.0) переносять лише `deadline` і лишають
  застарілий `deadlineHasTime: true`. Рівність ламається → безпечний відкат
  до «лише день», а не хибний час 12:00.
- Кожне місце, що зсуває дедлайн із часом (перетягування в календарі, наступна
  копія повторюваної задачі, редагування), переписує `deadlineTimeAt` на НОВИЙ
  рядок `deadline`.
- Обидва ключі входять у PLANNING_FIELDS (`teamwork_policy`) і в
  TASK_SOURCE_FIELDS інтеграцій (власник — зовнішнє джерело).

### C2. День без часу та «прострочено»

- Дедлайн без часу зберігається як ЛОКАЛЬНИЙ ПОЛУДЕНЬ дня
  (`buildDeadline(key, null)`). Полудень — лише якір (±12 год на пояс), ніколи
  не час нагадування. Старі записи (локальна північ) і голий `YYYY-MM-DD`
  лишаються валідними.
- День дедлайну — `deadlineDayKey`: голий `YYYY-MM-DD` → ця дата як є;
  ISO → локальний день у поясі користувача (сервер: пояс NotificationSettings
  або `timeZone` джерела календаря). Ніколи не `deadline.slice(0, 10)` / `[:10]`.
- Прострочено (усюди: списки, «Сьогодні», прогрес команди, знімок годинника):
  з часом → `now > точний момент`; без часу → локальне сьогодні > день
  дедлайну. Завершена задача ніколи не прострочена.
- Сервер (єдине джерело push про дедлайни, `_plan_task`):
  - з часом — `task.deadline_soon` за 24 год до моменту, `task.overdue` у момент;
  - без часу — `task.deadline_soon` о 09:00 локально напередодні,
    `task.overdue` о 09:00 локально НАСТУПНОГО дня після дати.
  - Плануються лише майбутні спрацювання; `reminderAt` незалежний.
- Експорт у Google Calendar: з часом — подія в момент (тривалість
  `estimatedMinutes` або 30 хв); без часу — подія на весь локальний день.
- Імпорт інтеграцій: джерело з часом (Trello `due`, Notion `date.start` з
  часом, Worksection `date_end`+`time_end`) → момент `toISOString` + обидва
  ключі C1 (наївний час — у поясі власника підключення); лише дата → голий
  `YYYY-MM-DD` без ключів.

### C3. Розбір часу й побудова дедлайну (web і mobile однаково)

- `parseDeadlineTime(h, m?)`: після обрізання ЗОВНІШНІХ пробілів приймає лише
  `H`, `HH`, `H:MM`, `HH:MM` — тільки цифри (без внутрішніх пробілів, без
  знаків); `0 ≤ h ≤ 23`, `0 ≤ m ≤ 59`; інакше `null`.
- `buildDeadline(dayKey, time)`: некоректний `dayKey` → `null`; час переданий,
  але не розбирається → `null` (весь дедлайн відхилено); `time` null/undefined
  → лише день (локальний полудень).

### C4. Порядок задач у знімку годинника

Телефон `utils/watchSnapshot.ts` і сервер `watch/snapshot.py` однаково: група
→ первинний ключ групи → назва → id. Назва порівнюється як
`title.toLowerCase()` (JS) / `title.lower()` (Python) простим порівнянням
кодових одиниць (`<`, без `localeCompare`; сервер — байти UTF-16BE);
не рядок → `''`. Далі `id` рядком. Нічия-розв'язка однакова для всіх груп,
включно із завершеними.

### C5. Правило повторення і наступна копія

Санітайзер правила однаковий на телефоні (`utils/taskRecurrence.ts`) і на
сервері (`watch/recurrence.py` `sanitize_rule`):

- `freq` ∉ {`daily`, `weekly`, `monthly`, `yearly`} → повторення немає
  (наступна копія не створюється).
- `interval`: скінченне число (не boolean) → `floor`, якщо `< 1` → `1`;
  рядок, що після обрізання зовнішніх пробілів відповідає
  `^[+-]?[0-9]+(\.[0-9]+)?$`, → число й те саме правило; усе інше → `1`.
- `daysOfWeek` (0=Пн … 6=Нд): лишаються тільки цілі числа 0..6 (не boolean,
  не рядки), унікальні, за зростанням; порожньо після фільтра → ключ не задано
  (звичайне `weekly` через `interval` тижнів).
- `until` — непорожній рядок `YYYY-MM-DD`, порівнюється рядком.
- Дата за межами календаря (величезний interval) → наступної копії немає.
- Наступна копія: новий дедлайн за правилом (з часом — той самий локальний
  час, обидва ключі C1 для нового рядка; без часу — локальний полудень без
  ключів), `status` active, підзадачі не виконані, `timeEntries` порожні,
  `history` лише `created`; `completedAt`, `updatedAt` і поля здачі
  (`reviewState`, `reviewFeedback`, `resultSummary`, `resultLinks`,
  `resultFiles`) прибираються з обох боків.

### Реліз

- Мобільний `app.json` → 1.3.0. Серверний `min_client_version` НЕ змінюється:
  старі збірки безпечні завдяки самоперевірці C1 (рішення власника, чи
  піднімати мінімальну версію пізніше).
- Тести: server `python manage.py test core.test_task_deadline watch
  integrations`; web і mobile — свої тести дедлайну/повторення/знімка.
