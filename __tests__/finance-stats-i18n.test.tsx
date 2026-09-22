/**
 * __tests__/finance-stats-i18n.test.tsx — «Статистика» мусить говорити мовою
 * застосунку (I18N-03, I18N-04).
 *
 * Екран тримав ТРИ власні україномовні масиви (короткі місяці, повні місяці,
 * дні тижня) і ВЛАСНУ копію дефолтних категорій. Наслідок не косметичний:
 * «Фінанси» вже вміли англійські категорії (`DEFAULT_CATEGORIES_EN`), а
 * «Статистика» звіряла операції зі своїм українським списком — той самий
 * набір операцій розкладався в двох екранах по-різному, а осі графіка
 * лишались «Січ»/«Пн» в англійському інтерфейсі.
 */

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
  multiGet: jest.fn(async (keys: string[]) => keys.map(k => [k, mockStore.get(k) ?? null])),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/finance-stats',
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
const mockLang = { current: 'en' as 'uk' | 'en' };
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations[mockLang.current],
    lang: mockLang.current,
    setLang: () => {},
  }),
}));

import React from 'react';
import { Text } from 'react-native';

import { allTranslations } from '@/store/translations';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const uk = allTranslations.uk;
const en = allTranslations.en;

function texts(tree: any): string[] {
  const out: string[] = [];
  tree.root.findAllByType(Text).forEach((n: any) => {
    const ch = n.props.children;
    if (typeof ch === 'string') out.push(ch);
    if (Array.isArray(ch)) ch.forEach((x: unknown) => { if (typeof x === 'string') out.push(x); });
  });
  return out;
}

const trees: any[] = [];

async function mountStats() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StatsScreen = require('@/app/finance-stats').default;
  let tree: any;
  await act(async () => { tree = create(<StatsScreen />); });
  await act(async () => {});
  trees.push(tree);
  return tree;
}

describe('Статистика фінансів англійською', () => {
  beforeEach(() => {
    mockStore.clear();
    mockLang.current = 'en';
    const now = new Date();
    // Операція в англійській категорії — саме така, яку створять «Фінанси»
    // англійською (DEFAULT_CATEGORIES_EN).
    mockStore.set('transactions', JSON.stringify([
      {
        id: 't1', type: 'expense', category: 'Food', amount: 100, note: '',
        date: now.toISOString(), accountId: 'a1', currency: 'UAH',
      },
    ]));
    mockStore.set('accounts', JSON.stringify([
      { id: 'a1', name: 'Cash', kind: 'cash', currency: 'UAH', openingBalance: 0, createdAt: now.toISOString() },
    ]));
  });

  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('підписи графіка беруться зі словника, а не з локальних масивів', async () => {
    const tree = await mountStats();
    const all = texts(tree);

    // Жодного українського скорочення місяця/дня в англійському інтерфейсі.
    for (const label of [...uk.monthsShort, ...uk.weekdays]) {
      expect(all).not.toContain(label);
    }
    // І хоча б одна англійська мітка на місці.
    expect(all.some(t => en.monthsShort.includes(t) || en.weekdays.includes(t))).toBe(true);
  });

  it('англійська категорія знаходить свою іконку, а не запасну', async () => {
    const tree = await mountStats();
    // «Найбільша витрата» малює іконку категорії операції.
    const icons = tree.root.findAll(
      (n: any) => typeof n.props?.name === 'string' && typeof n.props?.size === 'number',
    ).map((n: any) => n.props.name);

    // До правки 'Food' не було в україномовній копії дефолтів, і рядок
    // отримував запасну «ellipsis.circle.fill».
    expect(icons).toContain('fork.knife');
  });

  it('українською підписи лишаються українськими', async () => {
    mockLang.current = 'uk';
    const tree = await mountStats();
    const all = texts(tree);
    expect(all.some(t => uk.monthsShort.includes(t) || uk.weekdays.includes(t))).toBe(true);
  });
});
