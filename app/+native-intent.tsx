/**
 * app/+native-intent.tsx — переписування системних посилань до навігації
 * (expo-router NativeIntent).
 *
 * Єдине, що тут робиться: «швидкий запис нотатки»
 * (`ftrackingapp:///notes?capture=1`, а також давній `?create=1` віджета)
 * НЕ веде на повний екран нотаток, а відкриває міні-аркуш поверх поточного
 * екрана (store/note-capture.ts → GlobalNoteCapture в app/_layout.tsx).
 *  - застосунок уже відкритий → порожній шлях: навігації немає взагалі;
 *  - холодний старт → головний екран, аркуш — поверх нього.
 * Решта посилань (запрошення, зустрічі, push) проходять без змін.
 *
 * Кидати звідси не можна — помилка тут валить застосунок (див. документацію
 * NativeIntent), тож усе в try/catch.
 */
import { isNoteCaptureLink, requestNoteCapture } from '@/store/note-capture';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (isNoteCaptureLink(path)) {
      requestNoteCapture();
      return initial ? '/' : '';
    }
  } catch (error) {
    if (__DEV__) console.warn('[native-intent] не вдалося розібрати посилання:', error);
  }
  return path;
}
