/**
 * constants/theme.ts — Flowi Design System v2 («м'який мінімалізм»).
 *
 * Єдине джерело кольорів, радіусів, відступів, тіней і типографіки для
 * мобільного застосунку. Назви токенів — семантичні й ТІ САМІ, що на вебі
 * (CSS-змінні `--ds-<група>-<назва>`), лише в camelCase-вкладених об'єктах:
 *   bg.canvas, surface.card, text.primary, action.primary, accent.lime …
 *
 * Світла й темна теми мають однакову структуру; темна — НЕ інверсія
 * світлої: власні значення, а «підйом» поверхні — яскравістю
 * (surface.elevated), а не тінню.
 *
 * Як брати в компоненті: `const { t } = useDS()` (hooks/use-ds.ts), далі
 * `t.surface.card`, `t.text.secondary` тощо. Рецепт міграції —
 * docs/design-system-v2.md.
 *
 * Канонічні значення — tokens.json дизайн-системи; змінюйте синхронно з вебом.
 */
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

// ─── Кольори ──────────────────────────────────────────────────────────────────

const light = {
  bg: {
    canvas: '#F1F1F3',
  },
  surface: {
    card: '#FFFFFF',
    subtle: '#F5F5F7',
    elevated: '#FFFFFF',
    overlay: 'rgba(17,17,19,0.40)',
    glass: 'rgba(255,255,255,0.72)',
  },
  border: {
    hairline: '#E8E8EC',
  },
  text: {
    primary: '#111113',
    secondary: '#5C5C64',
    /** Лише placeholder, disabled і декоративний текст — НЕ підписи (контраст < 4.5:1). */
    muted: '#A1A1AA',
    onAction: '#FFFFFF',
    onAccent: '#111113',
  },
  action: {
    primary: '#111113',
    primaryHover: '#2A2A2E',
    primaryPressed: '#000000',
    secondary: '#F5F5F7',
    secondaryText: '#111113',
  },
  accent: {
    /** Бейджі значень на графіках, підсвітка активного стовпця. */
    lime: '#DDF54A',
    /** Прогрес-бари, gauge, тултіпи графіків, бейдж «7 днів». */
    amber: '#F6B93B',
    /** AI-блоки, AI Insights, асистент; також focus ring. */
    lavender: '#B8A4F8',
    lavenderSoft: '#EDE6FF',
    /** Тонкі тіки-індикатори, високий пріоритет, алерти. */
    coral: '#E8543F',
  },
  status: {
    success: '#22A55B',
    warning: '#F6B93B',
    danger: '#E8543F',
    info: '#4F7CF7',
  },
  focus: {
    ring: '#B8A4F8',
  },
  state: {
    disabledBg: '#F5F5F7',
    disabledText: '#A1A1AA',
  },
  skeleton: {
    base: '#ECECEF',
    highlight: '#F7F7F9',
  },
  gradient: {
    /** ЛИШЕ promo-блоки (Upgrade to Pro тощо) разом із frosted glass. */
    iridescent: ['#CFE3FF', '#F6D9F0', '#FFE3B8'] as const,
    /** Glow поверх iridescent (у світлій темі не потрібен). */
    iridescentGlow: 'rgba(184,164,248,0)',
    /** ЛИШЕ радіальна сфера асистента. */
    aiOrb: ['#7B5CFF', '#FF7AC6', '#FFB86B'] as const,
    /** Тло AI-блоків. */
    aiSurface: ['#EDE6FF', '#F6F1FF'] as const,
  },
};

/** Структура теми — спільна для light і dark. */
export type DSTheme = {
  [G in keyof typeof light]: {
    [K in keyof (typeof light)[G]]: (typeof light)[G][K] extends readonly string[]
      ? readonly [string, string, ...string[]]
      : string;
  };
};

const dark: DSTheme = {
  bg: {
    canvas: '#0D0D0F',
  },
  surface: {
    card: '#17171A',
    subtle: '#202024',
    elevated: '#1E1E22',
    overlay: 'rgba(0,0,0,0.60)',
    glass: 'rgba(23,23,26,0.72)',
  },
  border: {
    hairline: '#2A2A2F',
  },
  text: {
    primary: '#F4F4F5',
    secondary: '#A1A1AA',
    muted: '#6B6B73',
    onAction: '#111113',
    onAccent: '#111113',
  },
  action: {
    primary: '#F4F4F5',
    primaryHover: '#FFFFFF',
    primaryPressed: '#D4D4D8',
    secondary: '#202024',
    secondaryText: '#F4F4F5',
  },
  accent: {
    lime: '#CDEB3A',
    amber: '#F2B135',
    lavender: '#B8A4F8',
    lavenderSoft: 'rgba(184,164,248,0.22)',
    coral: '#E8543F',
  },
  status: {
    success: '#2FBF6C',
    warning: '#F2B135',
    danger: '#EF6450',
    info: '#6A90FA',
  },
  focus: {
    ring: '#B8A4F8',
  },
  state: {
    disabledBg: '#1A1A1D',
    disabledText: '#52525B',
  },
  skeleton: {
    base: '#1E1E22',
    highlight: '#26262B',
  },
  gradient: {
    iridescent: ['#1E3A66', '#5A2752', '#6B4419'],
    iridescentGlow: 'rgba(184,164,248,0.15)',
    aiOrb: ['#7B5CFF', '#FF7AC6', '#FFB86B'],
    aiSurface: ['rgba(123,92,255,0.25)', 'rgba(184,164,248,0.12)'],
  },
};

export type DSScheme = 'light' | 'dark';

/** Теми DS v2: `theme.light` / `theme.dark` — однакова структура. */
export const theme: Readonly<Record<DSScheme, DSTheme>> = { light: light as DSTheme, dark };

// ─── Liquid Glass (DS v2.1) ──────────────────────────────────────────────────

/**
 * Акценти шару скла. Кожен модуль має свій (див. {@link moduleAccent}), і
 * кожен акцент — це набір ролей, а не один колір, бо «той самий» лайм не
 * може бути водночас заливкою під темним текстом і текстом на білому склі:
 *
 *   solid  — велика заливка під text.onAccent (#111113): вибраний чип, бейдж,
 *            кільце в темній темі. Темний текст на всіх ≥ 4.99:1.
 *   fill   — тонкі індикатори (прогрес, кільця, графіки, крапки): ≥ 3:1 на
 *            склі (WCAG 1.4.11). У світлій — глибший тон, у темній = solid.
 *   ink    — іконки й текст акцентом на склі: ≥ 4.5:1 (світла ~4.6–5.6 на
 *            скляному тлі, темна ≥ 6.4). Завжди `#RRGGBB` — споживачі
 *            дописують альфу (`ink + '22'`).
 *   tint   — тонована «змивка» скла (rgba) — KPI-картки, icon-chip, активний
 *            пункт навігації.
 *   glow   — колір м'якого світіння (shadowColor) активного пункту / CTA.
 *   onSolid — колір тексту/іконки поверх solid.
 */
export type GlassAccent = 'lime' | 'amber' | 'lavender' | 'coral' | 'info' | 'success';

export type GlassAccentRoles = {
  solid: string;
  fill: string;
  ink: string;
  tint: string;
  glow: string;
  onSolid: string;
};

export type GlassMeshBlob = {
  color: string;
  /** Непрозорість центру плями (0…1); край — 0. */
  opacity: number;
  /** Центр і радіуси — частки ширини/висоти екрана (0…1). */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export type GlassTokens = {
  /** Основна скляна поверхня (картки, таб-бар, сайдбар). */
  surface: string;
  /** Щільніше скло під щільний текст: модалки, поповери, шапки, таб-бар. */
  surfaceStrong: string;
  /** Вкладене скло (рядки списку в картці, інпути, чипи) — БЕЗ власного блюру. */
  surfaceSubtle: string;
  /** Спекулярний обідок (1px) — світліший верхній край. */
  rim: string;
  /** Нижній/тіньовий край обідка. */
  rimShade: string;
  /** Внутрішній верхній відблиск (градієнт від цього кольору до прозорого). */
  highlight: string;
  /** Розмиття (CSS px, як на вебі) і насиченість — довідково, для паритету з вебом. */
  blur: number;
  saturate: number;
  /** Інтенсивність expo-blur (0–100), що на iOS візуально відповідає blur вище. */
  blurIntensity: number;
  blurTint: 'systemUltraThinMaterialLight' | 'systemUltraThinMaterialDark';
  /** М'яка розсіяна тінь скла (iOS); Android — без elevation (вона просвічує крізь напівпрозоре). */
  shadow: ViewStyle;
  /** Суцільні поверхні для «Зменшення прозорості» (iOS) / prefers-reduced-transparency (веб). */
  solid: { card: string; strong: string; subtle: string };
  /** Кольорова сітка canvas: основа + розмиті радіальні плями. */
  mesh: { base: string; blobs: readonly GlassMeshBlob[] };
  accent: Readonly<Record<GlassAccent, GlassAccentRoles>>;
};

const glassLight: GlassTokens = {
  surface: 'rgba(255,255,255,0.55)',
  surfaceStrong: 'rgba(255,255,255,0.72)',
  surfaceSubtle: 'rgba(255,255,255,0.38)',
  rim: 'rgba(255,255,255,0.75)',
  rimShade: 'rgba(17,17,19,0.06)',
  highlight: 'rgba(255,255,255,0.9)',
  blur: 24,
  saturate: 1.8,
  blurIntensity: 40,
  blurTint: 'systemUltraThinMaterialLight',
  shadow: Platform.select<ViewStyle>({
    android: {},
    default: {
      shadowColor: '#281E6E',
      shadowOpacity: 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
  }),
  solid: { card: '#FFFFFF', strong: '#FFFFFF', subtle: '#F5F5F7' },
  mesh: {
    base: '#F1F0F5',
    blobs: [
      { color: '#B8A4F8', opacity: 0.38, cx: 0.08, cy: 0.04, rx: 0.85, ry: 0.42 }, // лаванда, вгорі ліворуч
      { color: '#DDF54A', opacity: 0.3, cx: 0.98, cy: 0.1, rx: 0.7, ry: 0.34 },    // лайм, вгорі праворуч
      { color: '#F6B93B', opacity: 0.26, cx: 0.95, cy: 0.95, rx: 0.8, ry: 0.4 },   // бурштин, внизу праворуч
      { color: '#4F7CF7', opacity: 0.2, cx: 0.02, cy: 0.88, rx: 0.75, ry: 0.38 },  // синій, внизу ліворуч
      { color: '#E8543F', opacity: 0.12, cx: 0.9, cy: 0.52, rx: 0.5, ry: 0.26 },   // корал, по центру праворуч
    ],
  },
  accent: {
    lavender: { solid: '#B8A4F8', fill: '#8B6CFF', ink: '#6D4CF5', tint: 'rgba(184,164,248,0.30)', glow: '#8B6CFF', onSolid: '#111113' },
    lime:     { solid: '#DDF54A', fill: '#6E8C00', ink: '#4F6B00', tint: 'rgba(221,245,74,0.30)',  glow: '#B5D400', onSolid: '#111113' },
    amber:    { solid: '#F6B93B', fill: '#B87800', ink: '#8F5400', tint: 'rgba(246,185,59,0.26)',  glow: '#F6B93B', onSolid: '#111113' },
    coral:    { solid: '#E8543F', fill: '#E8543F', ink: '#C23A24', tint: 'rgba(232,84,63,0.18)',   glow: '#E8543F', onSolid: '#111113' },
    info:     { solid: '#4F7CF7', fill: '#4F7CF7', ink: '#2F5BD8', tint: 'rgba(79,124,247,0.20)',  glow: '#4F7CF7', onSolid: '#111113' },
    success:  { solid: '#22A55B', fill: '#1E9450', ink: '#127536', tint: 'rgba(34,165,91,0.20)',   glow: '#22A55B', onSolid: '#111113' },
  },
};

const glassDark: GlassTokens = {
  surface: 'rgba(30,30,36,0.52)',
  surfaceStrong: 'rgba(32,32,38,0.70)',
  surfaceSubtle: 'rgba(255,255,255,0.06)',
  rim: 'rgba(255,255,255,0.14)',
  rimShade: 'rgba(0,0,0,0.4)',
  highlight: 'rgba(255,255,255,0.16)',
  blur: 28,
  saturate: 1.6,
  blurIntensity: 45,
  blurTint: 'systemUltraThinMaterialDark',
  shadow: Platform.select<ViewStyle>({
    android: {},
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
    },
  }),
  solid: { card: '#17171A', strong: '#1E1E22', subtle: '#202024' },
  mesh: {
    base: '#0D0D10',
    blobs: [
      { color: '#7B5CFF', opacity: 0.32, cx: 0.06, cy: 0.04, rx: 0.85, ry: 0.42 }, // фіолет, вгорі ліворуч
      { color: '#4F7CF7', opacity: 0.22, cx: 0.98, cy: 0.12, rx: 0.7, ry: 0.34 },  // синій, вгорі праворуч
      { color: '#E8543F', opacity: 0.14, cx: 0.95, cy: 0.95, rx: 0.8, ry: 0.4 },   // корал, внизу праворуч
      { color: '#CDEB3A', opacity: 0.1, cx: 0.02, cy: 0.9, rx: 0.7, ry: 0.36 },    // лайм, внизу ліворуч
      { color: '#F2B135', opacity: 0.1, cx: 0.5, cy: 0.55, rx: 0.55, ry: 0.28 },   // бурштин, по центру
    ],
  },
  accent: {
    lavender: { solid: '#B8A4F8', fill: '#B8A4F8', ink: '#B8A4F8', tint: 'rgba(184,164,248,0.24)', glow: '#9B82FF', onSolid: '#111113' },
    lime:     { solid: '#CDEB3A', fill: '#CDEB3A', ink: '#CDEB3A', tint: 'rgba(205,235,58,0.20)',  glow: '#CDEB3A', onSolid: '#111113' },
    amber:    { solid: '#F2B135', fill: '#F2B135', ink: '#F2B135', tint: 'rgba(242,177,53,0.20)',  glow: '#F2B135', onSolid: '#111113' },
    coral:    { solid: '#FF8A75', fill: '#FF8A75', ink: '#FF8A75', tint: 'rgba(232,84,63,0.20)',   glow: '#E8543F', onSolid: '#111113' },
    info:     { solid: '#8FAEFF', fill: '#8FAEFF', ink: '#8FAEFF', tint: 'rgba(106,144,250,0.22)', glow: '#6A90FA', onSolid: '#111113' },
    success:  { solid: '#4CD787', fill: '#4CD787', ink: '#4CD787', tint: 'rgba(47,191,108,0.20)',  glow: '#2FBF6C', onSolid: '#111113' },
  },
};

/** Токени скла: `glass.light` / `glass.dark` (у компоненті — `useDS().g`). */
export const glass: Readonly<Record<DSScheme, GlassTokens>> = { light: glassLight, dark: glassDark };

/** Модулі, що мають власний акцент (ключі — як у вебі `--ds-glass-accent-*`). */
export type ModuleKey =
  | 'today' | 'tasks' | 'projects' | 'finance' | 'health' | 'time' | 'notes'
  | 'meetings' | 'calendar' | 'containers' | 'training' | 'settings'
  | 'auth' | 'workouts' | 'menu' | 'integrations' | 'archive' | 'ideas';

/**
 * Акцент модуля. Канон (tokens.json glass.moduleAccent) + мобільні доповнення:
 * auth/archive/ideas → lavender (нейтральний «бренд»), workouts → coral (родина
 * здоров'я), menu → success, integrations → info.
 */
export const moduleAccent: Readonly<Record<ModuleKey, GlassAccent>> = {
  today: 'lavender',
  tasks: 'lavender',
  projects: 'lavender',
  finance: 'lime',
  health: 'coral',
  time: 'amber',
  notes: 'amber',
  meetings: 'info',
  calendar: 'info',
  containers: 'amber',
  training: 'success',
  settings: 'lavender',
  auth: 'lavender',
  workouts: 'coral',
  menu: 'success',
  integrations: 'info',
  archive: 'lavender',
  ideas: 'amber',
};

/** Ролі акценту для схеми: `accentRoles('lime', isDark).ink`. */
export function accentRoles(accent: GlassAccent, isDark: boolean): GlassAccentRoles {
  return glass[isDark ? 'dark' : 'light'].accent[accent];
}

// ─── Форма ────────────────────────────────────────────────────────────────────

/** Радіуси: картки 20–24, вкладені блоки 14–16, контроли 12, кнопки й чипи — pill. */
export const radius = {
  card: 16,
  cardCompact: 14,
  nested: 12,
  nestedCompact: 10,
  control: 10,
  pill: 999,
} as const;

/** Сітка відступів 4 px. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  cardPadding: 24,
  cardPaddingCompact: 20,
  cardGap: 16,
  cardGapCompact: 12,
} as const;

/** Мінімальна зона дотику (HIG / Material). */
export const touchTarget = 44;

// ─── Глибина ──────────────────────────────────────────────────────────────────

/**
 * Тіні. Світла тема — ледь помітна м'яка тінь (RN не вміє дві тіні — беремо
 * ширшу «0 8px 24px rgba(17,17,19,.06)», Android — мінімальна elevation).
 * Темна — БЕЗ тіні: картка «піднімається» яскравішою поверхнею
 * (surface.elevated) і тонким світлим верхнім краєм.
 */
export const shadow: Readonly<Record<DSScheme, { card: ViewStyle; popover: ViewStyle }>> = {
  light: {
    card: Platform.select<ViewStyle>({
      android: { elevation: 1 },
      default: {
        shadowColor: '#111113',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
    popover: Platform.select<ViewStyle>({
      android: { elevation: 6 },
      default: {
        shadowColor: '#111113',
        shadowOpacity: 0.12,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
      },
    }),
  },
  dark: {
    card: {
      // elevation через яскравість: верхній світлий край замість тіні
      borderTopWidth: 1,
      borderTopColor: 'rgba(255,255,255,0.04)',
    },
    popover: Platform.select<ViewStyle>({
      android: { elevation: 8 },
      default: {
        shadowColor: '#000000',
        shadowOpacity: 0.5,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 12 },
      },
    }),
  },
};

// ─── Типографіка ──────────────────────────────────────────────────────────────

/**
 * Родини Manrope (@expo-google-fonts/manrope), вантажаться в app/_layout.tsx.
 * У RN кожна вага — окрема родина: fontWeight разом із кастомною родиною
 * на Android ігнорується, тож вагу задаємо САМЕ назвою родини.
 * Поки шрифт не завантажився (або не завантажився зовсім) — система
 * сама підставляє системний шрифт.
 */
export const fontFamily = {
  light: 'Manrope_300Light',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

/** Вага → родина Manrope (для стилів, що задають fontWeight числом). */
export function fontFor(weight: '300' | '400' | '500' | '600' | '700' | 300 | 400 | 500 | 600 | 700): string {
  switch (String(weight)) {
    case '300': return fontFamily.light;
    case '500': return fontFamily.medium;
    case '600': return fontFamily.semibold;
    case '700': return fontFamily.bold;
    default: return fontFamily.regular;
  }
}

const TABULAR: TextStyle['fontVariant'] = ['tabular-nums'];

/**
 * Типографічна шкала. Кольору тут немає навмисно — він береться з теми
 * (`t.text.primary` / `t.text.secondary`), бо стиль спільний для обох тем.
 * Числові значення — завжди з `fontVariant: ['tabular-nums']` (`type.numeric`).
 */
export const type = {
  /** KPI, лічильники, годинник: великі тонкі цифри, tracking −2%. */
  display: {
    fontFamily: fontFamily.light,
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: -0.96,
    fontVariant: TABULAR,
  } as TextStyle,
  /** Менший display (40) — у вузьких картках/планшетній сітці. */
  displaySm: {
    fontFamily: fontFamily.light,
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -0.8,
    fontVariant: TABULAR,
  } as TextStyle,
  /** Одиниця біля display-числа (k, s, /5, ₴): ~45% розміру, text.secondary. */
  displayUnit: {
    fontFamily: fontFamily.regular,
    fontSize: 22,
    lineHeight: 26,
    fontVariant: TABULAR,
  } as TextStyle,
  /** H1 сторінки. */
  h1: {
    fontFamily: fontFamily.medium,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.32,
  } as TextStyle,
  /** H2 картки. */
  h2: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 22,
  } as TextStyle,
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,
  bodyMedium: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    lineHeight: 20,
  } as TextStyle,
  /** Підписи/мета — колір t.text.secondary (не muted!). */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
  } as TextStyle,
  /** Підпис кнопки / чипа. */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    lineHeight: 18,
  } as TextStyle,
  /** Домішка для будь-якого числа. */
  numeric: { fontVariant: TABULAR } as TextStyle,
} as const;

// ─── Легасі-експорти шаблону Expo (лишаються робочими) ───────────────────────

/**
 * Старі `Colors` / `Fonts` з шаблону Expo — перепризначені на значення DS v2,
 * щоб ThemedText/ThemedView/useThemeColor і далі працювали без змін.
 */
export const Colors = {
  light: {
    text: light.text.primary,
    background: light.bg.canvas,
    tint: light.action.primary,
    icon: light.text.secondary,
    tabIconDefault: light.text.secondary,
    tabIconSelected: light.action.primary,
  },
  dark: {
    text: dark.text.primary,
    background: dark.bg.canvas,
    tint: dark.action.primary,
    icon: dark.text.secondary,
    tabIconDefault: dark.text.secondary,
    tabIconSelected: dark.action.primary,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: fontFamily.regular,
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: fontFamily.regular,
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "Manrope, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
