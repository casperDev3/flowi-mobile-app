/**
 * __tests__/finance-a11y.test.tsx — екран Фінансів для скрінрідера
 * (A11Y-01, A11Y-03, A11Y-04, A11Y-07).
 *
 * Знахідки аудиту були не про «бракує коментаря», а про те, що на екрані є
 * кнопки без імені («кнопка» без жодного слова), поле суми, яке озвучується
 * самим лише плейсхолдером «0», і сегментований фільтр, у якому вибране
 * передається ВИКЛЮЧНО кольором тла: VoiceOver читає три однакові кнопки,
 * а дальтонік не відрізняє їх зовсім.
 *
 * Перевіряємо саме дерево доступності, а не верстку.
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
  usePathname: () => '/explore',
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {}, selection: () => {} },
}));

import React from 'react';

import { allTranslations } from '@/store/translations';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const trees: any[] = [];

async function mountFinance() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FinanceScreen = require('@/app/(tabs)/explore').default;
  let tree: any;
  await act(async () => { tree = create(<FinanceScreen />); });
  await act(async () => {});
  trees.push(tree);
  return tree;
}

function pressableWithText(tree: any, text: string): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native');
  const hits = tree.root.findAll((n: any) => {
    if (typeof n.props?.onPress !== 'function') return false;
    return n.findAllByType(Text).some((t: any) => t.props.children === text);
  });
  if (hits.length === 0) throw new Error(`не знайдено кнопки з написом «${text}»`);
  return hits[hits.length - 1];
}

/** Вузли з onPress, тобто те, що людина натискає. */
function pressables(tree: any): any[] {
  return tree.root.findAll((n: any) => typeof n.props?.onPress === 'function');
}

describe('Фінанси: дерево доступності', () => {
  beforeEach(() => { mockStore.clear(); });
  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('сегмент «Всі / Доходи / Витрати» повідомляє про вибір, а не лише фарбує', async () => {
    const tree = await mountFinance();

    const tabs = pressables(tree).filter((n: any) => n.props.accessibilityRole === 'tab');
    const labels = tabs.map((n: any) => n.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining([tr.all, tr.incomes, tr.expenses]));

    // Вибраний рівно один — і це «Всі» за замовчуванням. Рахуємо за
    // підписами: findAll віддає і композит, і його host-вузол з тими ж пропсами.
    const selected = [...new Set(
      tabs.filter((n: any) => n.props.accessibilityState?.selected)
        .map((n: any) => n.props.accessibilityLabel),
    )];
    expect(selected).toEqual([tr.all]);
  });

  it('плавуча кнопка «+» має ім’я', async () => {
    const tree = await mountFinance();
    const fab = pressables(tree).filter((n: any) => n.props.accessibilityLabel === tr.add);
    expect(fab.length).toBeGreaterThan(0);
  });

  it('поле суми у формі озвучується не плейсхолдером «0»', async () => {
    const tree = await mountFinance();
    // Відкриваємо форму операції через ту саму кнопку «+».
    const fab = pressables(tree).find((n: any) => n.props.accessibilityLabel === tr.add);
    await act(async () => { fab.props.onPress(); });

    const amount = tree.root.findAll(
      (n: any) => typeof n.props?.onChangeText === 'function'
        && n.props?.keyboardType === 'decimal-pad'
        && n.props?.placeholder === '0',
    );
    expect(amount.length).toBeGreaterThan(0);
    expect(amount[0].props.accessibilityLabel).toBe(tr.amount);
  });

  it('обгортки аркушів не злипаються в один елемент (NAT-03)', async () => {
    const tree = await mountFinance();
    // Відкриваємо меню «…»: його вміст теж живе в обгортці зі stopPropagation.
    const menuBtn = pressables(tree).find((n: any) => n.props.accessibilityLabel === tr.filtersAndSort);
    await act(async () => { menuBtn.props.onPress(); });

    const wrappers = tree.root.findAll(
      (n: any) => n.props?.accessibilityViewIsModal === true && typeof n.props?.onPress === 'function',
    );
    expect(wrappers.length).toBeGreaterThan(0);
    // `accessible` тут мусить бути саме false: Pressable з onPress на iOS
    // інакше стає одним елементом доступності на весь аркуш.
    expect(wrappers.every((n: any) => n.props.accessible === false)).toBe(true);
  });

  it('клітинки календаря-фільтра мають дату, роль і стан вибору', async () => {
    const tree = await mountFinance();

    // Меню «…» → «Календар» (через чергу аркушів, див. NAT-02).
    const menuBtn = pressables(tree).find((n: any) => n.props.accessibilityLabel === tr.filtersAndSort);
    expect(menuBtn).toBeTruthy();
    await act(async () => { menuBtn.props.onPress(); });

    const calItem = pressableWithText(tree, tr.calendar);
    await act(async () => { calItem.props.onPress(); });
    await act(async () => { await new Promise(r => setTimeout(r, 400)); });

    // Клітинка дня: підпис — повна дата, а не самотнє «15».
    const days = pressables(tree).filter(
      (n: any) => n.props.accessibilityRole === 'button'
        && typeof n.props.accessibilityLabel === 'string'
        && n.props.accessibilityState
        && 'selected' in n.props.accessibilityState
        && /\d/.test(n.props.accessibilityLabel)
        && n.props.accessibilityLabel.length > 6,
    );
    expect(days.length).toBeGreaterThan(20);
    expect(days.every((n: any) => n.props.accessibilityState.selected === false)).toBe(true);
  });
});
