# Flowi — Claude Instructions

## Проект
Expo React Native додаток для відстеження завдань, фінансів, здоров'я, часу та контейнерів/зберігання речей.
Мова інтерфейсу — **українська** (+ англійська через i18n).

## Стек
- **Expo** ~54, **React Native** 0.81, **expo-router** ~6 (файлова маршрутизація)
- **TypeScript** — обов'язковий для всього коду
- **expo-blur**, **expo-linear-gradient**, **expo-symbols** (SF Symbols, тільки iOS)
- **@react-native-async-storage/async-storage** — локальне зберігання
- **react-native-safe-area-context** — SafeAreaView
- **expo-notifications** — push-нотифікації та нагадування

## Структура
```
app/
  _layout.tsx              — кореневий layout, обгортає TimerProvider + I18nProvider
  (tabs)/
    _layout.tsx            — таб-навігація: Finance | Tasks | Health | Settings
    index.tsx              — екран Завдань (~3400 lines)
    explore.tsx            — екран Фінансів (~850 lines)
    health.tsx             — ХАБ Здоров'я: зведена статистика + плитки розділів (FAB, історія-модалка)
    time.tsx               — Трекер часу (прихована вкладка, href:null)
    settings.tsx           — Налаштування (~445 lines)
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
  sync.ts                  — синхронізація між пристроями
  auto-backup.tsx          — авто-резервні копії
  sync-conflicts.ts        — вирішення конфліктів синхронізації

components/
  shared/
    MonthPicker.tsx        — навігація по місяцях (← Квітень 2025 →)
  finance/
    FinanceSummary.tsx     — картка балансу/доходів/витрат
    TransactionGroup.tsx   — група транзакцій по даті
  health/
    MiniBarChart.tsx       — 7-денний бар-чарт
    RingCell.tsx           — кільцевий прогрес-індикатор
  tasks/
    CompactCard.tsx        — компактна картка завдання
  ui/
    icon-symbol.ios.tsx    — IconSymbol (SF Symbols через expo-symbols)
    icon-symbol.tsx        — fallback для non-iOS

utils/
  dateUtils.ts             — isSameDay, isSameMonth, startOfMonth, endOfMonth, formatMonthYear, prevMonth, nextMonth, isInMonth
  taskUtils.ts             — Task types, filterTasksByMonth, sortTasks, applyTaskFilters, isOverdue, PRIORITY_COLORS
  financeUtils.ts          — Transaction types, groupTransactions, filterByMonth, calcTotals
  healthUtils.ts           — HealthEntry types, getTodayEntries, getMonthEntries, getLast7Days, GOALS

hooks/
  use-color-scheme.ts
  use-theme-color.ts

constants/
  theme.ts
```

## Storage ключі
| Ключ | Тип | Опис |
|------|-----|------|
| `'tasks'` | `Task[]` | Завдання |
| `'transactions'` | `Transaction[]` | Фінансові транзакції |
| `'time_entries'` | `TimeEntry[]` | Записи трекера часу |
| `'notes'` | `Note[]` | Нотатки |
| `'containers'` | `Container[]` | Контейнери зі списком речей |
| `'projects'` | `Project[]` | Проєкти |
| `'health_entries_v2'` | `HealthEntry[]` | Записи здоров'я (calories=їжа, calories_out=спалені, +макроси) |
| `'health_profile'` | `HealthProfile` | Профіль для персональних цілей (стать/вік/зріст/активність/ціль) — локально, не синхронізується |
| `'health_reminders'` | `{water,sleep}` | Перемикачі щоденних нагадувань — локально |
| `'health_meds'` | `Medication[]` | Профілактика: ліки/добавки (час прийому, лог, нотифікації) |
| `'health_checkups'` | `Checkup[]` | Профілактика: медогляди/аналізи |
| `'health_vaccines'` | `Vaccine[]` | Профілактика: щеплення |
| `'health_habits'` | `Habit[]` | Профілактика: звички + серії (streaks) |
| `'categories'` | `Category[]` | Кастомні категорії фінансів |
| `'ideas'` | `Idea[]` | Ідеї |
| `'bugs'` | `Bug[]` | Баги |
| `'banks'` | `PiggyBank[]` | Скарбнички |

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
- Фіксований хедер: за межами ScrollView у SafeAreaView — `paddingTop:14, paddingBottom:10/14`

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
