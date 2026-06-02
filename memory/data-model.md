# Data Model

## AsyncStorage keys

### Завдання
- `tasks` → `Task[]`

### Фінанси
- `transactions` → `Transaction[]`
  ```ts
  interface Transaction {
    id: string; type: 'income'|'expense'; category: string; amount: number;
    note: string; date: string /*ISO*/; currency?: string /* default 'UAH' */;
  }
  ```
- `categories` → `Record<'income'|'expense', CategoryDef[]>` (`name`, `icon`)
- `finance_currencies` → `Currency[]` (кастомні крипти, доданих користувачем)
  ```ts
  interface Currency {
    code: string; symbol: string;
    kind: 'fiat'|'crypto'; decimals: number;
  }
  ```
  Builtin (не у storage, лише в коді): UAH, USD.
- `finance_balance_adjustments` → `Record<string /*currencyCode*/, number>` — ручне коригування carryover на валюту.
- `finance_primary_currency` → `string` (default `'UAH'`).
- `budget_limits` → `BudgetLimit[]` (`category`, `icon`, `limit`).
- `banks` → `PiggyBank[]`.

### Час
- `time_entries` → `TimeEntry[]`

### Здоров'я
- `health_entries` → `HealthEntry[]`

### Контейнери / Зберігання
- `containers` → `Container[]` з вкладеними `items` (text, tags, note).

### Інші
- `notes` → `Note[]`
- `projects` → `Project[]`
- `ideas` → `Idea[]`
- `bugs` → `Bug[]`
- `workouts` → `Workout[]`

### Спільне (Shared)
- `shared_device_id` → `string (UUID)` — генерується один раз.
- `shared_groups_list` → `GroupData[]`
- `shared_sync_${gid}` → `string (ISO)` — таймстамп останнього успішного sync.
- `shared_items_${sid}` → `LocalItem[]`
- `shared_section_counts` → `Record<sectionId, {active, done}>` — кеш для UI.
- `shared_pending_${gid}` → `PendingChange[]` — write-черга для retry при mережевому збої.

```ts
interface PendingChange {
  section_id: string;
  item: LocalItem;
  attempts: number;     // bounded to 20 in drainPending()
  added_at: string;
}
```

```ts
interface LocalItem {
  local_id: string;
  text: string; checked: boolean; deleted: boolean;
  updated_at: string;
  qty?: string; unit?: string;      // shopping
  priority?: 'high'|'medium'|'low'; // tasks
  note?: string;
}
interface SharedSection { id, type, name }
interface GroupData {
  id, name, secret, secret_rotated_at, member_count, sections: SharedSection[]
}
```

### Налаштування
- `theme` → `'system'|'light'|'dark'`
- `lang` → `'uk'|'en'`

## Формати дат

- В пам’яті: `Date` об’єкти.
- У AsyncStorage: ISO strings (через `JSON.stringify(date)` => `date.toJSON()` => `toISOString()`).
- При завантаженні явно `new Date(iso)` де треба.

## Multi-currency

- Кожна `Transaction` має необов’язкове `currency` поле. Якщо немає — `txCurrency(t)` повертає `'UAH'`.
- `calcTotalsByCurrency(allTxs, activeMonth, adjustments?)` повертає:
  ```ts
  Record<currencyCode, {
    income: number;      // в activeMonth
    expense: number;     // в activeMonth
    carryover: number;   // сума (income-expense) до activeMonth + adjustments[code]
    balance: number;     // carryover + income - expense
  }>
  ```
- `formatCurrency(n, cur, locale)` форматує:
  - Fiat: `Intl.NumberFormat({style:'currency'})` з кодом ISO 4217.
  - Crypto: `${symbol} ${n.toLocaleString(...)}` з адаптивними decimals (8/4/2 залежно від модуля).

## Міграційний шар

Поки що відсутній. При зміні структури (наприклад, додавання `currency` до Transaction):
1. Старі записи без `currency` обробляються `txCurrency()` як `'UAH'`.
2. Нові записи завжди мають `currency`.
3. Загальний підхід: **зворотна сумісність через optional поля + default helpers**, а не міграція storage.

Перед breaking change потрібно додати `app_data_version` (відкладено — див. M-DATA-4 у QA).
