# План виправлень: бізнес-процеси, UI/UX, анімації

**Дата:** 2026-07-05
**Статус: ✅ РЕАЛІЗОВАНО (2026-07-05, Фази A–D; C11 опціональні пункти пропущено).** Оркестрація: 10 Sonnet-субагентів у хвилях, верифікація кожної хвилі (Fable 5). Підсумок: мобільний — 101/101 тестів, tsc без нових помилок; сервер — 60/60 тестів. Нові пакети: react-native-svg (нативний → потрібна перезбірка). Сервер: +7 auth-ендпоінтів (forgot/reset/change password, PATCH/DELETE me), міграція accounts.0001. Не закомічено — чекає ревʼю.
**Метод:** три паралельні аудити кодової бази (процеси / UI-UX за Apple HIG + Material / анімації), критерії — ui-ux-pro-max чекліст (§1 Accessibility, §2 Touch, §7 Animation, §8 Forms, §9 Navigation).
**Звʼязані документи:** `analysis/BUSINESS_ANALYSIS.md` (стратегія, не дублюється тут), `plans/CLIENT_SERVER_MIGRATION_PLAN.md` (реалізовано).

---

## ЧАСТИНА I. Підсумок аудитів

### 1.1. Бізнес-процеси — 19 критичних, 24 важливих, 10 дрібних розривів

| Процес | Найгірше |
|--------|----------|
| Онбординг | Два незалежні прапори (`welcome_done` + `onboarding_done`) → Onboarding-модал зʼявляється ПОВЕРХ welcome-екрана; різні акценти (#0EA5E9 vs #7C3AED) в одному флоу |
| Auth | Немає «Забули пароль?»; session-expired — тихий перехід у гостя без жодного UI (`store/auth.tsx:68-74`); всі помилки логіну = одне повідомлення (`login.tsx:60-66`); немає зміни пароля/видалення акаунта |
| Синхронізація | Немає індикатора «X змін не синхронізовано» на головних екранах; стан error без auto-retry/backoff; P2P і хмара на одному екрані плутають; опис sync у Settings бреше («QR-код») |
| Завдання | Restore з архіву СКИДАЄ прогрес підзавдань (`archive.tsx:71-77`); видалення задачі БЕЗ підтвердження (`index.tsx:612`); немає undo; прострочені не виділені в секцію; два несумісні сховища часу (`task.timeEntries` vs `time_entries`) |
| Фінанси | Бюджет ігнорує валюту транзакцій — хибні цифри для мультивалютних (`budget.tsx:29-33`); скарбнички не створюють транзакцій (баланс розʼїжджається); перемикач financeAlerts — «мертвий» (тільки useState) |
| Здоровʼя | HealthKit + ручний ввід ДУБЛЮЮТЬСЯ (кроки ×2); `toDateString()` у підрахунку ліків (`health.tsx:58-63`) — порушення власного правила; звички не потрапляють у статистику; досягнення цілі не тригерить нічого |
| Час | Трекер часу ПРИХОВАНИЙ (єдиний вхід — Settings); статистика часу не бачить task-таймери |
| Спільне | В офлайні кеш є, але UI повністю заблокований overlay-ем; немає перенесення особистої задачі в спільне; запрошення — тільки ручне копіювання секрету; `shared.tsx:47` — власний fetch БЕЗ JWT (не через apiFetch) |
| Дані | Авто-бекап покриває 7 з 18+ ключів — ГУБИТЬ усе здоровʼя (`auto-backup.tsx:32-42`); немає відновлення з авто-бекапу одним тапом; після імпорту «перезапустіть додаток» без перезапуску; ім'я файлу зі старим брендом `f-tracking` |
| Нотифікації | Глобальний перемикач НЕ скасовує заплановані нотифікації (`notifications.tsx:95-98`); центр показує лише `reminder_*` — ліки/звички/вода невидимі й нескасовувані; перемикачі taskReminders/financeAlerts декоративні; зустрічі без нагадувань |

### 1.2. UI/UX — ключові цифри

| Метрика | Факт | Норма |
|---------|------|-------|
| Android-fallback іконок | **32+ SF Symbols + 19 іконок категорій фінансів ВІДСУТНІ в MAPPING** → на Android не рендеряться | 100% |
| accessibilityLabel покриття | ~83 на ~1176 touchables (**~7%**) | icon-only кнопки — 100% |
| Touch targets < 44pt | 9+ підтверджених (subCheck 18×18, checkbox 22×22, actionBtn 28×28) | ≥44×44pt |
| Контраст secondary-тексту (dark) | rgba з opacity 0.45–0.50 → ~3–3.8:1 у 27 файлах | ≥4.5:1 |
| Таби | `tabBarShowLabel:false` — 5 icon-only табів | іконка + підпис |
| Loading-стани головних табів | 0 skeleton/spinner (порожній екран перші мс) | skeleton >300ms |
| Undo після видалення | 0 реалізацій | тост з «Скасувати» |
| Password show/hide | немає в login/register | обовʼязково |
| Reduced Motion / Dynamic Type | 0 перевірок / 0 контролю | підтримка |
| Дизайн-токени | 27 локальних `const c = {}` палітр, 20+ значень borderRadius | централізовано |

### 1.3. Анімації — фактичний стан

- Екранів з реальною анімацією: **1 з ~33** (sidebar у shared.tsx на старому Animated API).
- reanimated ~4.1.1 встановлено, але в продакшн-коді НЕ використовується (лише невикористаний parallax).
- RingCell/MiniBarChart — статичні; чекбокс done — миттєвий стрибок; онбординг-кроки — mount/unmount без переходів; LayoutAnimation — 0; skeleton — 0; haptics — 4 call-сайти (на головному екрані задач toggleTask — нуль).
- Motion-токенів немає; reduced-motion немає.

---

## ЧАСТИНА II. План виправлень (фази A–D)

### Фаза A — КРИТИЧНЕ: довіра, дані, Android (нічого не «прикрашає», лише чинить зламане)

| # | Виправлення | Файли | Складність |
|---|-------------|-------|-----------|
| A1 | **Android іконки**: додати всі 32+ відсутні SF-імена + 19 іконок категорій у MAPPING (`arrow.triangle.2.circlepath`, `bell.badge`, `chart.pie.fill`, `rectangle.portrait.and.arrow.right`, `shippingbox.fill`, `mic.fill`, `waveform`, `stop.fill`, sort-chips, ICON_SUGGESTIONS…) | `components/ui/icon-symbol.tsx` | S |
| A2 | **Авто-бекап**: розширити на ВСІ ключі з `data.tsx ALL_KEYS` + categories/budget_limits/health_profile;版本 '2.0'; ім'я файлу `flowi-backup-*`; кнопка «Відновити з останнього бекапу» в data.tsx | `store/auto-backup.tsx`, `app/data.tsx` | M |
| A3 | **Нотифікації**: глобальний toggle → `cancelAllScheduledNotificationsAsync()` + перевірка прапора в scheduleReminder; центр — показувати ВСІ типи (daily_*, med_*, checkup_*, vaccine_*, habit_*) з людськими назвами; прибрати «минулі» з кнопкою скасування; підключити taskReminders/financeAlerts до saveData + реальної логіки (або прибрати перемикачі) | `app/notifications.tsx`, `store/notifications.ts`, `app/(tabs)/settings.tsx` | M |
| A4 | **Session-expired UI**: подія → Alert/банер «Сесію завершено» + кнопка «Увійти знову»; зберегти pendingCount недоторканим | `store/auth.tsx`, `app/_layout.tsx` (банер) | S |
| A5 | **Деструктивні дії**: Alert-підтвердження deleteTask (`index.tsx:612`) і deleteNote (`notes.tsx:119`); restore з архіву НЕ скидати done підзавдань (`archive.tsx:71-77`) | `index.tsx`, `notes.tsx`, `archive.tsx` | S |
| A6 | **Бюджет × валюта**: рахувати бюджет лише по транзакціях primary-валюти (v1) + бейдж «інші валюти не враховано»; прибрати hardcode ₴ | `app/budget.tsx` | M |
| A7 | **Помилки логіну**: розрізняти 401 / OfflineError / timeout / 5xx (i18n: authInvalidCreds / authNetworkError / authServerError) | `app/login.tsx`, `app/register.tsx`, `store/api.ts` | S |
| A8 | **shared.tsx → apiFetch**: замінити власний fetch на apiFetch (JWT, офлайн-гейт, таймаут) | `app/(tabs)/shared.tsx:47` | S |
| A9 | **Онбординг-флоу**: обʼєднати прапори (welcome_done як єдиний), послідовність: Onboarding-кроки → welcome (або welcome кроком онбордингу); єдиний акцент #7C3AED; «Розпочати» веде одразу в таби | `components/onboarding/Onboarding.tsx`, `app/_layout.tsx`, `app/welcome.tsx` | M |
| A10 | **Імпорт даних**: після імпорту — програмний refetch без «перезапустіть» (подія reload-all або router.replace + інвалідція) | `app/data.tsx` | S |
| A11 | **`toDateString()` у health.tsx:58-63 і archive.tsx:37-43** → `isSameDay` | 2 файли | S |

### Фаза B — ВАЖЛИВЕ: щоденний UX

| # | Виправлення | Файли | Складність |
|---|-------------|-------|-----------|
| B1 | **Підписи табів**: `tabBarShowLabel: true` + короткі i18n-назви (Сьогодні/Завдання/Фінанси/Здоровʼя/Ще) | `(tabs)/_layout.tsx` | S |
| B2 | **Touch targets**: hitSlop/розміри для subCheck 18→24+hitSlop, checkbox 22, actionBtn 28, headerBtn 36, editBtn/iconBtn | index, subtasks, archive, bugs, ideas, banks | S |
| B3 | **Undo-тост**: компонент `components/shared/UndoToast.tsx` (3–5с) для done задачі та видалень задач/нотаток/транзакцій | новий + 3 екрани | M |
| B4 | **Password toggle + форми**: show/hide в login/register; autoComplete=email/new-password; помилка біля поля; on-blur валідація email | login, register | S |
| B5 | **Контраст**: підняти `sub` до opacity 0.62+ (dark) / 0.55+ (light) — центральний токен (див. B8) | 27 файлів → токени | M |
| B6 | **Sync-індикатор**: бейдж pendingCount>0 «не синхронізовано» на SyncBadge + у Settings рядку Sync (замінити хибний опис «QR-код» на реальний стан); auto-retry з backoff при error | `SyncBadge.tsx`, `settings.tsx`, `sync-engine.tsx` | M |
| B7 | **Трекер часу і Спільне — знайдимість**: рядок «Трекер часу» вже є в Settings→Інструменти; додати плитку «Час сьогодні → трекер» тапабельною на Today (вже є) + пункт «Спільне» в Settings→Інструменти | `settings.tsx` | S |
| B8 | **Дизайн-токени**: `constants/tokens.ts` — radius scale (8/12/16/20/24), spacing (4/8/12/16/24), палітра-фабрика `getScreenColors(screen, isDark)` (узагальнити патерн healthTheme); міграція екранів поступова (нові/правлені — одразу) | новий + поступово | L |
| B9 | **Loading**: легкий skeleton (2–3 сірі блоки) на today/index/explore/health до першого load | 4 таби + `components/shared/Skeleton.tsx` | M |
| B10 | **Спільне офлайн read-only**: замість повного overlay — показувати кеш списків + банер «Офлайн: лише перегляд» | `shared.tsx`, `OfflineOverlay.tsx` (prop readOnly) | M |
| B11 | **accessibilityLabel**: пройти icon-only кнопки (headerBtn, xmark, trash, sort-chips, FAB) — мінімум 100% на іконкових кнопках головних екранів; Segment у FormBits → Pressable з role | ~15 файлів | M |
| B12 | **Прострочені задачі**: окрема секція «Прострочені» зверху списку | `index.tsx` | S |
| B13 | **Empty states CTA**: додати кнопку-CTA в порожні стани tasks/notes/projects/shared | 4 екрани | S |

### Фаза C — АНІМАЦІЇ: система руху (reanimated 4 вже в проєкті)

Порядок принциповий: спочатку C1 (фундамент), потім точкові.

| # | Виправлення | Файли | Складність |
|---|-------------|-------|-----------|
| C1 | **Фундамент**: `constants/motion.ts` (duration fast150/normal250/slow400, spring-пресети, easing) + `hooks/use-motion.ts` з `useReducedMotion()` (reduced → duration:0, entering:undefined) | нові | S |
| C2 | **Press-scale**: `components/shared/PressableScale.tsx` (withSpring 0.96) → FAB (index/explore/time/banks), QuickActions, HubTile, картки Today | новий + 8 місць | M |
| C3 | **Чекбокс done**: withSequence(spring 1.25→1) + withTiming opacity/line-through 200ms — TodayTaskRow, CompactCard, detailed row, archive | 4 компоненти | M |
| C4 | **Haptics-покриття**: toggleTask в index.tsx (Light), save задачі/транзакції (Success), FAB (Medium), помилка логіну (Error) — через єдиний хелпер `utils/haptics.ts` з повагою до reduced/settings | ~8 call-сайтів | S |
| C5 | **RingCell**: перейти на react-native-svg stroke-dashoffset + withTiming 800ms заповнення при монтуванні/зміні pct (svg вже є транзитивно? — якщо ні, `npx expo install react-native-svg`) | `RingCell.tsx` | M |
| C6 | **Списки**: `entering={FadeInDown.duration(200).delay(i*40).reduceMotion(...)}` + `layout={LinearTransition.springify()}` на картках задач/транзакцій/нотаток (обмежити delay першими ~10 елементами) | index, explore, notes, today | M |
| C7 | **Онбординг**: кроки через FadeInRight/FadeOutLeft, анімований прогрес-бар | `Onboarding.tsx` | S |
| C8 | **Collapsible/сегменти**: анімований chevron rotate + FadeIn контенту; segmented — анімований індикатор | `collapsible.tsx`, спільні | S |
| C9 | **MiniBarChart**: withTiming висоти барів (stagger 30ms) | `MiniBarChart.tsx` | S |
| C10 | **Модалки додавання** (index/explore): slide-up + backdrop-fade замість fade; свайп-вниз для закриття (GestureDetector) — почати з двох головних форм | 2 модалки | L |
| C11 | (опц.) Count-up чисел балансу/калорій; tabs `animation:'shift'`; shared-element Hub→модуль | розкидано | L |

### Фаза D — ПРОЦЕСИ: більші доробки (частина потребує сервера)

| # | Виправлення | Скоуп | Складність |
|---|-------------|-------|-----------|
| D1 | **Скидання пароля**: сервер (endpoint + email через SMTP) + екран «Забули пароль?» | сервер + клієнт | L |
| D2 | **Акаунт-менеджмент**: зміна імені/пароля, `DELETE /api/auth/me/` (wipe UserItem) + екран у Settings | сервер + клієнт | M |
| D3 | **Нагадування зустрічей**: scheduleReminder при створенні/редагуванні meeting | `meetings.tsx` | S |
| D4 | **Скарбнички ↔ транзакції**: депозит створює expense-транзакцію категорії «Заощадження» (opt-in перемикач) | `banks.tsx` | M |
| D5 | **Час: єдине джерело**: task-таймер пише також у `time_entries` (з taskId) → статистика повна | index, time, timeUtils | M |
| D6 | **HealthKit дедуп**: source-поле на entry (manual/healthkit); агрегати не сумують два джерела одного типу за день | `healthkit.ts`, `healthUtils.ts` | M |
| D7 | **Звички → статистика**: completion пише health entry типу habit або враховується в хаб-агрегатах | preventionUtils, хаб | S |
| D8 | **Запрошення в Спільне**: Share-кнопка з deeplink `flowi://join?secret=…` + обробка лінка | shared, app config | M |
| D9 | **Досягнення цілей здоровʼя**: святкова анімація кільця (C5) + streak-бейдж на хабі | хаб | S |
| D10 | **«Очистити всі дані»**: чистити ТАКОЖ службові ключі (sync_outbox, conflicts, welcome/onboarding — за вибором) | `data.tsx` | S |

---

## ЧАСТИНА III. Порядок виконання і перевірка

**Рекомендована послідовність:** A (усе) → B1–B7 → C1–C6 → решта B → решта C → D.
Логіка: A — зламане і невидиме користувачу поки не вдарить (Android, бекапи, нотифікації); B — щоденне тертя; C — відчуття якості (дешеве в реалізації, бо reanimated уже в проєкті); D — нові можливості.

**Критерії приймання кожної фази:**
1. `npx tsc --noEmit` — без нових помилок (базові 2 відомі).
2. `npx eslint` на змінених файлах — 0 errors.
3. `npm test` — зелений; для A2/A3/B3/C1 — нові юніт-тести (бекап-ключі, фільтр нотифікацій, undo-таймер, useMotion reduced).
4. Ручна перевірка dark+light, iOS+Android (особливо A1 — іконки на Android).
5. Анімації: перевірка з увімкненим Reduce Motion (усі мають вимикатись).

**Оцінка обсягу:** A ≈ 2–3 дні, B ≈ 3–4 дні, C ≈ 3–4 дні, D ≈ 5+ днів (з сервером). Фази незалежно шипабельні.
