/**
 * hooks/use-top-inset.ts
 *
 * Верхній інсет (статус-бар, чубчик, Dynamic Island), порахований у JS.
 *
 * Нативний `SafeAreaView edges={['top']}` для цього не годиться: він додає
 * padding окремим нативним комітом ПІСЛЯ того, як JS уже розклав дерево.
 * На першому кадрі й після кожного переобчислення вікна (поворот, Split View,
 * клавіатура, повернення на таб із detachInactiveScreens) хедер устигає
 * намалюватись іще без цього padding — і заїжджає під статус-бар.
 *
 * Друга половина того самого бага — Android: WindowInsetsCompat там віддає
 * top=0 (застосунок без edge-to-edge, вміст усередині Modal, частина
 * OEM-прошивок), а фолбеку в компонента немає взагалі, тож інсет лишається
 * нулем назавжди. StatusBar.currentHeight у цьому випадку знає правду.
 *
 * `useSafeAreaInsets()` читає ті самі метрики, але в JS, тож відступ потрапляє
 * у той самий лейаут-прохід, що й решта хедера. Кореневий SafeAreaProvider дає
 * expo-router (ExpoRoot), тож хук доступний з будь-якого екрана.
 */
import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Чиста частина правила — винесена, щоб її можна було перевірити без рендера.
 *
 * Math.max, а не «на Android беремо StatusBar.currentHeight»: подвоїти інсет
 * ця формула не може за побудовою, а вибір однієї з двох величин обов'язково
 * промахнеться там, де більша інша (виріз у ландшафті проти нульового інсету
 * всередині Modal).
 */
export function resolveTopInset(
  insetTop: number,
  platform: string,
  statusBarHeight: number | null | undefined,
): number {
  if (platform !== 'android') return insetTop;
  return Math.max(insetTop, statusBarHeight ?? 0);
}

export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  return resolveTopInset(insets.top, Platform.OS, StatusBar.currentHeight);
}
