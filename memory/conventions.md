# Conventions

## Мова

- **UI українською**. Англійська підтримується через `store/i18n.tsx`.
- Всі видимі рядки → `tr.xxx`. Hardcoded text — баг (поточні борги в UI/UX-звіті).

## TypeScript

- Завжди вмикати strict-режим.
- Не використовувати `any`, окрім інтеграції з нативними модулями (`expo-av: any`).
- Типи мають експортуватись з `utils/*.ts` (наприклад `Currency`, `Transaction`).

## Стиль React Native

### Кольори (акценти по екранах)

| Екран | Колір |
|-------|-------|
| Завдання | `#7C3AED` (фіолетовий) |
| Фінанси | `#0EA5E9` (блакитний) |
| Час | `#6366F1` (індиго) |
| Здоров'я | `#10B981` (зелений) |
| Контейнери | `#F97316` (помаранчевий) |
| Нотатки | `#F59E0B` (бурштиновий) |
| Архів | `#10B981` (зелений) |
| Спільне | `#06B6D4` (cyan) |

### Тіні

```js
shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8, shadowOffset:{width:0,height:4}
```

**Заборонено** яскраві кольорові glow-ефекти (rgba від accent кольору).

### BlurView замість суцільних карток

```tsx
<BlurView intensity={isDark ? 20 : 40} tint={isDark ? 'dark' : 'light'} style={...}>
```

### Радіус

- Cards: 16–20
- Buttons: 12–14
- Chips: 9–12
- Icons box: 9–13

### Розміри тексту

- Заголовок сторінки: 32–34 / weight 800 / letterSpacing -0.8
- Heading модалу: 18–20 / 800
- Тіло: 13–15 / 500–700
- Caption/label: 10–12 / 600 / uppercase для labels

## Заборонені практики

- **Не використовувати** `toDateString()` для фільтрації дат — використовувати `isSameDay` / `isSameMonth` з `utils/dateUtils.ts`.
- **Не видаляти** прапор `initialized` з `useEffect(saveData)` — без нього перезапис при першому рендері.
- **Не додавати** мок-дані — додаток починається порожнім.
- **Не міняти** мову UI вручну — `tr.xxx`.
- **Не встановлювати** пакети напряму через `npm install` — лише `npx expo install`.
- **Не давати** Stack-екранам відступ таб-бару (FAB і paddingBottom мають окремі значення).
- **Не рахувати** `filter === 'active'` як активний фільтр (Tasks) — це базовий стан.
- **Не swallow’ити** помилки AsyncStorage мовчки — принаймні `console.warn` в dev.

## Патерни UI

### Horizontal ScrollView з тапабельними чипами

ОБОВ’ЯЗКОВО `keyboardShouldPersistTaps="handled"`, інакше при відкритій клавіатурі тап на чип закриває клавіатуру замість тригера.

### Модальні форми

```tsx
<Modal visible={...} transparent animationType="slide" statusBarTranslucent>
  <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    <Pressable style={s.overlay} onPress={onClose}>
      <Pressable onPress={e => e.stopPropagation()} style={s.sheetWrapper}>
        <BlurView ...>
          <ScrollView keyboardShouldPersistTaps="handled">
            <HandleRow onClose={onClose} />
            {/* content */}
          </ScrollView>
        </BlurView>
      </Pressable>
    </Pressable>
  </KeyboardAvoidingView>
</Modal>
```

### Опційний нативний модуль

```ts
let Mod: any = null;
try { Mod = require('expo-av'); } catch {}
```

Це дозволяє розробляти на симуляторі без встановленого пакета.

## Компонентна архітектура

- Екранний файл — лише стан + хуки + layout.
- JSX → виносити в `components/` коли:
  - перевикористовується ≥2 рази, або
  - >100 рядків JSX перетворює `return` на нечитабельний.
- Бізнес-логіка → `utils/*.ts` (чисті функції).
- Shared компоненти: `MonthPicker` приймає `months`, `monthsShort`, `monthsGenitive` як пропи для локалізації.

## Дати

- У стейті: `Date` об’єкти або ISO рядки.
- У AsyncStorage: ISO рядки (`date.toISOString()`).
- При завантаженні: `new Date(isoString)`.
- Завжди `initialized` прапор перед першим збереженням.

## Безпека (нагадування)

- `device_id` тримати в **expo-secure-store**, не AsyncStorage (відкладено — M-DATA-2).
- Фінансові ключі (`transactions`, `finance_balance_adjustments`) бажано шифрувати (відкладено — M-DATA-1).
- **Усі server mutator endpoints вимагають membership** (`_assert_member` у `views.py`). При додаванні нового view — обов’язково викликати helper першим рядком, інакше відкриваєш діру. Read-endpoints для items/sections теж перевіряють — це не лише про writes.
- **WebSocket `GroupConsumer.connect()` валідує `device_id` з query**, відмовляє `close(4403)`. `receive()` no-op — не приймає клієнтських payload’ів. При додаванні нової WS-логіки нічого приймати від клієнта не варто; broadcast має йти лише з REST endpoints.
- `secrets.choice()` замість `random.choices()` для будь-яких токенів/секретів. Заборонити `random.*` у production-коді.

## Sync (pattern — Shared screen)

`persistItem` оптимістично оновлює локальний стан + кидає `POST /sync/`. При
падінні мережі — пише в `shared_pending_${gid}` (масив `PendingChange`). У
`syncGroup` перед основним sync’ом викликається `drainPending(gid, deviceId)`,
який ретраїть до 20 разів кожен item. WS-handler фільтрує власний echo через
`from_device_id === deviceIdRef.current`. При додаванні нових write-операцій
користуватися `persistItem` як шаблоном, а не прямим `api()` викликом.

## ErrorBoundary

`<ErrorBoundary>` обгортає root layout. Окремі екрани НЕ повинні мати власних
boundary без явної причини — root ловить все. Якщо вкладений boundary потрібен
(наприклад, експериментальна фіча), використовувати той самий компонент з
`components/shared/ErrorBoundary.tsx`.

## Тестування

- Немає юніт-тестів зараз. Для нової логіки в `utils/*` додати тести через `expo-test` (відкладено).
- Перед мерджем — пройти регресійний чек-лист з `docs/QA_SECURITY_REVIEW.md` секція 4.
