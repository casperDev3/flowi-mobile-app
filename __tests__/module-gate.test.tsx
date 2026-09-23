/**
 * __tests__/module-gate.test.tsx — заглушка вимкненого модуля ЗА МАРШРУТОМ
 * (пункт 10).
 *
 * До виправлення заглушка вмикалась лише listener-ом `tabPress` у
 * app/(tabs)/_layout.tsx: прямий перехід (router.replace('/(tabs)') після
 * входу, push-посилання, ActiveTimersBar → «Час») відкривав вимкнений розділ,
 * а на планшеті (панелі табів немає) заглушки не було взагалі. Тут жодного
 * натискання немає — лише поточний pathname, — і заглушка мусить стояти.
 */
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) =>
    key === 'ui_preferences' ? mockPrefs : fallback),
  subscribeToStorage: jest.fn(() => () => {}),
}));
jest.mock('@/store/synced-storage', () => ({ saveSyncedValue: jest.fn(async () => {}) }));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({ tr: new Proxy({}, { get: (_t, key) => String(key) }), lang: 'uk' }),
}));
jest.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('@/components/haptic-tab', () => ({ HapticTab: () => null }));
jest.mock('@/components/notifications/NotificationBadge', () => ({ NotificationBadge: () => null }));
jest.mock('@/components/time/ActiveTimersBar', () => ({ ActiveTimersBar: () => null }));

let mockWide = false;
jest.mock('@/hooks/use-responsive', () => ({
  useResponsive: () => ({ isWide: mockWide, isCompact: !mockWide, isExpanded: mockWide, width: 400, height: 800 }),
}));

let mockPath = '/today';
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  // Навігатор табів замінено порожнім: перевіряється шар ПОВЕРХ нього, і
  // жодної взаємодії з панеллю (tabPress) у цих тестах немає навмисно.
  const Tabs = function MockTabs() { return null; };
  Tabs.Screen = function MockTabsScreen() { return null; };
  return {
    Tabs,
    usePathname: () => mockPath,
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      back: () => mockBack(),
      canGoBack: () => true,
      replace: jest.fn(),
    },
  };
});

let mockPrefs: unknown = null;

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

import TabLayout from '@/app/(tabs)/_layout';
import { ModuleGate } from '@/components/shared/ModuleGate';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

async function render(el: React.ReactElement) {
  let tree: any;
  await act(async () => { tree = create(el); });
  // useUiModules читає сховище в ефекті — даємо обіцянці розв'язатись.
  await act(async () => { await Promise.resolve(); });
  return tree;
}

function stub(tree: any, module: string) {
  return tree.root.findAll((n: any) => n.props.testID === `module-disabled-${module}`);
}

beforeEach(() => {
  mockPrefs = null;
  mockWide = false;
  mockPath = '/today';
  mockPush.mockClear();
  mockBack.mockClear();
});

describe('вкладки: заглушка за pathname, без tabPress', () => {
  it('прямий перехід на вимкнені «Фінанси» показує заглушку', async () => {
    mockPrefs = { version: 1, disabledModules: ['finance'] };
    mockPath = '/explore';
    const tree = await render(<TabLayout />);
    expect(stub(tree, 'finance').length).toBeGreaterThan(0);
  });

  it('прихований таб «Час» (ActiveTimersBar, push) теж гейтиться', async () => {
    mockPrefs = { version: 1, disabledModules: ['time'] };
    mockPath = '/time';
    const tree = await render(<TabLayout />);
    expect(stub(tree, 'time').length).toBeGreaterThan(0);
  });

  it('на планшеті (без панелі табів) заглушка теж є і займає весь вміст', async () => {
    mockWide = true;
    mockPrefs = { version: 1, disabledModules: ['tasks'] };
    mockPath = '/';
    const tree = await render(<TabLayout />);
    const [node] = stub(tree, 'tasks');
    expect(node).toBeTruthy();
    const style = [node.props.style].flat(Infinity).reduce((acc: any, s: any) => ({ ...acc, ...s }), {});
    expect(style.bottom).toBe(0);
  });

  it('увімкнений розділ — без заглушки', async () => {
    mockPrefs = { version: 1, disabledModules: ['health'] };
    mockPath = '/explore';
    const tree = await render(<TabLayout />);
    expect(tree.root.findAll((n: any) => String(n.props.testID ?? '').startsWith('module-disabled-'))).toHaveLength(0);
  });

  it('кнопка заглушки веде в налаштування модулів', async () => {
    mockPrefs = { version: 1, disabledModules: ['finance'] };
    mockPath = '/explore';
    const tree = await render(<TabLayout />);
    const button = tree.root.findAllByType(TouchableOpacity)
      .find((n: any) => n.props.accessibilityLabel === 'modulesOpenSettings');
    act(() => { button.props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/settings-modules');
  });
});

describe('Stack-екрани: ModuleGate у корені', () => {
  it('вимкнені «Наради» — заглушка з кнопкою «Назад»', async () => {
    mockPrefs = { version: 1, disabledModules: ['meetings'] };
    const tree = await render(<ModuleGate pathname="/meetings" scope="stack" />);
    expect(stub(tree, 'meetings').length).toBeGreaterThan(0);
    const back = tree.root.findAllByType(TouchableOpacity)
      .find((n: any) => n.props.accessibilityLabel === 'back');
    act(() => { back.props.onPress(); });
    expect(mockBack).toHaveBeenCalled();
  });

  it('вкладку кореневий гейт не закриває вдруге', async () => {
    mockPrefs = { version: 1, disabledModules: ['finance'] };
    const tree = await render(<ModuleGate pathname="/explore" scope="stack" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('«Ідеї та баги» не гейтяться навіть зі збереженим вимкненням', async () => {
    mockPrefs = { version: 1, disabledModules: ['ideas', 'bugs'] };
    const tree = await render(<ModuleGate pathname="/feedback" scope="stack" />);
    expect(tree.toJSON()).toBeNull();
  });

  it('заглушка називає розділ підписом із маніфесту', async () => {
    mockPrefs = { version: 1, disabledModules: ['containers'] };
    const tree = await render(<ModuleGate pathname="/containers" scope="stack" />);
    const texts = tree.root.findAllByType(Text).map((n: any) => n.props.children);
    expect(texts).toContain('containers');
    expect(texts).toContain('modulesDisabledTitle');
  });
});
