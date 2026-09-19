/**
 * __tests__/project-stream.test.ts — маршрутизація outbox між особистим і
 * проєктними потоками синку (WORKSPACE_PROJECTS_CONTRACT §3.5).
 */
import {
  computeMyProjectIds,
  emptyProjectSyncState,
  isProjectStream,
  MAX_PROJECT_SOCKETS,
  PERSONAL_STREAM,
  projectsNeedingSync,
  projectStreamId,
  pushRecentProject,
  removeFromRecentProjects,
  resolveOutboxStream,
  socketProjectIds,
  streamProjectId,
} from '../utils/projectStream';

describe('projectStreamId / isProjectStream / streamProjectId', () => {
  it('round-trips a project id through the stream string', () => {
    expect(projectStreamId('p-1')).toBe('project:p-1');
    expect(isProjectStream('project:p-1')).toBe(true);
    expect(isProjectStream(PERSONAL_STREAM)).toBe(false);
    expect(isProjectStream(undefined)).toBe(false);
    expect(streamProjectId('project:p-1')).toBe('p-1');
    expect(streamProjectId(PERSONAL_STREAM)).toBeNull();
    expect(streamProjectId(undefined)).toBeNull();
  });
});

describe('computeMyProjectIds', () => {
  it('unions the server cache and the locally-known projects', () => {
    const ids = computeMyProjectIds(['p-1', 'p-2'], ['p-2', 'p-3']);
    expect([...ids].sort()).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('is empty when nothing is known', () => {
    expect(computeMyProjectIds([], []).size).toBe(0);
  });
});

describe('resolveOutboxStream', () => {
  const myIds = new Set(['p-1']);

  it('routes a task with a known projectId to its project stream', () => {
    expect(resolveOutboxStream('tasks', 't-1', { projectId: 'p-1' }, myIds)).toBe('project:p-1');
  });

  it('keeps a task without projectId personal', () => {
    expect(resolveOutboxStream('tasks', 't-1', {}, myIds)).toBe(PERSONAL_STREAM);
    expect(resolveOutboxStream('tasks', 't-1', undefined, myIds)).toBe(PERSONAL_STREAM);
  });

  it('keeps a task pointing at a project I am not a member of personal', () => {
    // Не мій проєкт (ще не мігровано / більше не учасник) — запис лишається
    // особистим, а не губиться в невідомому потоці.
    expect(resolveOutboxStream('tasks', 't-1', { projectId: 'p-9' }, myIds)).toBe(PERSONAL_STREAM);
  });

  it('routes the projects collection by local_id, not by data.projectId', () => {
    expect(resolveOutboxStream('projects', 'p-1', {}, myIds)).toBe('project:p-1');
    expect(resolveOutboxStream('projects', 'p-9', {}, myIds)).toBe(PERSONAL_STREAM);
  });

  it('project_budgets is always project-only, keyed by local_id', () => {
    expect(resolveOutboxStream('project_budgets', 'p-1', {}, myIds)).toBe('project:p-1');
  });

  it('collections outside the project contract stay personal', () => {
    expect(resolveOutboxStream('containers', 'c-1', { projectId: 'p-1' }, myIds)).toBe(PERSONAL_STREAM);
  });

  it('moving a task between projects re-routes it (delete old stream + upsert new)', () => {
    const twoProjects = new Set(['p-1', 'p-2']);
    // Видалення зі старого потоку рахується за СТАРИМ record (§3.5) — виклик
    // із попереднім знімком даних.
    expect(resolveOutboxStream('tasks', 't-1', { projectId: 'p-1' }, twoProjects)).toBe('project:p-1');
    expect(resolveOutboxStream('tasks', 't-1', { projectId: 'p-2' }, twoProjects)).toBe('project:p-2');
  });

  it('minor з ревʼю: a project with a known id conflict stays personal even through the data.id fallback', () => {
    // `p-clash` уже виключений із `myProjectIds` (409 project_id_taken).
    // Без `excludedProjectIds` фолбек `data.id === localId` (звичайний
    // upsert-запис) усе одно бачив би `data.id === localId` і повертав би
    // 'project:p-clash' — саме цей мінор і був у ревʼю, запис висів би в
    // outbox потоку, який сервер відхиляє, назавжди.
    expect(resolveOutboxStream('projects', 'p-clash', { id: 'p-clash' }, myIds)).toBe('project:p-clash');
    // З переданою множиною конфліктних id — фолбек їх поважає й лишає особистим.
    const conflicted = new Set(['p-clash']);
    expect(resolveOutboxStream('projects', 'p-clash', { id: 'p-clash' }, myIds, conflicted)).toBe(PERSONAL_STREAM);
  });
});

describe('pushRecentProject / removeFromRecentProjects', () => {
  it('puts the most recent project first and dedupes', () => {
    expect(pushRecentProject(['p-2', 'p-3'], 'p-1')).toEqual(['p-1', 'p-2', 'p-3']);
    expect(pushRecentProject(['p-1', 'p-2'], 'p-1')).toEqual(['p-1', 'p-2']);
  });

  it('caps the list at max (default 5)', () => {
    const list = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'];
    expect(pushRecentProject(list, 'p-6')).toEqual(['p-6', 'p-1', 'p-2', 'p-3', 'p-4']);
  });

  it('removes a project from the recent list', () => {
    expect(removeFromRecentProjects(['p-1', 'p-2'], 'p-1')).toEqual(['p-2']);
  });
});

describe('projectsNeedingSync', () => {
  it('flags projects whose server cursor moved past the local one', () => {
    const state = { 'p-1': emptyProjectSyncState() };
    state['p-1'].cursor = 10;
    const due = projectsNeedingSync(
      [{ id: 'p-1', cursor: 20 }, { id: 'p-2', cursor: 0 }],
      state,
      new Set(),
    );
    expect(due).toEqual(['p-1']);
  });

  it('flags a project with dirty outbox rows even if the cursor did not move', () => {
    const state = { 'p-1': emptyProjectSyncState() };
    state['p-1'].cursor = 10;
    const due = projectsNeedingSync(
      [{ id: 'p-1', cursor: 10 }],
      state,
      new Set(['project:p-1']),
    );
    expect(due).toEqual(['p-1']);
  });

  it('skips an up-to-date, clean project', () => {
    const state = { 'p-1': emptyProjectSyncState() };
    state['p-1'].cursor = 10;
    expect(projectsNeedingSync([{ id: 'p-1', cursor: 10 }], state, new Set())).toEqual([]);
  });
});

describe('socketProjectIds', () => {
  it('prioritises recent projects, then fills up to max with the rest', () => {
    const ids = socketProjectIds(['p-2', 'p-1'], ['p-1', 'p-2', 'p-3', 'p-4'], 3);
    expect(ids).toEqual(['p-2', 'p-1', 'p-3']);
  });

  it('never exceeds the contract cap of 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => `p-${i}`);
    expect(socketProjectIds([], many).length).toBe(MAX_PROJECT_SOCKETS);
  });
});
