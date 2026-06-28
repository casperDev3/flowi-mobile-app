# Flowi — Claude Instructions

## Проєкт
Expo React Native додаток для відстеження завдань, фінансів, здоров'я, часу, тренувань,
контейнерів/зберігання речей та **спільних списків між пристроями** (Shared).
Мова інтерфейсу — **українська** (+ англійська через i18n).

> **Контекст для Claude:** довгостроковий контекст (рішення, причини, заборони) живе у
> папці `memory/` — почни сесію з `memory/README.md`, далі читай файл за темою задачі
> (`architecture.md`, `screens.md`, `conventions.md`, `data-model.md`, `server-api.md`,
> `changelog.md`). Цей `CLAUDE.md` — швидкий довідник; `memory/` — глибина. Огляди якості
> та безпеки — в `docs/UI_UX_REVIEW.md` і `docs/QA_SECURITY_REVIEW.md`.

## Стек
- **Expo** ~54 (SDK 54, `newArchEnabled`, `reactCompiler`, `typedRoutes`)
- **React Native** 0.81, **React** 19.1, **expo-router** ~6 (файлова маршрутизація)
- **TypeScript** strict — обов'язковий для всього коду (alias `@/*` → корінь)
- **expo-blur**, **expo-linear-gradient**, **expo-symbols** (SF Symbols, тільки iOS), **expo-haptics**
- **@react-native-async-storage/async-storage** — локальне зберігання
- **react-native-safe-area-context** — SafeAreaView
- **expo-notifications** — push-нотифікації та нагадування
- **@kingstinct/react-native-healthkit** — Apple HealthKit (iOS)
- **expo-av** — аудіозаписи (наради), **expo-file-system** / **expo-sharing** / **expo-document-picker** — експорт/імпорт даних
- **@supabase/supabase-js** — auth/storage (`store/supabase.ts`)
- **WebSocket** (нативний API) + REST до Django-бекенду — для Shared (синхронізація груп)
- **trystero** + `isomorphic-webcrypto` / `react-native-securerandom` / `react-native-get-random-values` — P2P/крипто-примітиви для Shared

## Команди
```bash
npm start            # expo start
npm run ios          # expo run:ios --device
npm run android      # expo run:android --device
npm run web          # expo start --web
npm run lint         # expo lint (eslint-config-expo, flat config)
npm run reset-project # scripts/reset-project.js
```
Пакети ставити **лише** `npx expo install <pkg>`, не `npm install`.

## Структура
```
app/
  _layout.tsx              — root layout. Провайдери (зовні→всередину):
                             ErrorBoundary → I18nProvider → ThemeProvider
                             → AutoBackupProvider → TimerProvider → Stack
  (tabs)/
    _layout.tsx            — таб-навігація: Shared | Finance | Tasks | Health | Settings
    shared.tsx             — Спільне (~109k, активний таб, WebSocket sync)
    explore.tsx            — Фінанси (мульти-валюта, ~78k)
    index.tsx              — Завдання (найбільший екран, ~217k)
    health.tsx             — Здоров'я (~53k)
    settings.tsx           — Налаштування
    time.tsx               — Трекер часу (прихована вкладка, href:null)
    agent.tsx              — AI-агент (прихована вкладка, href:null) — чат із локальним
                             Claude Code по host/port/token (storage 'agent_config')
  shared.tsx               — Shared (Stack-варіант, supabase-store)
  containers.tsx           — Контейнери/зберігання (Stack)
  archive.tsx              — Архів завдань (Stack)
  notes.tsx                — Нотатник (Stack)
  projects.tsx             — Проєкти (Stack)
  meetings.tsx             — Наради + Google Calendar + аудіозаписи (Stack, ~72k)
  subtasks.tsx             — Підзавдання (Stack)
  notifications.tsx        — Нотифікації (Stack)
  finance-stats.tsx        — Статистика фінансів (Stack)
  budget.tsx               — Бюджет/ліміти по категоріях (Stack)
  banks.tsx                — Скарбнички (Stack)
  workouts.tsx             — Тренування (Stack, ~51k)
  time-records.tsx         — Записи часу (Stack)
  time-stats.tsx           — Статистика часу (Stack)
  ideas.tsx / bugs.tsx     — Особисті списки (Stack)
  data.tsx / sync.tsx / developer.tsx — Tooling (Stack)
  donate.tsx / apple-health.tsx — Окремі поверхні (Stack)
  modal.tsx                — Загальний модал (presentation:'modal')

store/
  storage.ts               — loadData<T>(key, fallback) / saveData(key, data) (логує помилки в __DEV__)
  i18n.tsx                 — I18nContext: lang, setLang, tr (storage 'lang_option_v1')
  translations.ts          — всі рядки uk/en (~47k)
  theme-context.tsx        — ThemeContext ('system'|'light'|'dark')
  timer-context.tsx        — контекст Tasks→Time (pendingTask)
  auto-backup.tsx          — AutoBackupProvider, авто-резервні копії
  api-config.ts            — API_BASE / WS_BASE (Django-бекенд)
  supabase.ts              — Supabase client (auth через AsyncStorage)
  notifications.ts         — push-нотифікації утиліти
  healthkit.ts             — Apple HealthKit інтеграція
  sync.ts / sync-conflicts.ts — legacy sync helpers / вирішення конфліктів

components/
  shared/   — MonthPicker, MeetingFormSheet, ErrorBoundary
  finance/  — FinanceSummary, TransactionGroup
  health/   — MiniBarChart, RingCell
  tasks/    — CompactCard
  ui/       — icon-symbol.ios.tsx (SF Symbols) + icon-symbol.tsx (Material fallback)
  + haptic-tab, themed-text/view, parallax-scroll-view, collapsible, external-link, hello-wave

utils/      — чисті функції (типи експортуються звідси)
  dateUtils.ts    — isSameDay, isSameMonth, startOfMonth, endOfMonth, formatMonthYear, prevMonth, nextMonth, isInMonth
  taskUtils.ts    — Task types, filterTasksByMonth, sortTasks, applyTaskFilters, isOverdue, PRIORITY_COLORS
  financeUtils.ts — Transaction/Currency types, BUILTIN_CURRENCIES, txCurrency, calcTotalsByCurrency, formatCurrency, groupTransactions
  healthUtils.ts  — HealthEntry types, getTodayEntries, getMonthEntries, getLast7Days, GOALS

hooks/      — use-color-scheme(.web), use-theme-color
constants/  — theme.ts
docs/       — UI_UX_REVIEW.md, QA_SECURITY_REVIEW.md (списки боргів; видаляються коли спорожніють)
memory/     — довгостроковий контекст для Claude (див. блок угорі)
```

## Бекенд (Shared / синхронізація)
Окремий репозиторій: **Django 6 + DRF + Channels + Daphne** (ASGI).
- API: `https://api.flowi.casperdev.site/api/` · WS: `wss://api.flowi.casperdev.site/ws/`
- Базові URL — у `store/api-config.ts` (`API_BASE`, `WS_BASE`).
- Деталі ендпоінтів, WS-протокол, моделі, rate-limits, membership-патерн — у `memory/server-api.md`.
- **Безпека:** всі mutator-views (та GET для items/sections) починаються з `_assert_member()`.
  Новий endpoint без `device_id`/membership-check = відкрита діра. WS `GroupConsumer.receive()` —
  no-op (клієнт лише отримує події; broadcast іде з REST). Деталі — `docs/QA_SECURITY_REVIEW.md`.

## Storage ключі (AsyncStorage)
| Ключ | Тип | Опис |
|------|-----|------|
| `tasks` | `Task[]` | Завдання |
| `transactions` | `Transaction[]` | Фінансові транзакції (опц. `currency`, default 'UAH') |
| `categories` | `Record<'income'\|'expense', CategoryDef[]>` | Категорії фінансів |
| `finance_currencies` | `Currency[]` | Кастомні валюти/крипти (builtin UAH/USD — у коді) |
| `finance_balance_adjustments` | `Record<code, number>` | Ручне коригування carryover per валюта |
| `finance_primary_currency` | `string` | Основна валюта (default 'UAH') |
| `budget_limits` | `BudgetLimit[]` | Ліміти по категоріях |
| `banks` | `PiggyBank[]` | Скарбнички |
| `time_entries` | `TimeEntry[]` | Записи трекера часу |
| `health_entries` | `HealthEntry[]` | Записи здоров'я |
| `workouts` | `Workout[]` | Тренування |
| `notes` | `Note[]` | Нотатки |
| `containers` | `Container[]` | Контейнери зі списком речей |
| `projects` | `Project[]` | Проєкти |
| `ideas` / `bugs` | `Idea[]` / `Bug[]` | Особисті списки |
| `shared_device_id` | `string (UUID)` | ID пристрою (генерується один раз) |
| `shared_groups_list` | `GroupData[]` | Групи |
| `shared_items_${sid}` | `LocalItem[]` | Items секції |
| `shared_sync_${gid}` | `string (ISO)` | Таймстамп останнього sync |
| `shared_pending_${gid}` | `PendingChange[]` | Черга невідправлених writes (retry до 20) |
| `shared_section_counts` | `Record<sid,{active,done}>` | Кеш лічильників для UI |
| `agent_config` | `{host,port,token}` | Конфіг AI-агента |
| `lang_option_v1` | `'uk'\|'en'` | Мова |
| `theme` | `'system'\|'light'\|'dark'` | Тема |

> Повні форми типів і мульти-валютна модель — у `memory/data-model.md`. Міграційного шару
> поки немає: зворотна сумісність через **optional-поля + default-хелпери** (`txCurrency()`),
> а не міграцію storage.

## Правила коду

### Локальне зберігання (`initialized` патерн — ОБОВ'ЯЗКОВИЙ)
```tsx
const [data, setData] = useState<T[]>([]);
const [initialized, setInitialized] = useState(false);
useEffect(() => { loadData<T[]>('key', []).then(d => { setData(d); setInitialized(true); }); }, []);
useEffect(() => { if (initialized) saveData('key', data); }, [data, initialized]);
```
Без `initialized` перший `saveData([])` перезапише завантажений масив порожнім.

### Дати
- В пам'яті: `Date` об'єкти або ISO рядки. В AsyncStorage: ISO (`date.toISOString()`). При завантаженні: `new Date(iso)`.
- **НЕ** використовувати `toDateString()` для порівняння/фільтрації (timezone-небезпечно) —
  лише `isSameDay()` / `isSameMonth()` з `utils/dateUtils.ts`.

### Місячний фільтр (activeMonth pattern)
```tsx
const [activeMonth, setActiveMonth] = useState(() => {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
});
// Header: <MonthPicker month={activeMonth} onChange={setActiveMonth} months={tr.months} ... />
// Filter: filterTasksByMonth(...) / filterByMonth(...) / getMonthEntries(...)
```

### Pull-to-refresh
```tsx
const [refreshing, setRefreshing] = useState(false);
const onRefresh = useCallback(() => { setRefreshing(true); loadXxx().finally(() => setRefreshing(false)); }, [loadXxx]);
// <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>
```

### Shared: WebSocket + offline-черга
- `connectWS()` → `WebSocket(`${WS_BASE}/group/${id}/?device_id=`)`; `onclose` → backoff `min(1000*2^n, 30000)`.
- `wsRef`/`activeGroupRef`/`deviceIdRef` через `useRef` (уникнути stale closure).
- Writes — через `persistItem` (оптимістичне оновлення + `POST /sync/`); при збої → `shared_pending_${gid}`,
  `drainPending()` ретраїть перед кожним sync. WS-handler фільтрує власний echo по `from_device_id`.
- Нову write-операцію писати за шаблоном `persistItem`, не прямим `api()`.

### Стилі та UI
- Тіні замість glow: `shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8, shadowOffset:{width:0,height:4}`. **Без** яскравих кольорових тіней.
- BlurView замість суцільних карток: `<BlurView intensity={isDark?20:40} tint={isDark?'dark':'light'}>`.
- Радіуси: cards 16–20 · buttons 12–14 · chips 9–12 · icon-box 9–13.
- Текст: заголовок 32–34/800/-0.8 · heading модалу 18–20/800 · тіло 13–15/500–700 · caption 10–12/600 uppercase.
- FAB у табах: `bottom: Platform.OS==='ios'?108:88`; у Stack: `?48:28`.
- ScrollView `paddingBottom` у табах: `?112:92`; у Stack: `100`.
- Фіксований header — **за межами** ScrollView, у `SafeAreaView edges={['top']}` (`paddingTop:14, paddingBottom:10/14`).
- Теми: завжди dark/light через `useColorScheme()`.
- Horizontal ScrollView з чипами — ОБОВ'ЯЗКОВО `keyboardShouldPersistTaps="handled"`.
- Опційний нативний модуль: `let Mod:any=null; try{Mod=require('expo-av')}catch{}`.

### Кольори (акценти по екранах)
- Завдання `#7C3AED` · Фінанси `#0EA5E9` · Час `#6366F1` · Здоров'я `#10B981`
- Контейнери `#F97316` · Нотатки `#F59E0B` · Архів `#10B981` · Спільне `#06B6D4` (cyan) · Agent `#8B5CF6`

### Фони по екранах (bg1 / bg2)
| Екран | Dark | Light |
|-------|------|-------|
| Завдання / Архів | `#0C0C14 / #14121E` | `#F4F2FF / #EAE6FF` |
| Фінанси | `#080E18 / #0F1A2E` | `#EFF5FF / #E0ECFF` |
| Час | `#0A0C18 / #121525` | `#EEF0FF / #E2E5FF` |
| Нотатки | `#100D08 / #1A1510` | `#FFFBF4 / #FFF3DC` |
| Контейнери | `#100A00 / #1A1200` | `#FFF7ED / #FFEDD5` |
| Спільне | `#081418 / #0F1E24` | `#EFF9FC / #D8F3FA` |

### Опції-дропдаун (Tasks screen)
- Кнопка `ellipsis` в хедері → `Modal animationType="fade"` → меню `BlurView`, `borderRadius:18`, `top: insets.top+62, right:16`.
- `hasActiveFilters = filter!=='active' || sort!=='deadline' || ...` (базовий стан 'active' — НЕ активний фільтр).

### Task → Timer інтеграція
1. `setPendingTask(task.title)` + `router.push('/(tabs)/time')`.
2. Time screen: `useFocusEffect` зчитує `pendingTask`, пише в `taskName`, очищує контекст.

### Компонентна архітектура
- Екранний файл: лише стан + хуки + layout. JSX → `components/` (при ≥2 перевикористаннях або >100 рядків JSX). Бізнес-логіка → `utils/*.ts`.
- Shared компоненти: `MonthPicker` приймає `months`/`monthsShort`/`monthsGenitive` для локалізації.
- `<ErrorBoundary>` обгортає root; окремим екранам власний boundary не давати без причини.

## Не робити
- Не видаляти `initialized` прапор (захист від перезапису при завантаженні).
- Не додавати мокап-дані — додаток починається порожнім.
- Не використовувати яскраві кольорові тіні (glow ефекти).
- Не міняти мову UI вручну — лише `tr.xxx` з i18n (hardcoded text = баг).
- Не встановлювати пакети без `npx expo install`.
- Не давати Stack-скрінам (notes, archive тощо) відступ таб-бару — FAB і paddingBottom мають окремі значення.
- Не рахувати `filter === 'active'` активним фільтром — базовий стан.
- Не використовувати `toDateString()` для фільтрації — `isSameDay`/`isSameMonth` з dateUtils.
- Не swallowити помилки AsyncStorage мовчки — `console.warn` в `__DEV__`.
- Не додавати серверний endpoint/WS-логіку без membership-check (`_assert_member`) — див. `memory/server-api.md`.
- Не комітити секрети; `store/supabase.ts` містить лише publishable anon key.
