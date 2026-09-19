/**
 * utils/clipboard.ts — покласти текст у буфер обміну з тактильним відгуком.
 *
 * Одне місце на всі кнопки «Копіювати» списку завдань: картка, шапка деталі,
 * рядок підзавдання. Підтвердження на екрані (тост) показує сам екран — у
 * нього свій тост і свій словник; тут лише результат, щоб знати, чи його
 * показувати взагалі.
 */
import * as Clipboard from 'expo-clipboard';

import { haptic } from './haptics';

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    haptic.success();
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[clipboard] копіювання не вдалося:', e);
    haptic.error();
    return false;
  }
}
