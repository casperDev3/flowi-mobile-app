/**
 * hooks/use-incoming-invite-links.ts — слухач deep link `ftrackingapp://invite`
 * (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.3).
 *
 * Реєструється один раз на весь застосунок (`app/_layout.tsx`, поруч із
 * `PushInteractions`) — посилання може прийти, коли застосунок узагалі
 * закритий (холодний старт, `getInitialURL`) або відкритий на будь-якому
 * екрані (`addEventListener('url', …)`).
 *
 * Сам обробник лише зберігає розібране посилання (`pending_invite`, §9.1) і
 * веде на `/invite` — уся логіка «той самий workspace чи інший / є акаунт чи
 * нема» лежить у самому екрані (`app/invite.tsx`), бо вона залежить від
 * поточного `authStatus`, а тут його нема.
 */
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '@/store/auth';
import { useI18n } from '@/store/i18n';
import { parseInviteLink, setPendingInvite } from '@/store/invite-link';
import { registerInvitePushCategory, setupInvitePushActions, syncMyInvites } from '@/store/invite-inbox';
import { inviteFailureText } from '@/store/invite-messages';

function handleUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    const link = new URL(url);
    if (
      (link.protocol === "https:" && link.pathname === "/invite/menu") ||
      (link.protocol === "ftrackingapp:" && link.hostname === "menu-invite")
    ) {
      const ws = link.searchParams.get("ws"),
        t = link.searchParams.get("t");
      if (ws && t)
        router.push({ pathname: "/menu-invite", params: { ws, t } } as never);
      return;
    }
  } catch {
    return;
  }
  const parsed = parseInviteLink(url);
  if (!parsed) return;
  void setPendingInvite(parsed).then(() => {
    router.push({ pathname: '/invite', params: parsed } as never);
  });
}

export function useIncomingInviteLinks(): void {
  const { tr } = useI18n();
  const { status } = useAuth();

  // Decision 7: кнопки «Прийняти/Відхилити» прямо в push (категорія
  // `project_invite`). Назви кнопок — мовою застосунку; категорія
  // перереєструється, коли мову змінять.
  useEffect(() => {
    void registerInvitePushCategory({ accept: tr.inviteAccept, decline: tr.inviteDecline });
  }, [tr]);

  const trRef = useRef(tr);
  trRef.current = tr;
  useEffect(() => setupInvitePushActions(result => {
    if (result.ok) return;
    Alert.alert(trRef.current.error, inviteFailureText(result.failure, trRef.current));
  }), []);

  // Після входу/старту: сервер прив'язує запрошення, надіслані на цю пошту
  // ще до появи акаунта, і створює їм сповіщення (GET /invites/mine/).
  useEffect(() => {
    if (status === 'authed') void syncMyInvites();
  }, [status]);

  useEffect(() => {
    let mounted = true;
    Linking.getInitialURL()
      .then(url => { if (mounted) handleUrl(url); })
      .catch(e => { if (__DEV__) console.warn('[invite-link] getInitialURL не вдалось:', e); });

    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => { mounted = false; subscription.remove(); };
  }, []);
}
