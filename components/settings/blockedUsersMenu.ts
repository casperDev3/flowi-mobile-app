/**
 * components/settings/blockedUsersMenu.ts — «Заблоковані користувачі» у
 * Налаштуваннях → Акаунт: список заблокованих авторів коментарів
 * (utils/commentModeration.ts) із розблокуванням. Меню через
 * `showActionMenu`, бо пунктів може бути більше трьох (Android).
 */
import { Alert } from 'react-native';

import { unblockUser } from '@/store/comment-moderation';
import type { Translations } from '@/store/translations';
import { showActionMenu } from '@/utils/actionMenu';
import type { BlockedUser } from '@/utils/commentModeration';

type MenuStrings = Pick<
  Translations,
  | 'blockedUsersTitle' | 'blockedUsersEmpty' | 'blockedUsersPick' | 'blockedUsersUnblockConfirm'
  | 'blockedUsersUnblockMessage' | 'commentsUnblockAction' | 'cancel'
>;

export function blockedUserLabel(user: BlockedUser): string {
  return user.name || `#${user.userId}`;
}

export function openBlockedUsersMenu(list: readonly BlockedUser[], tr: MenuStrings): void {
  if (!list.length) {
    Alert.alert(tr.blockedUsersTitle, tr.blockedUsersEmpty);
    return;
  }
  showActionMenu(tr.blockedUsersTitle, tr.blockedUsersPick, [
    ...list.map(user => ({
      text: blockedUserLabel(user),
      onPress: () => {
        Alert.alert(
          tr.blockedUsersUnblockConfirm.replace('{name}', blockedUserLabel(user)),
          tr.blockedUsersUnblockMessage,
          [
            { text: tr.cancel, style: 'cancel' },
            {
              text: tr.commentsUnblockAction,
              onPress: () => {
                void unblockUser(user.userId).catch(e => {
                  if (__DEV__) console.warn('[settings] розблокування не вдалося:', e);
                });
              },
            },
          ],
        );
      },
    })),
    { text: tr.cancel, style: 'cancel' as const },
  ]);
}
