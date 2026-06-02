# Архітектура

## Стек

- **Expo SDK ~54**, React Native **0.81**, `expo-router` ~6 (file-based routing).
- **TypeScript** обов’язковий усюди.
- **AsyncStorage** для локального стану (без шифрування — див. `QA_SECURITY_REVIEW.md`).
- **expo-notifications** для локальних push.
- **expo-blur**, **expo-linear-gradient**, **expo-symbols** (SF Symbols, iOS).
- **WebSocket** через нативний `WebSocket` API (без `socket.io`).

## Папки

```
flowi-mobile-app/
├── app/                    # expo-router маршрути
│   ├── _layout.tsx         # root layout, провайдери
│   ├── (tabs)/
│   │   ├── _layout.tsx     # таб-навігація
│   │   ├── shared.tsx      # Спільне (tab, активний)
│   │   ├── index.tsx       # Завдання
│   │   ├── explore.tsx     # Фінанси
│   │   ├── health.tsx      # Здоров'я
│   │   ├── settings.tsx    # Налаштування
│   │   ├── time.tsx        # Час (hidden, href:null)
│   │   └── agent.tsx       # Агент (hidden)
│   └── *.tsx               # Stack-екрани (notes, archive, …)
├── components/
│   ├── shared/             # MonthPicker
│   ├── finance/            # FinanceSummary, TransactionGroup
│   ├── health/             # MiniBarChart, RingCell
│   ├── tasks/              # CompactCard
│   └── ui/                 # icon-symbol.tsx (Material) + .ios.tsx (SF)
├── store/                  # глобальний стан, контексти, API
│   ├── i18n.tsx + translations.ts
│   ├── storage.ts          # loadData/saveData wrappers
│   ├── api-config.ts       # API_BASE, WS_BASE
│   ├── notifications.ts    # реміндери, expo-notifications
│   ├── sync.ts             # legacy sync helpers
│   └── timer-context.tsx
├── utils/                  # чисті функції
│   ├── dateUtils.ts        # isSameDay, isSameMonth, startOfMonth
│   ├── financeUtils.ts     # Transaction, Currency, calcTotalsByCurrency
│   ├── taskUtils.ts
│   └── healthUtils.ts
├── docs/                   # огляди (UI/UX, QA/Security)
└── memory/                 # цей contexт
```

## Серверна частина

Окрема директорія: `/Users/a1d/Desktop/Pets/Flowi/flowi-server-app/`.
Стек: **Django 6** + **DRF** + **Channels** + **Daphne** (ASGI).
Деплой: HTTPS `api.flowi.casperdev.site`, WSS `wss://.../ws/`.

Запуск локально:
```bash
cd flowi-server-app && .venv/bin/daphne -p 8000 flowi_server.asgi:application
```

## Ключові патерни

### 1. Локальне зберігання

```ts
const [data, setData] = useState<T[]>([]);
const [initialized, setInitialized] = useState(false);

useEffect(() => {
  loadData<T[]>('storage_key', []).then(d => { setData(d); setInitialized(true); });
}, []);

useEffect(() => {
  if (initialized) saveData('storage_key', data);
}, [data, initialized]);
```

**Прапор `initialized` обов’язковий** — без нього перший `saveData([])` перезапише
завантажений масив на порожній.

### 2. Місячний фільтр

```tsx
const [activeMonth, setActiveMonth] = useState(() => {
  const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1);
});
<MonthPicker month={activeMonth} onChange={setActiveMonth} ... />
```

Усі фільтри використовують `isSameMonth(date, activeMonth)` (з `dateUtils.ts`),
а не `toDateString()` (timezone-небезпечно).

### 3. Pull-to-refresh

```tsx
const [refreshing, setRefreshing] = useState(false);
const onRefresh = useCallback(() => {
  setRefreshing(true);
  loadXxx().finally(() => setRefreshing(false));
}, [loadXxx]);

<ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}>
```

### 4. WebSocket з reconnect

У `app/(tabs)/shared.tsx`:
- `wsRef`, `wsReconnectTimer`, `wsReconnectAttempts` через `useRef`.
- `activeGroupRef`, `deviceIdRef` — для уникнення stale closure у callbacks.
- `connectWS()` створює `WebSocket(`${WS_BASE}/group/${id}/?device_id=`)`.
- `onclose` → exponential backoff `min(1000*2^n, 30000)ms`.

### 5. Sync flow

`POST /api/sync/` із body `{device_id, group_id, since, items}` повертає
`{items: [...], server_time}`. Клієнт зберігає `server_time` у
`shared_sync_${gid}` для наступного запиту.

## Ризики (з QA_SECURITY_REVIEW.md)

- 🔴 **Сервер не перевіряє членство** в групі на більшості endpoints. Будь-який
  device_id може писати в будь-яку групу.
- 🔴 **WebSocket не вимагає auth** — `GroupConsumer.connect()` приймає всіх.
- 🔴 **persistItem** оптимістично оновлює стан + посилає на сервер; якщо
  POST fails, локально вже збережено, але сервер не знає — наступний `syncGroup`
  переписує локальне і **зміна губиться**. Потрібна черга невідправлених.
- 🟠 AsyncStorage — без шифрування, фінансові дані plaintext.

Деталі — в `docs/QA_SECURITY_REVIEW.md`.
