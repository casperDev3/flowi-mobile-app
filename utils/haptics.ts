/**
 * utils/haptics.ts
 *
 * Platform-safe haptic helpers з try/catch захистом.
 * НЕ гейтуємо по reduced motion: тактильний зворотній зв'язок —
 * окрема accessibility-опція від анімацій.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  light(): void {
    if (!isSupported) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  },

  medium(): void {
    if (!isSupported) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  },

  success(): void {
    if (!isSupported) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  },

  error(): void {
    if (!isSupported) return;
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {}
  },

  selection(): void {
    if (!isSupported) return;
    try {
      Haptics.selectionAsync();
    } catch {}
  },
};
