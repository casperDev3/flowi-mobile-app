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

## Правила коду

### Дати
- В пам'яті: `Date` об'єкти
- В AsyncStorage: ISO рядки (`date.toISOString()`)
- При завантаженні: `new Date(isoString)`
- Завжди використовувати `initialized` прапор перед першим збереженням

### Стилі та UI
- Без неонового підсвічування — тіні: `shadowColor:'#000', shadowOpacity:0.15, shadowRadius:8`
- FAB: `bottom: Platform.OS === 'ios' ? 108 : 88` (відступ від таб-бару)
- ScrollView: `paddingBottom: Platform.OS === 'ios' ? 112 : 92`
- Теми: завжди підтримувати dark/light через `useColorScheme()`
- BlurView замість суцільних карток

### Кольори (акценти по екранах)
- Завдання: `#7C3AED` (фіолетовий)
- Фінанси: `#0EA5E9` (блакитний)
- Час: `#6366F1` (індиго)

### Task → Timer інтеграція
1. `setPendingTask(task.title)` + `router.push('/(tabs)/time')`
2. Time screen: `useFocusEffect` зчитує `pendingTask`, записує в `taskName`, очищує контекст

## Не робити
- Не видаляти `initialized` прапор — захист від перезапису даних при завантаженні
- Не додавати мокап дані — додаток починає порожнім
- Не використовувати яскраві кольорові тіні (glow ефекти)
- Не змінювати мову UI з української
- Не встановлювати пакети без `npx expo install` (для сумісності версій)
