import 'react-native-get-random-values'; // полефіл crypto.getRandomValues (до будь-якого використання crypto)
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { initReporting } from '@/utils/reporting';
import { AppModeProvider } from '@/store/app-mode';
import { AutoBackupProvider } from '@/store/auto-backup';
import { I18nProvider } from '@/store/i18n';
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

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  return (
    <NavigationThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppModeProvider>
          <ThemeProvider>
            <AutoBackupProvider>
              <TimerProvider>
                <RootLayoutContent />
              </TimerProvider>
            </AutoBackupProvider>
          </ThemeProvider>
        </AppModeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
