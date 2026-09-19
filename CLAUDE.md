# Flowi — Claude Instructions

## Проект
Expo React Native додаток для відстеження завдань, фінансів, здоров'я, часу та контейнерів/зберігання речей.
Мова інтерфейсу — **українська** (+ англійська через i18n).

## Стек
- **Expo** ~54, **React Native** 0.81, **expo-router** ~6 (файлова маршрутизація)
- **TypeScript** — обов'язковий для всього коду
- **expo-blur**, **expo-linear-gradient**, **expo-symbols** (SF Symbols, тільки iOS)
- **@react-native-async-storage/async-storage** — локальне зберігання
- **expo-secure-store** — токени авторизації (`flowi_access`/`flowi_refresh`/`flowi_registration_token`), НЕ AsyncStorage
- **expo-clipboard** — копіювання посилань-запрошень
- **react-native-safe-area-context** — SafeAreaView
- **expo-notifications** — push-нотифікації та нагадування (локальні + Expo Push для команди/проєктів)

## Структура
```
app/
  _layout.tsx              — кореневий layout: AuthGate (workspace/сесія) + PendingInviteAutoJoin,
                             обгортає TimerProvider + I18nProvider + SyncProvider + ProjectSyncProvider
  (tabs)/
    _layout.tsx            — таб-навігація: Сьогодні | Finance | Tasks | Health | Settings
                             (легасі «Спільне» видалено разом з app/(tabs)/shared.tsx)
    today.tsx              — «Сьогодні»: агрегує МОЄ з особистого простору + усіх проєктів
                             (assigneeId==me АБО createdBy==me без assignee), мітка проєкту
    index.tsx              — екран Завдань (~3400 lines), теж агрегує всі проєкти
    explore.tsx            — екран Фінансів (~850 lines)
    health.tsx             — ХАБ Здоров'я: зведена статистика + плитки розділів (FAB, історія-модалка)
    time.tsx               — Трекер часу (прихована вкладка, href:null)
    settings.tsx           — Налаштування (~445 lines)
  workspace.tsx             — вибір/підключення workspace (адреса серверу, §2)
  login.tsx / register.tsx / register-pending.tsx — вхід/реєстрація/очікування модерації заявки
  admin-workspace.tsx      — адмінка workspace (заявки, користувачі, режим реєстрації)
  account.tsx              — акаунт користувача (вихід, зміна workspace, видалення)
  invite.tsx               — прийом deep-link запрошення в проєкт (§4.3)
  task-group.tsx           — перегляд групи завдань (підмножина «Завдань»)
  project/[id]/            — простір проєкту (Stack, вхід = повна зміна контексту):
    _layout.tsx              — таб/сайдбар-навігація проєкту, свічер, «← Особисте»
    overview.tsx              — Огляд: прогрес/дедлайн, прострочене, наради, спринт, бюджет
    tasks.tsx                 — Завдання проєкту (Дошка/Список/Календар/Таймлайн)
    meetings.tsx / notes.tsx / time.tsx / budget.tsx (owner-only) / sprints.tsx
    settings.tsx              — розділи модулів, шаблон, статуси, посилання на Учасників/Активність
    members.tsx               — прихований таб: учасники, ролі, запрошення (§4.2–§4.3)
    activity.tsx               — прихований таб: стрічка активності (§4.6)
  containers.tsx           — Контейнери/зберігання (Stack, ~580 lines)
  archive.tsx              — Архів завдань (Stack)
  notes.tsx                — Нотатник (Stack)
  projects.tsx             — Проєкти (Stack)
  meetings.tsx             — Наради (Stack)
  subtasks.tsx             — Підзавдання (Stack)
  notifications.tsx        — Нотифікації (Stack)
  finance-stats.tsx        — Статистика фінансів (Stack)
  banks.tsx                — Скарбнички (Stack)
  time-records.tsx         — Записи часу (Stack)
  time-stats.tsx           — Статистика часу (Stack)
  ideas.tsx                — Ідеї (Stack)
  bugs.tsx                 — Баги (Stack)
  data.tsx                 — Управління даними (Stack)
  sync.tsx                 — Синхронізація (Stack)
  developer.tsx            — Developer panel (Stack)
  donate.tsx               — Підтримати (Stack)
  apple-health.tsx         — Apple Health (Stack)
  modal.tsx                — Загальний модал (Stack)

  # Здоров'я — модулі (Stack, відкриваються з хабу health.tsx)
  health-profile.tsx       — Профіль (стать/вік/зріст/активність/ціль → персональні цілі TDEE)
  health-nutrition.tsx     — Харчування (калорії-баланс, білок/БЖВ, вода, нагадування, журнал їжі)
  health-activity.tsx      — Активність (кроки, дистанція, активні калорії)
  health-sleep.tsx         — Сон і відновлення (тривалість, якість, пульс спокою)
  health-vitals.tsx        — Показники тіла (вага, ІМТ, тренд, зони пульсу)
  health-prevention.tsx    — Профілактика (суб-хаб) + експорт звіту для лікаря (Share)
  health-meds.tsx          — Ліки/добавки (час прийому, відмітка, дотримання, нотифікації)
  health-checkups.tsx      — Медогляди/аналізи (+нагадування про наступний)
  health-vaccines.tsx      — Щеплення (дози, наступна дата)
  health-habits.tsx        — Звички + серії (streaks), щоденні нагадування

hooks/
  use-health-entries.ts    — ЄДИНЕ джерело даних здоров'я: записи+профіль+нагадування+HealthKit,
                             агрегати/цілі/чарти, addEntry/addQuick. Використовують хаб і всі модулі.

components/health/
  HealthEntryModal.tsx     — спільна модалка вводу (water/cal/weight/sleep/steps/pulse + макроси)
  HubTile.tsx              — плитка розділу на хабі (icon, stat, badge)
  HealthBits.tsx           — SectionHeader, QuickStatCard, CalStat
  FormBits.tsx             — Empty, Field, Segment (для CRUD-екранів профілактики)

utils/
  healthTheme.ts           — кольори/акценти/ModalKey/fmtSleep екранів здоров'я
  healthUtils.ts           — типи, профіль, TDEE/цілі (Mifflin-St Jeor), ІМТ, sumForDay/lastForDay
  preventionUtils.ts       — типи Medication/Checkup/Vaccine/Habit, adherence/streak, buildHealthReport

store/
  timer-context.tsx        — контекст Tasks→Time (pendingTask)
  storage.ts               — loadData<T>(key, fallback) / saveData(key, data)
  i18n.tsx                 — I18nContext: lang, setLang, tr (translations object)
  translations.ts          — всі рядки uk/en (~1200 lines)
  theme-context.tsx        — ThemeContext
  notifications.ts         — push-нотифікації утиліти
  healthkit.ts             — Apple HealthKit інтеграція
  sync-engine.tsx          — рушій синхронізації v2 (outbox, курсор, конфлікти, ws/user/) —
                             ОСОБИСТИЙ простір; на вихід/зміну workspace: waitForSyncIdle()
  synced-storage.ts        — saveSynced/saveSyncedValue: запис + постановка в outbox з
                             маршрутизацією потоку (utils/projectStream.ts resolveOutboxStream)
  sync-contract.ts         — список синхронізованих ключів (SYNC_ARRAY_KEYS/SYNC_SINGLETON_KEYS) + версія контракту
  migrations.ts            — одноразові міграції форми локального сховища
  auto-backup.tsx          — авто-резервні копії
  sync-conflicts.ts        — вирішення конфліктів синхронізації
  api.ts / api-config.ts   — HTTP-клієнт сервера + workspace_config (адреса, сумісність версій)
  auth.tsx                 — AuthContext: сесія, login/register/logout/switchWorkspace/deleteAccount,
                             data ownership (злиття/заміна локальних даних при вході)
  workspace.ts             — резолв адреси workspace (§2.2), кеш GET /workspace/
  registration.ts          — заявка на реєстрацію (pending_registration, поллінг статусу)
  data-ownership.ts        — data_owner, вивантаження/злиття локальних даних в акаунт
  invite-link.ts           — parseInviteLink + pending_invite (§9.1), deep link ftrackingapp://invite
  push.ts                  — реєстрація Expo push-токена (push_token_registered)
  backup-keys.ts           — перелік ключів для авто-бекапу
  storage-lock.ts          — блокування паралельних записів у той самий ключ AsyncStorage
  chart-prefs.ts           — health_chart_types (тип чартів здоров'я)
  app-mode.tsx             — контекст «Особисте vs проєкт» (isFirstCompatCheckPending тощо)
  project-sync.ts          — рушій синхронізації ПРОЄКТІВ (§3.4–§3.6 контракту): окремий курсор/
                             ревізії на проєкт (project_sync_state_v1), ws/project/{id}/ (до
                             MAX_PROJECT_SOCKETS живих сокетів, решта — поллінг), міграція
                             §3.6, recent_projects, waitForAllProjectSyncsIdle()
  project-team.ts          — REST-обгортка §4.2–§4.3: учасники, ролі, запрошення (лінк/email),
                             transferProjectOwnership
  project-activity.ts      — REST GET /projects/{id}/activity/ (§4.6), без синку

components/
  shared/
    MonthPicker.tsx        — навігація по місяцях (← Квітень 2025 →)
    NavSidebar.tsx         — сайдбар планшета/веба (NAV_GROUPS з constants/nav.ts), перемикається
                             на ProjectSidebar.tsx усередині простору проєкту
    ProjectSidebar.tsx     — сайдбар проєкту («← Особисте», розділи, свічер)
    CommentsSection.tsx    — спільна секція коментарів+@згадок (задачі/наради, §4.4)
    MeetingFormSheet.tsx   — єдина форма наради (особиста і проєктна)
    UndoToast.tsx          — тост «Скасувати» для деструктивних дій
    MasonryColumns.tsx     — розкладка карток у 2 колонки на планшеті
    RecordingClock.tsx     — годинник запису (Час)
  finance/
    FinanceSummary.tsx     — картка балансу/доходів/витрат
    TransactionGroup.tsx   — група транзакцій по даті
  health/
    MiniBarChart.tsx       — 7-денний бар-чарт
    RingCell.tsx           — кільцевий прогрес-індикатор
  tasks/
    TaskDetailHeader.tsx   — деталь завдання (вкладки, серед них «Коментарі» — коли є projectId)
    TaskEditForm.tsx       — форма редагування (пікер «Виконавець» з учасників проєкту)
    TaskSubtasks.tsx / TaskCompactCard.tsx
  today/
    TodayTaskRow.tsx       — рядок завдання на «Сьогодні» (мітка проєкту)
  time/
    FullscreenTimers.tsx
  projects/
    ProjectScreenShell.tsx — спільний каркас екрана проєкту (хедер+свічер+вкладки)
    ProjectSwitcherSheet.tsx — bottom-sheet свічера проєктів (recent_projects)
    ProjectGantt.tsx       — Таймлайн/Гант (startDate → deadline, тягнення країв)
  ui/
    icon-symbol.ios.tsx    — IconSymbol (SF Symbols через expo-symbols)
    icon-symbol.tsx        — fallback для non-iOS

utils/
  dateUtils.ts             — isSameDay, isSameMonth, startOfMonth, endOfMonth, formatMonthYear, prevMonth, nextMonth, isInMonth
  taskUtils.ts             — Task types (startDate?, projectId?, assigneeId?, createdBy?), filterTasksByMonth,
                             sortTasks, applyTaskFilters, isOverdue, PRIORITY_COLORS, isMyTask (§3.7)
  financeUtils.ts          — Transaction types (projectId?), groupTransactions, filterByMonth, calcTotals
  healthUtils.ts           — HealthEntry types, getTodayEntries, getMonthEntries, getLast7Days, GOALS
  taskStatuses.ts          — статуси (глобальні й проєктні), TaskStatusColumn.type: todo|in_progress|done
  taskToday.ts / todayGroups.ts / taskListSections.ts / taskListView.ts — агрегація «Сьогодні»/«Завдання» по типу статусу
  taskMarkdown.ts          — markdown-опис завдання
  projectUtils.ts          — тип Project (template, modules, статуси), допоміжні для проєкту
  projectStream.ts         — PROJECT_COLLECTIONS, resolveOutboxStream (§3.5), recent_projects,
                             ProjectSyncStateMap, projectsNeedingSync, socketProjectIds (§5.1)
  projectOverview.ts       — агрегати для Огляду проєкту
  projectCharts.ts         — дані графіків проєкту (Гант/спринти)
  projectActivity.ts       — форматування рядка стрічки активності (§4.6)
  comments.ts              — тип Comment, @[Ім'я](user:id), canEditComment/canDeleteComment (§4.1/§4.4)
  pushLink.ts              — pushTapUrl: куди відкриває тап по push (§7)
  uuid.ts / clipboard.ts / masonry.ts

hooks/
  use-color-scheme.ts
  use-theme-color.ts
  use-project.ts           — поточний ProjectSummary за id (кеш workspace_projects)
  use-project-role.ts / use-project-roles.ts — роль користувача в проєкті(ах), гейт UI (§4.1)
  use-project-members.ts   — учасники проєкту з кешу project_members_v1 (для @згадок, пікера виконавця)
  use-incoming-invite-links.ts — слухач deep link, змонтований ПОЗА AuthGate
  use-synced-list.ts       — підписка на синхронізований масив зі storage-подіями
  use-today.ts             — агрегати «Сьогодні»

constants/
  theme.ts
  nav.ts                   — NAV_GROUPS сайдбара (дзеркалить веб), SIDEBAR_HIDDEN_ON
  projectNav.ts            — розділи навігації всередині проєкту (бюджет — owner-only)
```

## Storage ключі
| Ключ | Тип | Опис |
|------|-----|------|
| `'tasks'` | `Task[]` | Завдання (опційні `startDate`, `projectId`, `assigneeId`, `createdBy`) |
| `'transactions'` | `Transaction[]` | Фінансові транзакції (опційний `projectId` — бюджет проєкту, бачить лише owner) |
| `'time_entries'` | `TimeEntry[]` | Записи трекера часу (опційний `projectId`) |
| `'notes'` | `Note[]` | Нотатки (опційний `projectId`) |
| `'containers'` | `Container[]` | Контейнери зі списком речей |
| `'projects'` | `Project[]` | Проєкти: `{id,name,color,template:'work'\|'simple',modules:{meetings,notes,time,budget,sprints},…}` — розділи вмикаються шаблоном/налаштуваннями, Огляд і Завдання завжди |
| `'health_entries_v2'` | `HealthEntry[]` | Записи здоров'я (calories=їжа, calories_out=спалені, +макроси) |
| `'health_profile'` | `HealthProfile` | Профіль для персональних цілей (стать/вік/зріст/активність/ціль) — **синхронізується** як singleton |
| `'health_reminders'` | `{water,sleep}` | Перемикачі щоденних нагадувань — **синхронізуються** як singleton |
| `'health_meds'` | `Medication[]` | Профілактика: ліки/добавки (час прийому, лог, нотифікації) |
| `'health_checkups'` | `Checkup[]` | Профілактика: медогляди/аналізи |
| `'health_vaccines'` | `Vaccine[]` | Профілактика: щеплення |
| `'health_habits'` | `Habit[]` | Профілактика: звички + серії (streaks) |
| `'categories'` | `CategoryRow[]` | Кастомні категорії фінансів (`{id, type, name, icon}`, id = `${type}:${name}`) |
| `'ideas'` | `Idea[]` | Ідеї |
| `'bugs'` | `Bug[]` | Баги |
| `'savings_jars'` | `SavingsJar[]` | Скарбнички |
| `'task_statuses'` | `TaskStatus[]` | Кастомні статуси завдань (особисті й проєктні разом; `type: 'todo'\|'in_progress'\|'done'` — за ним «Сьогодні»/«Завдання» рахують агрегацію незалежно від назви статусу) |
| `'meetings'` | `Meeting[]` | Наради (опційний `projectId`) |
| `'exercises'` | `Exercise[]` | Вправи |
| `'workout_programs'` | `WorkoutProgram[]` | Програми тренувань |
| `'workouts'` | `Workout[]` | Тренування |
| `'accounts'` | `Account[]` | Фінансові рахунки (готівка/картка/заощадження, своя валюта) |
| `'budget_limits'` | `BudgetLimit[]` | Ліміти бюджету по категоріях |
| `'finance_currencies'` | `Currency[]` | Кастомні валюти (нормалізовано з singleton) |
| `'finance_balance_adjustments'` | `BalanceAdjustment[]` | Ручні коригування балансу |
| `'finance_primary_currency'` | `string` | Основна валюта — **синхронізується** як singleton |
| `'active_timers'` | `ActiveTimer[]` | Таймери, що йдуть просто зараз (id `task:<id>` для задач) |
| `'sprints'` | `Sprint[]` | Спринти проєкту (`sprint.projectId`) |
| `'subscriptions'` | `Subscription[]` | Регулярні платежі (опційний `projectId` — бюджет проєкту) |
| `'timer_dial_prefs'` | `{version,defaultDial,timers}` | Вибір циферблата таймерів — **синхронізується** як singleton |

### Workspace / проєкти / команда (контракт `WORKSPACE_PROJECTS_CONTRACT.md` §9.1)
| Ключ | Тип | Опис |
|------|-----|------|
| `'workspace_config'` | `{origin,apiBase,wsBase,workspaceId,…}` | поточний workspace |
| `'data_owner'` | `{workspaceId,userId}\|null` | чиї дані лежать у сховищі (гейт злиття при вході) |
| `'workspace_projects'` | `ProjectSummary[]` | кеш `GET /projects/` |
| `'project_sync_state_v1'` | `{[projectId]: {cursor,revisions,role,lastSyncedAt}}` | курсори/ревізії потоків проєктів (окремо від особистих) |
| `'project_members_v1'` | `{[projectId]: MemberOut[]}` | кеш учасників (імена для @згадок, пікера виконавця) |
| `'recent_projects'` | `string[]` (≤5) | свічер проєктів, найновіший першим |
| `'projects_migrated_v1'` | `{workspaceId,userId,at}` | §3.6 виконано (ідемпотентність) |
| `'project_id_conflicts_v1'` | `string[]` | id проєктів з `409 project_id_taken` — не рахуються «своїми» |
| `'pending_registration'` | `{requestId,email,workspaceId,createdAt}` | заявка на реєстрацію (токен — у SecureStore) |
| `'pending_invite'` | `{ws,projectId,token,receivedAt}` | інвайт, що прийшов до входу |
| `'push_token_registered'` | `{token,userId,workspaceId}` | чи треба перереєструвати push-токен |
| `'comments'` | `Comment[]` | коментарі+@згадки задач/нарад (лише проєктний потік) |
| `'project_budgets'` | `ProjectBudget[]` | бюджет проєкту (owner-only, `local_id == projectId`) |

SecureStore (не AsyncStorage): `flowi_access`, `flowi_refresh`, `flowi_registration_token`.

## Правила коду

### Дати
- В пам'яті: `Date` об'єкти або ISO рядки
- В AsyncStorage: ISO рядки (`date.toISOString()`)
- При завантаженні: `new Date(isoString)`
- Завжди використовувати `initialized` прапор перед першим збереженням
- НЕ використовувати `toDateString()` для порівняння — timezone-небезпечно; використовувати `isSameDay()` з `utils/dateUtils.ts`

### Місячний фільтр (activeMonth pattern)
```tsx
const [activeMonth, setActiveMonth] = useState(() => {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
});
// Header: <MonthPicker month={activeMonth} onChange={setActiveMonth} ... />
// Filter: filterTasksByMonth(tasks, activeMonth)  /  filterByMonth(txs, activeMonth)  /  getMonthEntries(entries, activeMonth)
```

### Pull-to-refresh pattern
```tsx
const [refreshing, setRefreshing] = useState(false);
const loadXxx = useCallback(async () => { /* load from storage */ }, []);
const onRefresh = useCallback(() => { setRefreshing(true); loadXxx().finally(() => setRefreshing(false)); }, [loadXxx]);
// <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>
```

### Стилі та UI
- Без неонового підсвічування — тіні: `shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8`
- FAB у табах: `bottom: Platform.OS === 'ios' ? 108 : 88`
- FAB у Stack-скрінах: `bottom: Platform.OS === 'ios' ? 48 : 28`
- ScrollView у табах: `paddingBottom: Platform.OS === 'ios' ? 112 : 92`
- ScrollView у Stack-скрінах: `paddingBottom: 100`
- Теми: завжди підтримувати dark/light через `useColorScheme()`
- BlurView замість суцільних карток
- Фіксований хедер — тільки через `components/shared/ScreenHeader` (+ `HeaderButton`); верхній інсет дає `useTopInset()`, нативний `SafeAreaView edges={['top']}` в екранах не використовуємо
- Bottom-sheet на планшеті — центрована колонка: `sheetColumnStyle(isWide)` з `@/hooks/use-content-width` (та сама стеля `CONTENT_MAX_WIDTH`, що й у вмісту екрана)

### Кольори (акценти по екранах)
- Завдання: `#7C3AED` (фіолетовий)
- Фінанси: `#0EA5E9` (блакитний)
- Час: `#6366F1` (індиго)
- Здоров'я: `#10B981` (зелений)
- Контейнери: `#F97316` (помаранчевий)
- Нотатки: `#F59E0B` (бурштиновий)
- Архів: `#10B981` (зелений)

### Фони по екранах (bg1 / bg2)
- Завдання / Архів: `#0C0C14 / #14121E` dark · `#F4F2FF / #EAE6FF` light
- Фінанси: `#080E18 / #0F1A2E` dark · `#EFF5FF / #E0ECFF` light
- Час: `#0A0C18 / #121525` dark · `#EEF0FF / #E2E5FF` light
- Нотатки: `#100D08 / #1A1510` dark · `#FFFBF4 / #FFF3DC` light
- Контейнери: `#100A00 / #1A1200` dark · `#FFF7ED / #FFEDD5` light

### Опції-дропдаун (Tasks screen)
- Кнопка `ellipsis` в хедері — `Modal` з `animationType="fade"`
- Меню — `BlurView`, `borderRadius:18`, позиція `top: insets.top + 62, right: 16`
- `hasActiveFilters = filter !== 'active' || sort !== 'deadline' || ...` (базовий стан = 'active')

### Task → Timer інтеграція
1. `setPendingTask(task.title)` + `router.push('/(tabs)/time')`
2. Time screen: `useFocusEffect` зчитує `pendingTask`, записує в `taskName`, очищує контекст

### Компонентна архітектура
- Екранний файл: лише стан + хуки + layout
- JSX → компоненти в `components/`
- Бізнес-логіка → утиліти в `utils/`
- Shared компоненти: `MonthPicker` (місячна навігація), передавати `months={tr.months}` для локалізації

## Не робити
- Не видаляти `initialized` прапор — захист від перезапису при завантаженні
- Не додавати мокап дані — додаток починає порожнім
- Не використовувати яскраві кольорові тіні (glow ефекти)
- Не змінювати мову UI (використовувати `tr.xxx` з i18n)
- Не встановлювати пакети без `npx expo install`
- Не давати Stack-скрінам (notes, archive тощо) відступ таб-бару
- Не рахувати `filter === 'active'` як активний фільтр — базовий стан
- Не використовувати `toDateString()` для фільтрації — використовувати `isSameDay` / `isSameMonth` з dateUtils
- Не swallowати помилки AsyncStorage мовчки — принаймні логувати в dev
