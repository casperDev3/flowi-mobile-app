/**
 * __tests__/project-activity-format.test.ts — рядок стрічки активності
 * (WORKSPACE_PROJECTS_CONTRACT.md §4.6).
 */
import { activityIcon, formatActivityMessage } from '../utils/projectActivity';
import type { ActivityEntry } from '../store/project-activity';

const tr = {
  projectActivityCreated: '{actor} created "{title}"',
  projectActivityUpdated: '{actor} updated "{title}"',
  projectActivityDeleted: '{actor} deleted "{title}"',
  projectActivityStatusChanged: '{actor} changed status of "{title}": {from} → {to}',
  projectActivityAssigned: '{actor} assigned "{title}"',
  projectActivityCommented: '{actor} commented on "{title}"',
  projectActivityMemberJoined: '{actor} joined the project',
  projectActivityMemberLeft: '{actor} left the project',
  projectActivityRoleChanged: '{actor} changed role {target}',
  projectActivityUnknownActor: 'Someone',
};

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: 1, actor: { id: 1, name: 'Ihor', email: 'i@x.com' }, verb: 'created',
    collection: 'tasks', local_id: 't-1', title: 'Buy milk', changes: [], created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatActivityMessage', () => {
  it('created', () => {
    expect(formatActivityMessage(entry({ verb: 'created' }), tr)).toBe('Ihor created "Buy milk"');
  });

  it('deleted', () => {
    expect(formatActivityMessage(entry({ verb: 'deleted' }), tr)).toBe('Ihor deleted "Buy milk"');
  });

  it('status_changed з полем status у changes', () => {
    const e = entry({ verb: 'status_changed', changes: [{ field: 'status', from: 'active', to: 'done' }] });
    expect(formatActivityMessage(e, tr)).toBe('Ihor changed status of "Buy milk": active → done');
  });

  it('status_changed без відповідного поля — падає на generic updated', () => {
    const e = entry({ verb: 'status_changed', changes: [] });
    expect(formatActivityMessage(e, tr)).toBe('Ihor updated "Buy milk"');
  });

  it('assigned / commented', () => {
    expect(formatActivityMessage(entry({ verb: 'assigned' }), tr)).toBe('Ihor assigned "Buy milk"');
    expect(formatActivityMessage(entry({ verb: 'commented' }), tr)).toBe('Ihor commented on "Buy milk"');
  });

  it('member_joined / member_left не використовують title', () => {
    expect(formatActivityMessage(entry({ verb: 'member_joined' }), tr)).toBe('Ihor joined the project');
    expect(formatActivityMessage(entry({ verb: 'member_left' }), tr)).toBe('Ihor left the project');
  });

  it('role_changed підставляє title як {target}', () => {
    expect(formatActivityMessage(entry({ verb: 'role_changed', title: 'Olena' }), tr)).toBe('Ihor changed role Olena');
  });

  it('actor=null — «Хтось» замість імені', () => {
    expect(formatActivityMessage(entry({ actor: null }), tr)).toBe('Someone created "Buy milk"');
  });

  it('невідомий verb — generic updated (захист від нового verb на бекенді)', () => {
    expect(formatActivityMessage(entry({ verb: 'unknown_future_verb' as ActivityEntry['verb'] }), tr))
      .toBe('Ihor updated "Buy milk"');
  });
});

describe('activityIcon', () => {
  it('віддає різні іконки для різних verb', () => {
    const verbs: ActivityEntry['verb'][] = [
      'created', 'deleted', 'status_changed', 'assigned', 'commented',
      'member_joined', 'member_left', 'role_changed', 'updated',
    ];
    const icons = verbs.map(verb => activityIcon(entry({ verb })));
    expect(new Set(icons).size).toBe(icons.length);
  });
});
