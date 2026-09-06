/**
 * __tests__/dial-depth.test.tsx — глибина циферблатів.
 *
 * Перевіряється три речі, кожна з яких ламається мовчки й помітна лише на
 * пристрої:
 *   1. обидві теми справді доходять до малювання (а не лишаються прапорцем);
 *   2. ті, кому глибину дано свідомо НЕ було, її й не отримали;
 *   3. плавний режим монтується й не тягне анімованих вузлів там, де він
 *      вимкнений.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';

import { TimerDial } from '@/components/time/dials/TimerDial';
import { DIALS, type DialId } from '@/utils/timerDials';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

/** Палітра 'time' — та сама, що приходить із getScreenColors. */
const COLORS = {
  text: '#EEF0FF',
  sub: 'rgba(238,240,255,0.62)',
  border: 'rgba(255,255,255,0.09)',
  accent: '#6366F1',
};

const AT = 23 * 60 + 41;

/**
 * Кому глибина протипоказана — і чому саме. Список тут, а не в коментарі,
 * щоб «зроблю однаково заради одноманітності» ламало тест, а не лише смак.
 */
const NO_DEPTH: DialId[] = [
  // Гола типографіка кеглем size×0.3: втоплення на 170pt читається як розмита
  // копія гліфа. До того ж це DEFAULT_DIAL і фолбек parseDialId.
  'digits',
  // Тримається на OFF_OPACITY = 0.09: тінь того ж порядку прозорості зіллється
  // з погашеними сегментами, і цифра перестане читатись.
  'segment',
];

function render(dial: DialId, isDark: boolean, smooth = false) {
  const startedAt = new Date(Date.now() - AT * 1000).toISOString();
  let tree: any;
  act(() => {
    tree = create(
      <TimerDial
        dial={dial}
        startedAt={startedAt}
        size={320}
        colors={COLORS}
        isDark={isDark}
        smooth={smooth}
      />,
    );
  });
  return tree;
}

describe('обидві теми', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T12:00:00.000Z').getTime());
  });
  afterEach(() => jest.useRealTimers());

  for (const meta of DIALS) {
    test(`${meta.id} — малюється в обох темах`, () => {
      const dark = render(meta.id, true);
      const light = render(meta.id, false);
      expect(dark.toJSON()).toBeTruthy();
      expect(light.toJSON()).toBeTruthy();
      act(() => { dark.unmount(); light.unmount(); });
    });
  }

  for (const meta of DIALS.filter(d => !NO_DEPTH.includes(d.id))) {
    test(`${meta.id} — тема міняє матеріал, а не лише прапорець`, () => {
      // Палітра однакова, різниться ЛИШЕ isDark. Якщо дерева збіглися —
      // матеріал до малювання не дійшов, і «скло» в світлій темі виявиться
      // тим самим, що в темній.
      const dark = render(meta.id, true);
      const light = render(meta.id, false);
      expect(JSON.stringify(dark.toJSON())).not.toEqual(JSON.stringify(light.toJSON()));
      act(() => { dark.unmount(); light.unmount(); });
    });
  }

  for (const id of NO_DEPTH) {
    test(`${id} — глибини не отримав свідомо`, () => {
      const dark = render(id, true);
      const light = render(id, false);
      expect(JSON.stringify(dark.toJSON())).toEqual(JSON.stringify(light.toJSON()));
      act(() => { dark.unmount(); light.unmount(); });
    });
  }
});

describe('кожен лишився собою', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T12:00:00.000Z').getTime());
  });
  afterEach(() => jest.useRealTimers());

  /**
   * Плоский список вузлів дерева. Дивитись доводиться на вже нормалізований
   * react-native-svg вигляд: <Polygon> стає RNSVGPath із атрибутом d, а
   * кольори — числами, тож перевіряємо геометрію, а не палітру.
   *
   * Дерево знімається ДО unmount, а перевіряється після: інакше провалене
   * очікування лишає циферблат змонтованим, і спільний тікер тече в наступні
   * тести.
   */
  const snapshot = (dial: DialId): any[] => {
    const tree = render(dial, true);
    const out: any[] = [];
    const walk = (n: any) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      out.push(n);
      (n.children ?? []).forEach(walk);
    };
    walk(tree.toJSON());
    act(() => tree.unmount());
    return out;
  };

  test('пісочний годинник лишився вісімкою з чітким контуром', () => {
    // Скло не має права ані замінити контур, ані розмити його: саме контур і
    // робить фігуру пісочним годинником.
    const outline = snapshot('hourglass').filter(
      n => n.props?.d === 'M20 10 80 10 50 50 80 90 20 90 50 50z' && n.props?.strokeWidth,
    );
    expect(outline).toHaveLength(1);
    expect(outline[0].props.strokeWidth).toBe(2.4);
  });

  test('табло лишило погашені сегменти привидом', () => {
    expect(snapshot('segment').some(n => n.props?.opacity === 0.09)).toBe(true);
  });

  test('кільця лишили градацію прозорості — це і є ієрархія', () => {
    const found = snapshot('rings').map(n => n.props?.opacity);
    for (const o of [1, 0.62, 0.34]) expect(found).toContain(o);
  });

  test('стрічка лишила мітку «зараз» нерухомою й непритемненою', () => {
    // Мітка поза маскою-віньєткою і поза шаром, що їде: це єдина річ на
    // стрічці, яка не має згасати.
    const marker = snapshot('tape').filter(
      n => n.type === 'RNSVGLine' && n.props?.strokeWidth === 2.4,
    );
    expect(marker).toHaveLength(1);
    expect(marker[0].props.opacity).toBeUndefined();
  });

  test('сітка секунд лишилась шістдесятьма крапками', () => {
    const circles = snapshot('dots').filter(n => n.type === 'RNSVGCircle');
    expect(circles).toHaveLength(60);
  });

  test('табло-картка лишила поперечний шов', () => {
    // Градієнт тіла лягає ПІД шов: без шва картка стає цифрою в рамці.
    const seams = snapshot('flip').filter(
      n => n.type === 'View' && JSON.stringify(n.props?.style ?? {}).includes('"top":"50%"'),
    );
    expect(seams.length).toBeGreaterThan(0);
  });
});

describe('плавний хід', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T12:00:00.000Z').getTime());
  });
  afterEach(() => jest.useRealTimers());

  for (const meta of DIALS) {
    test(`${meta.id} — переживає плавний режим`, () => {
      const tree = render(meta.id, true, true);
      expect(tree.toJSON()).toBeTruthy();
      act(() => { jest.advanceTimersByTime(2000); });
      expect(tree.toJSON()).toBeTruthy();
      act(() => tree.unmount());
    });
  }

  test('без smooth анімованих вузлів не зʼявляється зовсім', () => {
    // Головне про економію: дрібні мусять коштувати рівно стільки ж, скільки
    // коштували, — один спільний тікер на всіх і жодного кадру понад секунду.
    const trees: any[] = [];
    act(() => {
      for (const meta of DIALS) {
        trees.push(create(
          <TimerDial
            dial={meta.id}
            startedAt={new Date(Date.now() - AT * 1000).toISOString()}
            size={160}
            colors={COLORS}
            isDark
          />,
        ));
      }
    });
    expect(jest.getTimerCount()).toBe(1);
    act(() => { for (const t of trees) t.unmount(); });
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('матеріал приходить токенами, а не літералами', () => {
  const DIAL_FILES = ['RadialDials.tsx', 'FiguralDials.tsx', 'NumericDials.tsx'];

  for (const file of DIAL_FILES) {
    test(`${file} — жодного rgba(...) у коді циферблата`, () => {
      // Саме тут глибина й розповзається: щойно один циферблат намалює тінь
      // власним rgba(0,0,0,…), світла тема в нього стане копією темної, а
      // виправляти доведеться в десяти місцях замість одного.
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'components', 'time', 'dials', file),
        'utf8',
      );
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      expect(code).not.toMatch(/rgba?\(/);
    });
  }
});
