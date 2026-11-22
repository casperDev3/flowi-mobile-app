/**
 * __tests__/project-members-delivery.test.tsx — rc1 (docs/release-rc1/email.md):
 * «Очікують» показує запрошення з листом, що не дійшов (`delivery_status=failed`)
 * чи не надсилався (`skipped`, пошту вимкнено), з дією «Надіслати ще раз»
 * через `POST /projects/{id}/invites/{inviteId}/resend/` і з різними
 * поясненнями для двох тротлінгів сервера (`resend_too_soon` / `resend_limit`).
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
  class ApiError extends Error {
    status: number; code: string;
    constructor(s: number, c: string, m: string) { super(m); this.status = s; this.code = c; }
  }
  return { OfflineError, ApiError };
});

const mockResend = jest.fn();
const mockLoadInvites = jest.fn();
jest.mock('@/store/project-team', () => {
  const actual = jest.requireActual('@/store/project-team');
  return {
    inviteDeliveryNotice: actual.inviteDeliveryNotice,
    resendThrottleReason: actual.resendThrottleReason,
    fetchProjectMembers: jest.fn(async () => [{ user: { id: 1, name: 'Я', email: 'me@example.test' }, role: 'owner' }]),
    getCachedMembers: jest.fn(async () => []),
    loadProjectInvites: (...args: unknown[]) => mockLoadInvites(...args),
    resendProjectInvite: (...args: unknown[]) => mockResend(...args),
    listProjectInvites: jest.fn(async () => []),
    changeMemberRole: jest.fn(),
    createInviteLink: jest.fn(),
    inviteByEmail: jest.fn(),
    removeProjectMember: jest.fn(),
    revokeProjectInvite: jest.fn(),
    setMembersCacheFor: jest.fn(),
    transferProjectOwnership: jest.fn(),
  };
});

import React from 'react';
import { Alert } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tr = require('@/store/translations').allTranslations.uk;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ApiError } = require('@/store/api');

import ProjectMembersScreen from '@/app/project/[id]/members';
import { inviteDeliveryNotice, resendThrottleReason } from '@/store/project-team';

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

function invite(id: string, email: string, delivery: string) {
  return {
    id, kind: 'email', role: 'member', email, status: 'pending', account_exists: true,
    expires_at: '2026-12-01T00:00:00Z', max_uses: 1, uses: 0, created_at: '2026-11-20T00:00:00Z',
    created_by: { id: 1, name: 'Я' }, send_count: 1, last_sent_at: '2026-11-20T00:00:00Z',
    delivery_status: delivery, delivery_error: delivery === 'failed' ? 'SMTPRecipientsRefused' : '',
  };
}

async function mount() {
  let tree: any;
  await act(async () => { tree = create(<ProjectMembersScreen />); });
  await act(async () => { await Promise.resolve(); });
  return tree;
}

function resendTextButtons(tree: any, email: string) {
  return tree.root.findAll((node: any) =>
    node.props?.accessibilityLabel === `${tr.projectMembersInviteResend}: ${email}`
    && typeof node.props?.onPress === 'function',
  );
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockResend.mockReset();
  mockLoadInvites.mockReset();
  mockLoadInvites.mockResolvedValue({
    links: [],
    pending: [invite('i-1', 'fail@example.test', 'failed'), invite('i-2', 'skip@example.test', 'skipped'), invite('i-3', 'ok@example.test', 'sent')],
    emailConfigured: true,
  });
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { alertSpy.mockRestore(); (console.warn as jest.Mock).mockRestore?.(); });

describe('helpers', () => {
  test('inviteDeliveryNotice: failed/skipped — показуємо, sent/unknown/посилання — ні', () => {
    expect(inviteDeliveryNotice({ kind: 'email', delivery_status: 'failed' })).toBe('failed');
    expect(inviteDeliveryNotice({ kind: 'email', delivery_status: 'skipped' })).toBe('skipped');
    expect(inviteDeliveryNotice({ kind: 'email', delivery_status: 'sent' })).toBeNull();
    expect(inviteDeliveryNotice({ kind: 'email' })).toBeNull();
    expect(inviteDeliveryNotice({ kind: 'link', delivery_status: 'failed' })).toBeNull();
  });

  test('resendThrottleReason розрізняє кулдаун і ліміт', () => {
    expect(resendThrottleReason(new ApiError(429, 'resend_too_soon', 'x'))).toBe('too_soon');
    expect(resendThrottleReason(new ApiError(429, 'resend_limit', 'x'))).toBe('limit');
    expect(resendThrottleReason(new ApiError(429, 'throttled', 'x'))).toBe('too_soon');
    expect(resendThrottleReason(new ApiError(409, 'invite_not_pending', 'x'))).toBeNull();
  });
});

test('«Очікують»: failed — «Лист не доставлено» + текстова «Надіслати ще раз»; skipped — поділитися посиланням', async () => {
  const tree = await mount();
  const seen = texts(tree);
  expect(seen).toContain(tr.projectMembersInviteDeliveryFailed);
  expect(seen).toContain(tr.projectMembersInviteDeliverySkipped);
  expect(seen.filter(t => t === tr.projectMembersInviteDeliveryFailed)).toHaveLength(1);
  expect(seen).toContain(tr.projectMembersInviteResend);
  // failed має і іконку, і текстову кнопку; sent — лише іконку.
  // (findAll бачить і композит, і хост-вузол — порівнюємо відносно.)
  const ok = resendTextButtons(tree, 'ok@example.test').length;
  expect(ok).toBeGreaterThan(0);
  expect(resendTextButtons(tree, 'fail@example.test').length).toBe(ok * 2);
  expect(resendTextButtons(tree, 'skip@example.test').length).toBe(ok);
});

test('повторне надсилання: успіх оновлює рядок (failed → sent зникає з попереджень)', async () => {
  mockResend.mockResolvedValue({
    invite: { ...invite('i-1', 'fail@example.test', 'sent'), send_count: 2 },
    account_exists: true, notified: true, email_sent: true, email_configured: true, delivery_status: 'sent',
  });
  const tree = await mount();
  await act(async () => { resendTextButtons(tree, 'fail@example.test')[0].props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(mockResend).toHaveBeenCalledWith('p-1', 'i-1');
  expect(texts(tree)).not.toContain(tr.projectMembersInviteDeliveryFailed);
  expect(alertSpy).toHaveBeenCalledWith(tr.projectMembersInviteResent, expect.any(String));
});

test.each([
  ['resend_too_soon', 'projectMembersInviteResendTooSoon'],
  ['resend_limit', 'projectMembersInviteResendLimit'],
])('429 %s — своє пояснення, рядок лишається failed', async (code, key) => {
  mockResend.mockRejectedValue(new ApiError(429, code, 'srv'));
  const tree = await mount();
  await act(async () => { resendTextButtons(tree, 'fail@example.test')[0].props.onPress(); });
  await act(async () => { await Promise.resolve(); });
  expect(alertSpy).toHaveBeenCalledWith(tr.projectMembersInviteResend, tr[key]);
  expect(texts(tree)).toContain(tr.projectMembersInviteDeliveryFailed);
});
