# Flowi Design System v2 — мобільний застосунок

> **v2.1 — Liquid Glass + видимі акценти.** Поверх «м'якого мінімалізму» нижче:
> кольоровий mesh-canvas, скляні картки/навігація/модалки й акцент у кожного
> модуля. Розділ [Liquid Glass (v2.1)](#liquid-glass-v21) нижче ПЕРЕКРИВАЄ
> старі правила «градієнти й frosted glass — лише promo/AI» та «таб-бар —
> суцільний surface.card». Решта (типографіка, радіуси, відступи, pill CTA)
> лишається.

«М'який мінімалізм»: холодний світло-сірий canvas, білі картки з великим
радіусом, багато повітря, великі тонкі цифри як головний акцент, чорні
pill-кнопки для головних дій, точкові яскраві акценти (лайм, бурштин, лаванда,
корал). Градієнти й frosted glass — ЛИШЕ для promo- та AI-блоків. Без важких
тіней і рамок: ієрархія через фон, відступи й типографіку.

Темна тема — та сама структура токенів із власними значеннями (не інверсія);
«підйом» поверхні — яскравістю (`surface.elevated`), а не тінню.

Ті самі семантичні назви на вебі (`--ds-<група>-<назва>`) і тут
(`t.<група>.<назва>`, camelCase).

## Де що лежить

| Що | Шлях | Експорт |
|---|---|---|
| Токени | `constants/theme.ts` | `theme` (`theme.light` / `theme.dark`), `radius`, `space`, `shadow`, `type`, `fontFamily`, `fontFor()`, `touchTarget`, типи `DSTheme`, `DSScheme`; легасі `Colors`, `Fonts` |
| Хук | `hooks/use-ds.ts` | `useDS()` → `{ t, isDark, scheme }`; `dsTokens(isDark)`; помічники `ds.*` |
| Примітиви | `components/ds/` (`index.ts`) | `Card`, `PillButton`, `Chip`, `Badge`, `ProgressBar`, `DisplayNumber`, `Skeleton`, `SkeletonCard`, `EmptyState`, `AIBlock`, `AIOrb`, `PromoCard` |
| Палітра екрана (легасі) | `constants/tokens.ts` | `getScreenColors(screen, isDark)`, `Radius`, `Spacing` |
| Радіуси Atlas (легасі) | `constants/atlas.ts` | `Atlas.radius.*` — перепризначено на шкалу DS |

`useDS()` бере схему з `store/theme-context` (вибір користувача «світла/темна/
системна» має пріоритет над системою) — так само, як `useColorScheme()`.

## Кольори

| Токен (`t.…`) | Світла | Темна | Для чого |
|---|---|---|---|
| `bg.canvas` | `#F1F1F3` | `#0D0D0F` | фон екрана |
| `surface.card` | `#FFFFFF` | `#17171A` | картки, таб-бар, сайдбар |
| `surface.subtle` | `#F5F5F7` | `#202024` | інпути, чипи, неактивні таби, вкладені блоки |
| `surface.elevated` | `#FFFFFF` | `#1E1E22` | поповери, плаваючі панелі |
| `surface.overlay` | `rgba(17,17,19,.40)` | `rgba(0,0,0,.60)` | затемнення під модалкою |
| `surface.glass` | `rgba(255,255,255,.72)` | `rgba(23,23,26,.72)` | frosted (лише promo/AI) |
| `border.hairline` | `#E8E8EC` | `#2A2A2F` | роздільники — мінімально |
| `text.primary` | `#111113` | `#F4F4F5` | основний текст |
| `text.secondary` | `#6B6B73` | `#A1A1AA` | підписи, мета, caption |
| `text.muted` | `#A1A1AA` | `#6B6B73` | ЛИШЕ placeholder / disabled / декор (< 4.5:1!) |
| `text.onAction` | `#FFFFFF` | `#111113` | текст на `action.primary` |
| `text.onAccent` | `#111113` | `#111113` | текст на lime/amber/lavender |
| `action.primary` | `#111113` | `#F4F4F5` | pill-кнопка головної дії, активний таб |
| `action.primaryHover` | `#2A2A2E` | `#FFFFFF` | hover (iPad-курсор/веб) |
| `action.primaryPressed` | `#000000` | `#D4D4D8` | pressed |
| `action.secondary` / `secondaryText` | `#F5F5F7` / `#111113` | `#202024` / `#F4F4F5` | вторинна кнопка |
| `accent.lime` | `#DDF54A` | `#CDEB3A` | бейджі значень на графіках, активний стовпець |
| `accent.amber` | `#F6B93B` | `#F2B135` | прогрес-бари, gauge, тултіпи, «7 днів» |
| `accent.lavender` | `#B8A4F8` | `#B8A4F8` | AI-блоки, асистент, focus ring |
| `accent.lavenderSoft` | `#EDE6FF` | `rgba(184,164,248,.22)` | тло AI-чипів |
| `accent.coral` | `#E8543F` | `#E8543F` | тіки-індикатори, високий пріоритет, алерти |
| `status.success` | `#22A55B` | `#2FBF6C` | |
| `status.warning` | `#F6B93B` | `#F2B135` | |
| `status.danger` | `#E8543F` | `#EF6450` | |
| `status.info` | `#4F7CF7` | `#6A90FA` | |
| `focus.ring` | `#B8A4F8` | `#B8A4F8` | 2px рамка фокусу |
| `state.disabledBg` / `disabledText` | `#F5F5F7` / `#A1A1AA` | `#1A1A1D` / `#52525B` | |
| `skeleton.base` / `highlight` | `#ECECEF` / `#F7F7F9` | `#1E1E22` / `#26262B` | |

Градієнти — масиви для `expo-linear-gradient` (`colors={t.gradient.x}`):

| Токен | Світла | Темна | Лише для |
|---|---|---|---|
| `gradient.iridescent` | `#CFE3FF → #F6D9F0 → #FFE3B8` | `#1E3A66 → #5A2752 → #6B4419` (+ `iridescentGlow` 15%) | promo («Upgrade to Pro») з BlurView |
| `gradient.aiOrb` | `#7B5CFF → #FF7AC6 → #FFB86B` | те саме | сфера асистента |
| `gradient.aiSurface` | `#EDE6FF → #F6F1FF` | `rgba(123,92,255,.25) → rgba(184,164,248,.12)` | тло AI-блоків |

## Форма, відступи, глибина

- `radius` (зменшено 2026-11-01): `card` 16, `cardCompact` 14, `nested` 12, `nestedCompact` 10, `control` 10, `pill` 999 (кнопки, чипи, аватари).
- `space`: 1→4, 2→8, 3→12, 4→16, 5→20, 6→24, 8→32, 10→40, 12→48; `cardPadding` 24 / `cardPaddingCompact` 20; `cardGap` 16 / `cardGapCompact` 12. На телефоні — compact-варіанти.
- `shadow[scheme].card` / `.popover` — розгорнути у стиль (`...shadow[scheme].card`). Світла — м'яка тінь; темна `card` — без тіні, лише світлий верхній край 4%.
- `touchTarget` = 44.

Легасі-шкали тепер на DS:
- `Atlas.radius`: small 6, medium 10, large 10, xlarge 14, xxlarge 16 (зменшено 2026-11-01; жорстко прописані `borderRadius` у екранах не чіпались).
- `Radius` (tokens.ts): sm 12, md 14, lg 16, xl 20, xxl 24, pill 999.

## Типографіка

Manrope (кирилиця), вантажиться в `app/_layout.tsx` (300/400/500/600/700; рендер
чекає не довше 2.5 с, далі — системний шрифт). **Вага задається родиною, не
`fontWeight`**: `fontFamily.light|regular|medium|semibold|bold` або
`fontFor('600')`. Поєднання кастомної родини з `fontWeight` на Android
ігнорується, а на iOS може дати синтетичний жирний.

| Стиль (`type.…`) | Розмір / родина | Примітка |
|---|---|---|
| `display` | 48 / Light 300, tracking −2% | KPI, лічильники, годинник; `tabular-nums` |
| `displaySm` | 40 / Light | вузькі картки |
| `displayUnit` | 22 / Regular | одиниця біля числа (k, s, /5, ₴) — колір `text.secondary` |
| `h1` | 32 / Medium 500 | заголовок сторінки |
| `h2` | 16 / SemiBold 600 | заголовок картки |
| `body` / `bodyMedium` | 14 / Regular / Medium | |
| `caption` | 12 / Regular | колір `text.secondary` |
| `label` | 14 / SemiBold | підпис кнопки/чипа |
| `numeric` | — | домішка `fontVariant: ['tabular-nums']` для будь-якого числа |

Кольору в `type.*` немає — додавайте `{ color: t.text.primary }`.

## Акценти екранів (`getScreenColors`)

Усі екрани тепер ділять `bg1 = bg2 = bg.canvas`, `card = surface.card`
(непрозорий), `border = border.hairline`, `text = text.primary`,
`sub = text.secondary`, `subStrong` = `#3F3F46` / `#D4D4D8`.
Акцент лишився (завжди `#RRGGBB`, бо споживачі дописують альфу `accent + '22'`):

| Екран | Світла | Темна | Чому |
|---|---|---|---|
| tasks, auth, time | `#6D4CF5` | `#8B6CFF` | глибока лаванда: `accent.lavender` не тримає білий підпис/дрібний текст (≈2:1) |
| finance | `status.info` | `status.info` | |
| health | `status.success` | `status.success` | |
| notes, containers | `accent.amber` | `accent.amber` | |
| settings | `text.secondary` | `text.secondary` | нейтральний |

Головні дії в мігрованих екранах — `action.primary` pill, а не акцент екрана.

## Навігація

- Таб-бар (телефон): суцільний `surface.card` (`TAB_BAR_BG` у `constants/nav.ts`), без блюру й рамки; активна іконка — у pill `action.primary` з `text.onAction`, підписи `text.primary` / `text.secondary` (`TAB_BAR_TINT`). Контраст охороняє `__tests__/audit-tabbar-a11y.test.tsx`.
- Сайдбар і рейка (планшет, `NavSidebar`, `ProjectSidebar`): `surface.card` без правої рамки, активний пункт — pill `action.primary` + `text.onAction`.

## Рецепт міграції екрана

1. Тема:
   ```tsx
   // було
   const isDark = useColorScheme() === 'dark';
   // стало
   import { useDS } from '@/hooks/use-ds';
   const { t, isDark } = useDS();
   ```
   Поза компонентом (StyleSheet-фабрика, утиліта з `isDark`) — `dsTokens(isDark)`.
2. Замінити інлайн-кольори семантикою:
   | Було (типово) | Стало |
   |---|---|
   | `isDark ? '#0C0C14' : '#F4F2FF'` (фон, градієнт bg1/bg2) | `t.bg.canvas` (градієнт фону прибрати) |
   | `isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)'` + BlurView | `t.surface.card` (непрозора, без BlurView) |
   | `isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)'` (рамка) | прибрати рамку; за потреби — `t.border.hairline` |
   | `isDark ? '#F0EEFF' : '#1A1433'` | `t.text.primary` |
   | `rgba(…,0.55–0.62)` підписи | `t.text.secondary` |
   | placeholderTextColor | `t.text.muted` |
   | інпут/чип фон `rgba(…,0.05)` | `t.surface.subtle` |
   | кнопка головної дії `backgroundColor: accent` + `'#fff'` | `<PillButton>` або `ds.pillButton(t)` + `ds.pillText(t)` |
   | `'#EF4444'`, `'#10B981'`, `'#F59E0B'`, `'#3B82F6'` | `t.status.danger/success/warning/info` |
   | прогрес-бар | `<ProgressBar value=… />` (amber) |
3. Картки: `<Card>` (або `ds.card(t, isDark)`), радіус 20–24, без `borderWidth`.
4. Числа: великі KPI → `<DisplayNumber value unit caption />`; будь-яке число — `type.numeric`.
5. Порожні стани → `<EmptyState>`; завантаження → `<Skeleton>` / `<SkeletonCard>`.
6. AI-блоки → `<AIBlock>`; promo → `<PromoCard>`. Більше ніде градієнтів.
7. НЕ чіпати: логіку, дані, маршрути, ключі i18n, `accessibilityLabel` / `testID` / `accessibilityRole` / `hitSlop`; зона дотику ≥ 44.

## Примітиви — API

```tsx
import { Card, PillButton, Chip, Badge, ProgressBar, DisplayNumber,
         Skeleton, SkeletonCard, EmptyState, AIBlock, AIOrb, PromoCard } from '@/components/ds';

<Card compact? padded? elevated? nested? style />                 // ViewProps
<PillButton label variant="primary|secondary|ghost" size="md|sm" icon? iconRight?
            loading? fullWidth? disabled? onPress testID accessibilityLabel? />
<Chip label selected? icon? count? onPress disabled? />
<Badge label tone="lime|amber|lavender|coral|neutral" accessibilityLabel? />
<ProgressBar value={0..1} tone="amber|lime|lavender|coral|success|primary" height? accessibilityLabel? />
<DisplayNumber value unit? unitPosition="after|before" size="sm|md|lg" caption? color? accessibilityLabel? />
<Skeleton width? height? radius? />   <SkeletonCard />
<EmptyState icon? title caption? actionLabel? onAction? actionTestID? />
<AIBlock title? orb? compact?>…</AIBlock>     <AIOrb size? />
<PromoCard title caption? actionLabel? onAction?>…</PromoCard>
```

Помічники стилів (`hooks/use-ds.ts`): `ds.card(t, isDark, {compact, padded})`,
`ds.nested(t, compact)`, `ds.input(t)`, `ds.pillButton(t, variant)`,
`ds.pillText(t, variant)`, `ds.chip(t, active)`, `ds.chipText(t, active)`,
`ds.screen(t)`, `ds.focusRing(t)`.


---

## Liquid Glass (v2.1)

Напівпрозорі поверхні над кольоровою сіткою (mesh) — у **світлій і темній**
темах. Скло = блюр + напівпрозора заливка + спекулярний обідок 1px (світліший
верхній край) + внутрішній відблиск + м'яка розсіяна тінь. Великі радіуси
(24 картки, 999 pill) лишаються. Головна CTA — суцільна `action.primary` pill
(якір контрасту), за бажання з м'яким світінням акценту.

### Як рендериться (components/ds/Glass.tsx)

| Умова | Що малюється |
|---|---|
| «Зменшити прозорість» (iOS) / `prefers-reduced-transparency` (веб) | суцільна `glass.solid.*` (= surface.card) + hairline, без блюру |
| iOS 26+ із нативним Liquid Glass (`expo-glass-effect`: `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()`) | `<GlassView glassEffectStyle="regular">` — справжнє заломлення |
| iOS < 26 (або збірка без нативного модуля) | `expo-blur` `<BlurView tint="systemUltraThinMaterial…">` + заливка + обідок + відблиск |
| Android / веб | напівпрозора заливка + обідок (BlurView на Android дорогий) |
| `variant="subtle"` | ніколи не блюрить — вкладене скло для рядків у картці, інпутів |

`expo-glass-effect` (~0.1.10) встановлено через `npx expo install`. Це нативний
модуль: справжнє скло з'явиться після **нової dev/EAS-збірки**; до того
`Glass.tsx` перевіряє `requireOptionalNativeModule('ExpoGlassEffect')` і тихо
бере BlurView-шлях.

### Токени скла (`constants/theme.ts` → `glass.light` / `glass.dark`, у компоненті `useDS().g`)

| Токен (`g.…`) | Світла | Темна | Для чого |
|---|---|---|---|
| `surface` | `rgba(255,255,255,.55)` | `rgba(30,30,36,.52)` | картки, сайдбар |
| `surfaceStrong` | `rgba(255,255,255,.72)` | `rgba(32,32,38,.70)` | модалки, поповери, шапки, таб-бар — під щільний текст |
| `surfaceSubtle` | `rgba(255,255,255,.38)` | `rgba(255,255,255,.06)` | вкладене: рядки, інпути, чипи, доріжки прогресу |
| `rim` / `rimShade` | `rgba(255,255,255,.75)` / `rgba(17,17,19,.06)` | `rgba(255,255,255,.14)` / `rgba(0,0,0,.4)` | обідок: верх/боки `rim`, низ `rimShade` |
| `highlight` | `rgba(255,255,255,.9)` | `rgba(255,255,255,.16)` | внутрішній верхній відблиск (градієнт → 0) |
| `blur` / `saturate` | 24 / 1.8 | 28 / 1.6 | паритет із вебом (`backdrop-filter`) |
| `blurIntensity` / `blurTint` | 40 / `systemUltraThinMaterialLight` | 45 / `…Dark` | expo-blur |
| `shadow` | `#281E6E` 10%, r16, y8 | `#000` 45%, r16, y8 | iOS; Android — без elevation (просвічує крізь скло) |
| `solid.card/strong/subtle` | `#FFF` / `#FFF` / `#F5F5F7` | `#17171A` / `#1E1E22` / `#202024` | фолбек «Зменшити прозорість» |
| `mesh.base` | `#F1F0F5` | `#0D0D10` | основа canvas під плямами |
| `mesh.blobs` | лаванда 38% ↖, лайм 30% ↗, бурштин 26% ↘, синій 20% ↙, корал 12% → | фіолет 32% ↖, синій 22% ↗, корал 14% ↘, лайм 10% ↙, бурштин 10% · | радіальні плями `<MeshBackground/>` |

### Акценти (`g.accent[x]`, x = `lime | amber | lavender | coral | info | success`)

Кожен акцент — набір ролей (контраст перевірено на композиті скла над mesh):

| Роль | Для чого | Контраст |
|---|---|---|
| `solid` | велика заливка під `onSolid` (#111113): вибраний чип, `variant="accent"` кнопка, бейдж | ≥ 4.99:1 (обидві теми) |
| `fill` | тонкі індикатори: прогрес, кільця, графіки, крапки | ≥ 3:1 на склі |
| `ink` | іконки й текст акцентом на склі; `#RRGGBB` (можна `ink + '22'`) | світла ≥ 4.4–5.4, темна ≥ 6.4 |
| `tint` | rgba-«змивка»: KPI-картка, icon-chip, активний пункт навігації | — |
| `glow` | `shadowColor` світіння (активний пункт, головна CTA) | — |

| Акцент | solid (світла/темна) | fill світла | ink світла / темна |
|---|---|---|---|
| lavender | `#B8A4F8` | `#8B6CFF` | `#6D4CF5` / `#B8A4F8` |
| lime | `#DDF54A` / `#CDEB3A` | `#6E8C00` | `#4F6B00` / `#CDEB3A` |
| amber | `#F6B93B` / `#F2B135` | `#B87800` | `#8F5400` / `#F2B135` |
| coral | `#E8543F` / `#FF8A75` | `#E8543F` | `#C23A24` / `#FF8A75` |
| info | `#4F7CF7` / `#8FAEFF` | `#4F7CF7` | `#2F5BD8` / `#8FAEFF` |
| success | `#22A55B` / `#4CD787` | `#1E9450` | `#127536` / `#4CD787` |

**Акцент модуля** (`moduleAccent` у theme.ts): today/tasks/projects/settings/auth/archive → lavender ·
finance → lime · health/workouts → coral · time/notes/containers/ideas → amber ·
meetings/calendar/integrations → info · training/menu → success.

Правило: **один акцент на картку, 2–3 на кластер екрана** — кольорово, не веселка.
Текст на склі — завжди `text.primary` / `text.secondary` (≥ 4.5:1: secondary ≈ 4.7 на
світлому склі, ≈ 5.7 на темному); під щільним текстом — `strong`.

### Примітиви v2.1 — API

```tsx
import { GlassScreen, GlassSurface, GlassBackdrop, MeshBackground, IconChip, SectionHeader,
         AccentProvider, useModuleAccent, useResolvedAccent, isNativeLiquidGlass,
         Card, Chip, PillButton, Badge, ProgressBar, AIBlock, PromoCard, EmptyState } from '@/components/ds';

// Корінь екрана: mesh + акцент модуля для всіх примітивів усередині
<GlassScreen module="finance" mesh? meshIntensity? accent? style>…</GlassScreen>
<MeshBackground intensity? style? />          // absoluteFill; замість <View absoluteFill bg={c.bg1}/>
<AccentProvider module="health" | accent="coral">…</AccentProvider>

<GlassSurface variant="card|strong|subtle|pill" radius? tint?={true|'lime'…} glow?={true|'lime'…}
              blur? shadow? interactive? style testID …ViewProps />
<GlassBackdrop intensityBoost? />            // лише «матеріал» (native glass / BlurView) для власних панелей

<Card compact? padded? elevated? nested? tint? glow? blur? solid? style />
   // elevated → strong; nested → subtle без блюру; blur={false} — картки в довгих списках
<IconChip icon accent? size="sm|md|lg" solid? accessibilityLabel? />   // тонований скляний кружок, іконка ink
<SectionHeader title accent? actionLabel? onAction? actionTestID? />   // крапка fill + h2
<Chip … accent?={GlassAccent|null} />          // вибраний = solid акценту модуля; null → чорна pill
<PillButton … variant="primary|secondary|ghost|accent" accent? glow? />  // secondary = скляна pill
<Badge tone="lime|amber|lavender|coral|info|success|accent|neutral" />
<ProgressBar tone?="accent|amber|lime|lavender|coral|info|success|primary" />  // за замовч. — акцент модуля
```

Хук і помічники:

```ts
const { t, g, isDark, scheme, reduceTransparency } = useDS();
glassTokens(isDark)            // поза хуками
accentRoles('lime', isDark)    // ролі одного акценту
ds.glass(isDark, 'card'|'strong'|'subtle', reduceTransparency?)  // заливка + обідок, будь-яка форма
ds.accentWash(isDark, 'lime') // тонована змивка
ds.card(t, isDark, {compact, padded, reduceTransparency})          // скляна картка БЕЗ блюру
ds.nested / ds.input / ds.chip(t, active, accent?) / ds.chipText(t, active, accent?) — тепер скло
ds.pillButton(t, 'secondary')  // скляна pill
ds.screen(t)                   // flex:1 + mesh.base (плями — <MeshBackground/>)
```

`getScreenColors(screen, isDark)` (constants/tokens.ts) у v2.1:
`bg1 = bg2 = glass.mesh.base`, **`card` = `glass.surface` (rgba!)**, нове
`cardSolid` = surface.card, `accent` = `ink` акценту модуля (`#RRGGBB`),
нові `onAccent` (світла `#FFFFFF`, темна `#111113`), `accentTint` (rgba),
`accentName` (`GlassAccent`). Екрани: tasks/auth/settings → lavender,
time/notes/containers → amber, finance → lime, health → coral.

### Навігація v2.1

- **Таб-бар (телефон)**: `TabBarGlass` у `app/(tabs)/_layout.tsx` — `GlassBackdrop` (iOS 26 нативне скло / BlurView) + `surfaceStrong` (Android — майже непрозора 0.9) + верхній відблиск і обідок. Активна вкладка — скляна pill, тонована **акцентом модуля** вкладки (Сьогодні/Завдання/Налаштування — lavender, Фінанси — lime, Здоров'я — coral) + іконка `ink` + світіння (iOS). «Зменшити прозорість» → суцільне `TAB_BAR_BG` і pill `solid` + `onSolid`.
- **Сайдбар / рейка (планшет)**: `NavSidebar` / `ProjectSidebar` — скло над глобальним mesh (`GlassBackdrop` + `g.surface` + обідок праворуч). Активний пункт — тонована pill акценту модуля пункту (`navItemAccent(item)` з NavSidebar), іконка `ink`, підпис `text.primary` SemiBold; у просторі проєкту — акцент «Проєкти» (lavender).
- **Глобальний mesh**: `app/_layout.tsx` малює `<MeshBackground/>` під сайдбаром і Stack; тема навігації — `mesh.base`. Екрани все одно малюють свій mesh (непрозоро), щоб native-stack перехід не просвічував попередній екран.

### Рецепт міграції екрана на v2.1

1. Фон: `<View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg1 }]} />` → `<MeshBackground />`;
   або корінь екрана → `<GlassScreen module="…">` (дає і mesh, і акцент примітивам).
2. Картки: `<Card>` (уже скло). Інлайн `backgroundColor: c.card` теж стає склом (rgba) —
   додайте обідок: `...ds.glass(isDark, 'card')` замість `backgroundColor`. Картки в
   `FlatList`/довгих списках — `<Card blur={false}>`; рядки всередині картки — `<Card nested>`
   або `ds.glass(isDark, 'subtle')` (без блюру).
3. Модалки/аркуші/поповери — `<GlassSurface variant="strong">` або `ds.glass(isDark,'strong')`
   (щільний текст ≥ 4.5:1). Шапки — `variant="strong"` / `GlassBackdrop` + `g.surfaceStrong`.
4. Інпути/чипи — `ds.input(t, isDark)` / `<Chip>` (скло subtle; вибраний — акцент модуля).
5. Акценти **видимі**: іконки розділів → `<IconChip icon=… />`; головна KPI-картка →
   `<Card tint>` (+ `glow` для однієї на екран); прогрес/кільця/графіки → `g.accent[x].fill`
   або `<ProgressBar />`; заголовки секцій → `<SectionHeader>`; посилання/акцентний текст →
   `c.accent` / `g.accent[x].ink`.
6. Текст на заливці акцентом: `backgroundColor: c.accent` → колір тексту **`c.onAccent`**
   (не `'#fff'`: у темній ink світлий). Краще — `<PillButton variant="accent">` (solid + #111113).
7. Головна дія — як і раніше `<PillButton>` primary (суцільна); `glow` — для однієї на екран.
8. Не вкладати блюр у блюр: усередині `GlassSurface` з блюром — лише `subtle`/`ds.glass` без блюру.
9. «Зменшити прозорість» обробляють примітиви самі; власні скляні стилі — через
   `ds.glass(isDark, v, reduceTransparency)` з `useDS().reduceTransparency`.
10. Як і раніше НЕ чіпати логіку, i18n-ключі, `accessibilityLabel`/`testID`/`hitSlop`.


---

## Omni layout (v2.2)

> Структура з референсу «Omni — Task & Project Management Dashboard» (Behance
> 251900741) поверх DS v2.1. Токени, Manrope, Liquid Glass, акценти модулів,
> червоні витрати / зелені доходи — без змін. Шрифт Omni (Outfit) не має
> кирилиці — лишається Manrope. Ті самі назви компонентів, що й на вебі.
>
> **Перекриває «Навігація v2.1»:** активна вкладка таб-бару й активний пункт
> сайдбара (особистого й проєктного) — більше НЕ тонована pill акценту модуля, а
> суцільна чорна pill `action.primary` + `text.onAction` (у темній — біла).
> Акцент модуля лишився на icon-chip пунктів сайдбара.

### Принципи

- **Скло — лише функціональний шар** (Apple HIG): шапка, таб-бар, сайдбар,
  модалки. **Вміст — на суцільних bento-картках** (`BentoCard`: surface.card +
  м'яка тінь, без рамок).
- **«Ви тут» = чорна pill** (`action.primary`, у темній — біла) + `text.onAction`:
  активна вкладка таб-бару, активний пункт сайдбара, активна `SectionTabs`.
  Акцент модуля — на icon-chip (тонований кружок + ink-іконка), не на pill.
- **Фірмовий градієнт** `t.gradient.signature` (світла `#7F0BE8 → #F4AA2D`,
  темна `#9B3BFF → #F7B84A`) — ЛИШЕ підсвітка даних: активний стовпець,
  сегментний прогрес, повзунок таймлайну, AI-сфера. Не фон і не текст.
- **Одна «темна» картка на сторінку** (`BentoCard variant="dark"`, токени
  `t.featured.*`: світла `#11141B`, темна `#2C2C2E`; текст ≥ 15:1 / ≥ 7:1;
  CTA — біла pill). На «Сьогодні» — зустрічі.
- KPI — великі тонкі числа (Manrope Light 300, tabular).

### Каркас за розміром вікна

| Вікно | Шапка (`AppHeader`) | Навігація | Вміст |
|---|---|---|---|
| Телефон (compact) | `[☰] Заголовок … [дії] [🔔] [аватар]`; KPI — горизонтальна стрічка під заголовком | нижній таб-бар (5 головних, чорна pill) + **шухляда сайдбара** (☰ → `SidebarDrawer`, усі модулі) | bento 1 колонка |
| Планшет medium | рядок інструментів `[пошук] … [таймер] [дії] [🔔] [аватар+ім'я ⌄]`, під ним H1; KPI рядком під H1 | сайдбар-рейка 76pt (розгортається) | bento 2 колонки |
| Планшет expanded | як medium, KPI праворуч від H1 (як в Omni) | повний сайдбар 232pt | bento 2–3 колонки |

Аватар відкриває `AccountSheet` (Керування акаунтом · Сповіщення · Налаштування ·
тема Системна/Світла/Темна — той самий `store/theme-context`). Дзвіник →
`/notifications` (крапка непрочитаних). Таймер-pill (лише планшет, лише коли
йдуть таймери) → «Час».

### Компоненти — API

```tsx
import { AppHeader } from '@/components/shared/AppHeader';
import { SidebarDrawer, drawerWidthFor } from '@/components/shared/SidebarDrawer';
import { AccountSheet } from '@/components/shared/AccountSheet';
import { NavSidebar } from '@/components/shared/NavSidebar';
import {
  PageHeader, KpiCounter, SectionTabs, BentoGrid, BentoCard, BentoCardHeader,
  BentoArrowButton, BentoPeriodPill, useBentoColors, SegmentedProgress, HatchedBars,
  Tag, PriorityFlag, Avatar, AvatarStack, initialsOf, SignatureGradient, signatureAt,
} from '@/components/ds';

<AppHeader title eyebrow? subtitle? kpis?={<>{<KpiCounter/>…}</>} actions? showMenu?=true
           onSearch? searchLabel? back? titleStyle? paddingBottom?>{/* SectionTabs… */}</AppHeader>
// Побудований на ScreenHeader (useTopInset, стеля Dynamic Type) — нові слоти ScreenHeader:
<ScreenHeader … leading?={<HeaderButton/>} toolbar?={<View/>} />

<NavSidebar pathname isDark variant?="docked|drawer" width? onNavigate? onClose? />   // docked: шпилька, оверлей, закріплені
<SidebarDrawer visible onClose />          // Modal, ковзання зліва (Reduce Motion — без анімації)
<AccountSheet visible onClose />

<PageHeader title? subtitle? kpis? action? bleed? />   // телефон: KPI-стрічка; планшет: ряд
<KpiCounter value label delta? deltaTone?="up|down|neutral" valueColor? onPress? accessibilityLabel? />
<SectionTabs tabs={[{key,label,icon?,count?,testID?}]} value onChange accessibilityLabel? bleed? />

<BentoGrid columns?={{compact:1,medium:2,expanded:3}} gap?>
  <BentoCard variant?="default|dark|ai" title? icon? accent? subtitle? headerRight?
             onPress? accessibilityLabel? span?={2|'full'} compact? padded? testID?>…</BentoCard>
</BentoGrid>
<BentoArrowButton onPress? accessibilityLabel? />   // без onPress — декоративний ↗ (картка сама кнопка)
<BentoPeriodPill label onPress? />                  // «Цей місяць ⌄»
const bc = useBentoColors();                        // text / textSecondary / nestedBg / actionBg… поточної картки

<SegmentedProgress value={0..1} segments?=15 height?=10 label? showValue? accessibilityLabel? />
<HatchedBars data={[{label,value,display?}]} activeIndex? onSelect? showTooltip?=true height?=120 accessibilityLabel />
<Tag label accent? size?="sm|md" />    <PriorityFlag priority="high|medium|low" label? />
<AvatarStack people={[{id,name,accent?}]} max?=3 size?=28 ringColor? moreLabel? />
<SignatureGradient direction?="horizontal|vertical" style />   signatureAt(t, 0..1) → '#RRGGBB'
```

Нові токени (`constants/theme.ts`): `t.gradient.signature`, `t.gradient.aiCard`,
`t.featured.{bg,text,textSecondary,action,actionText,hairline}`.

### Доступність

- Цілі дотику ≥ 44: кнопки шапки 36 + `HEADER_BUTTON_HIT_SLOP`, pill-таби 36 + hitSlop 4,
  ↗ 36 + 4, пункти сайдбара/шухляди 44, рядки AccountSheet 48.
- Ролі: `SectionTabs` — tablist/tab+selected; сайдбар — menu/menuitem+selected;
  `SegmentedProgress` — progressbar зі значенням; `HatchedBars` — один елемент
  з підписом (або кнопки-колонки з onSelect); `AvatarStack` — один елемент «імена, +N».
- Dynamic Type: KPI ×1.3, заголовки карток ×1.6, підписи стовпців ×1.3 (стелі — щоб
  не ламати ряд), решта тексту масштабується.
- «Зменшити прозорість»: шапка/кнопки/таб-бар — суцільні; Tag — solid + onSolid.
  «Зменшити рух»: шухляда й поява секцій — без анімації.

### Сторінка-зразок: «Сьогодні»

`AppHeader` (заголовок — контекст: «Сьогодні»/дата, без привітання; SyncBadge) з KPI: активні завдання (дельта
«N прострочено», червона), наради сьогодні, відстежений час — усе з реальних
даних, лише ввімкнених модулів, лише після першого читання. Секції — `BentoCard`
у тому самому порядку правила власника й тій самій `TodaySectionGrid`:
здоров'я (↗) + швидкі дії (суцільні плитки) → фінанси | час (стат-плитка:
число + підпис + зміна, без міні-стовпців) → звички (`SegmentedProgress` дня) →
завдання (бейджі прострочено/активних) → зустрічі (**темна** картка: найближча
крупно, біла pill → календар) → оплати.

### Рецепт для решти екранів

1. Шапка: `ScreenHeader` → `AppHeader` (ті самі `title`/`eyebrow`/`back`/`actions`);
   KPI — `kpis={<>…<KpiCounter/></>}`.
2. Перемикачі розділу (Операції/Рахунки/Звіти, Список/Дошка/Календар) → `SectionTabs`
   у `children` AppHeader або першим рядком вмісту.
3. Вміст → `BentoGrid` + `BentoCard` (шапка `title`+`icon`+`accent`, праворуч
   `BentoPeriodPill`/`BentoArrowButton`). Рядки всередині — `useBentoColors().nestedBg`
   або `t.surface.subtle` (НЕ скляний subtle — на білій картці він зникає).
4. Прогрес → `SegmentedProgress`; тижневі/місячні ряди → `HatchedBars`; мітки → `Tag`;
   пріоритет → `PriorityFlag`; учасники → `AvatarStack`.
5. Одна найважливіша «подія» сторінки → `BentoCard variant="dark"`; `variant="ai"` після unslop
   — звичайна суцільна картка (без змивки й сфери).

## Layout System (v2.4)

> П'ять зон із `Layout_System.pdf` власника поверх DS v2.3 (токени, Manrope,
> чорні pill, Liquid Glass лише на функціональному шарі, суцільний вміст,
> акценти модулів). Кольори зон у PDF — ЛИШЕ анотація: у UI зон не фарбуємо.
> Ті самі назви компонентів і параметрів, що на вебі (`components/layout-zones`).
>
> **Перекриває «Omni layout → Каркас»:** нижній бар телефона — ЧОТИРИ розділи
> (Сьогодні · Задачі · Фінанси · Здоров'я); Налаштування, Час і решта — у
> шухляді ☰. Маршрут `/(tabs)/settings` лишається (вкладка `href: null`).

### Зони

| Зона | Що | Телефон | iPad (не compact) |
|---|---|---|---|
| Header | лого/заголовок, пошук, «Список / Колонки», акаунт | `AppHeader`: `[☰] … [пошук] [дії] [🔔] [аватар]` + H1 | тонка смуга `[пошук] [Список/Колонки] … [акаунт]` (`viewSwitch`) |
| Navigation | меню модулів | 4 вкладки + шухляда ☰ (`SidebarDrawer`) | рейка/сайдбар (`NavSidebar`, app/_layout.tsx) |
| Static | контекст: KPI, зустрічі дня | вкладка «Сьогодні» | колонка ліворуч від main лише від вікна **1280pt** і коли main за типових ширин лишається ≥ `zone.mainMin`; інакше — «Сьогодні». Ширину тягнуть межею (11.2026) |
| Main | список / канбан | на весь екран; «+» праворуч над баром | `flex:1`; «+» праворуч унизу; три крапки панелей під нею. Правило «головна завжди найширша» **знято** (11.2026) |
| Dynamic | деталі вибраного запису (вкладки картки) | **нижній аркуш** ~60% → свайп угору на весь екран | панель праворуч після вибору, ✕ закриває (список розтягується); не вміщається (iPad mini портрет, Split View) → аркуш |

Стан у **параметрах маршруту**: `?task=<id>&view=list|columns&panel=open|closed`
(старі посилання без параметрів працюють — типові значення з налаштувань пристрою).
Вибір людини (режим, статична/динамічна панель) — локально, AsyncStorage
`layout_zones_prefs_v1` (як `projects_list_prefs_v1`: звичка пристрою, НЕ
`ui_preferences`; у синк, outbox і бекапи не йде, даних акаунта не містить).

### Зміна ширини зон (планшет, 11.2026)

Між static│main і main│dynamic стоять межі `ZoneResizeHandle` (смуга 16pt, ручка
3×36 `text.secondary`, під час тягнення — `text.primary` 4×56). Рішення власника —
**без обмежень**: старі межі (static 200–360, dynamic 300–600) і «головна найширша»
прибрано. Лишилась технічна підлога **`ZONE_MIN_WIDTH = 120pt`** для КОЖНОЇ зони
(і головної теж), щоб зона не зникла під ручкою; сховати зону цілком — трьома
крапками панелей.

- *Чи* стоїть зона поруч (панель/аркуш, статична) вирішують ТИПОВІ ширини
  (`zoneWidths`); тягнення змінює лише розмір видимих зон, не їхню появу.
- Не вміщається (поворот, Split View) — стискається спершу статична, потім
  панель, до підлоги; збережене людиною не переписується.
- Подвійний дотик по межі — типова ширина. VoiceOver: `adjustable`,
  increment/decrement ±`ZONE_KEY_STEP` (16pt), дія «Типова ширина».
- Ширини — локально на пристрої, AsyncStorage `layout_zone_sizes_v1`
  (`components/layout-zones/zoneSizes.ts`), ключ — проп `sizeKey` ZoneLayout
  (за замовч. `default`, спільний для розділів). `resizable={false}` вимикає межі.
- Телефон — без змін (зон поруч немає).

```ts
zoneWidths({ windowWidth, screenWidth, wide, wantStatic, wantDynamic, sizes?: { static?, dynamic? }, handles?: { static?, dynamic? } })
resizeZoneWidth(current, delta, maxAvailable?)   // лише підлога 120 і «скільки є місця»
<ZoneLayout … resizable?={true} sizeKey?="default" />
```

### Сайдбар планшета: шпилька й закріплені розділи (11.2026)

- **Шпилька** поруч зі шевроном у шапці повного сайдбара (`pin` / `pin.fill`, 44×44,
  `accessibilityState.selected`). *Закріплений* (= режим `full` у `sidebar-mode`,
  ключ `nav_sidebar_mode`, локально на клас вікна) — стоїть поруч і штовхає вміст,
  сам не згортається. *Незакріплений* — під ним рейка 76pt, а розгорнутий сайдбар
  виїжджає ПОВЕРХ вмісту: `Modal` + `OverlaySurface` («брудне скло», лівий край без
  радіуса) + легке затемнення `OverlayScrim blur={false}` (opacity .45).
  Згортають: тап поза панеллю, перехід на пункт / зміна маршруту, «Назад»
  (Android), жест VoiceOver «Escape», Esc (веб/react-native-web). Панель —
  `accessibilityViewIsModal`; після закриття фокус VoiceOver повертається на
  кнопку «Розгорнути». Відкріпити — сайдбар лишається розгорнутим поверх.
- **Групи планшета** (`tabletNavGroups`): «Сьогодні» (Огляд) — окремою групою без
  заголовка НАД «Роботою»; «Інтеграції» — у кінці «Ще». Маніфест `NAV_GROUPS`
  (шухляда й налаштування телефона) не змінено.
- **Закріплені розділи** (`applyPinnedSections`): одразу під Оглядом, у порядку
  закріплення, з кнопкою-шпилькою праворуч (44×44, «Відкріпити «…»») — тап
  повертає розділ на його місце. У рейці — крихітна шпилька в куті іконки.
  Закріпити: Налаштування → «Закріплені розділи сайдбару» (`/settings-sidebar`,
  рядок лише на планшеті), утримання пункту сайдбара або дія VoiceOver
  «Закріпити». Вимкнені модулі не показуються, навіть закріплені.
  Зберігання — СИНХРОНІЗОВАНЕ поле `ui_preferences.pinnedSections: ModuleId[]`
  (сервер зберігає singleton цілим JSON, обидва клієнти копіюють невідомі поля,
  тож контракт не змінюється; `components/shared/pinned-sections.ts`).

### Токени (`constants/theme.ts`)

`zone` (паритет із вебом `--ds-zone-*`): `mainMin 360` · `dynamicCompact 340`
(вікно < `dynamicCompactBelow 1000`) · `dynamic 380` · `dynamicLarge 440`
(вікно ≥ `dynamicLargeFrom 1180`) · `static 300` · `staticFrom 1280` · `gap 12` ·
`sheetPeek 0.6` · `sheetFull 0.94` · `fab 56` · `fabInset 20` · `bulkBar 56` ·
`swipeAction 76`.

`overlay.light / overlay.dark` (`overlayTokens(isDark)`; веб `--ds-overlay-*`) —
**«брудне скло»** для ВСЬОГО, що поверх вмісту:

| Токен | Світла | Темна |
|---|---|---|
| `fill` (поверх блюру, iOS і веб — CSS `backdrop-filter`) | `rgba(246,246,248,.90)` | `rgba(26,26,30,.92)` |
| `fillNoBlur` (Android, без блюру — непрозора) | `rgba(246,246,248,1)` | `rgba(26,26,30,1)` |
| `solid` («Зменшити прозорість») | `#F6F6F8` | `#1A1A1E` |
| `blurIntensity` / `blurTint` | 90 / `systemThickMaterialLight` | 90 / `systemThickMaterialDark` |
| `noiseOpacity` (зерно `assets/images/overlay-noise.png`) | .035 | .04 |
| `rim` / `rimShade` | `rgba(255,255,255,.85)` / `rgba(17,17,19,.08)` | `rgba(255,255,255,.12)` / `rgba(0,0,0,.45)` |
| `scrim` + `scrimBlurIntensity` | `rgba(17,17,19,.40)` + 18 | `rgba(0,0,0,.60)` + 18 |

Контраст: `text.secondary` на `solid` ≥ 4.9:1 (світла), ≥ 7:1 (темна). Деструктивний
текст на оверлеї — `g.accent.coral.ink`, не `status.danger` (≈ 3.4:1).
`glassOf(t).sheet` (усі наявні аркуші/меню/поповери) тепер = `overlay.fill`
(Android — `fillNoBlur`; «Зменшити прозорість» — `solid`) — тобто правило
діє глобально, не лише на мігрованих екранах. Нативне Liquid Glass (iOS 26
`GlassView`) для оверлеїв НЕ використовується — воно прозоре за задумом.

**Важливо:** сама заливка `glassOf(t).sheet` = 0.90 на iOS — без блюру крізь неї
видно «привид» тексту (≈1.1:1). Тому КОЖЕН контейнер оверлею мусить мати
матеріал: `<OverlaySurface>` або першою дитиною `<OverlayMaterial isDark radius>`;
`GlassBackdrop` (Liquid Glass) і `ds.glass(…,'strong')`/`c.gl.strong` (0.72)
для оверлеїв не годяться.

### Компоненти — API

```tsx
import {
  ZoneLayout, zoneWidths, BottomSheet, SwipeRow, KanbanPager, BulkActionBar,
  ZoneSkeleton, ZoneEmpty, ZoneError, ViewModeSwitch, PanelToggles,
  OverlaySurface, OverlayScrim, OverlayMaterial, overlayFillStyle,
  useZoneState, useZonePrefs, useActiveZone, setZonePrefs,
} from '@/components/layout-zones';

const zone = useZoneState({ section: 'tasks', selectedParam: 'task', columns: true, label: 'Завдання' });
// → { view, setView, panels: {static, dynamic}, setPanel, togglePanel, selectedId, select, panelOpen, closePanel }
//   columns: true — розділ у фокусі показує «Список / Колонки» внизу шухляди ☰.

<ZoneLayout
  main={<Header+List/>}                         // головна зона з власною шапкою й прокруткою
  dynamic={<Details/>} dynamicOpen onCloseDynamic
  dynamicHeader? dynamicFooter? dynamicLabel? dynamicScrollRef?
  dynamicChrome?={true}                         // false — ✕ дає сама шапка вмісту
  static?={<TodayPane/>} showStatic?            // лише ≥1280 і коли main за типових ширин ≥ mainMin
  resizable?={true} sizeKey?="default"          // межі між зонами (планшет)
  panels?={zone.panels} onTogglePanel?={zone.togglePanel}   // три крапки (лише iPad)
  fab?={<AddFab/>} overlay?={<BulkActionBar/>} testID? />

zoneWidths({ windowWidth, screenWidth, wide, wantStatic, wantDynamic, sizes?, handles? })
// → { dynamicMode: 'panel'|'sheet', showStatic, staticWidth, showDynamic, dynamicWidth, mainWidth }

<BottomSheet visible onClose header? footer? peek?={0.6} full?={0.94} scrollRef? scroll? showClose? accessibilityLabel? testID? />
<SwipeRow actions={[{ key, label, icon, tone?: 'neutral'|'danger'|'success', onPress, testID? }]} enabled? radius?>
  {a11y => <Row accessibilityActions={a11y.accessibilityActions} onAccessibilityAction={a11y.onAccessibilityAction} />}
</SwipeRow>
<KanbanPager columns={[{ key, title, count?, color? }]} renderColumn={(col, i) => …} paging={isCompact}
             columnWidth?={300} contentBottom? gutter? onIndexChange? testID? />
<BulkActionBar count actions={[{ key, label, icon, tone?: 'default'|'danger', onPress, disabled?, testID? }]} onClear bottom? testID? />
<ZoneSkeleton variant?="list|columns|details|static" rows? />
<ZoneEmpty details? icon? title? caption? actionLabel? onAction? />   // details → «Виберіть запис»
<ZoneError title? message? onRetry />                                  // «Повторити» всередині зони
<ViewModeSwitch value onChange compact? fullWidth? testID? />          // radiogroup, активний — чорна pill
<PanelToggles panels onToggle staticAvailable? testID? />              // switch × 3 (main — завжди on)

<OverlaySurface radius? noise? shadow? rim? style …ViewProps />        // блюр thick + fill + зерно + обідок + тінь
<OverlayScrim onPress? accessibilityLabel? blur? />                    // затемнення + легкий блюр фону
<OverlayMaterial isDark radius? noise? />                              // лише блюр+fill+зерно — для наявних контейнерів
overlayFillStyle(isDark, reduceTransparency?)                          // заливка+обідок без блюру
```

`AppHeader` отримав `viewSwitch?: { value, onChange }` (планшет) і кнопку пошуку
на телефоні (коли екран дав `onSearch`). `NavSidebar` — `footer?` (низ шухляди).
`TaskCompactCard` — `selected?`, `selectionMode?`, `rowAccessibilityActions?`,
`onRowAccessibilityAction?`. `app/_layout.tsx` обгорнуто в `GestureHandlerRootView`
(свайпи рядків у дереві екранів).

### Взаємодія

- **Масовий вибір**: довгий тап по рядку → рядок вибрано (чорна рамка, кружок
  ✓ замість чекбокса статусу) → короткі тапи додають/знімають → `BulkActionBar`
  «N вибрано · Дії ▾ · ✕» над баром; «Назад» (Android) / ✕ знімають вибір. Дії
  — ті самі операції, що з одного рядка (права ролі проєкту, зупинка таймера,
  undo). «Копіювати» (колишнє меню довгого тапу) — у «Дії ▾», коли вибрано один.
- **Свайп рядка вліво** відкриває «В архів» (= виконано; виконані живуть в
  Архіві) і «Видалити» (з підтвердженням і undo). Дія — тапом по кнопці, не
  самим змахом. VoiceOver — ті самі дії як accessibilityActions рядка.
- **Канбан на телефоні** — одна колонка на екран, горизонтальний свайп, крапки
  колонок угорі (кнопки 44×44 «Колонка 2 з 4: У роботі»). Перенесення між
  колонками — статусом у картці (перетягування на телефоні не робимо).
- **Шухляда ☰**: тап по затемненню / свайп уліво / «Назад» закривають; унизу —
  «Список / Колонки» розділу в фокусі.

### Доступність

Цілі ≥ 44 (крапки панелей і колонок, ✕ панелі/аркуша, сегменти перемикача 36 +
hitSlop, кнопки свайпу 76×висота рядка, панель дій 44–48). Ролі: перемикач —
radiogroup/radio; крапки панелей — switch; крапки колонок — tablist/tab; меню дій
— menu/menuitem; аркуш і шухляда — `accessibilityViewIsModal`; ручка аркуша —
кнопка з діями increment/decrement. «Зменшити рух» — без пружин і в'їздів.
«Зменшити прозорість» — оверлеї суцільні (`overlay.solid`), без блюру й зерна.

### Сторінка-зразок: «Завдання»

`app/(tabs)/index.tsx`: `useZoneState({section:'tasks', selectedParam:'task'})` →
`ZoneLayout` (main = AppHeader + липкі фільтри + `SectionList` | `KanbanPager`;
dynamic = картка завдання/зустрічі з наявними `TaskDetailHeader`/вкладками; static =
`TasksTodayPane` на ≥1280; FAB «+» на всіх розмірах; `BulkActionBar`; `SwipeRow` на
кожному рядку). «Сьогодні» (`app/(tabs)/today.tsx`) — статична зона телефона й
планшета, скелет `ZoneSkeleton variant="static"`.

### Рецепт для решти екранів

1. `const zone = useZoneState({ section: '<розділ>', selectedParam: '<id-param>', columns: <вміє дошку?> })`.
2. Корінь екрана: `<MeshBackground/>` + `<ZoneLayout main={…} dynamic={…} dynamicOpen={zone.panelOpen} onCloseDynamic={zone.closePanel} …/>`.
3. Деталі — наявний компонент деталей як `dynamic` (вкладки — у `dynamicHeader`, дії — `dynamicFooter`).
4. Стани кожної зони окремо: `ZoneSkeleton` / `ZoneEmpty` / `ZoneError` — не блокувати сусідні.
5. Будь-який новий оверлей — `OverlaySurface` (+ `OverlayScrim` для модальних); наявний контейнер з `glassOf(t).sheet` — додати першим дочірнім `<OverlayMaterial isDark={isDark} />`.

## Unslop polish (2026-11-01)

Прохід за скілом **unslop** (Damir Sokolovsky, [@heydamir](https://x.com/heydamir), CC BY 4.0),
режим POLISH: бренд, Liquid Glass, «брудне скло» оверлеїв, Omni-структура й Layout
System лишаються; виправлено те, що аудит знайшов у спільному шарі.

**Напрям.** Особистий і командний планувальник; характер — зібраний, спокійний,
точний; світ — паперовий планер і настільні прилади (лінійка, циферблат, таймер);
момент сторінки — великі тонкі цифри KPI й одна головна діаграма; підпис —
кольорова точка/чип акценту модуля поруч із назвою, більше ніде декоративно.

Правила, які тепер діють для всіх екранів:

- **Сітка 4.** Відступи, поля, проміжки — кратні 4 (крок 2 — лише всередині
  дрібних контролів). Однакові речі — однакова висота й поле.
- **Підписи груп — sentence case.** Жодного `textTransform: 'uppercase'` /
  `.toUpperCase()` і розрідженого трекінгу на підписах («Робота», «Особисте»,
  «Ще», «Розробка», «Проєкт», «Коментарі»). Підпис групи сайдбара — 12 / Medium,
  `text.secondary`, ~24 над групою й 4–8 під ним. Заголовок динамічної зони — 13 / Medium.
  Виняток — ініціали (аватар, однолітерні підписи днів у вузькому `HatchedBars`).
- **Ваги 400–600.** `fontFamily.bold` (700) у спільних компонентах не вживаємо;
  ієрархія — розміром і кольором. Від'ємний трекінг — лише на display (≥ 32).
- **Іконки.** 16 у рядках/полях, 18 у кнопках шапки й сайдбара, шеврони 12.
- **Без кольорового світіння.** `glow` у `PillButton`/`GlassSurface`/`Card`
  лишився в API, але дає нейтральну тінь; тінь скла — нейтральна `#111113`.
  Кольорових тіней під свотчами немає (вибраний свотч — обвідка `text.primary`).
- **Фірмовий градієнт** `#7F0BE8→#F4AA2D` — лише підсвітка даних (активний
  стовпець `HatchedBars`, `SegmentedProgress`). `BentoCard variant="ai"` більше
  не малює змивку `gradient.aiCard` і сферу `AIOrb`. `PromoCard`/`AIBlock`
  нікде не вживаються; нові місця для них не додавати.
- **Mesh canvas** приглушено (~40% меншої непрозорості плям): це підкладка під
  скло, а не декор.
- **Стат-плитки** (`KpiCounter`, плитки Bento з числом) — число + підпис + зміна
  з базою порівняння. Без спарклайнів, міні-стовпців і лічильників-«палочок».
  `HatchedBars` — це діаграма картки, не прикраса плитки.
- **Копірайт.** Без «…» у плейсхолдерах («Пошук», «Нотатки», «Місце»), без
  крапок у кінці підписів і однореченнєвих підказок, без знаків оклику й
  привітань у заголовках.
- **Рух.** Одна крива `Motion.easing.out`; вхід — `riseIn(delay)` з
  `constants/motion.ts` (fade + підйом 8 px, стагер 40 мс, максимум 6 елементів)
  замість стандартного `FadeInDown` (25 px). `Motion.spring.bouncy` — `@deprecated`;
  `AnimatedCheck` підтверджує коротким натиском 1 → 1.06 → 1 без перебігу.


## Filters (v2.5)

Скарга власника (11.2026): фільтри у два-три ряди, різної висоти, нативні
пікери з підписом над полем. Правило тепер одне для вебу й планшета — API
дзеркальне до вебового `@/components/ui` (`flowi-web-app/components/ui/filters.tsx`).

**Лише НЕ компактні вікна.** Сторінка вмикає нові фільтри через
`useFiltersV25()` (= `useResponsive().isWide`). Телефон / compact лишає свій
наявний UI без жодної зміни; самі примітиви існуючих екранів не чіпають.

```tsx
import {
  FilterBar, FilterSelect, FilterSearch, Segmented, useFiltersV25, isFilterSelectActive,
  FILTER_CONTROL_H, FILTER_HIT_H, FILTER_GAP,
} from '@/components/ds';            // або '@/components/ds/filters'

const v25 = useFiltersV25();
{v25 ? (
  <FilterBar
    label={tr.projectListFilterLabel}
    search={<FilterSearch label={tr.search} value={q} onChangeText={setQ} />}
    items={[
      { id: 'scope', pinned: true, node: (
        <Segmented label={tr.projects} value={scope} onChange={setScope}
          options={[{ value: 'live', label: 'Живі', icon: 'folder', count: 13 },
                    { value: 'archive', label: 'Архів', icon: 'archivebox', count: 14 }]} />) },
      { id: 'sort', active: sort !== 'smart', node: (
        <FilterSelect label="Сортування" value={sort} neutralValue="smart" onChange={v => setSort(v ?? 'smart')}
          options={SORT_OPTIONS} />) },
      { id: 'status', active: statuses.length, node: (
        <FilterSelect label="Статус" multiple value={statuses} onChange={setStatuses} options={STATUS_OPTIONS} />) },
    ]}
    onReset={resetAll}
  />
) : (
  <OldPhoneFilters />   // як було
)}
```

| Примітив | Пропси | Правило |
|---|---|---|
| `FilterBar` | `label`, `items: {id, node, active?: boolean\|number, pinned?, menuLabel?}[]`, `search?`, `actions?`, `overflowLabel?` («Фільтри»), `onReset?`, `resetLabel?` («Скинути»), `style?`, `testID?` | ОДИН ряд, без переносу, gap 8. Міряє елементи в невидимому ряду (`importantForAccessibility="no-hide-descendants"`), ділить `partitionFilterItems`; хвіст, що не вліз, — у тригер «Фільтри · N» (N — сума `active` схованих), який відкриває меню на «брудному склі» з цими ж контролами стовпчиком. `pinned` не ховається ніколи. `search` ліворуч і `actions` праворуч не ховаються. «Скинути» — коли хоч один `active` |
| `Segmented` | `label`, `value`, `options: {value, label, icon?: IconSymbolName\|ReactNode, count?, disabled?, testID?}[]`, `onChange`, `semantics?: 'radiogroup'\|'tablist'\|'pressed'`, `stretch?`, `iconOnly?`, `style?`, `testID?` | ОДНА pill-доріжка 36pt з внутрішнім бігунком (`action.primary`), анімація 180 мс, без анімації за «Зменшенням руху». 2–4 взаємовиключні варіанти: Живі/Архів, Список/Дошка/Таблиця, період ≤ 4. Ролі: radiogroup/radio+checked · tablist/tab+selected · button+selected |
| `FilterSelect` | `label`, `options: {value, label, icon?, color?, count?, description?, disabled?}[]`; одиночний — `value: V\|null`, `onChange(V\|null)`, `emptyOption?: {label}`, `neutralValue?`; мульти — `multiple: true`, `value: V[]`, `onChange(V[])`; спільні — `allLabel?` («Усі»), `placeholder?`, `searchable?` (типово > 8), `resetLabel?`, `hideLabel?`, `icon?`, `disabled?`, `stretch?`, `style?`, `testID?` | Тригер-pill «Підпис: Значення ⌄» — підпис `text.secondary` ВСЕРЕДИНІ кнопки. Мульти: 0 → «Статус: Усі», 1 → «Статус: Прострочені», ≥ 2 → «Статус · 2». Меню — `OverlaySurface` під тригером (`measureInWindow`), фліп угору біля нижнього краю, тап поза меню закриває. Одиночний — ✓ і закриття; мульти — чекбокси, футер «Скинути» / «Готово» |
| `FilterSearch` | `label`, `value`, `onChangeText`, `placeholder?` («Пошук»), `style?`, `testID?` | Поле пошуку тієї ж висоти, 160–280pt, кнопка очищення |
| `useFiltersV25()` | — | `true` лише на не-compact |
| `isFilterSelectActive(props)` | — | для `active` у FilterBar |

Чиста логіка — `components/ds/filters/filterLogic.ts` (тести
`__tests__/filter-logic.test.ts`), семантика ідентична вебовій
`lib/filters.ts`: `partitionFilterItems`, `countHiddenActive`,
`filterTriggerText`, `overflowTriggerText`, `typeaheadIndex`, `matchesQuery`,
`placeFilterMenu`; константи `FILTER_CONTROL_H` 36, `FILTER_HIT_H` 44,
`FILTER_GAP` 8, `FILTER_SEARCH_THRESHOLD` 8, `FILTER_HIT_SLOP`.

### Правила

1. **Один ряд.** Жодного другого ряду фільтрів на планшеті: те, що не влізло, — у «Фільтри · N».
2. **Одна висота.** Видимо 36pt, рамка контролу 44pt — справжня зона дотику, а не `hitSlop` (він обрізається межами предка, A11Y-08).
3. **Segmented** — для 2–4 взаємовиключних варіантів; **FilterSelect** — для всього іншого (сортування, статус, проєкт, задача, теги, період > 4).
4. **Підпис усередині** тригера («Сортування: Розумне ⌄»), ніколи не над полем; жодних підписів-рядків «Сортування» перед рядом чипів.
5. **Без нативних / «поле з підписом над ним» пікерів** (`PickerField`, `Segment` з FormBits) у рядах фільтрів — вони лишаються для форм.
6. Сторінка зберігає власний стан фільтрів; примітиви — лише подання.
7. Телефон (compact) — без змін; міграцію робити гілкою `useFiltersV25() ? <FilterBar …/> : <як було/>`.
8. `ViewModeSwitch` (Список/Колонки в шапці) уже є сегментованою доріжкою 36pt з radiogroup — не змінювався; нові перемикачі вигляду на сторінках — `Segmented`.
