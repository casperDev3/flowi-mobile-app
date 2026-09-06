/**
 * utils/dialMaterial.ts — матеріал циферблатів: об'єм і скло як ТОКЕНИ.
 *
 * Глибина описана тут один раз і для обох тем, а не малюється в кожному з
 * десяти циферблатів. Причина проста й перевірена на цьому ж екрані: десять
 * незалежних редизайнів × дві теми неминуче розходяться, і вже за місяць у
 * «Дуги» тінь одна, а в «Орбіти» інша.
 *
 * Матеріал віддається ДАНИМИ, а не шарами малювання. Це не косметика: якби
 * об'єм додавався накладеним півпрозорим колом поверх кожного треку, кількість
 * вузлів SVG подвоїлася б — а екран повноекранних таймерів тримає дисплей
 * увімкненим (useKeepAwake) годинами й малює до десяти циферблатів одночасно
 * (аркуш вибору). Тому тут рахуються ГОТОВІ пари кольорів: один <Circle> як і
 * був, просто з градієнтною обводкою замість плоскої.
 *
 * Напрямок світла ОДИН на всі циферблати — згори-ліворуч. Різні напрямки в
 * сусідніх клітинках читаються як різні сцени, а не як одна панель приладів.
 *
 * Світла й темна теми — не той самий матеріал із іншою прозорістю. У світлій
 * скло це м'яка тінь чорнилом теми (чистий чорний по синюватому border дає
 * брудний фіолет), у темній — підсвічений край.
 */

/** Рівно те, що матеріалу треба знати про палітру екрана. */
export interface DialMaterialInput {
  text: string;
  sub: string;
  border: string;
  accent: string;
}

export interface ColorPair {
  /** Освітлений край — згори-ліворуч. */
  from: string;
  /** Протилежний край — знизу-праворуч. */
  to: string;
}

export interface DialMaterial {
  isDark: boolean;
  /**
   * Напрямок світла в частках bounding box. Один на всі градієнти матеріалу,
   * тож усі циферблати освітлені однаково.
   */
  light: { x1: string; y1: string; x2: string; y2: string };
  /** Канавка під треком: втоплене кільце темніше саме там, куди світить світло. */
  track: ColorPair;
  /** Опукле тіло кільця чи дуги: блиск згори-ліворуч, тінь знизу-праворуч. */
  ring: ColorPair;
  /** Опукла крапка (заповнена секунда, тіло на орбіті). */
  dome: ColorPair;
  /** Втоплена лунка (незаповнена секунда). */
  well: ColorPair;
  /** Відблиск усередині силуету — скло. Другий стоп прозорий. */
  glass: ColorPair;
  /** Кант картки й безеля: у темній ловить світло, у світлій кладе тінь. */
  rim: string;
  /**
   * Шов — тріщина в матеріалі, а не відблиск: темна в ОБОХ темах, інакше в
   * світлій вона стала б білою смугою й картка табла перетворилась би на
   * цифру в рамці.
   */
  seam: string;
  /** Втоплений текст: колір і зсув тіні. Напрямок протилежний до світла. */
  sink: { color: string; offsetY: number; radius: number };
  /** Скільки ланок у м'якому сліді секунди й до чого згасає хвіст. */
  trail: { steps: number; head: number; tail: number };
}

// ── Кольорова арифметика ─────────────────────────────────────────────────────
// Матеріал змішує кольори наперед, тому потрібен розбір і того, що приходить
// із токенів: '#RRGGBB' у text/accent, але 'rgba(…)' у border і sub.

interface RGBA { r: number; g: number; b: number; a: number }

const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function parseColor(input: string): RGBA {
  const c = input.trim();

  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
    return {
      r: parseInt(full.slice(0, 2), 16) || 0,
      g: parseInt(full.slice(2, 4), 16) || 0,
      b: parseInt(full.slice(4, 6), 16) || 0,
      a: full.length >= 8 ? (parseInt(full.slice(6, 8), 16) || 0) / 255 : 1,
    };
  }

  const nums = c.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 3) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: Number(nums[0]),
    g: Number(nums[1]),
    b: Number(nums[2]),
    a: nums.length > 3 ? Number(nums[3]) : 1,
  };
}

const toRgba = ({ r, g, b, a }: RGBA): string =>
  `rgba(${clamp255(r)},${clamp255(g)},${clamp255(b)},${Math.round(Math.max(0, Math.min(1, a)) * 1000) / 1000})`;

/**
 * Домішує `over` в `base` на частку t, ЗБЕРІГАЮЧИ прозорість base.
 *
 * Прозорість зберігається навмисно: border у палітрі 'time' напівпрозорий
 * (rgba(255,255,255,0.09) у темній), і він мусить лишитися напівпрозорим —
 * інакше трек перестане пропускати фон картки й почне читатись як пляма.
 */
export function mix(base: string, over: string, t: number): string {
  const a = parseColor(base);
  const b = parseColor(over);
  const k = Math.max(0, Math.min(1, t));
  return toRgba({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
    a: a.a,
  });
}

/** Той самий колір із заданою прозорістю. */
export function withAlpha(color: string, alpha: number): string {
  return toRgba({ ...parseColor(color), a: alpha });
}

// ── Токени ───────────────────────────────────────────────────────────────────

/**
 * Понад цей кегль втоплення читається не як глибина, а як дефект рендеру:
 * зсув в один пункт під цифрою заввишки 200pt — це просто розмита копія.
 * Тому тінь під текстом гаситься розміром, а не рішенням кожного циферблата.
 */
export const SINK_MAX_FONT = 48;

/** Наскільки блиск і тінь домішуються в базовий колір. */
// Світла тема бере МЕНШЕ блиску, ніж здається інтуїтивно: домішка 0.55 білого
// в accent робить дугу блідою й міняє сам колір акценту, а не додає об'єму.
const DARK  = { sheen: 0.18, shade: 0.42, glass: 0.10, dome: 0.22 };
const LIGHT = { sheen: 0.28, shade: 0.18, glass: 0.32, dome: 0.26 };

const WHITE = '#FFFFFF';

export function dialMaterial(colors: DialMaterialInput, isDark: boolean): DialMaterial {
  const k = isDark ? DARK : LIGHT;

  // Тінь у темній темі — чистий чорний: під нею фон уже майже чорний.
  // У світлій — чорнило самої теми (#0D1033 для 'time'): чорний по синюватому
  // border дає брудний фіолет, і це видно навіть на превʼю 96pt.
  const shade = isDark ? '#000000' : colors.text;
  const sheen = WHITE;

  return {
    isDark,
    // Згори-ліворуч → донизу-праворуч. Одне джерело світла на всі циферблати.
    light: { x1: '0', y1: '0', x2: '1', y2: '1' },

    // Канавка: втоплене темніє з боку джерела світла, а протилежна стінка його
    // ловить. Саме ця пара й читається як «трек має глибину», а не як тінь.
    track: {
      from: mix(colors.border, shade, k.shade),
      to:   mix(colors.border, sheen, k.sheen),
    },
    // Опукле — навпаки: блиск там, звідки світло.
    ring: {
      from: mix(colors.accent, sheen, k.sheen),
      to:   mix(colors.accent, shade, k.shade),
    },
    dome: {
      from: mix(colors.accent, sheen, k.dome),
      to:   mix(colors.accent, shade, k.dome),
    },
    well: {
      from: mix(colors.border, shade, k.shade),
      to:   mix(colors.border, sheen, k.sheen * 0.6),
    },
    glass: {
      from: withAlpha(sheen, k.glass),
      to:   withAlpha(sheen, 0),
    },
    rim: isDark ? withAlpha(WHITE, 0.22) : withAlpha(colors.text, 0.12),
    seam: isDark ? withAlpha('#000000', 0.5) : withAlpha(colors.text, 0.28),

    // Тінь під втопленим текстом лягає ПРОТИ світла: у темній це темна смуга
    // згори, у світлій — світлий відбиток знизу (класичний letterpress).
    sink: isDark
      ? { color: withAlpha('#000000', 0.55), offsetY: -1, radius: 2 }
      : { color: withAlpha(WHITE, 0.8), offsetY: 1, radius: 0 },

    trail: { steps: 6, head: 0.34, tail: 0 },
  };
}

/**
 * Скло по краях смуги: риска згасає, наближаючись до межі вікна.
 *
 * Стрічці не можна давати тіней — риски там завтовшки 1.0–1.6 при
 * непрозорості 0.28, і тінь їх просто з'їдає. Тому матеріал стрічки це скло, а
 * скло тут — згасання, помножене на власну непрозорість риски.
 *
 * Множник, а не <Mask>: маска живе ВСЕРЕДИНІ полотна й у плавному режимі
 * поїхала б разом зі шкалою, тобто скло рухалось би разом із тим, що під ним, —
 * а це вже не скло.
 *
 * Множник рахується від положення риски НА ЕКРАНІ. У плавному режимі полотно
 * їде вліво, тож викликач мусить віднімати проїзд — інакше непрозорість
 * заморожується там, де риска стартувала, і щосекунди стрибає.
 */
export function edgeGlassFade(x: number, width: number, fade: number): number {
  if (fade <= 0) return 1;
  const distance = Math.min(x, width - x);
  if (distance <= 0) return 0;
  return Math.min(1, distance / fade);
}

/**
 * Скільки ланок дати м'якому сліду на полотні такого розміру.
 *
 * Слід із градієнтом — це не одна дуга, а кілька коротких із спадною
 * непрозорістю: обвід із градієнтом уздовж САМОЇ дуги в SVG не задається, а
 * градієнт по bounding box повертався б разом із дугою і читався як мул.
 * Ціна — вузли, і саме тому на дрібному полотні ланок менше: аркуш вибору
 * монтує всі десять циферблатів одночасно, і там слід однаково не видно.
 */
export function trailSteps(material: DialMaterial, size: number): number {
  if (size < 120) return 2;
  if (size < 200) return Math.max(2, Math.round(material.trail.steps / 2));
  return material.trail.steps;
}

/**
 * Стиль втопленого тексту для конкретного кегля.
 *
 * Повертає порожній об'єкт, коли кегль завеликий: див. SINK_MAX_FONT.
 */
export function sunkenTextStyle(
  material: DialMaterial,
  fontSize: number,
): { textShadowColor?: string; textShadowOffset?: { width: number; height: number }; textShadowRadius?: number } {
  if (fontSize > SINK_MAX_FONT) return {};
  return {
    textShadowColor: material.sink.color,
    textShadowOffset: { width: 0, height: material.sink.offsetY },
    textShadowRadius: material.sink.radius,
  };
}
