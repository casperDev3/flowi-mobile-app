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
function fieldValue(value: unknown, resolve?: (id: string) => string | undefined): string {
  if (value == null || value === '') return '—';
  const raw = String(value);
  return resolve?.(raw) ?? raw;
}

/**
 * Контекст для «людських» підписів (P1 аудиту 2026-10): без нього стрічка
 * показувала сирий `st-<uuid>` замість назви колонки й «Хтось» замість
 * автора, у якого не заповнене імʼя.
 */
export interface ActivityContext {
  /** id колонки статусу → назва (`mergeTaskStatusColumns(saved, projectId)`). */
  statusNames?: ReadonlyMap<string, string> | Record<string, string>;
  /** id користувача → імʼя з учасників проєкту. */
  memberNames?: ReadonlyMap<number, string> | Record<number, string>;
}

function lookup<K extends string | number>(
  source: ReadonlyMap<K, string> | Record<K, string> | undefined,
  key: K,
): string | undefined {
  if (!source) return undefined;
  if (source instanceof Map) return source.get(key) || undefined;
  return (source as Record<K, string>)[key] || undefined;
}

/** Імʼя автора: імʼя з запису → імʼя учасника → локальна частина пошти → «Хтось». */
export function activityActorName(entry: ActivityEntry, tr: Pick<ActivityStrings, 'projectActivityUnknownActor'>, ctx?: ActivityContext): string {
  const ref = entry.actor;
  if (!ref) return tr.projectActivityUnknownActor;
  const own = ref.name?.trim();
  if (own) return own;
  const member = lookup(ctx?.memberNames, ref.id)?.trim();
  if (member) return member;
  const local = ref.email?.split('@')[0]?.trim();
  return local || tr.projectActivityUnknownActor;
}

/**
 * Зливає поспіль однакові записи (той самий автор, дія, обʼєкт і зміни) в
 * один — інакше кілька автозбережень картки давали «оновив(ла)» тричі
 * підряд. Лишається найновіший (перший у списку, сервер віддає новіші
 * першими).
 */
export function mergeConsecutiveActivity(entries: readonly ActivityEntry[]): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  let prevKey: string | null = null;
  for (const entry of entries) {
    const key = [
      entry.actor?.id ?? '', entry.verb, entry.collection, entry.local_id, entry.title,
      entry.verb === 'updated' ? '' : JSON.stringify(entry.changes ?? []),
    ].join('|');
    if (key === prevKey) continue;
    prevKey = key;
    out.push(entry);
  }
  return out;
}

/** Рядок для одного запису стрічки — готовий для `<Text>`. */
export function formatActivityMessage(entry: ActivityEntry, tr: ActivityStrings, ctx?: ActivityContext): string {
  const actor = activityActorName(entry, tr, ctx);
  const title = entry.title || '—';
  const statusName = (id: string) => lookup(ctx?.statusNames, id);

  switch (entry.verb) {
    case 'created':
      return fill(tr.projectActivityCreated, { actor, title });
    case 'deleted':
      return fill(tr.projectActivityDeleted, { actor, title });
    case 'status_changed': {
      const change = entry.changes.find(c => c.field === 'status' || c.field === 'kanbanColumnId');
      if (change) {
        return fill(tr.projectActivityStatusChanged, {
          actor, title, from: fieldValue(change.from, statusName), to: fieldValue(change.to, statusName),
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
