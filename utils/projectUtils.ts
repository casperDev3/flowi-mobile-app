/**
 * utils/projectUtils.ts — чиста логіка стану проєкту.
 *
 * Живе окремо від екрана, щоб її можна було перевірити тестом: імпорт
 * app/projects.tsx тягне за собою AsyncStorage і все дерево компонентів.
 */

/** Шаблон проєкту при створенні (контракт §3.3): «Робочий» / «Простий». */
export type ProjectTemplate = 'work' | 'simple';

/** Розділи проєкту, що вмикаються/вимикаються в налаштуваннях (Огляд і Завдання — завжди). */
export interface ProjectModules {
  meetings: boolean;
  notes: boolean;
  time: boolean;
  budget: boolean;
  sprints: boolean;
}

/** work → усі розділи; simple → лише Огляд і Завдання. */
export const MODULES_BY_TEMPLATE: Record<ProjectTemplate, ProjectModules> = {
  work: { meetings: true, notes: true, time: true, budget: true, sprints: true },
  simple: { meetings: false, notes: false, time: false, budget: false, sprints: false },
};

export interface ProjectLike {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  /**
   * Момент архівації. Стан ЯВНИЙ, а не похідний із задач: інакше проєкт із
   * незавершеними задачами неможливо заморозити, а порожній проєкт (0 із 0)
   * довелося б рахувати виконаним на 100%.
   */
  archivedAt?: string;
  /**
   * Шаблон і вимкнені/увімкнені розділи (контракт §3.3). Адитивні поля —
   * проєкти, створені до цієї фази, поля не мають, і `projectModules()`
   * нижче трактує їхню відсутність як «усе увімкнено» (той стан, у якому вони
   * й існували раніше: жодного перемикача розділів не було).
   */
  template?: ProjectTemplate;
  modules?: ProjectModules;
}

export function isProjectArchived(project: Pick<ProjectLike, 'archivedAt'>): boolean {
  return !!project.archivedAt;
}

/**
 * Реальний набір увімкнених розділів проєкту.
 *
 * `modules` явний → він і є істина (навіть якщо частково вимкнений шаблоном
 * `work` — користувач міг вимкнути розділ вручну). Немає `modules`, але є
 * `template` → дефолт шаблону. Немає жодного поля (проєкт старіший за цю
 * фазу) → усе увімкнено, як було до появи налаштувань розділів.
 */
export function projectModules(project: Pick<ProjectLike, 'template' | 'modules'>): ProjectModules {
  if (project.modules) return project.modules;
  if (project.template) return MODULES_BY_TEMPLATE[project.template];
  return MODULES_BY_TEMPLATE.work;
}

/**
 * Виставити або зняти архівність.
 *
 * При поверненні з архіву ключ саме ВИДАЛЯЄТЬСЯ, а не ставиться в undefined.
 * Причина в синку: undefined зникає при JSON-серіалізації, тож потрібний
 * результат вийшов би випадково, як побічний ефект. Явне видалення робить
 * намір видимим у коді й не залежить від деталей серіалізації.
 */
export function setProjectArchived<T extends ProjectLike>(project: T, archived: boolean): T {
  if (archived) return { ...project, archivedAt: new Date().toISOString() };
  const { archivedAt: _removed, ...rest } = project;
  void _removed;
  return rest as T;
}

// ─── Колір проєкту як тінт панелі табів (NAT-08) ─────────────────────────────

/**
 * Колір проєкту — вибір користувача з палітри `utils/projectColors.ts`, і в
 * ній є кольори, які як ТЕКСТ на світлому тлі не читаються: нативний прогін
 * зміряв активний таб простору проєкту `#F59E0B` на `#F7F2FF` = 1.95:1 —
 * тобто найгірше видимий елемент панелі позначав «ви тут», і був гіршим за
 * неактивні вкладки (2.24:1).
 *
 * Тому колір проєкту лишається ідентичністю (картка, крапка біля задачі,
 * заливки), а для дрібного тексту й гліфів із нього виводиться темніший
 * (на світлому тлі) або світліший (на темному) відтінок — рівно доти, доки
 * не набереться потрібний контраст. Відтінок, який уже проходить, не
 * чіпається взагалі.
 */

function srgbChannel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** `#rgb`, `#rrggbb` або `rrggbb` → [r,g,b]; нерозпізнане → null. */
function parseHexColor(value: string): [number, number, number] | null {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
  if (full.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Відносна яскравість WCAG 2.x. Нерозпізнаний колір — 0 (вважаємо чорним). */
export function relativeLuminance(color: string): number {
  const rgb = parseHexColor(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(srgbChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Коефіцієнт контрасту WCAG 2.x між двома непрозорими кольорами. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Найближчий до `color` відтінок, що дає щонайменше `minContrast` проти
 * `background`.
 *
 * Йдемо кроками по 5% у бік, протилежний тлу (світле тло → до чорного,
 * темне → до білого). Крок дрібний навмисно: мета — лишити колір ВПІЗНАВАНИМ
 * (помаранчевий має лишитись помаранчевим), а не замінити його на чорний.
 * Якщо не вистачило й повного змішування, віддаємо крайній відтінок — він
 * гарантовано найконтрастніший із можливих.
 */
export function readableTint(color: string, background: string, minContrast = 4.5): string {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  if (contrastRatio(color, background) >= minContrast) return color;

  const towardWhite = relativeLuminance(background) < 0.5;
  const target = towardWhite ? 255 : 0;
  for (let step = 1; step <= 20; step += 1) {
    const amount = step / 20;
    const candidate = toHex(rgb.map(v => v + (target - v) * amount));
    if (contrastRatio(candidate, background) >= minContrast) return candidate;
  }
  return toHex(rgb.map(() => target));
}
