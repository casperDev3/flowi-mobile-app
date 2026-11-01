/**
 * __tests__/tablet-sidebar-pinning.test.ts — сайдбар планшета (11.2026):
 * «Огляд» угорі, «Інтеграції» в «Ще», закріплені розділи під Оглядом.
 * Телефон (маніфест NAV_GROUPS, шухляда) не змінюється — це теж перевіряється.
 */
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (_key: string, fallback: unknown) => fallback),
  subscribeToStorage: jest.fn(() => () => {}),
}));
jest.mock('@/store/synced-storage', () => ({
  saveSyncedValue: jest.fn(async () => {}),
}));

import {
  NAV_GROUPS,
  OVERVIEW_ROUTE,
  applyPinnedSections,
  isPinnableNavItem,
  menuNavGroups,
  moduleSections,
  navGroupsFor,
  sanitizePinnedSections,
  tabletNavGroups,
  togglePinnedSection,
  visibleNavGroups,
  type NavGroup,
} from '../constants/nav';
import { PINNED_SECTIONS_FIELD, pinnedFromPreferences, withPinnedSections } from '../components/shared/pinned-sections';
import { parseUiPreferences, withModuleEnabled } from '../store/ui-preferences';

const routes = (groups: NavGroup[]) => groups.flatMap(g => g.items.map(i => i.route));
const base = () => menuNavGroups(visibleNavGroups(navGroupsFor(false), []));

describe('tabletNavGroups', () => {
  it('«Сьогодні» (Огляд) — окрема група над «Роботою»', () => {
    const groups = tabletNavGroups(base());
    expect(groups[0].kind).toBe('overview');
    expect(groups[0].titleKey).toBeNull();
    expect(groups[0].items.map(i => i.route)).toEqual([OVERVIEW_ROUTE]);
    expect(groups[1].titleKey).toBe('navGroupWork');
    expect(groups[1].items.some(i => i.route === OVERVIEW_ROUTE)).toBe(false);
  });

  it('«Інтеграції» — у кінці «Ще», а не в «Роботі»', () => {
    const groups = tabletNavGroups(base());
    const work = groups.find(g => g.titleKey === 'navGroupWork')!;
    const more = groups.find(g => g.id === 'more')!;
    expect(work.items.some(i => i.module === 'integrations')).toBe(false);
    expect(more.items[more.items.length - 1].module).toBe('integrations');
  });

  it('жоден пункт не губиться і не дублюється', () => {
    const before = routes(base()).sort();
    const after = routes(tabletNavGroups(base()));
    expect(new Set(after).size).toBe(after.length);
    expect([...after].sort()).toEqual(before);
  });

  it('вимкнені «Інтеграції» не з’являються в «Ще»', () => {
    const groups = tabletNavGroups(menuNavGroups(visibleNavGroups(NAV_GROUPS, ['integrations'])));
    expect(groups.flatMap(g => g.items).some(i => i.module === 'integrations')).toBe(false);
  });

  it('якщо «Ще» спорожніла, «Інтеграції» створюють її перед «Розробкою»', () => {
    const allMore = NAV_GROUPS.find(g => g.id === 'more')!.items.map(i => i.module!) ;
    const groups = tabletNavGroups(menuNavGroups(visibleNavGroups(NAV_GROUPS, allMore)));
    const moreIndex = groups.findIndex(g => g.id === 'more');
    const devIndex = groups.findIndex(g => g.id === 'dev');
    expect(moreIndex).toBeGreaterThan(0);
    expect(groups[moreIndex].items.map(i => i.module)).toEqual(['integrations']);
    expect(moreIndex).toBeLessThan(devIndex);
  });

  it('маніфест телефона НЕ змінено: «Сьогодні» та «Інтеграції» лишаються в «Роботі»', () => {
    const work = NAV_GROUPS[0];
    expect(work.titleKey).toBe('navGroupWork');
    expect(work.items[0].route).toBe(OVERVIEW_ROUTE);
    expect(work.items.some(i => i.module === 'integrations')).toBe(true);
    // Налаштування модулів на телефоні — так само.
    expect(moduleSections()[0].items.some(i => i.module === 'integrations')).toBe(true);
    // На планшеті — у «Ще».
    const tablet = moduleSections(tabletNavGroups(NAV_GROUPS));
    expect(tablet.find(s => s.titleKey === 'navGroupMore')!.items.some(i => i.module === 'integrations')).toBe(true);
  });
});

describe('закріплені розділи', () => {
  it('sanitizePinnedSections: сміття → порожньо, дублі й пробіли прибрано, порядок збережено', () => {
    expect(sanitizePinnedSections(null)).toEqual([]);
    expect(sanitizePinnedSections('notes')).toEqual([]);
    expect(sanitizePinnedSections(['notes', 1, ' notes ', '', 'finance'])).toEqual(['notes', 'finance']);
  });

  it('togglePinnedSection: нове — в кінець; повторно — знімає; явне on/off ідемпотентне', () => {
    expect(togglePinnedSection([], 'notes')).toEqual(['notes']);
    expect(togglePinnedSection(['notes'], 'finance')).toEqual(['notes', 'finance']);
    expect(togglePinnedSection(['notes', 'finance'], 'notes')).toEqual(['finance']);
    expect(togglePinnedSection(['notes'], 'notes', true)).toEqual(['notes']);
    expect(togglePinnedSection(['notes'], 'finance', false)).toEqual(['notes']);
  });

  it('закріплені стоять одразу під Оглядом у порядку закріплення і зникають із рідних груп', () => {
    const groups = applyPinnedSections(tabletNavGroups(base()), ['health', 'notes']);
    expect(groups[0].kind).toBe('overview');
    expect(groups[1].kind).toBe('pinned');
    expect(groups[1].items.map(i => i.module)).toEqual(['health', 'notes']);
    const elsewhere = groups.slice(2).flatMap(g => g.items).map(i => i.module);
    expect(elsewhere).not.toContain('health');
    expect(elsewhere).not.toContain('notes');
  });

  it('відкріпили — розділ повертається на своє місце в групі', () => {
    const plain = tabletNavGroups(base());
    const pinned = applyPinnedSections(plain, ['notes']);
    const unpinned = applyPinnedSections(plain, togglePinnedSection(['notes'], 'notes'));
    expect(routes(unpinned)).toEqual(routes(plain));
    expect(routes(pinned)).not.toEqual(routes(plain));
  });

  it('вимкнений модуль не показується, навіть якщо закріплений', () => {
    const groups = applyPinnedSections(tabletNavGroups(menuNavGroups(visibleNavGroups(NAV_GROUPS, ['notes']))), ['notes', 'health']);
    const all = groups.flatMap(g => g.items).map(i => i.module);
    expect(all).not.toContain('notes');
    expect(groups.find(g => g.kind === 'pinned')!.items.map(i => i.module)).toEqual(['health']);
  });

  it('невідомі, системні й вкладки «Фінансів» не закріплюються', () => {
    const groups = applyPinnedSections(tabletNavGroups(base()), ['nope', 'budget']);
    expect(groups.some(g => g.kind === 'pinned')).toBe(false);
    const all = NAV_GROUPS.flatMap(g => g.items);
    expect(isPinnableNavItem(all.find(i => i.route === OVERVIEW_ROUTE)!)).toBe(false);
    expect(isPinnableNavItem(all.find(i => i.route === '/(tabs)/settings')!)).toBe(false);
    expect(isPinnableNavItem(all.find(i => i.module === 'budget')!)).toBe(false);
    expect(isPinnableNavItem(all.find(i => i.module === 'notes')!)).toBe(true);
  });

  it('спорожніла рідна група зникає («Розробка» з одним пунктом)', () => {
    const groups = applyPinnedSections(tabletNavGroups(base()), ['ideas']);
    expect(groups.some(g => g.id === 'dev')).toBe(false);
    expect(groups.find(g => g.kind === 'pinned')!.items.map(i => i.module)).toEqual(['ideas']);
  });
});

describe('ui_preferences.pinnedSections', () => {
  it('запис закріплення не чіпає disabledModules і чужих полів', () => {
    const current = parseUiPreferences({ version: 1, disabledModules: ['notes'], futureField: { a: 1 } });
    const next = withPinnedSections(current, ['health', 'health', 'finance']);
    expect(next.disabledModules).toEqual(['notes']);
    expect(next.futureField).toEqual({ a: 1 });
    expect(next[PINNED_SECTIONS_FIELD]).toEqual(['health', 'finance']);
    expect(pinnedFromPreferences(next)).toEqual(['health', 'finance']);
  });

  it('перемикач модулів не стирає закріплення', () => {
    const withPins = parseUiPreferences({ version: 1, disabledModules: [], pinnedSections: ['notes'] });
    const toggled = withModuleEnabled(withPins, 'finance', false);
    expect(pinnedFromPreferences(toggled)).toEqual(['notes']);
  });

  it('сміття в полі — «нічого не закріплено»', () => {
    expect(pinnedFromPreferences(null)).toEqual([]);
    expect(pinnedFromPreferences({ pinnedSections: 'notes' })).toEqual([]);
  });
});
