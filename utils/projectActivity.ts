/**
 * utils/projectActivity.ts — форматування рядка стрічки активності проєкту
 * (WORKSPACE_PROJECTS_PLAN.md §4, контракт §4.6).
 *
 * Чиста функція, окремо від `app/project/[id]/activity.tsx`: підстановка в
 * i18n-шаблон (`tr.projectActivityXxx`, `{actor}`/`{title}`/`{from}`/`{to}`) —
 * логіка, яку варто перевірити без рендера й без AsyncStorage.
 */
import type { ActivityEntry } from '@/store/project-activity';
import type { Translations } from '@/store/translations';
import type { IconSymbolName } from '@/components/ui/icon-symbol';

type ActivityStrings = Pick<
  Translations,
  | 'projectActivityCreated' | 'projectActivityUpdated' | 'projectActivityDeleted'
  | 'projectActivityStatusChanged' | 'projectActivityAssigned' | 'projectActivityCommented'
  | 'projectActivityMemberJoined' | 'projectActivityMemberLeft' | 'projectActivityRoleChanged'
  | 'projectActivityUnknownActor'
>;

function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template,
  );
}

/** Значення поля для показу в шаблоні status_changed — сирі не-рядкові дані показуємо як є. */
function fieldValue(value: unknown): string {
  if (value == null) return '—';
  return String(value);
}

/** Рядок для одного запису стрічки — готовий для `<Text>`. */
export function formatActivityMessage(entry: ActivityEntry, tr: ActivityStrings): string {
  const actor = entry.actor?.name || tr.projectActivityUnknownActor;
  const title = entry.title || '—';

  switch (entry.verb) {
    case 'created':
      return fill(tr.projectActivityCreated, { actor, title });
    case 'deleted':
      return fill(tr.projectActivityDeleted, { actor, title });
    case 'status_changed': {
      const change = entry.changes.find(c => c.field === 'status' || c.field === 'kanbanColumnId');
      if (change) {
        return fill(tr.projectActivityStatusChanged, {
          actor, title, from: fieldValue(change.from), to: fieldValue(change.to),
        });
      }
      return fill(tr.projectActivityUpdated, { actor, title });
    }
    case 'assigned':
      return fill(tr.projectActivityAssigned, { actor, title });
    case 'commented':
      return fill(tr.projectActivityCommented, { actor, title });
    case 'member_joined':
      return fill(tr.projectActivityMemberJoined, { actor });
    case 'member_left':
      return fill(tr.projectActivityMemberLeft, { actor });
    case 'role_changed':
      return fill(tr.projectActivityRoleChanged, { actor, target: title });
    case 'updated':
    default:
      return fill(tr.projectActivityUpdated, { actor, title });
  }
}

/** Іконка для запису — суто косметика, окрема функція заради тестованості. */
export function activityIcon(entry: ActivityEntry): IconSymbolName {
  switch (entry.verb) {
    case 'created': return 'plus.circle.fill';
    case 'deleted': return 'trash';
    case 'status_changed': return 'arrow.triangle.2.circlepath';
    case 'assigned': return 'person.fill';
    case 'commented': return 'bubble.left.and.bubble.right.fill';
    case 'member_joined': return 'person.badge.plus';
    case 'member_left': return 'person.badge.minus';
    case 'role_changed': return 'shield.fill';
    case 'updated':
    default: return 'pencil';
  }
}
