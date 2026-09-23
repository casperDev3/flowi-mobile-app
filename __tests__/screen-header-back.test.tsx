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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => INSETS }));

let mockPathname = '/subscriptions';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));

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
