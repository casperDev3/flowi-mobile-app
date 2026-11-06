import { readFileSync } from 'fs';
import { join } from 'path';

import {
  GCAL_MAX_CALENDARS, GCAL_RETURN_URL, canAutoSync, conflictFieldKeys, conflictValue, isTrashedMeeting,
  needsReconnect, parseGcalReturn, restoredMeeting, sameSelection, selectionFromCalendars, setExportCalendar,
  toggleImportCalendar,
} from '../utils/googleCalendar';

const cal = (id: string, extra: Record<string, unknown> = {}) => ({ id, label: id, writable: true, import: false, export: false, ...extra });

describe('googleCalendar selection (same rules as web lib/google-calendar.ts)', () => {
  it('first setup picks the primary calendar for import and export', () => {
    expect(selectionFromCalendars({ calendars: [cal('a'), cal('me', { primary: true })], export_calendar: null, import_calendars: [] }))
      .toEqual({ import: ['me'], export: 'me' });
  });

  it('keeps export inside import and drops unknown ids', () => {
    expect(selectionFromCalendars({ calendars: [cal('a'), cal('b')], export_calendar: 'b', import_calendars: ['a', 'gone'] }))
      .toEqual({ import: ['a', 'b'], export: 'b' });
  });

  it('unchecking the export calendar clears export', () => {
    expect(toggleImportCalendar({ import: ['a', 'b'], export: 'b' }, 'b')).toEqual({ import: ['a'], export: null });
  });

  it('export only to writable calendars, added to import', () => {
    const calendars = [cal('a'), cal('ro', { writable: false })];
    expect(setExportCalendar({ import: [], export: null }, 'a', calendars)).toEqual({ import: ['a'], export: 'a' });
    expect(setExportCalendar({ import: ['a'], export: 'a' }, 'ro', calendars)).toEqual({ import: ['a'], export: 'a' });
  });

  it('caps at 20 calendars', () => {
    const full = { import: Array.from({ length: GCAL_MAX_CALENDARS }, (_, i) => `c${i}`), export: null };
    expect(toggleImportCalendar(full, 'x')).toBe(full);
    expect(sameSelection(full, { import: [...full.import].reverse(), export: null })).toBe(true);
  });
});

describe('googleCalendar conflicts, return url, trash', () => {
  it('merges start/end into one time field', () => {
    expect(conflictFieldKeys(['start', 'end', 'externalRecurrence', 'cancelled'])).toEqual(['time', 'recurrence', 'cancelled']);
    expect(conflictValue({ date: '2026-11-06', time: '10:00', durationMinutes: 30 }, 'time')).toBe('2026-11-06 10:00 · 30 хв');
  });

  it('parses the server redirect', () => {
    expect(parseGcalReturn(`${GCAL_RETURN_URL}?gcal=connected`)).toEqual({ result: 'connected', code: '' });
    expect(parseGcalReturn(`${GCAL_RETURN_URL}?gcal=error&code=access_denied`)).toEqual({ result: 'error', code: 'access_denied' });
    expect(parseGcalReturn(GCAL_RETURN_URL)).toBeNull();
  });

  it('reconnect and auto-sync gates', () => {
    const base = { id: '1', state: 'active', error_code: '', needs_setup: false } as never;
    expect(needsReconnect({ configured: true, connected: false, connection: null })).toBe(true);
    expect(canAutoSync({ configured: true, connected: true, connection: base })).toBe(true);
    expect(canAutoSync({ configured: true, connected: true, connection: { ...(base as object), error_code: 'reauth_required' } as never })).toBe(false);
  });

  it('trash detection and restore keep unknown keys', () => {
    expect(isTrashedMeeting({ deletedAt: 'x' })).toBe(true);
    expect(isTrashedMeeting({ integrationCancelled: true })).toBe(true);
    expect(restoredMeeting({ id: 'm', deletedAt: 'x', deletedSource: 'google', integrationCancelled: true, cancelled: true, extra: 1 } as never))
      .toEqual({ id: 'm', integrationCancelled: false, cancelled: false, extra: 1 });
  });

  it('client-side PKCE is gone', () => {
    const root = join(__dirname, '..');
    expect(() => readFileSync(join(root, 'components/calendar/useGoogleCalendar.ts'))).toThrow();
    for (const file of ['components/calendar/GoogleCalendarSheet.tsx', 'components/calendar/GoogleCalendarPanel.tsx', 'components/calendar/useGoogleCalendarSync.ts']) {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).not.toMatch(/accounts\.google\.com|oauth2\.googleapis|gcal_client_id|code_verifier|TextInput/);
    }
  });
});
