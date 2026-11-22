/**
 * rc1 (docs/release-rc1/compat-n1.md): 426 / min_client_version → екран
 * «Оновіть застосунок» з посиланням на стор; згода на анонімну статистику.
 */
const mockStore = new Map<string, unknown>();
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => (mockStore.has(key) ? mockStore.get(key) : fallback)),
  saveData: jest.fn(async (key: string, value: unknown) => { mockStore.set(key, value); }),
  subscribeToStorage: jest.fn(() => () => {}),
}));
jest.mock('@/store/synced-storage', () => ({ saveSyncedValue: jest.fn() }));

import {
  getWorkspaceIncompatibility,
  needsAppUpdate,
  reportClientOutdated,
  setWorkspaceIncompatibility,
} from '@/store/api-config';
import { checkWorkspaceCompatibility, type WorkspaceInfo } from '@/store/workspace';
import { isStatsSharingEnabled, withStatsSharing } from '@/store/analytics-consent';
import { parseUiPreferences } from '@/store/ui-preferences';

// Чисті функції екрана — без рендера (expo-router/Linking не потрібні).
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }) }));
// eslint-disable-next-line import/first
import { isLegacyAppId, resolveStoreUrl } from '@/app/update-required';

function info(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    workspace_protocol: 1, workspace_id: 'ws-1', name: 'Flowi', color: '#7C3AED', logo_url: null,
    registration_mode: 'open', has_users: true, sync_contract_version: 2,
    min_client_version: { mobile: '99.0.0', web: '0.1.0' }, ws_url: 'wss://x/ws', ...overrides,
  } as WorkspaceInfo;
}

afterEach(() => setWorkspaceIncompatibility(null));

describe('426 client_outdated', () => {
  it('reportClientOutdated зберігає мінімальну версію і посилання на стор', () => {
    reportClientOutdated('1.4.0', 'https://apps.apple.com/app/id1');
    expect(getWorkspaceIncompatibility()).toEqual({
      code: 'update_app_to', minVersion: '1.4.0', storeUrl: 'https://apps.apple.com/app/id1',
    });
    expect(needsAppUpdate(getWorkspaceIncompatibility())).toBe(true);
  });

  it('N-1 сервер без store_url — без поля storeUrl', () => {
    reportClientOutdated('1.4.0');
    expect(getWorkspaceIncompatibility()).toEqual({ code: 'update_app_to', minVersion: '1.4.0' });
  });

  it('workspace_changed / update_server не ведуть на екран оновлення', () => {
    expect(needsAppUpdate({ code: 'workspace_changed' })).toBe(false);
    expect(needsAppUpdate({ code: 'update_server' })).toBe(false);
    expect(needsAppUpdate(null)).toBe(false);
  });

  it('min_client_version з workspace бере store_urls для цієї ОС', () => {
    const res = checkWorkspaceCompatibility(info({ store_urls: { ios: 'https://ios.example/app', android: 'https://play.example/app' } }));
    expect(res).toMatchObject({ ok: false, code: 'update_app_to', minVersion: '99.0.0' });
    expect((res as { storeUrl?: string }).storeUrl).toMatch(/^https:\/\/(ios|play)\.example\/app$/);
  });

  it('легасі workspace без store_urls — без storeUrl', () => {
    expect(checkWorkspaceCompatibility(info())).toEqual({ ok: false, code: 'update_app_to', minVersion: '99.0.0' });
  });
});

describe('resolveStoreUrl', () => {
  it('пріоритет: сервер → app.json extra → env; лише https', () => {
    expect(resolveStoreUrl({ code: 'update_app_to', storeUrl: 'https://srv' }, 'ios', { ios: 'https://extra' }, { ios: 'https://env' })).toBe('https://srv');
    expect(resolveStoreUrl({ code: 'update_app_to' }, 'ios', { ios: 'https://extra' }, { ios: 'https://env' })).toBe('https://extra');
    expect(resolveStoreUrl(null, 'android', undefined, { android: 'https://env' })).toBe('https://env');
    expect(resolveStoreUrl({ code: 'update_app_to', storeUrl: 'javascript:alert(1)' }, 'ios', undefined, {})).toBeNull();
    expect(resolveStoreUrl(null, 'ios', { ios: '' }, {})).toBeNull();
  });

  it('старий ID застосунку → варіант «Встановіть новий Flowi»', () => {
    expect(isLegacyAppId('com.casper3.f-tracking-app')).toBe(true);
    expect(isLegacyAppId('app.flowi.mobile')).toBe(false);
    expect(isLegacyAppId(undefined)).toBe(false);
  });
});

describe('analytics consent (ui_preferences.shareAnonymousStats)', () => {
  it('за замовчуванням увімкнено, зокрема для легасі-запису', () => {
    expect(isStatsSharingEnabled(parseUiPreferences(null))).toBe(true);
    expect(isStatsSharingEnabled(parseUiPreferences({ version: 1, disabledModules: ['finance'] }))).toBe(true);
  });

  it('вимкнення зберігає чужі поля і вимкнені модулі', () => {
    const current = parseUiPreferences({ version: 1, disabledModules: ['finance'], pinnedSections: ['notes'] });
    const next = withStatsSharing(current, false, new Date('2026-11-22T10:00:00Z'));
    expect(next).toMatchObject({ disabledModules: ['finance'], pinnedSections: ['notes'], shareAnonymousStats: false });
    expect(isStatsSharingEnabled(next)).toBe(false);
    expect(isStatsSharingEnabled(withStatsSharing(next, true))).toBe(true);
  });
});
