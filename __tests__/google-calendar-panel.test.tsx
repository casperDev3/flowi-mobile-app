import React from 'react';
import { GoogleCalendarPanel } from '../components/calendar/GoogleCalendarPanel';
import { useGoogleCalendarSync, type GoogleCalendarSync } from '../components/calendar/useGoogleCalendarSync';
import { apiFetch, ApiError } from '../store/api';
import * as WebBrowser from 'expo-web-browser';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), multiGet: jest.fn(async () => []), getAllKeys: jest.fn(async () => []) } }));
jest.mock('../store/api', () => {
  class ApiError extends Error {
    status: number; code: string; details?: Record<string, unknown>;
    constructor(status: number, code: string, message: string, details?: Record<string, unknown>) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; }
  }
  return { apiFetch: jest.fn(), ApiError };
});
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
const mockPull = jest.fn(async () => {});
jest.mock('../store/sync-engine', () => ({ useSync: () => ({ syncNow: mockPull }) }));
jest.mock('../store/app-mode', () => ({ isOnlineMode: () => true }));

const api = apiFetch as jest.Mock;
const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

const connection = (extra: Record<string, unknown> = {}) => ({
  id: 'c1', state: 'active', error_code: '', account: 'me@example.com', time_zone: 'Europe/Kyiv',
  last_success: null, next_run: null, export_calendar: 'me', import_calendars: ['me'],
  calendars: [{ id: 'me', label: 'Мій', color: '#4285F4', writable: true, import: true, export: true }],
  conflicts: 0, needs_setup: false, ...extra,
});

let gcalRef: GoogleCalendarSync;
function Harness() {
  const gcal = useGoogleCalendarSync();
  gcalRef = gcal;
  return <GoogleCalendarPanel gcal={gcal} isDark={false} />;
}
async function render() { let tree: any; await act(async () => { tree = create(<Harness />); }); return tree; }
const textOf = (tree: any) => JSON.stringify(tree.toJSON());
async function press(tree: any, label: string) {
  const node = tree.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`no button ${label}`);
  await act(async () => { node.props.onPress(); });
}

beforeEach(() => { api.mockReset(); openAuth.mockReset(); mockPull.mockClear(); jest.useRealTimers(); });

it('connects through the server URL and opens calendar selection on first setup', async () => {
  let connected = false;
  api.mockImplementation(async (path: string, options?: { method?: string; body?: unknown }) => {
    if (path === '/integrations/google/' && !options) return connected
      ? { configured: true, connected: true, connection: connection({ state: 'draft', needs_setup: true, calendars: [], import_calendars: [], export_calendar: null }) }
      : { configured: true, connected: false, connection: null };
    if (path === '/integrations/google/connect/') return { url: 'https://accounts.example/auth' };
    if (path === '/integrations/google/calendars/' && !options) return {
      calendars: [{ id: 'me', label: 'Мій', primary: true, writable: true, import: false, export: false }, { id: 'hol', label: 'Свята', writable: false, import: false, export: false }],
      export_calendar: null, import_calendars: [],
    };
    if (path === '/integrations/google/calendars/' && options?.method === 'PUT') return { configured: true, connected: true, connection: connection() };
    throw new Error(`unexpected ${path}`);
  });
  openAuth.mockImplementation(async () => { connected = true; return { type: 'success', url: 'ftrackingapp://integrations/google?gcal=connected' }; });

  const tree = await render();
  await act(async () => { await gcalRef.refresh(); });
  expect(textOf(tree)).toContain('Підключити Google');
  await press(tree, 'Підключити Google');

  expect(api).toHaveBeenCalledWith('/integrations/google/connect/', { method: 'POST', body: { return_to: 'ftrackingapp://integrations/google' } });
  expect(openAuth).toHaveBeenCalledWith('https://accounts.example/auth', 'ftrackingapp://integrations/google');
  expect(textOf(tree)).toContain('Свята');
  expect(textOf(tree)).toContain('Лише читання');

  await press(tree, 'Зберегти вибір');
  expect(api).toHaveBeenCalledWith('/integrations/google/calendars/', { method: 'PUT', body: { import: ['me'], export: 'me' } });
  expect(mockPull).toHaveBeenCalled();
  await act(async () => tree.unmount());
});

it('shows a refreshed conflict on 409 conflict_changed', async () => {
  const conflict = { id: 'l1', meeting_id: 'm1', title: 'Стендап', calendar_id: 'me', calendar_label: 'Мій', fields: ['start'], local: { date: '2026-11-06', time: '10:00', durationMinutes: 30 }, remote: { date: '2026-11-06', time: '11:00', durationMinutes: 30 }, detected_at: null };
  const changed = { ...conflict, remote: { date: '2026-11-07', time: '12:00', durationMinutes: 30 } };
  api.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/integrations/google/' && !options) return { configured: true, connected: true, connection: connection({ conflicts: 1 }) };
    if (path === '/integrations/google/conflicts/') return { conflicts: [conflict] };
    if (path.endsWith('/resolve/')) throw new ApiError(409, 'conflict_changed', 'HTTP 409', { code: 'conflict_changed', conflict: changed });
    throw new Error(`unexpected ${path}`);
  });
  const tree = await render();
  await act(async () => { await gcalRef.refresh(); });
  await press(tree, 'Конфлікти · 1');
  expect(textOf(tree)).toContain('11:00');
  await press(tree, 'Взяти версію Google');
  expect(api).toHaveBeenCalledWith('/integrations/google/conflicts/l1/resolve/', { method: 'POST', body: { choice: 'remote' } });
  expect(textOf(tree)).toContain('2026-11-07 12:00');
  await act(async () => tree.unmount());
});

it('syncOnOpen posts a sync only for a ready connection', async () => {
  api.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (path === '/integrations/google/' && !options) return { configured: true, connected: true, connection: connection() };
    if (path === '/integrations/google/sync/') return { state: 'fresh' };
    throw new Error(`unexpected ${path}`);
  });
  const tree = await render();
  await act(async () => { gcalRef.syncOnOpen(); await new Promise(r => setTimeout(r, 0)); });
  expect(api).toHaveBeenCalledWith('/integrations/google/sync/', { method: 'POST', body: {} });
  await act(async () => tree.unmount());
});
