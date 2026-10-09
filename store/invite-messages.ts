/**
 * store/invite-messages.ts — людські тексти для помилок запрошень (decision 7).
 *
 * Сервер на `410 invite_expired` додає `reason` — кожна причина має свій
 * зрозумілий текст замість одного «Термін дії сплив» (посилання відкликали,
 * ліміт використань вичерпано, проєкт видалено…). Спільне для `/invite`,
 * `/invites`, центру сповіщень і кнопок push.
 */
import type { Translations } from './translations';
import type { InviteDeadReason, InviteFailure } from './project-team';

export function inviteDeadReasonText(reason: InviteDeadReason, tr: Translations): string {
  switch (reason) {
    case 'expired': return tr.inviteReasonExpired;
    case 'used_up': return tr.inviteReasonUsedUp;
    case 'revoked': return tr.inviteReasonRevoked;
    case 'cancelled': return tr.inviteReasonCancelled;
    case 'accepted': return tr.inviteReasonAccepted;
    case 'declined': return tr.inviteReasonDeclined;
    case 'project_deleted': return tr.inviteReasonProjectDeleted;
    default: return tr.inviteExpired;
  }
}

export function inviteFailureText(failure: InviteFailure, tr: Translations): string {
  switch (failure.kind) {
    case 'dead': return inviteDeadReasonText(failure.reason, tr);
    case 'invalid': return tr.inviteInvalid;
    case 'wrong_account': return tr.inviteWrongAccount;
    case 'offline': return tr.inviteNetworkError;
    default: return failure.message || tr.inviteNetworkError;
  }
}
