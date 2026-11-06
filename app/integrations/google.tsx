/**
 * app/integrations/google.tsx — повернення з Google як посилання
 * `ftrackingapp://integrations/google?gcal=connected|cancelled|error&code=…`.
 *
 * Зазвичай цю адресу перехоплює сам WebBrowser.openAuthSessionAsync і
 * навігації немає. Якщо ж система відкрила її як звичайне посилання
 * (Android, холодний старт) — ведемо на календар: він на фокусі перечитує
 * статус підключення, а з `?gcal=` одразу відкриває аркуш Google Calendar.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

export default function GoogleCalendarReturn() {
  const router = useRouter();
  const { gcal, code } = useLocalSearchParams<{ gcal?: string; code?: string }>();
  useEffect(() => {
    const query = new URLSearchParams();
    if (gcal) query.set('gcal', gcal);
    if (code) query.set('code', code);
    const qs = query.toString();
    router.replace((qs ? `/calendar?${qs}` : '/calendar') as never);
  }, [router, gcal, code]);
  return null;
}
