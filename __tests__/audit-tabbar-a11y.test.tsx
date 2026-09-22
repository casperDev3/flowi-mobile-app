/**
 * __tests__/audit-tabbar-a11y.test.tsx — зона «токени, таб-бар і цілі дотику».
 *
 * Охороняє чотири знахідки аудиту E2 (статичний + нативний звіти):
 *
 *  · A11Y-06 — тінт неактивних вкладок давав 2.23:1 у світлій темі та 3.21:1
 *    у темній при нормі 4.5:1. Числа тут рахуються тим самим способом, що й
 *    на пристрої: WCAG 2.x відносна яскравість проти ЗМІРЯНОГО тла панелі.
 *  · A11Y-08 — стрілки місяця в CalendarGrid були 36×36 без hitSlop.
 *  · A11Y-10 — Skeleton крутив Animated.loop попри «Зменшення руху»,
 *    UndoToast возив тост на 20pt.
 *  · L1 / NAT-07 — мертва смуга 10pt угорі панелі та підпис таба, що не
 *    реагує на Dynamic Type.
 *
 * Перевірка контрасту навмисно живе в тесті, а не в рантаймі: кольори —
 * константи, і зламати їх можна тільки комітом.
 */
import fs from 'fs';
import path from 'path';

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'dark' }));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({ tr: { undo: 'Скасувати' }, lang: 'uk', setLang: () => {} }),
}));

import React from 'react';
import { AccessibilityInfo, Animated, TouchableOpacity } from 'react-native';

import { Skeleton, SKELETON_REDUCED_OPACITY } from '@/components/shared/Skeleton';
import { useUndoToast } from '@/components/shared/UndoToast';
import { CALENDAR_NAV_HIT_SLOP, CalendarGrid } from '@/components/tasks/CalendarGrid';
import {
  TAB_BAR_BG_MEASURED,
  TAB_BAR_TINT,
  TAB_LABEL_FONT_SIZE,
  TAB_LABEL_MAX_FONT_SCALE,
} from '@/constants/nav';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

// ─── WCAG 2.x: коефіцієнт контрасту ──────────────────────────────────────────

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ─── A11Y-06 ─────────────────────────────────────────────────────────────────

describe('A11Y-06: контраст підписів та іконок таб-бара', () => {
  test('власна арифметика відтворює заміри з пристрою', () => {
    // Якби формула розходилася з тією, якою міряли на пристрої, усі числа
    // нижче охороняли б вигадану сцену. Старі кольори — контрольна точка:
    // нативний звіт дав для них 2.23 / 3.21.
    // Композит старих alpha-кольорів поверх зміряного тла — рівно ті пікселі,
    // які нативний прогін зняв зі скріншота: #ACA0C2 і #69686E.
    const oldLightInactive = '#ACA0C2';  // rgba(80,60,120,0.45) на #F7F2FF
    const oldDarkInactive  = '#69686E';  // rgba(255,255,255,0.35) на #191720
    expect(contrast(oldLightInactive, TAB_BAR_BG_MEASURED.light)).toBeCloseTo(2.23, 1);
    expect(contrast(oldDarkInactive, TAB_BAR_BG_MEASURED.dark)).toBeCloseTo(3.21, 1);
    // І активні — для них звіт дав 5.18 / 6.51.
    expect(contrast('#7C3AED', TAB_BAR_BG_MEASURED.light)).toBeCloseTo(5.18, 1);
    expect(contrast('#A78BFA', TAB_BAR_BG_MEASURED.dark)).toBeCloseTo(6.51, 1);
  });

  test.each([
    ['light', TAB_BAR_TINT.light, TAB_BAR_BG_MEASURED.light],
    ['dark', TAB_BAR_TINT.dark, TAB_BAR_BG_MEASURED.dark],
  ])('%s: і активний, і неактивний тінт проходять 4.5:1', (_name, tint, bg) => {
    // 4.5:1 — норма AA для тексту менше 18pt; підпис таба — 11pt.
    expect(contrast(tint.inactive, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tint.active, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test.each([
    ['light', TAB_BAR_TINT.light, TAB_BAR_BG_MEASURED.light],
    ['dark', TAB_BAR_TINT.dark, TAB_BAR_BG_MEASURED.dark],
  ])('%s: активний лишається помітнішим за неактивний', (_name, tint, bg) => {
    // Інакше «полагодили» б контраст ціною головного: вкладка «ви тут»
    // не повинна програвати сусіднім у яскравості.
    expect(contrast(tint.active, bg)).toBeGreaterThan(contrast(tint.inactive, bg));
  });

  test('неактивні іконки проходять і пом’якшену норму 3:1', () => {
    // Іконка — нетекстовий елемент (WCAG 1.4.11), їй вистачає 3:1;
    // раніше не вистачало й цього.
    expect(contrast(TAB_BAR_TINT.light.inactive, TAB_BAR_BG_MEASURED.light)).toBeGreaterThanOrEqual(3);
    expect(contrast(TAB_BAR_TINT.dark.inactive, TAB_BAR_BG_MEASURED.dark)).toBeGreaterThanOrEqual(3);
  });
});

// ─── L1 + NAT-07: розкладка панелі й масштабування підпису ───────────────────

describe('L1 / NAT-07: панель табів', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'app', '(tabs)', '_layout.tsx'),
    'utf8',
  );

  test('у tabBarStyle немає paddingTop: висота панелі й зона дотику збігаються', () => {
    // Висота панелі задана числом, тож @react-navigation віднімає нижній
    // інсет ЗСЕРЕДИНИ (BottomTabBar.js:87-90, :250-252). Будь-який paddingTop
    // тут — це смуга, яку видно, але не натиснути.
    expect(src).not.toMatch(/paddingTop:\s*\d/);
  });

  test('підпис таба масштабується під Dynamic Type, але зі стелею', () => {
    // Було: tabBarLabelStyle + типове для bottom-tabs allowFontScaling=false,
    // тобто 10pt назавжди при будь-якому системному кеглі.
    expect(src).toMatch(/allowFontScaling/);
    expect(src).toMatch(/maxFontSizeMultiplier=\{TAB_LABEL_MAX_FONT_SCALE\}/);
    expect(src).not.toMatch(/tabBarLabelStyle:/);
  });

  test('усі п’ять видимих вкладок віддають підпис через tabLabel()', () => {
    const labels = src.match(/tabBarLabel: tabLabel\(tr\.\w+\)/g) ?? [];
    expect(labels).toHaveLength(5);
  });

  test('кегль і стеля лишаються в межах, де підпис не ріжеться', () => {
    // 11pt — мінімум, який iOS сам тримає в таб-барі.
    expect(TAB_LABEL_FONT_SIZE).toBeGreaterThanOrEqual(11);
    // Висота контенту панелі — 54pt (88 − 34 інсету). Іконка 26 + 2 відступу
    // лишають підпису ~26pt; 11 × 1.4 = 15.4pt тексту вкладаються з запасом,
    // а 2× вже ні.
    expect(TAB_LABEL_MAX_FONT_SCALE).toBeGreaterThan(1);
    expect(TAB_LABEL_FONT_SIZE * TAB_LABEL_MAX_FONT_SCALE).toBeLessThanOrEqual(26 * 0.75);
  });
});

// ─── A11Y-08: цілі дотику ────────────────────────────────────────────────────

describe('A11Y-08: стрілки місяця в CalendarGrid', () => {
  const COLORS = { text: '#fff', sub: '#999', accent: '#7C3AED' };

  function renderGrid() {
    let tree: any;
    act(() => {
      tree = create(
        <CalendarGrid
          year={2026}
          month={8}
          markedDays={new Set<string>()}
          selectedDate={null}
          todayDate={new Date(2026, 8, 20)}
          weeks={[[null, 1, 2, 3, 4, 5, 6]]}
          onPrevMonth={() => {}}
          onNextMonth={() => {}}
          onSelectDay={() => {}}
          c={COLORS}
          months={['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
            'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень']}
          weekdays={['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']}
        />,
      );
    });
    return tree;
  }

  test('обидві стрілки мають hitSlop (раніше — жодна)', () => {
    const tree = renderGrid();
    const navButtons = tree.root
      .findAllByType(TouchableOpacity)
      .filter((n: any) => {
        const flat = Object.assign({}, ...[n.props.style].flat(2).filter(Boolean));
        return flat.width === 36 && flat.height === 36;
      });
    expect(navButtons).toHaveLength(2);
    for (const btn of navButtons) {
      expect(btn.props.hitSlop).toEqual(CALENDAR_NAV_HIT_SLOP);
    }
  });

  test('36pt плюс slop дають рівно 44×44 за HIG', () => {
    const s = CALENDAR_NAV_HIT_SLOP;
    expect(36 + s.left + s.right).toBe(44);
    expect(36 + s.top + s.bottom).toBe(44);
  });
});

// ─── A11Y-10: Reduce Motion ──────────────────────────────────────────────────

describe('A11Y-10: Reduce Motion', () => {
  let listeners: ((v: boolean) => void)[] = [];

  function mockReduceMotion(enabled: boolean) {
    listeners = [];
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(enabled);
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
      event: string,
      handler: (v: boolean) => void,
    ) => {
      if (event === 'reduceMotionChanged') listeners.push(handler);
      return { remove: () => { listeners = listeners.filter(h => h !== handler); } };
    }) as any);
  }

  afterEach(() => { jest.restoreAllMocks(); });

  /** Непрозорість, з якою скелетон реально намальований. */
  function skeletonOpacity(tree: any): number {
    const node = tree.root.findByType(Animated.View);
    const flat = Object.assign({}, ...[node.props.style].flat(2).filter(Boolean));
    return flat.opacity.__getValue();
  }

  /**
   * Дерева розмонтовуємо після кожної перевірки: Animated.loop без Reduce
   * Motion крутиться вічно і тримає сьют живим після останнього expect.
   */
  const mounted: any[] = [];
  afterEach(async () => {
    await act(async () => { mounted.splice(0).forEach(t => t.unmount()); });
  });

  async function renderSkeleton() {
    let tree: any;
    await act(async () => { tree = create(<Skeleton />); });
    mounted.push(tree);
    return tree;
  }

  test('Skeleton: при ввімкненому Reduce Motion стоїть статично', async () => {
    mockReduceMotion(true);
    const tree = await renderSkeleton();
    // До правки тут лишалося дно пульсації 0.5 — цикл крутився далі.
    expect(skeletonOpacity(tree)).toBe(SKELETON_REDUCED_OPACITY);
  });

  test('Skeleton: без Reduce Motion пульсація лишається', async () => {
    mockReduceMotion(false);
    const loopSpy = jest.spyOn(Animated, 'loop');
    const tree = await renderSkeleton();
    expect(loopSpy).toHaveBeenCalled();
    expect(skeletonOpacity(tree)).not.toBe(SKELETON_REDUCED_OPACITY);
  });

  test('Skeleton: вимикання Reduce Motion на льоту повертає пульсацію', async () => {
    mockReduceMotion(true);
    const tree = await renderSkeleton();
    expect(skeletonOpacity(tree)).toBe(SKELETON_REDUCED_OPACITY);

    // Саме заради цього хук слухає AccessibilityInfo, а не читає прапорець
    // раз при завантаженні модуля, як useReducedMotion() з reanimated.
    const loopSpy = jest.spyOn(Animated, 'loop');
    await act(async () => { listeners.forEach(h => h(false)); });
    expect(loopSpy).toHaveBeenCalled();
  });

  /** Зсув тоста по вертикалі в момент показу. */
  function toastTranslateY(tree: any): number {
    const node = tree.root.findByType(Animated.View);
    const flat = Object.assign({}, ...[node.props.style].flat(2).filter(Boolean));
    return flat.transform[0].translateY.__getValue();
  }

  async function renderToast() {
    let api: any;
    function Probe() { api = useUndoToast(true); return api.element; }
    let tree: any;
    await act(async () => { tree = create(<Probe />); });
    mounted.push(tree);
    return { tree, api: () => api };
  }

  test('UndoToast: при Reduce Motion тост не їде, а лише проявляється', async () => {
    mockReduceMotion(true);
    const { tree, api } = await renderToast();
    await act(async () => { api().show('Завдання виконано', () => {}); });
    // До правки стартова точка була 20pt нижче місця — тобто рух.
    // Без розмонтування (див. afterEach) 4-секундний таймер авто-приховування
    // переживе тест і впаде вже після того, як Jest прибрав середовище.
    expect(toastTranslateY(tree)).toBe(0);
  });

  test('UndoToast: без Reduce Motion виїзд знизу лишається', async () => {
    mockReduceMotion(false);
    const { tree, api } = await renderToast();
    await act(async () => { api().show('Завдання виконано', () => {}); });
    expect(toastTranslateY(tree)).toBe(20);
  });
});
