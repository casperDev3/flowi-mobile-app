/**
 * __tests__/project-members-error.test.tsx — ERR-09.
 *
 * Збій завантаження учасників (500 / таймаут / 429) малювався рівно як
 * «у проєкті нікого немає»: порожня сторінка без тексту, без пояснення і без
 * «Повторити». Це завжди неправда — у проєкті щонайменше є сам користувач, —
 * і виправити це самотужки людина не могла: `load` ретраїть лише на
 * повторний вхід на екран.
 *
 * Тест монтує екран цілком (як `budget-screen.test.tsx`) і дивиться рівно на
 * те, що бачить людина: чи є на екрані слова про збій і кнопка повтору.
 */
const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));

jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'p-1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => cb(), [cb]); },
}));
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
jest.mock('@/hooks/use-content-width', () => ({ useContentWidth: () => ({}), sheetColumnStyle: () => ({}) }));
jest.mock('@/components/projects/ProjectScreenShell', () => ({
  ProjectScreenShell: ({ children }: any) => children,
  projectShellColors: () => ({
    bg1: '#000', bg2: '#111', border: '#222', text: '#fff', sub: '#aaa', dim: '#333', accent: '#7C3AED',
  }),
}));
jest.mock('@/components/shared/ScreenHeader', () => ({
  ScreenHeader: ({ children }: any) => children,
  HeaderButton: () => null,
}));
jest.mock('@/utils/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn() } }));

jest.mock('@/store/api', () => {
  class OfflineError extends Error {}
  class ApiError extends Error { status = 500; }
  return { OfflineError, ApiError };
});

const mockFetchProjectMembers = jest.fn();
jest.mock('@/store/project-team', () => ({
  fetchProjectMembers: (...args: unknown[]) => mockFetchProjectMembers(...args),
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

import React from 'react';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tr = require('@/store/translations').allTranslations.uk;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError } = require('@/store/api');

import ProjectMembersScreen from '@/app/project/[id]/members';

function texts(tree: any): string[] {
  const out: string[] = [];
  const walk = (node: any) => {
    if (node == null) return;
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.children) node.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out;
}

async function mount() {
  let tree: any;
  await act(async () => { tree = create(<ProjectMembersScreen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

beforeEach(() => {
  mockFetchProjectMembers.mockReset();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { (console.warn as jest.Mock).mockRestore?.(); });

test('збій завантаження показано текстом і кнопкою «Повторити»', async () => {
  mockFetchProjectMembers.mockRejectedValue(new ApiError('boom'));
  const tree = await mount();
  const seen = texts(tree);
  expect(seen).toContain(tr.projectMembersError);
  expect(seen).toContain(tr.adminRetry);
});

test('«Повторити» справді перечитує список, і після успіху смужка зникає', async () => {
  mockFetchProjectMembers.mockRejectedValueOnce(new ApiError('boom'));
  const tree = await mount();
  expect(texts(tree)).toContain(tr.adminRetry);

  mockFetchProjectMembers.mockResolvedValue([
    { user: { id: 1, name: 'Я', email: 'me@example.test' }, role: 'owner' },
  ]);
  const retry = tree.root.findAll(
    (node: any) => node.props?.accessibilityLabel === tr.adminRetry && typeof node.props?.onPress === 'function',
  )[0];
  expect(retry).toBeTruthy();
  await act(async () => { retry.props.onPress(); });
  await act(async () => { await Promise.resolve(); });

  const seen = texts(tree);
  expect(seen).not.toContain(tr.adminRetry);
  expect(seen).toContain('me@example.test');
});

test('успішна відповідь не показує стану збою', async () => {
  mockFetchProjectMembers.mockResolvedValue([
    { user: { id: 1, name: 'Я', email: 'me@example.test' }, role: 'owner' },
  ]);
  const tree = await mount();
  const seen = texts(tree);
  expect(seen).not.toContain(tr.projectMembersError);
  expect(seen).not.toContain(tr.adminRetry);
});
