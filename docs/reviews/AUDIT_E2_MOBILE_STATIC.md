# Аудит E2 — мобільний додаток, розбір коду

**Дата:** 2026-09-20
**Гілка:** `audit/ui-ux-2026-09`
**Об'єкт:** `flowi-mobile-app` — Expo ~54, React Native 0.81, expo-router ~6, TypeScript.
Розібрано статично: `app/` (53 файли екранів, включно з `app/(tabs)/*` і `app/project/[id]/*`),
`components/`, `store/`, `hooks/`, `utils/`, `constants/`, а також `app.json` і релевантні
частини `node_modules/@react-navigation/bottom-tabs`.

**Базова лінія (перевірена незалежно кожним напрямом):**
- `npx tsc --noEmit` — 0 помилок.
- `npx jest` — 1526 тестів у 112 наборах, усі зелені.
Жодна перевірка базову лінію не спростувала.

**Чим підкріплено, крім читання коду:**
- 8 нових доказових jest-тестів (сховище, refresh-токен, синк, i18n, продуктивність) — відтворюють
  описані сценарії, а не ілюструють їх.
- Прогін `babel-plugin-react-compiler@1.0.0` з `panicThreshold:'none'` по всіх 243 файлах.
- Власний парсер JSX по 773 дотикових елементах (accessibility-пропси, розміри, hitSlop).
- Розрахунок контрасту WCAG (relative luminance + альфа-композитинг на фактичне тло) для всіх
  палітр `getScreenColors()`, `HEALTH_ACCENTS` і таб-бара.
- 6 власних Playwright-специфікацій у `e2e-audit/` на живому Expo-web — але **лише до авторизації**
  (`/workspace`, `/welcome`, `/login`, `/register`, `/forgot-password`): далі падає SecureStore.

**Чого тут немає:** симулятора під час прогону не було, тож усе, що видно лише на пристрої
(реальний рендер, safe area, insets, клавіатура, нотифікації, HealthKit, аудіозапис, VoiceOver),
не підтверджено. Такі знахідки зібрані в окремий розділ як технічне завдання для нативного прогону.

---

## Підсумок

| Напрям | P0 | P1 | P2 | Покриття |
|---|---|---|---|---|
| Поведінка при збоях (ERR) | 1 | 11 | 2 | `store/api.ts`, `storage.ts`, `synced-storage.ts`, `auth.tsx`, `workspace.ts`, `sync-engine.tsx`, `project-sync.ts` прочитано; ~30 екранів; 4 jest-сценарії + 2 живі спеки |
| Доступність (A11Y) | 0 | 7 | 4 | повний скан 773 дотикових елементів у 49 екранах і 17 теках компонентів; контраст усіх палітр пораховано; 2 живі прогони (світла/темна) |
| Компонування 375/393 (L) | 0 | 5 | 5 | 6 станів виміряно в браузері 375×667; усі `app/project/[id]/*`, таб-бари, 20+ bottom-sheet-ів, `BottomTabBar.js` прочитано |
| i18n | 0 | 7 | 2 | скан кирилиці по `app/ components/ store/ utils/ hooks/ constants/`; тест парності словника; живий прогін з `lang='en'` |
| Продуктивність (PERF) | 0 | 4 | 9 | три головні таби + шар сховища прочитано; прогін React Compiler (105 бейлаутів у 51 файлі); 2 мікробенчмарки |
| Цілісність даних (DI) | 1 | 4 | 3 | `storage.ts`, `storage-lock.ts`, `synced-storage.ts`, `sync-contract.ts`, `sync-conflicts.ts` прочитано цілком; 5 доказових тестів |
| **Разом** | **2** | **38** | **25** | 65 знахідок, 2 спростовано |

**Чесна оцінка.** Застосунок не «сирий»: у ньому вже є правильні рішення майже для кожної знайденої
проблеми — `updateSynced` замість `saveSynced`, `useTopInset()` замість `SafeAreaView edges`,
`ScreenHeader` з обов'язковим `accessibilityLabel`, `pluralForm()`, `localDateKey()`, `formatDuration()`,
`sheetColumnStyle()`. Домінуючий клас дефектів — не «не подумали», а «полагодили в одному місці й не
рознесли на решту»: тому більшість знахідок зводиться до кількох шаблонів, а не до кількох десятків
незалежних багів. Два P0 — реальні втрати даних і обидва лежать в одній площині: шар сховища не
відрізняє «порожньо» від «не прочиталось», а чотирнадцять екранів пишуть у синхронізований ключ увесь
масив зі свого застарілого React-стану, ставлячи тумбстоуни на чужі записи. Найслабше покриття — не
код, а спостереження: 21 знахідка з 65 не має жодного підтвердження на пристрої, і серед них уся
геометрія (insets, таб-бар, FAB) та всі нотифікації. Два пункти аудиту не пережили перевірку і винесені
в окремий розділ, ще у восьми уточнено формулювання — деталі в «Статусі перевірки» кожної знахідки.

---

## P0

### ERR-01 — Сховище ковтає і читання, і запис: «порожньо» замість «не прочиталось», а наступний автозапис затирає ключ порожнім масивом

**Файли:** `store/storage.ts:39-47`, `store/storage.ts:50-57`, `store/synced-storage.ts:511`,
`app/notes.tsx:109-124`, `app/health-meds.tsx:41-42`, `app/health-habits.tsx:45-46`,
`app/health-vaccines.tsx:45`, `app/health-checkups.tsx:46`, `app/containers.tsx:315`,
`app/ideas.tsx:256`, `app/bugs.tsx:220`, `app/data.tsx:333-336`, `app/banks.tsx:119-123`

```ts
export async function loadData<T>(key: string, fallback: T): Promise<T> {
  try { const json = await AsyncStorage.getItem(key); ... }
  catch (e) { if (__DEV__) console.warn(`[storage] loadData(${key}) failed:`, e); return fallback; }
}
export async function saveData(key: string, data: unknown): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(data)); }
  catch (e) { if (__DEV__) console.warn(`[storage] saveData(${key}) failed:`, e); return; }
}
// app/health-meds.tsx
useEffect(() => { loadData<Medication[]>(MEDS_KEY, []).then(d => { setMeds(d); setInitialized(true); }); }, []);
useEffect(() => { if (initialized) void saveSynced(MEDS_KEY, meds); }, [meds, initialized]);
```

**Що бачить користувач.** Зіпсований JSON, обірваний запис або «Row too big to fit into CursorWindow»
на Android віддають екрану `[]`. Екран малює звичайний порожній стан («Немає нотаток · Натисніть +
щоб додати»), а ефект-дзеркало одразу пише цей `[]` назад — ще читабельні байти знищено. Дзеркально:
`saveData` ніколи не кидає, тож `app/data.tsx` після відновлення з копії показує «Успішно · Дані
відновлено», навіть якщо не записано жодного ключа.

**Правка.** `loadData` має розрізняти «ключа немає» і «не вдалося прочитати» (окремий результат або
кидок), `saveData` — прокидати помилку нагору. Екрани з ефектом-дзеркалом не вмикають `initialized`,
якщо читання провалилось. Мінімум: не перезаписувати ключ, читання якого впало, і показувати смужку
«дані не прочитались» замість порожнього стану.

**Статус:** CONFIRMED. Відтворено в `__tests__/audit-errors-skeptic.test.ts` (обидва тести зелені):
зіпсований JSON у `health_meds` → `loadData` віддає `[]`, `saveSynced` кладе назад `'[]'`, outbox
порожній; те саме при кидку `getItem`. Ланцюг `saveSynced→updateSynced` (`synced-storage.ts:488-511`)
під блокуванням ще раз читає ключ тим самим `loadData` з fallback `[]`, тож diff не бачить видалень і
тумбстоунів немає — сервер не дізнається. Для офлайн-користувача копії немає взагалі; для онлайн
курсор інкрементального pull уже зрушено, тож без повного resync дані теж не повертаються.
`ErrorBoundary` ловить рендер, не сховище.

---

### DI-01 — 14 екранів зберігають увесь масив зі свого React-стану: запис, що приїхав синком, отримує тумбстоун і зникає з сервера

**Файли:** `app/health-meds.tsx:42`, `app/health-habits.tsx:46`, `app/health-vaccines.tsx:45`,
`app/health-checkups.tsx:46`, `app/notes.tsx:123`, `app/ideas.tsx:256`, `app/bugs.tsx:220`,
`app/containers.tsx:315`, `app/workouts.tsx:758-761`, `hooks/use-health-entries.ts:134`,
`app/(tabs)/time.tsx:186`, `app/(tabs)/explore.tsx:331`, `app/(tabs)/explore.tsx:346`, `app/budget.tsx:189`

```ts
// app/health-meds.tsx:41-42
useEffect(() => { loadData<Medication[]>(MEDS_KEY, []).then(d => { setMeds(d); setInitialized(true); }); }, []);
useEffect(() => { if (initialized) void saveSynced(MEDS_KEY, meds); }, [meds, initialized]);

// app/workouts.tsx:757-762 — три колекції з одного застарілого стану
useEffect(() => {
  if (!initialized) return;
  void saveSynced('workouts', workouts);
  void saveSynced('exercises', exercises);
  void saveSynced('workout_programs', programs);
}, [workouts, exercises, programs, initialized]);
```

**Що бачить користувач.** На вебі додали ліки → телефон стягнув їх у `health_meds` → користувач на
відкритому екрані ліків тисне «випив» будь-якої іншої позиції → нові ліки зникають усюди: локально,
на сервері й на решті пристроїв. Те саме з категоріями фінансів, записами часу, `health_entries_v2`
(вага, тиск, сон). У `workouts.tsx` гірше: зміна одного тренування перезаписує ще й `exercises` та
`workout_programs` зі свого застарілого стану.

**Правка.** Перевести на вже наявні інструменти: `useSyncedList` (`hooks/use-synced-list.ts`) або пару
`updateSynced(key, mutate)` + `useStorageRefresh([key], reload)` — рівно як уже зроблено для `tasks`
(`app/(tabs)/index.tsx:309`), `meetings` (там же 528-535), `transactions`/`accounts`
(`explore.tsx` persistTxs/persistAccounts) і `active_timers` (`timer-context.tsx` mutateTimers).
`saveSynced` лишити тільки для відновлення бекапу, де «масив цілком» і є намір.

**Статус:** CONFIRMED. `updateSynced` (`synced-storage.ts:488`) читає свіже сховище як `existing`, а
`saveSynced` (466-470) передає `() => items`, ігноруючи свіже; `diffItems` (362) кладе відсутні в стані
записи в `deleted`, `enqueueChanges` — у outbox як тумбстоун; шапка самого `updateSynced` (477-484) цей
сценарій прямо описує як дефект. Pull пише в ті самі ключі напряму (`sync-engine.tsx:794-795`). Grep по
кожному файлу зі списку: ні `useStorageRefresh`, ні `subscribeToStorage`, ні `useSyncedList` немає.
`REFRESH_KEYS` в `explore.tsx:115` — лише `['transactions','accounts']`, тож categories і
finance_currencies підпискою не накриті. Доведено тестом
`__tests__/audit-data-skeptic.test.ts` → «ставить тумбстоун на запис, що приїхав синком повз екран».
Два з перелічених місць мають часткове пом'якшення (`useFocusEffect` у `time.tsx`,
`timeEntriesRevision` у `use-health-entries.ts`), але pull під час фокусу вони не ловлять.

---

## P1

### ERR-02 — Тимчасова відмова `/auth/refresh/` вилогінює живу сесію всупереч власному контракту `RefreshOutcome`

**Файли:** `store/api.ts:254-271`, `store/api.ts:136-142`

```ts
/** `retry` — тимчасова перешкода (мережа, 429, 5xx); токени чіпати НЕ можна. */
...
  if (res.status === 401 && auth) {
    const refreshed = (await tryRefresh()) === 'ok';
    if (refreshed) { ... res = await doFetch(path, { ...init, headers }); }
  }
  // Після другої спроби все ще 401 → сесія мертва
  if (res.status === 401 && auth) { await clearTokens(); emitSessionExpired();
```

**Що бачить користувач.** Сервер перезавантажувався (503, таймаут, обрив) — людина бачить «Сесія
закінчилась» і мусить входити наново, хоча refresh-токен живий. `refreshSession()` (шлях WebSocket,
186-193) цю різницю тримає правильно — два шляхи в одному модулі розходяться.

**Правка.** Виходити з сесії лише коли `tryRefresh()` повернув `'invalid'`. На `'retry'` — кинути
помилку мережі, токени лишити, дати викликачу повторити.

**Статус:** CONFIRMED. `__tests__/audit-errors-api-skeptic.test.ts`: 401 на `/tasks/` + 503 на
`/auth/refresh/` → `apiFetch` кидає `session_expired`, SecureStore після виклику порожній
(`flowi_access` і `flowi_refresh` стерто), слухач `onSessionExpired` спрацював. Контрольний зразок у
тому ж файлі: `refreshSession()` на 503 повертає `'retry'` і токени не чіпає. Наявний
`__tests__/api-refresh.test.ts:198` перевіряє лише правильний шлях.

---

### ERR-03 — 429 від throttle на вході показано як «Невірний email або пароль»

**Файли:** `app/login.tsx:113-123`, `flowi-server-app/flowi_server/settings.py:299-306`

```ts
        } else if (e.code === 'timeout' || e.code === 'network') { setGeneralError(tr.authNetworkError);
        } else if (e.status >= 500) { setGeneralError(tr.authServerError);
        } else { setPasswordError(tr.authInvalidCreds); }   // ← сюди падає і 429
// сервер: 'auth': '1000/hour' if DEBUG else '20/hour'
```

**Що бачить користувач.** На проді ліміт `auth` — 20/год на IP; офіс за NAT або кілька спроб пригадати
пароль вичерпують відро. Далі кожна спроба з **правильним** паролем дає «Невірний email або пароль».
Людина йде скидати пароль — а `/auth/forgot/` сидить на тому ж відрі й теж відмовить.

**Правка.** Окрема гілка `e.status === 429` з текстом «забагато спроб, спробуйте за N хв»
(`Retry-After` або число з `detail`), і така сама в `register.tsx`, `forgot-password.tsx`, `account.tsx`.

**Статус:** CONFIRMED. Прочитано повний catch із рядка 92 — гілки для 429 немає, вона падає в `else`.
Сервер: `accounts/views.py:254` `LoginView.throttle_scope='auth'`, `:483` `ForgotPasswordView` теж
`'auth'`. Grep по `app/` і `store/`: єдина згадка 429 — `sync-engine.tsx:376` (retryable для синку).
Підтверджено в браузері: `e2e-audit/err-login-throttled.spec.ts` підміняє відповідь на 429 із тілом DRF
— на екрані «Невірний email або пароль».

---

### ERR-04 — Тимчасово недоступний workspace показано як «Це не Flowi workspace — оновіть сервер»

**Файли:** `store/workspace.ts:154`, `store/workspace.ts:183-187`, `app/workspace.tsx:56-57`

```ts
    const res = await fetch(`${origin}/api/workspace/`, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error('not_workspace');
...
  } catch (e) {
    if (e instanceof Error && e.message === 'not_workspace') return { ok: false, code: 'not_workspace' };
```

**Що бачить користувач.** 502/503 від nginx під час деплою, 500 від Django, 429 від throttle
`workspace` — усе це на найпершому екрані застосунку читається як «Це не Flowi workspace або сервер
застарів — оновіть сервер». Людина з правильною адресою починає її правити або смикати адміна.

**Правка.** Розділити не-2xx за статусом: 5xx і 429 → «сервер тимчасово недоступний» + «Повторити»;
`not_workspace` лишити для 404, не-JSON і відповіді без `workspace_protocol`.

**Статус:** CONFIRMED. `workspace.ts:154` перетворює будь-який не-2xx на той самий `Error`, який catch
мапить у код `not_workspace`; `app/workspace.tsx` мапить його на `tr.workspaceErrorNotWorkspace`
(`translations.ts:2173`). `isBlocking()` не вважає цей код блокуючим, тож кнопка «Перевірити»
лишається — це пом'якшує, але текст хибний. Підтверджено в браузері:
`e2e-audit/err-workspace-down.spec.ts` (перехоплення `**/api/workspace/` → 503).

---

### ERR-05 — Збій авто-приєднання за запрошенням оголошено недійсним запрошенням, і посилання одразу знищено

**Файл:** `app/_layout.tsx:262-280`

```ts
      } catch (e) {
        if (__DEV__) console.warn('[invite] авто-приєднання після входу не вдалося:', e);
        Alert.alert(tr.error, tr.inviteInvalid);
        await clearPendingInvite();
      }
```

**Що бачить користувач.** Щойно ввійшов по посиланню-запрошенню, бачить «Це запрошення недійсне» —
і токен стерто, тож повторити приєднання із застосунку вже неможливо: треба просити посилання наново.
Причина ж могла бути суто тимчасова.

**Правка.** Чистити pending лише на відмову по суті (404/410/вже учасник). На мережевих і 5xx — лишити
токен, сказати «не вдалося приєднатись, спробуємо пізніше» і дати «Повторити» (екран `/invite` є).

**Статус:** CONFIRMED. Сусідній коментар прямо каже «не чистимо pending_invite МОВЧКИ», але catch ловить
усе: `acceptInvite` іде через `apiFetch`, тож `OfflineError`, 5xx, таймаут і збій динамічного `import()`
потрапляють у ту саму гілку. Гілка виконується лише коли `cameFromAuthFlowThisSession`; на холодному
старті шлях інший, але сценарій «щойно ввійшов по посиланню» покривається саме цим кодом.

---

### ERR-06 — Мутації проєкту, відхилені сервером, зникають мовчки — на відміну від особистого синку

**Файли:** `store/project-sync.ts:595-605`, `store/project-sync.ts:812-818`,
`store/sync-engine.tsx:170`, `store/sync-engine.tsx:183`, `app/sync.tsx:60-61`

```ts
    const rejections = response.rejected ?? [];
    const finishedIds = new Set([...response.acknowledged.map(i => i.mutation_id), ...response.conflicts.map(i => i.mutation_id), ...rejections.map(i => i.mutation_id)]);
    await removeMutationsFromOutbox(finishedIds);
    if (rejections.some(r => r.reason === 'forbidden')) hadForbiddenRejection = true;
    if (rejections.length && __DEV__) console.warn(`[project-sync] ${projectId} відхилено:`, ...);
```

**Що бачить користувач.** Застаріла роль: UI дозволив дію, сервер відповів `forbidden` — правка
викидається з outbox, `needsFullResync` скидає курсор, наступний pull повертає запис до серверної
правди. Введене зникає з екрана без жодного слова. Для особистого потоку для цього є ключ
`sync_rejected_v2` і `rejectedCount` на `/sync`; у проєктного — немає.

**Правка.** Писати проєктні rejections у той самий журнал (або сусідній ключ), показувати на `/sync` і
давати тост «зміну не прийнято: немає прав» із текстом запису, щоб його можна було відновити.

**Статус:** CONFIRMED. Grep по всьому репо: `quarantineRejections` згадується лише у
`store/sync-engine.tsx` (оголошення 187, єдиний виклик 837) — у проєктному потоці його немає.
`project-sync.ts:812-818` ставить `cursor:0`/`revisions:{}` при `hadForbiddenRejection`, тобто наступний
pull свідомо відкочує локальний запис.

---

### ERR-08 — «Надіслати розробнику» позначає баг/ідею надісланими, не дивлячись на відповідь

**Файли:** `app/bugs.tsx:290-299`, `app/ideas.tsx:332-341`, `app/bugs.tsx:160`, `app/ideas.tsx:189`

```ts
  const sendToDev = useCallback((bug: Bug) => {
    if (bug.sentToDev) return;
    if (!isOnlineMode()) { Alert.alert('Офлайн', 'Надсилання недоступне в офлайн-режимі'); return; }
    fetch(REPORTER_URL, { method: 'POST', ... }).catch(() => {});
    setBugs(p => p.map(b => b.id === bug.id ? { ...b, sentToDev: true } : b));
  }, []);
```

**Що бачить користувач.** Картка фарбується зеленим, кнопка йде в `disabled` — звіт «надіслано». Будь-яка
відмова (500 від Apps Script, 302 на логін, throttle, обрив) цього не змінює, а ранній `return` і
`disabled={bug.sentToDev}` (`bugs.tsx:158`) роблять повтор неможливим.

**Правка.** `await` + перевірка `res.ok`; ставити `sentToDev` лише після успіху, при відмові показати
помилку й лишити кнопку активною.

**Статус:** CONFIRMED. Обидві копії перевірено: `fetch(...).catch(() => {})` без `await` і без `res.ok`,
одразу `setBugs`/`setIdeas` з `sentToDev:true`. Повтору немає ні через UI, ні через код.

---

### ERR-09 — Учасники проєкту: помилка завантаження малюється як проєкт без жодного учасника

**Файли:** `app/project/[id]/members.tsx:100-117`, `app/project/[id]/members.tsx:410-412`

```ts
    } catch (e) {
      if (e instanceof OfflineError) { setMembers(await getCachedMembers(projectId)); setOffline(true); }
      else if (__DEV__) { console.warn('[project/members] завантаження не вдалося:', e); }
    } finally { setLoading(false); }
...
        {loading && members.length === 0 ? (<ActivityIndicator .../>) : (<View>{sortedMembers.map(...)}</View>)}
```

**Що бачить користувач.** Після 500/таймауту/429 — порожня сторінка без тексту, без пояснення і без
«Повторити». Виглядає як «у проєкті нікого немає», що завжди неправда: сам користувач у ньому є.

**Правка.** Окремий стан помилки з текстом і кнопкою «Повторити»; порожній список — лише після
успішної відповіді.

**Статус:** CONFIRMED. Гілка кешу спрацьовує лише на `OfflineError`, решта — `console.warn` у `__DEV__`;
`finally` безумовно знімає `loading`. `members` ініціалізується `[]`, себе в список не підмішують.
Пом'якшення: `load` стоїть у `useFocusEffect`, тож повторний вхід на екран ретраїть.

---

### ERR-10 — Нагадування (звички, ліки) створюються без перевірки, чи їх узагалі поставлено `[пристрій]`

**Файли:** `app/health-habits.tsx:48-56`, `app/health-meds.tsx:44-55`, `store/notifications.ts:229-233`

```ts
    if (m) { await scheduleDailyReminder(`habit_${id}`, ..., title.trim(), tr.habits); notifId = `habit_${id}`; }
// store/notifications.ts
  const globalEnabled = await isNotificationsEnabled();
  if (!globalEnabled) { ... return []; }
  const granted = await requestNotificationPermissions();
  if (!granted) return [];
```

**Що бачить користувач.** Картка показує «08:00», людина розраховує на нагадування, якого ніколи не
буде — ні натяку при створенні, ні в списку.

**Правка.** Перевіряти повернене значення: при `false`/`[]` не ставити `reminderAt`/`notifIds`, а
показати «нагадування не увімкнено — дозвольте сповіщення» з переходом у налаштування; у списку
позначати записи без реального нагадування.

**Статус:** CONFIRMED статично. `scheduleDailyReminder` повертає `Promise<boolean>` (`notifications.ts:151-164`),
`scheduleMedReminders` — `[]` (220-233); викликачі результат ігнорують (`health-habits.tsx:52` присвоює
`notifId` безумовно, `health-meds.tsx:48` кладе `[]` у запис). Сам факт «сповіщення не прийде»
підтверджується лише на пристрої.

---

### ERR-12 — Аудіозапис: зупинка й відтворення падають мовчки, а відсутність пакета показують людині командою npm `[пристрій]`

**Файли:** `app/(tabs)/index.tsx:762`, `:793-797`, `:811-814`; `app/meetings.tsx:723`, `:757-761`, `:775-778`

```ts
    if (!AVAudio) { Alert.alert('Потрібен пакет', 'Встановіть: npx expo install expo-av'); return; }
...
    } catch (e: any) {
      setRecordingStartedAt(null);
      if (__DEV__) console.warn('[record] stop error:', e);
    }
```

**Що бачить користувач.** Якщо `stopAndUnloadAsync()` впаде, таймер зникає з екрана, файл не
прикріплено до задачі/наради, повідомлення немає — записана розмова втрачена без сліду. Тап по «play»
на недоступному файлі не робить нічого.

**Правка.** Показувати відмову людині (тост «не вдалося зберегти запис»), не втрачаючи URI, якщо він є;
текст про відсутній модуль замінити на людський і перевести в `tr.*`.

**Статус:** CONFIRMED, з двома уточненнями. Гірше, ніж описано: у catch скидається лише
`recordingStartedAt`, а `isRecording` лишається `true` і `recordingRef.current` ненульовим — екран
застрягає в стані «йде запис» без таймера, повторний stop упирається в той самий збій. М'якше в іншому:
`expo-av` є в `package.json` (`~16.0.8`), тож Alert «Встановіть…» — гілка для рідкісного випадку
відсутнього нативного модуля, а не типовий екран.

---

### ERR-13 — Повідомлення про помилки й підтвердження незворотних дій зашиті українською повз i18n

**Файли:** `app/data.tsx:179-348` (16 `Alert.alert`), `app/archive.tsx:213-214`,
`app/(tabs)/index.tsx:762-820`, `app/meetings.tsx:594-723`, `app/bugs.tsx:168-292`,
`app/ideas.tsx:329-334`, `app/budget.tsx:308-318`, `app/(tabs)/agent.tsx:222`,
`components/today/SyncBadge.tsx:16-67`, `app/containers.tsx` (плейсхолдери, 67 кириличних рядків у JSX)

```ts
// app/data.tsx
      Alert.alert('Помилка', 'Не вдалося відновити дані.');
// app/archive.tsx
    Alert.alert('Видалити назавжди?', 'Завдання буде видалено без можливості відновлення.', ...)
// components/today/SyncBadge.tsx
  if (mins < 1) return 'щойно';
```

**Що бачить користувач.** Людина з англійською локаллю підтверджує незворотне видалення, не прочитавши,
що саме підтверджує, і не розуміє бейджа «Синхр…».

**Правка.** Перенести в `tr.*` щонайменше все, що в `Alert.alert`, і все в `SyncBadge`. Тест на парність
уже є (`__tests__/translations-parity.test.ts`) — додати до нього лінт на кирилицю в JSX/Alert поза
`translations.ts`.

**Статус:** CONFIRMED, з поправкою. `app/data.tsx` — 16 захардкоджених `Alert.alert`
(179, 182, 206, 232, 236, 245, 257, 259, 268, 273, 276, 288, 335, 339, 348, 382); `SyncBadge.tsx:16-20`
плюс жорстка локаль `'uk-UA'`. Поправка: в `app/containers.tsx` `Alert.alert` немає жодного
(`grep -c` = 0) — там 67 кириличних рядків у JSX, серед них користувацькі плейсхолдери
(`:121 'Порожньо'`, `:520 'Нова річ...'`, `:607 'Введи назву вище і натисни ↑'`).

---

### ERR-14 — HealthKit: помилка читання віддається як «0» і «немає даних», а екран пише «оновлено щойно» `[пристрій]`

**Файли:** `store/healthkit.ts:147-157`, `:172-179`, `:198-214`; `app/apple-health.tsx:139-152`

```ts
  } catch { return 0; }
  ...
  } catch { return []; }
// app/apple-health.tsx
    const [t, w, wo, hr] = await Promise.all([fetchTodayData(), fetchWeekData(), fetchWorkouts(), fetchHeartRateSamples(24)]);
    ...
    setLastSync(new Date());
```

**Що бачить користувач.** Графік нулів, нічим не відрізненний від справжніх «сьогодні 0 кроків», і
напис, що дані щойно оновлено. Людина вважає це фактом про своє здоров'я.

**Правка.** Повертати з `querySum`/`querySamples` ознаку відмови (`null`/`{ok:false}`) окремо від
справжнього нуля; малювати «дані недоступні — перевірте дозволи Health» і не оновлювати `lastSync`,
коли жоден запит не вдався.

**Статус:** CONFIRMED, з уточненням мотивації. Цитати точні; `Promise.all` без перевірок і безумовний
`setLastSync(new Date())` на місці. Але для **відкликаного** дозволу HealthKit за дизайном Apple і так
віддає порожній результат без помилки — цей випадок цими catch не спричинений; реально вони ховають
збої SDK і запиту. Решта знахідки чинна.

---

### A11Y-01 — 136 іконкових кнопок без `accessibilityLabel`: для VoiceOver це «кнопка» без імені

**Файли:** `app/(tabs)/index.tsx:1953,2135,2521,2607,2755,2791,2902,3015,3019`;
`app/meetings.tsx:1083,1090,1094,1100,1121,1126,1169`; `app/workouts.tsx:150,270,432,578,606,611,672,677,1069,1076`;
`app/(tabs)/explore.tsx:973,1317,1325,1331,1564,1615,1658,1686`; `app/containers.tsx:223,228,529,625,630,645`;
`components/shared/MeetingFormSheet.tsx:99,105,304,428,435,602`; `components/tasks/CalendarGrid.tsx:25,31`;
`app/login.tsx:136`; `app/register.tsx:199`; `app/forgot-password.tsx:154,250,274`;
`app/(tabs)/time.tsx:638,645,651,709,805`; `app/account.tsx:220,293,312,332,409`;
`app/banks.tsx:427,515,597,664,858`; `app/finance-stats.tsx:540,544,912,952,958` — усього 136 місць у 40 файлах

```tsx
// app/meetings.tsx:1083 — уся група кнопок хедера екрана «Зустрічі»
<TouchableOpacity onPress={() => router.back()} style={[s.hBtn, ...]}>
  <IconSymbol name="chevron.left" size={18} color={c.sub} />
</TouchableOpacity>
// app/forgot-password.tsx:250 — показати/сховати новий пароль
<TouchableOpacity onPress={() => setShowNewPwd(v => !v)} hitSlop={{...}}>
  <IconSymbol name={showNewPwd ? 'eye.slash' : 'eye'} size={18} color={c.sub} />
</TouchableOpacity>
```

**Що бачить користувач.** На «Зустрічах» — чотири безіменні кнопки підряд у хедері (назад / сьогодні /
синхронізація Google Calendar / додати); відрізнити їх можна лише натиснувши. Непослідовність усередині
одного сценарію: `login.tsx:199` і `register.tsx:287,318` мають ім'я для «ока», а
`forgot-password.tsx:250,274` — ні, тож при відновленні пароля незряча людина не може перевірити
введене.

**Правка.** Перевести хедери на `components/shared/ScreenHeader.tsx` + `HeaderButton`, де
`accessibilityLabel` уже обов'язковий за типом. Решті — `accessibilityLabel={tr.xxx}` (не літералом,
див. A11Y-09). Проти відростання боргу — ESLint `react-native-a11y/has-accessibility-props` або власний
тест із порогом.

**Статус:** CONFIRMED. Власним скануванням дістав 144 icon-only `Touchable`/`Pressable` без label у 49
файлах — знахідка применшила, а не завищила. `ScreenHeader.tsx:58-59` містить
`/** Обов'язковий: іконка сама по собі скрінрідеру нічого не каже. */ accessibilityLabel: string;` —
рішення існує, ці екрани його не беруть. RN не виводить label з `IconSymbol`.

---

### A11Y-02 — Світла тема: вторинний текст дає 4.21:1 при нормі 4.5:1, і `tokens.ts` тричі стверджує протилежне

**Файли:** `constants/tokens.ts:27,41,54,72-74`, `utils/healthTheme.ts:35`;
1395 використань `c.sub` як `color` і 124 як `placeholderTextColor`

```ts
// constants/tokens.ts:27 — задокументована обіцянка
 * - `sub`      ≥ opacity 0.62 (dark) / 0.58 (light) — відповідає WCAG AA (≥4.5:1)
// фактичне значення
  sub: isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
```

**Що бачить користувач.** Кожен підпис поля, плейсхолдер і мета-інфо у світлій темі не дотягує до
1.4.3. Виміряно на живому рендері (`e2e-audit/a11y-preauth.spec.ts`, chromium-pro-light): 4.21:1 для
«ІМ'Я (НЕОБОВ'ЯЗКОВО)», «EMAIL», «ПАРОЛЬ» (11px) і «Вже є акаунт? Увійти». 124 поля вводу мають
`placeholderTextColor={c.sub}` — людина з низьким зором не бачить підказки, а іншої в цих полів немає.

**Правка.** Підняти альфу світлого `sub` до ~0.66 і перевірити той самий зсув для всіх восьми палітр
`getScreenColors()` та `getHealthColors()`. Коментарі в `tokens.ts:27,41,54` виправити на фактичні
числа й закріпити юніт-тестом контрасту `sub`/`subStrong` проти `bg1`, `bg2` і `card`.

**Статус:** CONFIRMED. Перерахунок незалежний: `rgba(26,20,51,0.58)` → 4.22 на bg1 `#F4F2FF`, 4.09 на
bg2 `#EAE6FF`, 4.34 на card — збіг до сотої. Темна 0.62 → 6.87, там усе гаразд.
`utils/healthTheme.ts:35` дублює значення поза `tokens.ts`, тож одна правка палітри його не зачепить.
Дві дрібниці: визначення `sub` для 'tasks' стоїть на рядку 72 (цитата зсунута на один); запропоноване
0.66 дає не ~5.0, а 5.47 на bg1 і 5.25 на bg2 — з запасом.

---

### A11Y-03 — 126 зі 129 полів вводу і всі 8 `Switch` без `accessibilityLabel`

**Файли:** `app/(tabs)/explore.tsx:1425,1493,1904,1911`; `app/(tabs)/settings.tsx:761`;
`app/notifications.tsx:334`; `app/data.tsx:419`; `app/health-nutrition.tsx:152`;
`app/health-body.tsx:146,152`; `app/project/[id]/settings.tsx:344`; `app/admin-workspace.tsx:286`
(зразки з labels — `components/health/{BodyEntrySheet:88,QuickAddSheet:83}`,
`components/finance/{SubscriptionDetail:257,SubscriptionForm:190}`)

```tsx
// app/(tabs)/explore.tsx:1424 — головне поле суми
<TextInput placeholder="0" placeholderTextColor={c.sub} value={amount} keyboardType="decimal-pad" ... />
// app/(tabs)/settings.tsx:755 — ToggleRow, спільний рядок усіх перемикачів
<Text style={[st.rowLabel, { color: text, flex: 1 }]}>{label}</Text>
<Switch value={value} onValueChange={onChange} ... />
```

**Що бачить користувач.** Поле суми озвучується як «0, текстове поле». Для `Switch` `<Text>` і `<Switch>`
— сусідні елементи без `accessible`-групування, тож друга зупинка звучить як «увімкнено, перемикач» без
вказівки, що саме. `ToggleRow` — спільний, тож це тиражується на всі налаштування; те саме в
`notifications.tsx:334` (глобальні push) і `data.tsx:419` (авто-резервування) — дії з наслідками,
які можна ввімкнути наосліп.

**Правка.** Полям — `accessibilityLabel` із того ж джерела, що й видимий підпис (зразок у
`QuickAddSheet.tsx:83`). Для `Switch` — обгорнути рядок у `<View accessible accessibilityRole="switch"
accessibilityState={{checked: value}} accessibilityLabel={label}>` або передати label прямо в `Switch`;
у `ToggleRow` це одна правка на всі налаштування. Врахувати `disabled` (`health-nutrition.tsx:152`).

**Статус:** CONFIRMED. Скан: 129 `TextInput`, з них 124 без label (розбіжність із 126 — від евристики
вкладених тегів); `Switch` рівно 8, без label усі 8. Поправка: над полем суми (`explore.tsx:1419`) таки
стоїть `<Text>` із символом валюти, тож теза «ні валюти» перебільшена — сам інпут усе одно озвучується
лише плейсхолдером «0».

---

### A11Y-04 — 547 із 773 дотикових елементів без `accessibilityRole`; чипи, вкладки й чекбокси не повідомляють про вибір

**Файли:** `app/(tabs)/index.tsx:1738,2018,2028,2041,2061,2071,2607`; `app/meetings.tsx:999,1010,1110,1169`;
`app/(tabs)/explore.tsx:1070,1074`; `app/(tabs)/time.tsx:832`; `app/account.tsx:263,339,413`;
`app/workspace.tsx:279,292`; `app/welcome.tsx:53,61`; `app/budget.tsx:527`; `app/bugs.tsx:373`;
`app/ideas.tsx:412`; `app/finance-stats.tsx:818`; `components/tasks/TaskEditForm.tsx:131`;
`components/health/HealthEntryModal.tsx:233`

```tsx
// app/meetings.tsx:1110 — перемикач періоду, поводиться як вкладки
<TouchableOpacity key={key} onPress={() => setSpan(key)}
  style={{ ..., backgroundColor: span === key ? ACCENT : 'transparent' }}>
  <Text style={{ ..., color: span === key ? '#fff' : c.sub }}>{SPAN_LABELS[key]}</Text>
</TouchableOpacity>
// app/(tabs)/index.tsx:2607 — чекбокс виконання завдання
<TouchableOpacity onPress={e => { e.stopPropagation(); toggleTask(task.id); }}
  style={{ width: 22, height: 22, ... }}>
```

**Що бачить користувач.** Вибраний стан передається виключно кольором тла й тексту: VoiceOver читає
три однакові елементи «День», «Тиждень», «Місяць», а дальтонік не відрізняє їх узагалі. Чекбокс завдання
не має ні імені, ні ролі, ні стану — порожній елемент 22×22, який щось перемикає.

**Правка.** Сегментованим — `role="tab"` + `"tablist"` на контейнері + `state={{selected}}`; чипам —
`"checkbox"`/`"radio"` за зразком `PriorityFilterChips`; чекбоксу завдання — перевести на готовий
`components/shared/AnimatedCheck.tsx`; решті ~325 текстових кнопок — `accessibilityRole="button"`.

**Статус:** CONFIRMED, числа відтворено точно власним скануванням: 773 `TouchableOpacity`/`Pressable`,
547 без ролі. Контрприклади всередині проєкту справжні: `PriorityFilterChips.tsx:49-51` має
`role="checkbox"` + `state={{checked}}` + label, `PriorityPicker.tsx:38-40` — `role="radio"`.
RN не ставить `accessibilityRole` за замовчуванням (лише `accessible={true}`).

---

### A11Y-05 — Шість із дев'яти акцентів не тримають 3:1 як тло під білою іконкою; акцентний текст у світлій темі — до 1.94:1

**Файли:** `utils/healthTheme.ts:3-13`; `constants/tokens.ts:79,101,122`; `app/containers.tsx:48`;
`app/budget.tsx:54`; `app/health-nutrition.tsx:51,194`; `app/health-sleep.tsx:52,116`;
`app/health-vitals.tsx:56`; `app/health-body.tsx:77`; `app/health-vaccines.tsx:86`;
`app/health-checkups.tsx:88`; `app/meetings.tsx:1170,1405` (56 `color: c.accent` + 60 `color: ACCENT`)

```tsx
// app/health-nutrition.tsx:51 — біла іконка на акценті як тлі
<TouchableOpacity ... style={[s.addBtn, { backgroundColor: ACCENT_CAL }]}>
  <IconSymbol name="plus" size={18} color="#fff" />
</TouchableOpacity>
// біле на акценті: #F59E0B 2.15 · #06B6D4 2.43 · #14B8A6 2.49 · #10B981 2.54 · #0EA5E9 2.77 · #F97316 2.80 (норма 3:1)
// акцент як текст на світлому тлі: #F59E0B 1.94 · #14B8A6 2.25 · #10B981 2.29 · #0EA5E9 2.51 (норма 4.5:1)
```

**Що бачить користувач.** Біла «+» на помаранчевій кнопці в «Харчуванні» та зеленій у «Воді» зливається
з кнопкою при яскравому світлі — а це основна дія екрана. Акцентний текст `#F59E0B` (1.94:1) практично
невидимий. У темній темі виміряно на живому рендері 3.66:1 для «Зареєструватись» (16px) і «Змінити
workspace» кольором `rgb(124,58,237)` — головні CTA екрана привітання не проходять AA.

**Правка.** Розділити ролі кольору: акценти лишити для заливок і декору, а для тексту й гліфів завести
похідні `accentOn`/`accentOnDark` (у таб-барі `#A78BFA` уже зроблено окремим літералом). Де акцент —
тло кнопки, затемнити його до ≥3:1 проти білого (`#F59E0B → ~#B45309`, `#10B981 → ~#047857`). Додати
той самий тест контрасту, що й у A11Y-02, для пар accent/білий і accent/bg.

**Статус:** CONFIRMED. Перерахунок збігається до сотої; `#7C3AED` на `#0C0C14` = 3.42 (у знахідці
3.66 з живого рендера) — у будь-якому разі <4.5, бо 16px/700 не є large text за WCAG (large =
18.66px bold). Недбалість у цитуванні: з `HEALTH_ACCENTS` мовчки викинуто 4 ключі
(`weight #8B5CF6`, `sleep #6366F1`, `pulse #EF4444`, `prot #A855F7`) — висновку не змінює.
Половина про текст — безсумнівний провал AA; для білої іконки впевнено провалює лише `#F59E0B` (2.15),
`#0EA5E9`/`#F97316` недобирають ~7%.

---

### A11Y-06 — Неактивні вкладки таб-бара: 2.23:1 у світлій темі, 3.17:1 у темній, підпис 10px `[пристрій]`

**Файл:** `app/(tabs)/_layout.tsx:30,31,33`

```ts
tabBarActiveTintColor: isDark ? '#A78BFA' : '#7C3AED',
tabBarInactiveTintColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(80,60,120,0.45)',
tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: -2 },
```

**Що бачить користувач.** Головна навігація: підписи неактивних вкладок у світлій темі — 2.23:1 при
нормі 4.5:1, і при 10px, тобто найгірша комбінація. Іконки тим самим кольором не проходять і 3:1.
Людина з віковим зниженням зору або на сонці бачить лише активну вкладку й не розуміє, що поруч є ще
чотири розділи.

**Правка.** Підняти непрозорість неактивного тінту: світла до ~0.78, темна до ~0.62; підпис — до 11px.
Рахувати проти обох варіантів тла з рядків 44-56 (Android — суцільне, iOS — блюр), по гіршому.

**Статус:** CONFIRMED. Незалежний розрахунок: світла 2.22, темна 3.17, активні 5.10/7.10 — збіг.
Палітра захардкоджена окремо від `getScreenColors()`, тож фікс A11Y-02 її не зачепить. Виняток 1.4.3
для «inactive user interface component» не застосовний: невибрана вкладка інтерактивна.
Android-гілка з суцільним фоном провалює вже статично; пристрій потрібен лише для вимірювання
iOS-блюру поверх реального контенту. Запропоноване 0.75 дає 4.37 — треба ~0.78.

---

### A11Y-07 — Клітинки календаря: без імені, без ролі, без стану вибору; «є завдання» передано лише крапкою 4×4

**Файли:** `components/tasks/CalendarGrid.tsx:25,31,51-59,67-69`;
`components/tasks/TaskCalendarView.tsx:91,95,415,420`; `app/(tabs)/index.tsx:3186,3188`;
`app/(tabs)/explore.tsx:2048,2050`; `app/(tabs)/time.tsx:1023,1025`

```tsx
<TouchableOpacity key={di} onPress={() => onSelectDay(dayDate)} style={{ flex: 1, ... }}>
  <View style={[st.dayCell, isSel && { backgroundColor: c.accent }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.accent }]}>
    <Text style={{ color: isSel ? '#fff' : isToday ? c.accent : c.text, ... }}>{day}</Text>
  </View>
  {hasMark && !isSel && <View style={[st.daydot, { backgroundColor: c.accent }]} />}
</TouchableOpacity>
```

**Що бачить користувач.** VoiceOver читає клітинку як «15» — без місяця, року, дня тижня, без «вибрано»
і «сьогодні». Свайпом по 35 клітинках людина чує «1, 2, 3…» і не розуміє, де опинилась. Крапка
«є завдання» (4×4pt акцентом) для скрінрідера не існує, для дальтоніка зливається з тлом. Стрілки
місяця теж без імені — вийти з поточного місяця наосліп не можна.

**Правка.** Клітинці — `accessibilityLabel` з повною датою і станом, `role="button"`,
`state={{selected: isSel}}`; стрілкам — `tr.prevMonth`/`tr.nextMonth`; кольорові крапки-статуси
супроводити текстом скрізь, де вони єдиний носій змісту.

**Статус:** CONFIRMED. `CalendarGrid.tsx` прочитано цілком (80 рядків) — жодного accessibility-пропа у
всьому файлі. Шапка файлу сама каже «Використовується трьома календарями — фільтром за датою та вибором
дедлайну в обох формах», тож масштаб не перебільшено. Єдина неточність: згаданий
`components/shared/MeetingFormSheet.tsx:99,105` — це окремі кнопки, не `CalendarGrid`.

---

### L1 — Висота таб-бара зашита константою: на Android edge-to-edge під іконку з підписом лишається ~10dp `[пристрій]`

**Файли:** `constants/nav.ts:186`, `app/(tabs)/_layout.tsx:34-41`, `app/project/[id]/_layout.tsx:88-94`,
`app.json` (`android.edgeToEdgeEnabled`), `node_modules/@react-navigation/bottom-tabs/.../BottomTabBar.js:87-90, 250-252`

```js
export const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 88 : 68;
// tabBarStyle: { position:'absolute', ..., height: TAB_BAR_HEIGHT, paddingTop: 10 }

// BottomTabBar.js:87-90 — при заданій height інсет НЕ додається
const customHeight = flattenedStyle && 'height' in flattenedStyle ? flattenedStyle.height : undefined;
if (typeof customHeight === 'number') { return customHeight; }
// BottomTabBar.js:250-252 — але paddingBottom інсета додається все одно
{ height: tabBarHeight, paddingBottom: tabBarPosition === 'bottom' ? insets.bottom : 0,
```

**Що бачить користувач.** Панель має `height − paddingTop − insets.bottom` на іконку 26pt і підпис 10pt.
На Android із трикнопковою навігацією (~48dp) це `68−10−48 = 10dp`: іконки й підписи обох таб-барів
розчавлені й обрізані, та й ціль дотику стискається до тієї самої смуги. На iPhone SE
(`insets.bottom = 0`) панель 88pt замість системних ~49pt — 39pt порожнечі на найкоротшому екрані.

**Правка.** Не задавати `height` у `tabBarStyle` — `getTabBarHeight` поверне 49 + `insets.bottom`.
Якщо потрібен мінімум — `minHeight`, або рахувати `TAB_BAR_HEIGHT + insets.bottom` через
`useSafeAreaInsets()`; `useTabBarInset()` має брати те саме обчислене число, а не константу.

**Статус:** CONFIRMED (механізм перевірено по джерелу `@react-navigation/bottom-tabs@7.15.5`; наш
`tabBarStyle` застосовується останнім і `paddingBottom` не перекриває; `styles.bottomContent` —
`{flex:1, flexDirection:'row'}`). Не P0: панель не зникає, навігація лишається можливою. Частина про
iPhone SE — косметика.

---

### L3 — Кнопка поруч із полем вводу не спрацьовує з першого тапу: десять екранів без `keyboardShouldPersistTaps` `[пристрій]`

**Файли:** `app/project/[id]/tasks.tsx:401` (поле 410, кнопки 419/422, «Зберегти» дат 659),
`app/project/[id]/budget.tsx:151` (поле 156, «Зберегти» 165), `app/project/[id]/members.tsx:375`
(поле 551, «Надіслати запрошення» 561), `app/project/[id]/time.tsx:96` (поля 99/107, «+» 114),
`app/project/[id]/sprints.tsx:277`, `app/project/[id]/settings.tsx:261`,
`app/admin-workspace.tsx:273` (поле причини 328), `app/workouts.tsx:161,166,281`,
`components/tasks/TaskReminderRow.tsx:75`

```tsx
<ScrollView contentContainerStyle={[contentWidth, { paddingHorizontal: 20, paddingBottom: tabBarInset + 40 }]} showsVerticalScrollIndicator={false}>
  <TextInput value={amountDraft} onChangeText={setAmountDraft} keyboardType="decimal-pad" ... />
  <TouchableOpacity onPress={() => saveAmount(currency)} ...><Text>{tr.save}</Text></TouchableOpacity>
```

**Що бачить користувач.** Дефолтний `keyboardShouldPersistTaps='never'` означає, що перший тап лише
ховає клавіатуру. Набрав суму бюджету → «Зберегти» → нічого; назву задачі → «+» → нічого; пошту
учасника → «Надіслати запрошення» → нічого. Кнопка виглядає мертвою. У `workouts.tsx` і
`TaskReminderRow` те саме з горизонтальними чипами — вибір не застосовується з першого дотику.

**Правка.** Додати `keyboardShouldPersistTaps="handled"` до кожного перерахованого `ScrollView` — і до
кореневого вертикального, і до горизонтальних. Для `project/[id]/*` — одноразово в спільному каркасі,
якщо `ScrollView` переїде в `ProjectScreenShell`.

**Статус:** CONFIRMED статично, але видимий ефект потребує пристрою (позначку `needsDevice` слід читати
як true). У всьому `app/project/` проп є рівно в одному місці (`notes.tsx:171`) — це не «не помітив
захисту». `CLAUDE.md` називає цей шаблон відомим. Пом'якшення, яке не рятує: `budget.tsx:162`,
`tasks.tsx` і `sprints.tsx` мають `onSubmitEditing`, тож Enter працює — кнопка все одно глуха.
Тестом це не доводиться: `fireEvent.press` ігнорує `keyboardShouldPersistTaps`.

---

### L4 — Пікер основної валюти малює список без `ScrollView` під стелею висоти й `overflow:'hidden'`

**Файли:** `app/(tabs)/explore.tsx:1556-1597`, `app/(tabs)/explore.tsx:2031`

```tsx
<BlurView ... style={[s.sheet, { maxHeight: height * 0.88, ... }]}>
  ...
  {allCurrencies.map((curr, idx) => { ... <TouchableOpacity key={curr.code} onPress={...}> ... })}
// s.sheet: { borderRadius: 24, borderWidth: 1, padding: 20, overflow: 'hidden' }
```

**Що бачить користувач.** Рядок ≈59pt; на 375×667 під рядки лишається ~439pt, тобто сім. Валюти —
не фіксований список: `BUILTIN_CURRENCIES` має лише UAH і USD, решту користувач заводить сам. Щойно
валют більше семи, восьма й далі обрізаються `overflow:'hidden'` і не прокручуються — обрати їх
основною неможливо.

**Правка.** Загорнути мапу в `<ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">`
— рівно як у листах «Категорії» та «Фільтри» того самого файлу.

**Статус:** CONFIRMED, найсильніша в напрямі. Між заголовком і `</BlurView>` стоїть гола мапа; обгортка
(`s.sheetWrapper` + `sheetColumnStyle(isWide)`) нічого не прокручує. `addInlineCurrency`
(`explore.tsx:384-399`) додає користувацькі валюти в `customCurrencies`, які `allCurrencies` (203)
конкатенує — стелі немає. Сусідні листи (1606+) загорнуті в `ScrollView`, тобто це пропуск, а не задум.

---

### L5 — FAB на екрані «Здоров'я» стоїть на зашитій висоті й ховається під панеллю активних таймерів

**Файли:** `app/(tabs)/health.tsx:248` (при наявному `tabBarInset` на 42),
`components/time/ActiveTimersBar.tsx:100`, `constants/nav.ts:189-195`

```tsx
const tabBarInset = useTabBarInset();          // :42 — інсет порахований…
<View style={[s.fabContainer, { bottom: Platform.OS === 'ios' ? 108 : 88 }]} pointerEvents="box-none">  // :248 — …але не взятий
// ActiveTimersBar.tsx:100
bottom: TAB_BAR_HEIGHT, height: ACTIVE_TIMERS_BAR_HEIGHT,
```

**Що бачить користувач.** Поки йде хоч один таймер, `ActiveTimersBar` займає 88…140pt від низу, а FAB —
108…166pt. Нижні 32pt кнопки перекриті панеллю, яка в дереві `_layout.tsx` малюється поверх: тап у
нижню третину «додати» потрапляє в панель таймерів.

**Правка.** Замінити `bottom: Platform.OS === 'ios' ? 108 : 88` на `bottom: tabBarInset + 20`, як у
трьох інших вкладках. Значення вже лежить у змінній на рядку 42.

**Статус:** CONFIRMED. `constants/nav.ts:211-213` `tabBarInsetFor` додає `ACTIVE_TIMERS_BAR_HEIGHT`, і
`index.tsx:2436`, `explore.tsx:1161`, `time.tsx:520` рахують `bottom: tabBarInset + 20` — «Здоров'я»
єдиний відступник. Уточнення, яких у знахідці бракує: без активного таймера 108 = 88+20 збігається,
тобто дефект проявляється лише поки йде таймер, і навіть тоді верхні ~26pt кнопки клікабельні.
P1 на верхній межі.

---

### L7 — FAB Stack-екранів на Android стоїть під системною навігацією (edge-to-edge увімкнено) `[пристрій]`

**Файли:** `app/banks.tsx:82` і `:916`, `app/notes.tsx:397`, `app/meetings.tsx:1427`,
`app.json` (`android.edgeToEdgeEnabled: true`)

```ts
const FAB_BOTTOM = Platform.OS === 'ios' ? 48 : 28;
fab: { position: 'absolute', right: 20, bottom: Platform.OS === 'ios' ? 48 : 28, width: 52, height: 52, ... },
```

**Що бачить користувач.** FAB займає 28…80dp від низу вікна. Трикнопкова навігація — ~48dp: нижні 20dp
кнопки (38% площі) лежать за системною панеллю й дотиків не отримують. Жестова — кнопка налазить на
зону свайпу «додому», і жест іде системі.

**Правка.** Рахувати `bottom: Math.max(insets.bottom, 12) + 16` через `useSafeAreaInsets()` або завести
`useBottomInset()` поруч із `use-tab-bar-inset.ts`, щоб Stack-екрани мали єдине джерело.
`CLAUDE.md`, де записано «FAB у Stack-скрінах: bottom: ios 48 : 28», теж поправити — саме він тиражує
це число.

**Статус:** CONFIRMED. Перевірено те, що могло б спростувати: у `banks.tsx` `SafeAreaView` закривається
на 497, а FAB рендериться на 500 — він сиблінг поза нею, координати від низу вікна, компенсації немає.
Аналога `useTabBarInset()` для Stack-екранів у репозиторії немає. Кнопка не зникає повністю (верхні
~32dp з 52 лишаються).

---

### I18N-01 — 887 україномовних UI-рядків прошито в коді повз словник; 25 файлів не мають i18n узагалі

**Файли (найважливіші):** `app/data.tsx:29-53`, `app/workouts.tsx:69-85`, `app/apple-health.tsx:278`,
`app/(tabs)/agent.tsx:361`, `app/donate.tsx`, `components/shared/SyncDiagnosticsPanel.tsx`,
`components/shared/ErrorBoundary.tsx:32-42`, `components/health/HealthEntryModal.tsx:117-191`,
`app/finance-stats.tsx:43-79`, `app/meetings.tsx:1088-1408`, `app/bugs.tsx:353-365`,
`app/ideas.tsx:396-404`, `app/sync.tsx`, `app/budget.tsx:450-467`, `app/archive.tsx:213-239`,
`app/containers.tsx:520-828`, `app/notes.tsx`, `app/projects.tsx:718-943`,
`app/(tabs)/index.tsx:2978-3014`, `app/(tabs)/time.tsx:714-755`

```ts
app/data.tsx:29 — { key: 'tasks', label: 'Завдання', icon: 'checklist', color: '#7C3AED' }
app/workouts.tsx:78 — const MUSCLE_GROUPS = ['Груди', 'Спина', 'Плечі', ...];
components/shared/ErrorBoundary.tsx:32 — Щось пішло не так
app/(tabs)/index.tsx:2978 — {isRecording ? 'Запис...' : 'Аудіозапис'}
```

**Що бачить користувач.** Англомовний користувач бачить суцільну кирилицю на цілих екранах. Найгірший
випадок — `app/data.tsx`: це екран експорту, імпорту й видалення всіх даних, і він не прочитає, який
саме набір даних зараз зітре. `ErrorBoundary` — те саме: додаток впав, і пояснення подано мовою, якої
користувач не обрав.

**Правка.** Перенести рядки в `store/translations.ts` (обидві мови) і підключити `useI18n` там, де його
немає. Проти відростання — тест, який проганяє той самий скан (кирилиця в літералах і JSX-тексті поза
`translations.ts`) і падає, якщо кількість влучень зросла.

**Статус:** CONFIRMED. Незалежний скан дав 1118 влучень у 59 файлах, 26 із них без `useI18n` — той самий
порядок. `ErrorBoundary` досяжний (`app/_layout.tsx:423` обгортає все дерево), `agent.tsx` і
`donate.tsx` — теж (з `settings.tsx:495` і `:322`). **Дві поправки:**
(а) `components/shared/MeetingFormSheet.tsx` зі списку виключити — він повністю двомовний, просто
інлайново (`:63 WD_SHORT_EN`, `:65 MONTHS_EN`, `:93` вибір за `lang`, ~20 тернарників `isUk ? … : …`);
його 52 влучення роздули підрахунок.
(б) `HealthEntryModal.tsx`, `BodyEntrySheet.tsx`, `QuickAddSheet.tsx` приймають `tr` пропом, а не через
`useI18n`, тож критерій «не імпортує useI18n» до них не застосовний — їхні захардкоджені підписи
(`:116 'КІЛЬКІСТЬ (МЛ)'`, `:186 'КІЛЬКІСТЬ КРОКІВ'`) належать до відра «має i18n, обходить точково».

---

### I18N-02 — Одиниці виміру прошиті українською навіть на перекладених екранах: 83 місця у 25 файлах

**Файли:** `app/(tabs)/today.tsx:555-557`, `app/(tabs)/health.tsx:100,178-190,344-350`,
`app/(tabs)/index.tsx:1606-1607,2157-2158,2546-2547`, `app/health-nutrition.tsx:64-170`,
`app/health-profile.tsx:181-188`, `app/health-vitals.tsx:70-109`, `app/health-body.tsx:89-102`,
`app/health-summary.tsx:29-30`, `app/apple-health.tsx:56-57,431-435`, `app/workouts.tsx:575-691`,
`utils/healthTheme.ts:49-51`, `utils/preventionUtils.ts:123-124`

```ts
app/(tabs)/today.tsx:555 — value={`${calNet}кк`}          // поряд з label={tr.calories}
app/(tabs)/health.tsx:350 — valueStr: `${entry.value} уд/хв`   // поряд з typeLabel: tr.pulse
utils/healthTheme.ts:49 — if (h > 0 && m > 0) return `${h}г ${m}хв`;
```

**Що бачить користувач.** Рядок-гібрид «Calories 1840кк», «Pulse 72 уд/хв», «8.2т кр», «2г 30хв» — і саме
на екранах «Сьогодні» й «Здоров'я», які відкривають найчастіше.

**Правка.** Додати в `Translations` ключі одиниць (kcal, kg, ml, l, steps, bpm, km, thousandsShort)
поруч із наявними `unitHour`/`unitMinute`/`proteinShort` і провести всі 83 місця через них.
`utils/healthTheme.ts:49-51` — це четверта копія форматувача тривалості: замінити викликом
`formatDuration` з `utils/durationFormat.ts`.

**Статус:** CONFIRMED. Усі цитати дослівні й на вказаних рядках. Механізм існує і поруч навіть
застосований: `tr.proteinShort` є в обох мовах (`translations.ts:1929`/`:3165`) і вживається в тому
самому шаблонному рядку, де «кк» захардкоджено. Шапка `utils/durationFormat.ts` прямо каже «до цього
чотири копії цієї функції писали „год“ і „хв“ незалежно від мови», і `healthTheme.fmtSleep` — одна з
пропущених. Доведено тестом: `fmtSleep(150) === '2г 30хв'` безумовно, тоді як
`formatDuration(9000, {hour:'h',…}) === '2h 30min'`.

---

### I18N-03 — Дати, час і числа форматуються жорстко в `'uk-UA'` у 22 місцях; ще 7 копій «N хв тому» і 7 локальних масивів місяців

**Файли:** `app/data.tsx:104-107`, `app/notes.tsx:51-55`, `app/sync.tsx:498-509`, `app/archive.tsx:49-52`,
`app/meetings.tsx:164,692`, `app/bugs.tsx:124`, `app/ideas.tsx:153`, `app/notifications.tsx:232-235`,
`app/apple-health.tsx:219,411-412`, `app/workouts.tsx:920`, `app/budget.tsx:531`,
`app/finance-stats.tsx:77-79,565-567,942`, `components/today/SyncBadge.tsx:16-19`,
`app/(tabs)/health.tsx:349`, `app/project/[id]/members.tsx:538`, `app/meetings.tsx:127-129`,
`components/tasks/TaskEditForm.tsx:346`

```ts
app/finance-stats.tsx:77 — const MONTHS_UA = ['Січ','Лют','Бер', ...];
components/tasks/TaskEditForm.tsx:346 — {['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].map((d, i) => {
app/project/[id]/members.tsx:538 — {tr.inviteExpiresLabel} {new Date(invite.expires_at).toLocaleDateString()}
```

**Що бачить користувач.** Англійський інтерфейс показує українські дати: «12 лис», «Січень 2026»,
«5 хв тому», «Пн Вт Ср» — зокрема у виборі днів тижня повторюваного завдання. Окремо: два виклики
`toLocale*String()` **без аргументу** беруть мову пристрою, а не застосунку, тож українець з
англійським телефоном отримує третій варіант.

**Правка.** Один хелпер `dateLocale(lang)` для всіх 22 викликів; масиви замінити на
`tr.months`/`tr.monthsShort`/`tr.weekdays` (ключі вже є, `translations.ts:41-45`); сім копій відносного
часу звести в одну функцію в `utils/dateUtils.ts`, що приймає підписи зі словника.

**Статус:** CONFIRMED, підрахунки відтворено точно: grep дає рівно 22 виклики з `'uk-UA'` і рівно 2
без аргументу — і це саме `health.tsx:349` та `members.tsx:538`. Коментар у `app/invite.tsx:50`
(«toLocaleDateString() без аргументу ігнорує вибір мови») існує, і там фікс застосовано.
**Одна цитата спростована:** `components/shared/MeetingFormSheet.tsx:62-64` зі списку викреслити — у
файлі є `WD_SHORT_EN`/`MONTHS_EN` і вибір за `lang` (рядки 93-94, 281); процитовано лише українську
половину пари.

---

### I18N-04 — Стартові дані зберігаються українською назавжди: статуси задач, назви рахунків і скарбничок

**Файли:** `utils/taskStatuses.ts:56-61`, `store/migrations.ts:367,389`, `app/finance-stats.tsx:43-58`

```ts
utils/taskStatuses.ts:58 — { id: ACTIVE_COLUMN_ID, name: 'До роботи', color: '#6366F1', position: 0, isDone: false, system: true },
store/migrations.ts:367 — name: multi ? `Основний ${code}` : 'Основний',
store/migrations.ts:389 — name: typeof jar.name === 'string' && jar.name ? jar.name : 'Скарбничка',
```

**Що бачить користувач.** Це не підпис, а рядок, записаний у сховище і на сервер: англомовний
користувач отримує рахунок «Основний» і колонки «До роботи / У процесі …», які їдуть на всі його
пристрої. Для категорій фінансів це зроблено **правильно** (`DEFAULT_CATEGORIES_UK`/`_EN`), але
`app/finance-stats.tsx:43-58` тримає власну україномовну копію того самого списку і саме її вживає
(241, 306, 307) — тож у «Фінансах» категорії англійські, а в «Статистиці» українські.

**Правка.** `DEFAULT_TASK_STATUS_COLUMNS` і дефолтні назви в `migrations.ts` зробити мовозалежними і
сіяти за поточною мовою; у `finance-stats.tsx` прибрати локальну копію й імпортувати з
`utils/financeCategories.ts`.

**Статус:** CONFIRMED, але **одне твердження про наслідки завищене.** «Перемикання мови їх уже не
полагодить» не стосується особистих колонок: `DEFAULT_TASK_STATUS_COLUMNS` при першому запуску в
сховище не пишеться — `utils/taskStatuses.ts:111` домішує його на **читанні**. Незмінна й синхронізована
частина знахідки реальна іншим шляхом: `app/projects.tsx:492-494` і
`app/project/[id]/settings.tsx:130-132` викликають `seedProjectStatusColumns` і далі
`updateSynced('task_statuses', …)`, тобто створення проєкту жорстко копіює українські назви в
збережені рядки; `migrateAccounts` пише «Основний»/«Скарбничка» у сховище напряму.

---

### I18N-05 — Локальні нагадування про завдання, підзавдання й зустрічі завжди українською `[пристрій]`

**Файл:** `store/notifications.ts:60,117,321`

```ts
:117 — title: meta.type === 'task' ? '📋 Завдання' : '✅ Підзавдання',
:321 — title: '📅 Зустріч через 15 хв',
:60  — name: 'Нагадування',   // ім'я Android-каналу 'flowi-reminders'
```

**Що бачить користувач.** Нагадування — це те, що видно на заблокованому екрані. Англомовний отримує
«📅 Зустріч через 15 хв». Ім'я Android-каналу осідає в системних налаштуваннях телефону і після
створення не змінюється навіть при оновленні застосунку.

**Правка.** Провести `scheduleTaskReminder` і нагадування про зустріч через той самий параметр `tr`,
що вже вживає `rescheduleSubscriptionRemindersFromStorage` (`:499`). Канал — локалізувати на момент
створення або дати нейтральний ідентифікатор і перестворювати при зміні мови.

**Статус:** CONFIRMED. Жодна з двох функцій не приймає `tr`/`lang`, тож перекладу рівнем вище немає.
Патерн поруч існує і виглядає саме так, як описано (`:499` має сигнатуру з
`tr: Pick<Translations, 'subNotifBeforeTitle' | … >` і мапить усі тексти на `:514-522`).

---

### I18N-06 — `accessibilityLabel` українською в англійському інтерфейсі — підтверджено в живому браузері

**Файли:** `app/login.tsx:199`, `app/register.tsx:287,318`, `components/shared/SheetModal.tsx:257`,
`components/shared/ErrorBoundary.tsx:40`, `components/today/SyncBadge.tsx:63`

```tsx
app/login.tsx:199 — accessibilityLabel={showPassword ? 'Сховати пароль' : 'Показати пароль'}
components/shared/SheetModal.tsx:257 — accessibilityLabel="Закрити"
components/today/SyncBadge.tsx:63 — accessibilityLabel="Синхронізація…"
```

**Що бачить користувач.** `e2e-audit/i18n-en.spec.ts` з мовою `en` відкриває `/login` і `/register`:
увесь видимий текст англійський («Sign In | EMAIL | PASSWORD | Forgot password?»), а в DOM висить
`[aria-label]="Показати пароль"`. `SheetModal` — спільна модалка, тож кожна шторка застосунку
оголошується «Закрити». Формально це порушення WCAG 2.1 SC 3.1.2 (Language of Parts).

**Правка.** Замінити всі шість на ключі словника (`tr.close` уже є в обох мовах:
`translations.ts:1438`/`:2677`) і додати до jest-набору перевірку, що жоден `accessibilityLabel` у
`app/` і `components/` не містить кирилиці.

**Статус:** CONFIRMED. Найгостріша самосуперечність — `SyncBadge`: той самий компонент вживає
`accessibilityLabel={tr.offlineBadge}` на `:47` і кириличний літерал на `:63`.

---

### I18N-07 — Медичний звіт для лікаря формується тільки українською, хоча дати в ньому локалізовані

**Файли:** `utils/preventionUtils.ts:113-139`, `app/health-prevention.tsx:59`

```ts
:121 — L.push('🩺 ЗВЕДЕННЯ ЗДОРОВ'Я');
:123 — if (latestWeight) L.push(`Вага: ${latestWeight} кг${bmi ? ` · ІМТ ${bmi.toFixed(1)}` : ''}`);
:128 — activeMeds.forEach(m => L.push(`• ${m.name}… — ${m.times.join(', ')} · дотримання ${medAdherence(m)}%`));
```

**Що бачить користувач.** `buildHealthReport` — це не підпис на екрані, а текст, який копіюють або
надсилають лікарю через `Share.share`. Функція вже приймає `locale` і сумлінно ним форматує дати
(118, 138), але всі заголовки, підписи й одиниці зашиті українською. Англомовний отримує документ,
який сам не прочитає — кнопка працює, а функція для нього недосяжна.

**Правка.** Додати другим параметром зріз `Translations` (як у `store/notifications.ts:500`) і передати
його з `app/health-prevention.tsx:59`.

**Статус:** CONFIRMED і доведено тестом: виклик `buildHealthReport` з `locale: 'en-US'` повертає текст,
що містить «ЗВЕДЕННЯ ЗДОРОВ», «Вага: 71 кг», «Пульс: 72 уд/хв» і «Сформовано у Flowi».

---

### PERF-2 — React Compiler увімкнено, але три головні екрани табів випали з-під нього через `eslint-disable`

**Файли:** `app/(tabs)/index.tsx:481,494,562,1840`, `app/(tabs)/explore.tsx:284`,
`app/(tabs)/today.tsx:278,314,326`, `components/tasks/TaskCompactCard.tsx:80`,
`components/shared/SheetModal.tsx:157`, `components/shared/PressableScale.tsx:62,71`,
`components/health/RingCell.tsx:56,78`, `app/subscriptions.tsx:448`, `app/task-group.tsx:158`,
`store/project-sync.ts:1138`, `app.json:63-66`

```jsonc
// app.json:63
"experiments": { "typedRoutes": true, "reactCompiler": true }
```
```ts
// app/(tabs)/index.tsx:562 — один такий рядок гасить компілятор для ВСЬОГО TasksScreen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);
// діагностика: index.tsx fn@212, explore.tsx fn@123, today.tsx fn@115, TaskCompactCard fn@63 —
// "React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled"
```

**Що бачить користувач.** Код написаний із розрахунку, що компілятор домемоізує те, що не обгорнуто
руками (`useMotion()`, `fmtCur`/`getCatIcon`/`listHeader` в `explore.tsx`). Цього не відбувається саме
там, де найдорожче: кожне натискання клавіші в пошуку задач чи в полі суми операції прокочує повний
рендер екрана на 2000–3200 рядків без мемоізації.

**Правка.** Замінити `eslint-disable` на те, що компілятор розуміє (`useRef` для значення поза deps,
розбиття ефекту, `useEffectEvent`). Де неможливо — винести проблемний ефект в окремий маленький
компонент, щоб бейлаут падав на нього. У CI — прогін компілятора з логером і фейл на нових бейлаутах у
списку гарячих файлів.

**Статус:** CONFIRMED, прогін відтворено незалежно. Бейлаути точно на названих функціях; позитивний
контроль збігається (`components/finance/TransactionGroup.tsx` fn@43 — CompileSuccess). Повний скан 243
файлів дав рівно 105 бейлаутів у 51 файлі — цифра збігається до одиниці. Єдина поправка на користь
знахідки: від `eslint-disable` не ~17, а 24 бейлаути (далі 33 — try/finally, 18 — refs during render).

---

### PERF-3 — `useMotion()` віддає новий об'єкт щорендера і не компілюється: ламає `React.memo` на кожній картці задачі `[пристрій]`

**Файли:** `hooks/use-motion.ts:32-34`, `app/(tabs)/index.tsx:1890-1908`, `:3046`,
`app/(tabs)/today.tsx:123,425-634`, `components/today/TodayTaskRow.tsx:119,133`

```ts
export function useMotion() {
  const reduced = useReducedMotion();
  _reducedMotionCached = reduced;   // CompileError: Cannot reassign variables declared outside of the component/hook
  return { reduced, dur(d: number): number { ... },   // новий об'єкт на КОЖЕН рендер
// index.tsx:1890
  const renderTaskItem = useCallback(({ item, index }) => (<TaskListItem ... motion={motion} ... />), [shouldAnimateTask, motion, ...]);
// index.tsx:3046
const TaskListItem = React.memo(function TaskListItem({ ... motion, ... })
```

**Що бачить користувач.** Коментар над `renderTaskItem` прямо каже: «Стабільні колбеки замість
інлайнових стрілок: SectionList інакше перемальовує кожен рядок на кожен рендер екрана». Саме це й
відбувається — `motion` міняє ідентичність щорендера, `renderTaskItem` перестворюється, shallow-порівняння
`React.memo` провалюється. Підгальмовування при наборі в пошуку і при кожному дотику до фільтрів:
перемальовуються всі видимі картки з `BlurView`.

**Правка.** Обгорнути повернене значення `useMotion` у `useMemo(() => ({...}), [reduced])`, а
присвоєння `_reducedMotionCached` перенести в `useEffect`.

**Статус:** CONFIRMED. Компілятор бейлаутить саме на fn@32 з «Cannot reassign variables declared outside
of the component/hook». `TaskListItem` сам компілюється (fn@3046 — CompileSuccess), але внутрішня
мемоізація компілятора теж ключується пропсами, тож нестабільний `motion` провалює і її. Магнітуда
відчуття — за нативним прогоном.

---

### PERF-4 — Екран фінансів передає в кожну групу транзакцій дві нові функції щорендера `[пристрій]`

**Файли:** `app/(tabs)/explore.tsx:136`, `:401-404`, `:847`, `:1134-1156`,
`components/finance/TransactionGroup.tsx:43-46`

```tsx
  const fmtCur = (n: number, cur: Currency) => formatCurrency(n, cur, locale);            // :136
  const getCatIcon = (catName: string, type: CatType): IconSymbolName => ...              // :401
          renderItem={({ item, index }) => (<TransactionGroup ... fmt={fmtCur} getCatIcon={getCatIcon} />)}  // :1134
```

**Що бачить користувач.** `TransactionGroup` компілятором оптимізований (`const $ = _c(87)`) і повернув
би закешований елемент — але тільки при стабільних пропсах. Форми додавання/редагування операції живуть
у тому самому компоненті (`amount`, `note`, `newCatName` — useState на 149, 151, 173), тож людина вводить
суму, а під модалкою перемальовується вся стрічка місяця. `listHeader` (847) з тієї ж причини
перебудовується щорендера, попри коментар «щоб FlatList не перебудовував її на кожному кадрі прокрутки».

**Правка.** `fmtCur` і `getCatIcon` — у `useCallback` (deps `[locale]` і `[cats]`), `listHeader` — у
`useMemo`, `renderItem` — у `useCallback`. Це працює незалежно від розблокування компілятора (PERF-2).

**Статус:** CONFIRMED, з підсиленням: `TransactionGroup` не обгорнутий у `React.memo` (grep — нуль
збігів), тож єдиний бар'єр — саме внутрішня мемоізація компілятора, яку нестабільні пропси зносять.

---

### PERF-7 — Група «У процесі» на екрані «Сьогодні» не обрізається взагалі й малюється через `.map()` у звичайному `ScrollView` `[пристрій]`

**Файли:** `utils/todayGroups.ts:94-100`, `app/(tabs)/today.tsx:448-466,688-705`,
`components/today/TodayTaskRow.tsx:133-148`, `:72`, `app/archive.tsx:335-337`

```ts
    const inProgress = resolvedStatusType(column) === 'in_progress';
    const all = (buckets.get(column.id) ?? []).sort(byPriority);
    const take = inProgress ? all.length : Math.max(0, budget);
```
```tsx
// app/archive.tsx:335 — той самий сценарій там уже визнали проблемою і полагодили
        {/* Архів росте без стелі — список віртуалізований, інакше
            кількасот BlurView-карток монтуються всі одразу. */}
        <FlatList
```

**Що бачить користувач.** Кожен `TodayTaskItem` — це `BlurView` плюс власний `useSharedValue` +
`useAnimatedStyle` + `useState`/`useEffect`. Хто тримає багато задач «У процесі» (природний спосіб
користування канбаном), отримує на головному екрані сотні одночасно змонтованих `BlurView` зі
стартовими анімаціями: вхід на першу вкладку підвисає, прокрутка рве кадри. Для решти груп межа є
(`TODAY_PREVIEW_LIMIT = 3`), для цієї — ні.

**Правка.** Дати «У процесі» власний, більший, але скінченний ліміт (10–15) із рядком «показати всі»,
що веде на `/task-group` — механізм уже є (`today.tsx:468 todayGroups.hidden`).

**Статус:** CONFIRMED. JSDoc на `:48-50` підтверджує, що це навмисно («Сама вона не обрізається ніколи»).
Ключове: `utils/taskToday.ts:63` пускає в «Сьогодні» будь-яку задачу `in_progress` незалежно від
дедлайну, тож стелі немає ні знизу, ні зверху. Бонус, не названий у знахідці: у тому самому `map` на
`:143` — `projects?.find(...)` на кожну задачу, тобто O(n×m).

---

### DI-02 — «Залишити моє» на конфлікті «видалив тут — правили там» мовчки не робить нічого

**Файли:** `app/sync.tsx:120-127`, `store/sync-engine.tsx:608-610`, `:1087-1091`

```ts
if (choice === 'local') {
  // Залишити моє: force-push на сервер
  const [collection, local_id] = id.split(':');
  if (collection && local_id) { await markDirty(collection, local_id, false, true /* force */);
// store/sync-engine.tsx:608-610 — мутація тихо викидається
const item = cache.get(collection)?.get(normalizedLocalId);
if (!item) return null;
```

**Що бачить користувач.** Конфлікт зникає зі списку «вирішеним», а запис лишається видаленим тільки на
цьому пристрої й живим на сервері та всіх інших. Картка конфлікту при цьому не дає зрозуміти, що
відбувається: панель «МІЙ ПРИСТРІЙ» порожня, назва падає у фолбек `#abc123`.

**Правка.** Передавати справжній намір: `markDirty(collection, localId, localDeleted, true)` — прапорець
є в `conflict.client.deleted` на момент `appendConflicts` (`sync-engine.tsx:1160-1168`). Плюс показувати
в картці «Видалено на цьому пристрої» замість порожньої панелі.

**Статус:** CONFIRMED. `sync-engine.tsx:464` `if (options.localDeleted || options.serverMissing) return 'manual'`
— конфлікт потрапляє до користувача саме при локальному видаленні; `buildMutation` повертає `null`,
цикл 1082-1086 кладе id у `staleMutationIds` → `removeMutationsFromOutbox` без сліду в UI.
Додатковий доказ: **автоматична** гілка поруч робить правильно (`:1139`
`markDirty(conflict.collection, conflict.local_id, conflict.client.deleted, true)`) — намір втрачає саме
ручна.

---

### DI-03 — Вирішення конфлікту для записів із похідним id розрізає id по першому `':'`

**Файли:** `app/sync.tsx:122`, `store/sync-engine.tsx:210-211`, `utils/recordIds.ts:31-33`,
`utils/activeTimers.ts:59-61`

```ts
const [collection, local_id] = id.split(':');                       // app/sync.tsx:122
export const syncRecordKey = (collection, localId) => `${collection}:${localId}`;   // sync-engine.tsx:210
export function categoryRowId(type: string, name: string) { return `${type}:${name}`; }  // recordIds.ts:31
```

**Що бачить користувач.** Для `categories` (`expense:Кафе`) і `active_timers` (`task:<taskId>`) id
конфлікту виглядає як `categories:expense:Кафе`, і деструктуризація дає `local_id='expense'`. У чергу
потрапляє неіснуючий запис, справжній конфліктний рядок не позначається брудним, а конфлікт беззастережно
зникає зі списку: користувач бачить «вирішено», на сервері лишається чужа версія, і на наступному pull
вона мовчки перезаписує локальну.

**Правка.** Не парсити id: `SyncConflict` уже несе `dataKey` і `local.id`. Або різати по **першій**
двокрапці (`indexOf(':')` + `slice`).

**Статус:** CONFIRMED, доведено тестом (`local_id === 'expense'` замість `'expense:Кафе'`). Обидві
колекції синхронізовані (`sync-contract.ts:43,50`). Гілка `'remote'` вади не має — вона працює з
`conflict.dataKey`. Досяжність вужча, ніж заявлено: ручний конфлікт для цих колекцій виникає лише коли
`localDeleted` або обидві мітки часу відсутні (`sync-engine.tsx:459-469`).

---

### DI-04 — Календар завдань шукає зустрічі за UTC-датою, а мапа побудована за локальною

**Файли:** `app/(tabs)/index.tsx:2514,2535,2573,2586`, `components/tasks/TaskCalendarView.tsx:277`

```ts
// app/(tabs)/index.tsx:1418-1424 — ключ мапи це m.date, тобто ЛОКАЛЬНИЙ YYYY-MM-DD
const meetingsByDate = useMemo(() => { ... meetings.forEach(m => { if (!map[m.date]) map[m.date] = []; ...
// components/tasks/TaskCalendarView.tsx:275-277 — а читають його за UTC
const d = new Date(yr, mo, day);
const dayTasks = tasksByDate[d.toDateString()] ?? [];
const dayMeets = meetingsByDate[d.toISOString().slice(0, 10)] ?? [];
// app/(tabs)/index.tsx:2573 — і те саме на запис
onPress={() => { setCalPopupDate(null); openAddMeeting(calPopupDate.toISOString().slice(0, 10)); }}
```

**Що бачить користувач.** У Києві локальна північ у `toISOString()` дає попередню добу: крапка «є
зустріч» стоїть на дні раніше, попап на правильному числі показує «нічого не заплановано», лічильник у
заголовку бреше. Гірше — запис: зустріч, створена через календар завдань, зберігається вчорашнім числом.

**Правка.** Замінити всі п'ять `X.toISOString().slice(0, 10)` на `localDateKey(X)` з `@/utils/dateUtils`
(помічник існує, `dateUtils.ts:19-21`, із коментарем саме про цю пастку). Додати юніт-тест із
`TZ=Europe/Kyiv`.

**Статус:** CONFIRMED, доведено тестом: для 2026-09-20 на схід від UTC `toISOString()` дає '2026-09-19'.
`m.date` формується локально (`utils/meetings.ts:185-187` через `getFullYear/getMonth/getDate`), а
сусідній рядок `tasksByDate[d.toDateString()]` зроблено правильно — тож дефект саме в цих п'яти місцях,
а не в задумі. Не P0: зустріч не втрачається, її видно на екрані зустрічей.

---

### DI-05 — Нагадування ліків і звичок не переживають синхронізацію `[пристрій]`

**Файли:** `app/health-meds.tsx:48,61`, `app/health-habits.tsx:53,69`,
`store/synced-storage.ts:453-457`, `store/notifications.ts:499`

```ts
// app/health-meds.tsx:61 — єдине місце, де нагадування скасовується
const remove = async (m: Medication) => { await cancelMedReminders(m.notifIds); setMeds(p => p.filter(x => x.id !== m.id)); };
// store/synced-storage.ts:453-457 — pull просто прибирає рядок, без побічних дій
if (si.deleted) { map.delete(si.local_id); } else { map.set(si.local_id, { id: si.local_id, ...(si.data ?? {}) } as T); }
```

**Що бачить користувач.** (а) Ліки, заведені на планшеті, приїжджають на телефон рядком у сховищі, але
жодне нагадування там не планується — сигналу прийняти ліки не буде, хоч картка показує «08:00».
(б) Ліки, видалені на планшеті, зникають з масиву телефона, але щоденне нагадування `med_<id>_<i>`
лишається в ОС і дзвонить далі — скасувати його вже нічим, бо `notifIds` стерто.

**Правка.** Додати звірку за зразком `rescheduleSubscriptionRemindersFromStorage`: на старті й на сигнал
`subscribeToStorage('health_meds'/'health_habits')` порівнювати `getAllScheduledNotifications()` зі
сховищем. Ідентифікатори детерміновані (`med_${medId}_${i}`, `habit_${id}`), тож звірка працює на
будь-якому пристрої. Заодно прибрати `notifIds` із синхронізованого запису — воно локальне.

**Статус:** CONFIRMED статично. Grep по всьому дереву: `scheduleMedReminders`/`cancelMedReminders`
викликаються лише в `app/health-meds.tsx:48,61,65,68`, `scheduleDailyReminder`/`cancelDailyReminder`
для звичок — лише в `app/health-habits.tsx:53,69`. Звірка зі сховищем існує тільки для підписок
(`notifications.ts:499`, викликається з `_layout.tsx:180` і `subscriptions.tsx:353`). Обидві колекції
синхронізовані (`sync-contract.ts:32,35`). На пристрої треба підтвердити лише «нагадування далі дзвонить».

---

## P2

### ERR-11 — Google Calendar: кнопка синку в офлайні мовчить, а збій оновлення токена видається за «потрібна авторизація»

**Файли:** `app/meetings.tsx:630`, `:598-625`, `:631-634`

```ts
  const importFromGoogleCalendar = useCallback(async (token?: string) => {
    if (!isOnlineMode()) return;
    const accessToken = token ?? await getValidGcalToken();
    if (!accessToken) { Alert.alert('Потрібна авторизація', 'Підключіть Google Calendar.'); return; }
// getValidGcalToken: } catch { return null; }
```

**Що бачить користувач.** Німий вихід в офлайні (ні спінера, ні тексту). Будь-яка похибка при оновленні
токена Google стає «Потрібна авторизація · Підключіть Google Calendar», хоча календар підключено.

**Правка.** В офлайні показувати «синхронізація недоступна офлайн» замість `return`; розрізняти в
`getValidGcalToken` «немає refresh-токена» і «запит не вдався».

**Статус:** CONFIRMED за кодом, **шлях описано хибно** і тому знижено до P2: кнопка в шапці
(`meetings.tsx:1094`) робить `setShowGcalSheet(true)`, а не `importFromGoogleCalendar` — німий return
настає лише з кнопки всередині sheet (`:1340`). Плюс уся інтеграція опційна й вимкнена, доки людина
вручну не введе Google Client ID (`:395-397, 542, 1243`), тож охоплення мізерне.

---

### ERR-15 — Порожній стан показано, поки дані ще читаються зі сховища

**Файли:** `app/(tabs)/index.tsx:1933-1940,2250-2258`, `app/notes.tsx:118-119,289-293`,
`app/containers.tsx:284-315`, `app/health-meds.tsx:41`, `app/ideas.tsx:213-256`, `app/subscriptions.tsx:143`

```tsx
            {!initialized && (<><SkeletonRow /><SkeletonRow /><SkeletonRow /></>)}
...
            {!todayEmpty && filtered.length === 0 && ( ... {search.trim() ? tr.nothingFound : ... : tr.noTasks}
```

**Що бачить користувач.** На головному екрані порожній стан не завішено на `initialized`, тож при
кожному холодному старті поряд зі скелетонами блимає «Немає завдань · Натисніть + щоб додати».
На `notes`/`ideas`/`containers`/`health-*` скелетонів немає взагалі: перший кадр — повноцінний порожній
стан із закликом «додайте першу річ».

**Правка.** Завісити порожній стан на той самий `initialized`, що й скелетони; на екранах без скелетонів
показувати нейтральний плейсхолдер до завершення читання.

**Статус:** CONFIRMED. `index.tsx:1117` `todayEmpty` на першому кадрі дає `false` (обидва лічильники 0),
тож умова `:2251` істинна і блок «Немає завдань» рендериться в тому ж listHeader, що й скелетони.
Читання локального ключа триває мілісекунди, даних це не чіпає.

---

### A11Y-08 — Цілі дотику 22–36pt без `hitSlop` при нормі Apple 44×44 `[пристрій]`

**Файли:** `app/(tabs)/index.tsx:2135` (30×30), `:2607` (22×22), `:3015,3019` (28×28);
`components/tasks/TaskEditForm.tsx:329,334` (28×28); `components/shared/MeetingFormSheet.tsx:99,105` (32×32),
`:506,511` (28×28); `app/meetings.tsx:1121,1126` (32×32); `app/containers.tsx:625,630,771` (36×36);
`app/health-habits.tsx:134` (34×34); `app/workouts.tsx:341` (44×26); `components/tasks/CalendarGrid.tsx:67,68`

```tsx
// TaskEditForm.tsx:329 — степер інтервалу повторення, кнопки 28×28
<TouchableOpacity onPress={() => editor.patch({ repeatInterval: Math.max(1, editor.draft.repeatInterval - 1) })}
  style={{ width: 28, height: 28, ... }}>
// index.tsx:2607 — чекбокс виконання завдання, 22×22, без hitSlop
style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, ... flexShrink: 0 }}
```

**Що бачить користувач.** Найгірше — чекбокс 22×22 всередині батьківського `TouchableOpacity`, що
відкриває завдання (`index.tsx:2600-2610`, батько `onPress={() => setSelected(task)}`): промах дає
дію-протилежність. Степери 28×28 змінюють «кожні N днів» кнопкою вдвічі меншою за палець.

**Правка.** Додати `hitSlop` усім кнопкам, меншим за 44pt, за зразком `HEADER_BUTTON_HIT_SLOP`
(`ScreenHeader.tsx:44`); де кнопки стоять упритул, спершу розсунути їх на ≥8pt. Чекбокс — довести до
44×44 через `hitSlop`.

**Статус:** CONFIRMED за фактами, **ЗНИЖЕНО з P1 до P2: нормативна база знахідки хибна.**
WCAG 2.2 AA 2.5.8 вимагає 24×24 CSS px, а не 44 (44×44 — це 2.5.5, рівень AAA). З усього переліку під
24pt падає рівно один елемент — чекбокс 22×22; решта (28/30/32/34/36) проходить 2.5.8, а степери 28×28
із `gap: 8` проходять і винятком по інтервалу. Отже це недобір до Apple HIG, тобто зручність, а не
недосяжність.

---

### A11Y-09 — Вісім `accessibilityLabel` захардкожено українською в обхід i18n

**Файли:** `components/shared/SheetModal.tsx:257`, `components/shared/ErrorBoundary.tsx:40`,
`components/shared/SyncDiagnosticsPanel.tsx:104`, `components/today/SyncBadge.tsx:63`,
`app/sync.tsx:370`, `app/login.tsx:199`, `app/register.tsx:287,318`

```tsx
<TouchableOpacity onPress={triggerClose} hitSlop={{...}} accessibilityLabel="Закрити" accessibilityRole="button">
```

**Що бачить користувач.** Англомовний чує український текст англійським синтезатором. `SheetModal` —
спільний компонент, тож «Закрити» звучить так на кожній формі; `ErrorBoundary` — екран після падіння,
де єдина дія стає неозвученою.

**Правка.** Замінити на `tr.*` і додати до i18n-тесту перевірку на кирилицю в `accessibilityLabel`.

**Статус:** CONFIRMED, список вичерпний — інших кириличних літералів у `accessibilityLabel` по `app/` і
`components/` немає, рівно 8. Підсилення: у `SyncBadge` інші п'ять labels (48, 78, 93, 110, 125) уже
йдуть через `tr.*` — літерал на `:63` є одиничною дірою в межах одного файлу. Дублює I18N-06 з боку
доступності.

---

### A11Y-10 — `Skeleton` пульсує нескінченно попри Reduce Motion `[пристрій]`

**Файл:** `components/shared/Skeleton.tsx:17-28`

```ts
const opacity = useRef(new Animated.Value(0.5)).current;
useEffect(() => {
  const anim = Animated.loop(Animated.sequence([
    Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
    Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
  ]));
  anim.start(); return () => anim.stop();
}, [opacity]);
```

**Що бачить користувач.** Безперервна пульсація 0.5↔1 кожні 800 мс весь час завантаження будь-якого
списку — саме те, заради чого вмикають Reduce Motion. У проєкті є системне рішення
(`hooks/use-motion.ts` поверх `useReducedMotion()`), і сім компонентів ним користуються; `Skeleton` — ні.

**Правка.** Додати `useMotion()` і при `reduced` лишити статичну напівпрозорість без циклу.

**Статус:** **UNCERTAIN у поданому обсязі — прийнято лише ядро.** Підтверджено: у `Skeleton.tsx` немає
жодного імпорту `useMotion`/`useReducedMotion`, цикл на місці. **Спростовано головне підкріплення:**
`components/shared/SheetModal.tsx` Reduce Motion **враховує** — `:72 const reduced = useReducedMotion() ?? false;`,
`:110` і `:149` — ранні гілки, а процитовані рядки 117/118 і 153/154 стоять у `else` після цієї перевірки.
Далі: `hello-wave.tsx` і `parallax-scroll-view.tsx` ніде не імпортуються — мертвий код шаблону Expo;
`UndoToast`/`TaskCompactCard` — це 200/250 мс opacity-фейди, які Apple саме рекомендує як заміну руху.
Нормативні посилання теж хибні: 2.3.3 — рівень AAA; 2.2.2 вимагає контенту «in parallel with other
content», чим скелетон не є. Реальний дефект — один файл.

---

### A11Y-11 — Три `accessibilityRole="header"` на весь застосунок: ротор заголовків VoiceOver порожній

**Файли:** `app/task-group.tsx:234`, `components/tasks/TaskDetailHeader.tsx:78`,
`components/meetings/MeetingDetail.tsx:93` (єдині три); відсутні — `app/containers.tsx:629`,
`app/meetings.tsx:1091`, `components/shared/ScreenHeader.tsx`

```tsx
<Text style={{ fontSize: 32, fontWeight: '800', ..., color: c.text, flex: 1 }}>{tr.containers}</Text>
<Text style={{ color: c.text, fontSize: 22, fontWeight: '800', ... }}>Зустрічі</Text>
```

**Що бачить користувач.** Ротор «Заголовки», яким перестрибують розділи, майже порожній: на екранах із
довгими списками дістатися потрібного блоку можна лише послідовним свайпом через десятки карток.

**Правка.** Додати `accessibilityRole="header"` у `components/shared/ScreenHeader.tsx` (закриває
таб-екрани), у заголовки Stack-екранів і в `components/health/SectionHeader`. Заголовок «Зустрічі» заодно
перевести на `tr.*`.

**Статус:** CONFIRMED. Вичерпний grep дає рівно три збіги, і саме ті. Дрібні неточності: заголовок у
`containers.tsx` стоїть на рядку 629 (не 631); файлів екранів 53, а не 49.

---

### L2 — У просторі проєкту на телефоні до восьми нижніх табів: 47pt на таб при 375pt `[пристрій]`

**Файли:** `app/project/[id]/_layout.tsx:107-117`, `constants/projectNav.ts:34-43`, `utils/projectUtils.ts:22`

```ts
export const PROJECT_NAV_ITEMS = [ overview, tasks, meetings, notes, time, budget, sprints, settings ] as const;
work: { meetings: true, notes: true, time: true, budget: true, sprints: true },
```

**Що бачить користувач.** Власник проєкту на шаблоні «work» (дефолт) бачить усі вісім табів:
375/8 = 46,9pt на таб. Підписи «Завдання», «Спринти» на `fontSize: 10` з `numberOfLines=1` обрізаються.

**Правка.** Обмежити бар 5 табами і винести решту в «Ще» (як уже зроблено через `href:null` в особистому
просторі), або на compact сховати підписи, або перевести розділи проєкту на горизонтальний сегмент під
хедером. Наразі — не правити, а підтвердити на 375pt, скільки підписів ріжеться.

**Статус:** CONFIRMED передумова, наслідок — гіпотеза. Існуючий `__tests__/project-nav-routes-exist.test.ts:23-26`
стверджує рівно вісім ключів для work+owner і проходить; `_layout.tsx:71` підстраховує ще й фолбеком
`MODULES_BY_TEMPLATE.work`, тож вісім табів видно навіть «простому» проєкту в перший момент. Але жоден
розділ не стає недосяжним, іконки різні, а зріз підпису не виміряно.

---

### L6 — ~35 Stack-екранів тримають верхній інсет на нативному `SafeAreaView`, який сам проєкт задокументував як зламаний `[пристрій]`

**Файли:** `app/archive.tsx:276`, `app/projects.tsx:759`, `app/notes.tsx:223`, `app/containers.tsx:617`,
`app/health-*.tsx`, `app/workouts.tsx:148/268/429/1062`, `app/banks.tsx:423`, `app/sync.tsx:184`,
`app/data.tsx:396`, `app/notifications.tsx:406` та ін. (для порівняння — `hooks/use-top-inset.ts` і
`components/shared/ScreenHeader.tsx`, які вживають лише 10 файлів)

```tsx
<SafeAreaView style={{ flex: 1 }} edges={['top']}>
```
```
hooks/use-top-inset.ts:6-16 — «Нативний SafeAreaView edges={['top']} для цього не годиться: він додає
padding окремим нативним комітом ПІСЛЯ того, як JS уже розклав дерево… Друга половина того самого бага —
Android: WindowInsetsCompat там віддає top=0… StatusBar.currentHeight у цьому випадку знає правду.»
```

**Що бачить користувач (за описом хука).** На першому кадрі й після переобчислення вікна заголовок і
кнопка «назад» встигають намалюватись під статус-баром; на частині Android-прошивок top=0 назавжди.

**Правка.** Перевести ці екрани на `ScreenHeader` (він сам бере `useTopInset()`) або замінити обгортку на
`View` + `paddingTop: useTopInset()` — рівно як у `components/projects/ProjectScreenShell.tsx:54-55`.

**Статус:** **UNCERTAIN.** Рядки справжні і співвідношення ~35 проти 10 правильне, але доказ дефекту —
це цитата власного коментаря проєкту, а не спостережена поведінка, і він суперечить документації
бібліотеки: `react-native-safe-area-context` 5.6.2 позиціонує `SafeAreaView` саме як preferred спосіб,
бо padding кладеться нативно й не дає мерехтіння, властивого JS-хуку. Друга половина («Android віддає
top=0») тут майже не застосовна: `app.json` має `android.edgeToEdgeEnabled: true`, а ці екрани не
всередині `Modal`. Реальна різниця зводиться до фолбека `StatusBar.currentHeight` на екзотичних
прошивках. Як є — розбіжність із власною конвенцією, а не доведений дефект.

---

### L8 — Пошта користувача скрізь у рядок без переносу: на екрані «Акаунт» її нічим не дочитати `[пристрій]`

**Файли:** `app/account.tsx:240` (стиль `st.input` на `:493`), `app/(tabs)/settings.tsx:229`,
`app/project/[id]/members.tsx:397,425`

```tsx
<Text style={[st.input, { color: c.sub }]} numberOfLines={1}>{user?.email}</Text>   // fontSize: 16
```

**Що бачить користувач.** На 375pt під текст лишається ~300pt (~33 символи при 16pt). Довга пошта
обрізається еліпсисом, і дочитати її нічим: `Text` не `selectable`, розкриття по тапу немає. На екрані,
який існує рівно щоб показати «під яким акаунтом я зараз», відповідь буває недоступною — а застосунок
уміє перемикати workspace і зливати дані між акаунтами.

**Правка.** На `account.tsx:240` зняти `numberOfLines` або поставити `{2}` і додати `selectable`;
у списках — розкриття по тапу або повна адреса в `accessibilityLabel` і в деталі учасника.

**Статус:** CONFIRMED. Глобального вимкнення масштабування шрифту немає (єдиний `maxFontSizeMultiplier`
у репозиторії — `ScreenHeader.tsx:137`), тож при Dynamic Type зріз настає ще раніше. Спрацьовує лише на
довгих адресах, нічого не ламає.

---

### L9 — Плитка розділу «Здоров'я» має зашиту висоту 112pt і `overflow:'hidden'` `[пристрій]`

**Файли:** `components/health/HubTile.tsx:24-39`, `app/(tabs)/health.tsx:114,224-240`

```tsx
<BlurView ... style={{ borderRadius: 18, borderWidth: 1, borderColor: border, overflow: 'hidden', padding: 14, height: 112 }}>
<Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '800', marginTop: 12 }}>{title}</Text>
{stat ? <Text numberOfLines={1} style={{ fontSize: 13, ... }}>{stat}</Text> : ...}
```

**Що бачить користувач.** При збільшеному системному шрифті рядок статистики (те, заради чого плитку й
читають) їде під `overflow:'hidden'`. На 375pt у дві колонки під текст лишається ~131pt, а «Сон і
відновлення» жирним 15pt — приблизно 139pt, тобто заголовок ріжеться.

**Правка.** `height: 112` → `minHeight`, заголовку дозволити два рядки, зняти `overflow:'hidden'` або
підняти висоту під `maxFontSizeMultiplier`.

**Статус:** **UNCERTAIN.** Головне твердження («зрізається вже при системному шрифті за замовчуванням»)
не витримує власної арифметики знахідки: останні 14pt у сумі — це нижній padding, а не контент; контент
закінчується на ≈100,4pt усередині коробки 112pt. Запас є приблизно до множника 1,1, далі рядок
статистики справді поїде (`maxFontSizeMultiplier` тут не задано, глобального `allowFontScaling={false}`
у проєкті немає). Друга половина (зріз заголовка) правдоподібна, але це оцінка ширини тексту без рендера.

---

### L10 — Двадцять bottom-sheet-ів не вживають `sheetColumnStyle`: на планшеті форма розтягується від краю до краю

**Файли:** `components/shared/MonthPicker.tsx:82-105`, `components/shared/MeetingFormSheet.tsx:293-296`,
`components/health/{QuickAddSheet:56-63,BodyEntrySheet:60-80,HealthEntryModal:83-108}`,
`components/projects/ProjectSwitcherSheet.tsx:153-160`, `app/containers.tsx:867-869`,
`app/budget.tsx:474-480,558-564`, `app/notes.tsx:328`, `app/projects.tsx:971-973`,
`app/banks.tsx:509,658`, `app/bugs.tsx:434,514`, `app/ideas.tsx:470,546`, `app/meetings.tsx:1214-1219`,
`app/(tabs)/settings.tsx:622,660`, `app/(tabs)/health.tsx:369-371`, `app/health-{meds:125,habits:114,checkups:105,vaccines:103}.tsx`,
`app/project/[id]/notes.tsx:134-140`

```ts
// components/health/QuickAddSheet.tsx:118-120
sheetWrap: { paddingHorizontal: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
sheet:     { borderRadius: 26, borderWidth: 1, padding: 20, maxHeight: '92%', overflow: 'hidden' },
// hooks/use-content-width.ts:22-30 — правило, яке вони мали б виконувати
 * Аркуш притиснутий до низу й тягнеться на всю ширину контейнера, тож на
 * iPad у ландшафті це ~1170pt суцільної форми від краю до краю.
```

**Що бачить користувач.** На iPad у ландшафті поле вводу метрів завширшки, «Скасувати/Зберегти»
розлітаються по протилежних кутах.

**Правка.** Додати `sheetColumnStyle(isWide)` у стиль обгортки кожного листа — як в
`app/(tabs)/explore.tsx:1310` — або перевести лист на `components/shared/SheetModal`.

**Статус:** CONFIRMED. Точний перерахунок: поза `SheetModal` `sheetColumnStyle` вживається лише в трьох
файлах (`time.tsx`, `index.tsx`, `explore.tsx` — 8 call-site-ів). Спот-чек названих файлів підтвердив
відсутність пропа й відсутність захисту рівнем вище. Наслідок лише на широкому вікні й суто естетичний.

---

### I18N-08 — Множина зроблена руками у трьох місцях і дає неправильні форми

**Файли:** `app/(tabs)/index.tsx:2516-2517`, `app/containers.tsx:58-61`,
`components/tasks/TaskEditForm.tsx:339-341`

```ts
app/(tabs)/index.tsx:2516 — if (tCnt > 0) parts.push(`${tCnt} завдань`);
app/containers.tsx:60 — return n === 1 ? 'річ' : n < 5 ? 'речі' : 'речей';
```

**Що бачить користувач.** Попап дня в календарі завжди пише родовий відмінок («1 завдань»). Правило
`n < 5` не враховує десятки: 21 дає «речей» замість «річ», 22-24 — «речей» замість «речі».

**Правка.** Провести через наявний `pluralForm(count, lang)` з `utils/activeTimersBar.ts` і шаблони
`'{n} завдання' / '{n} завдань' / '{n} task' / '{n} tasks'` — як уже зроблено для
`timersCountOne/Few/Many`.

**Статус:** CONFIRMED, доведено тестом: `pluralForm(21,'uk') === 'one'`, `pluralForm(22,'uk') === 'few'`,
тоді як правило `containers` дає «речей» для обох. `itemsWord` — живий код (`containers.tsx:120,585`).
Для тріажу: половина про `index.tsx:2516` — це не граматика, а звичайна неперекладена кирилиця, вона
перетинається з I18N-01; справжній граматичний дефект — лише `containers.tsx`.

---

### I18N-09 — Підпис ріжеться за кількістю символів, а не за шириною `[пристрій]`

**Файли:** `app/(tabs)/settings.tsx:176`, `components/time/ActiveTimersBar.tsx:173`,
`components/time/ActiveTimersSidebarCard.tsx:137`, `app/subscriptions.tsx:545`

```ts
if (status !== 'authed') return tr.syncGuestHint.slice(0, 18) + '…';
```

**Що бачить користувач.** UK «Увійдіть або зареєструйтесь для синхронізації» (45 симв.) → «Увійдіть або
зареє…», EN «Sign in or register to sync» (27 симв.) → «Sign in or registe…» — хоча англійський рядок
цілком помістився б.

**Правка.** Прибрати `slice(0, 18)` і покластися на `numberOfLines={1}` з `ellipsizeMode='tail'`.
Дві кнопки з `navTimeTracker`/`navSubscriptions` (єдині два ключі, довші англійською) перевірити на 375pt.

**Статус:** CONFIRMED у несучій половині (`settings.tsx:176` і обидва значення словника — `:2242` і
`:3478`). Решта слабша: `numberOfLines={1}`-місця справжні й довжини ключів такі, як заявлено, але
жодного фактичного зрізу не показано, а `subscriptions.tsx:545` — заголовок екрана з двома 17pt
іконками поруч і майже напевно вміщається. Твердження «звірив довжини всіх 1192 пар ключів» не
переперевірялось. Живий прохід англійською на 375px дав нуль обрізаних елементів — масової проблеми з
довжиною EN у застосунку немає.

---

### PERF-1 — Резолвер outbox-потоків робить 4 читання AsyncStorage на кожен запис

**Файли:** `store/project-sync.ts:175-183`, `:161-171`, `store/sync-engine.tsx:643-669`,
`store/synced-storage.ts:563,578,590`

```ts
export function installOutboxStreamResolver(): () => void {
  setOutboxStreamResolver(async (collection, localId, record) => {
    const [myProjectIds, conflicted] = await Promise.all([getMyProjectIds(), getConflictedProjectIds()]);
// getMyProjectIds сам робить ще три читання (workspace_projects, projects, project_id_conflicts)
```

**Що бачить користувач.** Нічого прямо — це витрачені цикли. `generateFullOutbox()` кличе резолвер на
кожен запис кожної з 27 колекцій, тобто 4N звернень до сховища там, де вистачило б 4.

**Правка.** Порахувати `myProjectIds`/`conflicted` один раз перед циклом і передати всередину
(зробити `resolveOutboxStream` чистою функцією від готових множин); як мінімум — мемоізувати з
інвалідацією за `notifyStorageChanged`.

**Статус:** CONFIRMED за механізмом (тест: один виклик = рівно 4 `getItem`, десять = 40, кешу немає),
але **дві поправки знімають P1.** (1) Читання не послідовні — це 4 конкурентні `getItem` у двох
вкладених `Promise.all`. (2) Головне: «повторювана ціна на кожному синку» — хибне прочитання коментаря.
`sync-engine.tsx:1044` виконує `generateFullOutbox()` лише при `cursor === 0`; далі — тільки
«Відправити все», відкат курсора сервера і міграція. Реальний повторюваний шлях — `enqueueChanges`,
де N зазвичай 1-2.

---

### PERF-5 — Міграції сховища переганяються повністю на кожному холодному старті

**Файли:** `store/migrations.ts:592-612`, `:214`, `:524`, `:570-573`, `store/timer-context.tsx:223`,
`app/_layout.tsx:397`

```ts
export async function runStorageMigrations(): Promise<string[]> {
  const applied = await loadData<string[]>(MIGRATIONS_KEY, []);   // прочитали...
  if (await addDerivedIds('finance_currencies', 'code')) done.push('finance_currencies:ids');
  ... (дев'ять кроків, жоден не дивиться на `applied`)
  if (done.length) { await saveData(MIGRATIONS_KEY, [...applied, ...done]);   // ...і вжили лише тут
```

**Що бачить користувач.** Затримка старту: `TimerProvider` чекає на цю обіцянку, перш ніж прочитати
активні таймери, тож панель таймерів і перший екран тримаються рівно на цей час.

**Правка.** Звіряти `applied` перед кожним кроком — тоді з другого запуску весь блок це одне читання.
Дві міграції, що читають `tasks`, мають ділити один прочитаний масив.

**Статус:** CONFIRMED тестом: другий поспіль виклик `runStorageMigrations` на тому самому сховищі
робить 15 звернень, і `tasks` парситься двічі за прохід. Знахідка навіть недооцінює: `migrateAccounts`
(`:424-447`) не має раннього виходу взагалі — безумовно читає 5 ключів (включно з повним блобом
`transactions`). Гейт справжній (`app/_layout.tsx:409`). Але це десятки мс дрібних `getItem` без втрати
даних — P2.

---

### PERF-6 — Шість (насправді десять) екранів переписують усю колекцію одразу після завантаження

**Файли:** `hooks/use-health-entries.ts:134`, `app/containers.tsx:314-315`, `app/health-meds.tsx:42`,
`app/health-vaccines.tsx:45`, `app/health-checkups.tsx:46`, `app/health-habits.tsx:46`,
`app/bugs.tsx:220`, `app/notes.tsx:123`, `app/ideas.tsx:256`, `app/(tabs)/time.tsx:186`,
`store/synced-storage.ts:488-527,362-384`

```ts
  useEffect(() => { loadContainers().then(() => setInitialized(true)); }, []);
  useEffect(() => { if (initialized) void saveSynced(STORAGE_KEY, containers); }, [containers, initialized]);
// synced-storage.ts:362 — diffItems стрінгіфаїть ОБИДВА масиви цілком
  const prevMap = new Map(prev.map(i => [i.id, comparableJson(i)]));
```

**Що бачить користувач.** Холостий запис на монтуванні: повне читання + `JSON.parse`, `diffItems` зі
`JSON.stringify` кожного запису обох масивів, `stampUpdatedAt`, знову `stringify` + запис.
Заміряно на V8: 2000 записів — 4.5 мс, 20 000 — 38.9 мс; на Hermes у 3–6 разів більше.

**Правка.** Не писати, доки не було локальної правки: перейти на `hooks/use-synced-list.ts` (він саме
для цього) або тримати `baselineRef` і виходити, коли `items === baselineRef.current`.

**Статус:** CONFIRMED тестом (ранній вихід `items === existing` не спрацьовує, бо ідентичності різні;
outbox при цьому порожній, тобто запис стовідсотково холостий). Поправка: таких місць не шість, а
десять. Додаткове підсилення: `saveData → notifyStorageChanged`, тож холостий запис ще й будить
підписників `useStorageRefresh` на інших екранах.

---

### PERF-8 — Агрегати здоров'я роблять ~36 повних проходів по масиву з розбором дати для кожного елемента

**Файли:** `hooks/use-health-entries.ts:148-192`, `utils/healthUtils.ts:194-195,238-239`

```ts
export function sumForDay(entries: HealthEntry[], type: EntryType, day: Date): number {
  const pool = entries.filter(e => e.type === type && isSameDay(new Date(e.date), day));
// 8 викликів на «сьогодні» + 4 графіки × 7 днів = ще 28
```

**Що бачить користувач.** 36N розборів ISO-рядків при кожній зміні `entries` і кожному монтуванні хука.
На V8: 2000 записів — 4.2 мс, 40 000 — 57.2 мс; на Hermes у 3–6 разів більше, тобто провал кадрів при
вході на екран здоров'я з трирічною історією HealthKit. Множиться на вісім, бо кожен екран здоров'я
тримає власний екземпляр хука.

**Правка.** Один прохід замість 36: `useMemo` з індексом `Map<'YYYY-MM-DD', Map<EntryType, HealthEntry[]>>`
(розбір дати рівно раз на запис). Додатково підняти `useHealthEntries` у контекст, щоб вісім екранів
ділили один екземпляр.

**Статус:** CONFIRMED. Фактично ~38 проходів, тобто «~36» — чесна оцінка. Вісім екземплярів хука
підтверджено grep-ом. Усе загорнуто в `useMemo` з deps `[entries]`, тож ціна платиться на монтуванні й
зміні `entries`, а не щорендера — знахідка так і каже.

---

### PERF-9 — Некешований прохід по задачах із `toDateString()` у тілі рендера екрана задач

**Файл:** `app/(tabs)/index.tsx:572-591`

```ts
  const todayStr = today.toDateString();
  const dueTodayTasks   = tasks.filter(t => t.deadline && new Date(t.deadline).toDateString() === todayStr);
  const doneCount       = dueTodayTasks.filter(t => t.status === 'done').length;
  ...
  const doneSubtasks    = dueTodayTasks.reduce((acc, t) => acc + t.subtasks.filter(s => s.done).length, 0);
```

**Що бачить користувач.** Єдиний блок у файлі без `useMemo` (сусідні `sorted`, `filtered`, `groups`,
`markedDays`, `todayMeetings` мемоізовані). Оскільки `TasksScreen` не компілюється (PERF-2), блок
переобчислюється на кожен рендер — на кожну натиснуту клавішу в пошуку. Разом із PERF-3 це і є відчутне
підгальмовування набору.

**Правка.** Загорнути весь блок в один `useMemo(..., [tasks, todayMeetings, todayStr])`, а всередині
порівнювати `t.deadline.slice(0, 10)` з ISO-датою дня замість `new Date(...).toDateString()`.

**Статус:** CONFIRMED, **заголовок оригіналу перебільшував** («шість повних проходів»): повний прохід по
`tasks` тут один, решта п'ять `reduce`/`filter` ідуть уже по `dueTodayTasks` — підмножині «дедлайн
сьогодні». Причинний зв'язок із PERF-2 перевірений і справжній.

---

### PERF-10 — Один сигнал сховища на екрані задач тягне чотири читання, у тому числі поки вкладка у фоні

**Файли:** `app/(tabs)/index.tsx:415-426`, `:437`, `hooks/use-storage-refresh.ts:37-51`

```ts
  const loadOthers = useCallback(async () => {
    const [p, m, statuses, s] = await Promise.all([
      loadData<Project[]>('projects', []), loadData<Meeting[]>('meetings', []),
      loadData<TaskStatusColumn[]>('task_statuses', []), loadData<Sprint[]>('sprints', []) ]);
  useStorageRefresh(['projects', 'task_statuses', 'sprints'], loadOthers, initialized);
```

**Що бачить користувач.** Правка проєкту на екрані `/projects` змушує фонову вкладку задач зробити 4
читання + `JSON.parse`, включно з `meetings`, на який тут навіть не підписано. Дебаунсу і перевірки
фокуса немає — на відміну від `today.tsx:204`.

**Правка.** Прийняти аргумент: `useStorageRefresh([...], key => loadOne(key), initialized)` з мапою
завантажувачів (як у `today.tsx:149-179`), плюс той самий `focusedRef`-ґейт.

**Статус:** CONFIRMED. Хук передає ключ (`use-storage-refresh.ts:22` — коментар «можна перечитати лише
його»), колбек його ігнорує. Єдиний наявний захист `writesInFlight` (`:41`) гасить лише власні записи
екрана; чужі проходять.

---

### PERF-11 — Чотири контексти віддають новий об'єкт-значення щорендера

**Файли:** `store/app-mode.tsx:82`, `store/auth.tsx:796`, `store/auto-backup.tsx:107`,
`store/sync-engine.tsx:1609-1613`

```tsx
  return <Ctx.Provider value={{ online, ready, setOnline }}>{children}</Ctx.Provider>;
// для порівняння — store/i18n.tsx:37, theme-context.tsx:49, timer-context.tsx:520:  const value = useMemo(...)
```

**Що бачить користувач.** Нічого: провайдери перерендерюються лише від власного стану, `children` —
проп. Реальний наслідок — споживачі не можуть покластися на стабільність значення, тож будь-яка спроба
покласти `useAuth()`/`useAppMode()` у deps ефекту або в пропси memo-компонента мовчки втрачає
мемоізацію. В `auth.tsx` до цього додається бейлаут компілятора на `:332`, тож усі десять функцій у
значенні теж перестворюються — при тому що частина з них уже в `useCallback`, тобто намір стабільності
був.

**Правка.** Привести до вигляду `i18n.tsx`: `const value = useMemo(() => ({...}), [...])`; у
`app-mode.tsx` додатково обгорнути `setOnline` у `useCallback`.

**Статус:** CONFIRMED. Одне перебільшення: «дасть нескінченний цикл» — ні, ефект просто перезапуститься
на кожному рендері провайдера.

---

### PERF-12 — `expo-av` підвантажується синхронно на рівні модуля у двох екранах `[пристрій]`

**Файли:** `app/(tabs)/index.tsx:133-135`, `app/meetings.tsx:51-53`, `package.json:25`

```ts
// ─── expo-av conditional (install with: npx expo install expo-av) ────────────
let AVAudio: any = null;
try { AVAudio = require('expo-av').Audio; } catch {}
```

**Що бачить користувач.** Кілька мс eval JS на старті. Патерн «умовний нативний пакет» застосовано
наполовину: `try/catch` захищає від відсутності пакета, але не відкладає завантаження.

**Правка.** Перенести `require('expo-av')` усередину `startRecording`/`playRecording` з кешуванням у
модульній змінній; паралельно планувати міграцію на `expo-audio`.

**Статус:** CONFIRMED. Скептичну гіпотезу «модуль екрана задач лінивий, бо `initialRouteName='today'`»
перевірено і відкинуто на користь знахідки: `expo-router` за замовчуванням у sync-режимі
(`import-mode/index.js`), і `useScreens.js:182-184` кличе `loadRoute()` негайно при побудові екранів.
Наслідок мізерний; друга половина (expo-av викреслено з SDK 54) — відомий пункт ТЗ, не нова інформація.

---

### PERF-13 — Вміст коробки малюється через `.map()` без стелі — усередині `ScrollView`, де віртуалізувати вже не можна `[пристрій]`

**Файли:** `app/containers.tsx:471-478`, `:587`

```
   * Речі виводяться звичайним map, а не FlatList: DetailPane уже загорнув
   * дітей у ScrollView, а вкладати віртуалізований список у ScrollView того
   * ж напрямку не можна — RN на це лається й ламає віртуалізацію.
```

**Що бачить користувач.** Кількість речей у коробці нічим не обмежена — це ж і є сценарій екрана.
Коробка на кілька сотень позицій монтує всі рядки одночасно: затримка відкриття панелі й рвана
прокрутка.

**Правка.** Дати `DetailPane` режим `scrollable={false}` і винести вміст деталі в один `FlatList` із
`ListHeaderComponent`. Дешевший варіант — перші N речей і «показати всі», як для груп задач.

**Статус:** CONFIRMED. Причина в коментарі справжня: `components/shared/DetailPane.tsx:63,93` — обидві
гілки загортають children у власний `ScrollView`. Стелі на кількість речей немає. Той самий клас, що
й PERF-7, але слабший: коробка на сотні позицій — менш типовий сценарій.

---

### DI-07 — id синхронізованих записів — самий лише `Date.now()`, без випадкової частини

**Файли:** `app/(tabs)/explore.tsx:633`, `app/(tabs)/index.tsx:687,1164,1466`,
`app/project/[id]/{tasks:286,notes:66,time:68,meetings:97,sprints:111}.tsx`, `app/notes.tsx:133`,
`app/ideas.tsx:282`, `app/bugs.tsx:243`, `app/containers.tsx:376`, `app/workouts.tsx:890`,
`app/banks.tsx:357`, `app/(tabs)/time.tsx:248`

```ts
setTxs(p => [{ id: Date.now().toString(), date: new Date().toISOString(), ...patch }, ...p]);
const base: Task = { id: Date.now().toString(),
```

**Що бачить користувач.** Цей `id` — водночас `local_id` мутації синку, а для колекцій проєктного
потоку його простір імен спільний для всіх учасників. Два учасники, що створили запис в одну
мілісекунду, шлють той самий `local_id`; LWW за `updatedAt` лишає одну версію — задача другого не
дублюється, вона мовчки стає задачею першого. Контраст усередині репозиторію: `newSprintId()`,
`adHocTimerId`, `createMutationId`, `uuidV4`, `p-${uuidV4()}` для проєктів мають і лічильник, і
випадковий хвіст.

**Правка.** Звести генерацію id синхронізованих записів до одного помічника
(`newRecordId(prefix)` за зразком `newSprintId`). Міграція наявних даних не потрібна.

**Статус:** CONFIRMED за фактом коду (27 входжень по дереву), **але знижено до P2 і список файлів
почищено.** `app/(tabs)/index.tsx:960,1024`, `app/subtasks.tsx:163` і `app/containers.tsx:398` генерують
id **вкладених** елементів усередині запису task/container — вони ніколи не стають `local_id` мутації,
тож механізм до них не застосовний. Головне: щоб збіг стався, двоє учасників мусять створити кореневий
запис в одну мілісекунду; спостережуваного дефекту немає — це латентний ризик. Виправлення розумне,
пріоритет — ні.

---

### DI-08 — Видалити всі категорії одного типу неможливо: вони повертаються дефолтами й пушаться на сервер

**Файли:** `app/(tabs)/explore.tsx:1659`, `:322-332`, `store/migrations.ts:114-118`

```ts
for (const type of Object.keys(fallback)) {
  if (!out[type].length) out[type] = fallback[type];
}
onPress={() => setCats(prev => ({ ...prev, [catTab]: prev[catTab].filter(cc => cc.name !== cat.name) }))}
```

**Що бачить користувач.** `categoryRowsToMap` трактує «нуль рядків цього типу» як «даних ще немає».
Після того, як людина свідомо вичистила, скажімо, категорії доходів, наступне монтування екрана
негайно виконує `saveSynced('categories', …)` уже з дефолтами — видалені категорії відроджуються в
сховищі й ідуть в outbox на решту пристроїв.

**Правка.** Відрізняти «сховище порожнє» від «усе видалили»: сіяти дефолти один раз явним кроком
міграції з відміткою в `storage_migrations_applied`, а `categoryRowsToMap` лишити чистим перетворенням.

**Статус:** CONFIRMED механізмом і тестом, **але досяжність вужча, ніж заявлено.** Дефолтні категорії
видалити не можна: `explore.tsx:1642` рахує `isDefault` і замість кошика малює бейдж. Тож при збігу мови
інтерфейсу з мовою збережених назв тип ніколи не стає порожнім. Досяжно лише після перемикання мови:
старі категорії перестають бути «дефолтними», їх можна вичистити до нуля — і тоді вони відроджуються
дефолтами іншої мови й їдуть на сервер.

---

### DI-09 — Pull пише `null` у singleton-ключ — рівно той шаблон, який сам репозиторій позначив як major

**Файли:** `store/sync-engine.tsx:741-744`, `store/storage.ts:59-70`, `store/data-ownership.ts:67-79`

```ts
await saveData(collection, serverItem.deleted ? null : (serverItem.data?.value ?? serverItem.data));
// store/storage.ts (шапка removeData) — чому так не можна:
// Прибирає ключ ЦІЛКОМ (а не `saveData(key, null)`): останній пише рядок
// `"null"`, і `loadData` ... повертав би СПРАВЖНІЙ `null` замість fallback
```

**Що бачить користувач.** Для `health_profile` це означає, що `healthUtils` рахує TDEE, норму білка й
зони ІМТ на битому вході; для `finance_primary_currency` — що екрани фінансів отримують `null` там, де
контракт обіцяє код валюти. Додатково `generateFullOutbox` перевіряє `value !== undefined`, тож `null`
проходить і стертий на сервері singleton одразу штовхається назад як `{value: null}` з
`base_revision: null` → OCC-конфлікт → `'manual'`: користувач отримує незрозумілий конфлікт на
порожньому місці.

**Правка.** У singleton-гілці `applyPullResponse` — `removeData(collection)` для `serverItem.deleted`
(як уже робить `wipeLocalSyncedData`), а для живого рядка брати значення однозначно:
`'value' in (serverItem.data ?? {}) ? serverItem.data.value : serverItem.data`.

**Статус:** CONFIRMED, доведено тестом: після `saveData(key, null)` у сховищі лежить `'null'`, а
`loadData(key, 'UAH')` повертає `null`. `data-ownership.ts:67-79` цю пастку вже обійшов — у pull-гілці
ні, тобто непослідовність справжня. Досяжність вимагає серверного тумбстоуна singleton-рядка, тому P2.

---

## Потребує перевірки на пристрої

Технічне завдання для наступного, нативного прогону на симуляторі (iPhone SE 375pt, iPhone 15 393pt,
Android із трикнопковою та жестовою навігацією). 21 знахідка: код доведено статично, симптом — ні.

| ID | Sev | Що саме відтворити, щоб підтвердити або спростувати |
|---|---|---|
| ERR-10 | P1 | Вимкнути сповіщення в налаштуваннях ОС (або відмовити в дозволі) → створити звичку і ліки з нагадуванням на +2 хв. Підтвердити: запис зберігся з часом, картка показує годину, **сигнал не приходить**, попередження ніде немає. |
| ERR-12 | P1 | Почати запис у задачі/нараді, під час запису вбити аудіосесію (дзвінок, від'єднання гарнітури, `AVAudioSession` interruption) і натиснути «стоп». Підтвердити: таймер зник, файл не прикріплено, повідомлення немає, **і екран лишився в стані «йде запис»** (`isRecording` не скинуто) — повторний стоп теж падає. |
| ERR-14 | P1 | Дати дозвіл HealthKit, потім симулювати збій запиту (або відкликати доступ до одного типу) → відкрити `/apple-health`. Підтвердити: нулі й порожні графіки нічим не відрізняються від справжніх, а зверху «оновлено щойно». |
| A11Y-06 | P1 | Зміряти контраст неактивного тінту таб-бара **поверх реального контенту** на iOS (BlurView intensity 80) — Android-гілка з суцільним фоном уже провалює статично. Заодно перевірити, чи читається підпис 10px українською. |
| A11Y-08 | P2 | Тапати чекбокс 22×22 в попапі дня календаря (`index.tsx:2607`) великим пальцем: скільки промахів відкриває завдання замість перемикання. Те саме для степерів 28×28. |
| A11Y-10 | P2 | Увімкнути Reduce Motion → відкрити будь-який список із завантаженням. Підтвердити, що `Skeleton` пульсує далі (решту підпір цієї знахідки вже спростовано). |
| L1 | P1 | Android із трикнопковою навігацією: зміряти фактичну висоту контенту таб-бара (очікувано ~10dp під іконку 26pt + підпис 10pt) в особистому й проєктному барах. iPhone SE: підтвердити 88pt панель при `insets.bottom = 0`. |
| L2 | P2 | Проєкт шаблону «work», власник, 375pt: зняти скріншот бару і порахувати, **скільки саме** з восьми підписів обрізано еліпсисом. |
| L3 | P1 | На кожному з десяти екранів: набрати текст у полі → **один раз** тапнути сусідню кнопку. Підтвердити, що перший тап лише ховає клавіатуру. Тестом це не доводиться (`fireEvent.press` ігнорує проп). |
| L6 | P2 | Ключове для розв'язання спору: Android **без** edge-to-edge і перший кадр після повернення на екран із `detachInactiveScreens`. Чи справді хедер на `SafeAreaView edges={['top']}` заїжджає під статус-бар, як стверджує `use-top-inset.ts`, чи ні (документація бібліотеки стверджує протилежне). |
| L7 | P1 | Android edge-to-edge: тапати нижню третину FAB на `/banks`, `/notes`, `/meetings` — скільки дотиків з'їдає системна панель; на жестовій — чи перехоплюється свайп «додому». |
| L8 | P2 | 375pt, пошта на 44 символи: підтвердити зріз на `/account`, у `/settings` і в списку учасників; перевірити те саме при збільшеному Dynamic Type. |
| L9 | P2 | Плитка «Сон і відновлення» на 375pt у дві колонки при стандартному шрифті і при Dynamic Type ×1.1, ×1.3: чи ріжеться заголовок і чи зникає рядок статистики під `overflow:'hidden'`. |
| I18N-05 | P1 | Мова EN: створити нагадування про завдання й зустріч, дочекатися сигналу на заблокованому екрані. Підтвердити український текст. Окремо — ім'я каналу «Нагадування» в системних налаштуваннях Android і те, що воно не змінюється після зміни мови. |
| I18N-09 | P2 | EN на 375pt: чи ріжуться `navTimeTracker` («Time Tracker») у панелі таймерів і `navSubscriptions` у заголовку екрана. |
| PERF-3 | P1 | Профайлер на екрані задач: набрати 5 символів у пошуку при ~300 задачах і зміряти, скільки карток перемальовується на символ; після фіксу `useMemo` в `useMotion` — повторити. |
| PERF-4 | P1 | Те саме на «Фінансах»: набір суми у формі при відкритій стрічці місяця — скільки денних груп перемальовується на клавішу. |
| PERF-7 | P1 | Завести 100+ задач у статусі `in_progress` → відкрити вкладку «Сьогодні». Зміряти час до першого кадру й падіння fps при прокрутці (сотні `BlurView` зі стартовими анімаціями). |
| PERF-12 | P2 | Зміряти внесок `require('expo-av')` у час холодного старту (очікувано одиниці мс) — щоб вирішити, чи варто взагалі чіпати до міграції на `expo-audio`. |
| PERF-13 | P2 | Коробка на 300+ речей: час відкриття `DetailPane` і плавність прокрутки всередині. |
| DI-05 | P1 | Два пристрої з одним акаунтом. (а) Завести ліки на A → дочекатися синку на B → підтвердити, що на B сигнал **не** приходить. (б) Видалити ті самі ліки на A → підтвердити, що на B нагадування `med_<id>_<i>` **далі дзвонить** і скасувати його нічим. |

---

## Прогалини

**Спільне для всіх напрямів.** Симулятора під час прогону не було (нативна збірка компілювалась), тож
жодна з 21 знахідки вище не спостережена. Expo-web доходить лише до авторизації: `expo-secure-store`
на вебі — порожній об'єкт, тож ~60 екранів (Сьогодні, Завдання, Фінанси, Здоров'я, Час, Налаштування,
увесь простір проєкту, усі Stack-екрани) читані лише як код — ні модалок, ні листів, ні деталей ніхто
не бачив намальованими. Не перевірялись: планшет і ландшафт, Dynamic Type, Split View / Stage Manager,
RTL, поворот екрана з відкритим листом, нативні проєкти `android/` та `ios/` (Info.plist,
accessibility-конфіги, локалізація системних рядків), тексти, що приходять із сервера.

**Поведінка при збоях.** Не читано рядок за рядком (лише grep по `catch`/`Alert`/`loading`):
`app/(tabs)/agent.tsx`, `admin-workspace.tsx`, `developer.tsx`, `donate.tsx`, `finance-stats.tsx`,
`time-stats.tsx`, `time-records.tsx`, `subtasks.tsx`, `task-group.tsx`, `subscriptions.tsx`,
`workouts.tsx`, `projects.tsx`, `budget.tsx`, `sync.tsx`, `register-pending.tsx`, усі `health-*`;
`store/migrations.ts`, `data-ownership.ts`, `sync-diagnostics.ts`, `sync-conflicts.ts`, `api-config.ts`.
Не перевірено, чи справді AsyncStorage кидає на великих значеннях саме в цій збірці (Android
CursorWindow) і чи видно Alert поверх модалки.

**Доступність.** Не підтверджено фактичний порядок читання VoiceOver і чи ізолює iOS вміст під RN
`<Modal>` без `accessibilityViewIsModal` (63 `<Modal>` у коді, лише 15 із цим пропом — на iOS RN Modal
презентується окремим `UIViewController` і зазвичай ізолює сам, тому окремою знахідкою не виноситься).
Не рахувався контраст для градієнтних і BlurView-тл із динамічною прозорістю — за базу брались суцільні
`bg1`/`bg2`/`card`, тож окремі місця поверх блюру можуть бути **гіршими** за наведені числа, але не
кращими. Не перевірено поведінку Dynamic Type на фіксованих висотах (`height: 34` у чипах, `32` у
клітинках календаря, `36/38` у кнопках хедерів).

**Компонування.** Найбільша незакрита пляма: не розібрано до кінця, чи справді RN/Yoga застосовує
`maxHeight: '90%'` на листах, чий батько має auto-висоту — це впливає на 15+ bottom-sheet-ів, і без
пристрою «стеля працює» не відрізнити від «стеля мовчки ігнорується». Жодної знахідки про це не подано.

**i18n.** Частина знахідок про одиниці виміру може мати одиничні хибні влучення через regex на
однолітерних одиницях («г», «л», «т») — цитовані місця перевірені очима, решта ні. Не перевірялись
`app.json` і нативні рядки (назва застосунку, permission usage descriptions).

**Продуктивність.** Мікробенчмарки робились на Node/V8; на Hermes очікувано в 3–6 разів повільніше, але
це оцінка, а не вимір. Не інструментовано, скільки читань AsyncStorage реально відбувається на холодному
старті наскрізь — пораховано лише гілку міграцій, решта провайдерів (auth, project-sync, sync-engine,
theme, i18n, timer) оцінена за кодом. Не дивились нижче рівня grep: `workouts.tsx`, `banks.tsx`,
`projects.tsx`, `finance-stats.tsx`, `time-records.tsx`, `(tabs)/time.tsx`, `(tabs)/agent.tsx`,
`meetings.tsx` — там теж є бейлаути компілятора, але вплив кожного не зважувався.

**Цілісність даних.** Django на `127.0.0.1:8000` не чіпався: усі знахідки клієнтські, серверна
поведінка OCC і тумбстоунів приймалась за контрактом (`store/sync-contract.ts`), не перевірялась
curl-ом. `app/(tabs)/index.tsx` (~3400 р.) читано фрагментами навколо grep-влучань. Не аудитовано в
глибину: `store/auto-backup.tsx`, `app/data.tsx` (експорт/імпорт), `store/push.ts`,
`utils/subscriptions.ts`, друга половина `store/sync-engine.tsx` (WS-реконект, р. 1400–1650),
`applyProjectPull` і конфлікти проєктного потоку. Окремо: `store/sync-conflicts.ts#resolveConflict`
має три дефекти (RMW без блокування, запис без outbox, запис `{id,_deleted:true}` як «живого» рядка),
але **нікуди не імпортується** — мертвий код, тому як знахідку не подано.

---

## Спростовані

Щоб не відкривали наново.

### ERR-07 — «Провалений запис повідомляється лише в `__DEV__` console: у релізі дія просто не відбувається»

Цитати справжні, але описаний наслідок не настає: гілка `catch` майже недосяжна. Доведено тестом
(`__tests__/audit-errors-skeptic.test.ts`, блок ERR-07): при падінні `AsyncStorage.setItem`
`updateSynced('tasks', …)` **резолвиться**, а не кидає — бо `saveData` (`storage.ts:50-57`) ковтає
помилку й просто повертає, а `loadData` ковтає свою. Єдиний реальний `throw` — `${key}: unexpected
storage shape` на не-масиві (`synced-storage.ts:496`). Отже сценарій «натиснув — нічого не сталося»
дає протилежне: `setTasks(updated)` малює зміну, галочка стає, і лише сховище мовчки не записалось — це
рівно причина **ERR-01**, а не окремий дефект обробки. `trackWrite`/`trackColumnsWrite`/`trackTaskWrite`
— це `useStorageRefresh`, мережі й ролей вони не додають, тож forbidden-throw тут теж немає.
Залишковий сенс — P2-неохайність логування.

### DI-06 — «Видалення проєкту знищує його нотатки, записи часу, зустрічі й операції локально, а попередження говорить лише про задачі»

Головне твердження спростовує сам рядок перекладу, який не був відкритий. `store/translations.ts:1818`,
`projectTasksRemain`: «Завдання проекту залишаться без прив'язки, але **наради, нотатки, записи часу та
фінансові дані проекту буде видалено з пристрою назавжди**» (англійський відповідник — `:3054`). Діалог
прямо перелічує все, що робить `wipeLocalProject` (`store/project-sync.ts:659-670`). Знахідку було
побудовано на імені ключа, а не на його тексті.

Залишкова, значно вужча частина існує і чекає окремого розгляду: `app/projects.tsx:619-627` — `catch`
лише логує, а `finally` однаково викликає `queueProjectDeletion(id)`, тож якщо відв'язка задач кинула
(`updateSynced` по `'tasks'`/`'sprints'`), задачі, які діалог обіцяв **зберегти** без прив'язки, все
одно будуть вичищені. Це P2-крайовий випадок, а не заявлена P1-знахідка.

### Частково спростовані твердження всередині чинних знахідок

Ці знахідки лишаються в силі, але з поправками — деталі в їхньому «Статусі перевірки»:

- **A11Y-08** — знижено P1→P2: WCAG 2.2 AA 2.5.8 вимагає 24×24, а не 44×44 (це AAA 2.5.5); під норму
  падає рівно один елемент із 17.
- **A11Y-10** — `SheetModal` Reduce Motion **враховує** (`:72, :110, :149`); `hello-wave.tsx` і
  `parallax-scroll-view.tsx` — мертвий код; нормативні посилання (2.3.3, 2.2.2) хибні.
- **L6**, **L9** — головні твердження не витримали перевірки (див. «UNCERTAIN» у їхніх статусах).
- **I18N-01** і **I18N-03** — `components/shared/MeetingFormSheet.tsx` викреслено: файл двомовний
  інлайново.
- **I18N-04** — «перемикання мови вже не полагодить» хибне для особистих колонок статусів
  (`taskStatuses.ts:111` домішує дефолти на читанні); знахідка тримається на шляху створення проєкту і
  на `migrateAccounts`.
- **ERR-11** — описаний шлях («кнопка синку в шапці») не відтворюється; знижено до P2.
- **ERR-14** — відкликаний дозвіл HealthKit за дизайном Apple віддає порожній результат без помилки,
  тож цей випадок наведеними `catch` не спричинений.
- **DI-07** — знижено P1→P2 і вичищено 4 файли з переліку (id вкладених елементів не стають `local_id`).
- **DI-08** — досяжно лише після перемикання мови інтерфейсу.
- **PERF-1** — «повторювана ціна на кожному синку» хибна: `generateFullOutbox` виконується лише при
  `cursor === 0`. Знижено до P2.
- **PERF-9** — повний прохід по `tasks` один, а не шість.
