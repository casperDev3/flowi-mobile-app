/**
 * __tests__/finance-sheet-handoff.test.tsx — дві модалки НЕ можуть бути
 * презентовані одночасно (NAT-02, P0).
 *
 * Симптом із пристрою: тап «+ Новий рахунок» усередині форми операції — і
 * екран Фінансів перестає приймати дотики НАЗАВЖДИ. Ані «Додати», ані FAB,
 * ані «…» у шапці, ані сегмент «Доходи»; перехід на іншу вкладку не лікує,
 * лікує лише перезапуск застосунку. Форма рахунку при цьому не відкривається,
 * а введені сума й категорія губляться.
 *
 * Механізм: `setShowAdd(false); openAccountForm(null);` в одному тіку. На iOS
 * обидва аркуші презентує той самий кореневий view-controller, а перший у цей
 * момент ЩЕ презентований — `SheetModal` тримає його змонтованим 150 мс
 * заради exit-анімації. UIKit відмовляє в презентації другого, RN уже вважає
 * його показаним, і зверху лишається порожній модальний шар.
 *
 * Тому тут перевіряється саме інваріант «не більше однієї змонтованої
 * модалки одночасно» — те, що було зламано, і те, що видно без пристрою:
 * `SheetModal` рендерить `<Modal>` лише поки змонтований.
 *
 * Чого цей тест НЕ доводить: що на пристрої вікно справді встигає зникнути за
 * відведений кадр. Це перевіряє фаза симулятора.
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
  // Той самий шлях, яким на екран приходять із «Сьогодні»: форма операції
  // відкривається одразу на монтуванні.
  useLocalSearchParams: () => ({ create: '1', tab: 'transactions' }),
  usePathname: () => '/explore',
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), []); },
}));
// Нативного модуля жестів у jsdom немає; аркушу досить, щоб діти пройшли крізь.
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    GestureHandlerRootView: require('react-native').View,
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: () => chain },
  };
});
/**
 * Exit-анімація аркуша в jest не догорає (Reanimated без кадрів кадрів не
 * рахує), тож прапорець Reduce Motion робимо перемикачем:
 *   false — аркуш лишається змонтованим після setVisible(false), тобто рівно
 *           той стан, у якому на пристрої й відбувалась подвійна презентація;
 *   true  — закриття синхронне, onClose приходить, видно всю подорож.
 */
const mockMotion = { reduced: false };
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const actual = jest.requireActual('react-native-reanimated');
  return {
    __esModule: true,
    ...actual,
    default: actual.default,
    useReducedMotion: () => mockMotion.reduced,
  };
});
jest.mock('@/utils/haptics', () => ({
  haptic: { light: () => {}, medium: () => {}, success: () => {}, warning: () => {}, error: () => {}, selection: () => {} },
}));

import React from 'react';
import { Modal, Text } from 'react-native';

import {
  createSheetHandoff,
  MODAL_EXIT_MS,
  openAfterModalExit,
} from '@/components/finance/sheetHandoff';
import { allTranslations } from '@/store/translations';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;

// ── Чиста механіка черги ─────────────────────────────────────────────────────

describe('createSheetHandoff', () => {
  it('release() НЕ відкриває наступний аркуш синхронно', () => {
    const open = jest.fn();
    const schedule = jest.fn();
    const h = createSheetHandoff(schedule);

    h.queue(open);
    h.release();

    // Саме це й ламало екран: відкриття в тому ж тіку, у якому зникає
    // попередня модалка.
    expect(open).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
    schedule.mock.calls[0][0]();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('isPending() відрізняє передачу керування від звичайного закриття', () => {
    const h = createSheetHandoff(jest.fn());
    expect(h.isPending()).toBe(false);
    h.queue(() => {});
    expect(h.isPending()).toBe(true);
    h.release();
    expect(h.isPending()).toBe(false);
  });

  it('повторний release() нічого не відкриває вдруге', () => {
    const open = jest.fn();
    const schedule = jest.fn(fn => fn());
    const h = createSheetHandoff(schedule);
    h.queue(open);
    h.release();
    h.release();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('cancel() знімає чергу', () => {
    const open = jest.fn();
    const schedule = jest.fn(fn => fn());
    const h = createSheetHandoff(schedule);
    h.queue(open);
    h.cancel();
    h.release();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('openAfterModalExit', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('закриває одразу, відкриває лише після зникання попередньої модалки', () => {
    const close = jest.fn();
    const open = jest.fn();

    openAfterModalExit(close, open);

    expect(close).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();

    jest.advanceTimersByTime(MODAL_EXIT_MS - 1);
    expect(open).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

// ── Сам екран ────────────────────────────────────────────────────────────────

/** Скільки модалок ЗМОНТОВАНО просто зараз. */
function mountedModals(tree: any): any[] {
  return tree.root.findAllByType(Modal).filter((n: any) => n.props.visible !== false);
}

function textsOf(node: any): string[] {
  const out: string[] = [];
  node.findAllByType(Text).forEach((t: any) => {
    if (typeof t.props.children === 'string') out.push(t.props.children);
  });
  return out;
}

function pressableWithLabel(scope: any, label: string): any {
  const hits = scope.findAll(
    (n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function',
  );
  if (hits.length === 0) throw new Error(`не знайдено кнопки «${label}»`);
  return hits[0];
}

function pressableWithText(scope: any, text: string): any {
  const hits = scope.findAll(
    (n: any) => typeof n.props?.onPress === 'function' && textsOf(n).includes(text),
  );
  if (hits.length === 0) throw new Error(`не знайдено кнопки з написом «${text}»`);
  // Найглибший збіг — сама кнопка, а не аркуш навколо неї.
  return hits[hits.length - 1];
}

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

function amountInputIn(scope: any): any {
  return scope.findAll(
    (n: any) => n.props?.accessibilityLabel === tr.amount && typeof n.props?.onChangeText === 'function',
  )[0];
}

describe('Фінанси: «+ Новий рахунок» із форми операції', () => {
  beforeEach(() => { mockStore.clear(); });
  // Змонтований екран лишає по собі і таймери FlatList, і живий аркуш:
  // без цього наступний тест біжить поруч із попереднім.
  afterEach(async () => {
    await act(async () => { trees.splice(0).forEach(t => t.unmount()); });
  });

  it('не презентує другий аркуш, поки перший ще на екрані', async () => {
    // Аркуш, який ЩЕ не встиг зникнути, — саме стан із пристрою: SheetModal
    // тримає Modal змонтованим 150 мс заради exit-анімації.
    mockMotion.reduced = false;
    const tree = await mountFinance();

    expect(mountedModals(tree)).toHaveLength(1);
    const form = mountedModals(tree)[0];

    await act(async () => { pressableWithLabel(form, tr.newAccount).props.onPress(); });
    // До правки тут було 2: форма операції ще презентована, а аркуш рахунків
    // уже просить показатись — UIKit відмовляє, і екран мертвий назавжди.
    expect(mountedModals(tree)).toHaveLength(1);

    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    expect(mountedModals(tree).length).toBeLessThanOrEqual(1);
  });

  it('відкриває форму рахунку після закриття й не губить чернетку', async () => {
    mockMotion.reduced = true;
    const tree = await mountFinance();

    expect(mountedModals(tree)).toHaveLength(1);
    const form = mountedModals(tree)[0];

    // Сума введена: саме її втрата описана в знахідці.
    const amountInput = amountInputIn(form);
    expect(amountInput).toBeTruthy();
    await act(async () => { amountInput.props.onChangeText('250'); });

    // Рахунків немає, тож у формі є «+ Новий рахунок».
    await act(async () => { pressableWithLabel(form, tr.newAccount).props.onPress(); });
    expect(mountedModals(tree).length).toBeLessThanOrEqual(1);

    // Кадр по тому відкривається форма рахунку — і вона ОДНА.
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });
    const afterHandoff = mountedModals(tree);
    expect(afterHandoff).toHaveLength(1);
    expect(afterHandoff[0].findAll(
      (n: any) => n.props?.accessibilityLabel === tr.openingBalance,
    ).length).toBeGreaterThan(0);

    // Чернетку не викинуто: заводимо рахунок і повертаємось у ту саму форму.
    const nameInput = afterHandoff[0].findAll(
      (n: any) => n.props?.accessibilityLabel === tr.nameLabel && typeof n.props?.onChangeText === 'function',
    )[0];
    await act(async () => { nameInput.props.onChangeText('Готівка'); });
    await act(async () => { pressableWithText(mountedModals(tree)[0], tr.save).props.onPress(); });

    // Закриваємо аркуш рахунків — хрестиком самого SheetModal.
    await act(async () => { pressableWithLabel(mountedModals(tree)[0], 'Закрити').props.onPress(); });
    await act(async () => { await new Promise(r => setTimeout(r, 60)); });

    const reopened = mountedModals(tree);
    expect(reopened).toHaveLength(1);
    expect(amountInputIn(reopened[0])?.props.value).toBe('250');
  });
});
