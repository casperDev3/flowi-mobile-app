// ─── Дизайн-токени Flowi ─────────────────────────────────────────────────────
// Фундамент B8: radius / spacing / палітра-фабрика (B5-контрастний sub ≥0.62/0.58)

/** Радіуси заокруглення (в пікселях) */
export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 24,
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
