// Абстракція crash/error-репортингу.
// Зараз: no-op + dev-лог. Щоб увімкнути Sentry:
//   npx expo install @sentry/react-native
//   у initReporting() → Sentry.init({ dsn }); і розкоментувати виклики нижче.

type Extra = Record<string, unknown>;

let _initialized = false;

export function initReporting(): void {
  if (_initialized) return;
  _initialized = true;
  // Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1 });
}

export function captureException(error: unknown, extra?: Extra): void {
  if (__DEV__) console.error('[reporting] exception:', error, extra ?? '');
  // Sentry.captureException(error, { extra });
}

export function captureMessage(message: string, extra?: Extra): void {
  if (__DEV__) console.warn('[reporting] message:', message, extra ?? '');
  // Sentry.captureMessage(message, { extra });
}

export function setUser(id: string | null): void {
  // Sentry.setUser(id ? { id } : null);
}
