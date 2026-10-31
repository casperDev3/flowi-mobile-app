import { glass as dsGlass, moduleAccent, theme as dsTheme, type GlassAccent } from './theme';
// ─── Дизайн-токени Flowi ─────────────────────────────────────────────────────
// DS v2 («м'який мінімалізм»): Radius/Spacing — на шкалі constants/theme.ts,
// палітра екрана — тонка обгортка над семантичними токенами теми.

/** Радіуси заокруглення (в пікселях) — шкала DS v2. */
export const Radius = {
  /** Контроли, дрібні елементи (radius.control). */
  sm:   10,
  /** Вкладені блоки, компактні (radius.nestedCompact). */
  md:   10,
  /** Вкладені блоки (radius.nested). */
  lg:   12,
  /** Картки, компактні (radius.cardCompact). */
  xl:   14,
  /** Картки (radius.card). */
  xxl:  16,
  /** Кнопки, чипи, аватари. */
  pill: 999,
} as const;

/** Відступи (в пікселях) — сітка 4 px. */
export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
} as const;

// ─── Палітра екрана ───────────────────────────────────────────────────────────

/**
 * Типізована палітра кольорів екрана.
 * - `sub`       = text.secondary — WCAG AA (≥4.5:1) на bg.canvas і surface.card
 * - `subStrong` — між secondary і primary, для виразних підписів
 */
export type ScreenPalette = {
  /** Основний колір фону (DS v2: bg.canvas) */
  bg1: string;
  /** Другий колір фону (DS v2: той самий bg.canvas — градієнтів фону більше немає) */
  bg2: string;
  /**
   * Колір картки — DS v2.1: СКЛО glass.surface (rgba, напівпрозоре). Дає
   * ефект лише над <MeshBackground/>; альфу до нього НЕ дописувати.
   */
  card: string;
  /** Непрозора картка (surface.card) — модалки без блюру, «Зменшити прозорість». */
  cardSolid: string;
  /** Колір рамок і роздільників (DS v2: border.hairline — використовувати мінімально) */
  border: string;
  /** Основний колір тексту */
  text: string;
  /** Вторинний текст (підписи, мета-інфо) — WCAG AA ≥4.5:1 */
  sub: string;
  /** Вторинний текст, вищий контраст (підписи полів, помітки) */
  subStrong: string;
  /**
   * Акцентний колір екрана — glass.accent[модуль].ink, завжди #RRGGBB
   * (споживачі дописують альфу: accent + '22'). ≥ 4.5:1 як текст/іконка на
   * склі в обох темах; у світлій ще й під білим підписом (≥ 5:1).
   * У ТЕМНІЙ ink світлий — текст поверх заливки акцентом бере `onAccent`.
   */
  accent: string;
  /** Колір тексту/іконки ПОВЕРХ заливки `accent` (світла — #FFFFFF, темна — #111113). */
  onAccent: string;
  /** Тонована «змивка» акцентом (rgba) — фон KPI-карток, icon-chip, активного пункту. */
  accentTint: string;
  /** Назва акценту модуля (для <IconChip accent>, <GlassScreen accent>, ProgressBar tone). */
  accentName: GlassAccent;
};

type ScreenName = 'tasks' | 'finance' | 'time' | 'health' | 'notes' | 'containers' | 'settings' | 'auth';

/**
 * Акценти екранів у DS v2.1 (Liquid Glass) — з glass.moduleAccent:
 *   tasks / auth / settings → lavender, time / notes / containers → amber,
 *   finance → lime, health → coral.
 * `accent` — роль `ink` цього акценту (#RRGGBB, ≥ 4.5:1 на склі): у світлій
 * це глибокий тон (лаванда #6D4CF5, лайм #4F6B00 …), у темній — сам яскравий
 * акцент. Канвас — mesh (glass.mesh.base під <MeshBackground/>), картка —
 * скло glass.surface. Головні дії — action.primary pill, не акцент екрана.
 */
const SCREEN_MODULE: Record<ScreenName, keyof typeof moduleAccent> = {
  tasks: 'tasks',
  auth: 'auth',
  time: 'time',
  finance: 'finance',
  health: 'health',
  notes: 'notes',
  containers: 'containers',
  settings: 'settings',
};

/**
 * Фабрика палітри екрана.
 * Приймає назву екрана та прапор темної теми, повертає готовий об'єкт кольорів.
 * DS v2.1: bg1/bg2 = основа mesh (самі плями — <MeshBackground/> першим
 * дочірнім), card = скло, accent = ink акценту модуля.
 *
 * @example
 * const c = getScreenColors('auth', isDark);
 */
export function getScreenColors(screen: ScreenName, isDark: boolean): ScreenPalette {
  const t = isDark ? dsTheme.dark : dsTheme.light;
  const g = isDark ? dsGlass.dark : dsGlass.light;
  const accentName = moduleAccent[SCREEN_MODULE[screen]];
  const a = g.accent[accentName];
  return {
    bg1:        g.mesh.base,
    bg2:        g.mesh.base,
    card:       g.surface,
    cardSolid:  t.surface.card,
    border:     t.border.hairline,
    text:       t.text.primary,
    sub:        t.text.secondary,
    subStrong:  isDark ? '#D4D4D8' : '#3F3F46',
    accent:     a.ink,
    onAccent:   isDark ? '#111113' : '#FFFFFF',
    accentTint: a.tint,
    accentName,
  };
}

// ─── Клас розміру вікна ───────────────────────────────────────────────────────

/**
 * Класифікація за ШИРИНОЮ вікна, а не за типом пристрою.
 *
 * Пристрій — погана основа: iPad у Split View має ширину телефону, а iPhone
 * Pro Max у ландшафті ширший за iPad mini в портреті. Питання, на яке
 * відповідає компонування, — «скільки місця є зараз», а не «що це за залізо».
 *
 * Джерело чисел — Material window size classes; вони збігаються з реальними
 * точками, де iPad перестає бути схожим на телефон.
 */
export type SizeClass = 'compact' | 'medium' | 'expanded';

export const Breakpoints = {
  /** Від цієї ширини — `medium`: сайдбар з'являється, деталь ще ні. */
  medium: 600,
  /** Від цієї ширини — `expanded`: сайдбар + список + деталь. */
  expanded: 840,
} as const;

/**
 * Ширина вікна → клас розміру. Межі ВКЛЮЧНІ знизу: рівно 600 вже `medium`.
 */
export function sizeClassFor(width: number): SizeClass {
  if (width >= Breakpoints.expanded) return 'expanded';
  if (width >= Breakpoints.medium) return 'medium';
  return 'compact';
}

// ─── Компонування для широких вікон (планшет) ────────────────────────────────

/**
 * ПРИМІТИВИ КОМПОНУВАННЯ (рішення 6: «усі екрани на планшеті»).
 *
 * Чисті числа й функції — без React, щоб їх могли брати і хуки, і тести.
 * Компоненти, що на них стоять:
 *
 *   ContentContainer  (components/shared/ContentContainer.tsx)
 *     Центрована колонка зі стелею ширини та бічними полями за класом вікна.
 *     variant: 'reading' (720, форми/текст) | 'wide' (1200, дашборди/сітки) | 'full'.
 *
 *   ResponsiveGrid    (components/shared/ResponsiveGrid.tsx)
 *     Картки рядами по 1/2/3 колонки за класом вікна (або за minItemWidth).
 *
 *   SheetModal        presentation: 'auto' | 'sheet' | 'dialog' | 'side'
 *     На телефоні — завжди bottom-sheet. На широкому 'auto' = центрований
 *     діалог, 'side' = панель праворуч на всю висоту.
 *
 *   ListDetailLayout  (components/shared/ListDetailLayout.tsx)
 *     Список + DetailPane: на expanded деталь — постійна колонка праворуч,
 *     вужче — модальний лист. Порожня колонка показує `empty`.
 *
 *   useBreakpointValue / pickBySizeClass — значення за класом вікна.
 */
export const Layout = {
  /** Стеля колонки «для читання»: форми, налаштування, довгий текст. */
  readingMaxWidth: 720,
  /** Стеля «широкого» вмісту: дашборди, сітки карток. Далі рядок карток розповзається. */
  wideMaxWidth: 1200,
  /** Ширина центрованого діалогу (аркуш-форма на широкому вікні). */
  dialogMaxWidth: 600,
  /** Ширина бокової панелі (SheetModal presentation='side'). */
  sidePanelWidth: 420,
  /** Бічні поля екрана за класом вікна. */
  gutter: { compact: 16, medium: 20, expanded: 24 } as Readonly<Record<SizeClass, number>>,
  /** Проміжок між картками сітки. */
  gridGap: 12,
  /** Колонки сітки за замовчуванням: телефон / портрет планшета / ландшафт. */
  gridColumns: { compact: 1, medium: 2, expanded: 3 } as Readonly<Record<SizeClass, number>>,
  /** Ширина колонки деталі у list+detail на звичайному та дуже широкому вікні. */
  detailWidth: 380,
  detailWidthLarge: 440,
  /** Від цієї ширини вікна колонка деталі стає ширшою. */
  detailWideFrom: 1180,
  /** Сайдбар-«рейка» (лише іконки) на medium. */
  railWidth: 76,
} as const;

/** Значення за класом вікна: відсутні класи успадковують менший. */
export type BySizeClass<T> = { compact: T; medium?: T; expanded?: T };

export function pickBySizeClass<T>(sizeClass: SizeClass, values: BySizeClass<T>): T {
  if (sizeClass === 'expanded') return values.expanded ?? values.medium ?? values.compact;
  if (sizeClass === 'medium') return values.medium ?? values.compact;
  return values.compact;
}

/**
 * Кількість колонок сітки.
 *
 * Якщо задано minItemWidth і відома ширина контейнера — колонок стільки,
 * скільки влазить карток не вужчих за minItemWidth (але не більше maxColumns).
 * Інакше — за класом вікна (Layout.gridColumns або власна мапа).
 * Мінімум завжди 1: вироджена ширина (0 у перший кадр) не ламає рендер.
 */
export function gridColumnsFor(opts: {
  sizeClass: SizeClass;
  containerWidth?: number;
  minItemWidth?: number;
  gap?: number;
  columns?: BySizeClass<number>;
  maxColumns?: number;
}): number {
  const max = Math.max(1, opts.maxColumns ?? 4);
  let n: number;
  if (opts.minItemWidth && opts.containerWidth && opts.containerWidth > 0) {
    const gap = opts.gap ?? Layout.gridGap;
    n = Math.floor((opts.containerWidth + gap) / (opts.minItemWidth + gap));
  } else {
    n = pickBySizeClass(opts.sizeClass, opts.columns ?? Layout.gridColumns);
  }
  return Math.min(max, Math.max(1, Math.floor(n)));
}

/** Розбиття на рядки по n елементів (останній рядок може бути неповним). */
export function chunkRows<T>(items: readonly T[], n: number): T[][] {
  const size = Math.max(1, Math.floor(n));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Ширина колонки деталі у list+detail для поточної ширини вікна. */
export function detailColumnWidthFor(windowWidth: number): number {
  return windowWidth >= Layout.detailWideFrom ? Layout.detailWidthLarge : Layout.detailWidth;
}

/**
 * Як показати аркуш-форму.
 *  - sheet  — bottom-sheet (телефон, або явно попросили);
 *  - dialog — центрований діалог;
 *  - side   — панель праворуч на всю висоту.
 * На compact завжди 'sheet': діалог/панель на телефоні — гірший аркуш.
 */
export type SheetPresentation = 'auto' | 'sheet' | 'dialog' | 'side';
export type ResolvedSheetPresentation = Exclude<SheetPresentation, 'auto'>;

export function resolveSheetPresentation(
  requested: SheetPresentation,
  sizeClass: SizeClass,
): ResolvedSheetPresentation {
  if (sizeClass === 'compact') return 'sheet';
  if (requested === 'auto') return 'dialog';
  return requested;
}

/**
 * Режим особистого сайдбара. На medium (600–839) повний сайдбар (232pt)
 * з'їдав третину вікна — там за замовчуванням «рейка» з іконками; людина
 * може розгорнути її (override). На expanded за замовчуванням повний.
 */
export type SidebarMode = 'full' | 'rail';

export function sidebarModeFor(sizeClass: SizeClass, override: SidebarMode | null): SidebarMode {
  if (override) return override;
  return sizeClass === 'medium' ? 'rail' : 'full';
}
