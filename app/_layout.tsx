import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AutoBackupProvider } from '@/store/auto-backup';
import { ThemeProvider } from '@/store/theme-context';
import { TimerProvider } from '@/store/timer-context';

export const unstable_settings = {
  anchor: '(tabs)',
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
        <Stack.Screen name="finance-stats" options={{ headerShown: false }} />
        <Stack.Screen name="time-stats" options={{ headerShown: false }} />
        <Stack.Screen name="banks" options={{ headerShown: false }} />
        <Stack.Screen name="data" options={{ headerShown: false }} />
        <Stack.Screen name="donate" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AutoBackupProvider>
        <TimerProvider>
          <RootLayoutContent />
        </TimerProvider>
      </AutoBackupProvider>
    </ThemeProvider>
  );
}
