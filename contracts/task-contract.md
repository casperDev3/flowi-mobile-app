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
