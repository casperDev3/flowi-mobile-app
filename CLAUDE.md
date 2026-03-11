# f-tracking-app — Claude Instructions

## Проект
Expo React Native додаток для відстеження завдань, фінансів та часу.
Мова інтерфейсу — **українська**.

## Стек
- **Expo** ~54, **React Native** 0.81, **expo-router** ~6 (файлова маршрутизація)
- **TypeScript** — обов'язковий для всього коду
- **expo-blur**, **expo-linear-gradient**, **expo-symbols** (SF Symbols, тільки iOS)
- **@react-native-async-storage/async-storage** — локальне зберігання
- **react-native-safe-area-context** — SafeAreaView

## Структура
```
app/
  _layout.tsx          — кореневий layout, обгортає TimerProvider
  (tabs)/
    index.tsx          — екран Завдань
    explore.tsx        — екран Фінансів
    time.tsx           — екран Трекера часу
    settings.tsx       — Налаштування
  notes.tsx            — Нотатник (Stack, відкривається з меню Завдань)
  archive.tsx          — Архів виконаних завдань (Stack, відкривається з меню Завдань)
  projects.tsx         — Проєкти (Stack)
store/
  timer-context.tsx    — контекст для передачі завдання Tasks→Time
  storage.ts           — loadData<T>(key, fallback) / saveData(key, data)
components/
  ui/icon-symbol.ios.tsx  — IconSymbol (SF Symbols через expo-symbols)
```

## Storage ключі
| Ключ | Тип | Опис |
|------|-----|------|
| `'tasks'` | `Task[]` | Завдання (дати як ISO рядки) |
| `'transactions'` | `Transaction[]` | Фінансові транзакції |
| `'time_entries'` | `TimeEntry[]` | Записи трекера часу |
| `'notes'` | `Note[]` | Нотатки (`createdAt`, `updatedAt` як ISO рядки) |

## Правила коду

### Дати
- В пам'яті: `Date` об'єкти
- В AsyncStorage: ISO рядки (`date.toISOString()`)
- При завантаженні: `new Date(isoString)`
- Завжди використовувати `initialized` прапор перед першим збереженням

### Стилі та UI
- Без неонового підсвічування — тіні: `shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8`
- FAB у табах: `bottom: Platform.OS === 'ios' ? 108 : 88` (відступ від таб-бару)
- FAB у Stack-скрінах (notes, archive): `bottom: Platform.OS === 'ios' ? 48 : 28`
- ScrollView у табах: `paddingBottom: Platform.OS === 'ios' ? 112 : 92`
- ScrollView у Stack-скрінах: `paddingBottom: 100`
- Теми: завжди підтримувати dark/light через `useColorScheme()`
- BlurView замість суцільних карток
- Фіксований хедер: виносити за межі ScrollView у `SafeAreaView` — `paddingTop:14, paddingBottom:10/14`

### Кольори (акценти по екранах)
- Завдання: `#7C3AED` (фіолетовий)
- Фінанси: `#0EA5E9` (блакитний)
- Час: `#6366F1` (індиго)
- Нотатки: `#F59E0B` (бурштиновий)
- Архів: `#10B981` (зелений, акцент виконаних завдань)

### Фони по екранах (bg1 / bg2)
- Завдання / Архів: `#0C0C14 / #14121E` dark · `#F4F2FF / #EAE6FF` light
- Фінанси: `#080E18 / #0F1A2E` dark · `#EFF5FF / #E0ECFF` light
- Час: `#0A0C18 / #121525` dark · `#EEF0FF / #E2E5FF` light
- Нотатки: `#100D08 / #1A1510` dark · `#FFFBF4 / #FFF3DC` light

### Опції-дропдаун (Tasks screen)
- Кнопка `ellipsis` в хедері — відкриває `Modal` з `animationType="fade"`
- Оверлей: `rgba(0,0,0,0.45)` dark / `rgba(0,0,0,0.22)` light
- Меню — `BlurView`, `borderRadius:18`, позиція `top: insets.top + 62, right: 16`
- Список пунктів: Режим, Фільтри, Проєкти, Нотатки, Архів
- Кожен пункт має `menuIconBox` (32×32, кольоровий фон) + `menuItemLabel` + індикатор справа
- `useSafeAreaInsets()` — для точної позиції дропдауну
- `hasActiveFilters = filter !== 'active' || sort !== 'deadline' || ...` (базовий стан = 'active')

### Task → Timer інтеграція
1. `setPendingTask(task.title)` + `router.push('/(tabs)/time')`
2. Time screen: `useFocusEffect` зчитує `pendingTask`, записує в `taskName`, очищує контекст

## Не робити
- Не видаляти `initialized` прапор — захист від перезапису даних при завантаженні
- Не додавати мокап дані — додаток починає порожнім
- Не використовувати яскраві кольорові тіні (glow ефекти)
- Не змінювати мову UI з української
- Не встановлювати пакети без `npx expo install` (для сумісності версій)
- Не давати Stack-скрінам (notes, archive) відступ таб-бару — у них немає таб-навігації
- Не рахувати `filter === 'active'` як активний фільтр — це базовий стан за замовчуванням
