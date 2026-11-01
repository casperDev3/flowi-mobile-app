import { ApiError } from '@/store/api';
import type { Translations } from '@/store/translations';

/** Provider address examples — literals, shared with the web client. */
export const INTEGRATION_HOST_EXAMPLES: Record<string, string> = {
  worksection: 'https://company.worksection.com',
  jira: 'https://company.atlassian.net',
};

type IntegrationErrorKey = keyof Translations['integrationErrors'];

function lookup(code: unknown, tr: Translations, provider?: string): string | null {
  if (typeof code !== 'string' || !code) return null;
  const messages = tr.integrationErrors;
  if (!Object.prototype.hasOwnProperty.call(messages, code)) return null;
  const example = (provider && INTEGRATION_HOST_EXAMPLES[provider]) || INTEGRATION_HOST_EXAMPLES.worksection;
  return messages[code as IntegrationErrorKey].replace('{example}', example);
}

/** Localized text for a server `error_code` (connection card / history run). */
export function integrationCodeMessage(code: string | null | undefined, tr: Translations, provider?: string): string {
  return lookup(code, tr, provider) ?? tr.integrationErrors.attention;
}

/** Localized text for a failed integrations request. Never exposes "HTTP 400" or raw error strings. */
export function integrationErrorMessage(e: unknown, tr: Translations, provider?: string): string {
  if (!(e instanceof ApiError)) return tr.integrationErrors.generic;
  if (e.status === 0 || e.code === 'network' || e.code === 'timeout') {
    return tr.authNetworkError || tr.integrationErrors.provider_unavailable;
  }
  const known = lookup(e.code, tr, provider);
  if (known) return known;
  if (e.status >= 500) return tr.integrationErrors.integration_internal_error;
  // Сирий серверний `detail` (англійською, технічний) людина не бачить:
  // невідомий код — загальний текст каталогу.
  return tr.integrationErrors.generic;
}
