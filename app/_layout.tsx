import 'react-native-get-random-values'; // полефіл crypto.getRandomValues (до будь-якого використання crypto)
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import 'react-native-reanimated';

import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { NavSidebar } from '@/components/shared/NavSidebar';
import { SIDEBAR_HIDDEN_ON, sidebarVisible } from '@/constants/nav';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOrientationLock } from '@/hooks/use-orientation-lock';
import { useResponsive } from '@/hooks/use-responsive';
import { initReporting } from '@/utils/reporting';
import { AppModeProvider, useAppMode } from '@/store/app-mode';
import { AuthProvider, useAuth } from '@/store/auth';
import { AutoBackupProvider } from '@/store/auto-backup';
import { ensureStorageMigrations } from '@/store/migrations';
import { SyncProvider } from '@/store/sync-engine';
import { I18nProvider, useI18n } from '@/store/i18n';
import { rescheduleSubscriptionRemindersFromStorage } from '@/store/notifications';
import { subscribeToStorage } from '@/store/storage';
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
 * Гейт стартового екрана.
 * Після відновлення режиму й сесії гість в online-режимі завжди бачить
 * стандартний вибір «Увійти / Зареєструватись». Свідомо обраний offline-режим
 * лишається доступним без авторизації.
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const cs = useColorScheme();
  const isDark = cs === 'dark';
  const { status: authStatus } = useAuth();
  const { online, ready: modeReady } = useAppMode();
  const pathname = usePathname();

  const allReady = modeReady && authStatus !== 'loading';

  // Поки не готові — показуємо порожній фон (уникаємо миготіння)
  if (!allReady) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? '#0C0C14' : '#F4F2FF' }} />
    );
  }

  const isAuthScreen = SIDEBAR_HIDDEN_ON.includes(pathname);
  if (authStatus === 'guest' && online && !isAuthScreen) {
    return <Redirect href="/welcome" />;
  }

  return <>{children}</>;
}

/**
 * Нагадування про оплату підписок (локальні ОС-нотифікації).
 *
 * Живе на рівні кореня, а не на екрані підписок: нагадування мусять
 * переплануватись і тоді, коли підписку продовжили на іншому пристрої (запис
 * синку), і після довгої паузи (прострочена стає «щоденною»), навіть якщо
 * екран підписок сьогодні не відкривали. Лише ЧИТАЄ сховище; дозвіл тут не
 * запитується — фоновий запит дозволу посеред іншого екрана збивав би з толку.
 */
function SubscriptionReminders() {
  const { tr, lang } = useI18n();
  const trRef = React.useRef(tr);
  trRef.current = tr;
  const langRef = React.useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      if (cancelled) return;
      try {
        await rescheduleSubscriptionRemindersFromStorage(trRef.current, langRef.current);
      } catch (e) {
        if (__DEV__) console.warn('[subscriptions] планування нагадувань не вдалося:', e);
      }
    };
    // Дебаунс: синк пише ключ пачками, а мова/валюти теж можуть змінитися разом.
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, 800);
    };

    schedule();
    const unsubscribe = subscribeToStorage(key => {
      if (key === 'subscriptions' || key === 'finance_currencies' || key === 'notificationsEnabled') schedule();
    });
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') schedule();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
    };
  }, [lang]);

  return null;
}

/**
 * Екрани входу — самодостатні: користувач ще не всередині додатку, і
 * навігація по розділах йому нікуди не веде.
 */

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isWide } = useResponsive();
  const pathname = usePathname();

  // Сайдбар живе ТУТ, а не в (tabs)/_layout: інакше Stack-екрани
  // (Проєкти, Нотатки, Контейнери…) відкривалися б поверх нього, і
  // постійна навігація зникала б рівно там, де вона найпотрібніша.
  const showSidebar = sidebarVisible(isWide, pathname);

  return (
    <NavigationThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <AuthGate>
        <View style={{ flex: 1, flexDirection: 'row' }}>
        {showSidebar && <NavSidebar pathname={pathname} isDark={isDark} />}
        <View style={{ flex: 1 }}>
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
          <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
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
        </View>
        </View>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <SubscriptionReminders />
      </AuthGate>
    </NavigationThemeProvider>
  );
}

function SyncGate({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [migrated, setMigrated] = useState(false);

  // Міграції мусять завершитись ДО першого обміну: рушій читає колекції за
  // їхньою поточною формою, і синк застарілої форми запише на сервер сміття.
  // UI при цьому не блокуємо — притримуємо лише синхронізацію.
  // ensureStorageMigrations, а не runStorageMigrations: на ту саму обіцянку
  // чекає TimerProvider, перш ніж прочитати реєстр таймерів.
  useEffect(() => {
    ensureStorageMigrations()
      .catch(e => {
        // Ковтати це мовчки не можна: далі синк читатиме колекції в застарілій
        // формі. Форму він тепер переживе (див. sync-engine), але дані такого
        // ключа на сервер не поїдуть, і причина має бути видимою.
        console.warn('[migrations] НЕ ВІДПРАЦЮВАЛИ — дані лишились у старій формі:', e);
      })
      .finally(() => setMigrated(true));
  }, []);

  return (
    <SyncProvider isAuthed={migrated && status === 'authed'}>
      {children}
    </SyncProvider>
  );
}

export default function RootLayout() {
  useOrientationLock();

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
