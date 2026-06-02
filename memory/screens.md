# Screens

Огляд кожного екрана з призначенням, ключовими стейт-полями і storage-ключами.

## Таб-екрани (`app/(tabs)/`)

### `shared.tsx` — Спільне (cyan #06B6D4)
- Запис, читання, синхронізація списків (`shopping` / `tasks` / `notes`) між пристроями однієї групи.
- WebSocket-real-time: `ws://.../group/{group_id}/`.
- Key state: `groups`, `activeGroup`, `viewMode ('groups'|'group')`, `sidebarSection`, `sidebarItems`.
- Modals: secret share, create/join group, add section, edit item, rename, notify.
- Storage: `shared_device_id`, `shared_groups_list`, `shared_sync_${gid}`, `shared_items_${sid}`, `shared_section_counts`.
- **Особливості:**
  - WS auto-reconnect із backoff
  - `notifyMembers()` → POST `/api/groups/{id}/notify/` → broadcast WS подія `notification` → інші клієнти показують локальне expo-notifications
  - Throttle на сповіщення — 10 сек client-side (треба також server-side, див. QA-звіт)

### `explore.tsx` — Фінанси (blue #0EA5E9)
- Доходи/витрати, кілька валют, перенесення залишку, бюджет/банки/статистика через окремі Stack-екрани.
- Key state: `txs`, `cats`, `customCurrencies`, `balanceAdj`, `primaryCurrency`, `activeMonth`, `filter`, `dateFilter`.
- Modals: add tx, detail tx, calendar, categories, primary picker, balance split.
- Storage: `transactions`, `categories`, `finance_currencies`, `finance_balance_adjustments`, `finance_primary_currency`.
- **Особливості:**
  - **Carryover** — `calcTotalsByCurrency` рахує суму (income−expense) усіх транзакцій ДО початку `activeMonth` + `balanceAdj[code]`.
  - **Основна валюта** — `primaryCurrency` (default `'UAH'`), картка показує її як hero-блок + макс 2 інших валют + кнопка «Показати всі (N)» для попапу.
  - **Розподіл балансу** — модал з ручним коригуванням carryover на валюту; крипту можна додавати інлайн прямо в цьому модалі.
  - **Currency picker у Add Modal** — chip’и з валютами (UAH, USD, кастомні крипти), default `'UAH'`. Інлайн-форма для додавання нової крипти (ticker + symbol).
  - **TransactionGroup** — групує по даті; денні підсумки розбиті по валютах (бейджі +символ-сума).

### `index.tsx` — Завдання (violet #7C3AED)
- Розширений список завдань: пріоритети, дедлайни, нотатки, нагадування, фільтри.
- Storage: `tasks`. Інтеграція з time-tracker через `timer-context.tsx`.
- ~3400 рядків — найбільший екран.

### `health.tsx` — Здоров'я (green #10B981)
- Щоденні записи здоровʼя, ringCells для прогресу, MiniBarChart для трендів.
- Storage: `health_entries`. Apple HealthKit (iOS) через `store/healthkit.ts`.

### `settings.tsx` — Налаштування
- Тема, мова, посилання на інструменти (Containers, Banks, Notes, Archive, Budget).

### Hidden tabs
- `agent.tsx` — `href: null`, не відображається.
- `time.tsx` — теж прихований, відкривається через router.push з Tasks (`setPendingTask`).

## Stack-екрани (`app/*.tsx`)

| Файл | Призначення | Storage |
|------|-------------|---------|
| `containers.tsx` | Контейнери/зберігання речей. Помаранчевий #F97316. | `containers` |
| `archive.tsx` | Архів завдань. Зелений #10B981. | (фільтр над `tasks`) |
| `notes.tsx` | Нотатник. Бурштин #F59E0B. | `notes` |
| `projects.tsx` | Проєкти. | `projects` |
| `meetings.tsx` | Наради + Google Calendar + аудіо записи. | `meetings` |
| `subtasks.tsx` | Підзавдання | (вкладено в `tasks`) |
| `notifications.tsx` | Огляд нагадувань. | (через expo-notifications API) |
| `finance-stats.tsx` | Статистика фінансів (не знає про мульти-валюту — все в UAH; див. UI/UX-звіт). | (читає `transactions`) |
| `banks.tsx` | Скарбнички. | `banks` |
| `time-records.tsx`, `time-stats.tsx` | Час. | `time_entries` |
| `ideas.tsx`, `bugs.tsx` | Особисті списки. | `ideas`, `bugs` |
| `data.tsx`, `sync.tsx`, `developer.tsx` | Tooling. | — |
| `donate.tsx`, `apple-health.tsx` | Окремі поверхні. | — |
| `budget.tsx` | Бюджет/ліміти по категоріях. | `budget_limits` |
| `workouts.tsx` | Тренування. | `workouts` |

## Фони екранів (bg1 / bg2)

| Екран | Dark | Light |
|-------|------|-------|
| Завдання / Архів | `#0C0C14 / #14121E` | `#F4F2FF / #EAE6FF` |
| Фінанси | `#080E18 / #0F1A2E` | `#EFF5FF / #E0ECFF` |
| Час | `#0A0C18 / #121525` | `#EEF0FF / #E2E5FF` |
| Нотатки | `#100D08 / #1A1510` | `#FFFBF4 / #FFF3DC` |
| Контейнери | `#100A00 / #1A1200` | `#FFF7ED / #FFEDD5` |
| Спільне | `#081418 / #0F1E24` | `#EFF9FC / #D8F3FA` |

## FAB і нижній паддинг

- FAB у табах: `bottom: Platform.OS === 'ios' ? 108 : 88`.
- FAB у Stack-екранах: `bottom: Platform.OS === 'ios' ? 48 : 28`.
- ScrollView `paddingBottom` у табах: `Platform.OS === 'ios' ? 112 : 92`.
- ScrollView `paddingBottom` у Stack-екранах: `100`.

## Header-патерн

Фіксований header **за межами** ScrollView, у SafeAreaView:
```tsx
<SafeAreaView edges={['top']}>
  <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
    <Text>{tr.screenTitle}</Text>
    {/* ellipsis button → opens dropdown menu modal */}
  </View>
  <ScrollView>{/* контент */}</ScrollView>
</SafeAreaView>
```
