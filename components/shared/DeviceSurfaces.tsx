/**
 * components/shared/DeviceSurfaces.tsx — поверхні поза застосунком
 * (watch-lockscreen-v1.md §6–§10): знімок iOS-віджета, Apple Watch, Live
 * Activity таймера, черга «Стоп» з App Group, Android-віджети й сповіщення.
 *
 * Окремий листовий компонент, що нічого не малює: ці хуки слухають таймери
 * (TimerContext) і сховище, і кожна їхня зміна стану перемальовувала б увесь
 * корінь (RootLayoutContent → Stack). Тут вона перемальовує лише цей `null`.
 * Кожен хук сам — no-op на «чужій» платформі.
 */
import { useAndroidSurfaces } from '@/store/android-surfaces';
import { useDeviceActionDrain } from '@/store/device-actions';
import { useTimerLiveActivity } from '@/store/live-activity';
import { useWatchLink } from '@/store/watch-link';
import { useWidgetSnapshotWriter } from '@/store/widget-sync';

export function DeviceSurfaces(): null {
  // Поза AuthGate навмисно: вихід з акаунта теж має прибрати цифри з віджета.
  useWidgetSnapshotWriter();
  useWatchLink();
  useTimerLiveActivity();
  useDeviceActionDrain();
  useAndroidSurfaces();
  return null;
}
