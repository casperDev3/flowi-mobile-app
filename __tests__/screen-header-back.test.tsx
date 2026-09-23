/**
 * __tests__/screen-header-back.test.tsx — рудиментарне «Назад» на планшеті.
 *
 * Під охороною саме те, заради чого кнопку віддали спільному хедеру:
 *
 *  · на телефоні «Назад» є завжди — стек там єдина навігація;
 *  · на широкому екрані в розділі, який є в сайдбарі, кнопки немає: перехід
 *    уже в сайдбарі, а стрілка вела б на випадковий попередній екран;
 *  · на широкому екрані в розділі, якого в сайдбарі НЕМАЄ (Акаунт, Сон,
 *    Підзадачі), шлях нагору лишається — стрілкою або крихтами.
 *
 * Межа перевіряється рівно на 600pt (Breakpoints.medium): саме там сайдбар
 * з'являється, і саме там кнопка мусить зникнути.
 */

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => INSETS,
}));

let mockPathname = '/subscriptions';
jest.mock('expo-router', () => {
  const nav = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: () => true };
  return {
    usePathname: () => mockPathname,
    useRouter: () => nav,
    router: nav,
    Stack: { Screen: () => null },
    useLocalSearchParams: () => ({ id: 'p-1' }),
    useFocusEffect: (cb: any) => { const R = require('react'); R.useEffect(() => cb(), [cb]); },
  };
});

// ─── Залежності реальних екранів (блок «Екрани» внизу) ───────────────────────
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/components/ui/icon-symbol', () => ({ IconSymbol: () => null }));
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));
jest.mock('@/store/auth', () => ({ useAuth: () => ({ user: { id: '1', email: 'me@example.test' } }) }));
jest.mock('@/store/project-sync', () => ({
  hasPendingProjectOutbox: jest.fn(async () => false),
  syncAllMyProjects: jest.fn(),
}));
jest.mock('@/hooks/use-project', () => ({
  useProject: () => ({ project: { id: 'p-1', name: 'Аудит', color: '#7C3AED', createdAt: '2026-01-01T00:00:00.000Z' }, loading: false }),
}));
jest.mock('@/hooks/use-project-role', () => ({ useProjectRole: () => 'owner' }));
jest.mock('@/hooks/use-tab-bar-inset', () => ({ useTabBarInset: () => 0 }));
jest.mock('@/hooks/use-screen-view', () => ({ useScreenView: () => {} }));
jest.mock('@/utils/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn() } }));
jest.mock('@/store/api', () => {
  class OfflineError extends Error {}
  class ApiError extends Error { status = 500; }
  return { OfflineError, ApiError };
});
jest.mock('@/store/project-team', () => ({
  fetchProjectMembers: jest.fn(async () => []),
  getCachedMembers: jest.fn(async () => []),
  listProjectInvites: jest.fn(async () => []),
  changeMemberRole: jest.fn(),
  createInviteLink: jest.fn(),
  inviteByEmail: jest.fn(),
  removeProjectMember: jest.fn(),
  revokeProjectInvite: jest.fn(),
  setMembersCacheFor: jest.fn(),
  transferProjectOwnership: jest.fn(),
}));
jest.mock('@/store/healthkit', () => ({ HK_AVAILABLE: false }));
jest.mock('@/store/storage', () => ({ loadData: jest.fn(async (_k: string, fallback: unknown) => fallback) }));
jest.mock('@/store/synced-storage', () => ({ saveSyncedValue: jest.fn(async () => {}) }));
jest.mock('@/store/ui-preferences', () => ({
  ...jest.requireActual('@/store/ui-preferences'),
  useUiModules: () => ({ disabledModules: [], setModuleEnabled: jest.fn() }),
}));

let mockWindow = { width: 390, height: 844 };
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindow,
}));

import React from 'react';

import { ScreenHeader } from '@/components/shared/ScreenHeader';
import { headerLead, isSidebarRoute } from '@/components/shared/ScreenHeaderNav';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function render(node: React.ReactElement) {
  let tree: any;
  act(() => { tree = create(node); });
  return tree;
}

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 1024, height: 768 };

function header(props: Partial<React.ComponentProps<typeof ScreenHeader>> = {}) {
  return render(
    <ScreenHeader
      title="Підписки"
      color="#111"
      back={{ onPress: () => {}, label: 'Назад' }}
      {...props}
    />,
  );
}

/** Кнопки хедера — єдині вузли з accessibilityRole="button". */
function backButtons(tree: any) {
  return tree.root.findAll((n: any) => typeof n.type === 'string'
    && n.props?.accessibilityLabel === 'Назад' && n.props?.accessibilityRole === 'button');
}

describe('isSidebarRoute', () => {
  it('пункти меню впізнаються, зокрема корінь вкладок і адмінка', () => {
    expect(isSidebarRoute('/subscriptions')).toBe(true);
    expect(isSidebarRoute('/notes')).toBe(true);
    // '/(tabs)' у рядку адреси виглядає як '/'
    expect(isSidebarRoute('/')).toBe(true);
    expect(isSidebarRoute('/admin-workspace')).toBe(true);
  });

  it('підекрани пункту (activeOn) належать його розділу', () => {
    expect(isSidebarRoute('/settings-modules')).toBe(true);
    expect(isSidebarRoute('/settings-notifications')).toBe(true);
    expect(isSidebarRoute('/notifications')).toBe(true);
  });

  it('екрани поза меню — ні', () => {
    for (const p of ['/account', '/health-sleep', '/subtasks', '/finance-stats', '/project/7/members']) {
      expect(isSidebarRoute(p)).toBe(false);
    }
  });
});

describe('headerLead', () => {
  const opts = { hasBack: true, hasCrumbs: false };

  it('на телефоні «Назад» є в будь-якому розділі', () => {
    expect(headerLead('compact', '/subscriptions', opts)).toBe('back');
    expect(headerLead('compact', '/account', opts)).toBe('back');
  });

  it('крихти на телефон не потрапляють навіть тоді, коли екран їх дав', () => {
    expect(headerLead('compact', '/account', { hasBack: true, hasCrumbs: true })).toBe('back');
  });

  it('широкий екран: розділ із сайдбара лишається без стрілки', () => {
    expect(headerLead('medium', '/subscriptions', opts)).toBe('none');
    expect(headerLead('expanded', '/containers', opts)).toBe('none');
    // Крихти для розділу з сайдбара теж не малюємо: ієрархії там немає.
    expect(headerLead('expanded', '/notes', { hasBack: true, hasCrumbs: true })).toBe('none');
  });

  it('широкий екран, підекран пункту сайдбара: крихти або нічого, стрілки — ніколи', () => {
    expect(headerLead('expanded', '/settings-modules', { hasBack: true, hasCrumbs: true })).toBe('crumbs');
    expect(headerLead('expanded', '/settings-modules', opts)).toBe('none');
    expect(headerLead('compact', '/settings-modules', { hasBack: true, hasCrumbs: true })).toBe('back');
  });

  it('широкий екран поза сайдбаром: крихти, а без них — стрілка', () => {
    expect(headerLead('expanded', '/account', { hasBack: true, hasCrumbs: true })).toBe('crumbs');
    expect(headerLead('expanded', '/account', opts)).toBe('back');
  });

  it('екран без дії «Назад» нічого не малює', () => {
    expect(headerLead('compact', '/account', { hasBack: false, hasCrumbs: false })).toBe('none');
    expect(headerLead('expanded', '/account', { hasBack: false, hasCrumbs: false })).toBe('none');
  });
});

describe('ScreenHeader — рендер', () => {
  afterEach(() => { mockWindow = PHONE; mockPathname = '/subscriptions'; });

  it('телефон: стрілка на місці', () => {
    mockWindow = PHONE;
    expect(backButtons(header())).toHaveLength(1);
  });

  it('рівно на 600pt розділ із сайдбара втрачає стрілку', () => {
    mockWindow = { width: 599, height: 900 };
    expect(backButtons(header())).toHaveLength(1);
    mockWindow = { width: 600, height: 900 };
    expect(backButtons(header())).toHaveLength(0);
  });

  it('планшет, розділ поза сайдбаром: стрілка лишається', () => {
    mockWindow = TABLET;
    mockPathname = '/account';
    expect(backButtons(header({ title: 'Акаунт' }))).toHaveLength(1);
  });

  it('планшет, крихти замінюють стрілку і ведуть нагору', () => {
    mockWindow = TABLET;
    mockPathname = '/account';
    const up = jest.fn();
    const tree = header({
      title: 'Акаунт',
      crumbs: [{ label: 'Налаштування', onPress: up }, { label: 'Акаунт' }],
    });

    expect(backButtons(tree)).toHaveLength(0);

    const crumb = tree.root.findAll((n: any) => typeof n.props?.onPress === 'function'
      && n.props?.accessibilityRole === 'link'
      && n.props?.accessibilityLabel === 'Налаштування')[0];
    expect(crumb).toBeDefined();
    act(() => { crumb.props.onPress(); });
    expect(up).toHaveBeenCalledTimes(1);

    // Остання ланка — поточний екран: не клікається.
    expect(tree.root.findAll((n: any) => typeof n.type === 'string' && n.props?.accessibilityRole === 'link')).toHaveLength(1);
  });

  it('на телефоні крихт немає', () => {
    mockWindow = PHONE;
    mockPathname = '/account';
    const tree = header({
      title: 'Акаунт',
      crumbs: [{ label: 'Налаштування', onPress: () => {} }, { label: 'Акаунт' }],
    });
    expect(tree.root.findAll((n: any) => typeof n.type === 'string' && n.props?.accessibilityRole === 'link')).toHaveLength(0);
    expect(backButtons(tree)).toHaveLength(1);
  });
});

/**
 * Екрани, що раніше обходили правило: стрілку вшивали в `actions` власним
 * HeaderButton (settings-modules, members) або давали «Назад» без крихт
 * (health-profile). На планшеті стрілка стояла поруч із сайдбаром, а на
 * «Учасниках» — ще й поруч із крихтами «Проєкт → Учасники».
 */
describe('Екрани — «Назад» лише на телефоні', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const tr = require('@/store/translations').allTranslations.uk;
  const SCREENS: { name: string; path: string; load: () => React.ComponentType }[] = [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    { name: 'Учасники проєкту', path: '/project/p-1/members', load: () => require('@/app/project/[id]/members').default },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    { name: 'Модулі', path: '/settings-modules', load: () => require('@/app/settings-modules').default },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    { name: 'Налаштування здоровʼя', path: '/health-profile', load: () => require('@/app/health-profile').default },
  ];

  async function mountScreen(Screen: React.ComponentType) {
    let tree: any;
    await act(async () => { tree = create(<Screen />); });
    await act(async () => { await Promise.resolve(); });
    return tree;
  }

  const crumbLinks = (tree: any) =>
    tree.root.findAll((n: any) => typeof n.type === 'string' && n.props?.accessibilityRole === 'link');

  beforeEach(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => {
    (console.warn as jest.Mock).mockRestore?.();
    mockWindow = PHONE;
    mockPathname = '/subscriptions';
  });

  it.each(SCREENS)('$name: планшет 1024pt — стрілки немає, шлях нагору дають крихти', async ({ path, load }) => {
    mockWindow = TABLET;
    mockPathname = path;
    const tree = await mountScreen(load());
    expect(backButtons(tree)).toHaveLength(0);
    expect(crumbLinks(tree).length).toBeGreaterThan(0);
  });

  it.each(SCREENS)('$name: телефон 390pt — одна стрілка «Назад», крихт немає', async ({ path, load }) => {
    mockWindow = PHONE;
    mockPathname = path;
    const tree = await mountScreen(load());
    expect(backButtons(tree)).toHaveLength(1);
    expect(backButtons(tree)[0].props.accessibilityLabel).toBe(tr.back);
    expect(crumbLinks(tree)).toHaveLength(0);
  });
});
