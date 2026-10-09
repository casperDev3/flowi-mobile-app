import { Atlas } from './atlas';
// ─── Дизайн-токени Flowi ─────────────────────────────────────────────────────
// Фундамент B8: radius / spacing / палітра-фабрика (B5-контрастний sub ≥0.62/0.58)

/** Радіуси заокруглення (в пікселях) */
export const Radius = {
  sm:  Atlas.radius.small,
  md:  Atlas.radius.medium,
  lg:  Atlas.radius.large,
  xl:  Atlas.radius.xlarge,
  xxl: Atlas.radius.xxlarge,
} as const;

/** Відступи (в пікселях) */
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
 * - `sub`      ≥ opacity 0.62 (dark) / 0.58 (light) — відповідає WCAG AA (≥4.5:1)
 * - `subStrong` ≥ 0.75 / 0.70 — для більш виразного secondary-тексту
 */
export type ScreenPalette = {
  /** Основний колір фону (верхній шар градієнта) */
  bg1: string;
  /** Другий колір фону (нижній шар градієнта) */
  bg2: string;
  /** Колір картки / BlurView-контейнера */
  card: string;
  /** Колір рамок і роздільників */
  border: string;
  /** Основний колір тексту */
  text: string;
  /** Вторинний текст (placeholder, підписи, мета-інфо) — WCAG AA ≥4.5:1 */
  sub: string;
  /** Вторинний текст, вищий контраст (підписи полів, помітки) */
  subStrong: string;
  /** Акцентний колір екрана */
  accent: string;
};

/**
 * Фабрика палітри екрана.
 * Приймає назву екрана та прапор темної теми, повертає готовий об'єкт кольорів.
 *
 * Кольори bg1/bg2/accent відповідають CLAUDE.md §«Кольори/Фони по екранах».
 * sub/subStrong розраховані для дотримання WCAG AA (≥4.5:1 на відповідному bg).
 *
 * @example
 * const c = getScreenColors('auth', isDark);
 */
export function getScreenColors(
  screen: 'tasks' | 'finance' | 'time' | 'health' | 'notes' | 'containers' | 'settings' | 'auth',
  isDark: boolean,
): ScreenPalette {
  switch (screen) {
    // ── Завдання (#7C3AED) ────────────────────────────────────────────────────
    case 'tasks':
      return {
        bg1:       isDark ? '#0C0C14' : '#F4F2FF',
        bg2:       isDark ? '#14121E' : '#EAE6FF',
        card:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
        text:      isDark ? '#F0EEFF' : '#1A1433',
        sub:       isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
        subStrong: isDark ? 'rgba(240,238,255,0.75)' : 'rgba(26,20,51,0.70)',
        accent:    '#7C3AED',
      };

    // ── Авторизація (tasks-фони + #7C3AED) ───────────────────────────────────
    case 'auth':
      return {
        bg1:       isDark ? '#0C0C14' : '#F4F2FF',
        bg2:       isDark ? '#14121E' : '#EAE6FF',
        card:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
        text:      isDark ? '#F0EEFF' : '#1A1433',
        sub:       isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
        subStrong: isDark ? 'rgba(240,238,255,0.75)' : 'rgba(26,20,51,0.70)',
        accent:    '#7C3AED',
      };

    // ── Фінанси (#0EA5E9) ─────────────────────────────────────────────────────
    case 'finance':
      return {
        bg1:       isDark ? '#080E18' : '#EFF5FF',
        bg2:       isDark ? '#0F1A2E' : '#E0ECFF',
        card:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(180,170,240,0.4)',
        text:      isDark ? '#F4F2FF' : '#0A0818',
        sub:       isDark ? 'rgba(244,242,255,0.62)' : 'rgba(10,8,24,0.58)',
        subStrong: isDark ? 'rgba(244,242,255,0.75)' : 'rgba(10,8,24,0.70)',
        accent:    '#0EA5E9',
      };

    // ── Час (#6366F1) ─────────────────────────────────────────────────────────
    case 'time':
      return {
        bg1:       isDark ? '#0A0C18' : '#EEF0FF',
        bg2:       isDark ? '#121525' : '#E2E5FF',
        card:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,205,255,0.5)',
        text:      isDark ? '#EEF0FF' : '#0D1033',
        sub:       isDark ? 'rgba(238,240,255,0.62)' : 'rgba(13,16,51,0.58)',
        subStrong: isDark ? 'rgba(238,240,255,0.75)' : 'rgba(13,16,51,0.70)',
        accent:    '#6366F1',
      };

    // ── Здоров'я (#10B981) ────────────────────────────────────────────────────
    case 'health':
      return {
        bg1:       isDark ? '#0C0C14' : '#F4F2FF',
        bg2:       isDark ? '#14121E' : '#EAE6FF',
        card:      isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(200,195,255,0.5)',
        text:      isDark ? '#F0EEFF' : '#1A1433',
        sub:       isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
        subStrong: isDark ? 'rgba(240,238,255,0.75)' : 'rgba(26,20,51,0.70)',
        accent:    '#10B981',
      };

    // ── Нотатки (#F59E0B) ─────────────────────────────────────────────────────
    case 'notes':
      return {
        bg1:       isDark ? '#100D08' : '#FFFBF4',
        bg2:       isDark ? '#1A1510' : '#FFF3DC',
        card:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(245,158,11,0.2)',
        text:      isDark ? '#FFF8E7' : '#1C1209',
        sub:       isDark ? 'rgba(255,248,231,0.62)' : 'rgba(28,18,9,0.58)',
        subStrong: isDark ? 'rgba(255,248,231,0.75)' : 'rgba(28,18,9,0.70)',
        accent:    '#F59E0B',
      };

    // ── Контейнери (#F97316) ──────────────────────────────────────────────────
    case 'containers':
      return {
        bg1:       isDark ? '#100A00' : '#FFF7ED',
        bg2:       isDark ? '#1A1200' : '#FFEDD5',
        card:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(249,115,22,0.2)',
        text:      isDark ? '#FFF7ED' : '#1A0E00',
        sub:       isDark ? 'rgba(255,247,237,0.62)' : 'rgba(26,14,0,0.58)',
        subStrong: isDark ? 'rgba(255,247,237,0.75)' : 'rgba(26,14,0,0.70)',
        accent:    '#F97316',
      };

    // ── Налаштування (tasks-фони + #7C3AED) ──────────────────────────────────
    case 'settings':
      return {
        bg1:       isDark ? '#0C0C14' : '#F5F5FA',
        bg2:       isDark ? '#14121E' : '#EBEBF5',
        card:      isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)',
        border:    isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
        text:      isDark ? '#F0EEFF' : '#1A1433',
        sub:       isDark ? 'rgba(240,238,255,0.62)' : 'rgba(26,20,51,0.58)',
        subStrong: isDark ? 'rgba(240,238,255,0.75)' : 'rgba(26,20,51,0.70)',
        accent:    '#7C3AED',
      };
  }
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
