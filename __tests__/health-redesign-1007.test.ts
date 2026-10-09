/**
 * Редизайн розділу «Здоровʼя» (07.10): вигляд як у Фінансів, один акцент на
 * вкладках, планшет — шість вкладок в один ряд і дві masonry-колонки карток.
 * Тут — чисті правила компонування й палітри.
 */
import fs from 'fs';
import path from 'path';

import {
  HEALTH_TAB_GUTTER, healthTabColumns, healthTabContentStyle,
} from '@/components/health/HealthLayout';
import {
  HEALTH_TABS, HEALTH_TAB_GAP, HEALTH_TAB_ICON_MIN_WIDTH, HEALTH_TAB_META, healthTabBarLayout,
} from '@/components/health/HealthTabs';
import { Layout, sizeClassFor } from '@/constants/tokens';
import { getHealthColors } from '@/utils/healthTheme';

jest.mock('expo-router', () => ({ usePathname: () => '/' }));

const ROOT = path.join(__dirname, '..');

describe('healthTabColumns', () => {
  it('телефон — одна колонка, medium і expanded — дві', () => {
    expect(healthTabColumns('compact')).toBe(1);
    expect(healthTabColumns('medium')).toBe(2);
    expect(healthTabColumns('expanded')).toBe(2);
  });

  it('межі класів вікна — ті самі, що в constants/tokens', () => {
    expect(healthTabColumns(sizeClassFor(599))).toBe(1);
    expect(healthTabColumns(sizeClassFor(600))).toBe(2);
    expect(healthTabColumns(sizeClassFor(1366))).toBe(2);
  });
});

describe('healthTabContentStyle', () => {
  it('поля 20pt — як у ScreenHeader і Фінансах', () => {
    expect(HEALTH_TAB_GUTTER).toBe(20);
    expect(healthTabContentStyle(false)).toMatchObject({ paddingHorizontal: 20 });
    expect(healthTabContentStyle(false)).not.toHaveProperty('maxWidth');
  });

  it('планшет — центрована колонка зі стелею дашборда', () => {
    expect(healthTabContentStyle(true)).toMatchObject({
      paddingHorizontal: 20, maxWidth: Layout.wideMaxWidth, alignSelf: 'center',
    });
  });
});

describe('healthTabBarLayout', () => {
  it('телефон — прокрутка', () => {
    expect(healthTabBarLayout(390, false)).toMatchObject({ scroll: true, showIcons: true });
  });

  it('планшет — шість в один ряд без прокрутки', () => {
    const lay = healthTabBarLayout(1180 - 232, true);
    expect(lay.scroll).toBe(false);
    const expected = (1180 - 232 - 40 - HEALTH_TAB_GAP * 5) / 6;
    expect(lay.tabWidth).toBeCloseTo(expected);
    expect(lay.showIcons).toBe(true);
  });

  it('найвужчий medium (вікно 600 мінус рейка) — без іконок, але без прокрутки', () => {
    const lay = healthTabBarLayout(600 - Layout.railWidth, true);
    expect(lay.scroll).toBe(false);
    expect(lay.tabWidth).toBeLessThan(HEALTH_TAB_ICON_MIN_WIDTH);
    expect(lay.showIcons).toBe(false);
  });

  it('дуже широке вікно — ряд не ширший за стелю дашборда', () => {
    const lay = healthTabBarLayout(3000, true);
    expect(lay.tabWidth).toBeCloseTo((Layout.wideMaxWidth - HEALTH_TAB_GAP * 5) / 6);
  });

  it('вироджена ширина не дає відʼємної вкладки', () => {
    expect(healthTabBarLayout(0, true).tabWidth).toBe(0);
  });
});

describe('HEALTH_TAB_META — один акцент і короткі підписи', () => {
  it('порядок вкладок не змінився', () => {
    expect(HEALTH_TAB_META.map(m => m.id)).toEqual([...HEALTH_TABS]);
  });

  it('у вкладок немає власного кольору', () => {
    for (const meta of HEALTH_TAB_META) expect(meta).not.toHaveProperty('color');
  });

  it('короткі підписи на смузі, повні назви — для VoiceOver', () => {
    const tr: any = new Proxy({}, { get: (_t, key) => String(key) });
    expect(HEALTH_TAB_META.map(m => m.label(tr))).toEqual([
      'healthTabOverview', 'nutrition', 'activity', 'sleep', 'healthTabBodyShort', 'prevention',
    ]);
    expect(HEALTH_TAB_META.find(m => m.id === 'activity')!.a11yLabel(tr)).toBe('healthTabActivity');
    expect(HEALTH_TAB_META.find(m => m.id === 'body')!.a11yLabel(tr)).toBe('healthTabBody');
  });
});

describe('getHealthColors — палітра Фінансів', () => {
  it('має суцільний фон картки й ті самі рамки/текст, що explore.tsx', () => {
    const dark = getHealthColors(true);
    const light = getHealthColors(false);
    expect(dark.card).toBe('rgba(255,255,255,0.06)');
    expect(light.card).toBe('rgba(255,255,255,0.72)');
    const explore = fs.readFileSync(path.join(ROOT, 'app/(tabs)/explore.tsx'), 'utf8');
    for (const v of [dark.border, light.border, dark.text, light.text, dark.card, light.card, dark.bg1, light.bg1]) {
      expect(explore).toContain(`'${v}'`);
    }
  });
});

describe('вкладки здоровʼя — суцільні картки, без BlurView', () => {
  const files = [
    'components/health/tabs/OverviewTab.tsx',
    'components/health/tabs/NutritionTab.tsx',
    'components/health/tabs/ActivityTab.tsx',
    'components/health/tabs/SleepTab.tsx',
    'components/health/tabs/BodyTab.tsx',
    'components/health/tabs/PreventionTab.tsx',
    'components/health/MetricTrend.tsx',
    'components/health/HubTile.tsx',
    'components/health/HealthNotices.tsx',
  ];
  it.each(files)('%s не імпортує BlurView', file => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).not.toMatch(/from 'expo-blur'/);
  });

  it.each(files.slice(0, 5))('%s кладе картки в MasonryColumns', file => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(src).toMatch(/<MasonryColumns items=\{items\} columnCount=\{grid\.columnCount\}/);
  });
});

describe('аудит iPad 07.10 — вкладки й палітра', () => {
  const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  it('вкладки на планшеті беруть ширину за вмістом — «Профілактика» не дрібнішає', () => {
    const src = read('components/health/HealthTabs.tsx');
    const fill = src.match(/tabFill:\s*\{[^}]*\}/)?.[0] ?? '';
    expect(fill).toMatch(/flexBasis:\s*'auto'/);
    expect(fill).not.toMatch(/\bflex:\s*1\b/);
  });

  it('«Білки» і картка профілю — без фіолетового й напівпрозорої заливки', () => {
    expect(read('components/health/tabs/NutritionTab.tsx')).not.toMatch(/ACCENT_PROT/);
    const overview = read('components/health/tabs/OverviewTab.tsx');
    expect(overview).not.toMatch(/ACCENT_PROT/);
    expect(overview).toMatch(/s\.banner, \{ borderColor: c\.border, backgroundColor: c\.card \}/);
  });
});
