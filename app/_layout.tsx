import 'react-native-get-random-values';
import crypto from 'isomorphic-webcrypto';
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Platform } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AutoBackupProvider } from '@/store/auto-backup';
import { I18nProvider } from '@/store/i18n';
import { ThemeProvider } from '@/store/theme-context';
import { TimerProvider } from '@/store/timer-context';

if (Platform.OS !== 'web') {
  // Provide WebRTC globals for trystero on native
  try {
    const webrtc = require('react-native-webrtc');
    const g = global as any;
    g.RTCPeerConnection = webrtc.RTCPeerConnection;
    g.RTCIceCandidate = webrtc.RTCIceCandidate;
    g.RTCSessionDescription = webrtc.RTCSessionDescription;
    g.MediaStream = webrtc.MediaStream;
    g.MediaStreamTrack = webrtc.MediaStreamTrack;

    // WebCrypto polyfill for trystero
    if (!g.crypto) g.crypto = {};
    if (!g.crypto.subtle) g.crypto.subtle = crypto.subtle;
    if (!g.crypto.getRandomValues) g.crypto.getRandomValues = crypto.getRandomValues.bind(crypto);
    if (typeof (crypto as any).ensureSecure === 'function' && !g.crypto.ensureSecure) {
      g.crypto.ensureSecure = (crypto as any).ensureSecure.bind(crypto);
    }
    if (typeof g.crypto.ensureSecure === 'function') {
      g.crypto.ensureSecure().catch(() => {});
    }

    // Browser-style event listeners used by trystero
    if (typeof g.addEventListener !== 'function') g.addEventListener = () => {};
    if (typeof g.removeEventListener !== 'function') g.removeEventListener = () => {};
  } catch {
    // react-native-webrtc isn't available in Expo Go
  }
}

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
        <Stack.Screen name="subtasks" options={{ headerShown: false }} />
        <Stack.Screen name="finance-stats" options={{ headerShown: false }} />
        <Stack.Screen name="time-stats" options={{ headerShown: false }} />
        <Stack.Screen name="time-records" options={{ headerShown: false }} />
        <Stack.Screen name="banks" options={{ headerShown: false }} />
        <Stack.Screen name="data" options={{ headerShown: false }} />
        <Stack.Screen name="donate" options={{ headerShown: false }} />
        <Stack.Screen name="developer" options={{ headerShown: false }} />
        <Stack.Screen name="sync" options={{ headerShown: false }} />
        <Stack.Screen name="meetings" options={{ headerShown: false }} />
        <Stack.Screen name="apple-health" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <AutoBackupProvider>
          <TimerProvider>
            <RootLayoutContent />
          </TimerProvider>
        </AutoBackupProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
