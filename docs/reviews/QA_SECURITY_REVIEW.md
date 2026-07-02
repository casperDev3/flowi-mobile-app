# Flowi — QA & Security Open Items

> Оновлено: 2026-06-02. Усі **Critical** закриті. Лише незакриті High/Medium/Low.
> Коли список стане порожнім — файл можна видалити.

---

## 🟠 High (бажано до production)

- **M-DATA-1** — AsyncStorage без шифрування. Для `transactions` і
  `finance_balance_adjustments` мігрувати на `expo-secure-store` або шифрувати
  JSON ключем з SecureStore. Потребує план міграції існуючих даних.
- **M-DATA-2** — `device_id` теж у AsyncStorage. Мігрується разом з M-DATA-1.
- **S-WS-3** — Server-side rate limit на WebSocket-події. Низький ризик (бо
  `receive()` тепер no-op), але група може отримати флуд від внутрішнього
  cron’у.

## 🟡 Medium

- **S-SEC-2** — Простір secret’у `26^4 × 10^4 ≈ 4.5×10^9`. Збільшити до
  `XXXXXX-XXXX` або зменшити TTL з 24 год до 1 год.
- **M-VAL-2** — Тікер кастомної валюти приймає будь-який верхній регістр + цифри.
  Strict regex `^[A-Z0-9]{2,8}$` + дубль-перевірка з feedback.
- **M-DATA-3** — `loadData` тихо повертає fallback при corrupted JSON. У
  production логувати в Sentry.
- **M-SYNC-2** — LWW конфлікт-резолюція для notes (CRDT через Y.js — окрема
  велика робота, відкладено).
- **M-ERR-1** — Багато `.catch(() => {})` без логування. У production додати
  Sentry/file logger.

## 🟢 Low / документоване

- **M-DATA-4** — Немає `app_data_version` для майбутніх міграцій схеми. Поки
  що працює через optional поля + helper-defaults.
- **M-VAL-3** — Крипто-точність обмежена 8 десятковими — задокументовано.
- **M-DATE-1** — Edge case TZ при `getMonth()` vs UTC ISO — задокументовано,
  працює коректно у типових юрисдикціях.
- **M-DATE-3** — `startOfMonth` локальний — задокументовано.
- **M-PUSH-1** — Сповіщення лише при WS-зʼєднанні (foreground). Hint вже
  показано в модалі. Real-push через APNs/Expo Push — окрема задача.
- **M-ERR-2** — Уніфікація читання `e?.json?.error` — частково.
- **M-PERF-1, 2** — Оптимізації для >1k транзакцій / debounced saveData.

---

## Регресійний чек-лист

Перевірити вручну перед релізом.

### Безпека

- [ ] `curl POST /api/sections/{id}/items/` без device_id → 403
- [ ] `curl POST /api/sync/` з чужим group_id → 403
- [ ] WS connect без device_id → close 4403
- [ ] WS connect з валідним group_id але чужим device_id → close 4403
- [ ] notify двічі за 5 сек з curl → 429 (server throttle)
- [ ] secret після перерегенерації — крипто-stright (не передбачуваний)

### Sync

- [ ] Edit item з вимкненим інтернетом → запис у `shared_pending_${gid}`
- [ ] Увімкнути інтернет → `drainPending` відправляє, чергa спорожнюється
- [ ] Edit на 2 пристроях одночасно → LWW по `updated_at` (для notes — known issue M-SYNC-2)

### Фінанси edge-cases

- [ ] Ввести `1e9` у amount → ігнорується
- [ ] `0.000000001` BTC → форматується коректно
- [ ] Транзакція о 23:59 локального часу 31-го числа місяця → коректно потрапляє в карри наступного

### Спільне

- [ ] Bell → push на другому пристрої (WS живий, foreground)
- [ ] Bell вдруге за 5 с → кнопка disabled + throttle-меседж
- [ ] WS впав → жовтий банер "Офлайн — зміни синхронізуються після відновлення"
- [ ] Видалити кастомну валюту → confirm-Alert, не видаляє транзакції
