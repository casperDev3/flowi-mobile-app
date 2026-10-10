import * as Sentry from '@sentry/react-native';
import { redactEvent } from './reporting-redaction';

type Extra = Record<string, unknown>;
let initialized = false;

export function initReporting(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  initialized = true;
  Sentry.init({
    dsn,
    release: process.env.EXPO_PUBLIC_FLOWI_RELEASE,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: false,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => redactEvent(event) as typeof event,
    attachScreenshot: false,
    attachViewHierarchy: false,
  });
  if (__DEV__ && process.env.EXPO_PUBLIC_NATIVE_CRASH_PROBE === '1') {
    void import('./reporting-probe').then(module => module.runNativeReportingProbe());
  }
}

export function captureException(error: unknown, _extra?: Extra): void {
  if (initialized) Sentry.captureException(error);
}

export function captureMessage(_message: string, _extra?: Extra): void {
  if (initialized) Sentry.captureMessage('Flowi operational event');
}

// Deliberately no user identifier in error telemetry.
export function setUser(_id: string | null): void {}
