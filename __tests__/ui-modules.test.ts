/**
 * __tests__/ui-modules.test.ts
 *
 * Вимикання окремих модулів інтерфейсу: розбір збереженого налаштування,
 * перемикання і фільтр сайдбара. Усе перевірюване тут — чисті функції, тож
 * сховище й outbox замокані заглушками: тягнути AsyncStorage заради них
 * означало б перевіряти нативний модуль, а не правила.
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
  disabledModuleCount,
  moduleSections,
  navGroupsFor,
  visibleNavGroups,
} from '../constants/nav';
import {
  ALWAYS_ON_MODULES,
  effectiveDisabledModules,
  emptyUiPreferences,
  isModuleEnabled,
  parseUiPreferences,
  withModuleEnabled,
} from '../store/ui-preferences';

describe('parseUiPreferences', () => {
  it('порожнє сховище — нічого не вимкнено', () => {
    expect(parseUiPreferences(null).disabledModules).toEqual([]);
    expect(parseUiPreferences(undefined).disabledModules).toEqual([]);
  });

  it('сміття не ховає розділів', () => {
    // Зіпсований запис має лишити застосунок ПОВНИМ: сховати половину
    // розділів через нечитабельний ключ гірше, ніж проігнорувати ключ.
    expect(parseUiPreferences('нісенітниця').disabledModules).toEqual([]);
    expect(parseUiPreferences({ disabledModules: 'finance' }).disabledModules).toEqual([]);
    expect(parseUiPreferences({ disabledModules: [1, null, 'finance', ''] }).disabledModules)
      .toEqual(['finance']);
  });

  it('дублі зливаються', () => {
    expect(parseUiPreferences({ disabledModules: ['finance', 'finance'] }).disabledModules)
      .toEqual(['finance']);
  });

  it('поля новіших клієнтів лишаються', () => {
    // Інакше старіша збірка стерла б чуже налаштування першим же перемикачем.
    const parsed = parseUiPreferences({ disabledModules: [], futureFlag: 42 });
    expect(parsed.futureFlag).toBe(42);
  });
});

describe('withModuleEnabled', () => {
  it('вимкнення додає модуль, увімкнення прибирає', () => {
    const off = withModuleEnabled(emptyUiPreferences, 'finance', false);
    expect(off.disabledModules).toEqual(['finance']);
    expect(withModuleEnabled(off, 'finance', true).disabledModules).toEqual([]);
  });

  it('повторне вимкнення не дає дубля', () => {
    const once = withModuleEnabled(emptyUiPreferences, 'finance', false);
    expect(withModuleEnabled(once, 'finance', false).disabledModules).toEqual(['finance']);
  });

  it('чужі модулі не чіпаються', () => {
    const base = parseUiPreferences({ disabledModules: ['banks', 'майбутній_модуль'] });
    const next = withModuleEnabled(base, 'finance', false);
    expect(next.disabledModules).toEqual(['banks', 'майбутній_модуль', 'finance']);
  });
});

describe('ALWAYS_ON_MODULES (пункт 10)', () => {
  it('ideas і bugs увімкнені завжди, навіть якщо їх вимкнено в сховищі', () => {
    expect(ALWAYS_ON_MODULES).toEqual(expect.arrayContaining(['ideas', 'bugs']));
    expect(isModuleEnabled(['ideas', 'bugs'], 'ideas')).toBe(true);
    expect(isModuleEnabled(['ideas', 'bugs'], 'bugs')).toBe(true);
  });

  it('діючий список не містить ALWAYS_ON, збережене не переписується', () => {
    const stored = parseUiPreferences({ disabledModules: ['ideas', 'finance'] });
    expect(effectiveDisabledModules(stored.disabledModules)).toEqual(['finance']);
    // Перемикач іншого модуля пише від ЗБЕРЕЖЕНОГО стану: 'ideas' там лишається
    // як є — ми його лише ігноруємо, а не «вмикаємо» за користувача.
    expect(withModuleEnabled(stored, 'health', false).disabledModules)
      .toEqual(['ideas', 'finance', 'health']);
  });
});

describe('isModuleEnabled', () => {
  it('пункт без модуля — системний, вимкнути не можна', () => {
    expect(isModuleEnabled(['finance'], undefined)).toBe(true);
  });

  it('невідомий модуль вважається увімкненим', () => {
    // Новий розділ не має з'являтися у користувача прихованим.
    expect(isModuleEnabled(['finance'], 'модуль_з_майбутнього')).toBe(true);
  });
});

describe('visibleNavGroups', () => {
  it('вимкнений модуль зникає з переліку', () => {
    const groups = visibleNavGroups(NAV_GROUPS, ['finance']);
    const routes = groups.flatMap(group => group.items).map(item => item.route);
    expect(routes).not.toContain('/(tabs)/explore');
    expect(routes).toContain('/(tabs)/health');
  });

  it('група без жодного видимого пункту зникає цілком', () => {
    // Заголовок «Ще» з лічильником 0 читається як збій, а не як
    // «ви це вимкнули».
    const more = NAV_GROUPS.find(group => group.id === 'more')!;
    const modules = more.items.map(item => item.module!).filter(Boolean);
    const groups = visibleNavGroups(NAV_GROUPS, modules);
    expect(groups.some(group => group.id === 'more')).toBe(false);
  });

  it('«Ідеї та баги» лишаються в меню навіть зі збереженим вимкненням (пункт 10)', () => {
    // Рішення власника: канал скарг вимкнути не можна. Старіша збірка чи веб
    // могли записати 'ideas' у disabledModules — ми його ігноруємо.
    const groups = visibleNavGroups(NAV_GROUPS, ['ideas', 'bugs']);
    const routes = groups.flatMap(group => group.items).map(item => item.route);
    expect(routes).toContain('/feedback');
  });

  it('системні пункти лишаються завжди', () => {
    // Інакше, вимкнувши все, користувач лишився б без входу в налаштування —
    // тобто без способу щось увімкнути назад.
    const all = NAV_GROUPS.flatMap(group => group.items)
      .map(item => item.module)
      .filter((module): module is NonNullable<typeof module> => Boolean(module));
    const routes = visibleNavGroups(navGroupsFor(true), all)
      .flatMap(group => group.items)
      .map(item => item.route);
    expect(routes).toContain('/(tabs)/settings');
    expect(routes).toContain('/(tabs)/today');
    expect(routes).toContain('/admin-workspace');
  });

  it('без вимкнених повертає ті самі групи', () => {
    expect(visibleNavGroups(NAV_GROUPS, [])).toBe(NAV_GROUPS);
  });
});

describe('moduleSections', () => {
  it('перелічує рівно ті модулі, що є в сайдбарі, крім ALWAYS_ON', () => {
    // Два окремі списки розійшлися б на першому ж новому розділі.
    const fromNav = NAV_GROUPS.flatMap(group => group.items)
      .map(item => item.module)
      .filter((module): module is NonNullable<typeof module> => Boolean(module))
      .filter(module => !ALWAYS_ON_MODULES.includes(module));
    const fromSections = moduleSections().flatMap(section => section.items).map(item => item.module);
    expect(fromSections.sort()).toEqual([...fromNav].sort());
  });

  it('ідентифікатори модулів не дублюються', () => {
    const ids = moduleSections().flatMap(section => section.items).map(item => item.module);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('для «Ідей та багів» перемикача немає (пункт 10)', () => {
    const ids = moduleSections().flatMap(section => section.items).map(item => item.module);
    expect(ids).not.toContain('ideas');
    expect(ids).not.toContain('bugs');
  });

  it('групування збігається з сайдбаром (група лише з ALWAYS_ON — без секції)', () => {
    const navTitles = NAV_GROUPS
      .filter(group => group.titleKey)
      .filter(group => group.items.some(item => item.module && !ALWAYS_ON_MODULES.includes(item.module)))
      .map(group => group.titleKey);
    expect(moduleSections().map(section => section.titleKey)).toEqual(navTitles);
  });
});

describe('disabledModuleCount (пункт 10)', () => {
  it('рахує лише вимкнені перемикачі цієї платформи', () => {
    // 'health_summary' — вебовий, 'time_records' — без пункту меню,
    // 'ideas' — ALWAYS_ON: жоден не має тут перемикача, лічильник — 1.
    expect(disabledModuleCount(['finance', 'health_summary', 'time_records', 'ideas'])).toBe(1);
    expect(disabledModuleCount([])).toBe(0);
  });
});
