import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Оголошення для VoiceOver/TalkBack (WCAG 4.1.3 Status Messages).
 *
 * `accessibilityRole="alert"` у RN НЕ озвучує текст сам у момент появи
 * (на iOS — взагалі ніяк), тож помилки форм лишались німими. Хук говорить
 * повідомлення ОДИН раз, коли воно змінюється на непорожнє; той самий текст
 * повторно не озвучується, порожній рядок скидає пам'ять.
 *
 * Не поєднувати з `accessibilityLiveRegion` на тому ж вузлі — Android
 * прочитає двічі.
 */
export function announce(message: string | null | undefined): void {
  const text = (message ?? '').trim();
  if (!text) return;
  try {
    AccessibilityInfo.announceForAccessibility(text);
  } catch {
    // web/jest без нативного модуля — тихо
  }
}

export function useAnnounce(message: string | null | undefined): void {
  const last = useRef('');
  useEffect(() => {
    const text = (message ?? '').trim();
    if (text && text !== last.current) announce(text);
    last.current = text;
  }, [message]);
}
