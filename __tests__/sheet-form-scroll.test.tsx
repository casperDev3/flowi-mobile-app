/**
 * __tests__/sheet-form-scroll.test.tsx — аркуші-форми мусять ГОРТАТИСЬ.
 *
 * Нативний прогін (NAT-01): у формах «Новий проект», «Нова звичка», «Нова
 * нарада» і «Новий контейнер» кнопки «Зберегти»/«Додати» ПРИСУТНІ в дереві
 * доступності, але на екрані від них видно смужку 1–2 px, і жоден свайп
 * усередині аркуша нічого не прокручує. Наслідок буквальний: проєкт, звичку,
 * нараду й контейнер неможливо створити з інтерфейсу.
 *
 * Причина — не відсутність ScrollView (він там був), а стеля висоти,
 * записана ВІДСОТКОМ: `maxHeight: '90%'`. Відсоток у Yoga рахується від
 * висоти батька, а батько аркуша — обгортка з відступами, у якої висота
 * `auto`. Від невизначеної висоти відсоток не рахується, обмеження зникає,
 * аркуш виростає на натуральну висоту вмісту — і ScrollView усередині
 * отримує рамку рівно по вмісту (`contentSize == frameSize`), тобто гортати
 * йому НЕМА ЧОГО. Ті самі аркуші, де стеля стоїть числом від вікна
 * (`explore.tsx`, `banks.tsx`), на пристрої працювали.
 *
 * Тут перевіряється рівно те, що піддається перевірці без пристрою:
 * стеля — число, обгортка вміє стискатись, вміст лежить у прокрутному
 * контейнері й цей контейнер не глушить прокрутку. Остаточний вердикт —
 * за прогоном на симуляторі.
 */

import fs from 'fs';
import path from 'path';

const WINDOW = { width: 390, height: 844, scale: 3, fontScale: 1 };

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => WINDOW,
}));

// useResponsive тягне expo-router транзитивно; маршрут аркушу не потрібен.
jest.mock('expo-router', () => ({ usePathname: () => '/' }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

import React from 'react';
import { ScrollView } from 'react-native';

import { MeetingFormSheet } from '@/components/shared/MeetingFormSheet';
import {
  SHEET_MAX_HEIGHT_RATIO,
  sheetSurfaceStyle,
} from '@/hooks/use-content-width';
import { allTranslations } from '@/store/translations';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const ROOT = path.join(__dirname, '..');

function flat(style: any): any {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flat));
  return style ?? {};
}

// ── Чиста геометрія ──────────────────────────────────────────────────────────

describe('sheetSurfaceStyle — стеля аркуша', () => {
  it('віддає ЧИСЛО, а не відсоток', () => {
    // Регрес, що коштував чотирьох екранів: рядок '90%' тут тихо перетворює
    // обмеження на ніщо, бо батько аркуша має height:auto.
    const st = sheetSurfaceStyle(844);
    expect(typeof st.maxHeight).toBe('number');
    expect(st.maxHeight).toBe(Math.round(844 * SHEET_MAX_HEIGHT_RATIO));
  });

  it('перераховується разом з вікном', () => {
    const phone = sheetSurfaceStyle(844).maxHeight as number;
    const tablet = sheetSurfaceStyle(1366).maxHeight as number;
    expect(tablet).toBeGreaterThan(phone);
  });

  it('лишає смужку фону зверху — аркуш не на весь екран', () => {
    const h = 844;
    expect(sheetSurfaceStyle(h).maxHeight as number).toBeLessThan(h);
  });

  it('уміє стискатись: стеля від ВІКНА не знає про клавіатуру', () => {
    // KeyboardAvoidingView стискає контейнер, а аркуш і далі хоче свої 90%
    // екрана. Без flexShrink flex-end-контейнер не може його підтиснути —
    // і низ форми знову їде за край.
    expect(sheetSurfaceStyle(844).flexShrink).toBe(1);
  });
});

// ── Стилі семи уражених аркушів ──────────────────────────────────────────────

/** Аркуш + його обгортка в StyleSheet кожного ураженого екрана. */
const SHEETS: { file: string; sheet: RegExp; wrapper: RegExp }[] = [
  { file: 'components/shared/MeetingFormSheet.tsx', sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*wrapper:\s*\{.*$/m },
  { file: 'app/projects.tsx',      sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrapper:\s*\{.*$/m },
  { file: 'app/health-habits.tsx', sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
  { file: 'app/health-meds.tsx',   sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
  { file: 'app/containers.tsx',    sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetOuter:\s*\{.*$/m },
  { file: 'app/budget.tsx',        sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrapper:\s*\{.*$/m },
  // Зона «Здоровʼя»: той самий механізм (відсоток від батька з height:auto).
  { file: 'app/health-vaccines.tsx', sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
  { file: 'app/health-checkups.tsx', sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
  { file: 'components/health/HealthEntryModal.tsx', sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrapper:\s*\{.*$/m },
  { file: 'components/health/BodyEntrySheet.tsx',   sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
  { file: 'components/health/QuickAddSheet.tsx',    sheet: /^\s*sheet:\s*\{.*$/m, wrapper: /^\s*sheetWrap:\s*\{.*$/m },
];

describe('аркуші, зламані NAT-01', () => {
  it.each(SHEETS.map((s) => [s.file, s] as const))(
    '%s — стеля аркуша не задана відсотком',
    (_name, spec) => {
      const src = fs.readFileSync(path.join(ROOT, spec.file), 'utf8');
      // Ні в StyleSheet, ні в inline-стилі на місці виклику.
      expect(src).not.toMatch(/maxHeight:\s*'\d+%'/);
      expect(src).not.toMatch(/maxHeight:\s*"\d+%"/);
    },
  );

  it.each(SHEETS.map((s) => [s.file, s] as const))(
    '%s — обгортка аркуша вміє стискатись',
    (_name, spec) => {
      const src = fs.readFileSync(path.join(ROOT, spec.file), 'utf8');
      const line = src.match(spec.wrapper)?.[0];
      expect(line).toBeDefined();
      expect(line).toMatch(/flexShrink:\s*1/);
    },
  );

  it.each(SHEETS.map((s) => [s.file] as const))(
    '%s — висота аркуша приходить із useSheetSurface()',
    (file) => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(src).toMatch(/useSheetSurface/);
    },
  );

  /**
   * NAT-03: Pressable-обгортка аркуша існує лише заради stopPropagation, але
   * на iOS вона сама стає елементом доступності й склеює ВСЮ форму в один
   * вузол — VoiceOver читає аркуш однією фразою на 40+ підписів і не має
   * усередині жодного керованого контролу. accessible={false} знімає
   * склеювання, не чіпаючи ні onPress, ні accessibilityViewIsModal.
   */
  it.each(SHEETS.map((s) => [s.file] as const))(
    '%s — обгортка аркуша не склеює форму в один елемент доступності',
    (file) => {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      // Обгортка буває і в один рядок, і розбита на кілька: беремо відкривний
      // тег цілком (перший `>`, що не є частиною `=>`) і лишаємо ті, що
      // існують лише заради stopPropagation.
      const wrappers = (src.match(/<Pressable(?:[^>]|(?<==)>)*>/g) ?? [])
        .filter((w) => w.includes('stopPropagation'));
      expect(wrappers.length).toBeGreaterThan(0);
      for (const w of wrappers) {
        expect(w).toMatch(/accessible=\{false\}/);
        // Ізоляція фонового екрана мусить лишитись на тій самій обгортці.
        expect(w).toMatch(/accessibilityViewIsModal/);
      }
    },
  );
});

// ── Живе дерево однієї з форм ────────────────────────────────────────────────

const trees: any[] = [];

function openMeetingForm() {
  let tree: any;
  act(() => {
    tree = create(
      <MeetingFormSheet
        visible
        onClose={jest.fn()}
        onSave={jest.fn()}
        isDark={false}
        lang="uk"
        tr={allTranslations.uk}
      />,
    );
  });
  trees.push(tree);
  return tree;
}

describe('MeetingFormSheet — форма справді прокрутна', () => {
  afterEach(() => {
    act(() => { while (trees.length) trees.pop().unmount(); });
  });

  it('вміст лежить у ScrollView', () => {
    const tree = openMeetingForm();
    expect(tree.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
  });

  it('кнопка збереження — ВСЕРЕДИНІ прокрутного контейнера', () => {
    // Вона ж і була недосяжна: у дереві доступності є, на екрані немає.
    const tree = openMeetingForm();
    const scroll = tree.root.findAllByType(ScrollView)[0];
    const labels = scroll
      .findAllByType('Text')
      .map((n: any) => (Array.isArray(n.props.children) ? n.props.children.join('') : n.props.children))
      .filter((v: any) => typeof v === 'string');
    expect(labels).toContain('Додати');
  });

  it('зовнішній ScrollView не глушить прокрутку bounces={false}', () => {
    // На обрізаному аркуші це вбивало навіть натяк на те, що є куди гортати.
    const tree = openMeetingForm();
    const scroll = tree.root.findAllByType(ScrollView)[0];
    expect(scroll.props.bounces).not.toBe(false);
  });

  it('аркуш обмежений числом від висоти вікна', () => {
    const tree = openMeetingForm();
    const expected = sheetSurfaceStyle(WINDOW.height).maxHeight;
    const bounded = tree.root
      .findAll((n: any) => typeof n.type === 'string')
      .map((n: any) => flat(n.props?.style))
      .filter((st: any) => st.maxHeight === expected && st.flexShrink === 1);
    expect(bounded.length).toBeGreaterThan(0);
  });

  it('у жодному вузлі аркуша не лишилось відсоткової стелі', () => {
    const tree = openMeetingForm();
    const percent = tree.root
      .findAll((n: any) => typeof n.type === 'string')
      .map((n: any) => flat(n.props?.style).maxHeight)
      .filter((v: any) => typeof v === 'string' && v.endsWith('%'));
    expect(percent).toEqual([]);
  });
});
