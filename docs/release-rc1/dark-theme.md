# RC1 — Темна тема (нейтральний сірий, суцільні поверхні)

Рішення 2026-11-22: темна тема на ВСІХ платформах. Нейтральний сірий (не синій графіт), ясність як у Binance: помітніші кроки яскравості між поверхнями, суцільна межа 1 px, текст secondary/muted проходить AA. Світла тема не змінилась (перевірено, див. «Перевірка»).

## Шкала (одна для вебу і мобільного)

| роль | до | після | веб-токени | мобільні токени |
|---|---|---|---|---|
| canvas | `#0B0B0D` (веб) / `#0D0D0F` (моб) / `#0D0D10` (mesh) | **`#0E0E10`** | `--ds-bg-canvas` | `darkScale.canvas`, `bg.canvas`, `glass.dark.mesh.base` |
| card | `#17171A` | **`#1A1A1D`** | `--ds-surface-card`, `--ds-glass-surface`, `--ds-content-surface` | `surface.card`, `glass.dark.surface/solid.card` |
| elevated / input | `#1E1E22` / `#202024` | **`#232327`** | `--ds-surface-elevated/subtle`, `--ds-glass-surface-strong/sheet/subtle`, `--ds-content-surface-raised`, `--ds-skeleton-base` | `surface.elevated/subtle`, `glass.dark.surfaceStrong/surfaceSubtle`, `overlay.dark.solid` |
| hover / secondary | rgba white 7% | **`#2C2C31`** | `--ds-action-secondary`, `--ds-content-fill`, `--ds-card-dark` | `action.secondary`, `featured.bg` |
| border | `#2A2A2F` | **`#34343A`** | `--ds-border-hairline`, `--ds-glass-rim`, `--ds-glass-specular`, `--ds-content-separator`, `--ds-content-shadow` | `border.hairline`, `glass.dark.rim/rimShade` |
| border strong (поля, контроли) | — | **`#45454C`** | `--ds-glass-control-edge` | `darkScale.borderStrong` (у `ds.glass(…,'subtle')`) |
| text primary | `#F4F4F5` | **`#F2F2F3`** | `--ds-text-primary` | `text.primary` |
| text secondary | `#A1A1AA` | **`#B9B9BF`** | `--ds-text-secondary` | `text.secondary` |
| text muted | `#6B6B73` (3.4:1, не AA) | **`#93939B`** | `--ds-text-muted` | `text.muted` |
| дохід | `#30D158` | **`#0ECB81`** (тільки темна) | `--ds-fin-income(-ink)` | `financeDark.income`, `finColors(true)` |
| витрата | `#FF453A` / ink `#FF6961` | **`#F6465D`** / ink **`#FF6B7D`** (тільки темна) | `--ds-fin-expense(-ink)` | `financeDark.expense/expenseInk` |

Акценти модулів (lime, amber, lavender, coral, info, success) лишились як були: усі ≥ 3:1 на кожній поверхні (див. таблицю), підправляти не довелося.

## Поведінка (суцільна темна)

- **Веб** (`flowi-web-app/app/globals.css`, обидва темні блоки: `@media (prefers-color-scheme: dark) :root:not([data-flowi-theme=light])` і `:root[data-flowi-theme=dark], :root[data-theme=dark]`; після правок вони ідентичні): `--ds-glass-*` поверхні непрозорі, `--ds-glass-filter: none`, `--ds-glass-mesh: none`, `--ds-glass-sheen: none`, `--ds-glass-highlight` прибрано. Межу 1 px дають `--ds-glass-specular` (суцільний градієнт `#34343A`) і `--ds-glass-rim`. Оверлеї: `--ds-overlay-tint: rgba(35,35,39,0.97)`, обідок `inset 0 0 0 1px #34343A`. Під `prefers-reduced-transparency` загальний фолбек гасить rim і specular, тому для темної межу повернуто окремим правилом.
- **Мобільний**: `GlassSurface` у темній завжди йде суцільною гілкою (як «Зменшити прозорість»): заливка `g.solid.*`, `borderWidth 1`, межа є і на `subtle`. `GlassBackdrop` у темній нічого не малює. `ds.glass()` дає одну суцільну межу: `#34343A` для card і strong, `#45454C` для subtle (поля, чипи). `MeshBackground` малює лише canvas, бо `glass.dark.mesh.blobs = []`. Таб-бар: `TAB_BAR_BG.dark = #1A1A1D`, тінт `#F2F2F3`/`#B9B9BF`; Android-заливка тепер `g.surfaceStrong`.
- **Фінанси**: світла тема бере `status.success/danger` без змін. Темна бере `finColors(true)`, і застосовується це ЛИШЕ у фінансах: `finPalette`, `TransactionGroup`, `FinanceSummary`, `CashflowCharts`, `AccountsTab`, `explore.tsx`. Глобальний `status.danger` (помилки) не змінено. Текст сум бере `expenseInk`, заливки беруть `expense`. На заливці витрати пишемо `#111113` (5.35:1), а не білий (3.53:1).
- **Веб `lib/project-appearance.ts`**: дефолт темної палітри проєкту тепер `#0e0e10/#1a1a1d/#f4f4f5`. Палітра, збережена до RC1 (`#0d0d0f/#17171a/#f4f4f5`), і далі вважається дефолтом Flowi і резолвиться в нову (тест у `lib/project-appearance.test.mjs`). `lib/dials.ts` (циферблати): темний рядок синхронізовано.

## Контраст (WCAG 2.x)

Нижче вивід `node scripts/dark-contrast.mjs` (з `--check` скрипт падає, якщо текст < 4.5 або акцент < 3). rgba-змивки перед виміром накладено на поверхню.

### Surfaces (CIE L* and step to previous)

**before:** canvas `#0B0B0D` L*3.1 → card `#17171A` L*7.9 (ΔL* 4.8, 1.10:1) → elevated `#1E1E22` L*11.4 (ΔL* 3.6, 1.08:1) → subtle `#202024` L*12.4 (ΔL* 1.0, 1.02:1)

**after:** canvas `#0E0E10` L*4.0 → card `#1A1A1D` L*9.4 (ΔL* 5.4, 1.11:1) → elevated `#232327` L*13.9 (ΔL* 4.5, 1.11:1) → hover `#2C2C31` L*18.2 (ΔL* 4.3, 1.13:1)

### Text on surfaces — before (AA ≥ 4.5)

| token | canvas `#0B0B0D` | card `#17171A` | elevated `#1E1E22` | subtle `#202024` |
|---|---:|---:|---:|---:|
| primary `#F4F4F5` | 17.89 | 16.28 | 15.11 | 14.77 |
| secondary `#A1A1AA` | 7.67 | 6.98 | 6.48 | 6.33 |
| muted `#6B6B73` | 3.72 ✗ | 3.39 ✗ | 3.15 ✗ | 3.07 ✗ |

### Text on surfaces — after (AA ≥ 4.5)

| token | canvas `#0E0E10` | card `#1A1A1D` | elevated `#232327` | hover `#2C2C31` |
|---|---:|---:|---:|---:|
| primary `#F2F2F3` | 17.24 | 15.52 | 14.00 | 12.42 |
| secondary `#B9B9BF` | 9.88 | 8.89 | 8.02 | 7.11 |
| muted `#93939B` | 6.32 | 5.69 | 5.14 | 4.56 |

### Borders — before (informational; 1.4.11 does not require card borders ≥ 3:1)

| border | canvas | card | elevated | subtle |
|---|---:|---:|---:|---:|
| hairline `#2A2A2F` | 1.38 | 1.25 | 1.16 | 1.14 |

### Borders — after (informational; 1.4.11 does not require card borders ≥ 3:1)

| border | canvas | card | elevated | hover |
|---|---:|---:|---:|---:|
| hairline `#34343A` | 1.56 | 1.40 | 1.27 | 1.12 |
| strong `#45454C` | 2.03 | 1.83 | 1.65 | 1.46 |

### Accents on surfaces — after (non-text ≥ 3:1; ✗ = below)

| accent | canvas | card | elevated | hover |
|---|---:|---:|---:|---:|
| lime (web+mob) `#CDEB3A` | 14.27 | 12.85 | 11.59 | 10.28 |
| amber (web+mob) `#F2B135` | 10.21 | 9.19 | 8.29 | 7.35 |
| lavender (web+mob, focus) `#B8A4F8` | 8.91 | 8.02 | 7.24 | 6.42 |
| lavender-ink (web) `#C4B4FF` | 10.39 | 9.36 | 8.44 | 7.49 |
| coral (web fill) `#E8543F` | 5.30 | 4.77 | 4.30 | 3.82 |
| coral-ink (web) / coral (mob) `#FF8A75` | 8.40 | 7.56 | 6.82 | 6.05 |
| info (web) `#6A90FA` | 6.41 | 5.77 | 5.21 | 4.62 |
| info-ink (web) `#8FADFF` | 8.81 | 7.93 | 7.15 | 6.34 |
| info (mob) `#8FAEFF` | 8.88 | 7.99 | 7.21 | 6.39 |
| success (web) `#2FBF6C` | 8.07 | 7.27 | 6.55 | 5.81 |
| success-ink (web) `#4ED68A` | 10.39 | 9.35 | 8.43 | 7.48 |
| success (mob) `#4CD787` | 10.45 | 9.41 | 8.48 | 7.53 |
| danger (web+mob) `#EF6450` | 6.07 | 5.46 | 4.93 | 4.37 |

### Finance colours — before → after (amount text needs 4.5)

| token | before on card `#17171A` | after on canvas | after on card | after on elevated | after on hover |
|---|---:|---:|---:|---:|---:|
| income `#30D158` → `#0ECB81` | 8.85 | 9.07 | 8.17 | 7.37 | 6.53 |
| expense `#FF453A` → `#F6465D` | 5.25 | 5.47 | 4.92 | 4.44 | 3.94 |
| expense-ink `#FF6961` → `#FF6B7D` | 6.34 | 7.03 | 6.33 | 5.70 | 5.06 |

### Tinted washes composited over card / elevated — after

| wash + foreground | over card | ratio | over elevated | ratio |
|---|---|---:|---|---:|
| lime tint + lime ink | `#3E4423` | 7.56 | `#454B2B` | 6.77 |
| amber tint + amber ink | `#453822` | 6.04 | `#4C3F2A` | 5.42 |
| lavender tint + lavender-ink | `#403B52` | 5.76 | `#474259` | 5.17 |
| coral tint + coral-ink | `#432624` | 5.93 | `#4A2D2C` | 5.37 |
| info tint + info-ink | `#2C344E` | 5.61 | `#333B55` | 5.05 |
| success tint + success-ink | `#1E3B2D` | 6.58 | `#254235` | 5.92 |
| income tint + income | `#18362D` | 6.16 | `#203E35` | 5.48 |
| expense tint + expense-ink | `#422229` | 5.13 | `#492931` | 4.65 |
| glass hover (white 7%) + secondary | `#2A2A2D` | 7.33 | `#323236` | 6.54 |

### On-fill text — after

| pair | ratio |
|---|---:|
| text.onAction `#111113` on action.primary `#F4F4F5` | 17.16 |
| text.onAccent `#111113` on lime | 13.96 |
| text.onAccent `#111113` on coral-ink (mob solid) | 8.21 |
| `#111113` on income `#0ECB81` | 8.87 |
| `#111113` on expense `#F6465D` | 5.35 |
| white on expense `#F6465D` (avoid) | 3.53 |
| featured text `#F2F2F3` on `#2C2C31` | 12.42 |
| featured secondary `#C7C7CC` on `#2C2C31` | 8.25 |
| high-contrast secondary `#D4D4D8` on card | 11.75 |


Примітки:
- Межі карток (1.40:1) — це візуальний поділ, а не «компонент UI» за 1.4.11. Поля вводу розпізнаються сумою кроку заливки (`#232327` на `#1A1A1D`) і сильнішої межі `#45454C`. AA для меж ми НЕ заявляємо.
- `expense` `#F6465D` як ТЕКСТ на elevated/hover не проходить AA (4.44/3.94), тому текст сум бере `expense-ink` `#FF6B7D` (≥ 5.06 скрізь).
- Мобільний `text.muted` на hover — 4.56 (на межі). На hover-поверхні muted краще не ставити.

## Перевірка (виконано агентом)

| перевірка | команда | результат |
|---|---|---|
| Світлі токени мобільного byte-identical | дамп `theme.light/glass.light/overlay.light/shadow.light` до і після, `cmp` | ідентичні |
| Світлі CSS вебу не зачеплено | `diff` globals.css: змінено лише рядки в темних блоках (+ нове reduced-transparency-правило лише для dark) | ok |
| Два темні веб-блоки ідентичні | витяг обох блоків без відступів → `diff` | ідентичні |
| Тест темної теми | `npx jest __tests__/dark-theme-rc1.test.ts` (AA тексту, кроки L* ≥ 4, нейтральний RGB, без мешу, непрозорість ≥ 0.94, фінанси) | 6/6 |
| Тести теми/таб-бару/здоров'я | `npx jest __tests__/healthTheme.test.ts __tests__/health-redesign-1007.test.ts __tests__/audit-tabbar-a11y.test.tsx __tests__/audit-project-space.test.tsx` | pass (`healthTheme` оновлено на `#0E0E10`) |
| Mobile tsc | `npx tsc --noEmit` | 0 помилок |
| Web unit | `npm test` | 1530/1530 |
| Web tsc | `npx tsc --noEmit` | 0 помилок |

## Ручна перевірка на пристроях (власник / QA)

Контраст рахувати з пікселів скріна, а не з токенів (`docs/AUDIT_RUNBOOK.md`). У темній тепер немає BlurView, тож піксель має збігатися з токеном.

| # | платформа | де | що перевірити |
|---|---|---|---|
| 1 | iOS 26 (Liquid Glass) | Сьогодні, Задачі, Фінанси, Налаштування | картки суцільні `#1A1A1D` з межею 1 px; немає кольорових плям на тлі; таб-бар суцільний |
| 2 | iOS < 26 | те саме + аркуші (SheetModal) | аркуш суцільний `#232327`, текст під ним не просвічує |
| 3 | Android | таб-бар, картки, поля вводу | межа полів `#45454C` помітна; без «привидів» |
| 4 | iOS «Зменшити прозорість» + «Збільшити контраст» | будь-який екран | вигляд той самий (суцільний), межі є |
| 5 | Веб Chrome/Safari, тема «Темна» і «Системна» при темній ОС | /app, /app/finance, модалки, ⌘K | canvas `#0E0E10`; картки з межею; поповери/діалоги щільні; на тлі немає мешу |
| 6 | Веб, macOS «Зменшити прозорість» | /app | межа карток лишилась |
| 7 | Фінанси (веб + моб) | операції, звіти, графіки | дохід `#0ECB81`, витрата `#F6465D`, суми витрат `#FF6B7D` читаються |
| 8 | Світла тема (веб + моб) | ті самі екрани | без змін (порівняти зі скрінами до RC1) |
| 9 | Проєкт із кастомною/збереженою темною палітрою | /app/p/<id> | палітра до RC1 показує нову дефолтну; кастомна лишається кастомною |

## Не зроблено в цій зоні (інші власники)

Ці значення старого темного canvas/тексту лежать у файлах інших агентів. Їх треба синхронізувати, коли ті агенти закінчать:
- `app.json` → `splash … dark.backgroundColor: "#0D0D0F"` → `#0E0E10`
- `android/app/src/main/res/values-night/colors.xml` → `splashscreen_background #0D0D0F` → `#0E0E10`
- `modules/flowi-android/android/src/main/res/values-night/flowi_colors.xml` → `flowi_widget_text_secondary #A1A1AA` → `#B9B9BF` (і інші кольори віджета за шкалою вище)
- iOS-віджет/годинник (Swift): так само звірити темні кольори зі шкалою.
