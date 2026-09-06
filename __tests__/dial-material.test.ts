/**
 * __tests__/dial-material.test.ts — матеріал циферблатів.
 *
 * Перевіряється не «гарно», а те, що ламається мовчки: напрямок світла один на
 * всі пари, прозорість треку не з'їдається змішуванням, а світла й темна теми
 * дають РІЗНИЙ матеріал, а не той самий із іншою прозорістю.
 */
import {
  SINK_MAX_FONT,
  dialMaterial,
  edgeGlassFade,
  mix,
  parseColor,
  sunkenTextStyle,
  trailSteps,
  withAlpha,
  type DialMaterialInput,
} from '@/utils/dialMaterial';

/** Палітра 'time' із constants/tokens — та сама, що приходить у циферблати. */
const DARK: DialMaterialInput = {
  text: '#EEF0FF',
  sub: 'rgba(238,240,255,0.62)',
  border: 'rgba(255,255,255,0.09)',
  accent: '#6366F1',
};
const LIGHT: DialMaterialInput = {
  text: '#0D1033',
  sub: 'rgba(13,16,51,0.58)',
  border: 'rgba(200,205,255,0.5)',
  accent: '#6366F1',
};

const alphaOf = (c: string) => parseColor(c).a;
const lumaOf = (c: string) => {
  const { r, g, b } = parseColor(c);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('розбір кольору', () => {
  test('шість шістнадцяткових', () => {
    expect(parseColor('#6366F1')).toEqual({ r: 99, g: 102, b: 241, a: 1 });
  });

  test('три шістнадцяткові розгортаються', () => {
    expect(parseColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test('rgba з дробовою прозорістю', () => {
    expect(parseColor('rgba(255,255,255,0.09)')).toEqual({ r: 255, g: 255, b: 255, a: 0.09 });
  });

  test('сміття не валить рендер, а стає чорним', () => {
    expect(parseColor('нічого')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });
});

describe('змішування', () => {
  test('прозорість береться від бази, а не від домішки', () => {
    // Трек мусить лишитись напівпрозорим: інакше він перестане пропускати фон
    // картки й читатиметься як пляма.
    expect(alphaOf(mix('rgba(255,255,255,0.09)', '#000000', 0.5))).toBeCloseTo(0.09);
  });

  test('нульова частка не міняє нічого', () => {
    expect(mix('#6366F1', '#FFFFFF', 0)).toBe('rgba(99,102,241,1)');
  });

  test('повна частка дає домішку', () => {
    expect(mix('#6366F1', '#FFFFFF', 1)).toBe('rgba(255,255,255,1)');
  });

  test('частка за межами [0,1] затискається', () => {
    expect(mix('#000000', '#FFFFFF', 5)).toBe(mix('#000000', '#FFFFFF', 1));
  });

  test('withAlpha лишає колір, міняє лише прозорість', () => {
    expect(withAlpha('#6366F1', 0.25)).toBe('rgba(99,102,241,0.25)');
  });
});

describe.each([
  ['темна', DARK, true],
  ['світла', LIGHT, false],
] as const)('матеріал — %s тема', (_name, colors, isDark) => {
  const m = dialMaterial(colors, isDark);

  test('світло згори-ліворуч', () => {
    expect(m.light).toEqual({ x1: '0', y1: '0', x2: '1', y2: '1' });
  });

  test('канавка темніша з боку джерела світла', () => {
    // Втоплене: стінка з боку світла в тіні, протилежна його ловить.
    expect(lumaOf(m.track.from)).toBeLessThan(lumaOf(m.track.to));
  });

  test('опукле кільце — навпаки, світліше з боку джерела', () => {
    expect(lumaOf(m.ring.from)).toBeGreaterThan(lumaOf(m.ring.to));
  });

  test('канавка й кільце освітлені зустрічно', () => {
    const grooveDelta = lumaOf(m.track.to) - lumaOf(m.track.from);
    const ringDelta = lumaOf(m.ring.to) - lumaOf(m.ring.from);
    expect(Math.sign(grooveDelta)).toBe(-Math.sign(ringDelta));
  });

  test('трек лишається напівпрозорим', () => {
    expect(alphaOf(m.track.from)).toBeCloseTo(alphaOf(colors.border));
    expect(alphaOf(m.track.to)).toBeCloseTo(alphaOf(colors.border));
  });

  test('крапка опукла, лунка втоплена', () => {
    expect(lumaOf(m.dome.from)).toBeGreaterThan(lumaOf(m.dome.to));
    expect(lumaOf(m.well.from)).toBeLessThan(lumaOf(m.well.to));
  });

  test('скло згасає в прозоре', () => {
    expect(alphaOf(m.glass.from)).toBeGreaterThan(0);
    expect(alphaOf(m.glass.to)).toBe(0);
  });

  test('слід має хвіст, що згасає в ніщо', () => {
    expect(m.trail.steps).toBeGreaterThan(1);
    expect(m.trail.tail).toBeLessThan(m.trail.head);
    expect(m.trail.tail).toBe(0);
  });
});

describe('дві теми — різний матеріал, а не та сама тінь', () => {
  const dark = dialMaterial(DARK, true);
  const light = dialMaterial(LIGHT, false);

  test('у світлій тіні беруть чорнило теми, а не чистий чорний', () => {
    // Чорний по синюватому border (rgba(200,205,255,0.5)) дає брудний фіолет —
    // тому домішка світлої теми це colors.text, а не '#000'.
    const ink = parseColor(LIGHT.text);
    const shaded = parseColor(light.track.from);
    expect(shaded.b).toBeGreaterThan(shaded.r);
    expect(ink.b).toBeGreaterThan(ink.r);
  });

  test('шов темний в ОБОХ темах', () => {
    // У світлій темі тінь під текстом світла (letterpress), і якби шов брав
    // її, картка табла отримала б білу смугу замість тріщини.
    expect(lumaOf(dark.seam)).toBeLessThan(60);
    expect(lumaOf(light.seam)).toBeLessThan(60);
    expect(parseColor(dark.seam).a).toBeGreaterThan(0.2);
    expect(parseColor(light.seam).a).toBeGreaterThan(0.2);
  });

  test('кант у темній ловить світло, у світлій кладе тінь', () => {
    expect(lumaOf(dark.rim)).toBeGreaterThan(200);
    expect(lumaOf(light.rim)).toBeLessThan(60);
  });

  test('втоплений текст зсунутий у різні боки', () => {
    expect(dark.sink.offsetY).toBeLessThan(0);
    expect(light.sink.offsetY).toBeGreaterThan(0);
  });

  test('матеріали не збігаються поле в поле', () => {
    expect(dark.track).not.toEqual(light.track);
    expect(dark.glass).not.toEqual(light.glass);
    expect(dark.sink).not.toEqual(light.sink);
  });
});

describe('втоплений текст гаситься кеглем', () => {
  const m = dialMaterial(DARK, true);

  test('дрібний кегль отримує тінь', () => {
    expect(sunkenTextStyle(m, 18).textShadowColor).toBe(m.sink.color);
  });

  test('на межі ще отримує', () => {
    expect(sunkenTextStyle(m, SINK_MAX_FONT).textShadowColor).toBeDefined();
  });

  test('великий кегль лишається чистим', () => {
    // На 200pt зсув в один пункт читається як розмита копія, а не як глибина.
    expect(sunkenTextStyle(m, SINK_MAX_FONT + 1)).toEqual({});
    expect(sunkenTextStyle(m, 200)).toEqual({});
  });
});

describe('ланки мʼякого сліду', () => {
  const m = dialMaterial(DARK, true);

  test('на превʼю аркуша вибору слід найдешевший', () => {
    // DialPicker монтує всі десять циферблатів по 96pt одночасно.
    expect(trailSteps(m, 96)).toBe(2);
  });

  test('у сітці — половина ланок', () => {
    expect(trailSteps(m, 160)).toBe(3);
  });

  test('на весь екран — повний слід', () => {
    expect(trailSteps(m, 520)).toBe(m.trail.steps);
  });

  test('ланок ніколи не менше двох: одна ланка це знову гостра риска', () => {
    for (const size of [1, 40, 96, 119, 120, 199, 200, 900]) {
      expect(trailSteps(m, size)).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('скло по краях стрічки', () => {
  const W = 300;
  const FADE = 48;

  test('на межі риска зникає', () => {
    expect(edgeGlassFade(0, W, FADE)).toBe(0);
    expect(edgeGlassFade(W, W, FADE)).toBe(0);
  });

  test('за межею теж нічого', () => {
    expect(edgeGlassFade(-10, W, FADE)).toBe(0);
    expect(edgeGlassFade(W + 10, W, FADE)).toBe(0);
  });

  test('усередині смуги наростає рівно', () => {
    expect(edgeGlassFade(FADE / 2, W, FADE)).toBeCloseTo(0.5);
    expect(edgeGlassFade(FADE, W, FADE)).toBe(1);
  });

  test('у центрі повна сила', () => {
    expect(edgeGlassFade(W / 2, W, FADE)).toBe(1);
  });

  test('симетрично щодо центру', () => {
    for (const x of [3, 20, 47, 100]) {
      expect(edgeGlassFade(x, W, FADE)).toBeCloseTo(edgeGlassFade(W - x, W, FADE));
    }
  });

  test('без смуги згасання нічого не гасне', () => {
    expect(edgeGlassFade(0, W, 0)).toBe(1);
  });
});
