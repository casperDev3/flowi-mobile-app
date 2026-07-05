import 'react-native-get-random-values'; // полефіл crypto.getRandomValues (до будь-якого використання crypto)
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';

import { Onboarding } from '@/components/onboarding/Onboarding';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initReporting } from '@/utils/reporting';
import { AppModeProvider, useAppMode } from '@/store/app-mode';
import { AuthProvider, useAuth } from '@/store/auth';
import { AutoBackupProvider } from '@/store/auto-backup';
import { SyncProvider } from '@/store/sync-engine';
import { I18nProvider } from '@/store/i18n';
import { loadData } from '@/store/storage';
import { ThemeProvider } from '@/store/theme-context';
import { TimerProvider } from '@/store/timer-context';

initReporting(); // ініціалізація crash-репортингу (no-op доки не підключено Sentry)

export const unstable_settings = {
  anchor: '(tabs)',
};

// Нижній лист (bottom sheet) для під-екранів профілактики.
// iOS — нативний formSheet із детентами та «грабером»; Android — модал.
const SHEET_OPTIONS = {
  headerShown: false,
  presentation: 'formSheet' as const,
  sheetAllowedDetents: [0.92] as number[],
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: 'transparent' },
};

/**
 * Гейт першого запуску.
 * Рендерить null (чорний екран) доки не стануть відомі:
 *   - app_mode (modeReady)
 *   - auth status (!== 'loading')
 *   - welcome_done прапор
 * Тоді, якщо НЕ welcome_done І гість → redirect '/welcome' (одноразово).
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const { status: authStatus } = useAuth();
  const { ready: modeReady } = useAppMode();
  const [welcomeDone, setWelcomeDone] = useState<boolean | null>(null);
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    Promise.all([
      loadData<boolean>('welcome_done', false),
      loadData<boolean>('onboarding_done', false),
    ]).then(([wd, od]) => {
      setWelcomeDone(Boolean(wd));
      setOnboardingDone(Boolean(od));
    });
  }, []);

  const allReady = modeReady && authStatus !== 'loading' && welcomeDone !== null && onboardingDone !== null;

  useEffect(() => {
    if (!allReady) return;
    if (hasRedirected.current) return;
    // Якщо онбординг не завершено — Onboarding-модал покаже себе сам
    // і після завершення сам перейде на /welcome. Не редіректимо тут.
    if (!onboardingDone) return;
    if (!welcomeDone && authStatus === 'guest') {
      hasRedirected.current = true;
      router.replace('/welcome');
    }
  }, [allReady, welcomeDone, onboardingDone, authStatus, router]);

  // Поки не готові — показуємо порожній фон (уникаємо миготіння)
  if (!allReady) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0C0C14' : '#F4F2FF' }} />
    );
  }

  return <>{children}</>;
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AuthGate>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
          <Stack.Screen name="account" options={{ headerShown: false }} />
          <Stack.Screen name="projects" options={{ headerShown: false }} />
          <Stack.Screen name="notes" options={{ headerShown: false }} />
          <Stack.Screen name="archive" options={{ headerShown: false }} />
          <Stack.Screen name="bugs" options={{ headerShown: false }} />
          <Stack.Screen name="ideas" options={{ headerShown: false }} />
          <Stack.Screen name="subtasks" options={{ headerShown: false }} />
          <Stack.Screen name="finance-stats" options={{ headerShown: false }} />
          <Stack.Screen name="time-stats" options={{ headerShown: false }} />
          <Stack.Screen name="time-records" options={{ headerShown: false }} />
          <Stack.Screen name="banks" options={{ headerShown: false }} />
          <Stack.Screen name="data" options={{ headerShown: false }} />
          <Stack.Screen name="donate" options={{ headerShown: false }} />
          <Stack.Screen name="developer" options={{ headerShown: false }} />
          <Stack.Screen name="sync" options={{ headerShown: false }} />
          <Stack.Screen name="containers" options={{ headerShown: false }} />
          <Stack.Screen name="meetings" options={{ headerShown: false }} />
          <Stack.Screen name="budget" options={{ headerShown: false }} />
          <Stack.Screen name="apple-health" options={{ headerShown: false }} />
          <Stack.Screen name="workouts" options={{ headerShown: false }} />
          <Stack.Screen name="health-profile" options={{ headerShown: false }} />
          <Stack.Screen name="health-nutrition" options={{ headerShown: false }} />
          <Stack.Screen name="health-activity" options={{ headerShown: false }} />
          <Stack.Screen name="health-sleep" options={{ headerShown: false }} />
          <Stack.Screen name="health-vitals" options={{ headerShown: false }} />
          <Stack.Screen name="health-body" options={{ headerShown: false }} />
          <Stack.Screen name="health-summary" options={{ headerShown: false }} />
          <Stack.Screen name="health-prevention" options={{ headerShown: false }} />
          <Stack.Screen name="health-meds" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-checkups" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-vaccines" options={SHEET_OPTIONS} />
          <Stack.Screen name="health-habits" options={SHEET_OPTIONS} />
          <Stack.Screen name="notifications" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <Onboarding />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </AuthGate>
    </NavigationThemeProvider>
  );
}

function SyncGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  return (
    <SyncProvider isAuthed={status === 'authed'}>
      {children}
    </SyncProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppModeProvider>
          <AuthProvider>
            <SyncGate>
              <ThemeProvider>
                <AutoBackupProvider>
                  <TimerProvider>
                    <RootLayoutContent />
                  </TimerProvider>
                </AutoBackupProvider>
              </ThemeProvider>
            </SyncGate>
          </AuthProvider>
        </AppModeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
