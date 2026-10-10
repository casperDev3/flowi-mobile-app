/** Opt-in, once-per-release native failure injection for an isolated development device. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';

export async function runNativeReportingProbe(): Promise<void> {
  if (!__DEV__ || process.env.EXPO_PUBLIC_NATIVE_CRASH_PROBE !== '1') return;
  const key = `flowi:native-probe:${process.env.EXPO_PUBLIC_FLOWI_RELEASE || 'development'}`;
  if (await AsyncStorage.getItem(key)) return;
  await AsyncStorage.setItem(key, 'armed');
  setTimeout(() => Sentry.nativeCrash(), 20_000);
}
