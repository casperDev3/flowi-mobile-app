/**
 * app/+native-intent.tsx — переписування системних посилань до навігації
 * (expo-router NativeIntent). Політика — docs/release-rc1/deeplinks.md,
 * розбір — utils/deepLinks.ts (спільна з вебом фікстура маршрутів).
 *
 *  1. «Швидкий запис нотатки» (`ftrackingapp:///notes?capture=1`, давній
 *     `?create=1` віджета) — НЕ навігація, а міні-аркуш поверх поточного
 *     екрана (store/note-capture.ts → GlobalNoteCapture в app/_layout.tsx):
 *     застосунок відкритий → порожній шлях; холодний старт → головний екран.
 *  2. Запрошення (`https://app.flowi.com.ua/invite…`, `/invite/menu`,
 *     `/invite/training`, `flowi://invite|menu-invite|training-invite`, аліас
 *     `ftrackingapp://…`) → відповідний екран: він сам розбирається з
 *     workspace і входом.
 *  3. Сторінки кабінету `https://app.flowi.com.ua/app/**` і форми реєстру
 *     сервера (`flowi://project/…`, `ftrackingapp://meeting/…`) → намір
 *     (store/deep-link-intent.ts) + `/open-link`: той екран дочекається
 *     сесії, перевірить доступ до проєкту й лише тоді відкриє ціль. Гість
 *     іде на вхід, а намір переживає вхід.
 *  4. Решта (віджети `ftrackingapp:///time`, Google OAuth return, QR коробки)
 *     — без змін, expo-router розбирає сам.
 *
 * Кидати звідси не можна — помилка тут валить застосунок (див. документацію
 * NativeIntent), тож усе в try/catch.
 */
import { setDeepLinkIntent } from '@/store/deep-link-intent';
import { isNoteCaptureLink, requestNoteCapture } from '@/store/note-capture';
import { resolveIncomingLink } from '@/utils/deepLinks';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (isNoteCaptureLink(path)) {
      requestNoteCapture();
      return initial ? '/' : '';
    }
    const link = resolveIncomingLink(path);
    if (!link) return path;
    if (link.kind === 'invite') return link.route;
    return setDeepLinkIntent(link) ? '/open-link' : path;
  } catch (error) {
    if (__DEV__) console.warn('[native-intent] не вдалося розібрати посилання:', error);
  }
  return path;
}
