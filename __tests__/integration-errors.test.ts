import { ApiError } from '../store/api';
import { allTranslations } from '../store/translations';
import { INTEGRATION_HOST_EXAMPLES, integrationCodeMessage, integrationErrorMessage } from '../utils/integrationErrors';
jest.mock('@react-native-async-storage/async-storage', () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}), multiGet: jest.fn(async () => []), getAllKeys: jest.fn(async () => []) } }));

// Same list as flowi-web-app — keys equal server error codes.
const SPEC_KEYS: string[] = ["invalid_request_body", "invalid_provider", "invalid_credentials", "missing_credentials", "invalid_provider_host", "provider_host_unavailable", "access_denied", "provider_rejected", "provider_unavailable", "rate_limited", "invalid_provider_response", "encryption_not_configured", "oauth_not_configured", "credentials_unavailable", "different_source_host", "use_google_oauth", "invalid_connection", "invalid_source", "calendar_read_only", "calendar_already_connected", "status_mapping_required", "external_user_required", "invalid_status_target", "invalid_field_target", "unknown_project_member", "invalid_configuration", "invalid_mapping", "invalid_scope", "invalid_exports", "invalid_period", "invalid_timezone", "preview_required", "preview_expired", "disconnected", "connection_owner_access_lost", "transition_unavailable", "calendar_scheduling_requires_provider", "conflict_changed", "task_deadline_authoritative", "invalid_resolution", "conflicts_pending", "invalid_oauth_state", "integration_internal_error", "generic", "attention"];
const uk = allTranslations.uk;
const en = allTranslations.en;

describe('integration error catalogue', () => {
  it('uk and en cover exactly the spec keys', () => {
    expect(Object.keys(uk.integrationErrors).sort()).toEqual([...SPEC_KEYS].sort());
    expect(Object.keys(en.integrationErrors).sort()).toEqual([...SPEC_KEYS].sort());
    for (const key of SPEC_KEYS) {
      expect((uk.integrationErrors as Record<string, string>)[key]).toBeTruthy();
      expect((en.integrationErrors as Record<string, string>)[key]).toBeTruthy();
    }
  });

  it('host examples match the web literals', () => {
    expect(INTEGRATION_HOST_EXAMPLES).toEqual({ worksection: 'https://company.worksection.com', jira: 'https://company.atlassian.net' });
  });
});

describe('integrationErrorMessage', () => {
  const hostError = new ApiError(400, 'invalid_provider_host', 'HTTP 400', { code: 'invalid_provider_host' });

  it('substitutes the provider example', () => {
    expect(integrationErrorMessage(hostError, uk, 'worksection')).toBe(uk.integrationErrors.invalid_provider_host.replace('{example}', 'https://company.worksection.com'));
    expect(integrationErrorMessage(hostError, en, 'jira')).toBe(en.integrationErrors.invalid_provider_host.replace('{example}', 'https://company.atlassian.net'));
    expect(integrationErrorMessage(hostError, uk)).toContain('https://company.worksection.com');
    expect(integrationErrorMessage(hostError, uk, 'jira')).not.toContain('{example}');
  });

  it('maps known codes regardless of status', () => {
    expect(integrationErrorMessage(new ApiError(503, 'provider_unavailable', 'HTTP 503', { code: 'provider_unavailable', retryable: true }), en)).toBe(en.integrationErrors.provider_unavailable);
    expect(integrationErrorMessage(new ApiError(500, 'integration_internal_error', 'HTTP 500'), uk)).toBe(uk.integrationErrors.integration_internal_error);
  });

  it('falls back to the internal error text for unknown 5xx', () => {
    expect(integrationErrorMessage(new ApiError(500, 'unknown', 'HTTP 500'), uk)).toBe(uk.integrationErrors.integration_internal_error);
  });

  it('never shows the raw server detail for unknown 4xx — catalogue fallback instead', () => {
    expect(integrationErrorMessage(new ApiError(404, 'Not found.', 'Not found.', { detail: 'Not found.' }), uk)).toBe(uk.integrationErrors.generic);
    expect(integrationErrorMessage(new ApiError(404, 'Not found.', 'Not found.', { detail: 'Not found.' }), en)).toBe(en.integrationErrors.generic);
  });

  it('knows conflicts_pending and invalid_oauth_state in uk and en (same text as web)', () => {
    expect(integrationErrorMessage(new ApiError(409, 'conflicts_pending', 'x'), uk)).toBe('Спершу синхронізуйте зміни, що очікують');
    expect(integrationErrorMessage(new ApiError(409, 'conflicts_pending', 'x'), en)).toBe('Sync pending changes first');
    expect(integrationErrorMessage(new ApiError(400, 'invalid_oauth_state', 'x'), uk)).toBe('Сеанс авторизації застарів — спробуйте ще раз');
    expect(integrationErrorMessage(new ApiError(400, 'invalid_oauth_state', 'x'), en)).toBe('Authorization session expired — try again');
  });

  it('falls back to generic text', () => {
    expect(integrationErrorMessage(new ApiError(400, 'unknown', 'HTTP 400', { detail: '  ' }), uk)).toBe(uk.integrationErrors.generic);
    expect(integrationErrorMessage(new Error('boom'), en)).toBe(en.integrationErrors.generic);
    expect(integrationErrorMessage('ApiError: x', uk)).toBe(uk.integrationErrors.generic);
  });

  it('uses the network text for offline errors', () => {
    expect(integrationErrorMessage(new ApiError(0, 'network', 'Network request failed'), uk)).toBe(uk.authNetworkError);
    expect(integrationErrorMessage(new ApiError(0, 'timeout', 'Request timed out'), en)).toBe(en.authNetworkError);
  });
});

describe('integrationCodeMessage', () => {
  it('maps codes and falls back to attention', () => {
    expect(integrationCodeMessage('access_denied', uk, 'trello')).toBe(uk.integrationErrors.access_denied);
    expect(integrationCodeMessage('something_new', en)).toBe(en.integrationErrors.attention);
    expect(integrationCodeMessage('', uk)).toBe(uk.integrationErrors.attention);
  });
});
