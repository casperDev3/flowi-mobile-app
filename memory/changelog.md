# Changelog

Хронологія значущих сесій з Claude. Деталі — у git-історії.

## 2026-06-02 — Session 6 (security & UX hardening)

Великий прохід по UI/UX і QA-знахідках з `docs/`. Усі **Critical** закриті:

**Сервер (`flowi-server-app/core/`):**
- `views.py` повністю переписано — додано `_assert_member()` helper, який
  застосовано до всіх mutator-views. Не-члени отримують 403.
- `GroupDetailView` для не-членів повертає лише `{id, name, member_count}` без
  secret і без вкладеного контенту.
- Новий `SectionDetailView` для PATCH/DELETE з membership-check.
- `GroupNotifyView` має server-side throttle 10s/group/device через `cache`.
- `GroupRefreshSecretView` — rate limit 60s/group.
- `SyncView`, `GroupCreateView` — обмежені 120/min/IP.
- `secrets.choice` замість `random.choices` в `models.py:generate_secret` і у
  `views._generate_secret`.
- `serializers.py` — `_ALLOWED_DATA_KEYS` whitelist для `SharedItem.data` і
  `_LOCAL_ID_RE` для local_id.
- `consumers.py` — `GroupConsumer.connect()` парсить `device_id` з query і
  робить `close(4403)` для не-членів. `receive()` no-op.
- `settings.py` — `ALLOWED_HOSTS` тепер з env, дефолт обмежений.

**Мобайл sync (`app/(tabs)/shared.tsx`):**
- Pending queue `shared_pending_${gid}` для невдалих writes. `drainPending`
  ретраїть до 20 разів і викликається перед кожним sync.
- WS handler фільтрує `from_device_id === deviceId` echo для item_updated.
- API запити тепер передають `device_id` query/body всюди.
- Локалізація — десятки нових ключів у `translations.ts` (`balanceSplit`,
  `otherCurrencies`, `primaryBadge`, `notifyMembers`, `offlineBanner`, тощо).
- `pluralMember(n, lang)` підтримує EN.
- WS-Offline banner в group view.
- Notify modal: throttle UI (disabled button + countdown), foreground hint.
- Bell button продубльований в group-header.

**Мобайл Finance (`app/(tabs)/explore.tsx`, components):**
- `FinanceSummary` отримав `onSelectPrimary` — тап на рядок у попапі «Всі валюти»
  робить валюту основною.
- Currency picker у Add Modal перенесено в `horizontal ScrollView`.
- Amount input: regex `[0-9.,]` + collapsing multiple separators.
- Confirm `Alert.alert` перед видаленням кастомної валюти.
- `dateFilter` тепер `Date | null`, `isSameDay()` для порівнянь.
- Empty state з CTA `+ Додати`.
- `calcTotalsByCurrency` округлює до 8 десяткових знаків.
- `TransactionGroup` приховує currency-бейдж коли валюта = primary.

**Глобально:**
- `ErrorBoundary` в `app/_layout.tsx` ловить uncaught render errors.
- `c.sub` контраст піднято до 0.60+ (WCAG AA).
- `accessibilityLabel`/`accessibilityRole`/`hitSlop` додано до іконкових кнопок
  у Finance і Shared.

**Документація:**
- `docs/UI_UX_REVIEW.md` і `docs/QA_SECURITY_REVIEW.md` оновлено: фіксні
  пункти прибрані, лише залишок. Файли видаляться, коли список спорожніє.

## 2026-06-02 — Session 5

**Фінанси: мульти-валюта, перенесення залишку, розподіл балансу.**

- `utils/financeUtils.ts`:
  - Додано `Currency`, `CurrencyTotals`, `BUILTIN_CURRENCIES` (UAH, USD).
  - `Transaction.currency?: string` (default `'UAH'` через `txCurrency()`).
  - `calcTotalsByCurrency(txs, activeMonth, adjustments?)` — рахує carryover + дохід/витрата per валюта.
  - `formatCurrency(n, cur, locale)`.
  - `groupTransactions` тепер повертає `dayIncomeByCur` / `dayExpenseByCur`.
- `components/finance/FinanceSummary.tsx`:
  - Перероблено в одну hero-картку для **основної валюти** + до 2 вторинних рядків + кнопка «Показати всі (N)» → попап з усіма валютами.
  - Компактний layout (28pt balance, inline savings).
  - Props `primaryCode`, `onPickPrimary`.
- `components/finance/TransactionGroup.tsx`:
  - Денні підсумки розбито по валютах (бейджі).
  - Per-tx бейдж коду валюти.
- `app/(tabs)/explore.tsx`:
  - Stoarge `finance_currencies`, `finance_balance_adjustments`, `finance_primary_currency`.
  - Currency picker у Add Transaction modal (з інлайн-додаванням крипти).
  - Меню `…` → «Розподіл балансу» (модал з ручним коригуванням carryover + інлайн додавання крипти + видалення).
  - Tap на чип `UAH` у hero → picker основної валюти.
- `store/translations.ts`: ключі `carryover`, `currency`, `newCurrency`, `currencyTicker`, `currencySymbol`.

**Спільне: сповіщення учасників.**

- Сервер `flowi-server-app/core/views.py`:
  - `GroupNotifyView` → `POST /api/groups/{id}/notify/` → broadcast WS подія `notification`.
- `core/urls.py`: route додано.
- `app/(tabs)/shared.tsx`:
  - WS handler для `notification` → `Notifications.scheduleNotificationAsync(trigger: null)`.
  - Кнопка дзвіночок у sidebar header.
  - Модал «Сповістити учасників» з опційним повідомленням (≤280 символів).
  - Throttle 10 сек.
  - `requestNotificationPermissions()` на фокусі екрана.

**Інше:**
- `components/ui/icon-symbol.tsx`: додано mapping `arrow.left.arrow.right → swap-horiz`.
- Створено `docs/UI_UX_REVIEW.md` і `docs/QA_SECURITY_REVIEW.md`.
- Створено `memory/` з контекстом для Claude.

## Раніше (Sessions 1–4)

Див. `/Users/a1d/.claude/projects/-Users-a1d-Desktop-Pets-Flowi/memory/MEMORY.md` (auto-memory Claude) для:
- Session 1: keyboardShouldPersistTaps для chips, inline category add, meetings recurrence
- Session 2: containers → Stack screen, settings link
- Session 3: shared tab, WebSocket sync infrastructure
- Session 4: shared bg fixes, budget.tsx, Google Calendar + audio recording для meetings
