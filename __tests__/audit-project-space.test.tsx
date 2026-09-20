/**
 * __tests__/audit-project-space.test.tsx — зона «простір проєкту».
 *
 * Охороняє знахідки аудиту E2, які живуть у `app/project/[id]/*`,
 * `constants/projectNav.ts` і `utils/projectUtils.ts`:
 *
 *  · L2   — вісім нижніх табів у 402pt (50pt на таб, чотири підписи з восьми
 *           обрізані). Тепер у панелі лишається стільки розділів, скільки
 *           вміщується з читабельним підписом, решта — у «Ще».
 *  · NAT-08 — активний таб брав колір проєкту як є: `#F59E0B` на світлому
 *           тлі панелі = 1.95:1, тобто «ви тут» було видно ГІРШЕ за неактивні
 *           вкладки.
 *  · ERR-09 — збій завантаження учасників малювався як «у проєкті нікого
 *           немає», без пояснення й без «Повторити».
 *  · L3   — `keyboardShouldPersistTaps` у шести екранах проєкту: перший тап
 *           по кнопці поруч із полем лише ховав клавіатуру.
 *  · A11Y-03 — перемикачі розділів без `accessibilityLabel`.
 *
 * Числа контрасту рахуються тим самим способом, що й на пристрої (WCAG 2.x
 * відносна яскравість проти ЗМІРЯНОГО тла панелі — `TAB_BAR_BG_MEASURED`).
 */
import fs from 'fs';
import path from 'path';

import {
  isProjectOverflowActive,
  PROJECT_NAV_ITEMS,
  PROJECT_TAB_MIN_WIDTH,
  projectRoute,
  projectTabCapacity,
  splitProjectNav,
  visibleProjectNavItems,
} from '@/constants/projectNav';
import { TAB_BAR_BG_MEASURED } from '@/constants/nav';
import { contrastRatio, MODULES_BY_TEMPLATE, readableTint } from '@/utils/projectUtils';

/** Ширина екрана стенду (iPhone 17 Pro), на якій зміряно 50pt на таб. */
const DEVICE_WIDTH = 402;

const PROJECT_DIR = path.join(__dirname, '..', 'app', 'project', '[id]');
const readScreen = (name: string) => fs.readFileSync(path.join(PROJECT_DIR, name), 'utf8');

/**
 * Той самий файл без коментарів: пояснення, ЧОМУ старе значення прибрали,
 * цитує це старе значення — і сторож, що шукає його підрядком, ловив би
 * власний коментар.
 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// ─── L2 ──────────────────────────────────────────────────────────────────────

describe('L2: розділи проєкту в нижній панелі', () => {
  const workOwner = visibleProjectNavItems(MODULES_BY_TEMPLATE.work, 'owner');

  test('стан за замовчуванням — це справді вісім розділів', () => {
    // Передумова знахідки: шаблон work вмикає всі опційні розділи, Бюджет
    // додається власнику. Якщо це колись зміниться, решта тестів тут
    // охороняє вже іншу сцену.
    expect(workOwner).toHaveLength(8);
  });

  test('на 402pt у панелі лишається не більше п’яти кнопок разом із «Ще»', () => {
    const { tabs, overflow } = splitProjectNav(workOwner, DEVICE_WIDTH);
    expect(overflow.length).toBeGreaterThan(0);
    // +1 — сам «Ще».
    expect(tabs.length + 1).toBeLessThanOrEqual(projectTabCapacity(DEVICE_WIDTH));
  });

  test('кожній кнопці лишається ширина, на якій підпис не ріжеться', () => {
    // Саме це й падало до правки: 402 / 8 = 50.25pt проти 80pt, зміряних на
    // особистій панелі, де підписи цілі.
    const { tabs } = splitProjectNav(workOwner, DEVICE_WIDTH);
    const perTab = DEVICE_WIDTH / (tabs.length + 1);
    expect(perTab).toBeGreaterThanOrEqual(PROJECT_TAB_MIN_WIDTH);
  });

  test('жоден розділ не зник: панель + «Ще» = повний список, у порядку маніфесту', () => {
    const { tabs, overflow } = splitProjectNav(workOwner, DEVICE_WIDTH);
    const order = PROJECT_NAV_ITEMS.map(item => item.key);
    const seen = [...tabs, ...overflow].map(item => item.key);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
      .toEqual(workOwner.map(item => item.key));
    // Порядок САМОЇ панелі — маніфестний, а не за пріоритетом.
    expect(tabs.map(i => i.key)).toEqual(
      workOwner.filter(i => tabs.some(t => t.key === i.key)).map(i => i.key),
    );
  });

  test('щоденне лишається внизу, рідкісне йде в «Ще»', () => {
    const { tabs, overflow } = splitProjectNav(workOwner, DEVICE_WIDTH);
    expect(tabs.map(i => i.key)).toEqual(expect.arrayContaining(['overview', 'tasks']));
    // Налаштування — найрідший вхід із восьми; саме воно й мусить поступитись.
    expect(overflow.map(i => i.key)).toContain('settings');
  });

  test('коли розділів мало — «Ще» не з’являється взагалі', () => {
    const simple = visibleProjectNavItems(MODULES_BY_TEMPLATE.simple, 'owner');
    const { tabs, overflow } = splitProjectNav(simple, DEVICE_WIDTH);
    expect(tabs).toHaveLength(simple.length);
    expect(overflow).toHaveLength(0);
  });

  test('вузький екран вміщує менше, але панель не вироджується', () => {
    expect(projectTabCapacity(320)).toBeGreaterThanOrEqual(3);
    expect(projectTabCapacity(0)).toBe(3);
    const { tabs } = splitProjectNav(workOwner, 320);
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });

  test('«Ще» світиться, поки відкритий його розділ', () => {
    const { overflow } = splitProjectNav(workOwner, DEVICE_WIDTH);
    const hidden = overflow[0];
    expect(isProjectOverflowActive(projectRoute('p-1', hidden.key), overflow)).toBe(true);
    expect(isProjectOverflowActive(projectRoute('p-1', 'overview'), overflow)).toBe(false);
    expect(isProjectOverflowActive('/projects', overflow)).toBe(false);
  });

  test('розділ «Ще» має файл екрана', () => {
    expect(fs.existsSync(path.join(PROJECT_DIR, 'more.tsx'))).toBe(true);
  });
});

// ─── NAT-08 ──────────────────────────────────────────────────────────────────

describe('NAT-08: колір проєкту як тінт активного таба', () => {
  const PALETTE = ['#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'];

  test('арифметика відтворює замір із пристрою', () => {
    // Якби формула розходилась із тією, якою міряли, усе нижче охороняло б
    // вигадану сцену. Звіт дав 1.95:1 для #F59E0B на світлій панелі.
    expect(contrastRatio('#F59E0B', TAB_BAR_BG_MEASURED.light)).toBeCloseTo(1.95, 1);
  });

  test('кожен колір палітри доводиться до 4.5:1 в обох темах', () => {
    for (const color of PALETTE) {
      for (const bg of [TAB_BAR_BG_MEASURED.light, TAB_BAR_BG_MEASURED.dark]) {
        expect(contrastRatio(readableTint(color, bg), bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('колір, який і так проходить, не чіпається', () => {
    expect(readableTint('#7C3AED', TAB_BAR_BG_MEASURED.light)).toBe('#7C3AED');
  });

  test('колір лишається впізнаваним, а не стає чорним', () => {
    const fixed = readableTint('#F59E0B', TAB_BAR_BG_MEASURED.light);
    const [r, g, b] = [1, 3, 5].map(i => parseInt(fixed.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);   // усе ще теплий
    expect(g).toBeGreaterThan(b);
    expect(r).toBeGreaterThan(40);  // не чорний
  });

  test('нерозпізнаний колір повертається як є, а не ламає панель', () => {
    expect(readableTint('rgba(1,2,3,0.5)', TAB_BAR_BG_MEASURED.light)).toBe('rgba(1,2,3,0.5)');
  });
});

// ─── L3 і A11Y-03: сторожі на джерелі ────────────────────────────────────────

describe('L3: keyboardShouldPersistTaps у формах простору проєкту', () => {
  // Тестом через рендер це не доводиться: fireEvent.press ігнорує
  // keyboardShouldPersistTaps, тож єдина чесна перевірка — наявність пропа
  // там, де звіт зміряв глуху кнопку.
  test.each(['tasks.tsx', 'budget.tsx', 'members.tsx', 'time.tsx', 'sprints.tsx', 'settings.tsx'])(
    '%s',
    file => {
      const src = readScreen(file);
      const scrollViews = src.match(/<ScrollView[\s\S]*?>/g) ?? [];
      expect(scrollViews.length).toBeGreaterThan(0);
      expect(scrollViews[0]).toContain('keyboardShouldPersistTaps');
    },
  );
});

describe('NAT-07 / NAT-08 / L1: сама панель простору проєкту', () => {
  const layout = codeOnly(readScreen('_layout.tsx'));

  test('підпис таба масштабується під Dynamic Type, але зі стелею', () => {
    // Було `tabBarLabelStyle: {fontSize: 10}`: нативний прогін зміряв нуль
    // зростання підпису на п'яти кроках збільшення шрифту.
    expect(layout).not.toMatch(/tabBarLabelStyle/);
    expect(layout).toContain('maxFontSizeMultiplier');
    expect(layout).toContain('TAB_LABEL_FONT_SIZE');
  });

  test('активний тінт проходить через readableTint, а не бере колір проєкту як є', () => {
    expect(layout).toContain('readableTint(');
    expect(layout).not.toMatch(/tabBarActiveTintColor:\s*project\?\.color/);
  });

  test('неактивний тінт — спільний із особистою панеллю (A11Y-06)', () => {
    expect(layout).toContain('TAB_BAR_TINT');
    expect(layout).not.toContain("rgba(80,60,120,0.45)");
  });

  test('мертвої смуги 10pt угорі панелі більше немає (L1)', () => {
    expect(layout).not.toMatch(/paddingTop:\s*10/);
  });
});

describe('A11Y-01: кнопки-іконки простору проєкту мають ім’я', () => {
  // Іконка сама по собі скрінрідеру не каже нічого: RN не виводить ім'я з
  // IconSymbol, тож така кнопка озвучується просто «кнопка».
  const touchable = /<(TouchableOpacity|Pressable)\b[\s\S]*?(?:\/>|>[\s\S]*?<\/\1>)/g;

  /**
   * Два перевпорядкувачі статусу (вгору/вниз у Налаштуваннях) лишаються без
   * імені свідомо: у словнику немає ключів «вище»/«нижче», а вигадувати
   * кириличний літерал в обхід i18n — це просто інша знахідка (A11Y-09).
   * Список ЯВНИЙ, щоб борг був видимий, а не розчинився в «здебільшого все
   * гаразд».
   */
  const KNOWN_GAPS = [
    'move(col, -1)', 'move(col, 1)',
    // Перемикач вигляду Завдань (список/дошка/календар/таймлайн): у словнику
    // є `list`, `calendar` і `ganttTitle`, але немає «Дошки» — а підписати
    // три кнопки з чотирьох гірше, ніж жодної: читалка озвучувала б набір
    // напіввипадково. Потрібен один узгоджений набір ключів.
    'setView(v.key)',
  ];

  test('жодної нової кнопки лише з іконкою й без accessibilityLabel', () => {
    const files = ['../../projects.tsx', ...fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.tsx'))];
    const offenders: string[] = [];
    for (const file of files) {
      const src = fs.readFileSync(path.join(PROJECT_DIR, file), 'utf8');
      for (const tag of src.match(touchable) ?? []) {
        if (tag.includes('accessibilityLabel')) continue;
        if (!tag.includes('IconSymbol') || tag.includes('<Text')) continue;
        if (KNOWN_GAPS.some(gap => tag.includes(gap))) continue;
        offenders.push(`${file}: ${tag.slice(0, 70).replace(/\s+/g, ' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('A11Y-03: перемикачі розділів мають ім’я', () => {
  test('кожен <Switch> у просторі проєкту має accessibilityLabel', () => {
    const files = fs.readdirSync(PROJECT_DIR).filter(f => f.endsWith('.tsx'));
    const offenders: string[] = [];
    for (const file of files) {
      for (const tag of readScreen(file).match(/<Switch[\s\S]*?\/>/g) ?? []) {
        if (!tag.includes('accessibilityLabel')) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});
