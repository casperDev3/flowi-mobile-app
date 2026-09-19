/**
 * __tests__/project-sync-orchestration.test.ts — оркестрація `syncAllMyProjects()`
 * (store/project-sync.ts), WORKSPACE_PROJECTS_CONTRACT §3.2/§3.5/§9.4.
 *
 * Два сценарії тут фіксують major-знахідки ревʼю, які pure-хелпери
 * (__tests__/project-sync-state.test.ts) не покривають, бо ті лежать саме в
 * ПОСЛІДОВНОСТІ мережевих викликів усередині syncAllMyProjects:
 *  1. пристрій БЕЗ жодного локального/кешованого проєкту мусить дізнатись про
 *     проєкт, створений деінде, за ОДИН виклик (GET /projects/ безумовно,
 *     ids — ПІСЛЯ нього);
 *  2. проєкт, синканий раніше й відсутній у відповіді GET /projects/
 *     (видалений/доступ відкликано), мусить стиратись локально, а НЕ
 *     повторно створюватись через ensureProjectOnServer (що ловило б
 *     409 project_id_taken і тихо переганяло записи в особистий потік).
 * Контрольний третій сценарій — проєкт, який ще НІКОЛИ не синкався
 * (`lastSyncedAt` немає) і теж відсутній на сервері, — мусить і далі йти
 * звичайним шляхом «створити на сервері», щоб різниця не була випадковою.
 */

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }),
  saveData: jest.fn(async (key: string, data: unknown) => {
    mockStore.set(key, JSON.stringify(data));
  }),
  // Нікому з коду під тестом підписка на зміни не потрібна — заглушка,
  // аби модулі, що її імпортують (store/storage-lock.ts і т.д.), не впали.
  notifyStorageChanged: jest.fn(),
  subscribeToStorage: jest.fn(() => () => {}),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: () => true,
  subscribeOnlineMode: () => () => {},
}));

const mockApiFetch = jest.fn();
const mockActualApi = jest.requireActual('@/store/api');

jest.mock('@/store/api', () => ({
  ...jest.requireActual('@/store/api'),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { ApiError } = mockActualApi as {
  ApiError: new (status: number, code: string, message: string, details?: unknown) => Error;
};

import {
  ensureProjectOnServer,
  getProjectSyncState,
  getWorkspaceProjects,
  syncAllMyProjects,
  syncProject,
  type ProjectSummary,
} from '@/store/project-sync';

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

function summary(over: Partial<ProjectSummary> & { id: string }): ProjectSummary {
  return {
    name: over.id, color: '#7C3AED', template: 'work', role: 'owner', member_count: 1,
    cursor: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null,
    ...over,
  };
}

/** Викликів `POST /projects/` (створення) серед усіх зафіксованих запитів. */
function createCalls(): unknown[] {
  return mockApiFetch.mock.calls.filter(([path, opts]) => path === '/projects/' && (opts as { method?: string } | undefined)?.method === 'POST');
}

beforeEach(() => {
  mockStore.clear();
  mockApiFetch.mockReset();
  void ApiError; // прибрати "unused" — інстанс не потрібен жодному тесту нижче
});

describe('syncAllMyProjects — GET /projects/ безумовно (major з ревʼю)', () => {
  it('дізнається про проєкт, створений деінде, з нульовим локальним/кешованим станом за один виклик', async () => {
    // Нічого локально: ні 'projects', ні кешу workspace_projects, ні стану синку.
    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === '/projects/' && (!opts || !opts.method || opts.method === 'GET')) {
        return { results: [summary({ id: 'p-web', cursor: 3 })] };
      }
      if (path === '/projects/p-web/sync/' && opts?.method === 'POST') {
        return {
          contract_version: 2, protocol_version: 2, project_id: 'p-web', role: 'owner', cursor: 3,
          changes: [{
            collection: 'tasks', local_id: 't-web', deleted: false, client_updated_at: null,
            updated_at: 3, revision: 1, change_seq: 1,
            data: { id: 't-web', title: 'Зі всесвіту', projectId: 'p-web', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          }],
          acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
        };
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncAllMyProjects();

    // Кеш GET /projects/ підхопив новий проєкт...
    expect((await getWorkspaceProjects()).map(p => p.id)).toEqual(['p-web']);
    // ...і той самий цикл довантажив і застосував його потік — не чекаючи
    // наступного виклику syncAllMyProjects().
    expect(read<{ id: string; projectId?: string }[]>('tasks', [])).toEqual([
      expect.objectContaining({ id: 't-web', projectId: 'p-web' }),
    ]);
    const state = await getProjectSyncState();
    expect(state['p-web']?.lastSyncedAt).not.toBeNull();
    expect(createCalls()).toEqual([]); // проєкт уже на сервері — створювати нема чого
  });
});

describe('syncAllMyProjects — видалений/відкликаний проєкт (major з ревʼю)', () => {
  it('стирає раніше синканий проєкт, відсутній у GET /projects/, замість повторного створення', async () => {
    seed('projects', [{ id: 'p-old', name: 'Old', color: '#000', createdAt: new Date().toISOString() }]);
    seed('tasks', [{ id: 't-old', projectId: 'p-old', title: 'x' }]);
    seed('project_sync_state_v1', {
      'p-old': { cursor: 5, revisions: {}, role: 'owner', lastSyncedAt: Date.now() - 60_000 },
    });

    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/projects/' && (!opts || !opts.method || opts.method === 'GET')) {
        return { results: [] }; // сервер більше не бачить цей проєкт
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)}) — видалений проєкт не повинен ні створюватись, ні синкатись`);
    });

    await syncAllMyProjects();

    expect(read<{ id: string }[]>('projects', [])).toEqual([]);
    expect(read<{ id: string; projectId?: string }[]>('tasks', [])).toEqual([]);
    const state = await getProjectSyncState();
    expect(state['p-old']).toBeUndefined();
    expect(createCalls()).toEqual([]); // ensureProjectOnServer НЕ викликався для p-old
  });

  it('контроль: проєкт, який ще НІКОЛИ не синкався, і далі йде шляхом «створити на сервері»', async () => {
    seed('projects', [{ id: 'p-brand-new', name: 'Brand new', color: '#000', createdAt: new Date().toISOString() }]);
    // project_sync_state_v1 порожній — lastSyncedAt немає, тож це НЕ «зникло», а «ще не доїхало».

    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string; body?: { id?: string } }) => {
      if (path === '/projects/' && (!opts || !opts.method || opts.method === 'GET')) {
        return { results: [] };
      }
      if (path === '/projects/' && opts?.method === 'POST') {
        return summary({ id: opts.body?.id ?? 'p-brand-new', cursor: 0 });
      }
      if (path === '/projects/p-brand-new/sync/' && opts?.method === 'POST') {
        return {
          contract_version: 2, protocol_version: 2, project_id: 'p-brand-new', role: 'owner', cursor: 0,
          changes: [], acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
        };
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncAllMyProjects();

    expect(read<{ id: string }[]>('projects', [])).toEqual([
      expect.objectContaining({ id: 'p-brand-new' }),
    ]);
    expect(createCalls()).toHaveLength(1);
    const state = await getProjectSyncState();
    expect(state['p-brand-new']?.lastSyncedAt).not.toBeNull();
  });
});

describe('syncProject — переміщення запису Personal→Проєкт не губиться (major з ревʼю §3.5)', () => {
  it('застосовує upsert із projectId, навіть коли локальна копія ще без projectId', async () => {
    // Сценарій з ревʼю: пристрій A вже пушнув upsert@project:p1 + delete@personal
    // (переміщення t1 з Особистого в p1). Тут — пристрій B, де pull ПРОЄКТУ
    // приходить ПЕРШИМ: локальна копія t1 ще особиста (без projectId). Старий
    // guard трактував це як "чужий потік" і мовчки пропускав upsert назавжди
    // (курсор рухався далі, повтору не було) — запис губився, коли згодом
    // приходив особистий тумбстоун.
    seed('projects', [{ id: 'p1', name: 'P1', color: '#000', createdAt: new Date().toISOString() }]);
    seed('tasks', [{ id: 't1', title: 'старе', updatedAt: new Date().toISOString() }]);
    seed('project_sync_state_v1', {
      p1: { cursor: 0, revisions: {}, role: 'owner', lastSyncedAt: Date.now() - 60_000 },
    });

    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/projects/p1/sync/' && opts?.method === 'POST') {
        return {
          contract_version: 2, protocol_version: 2, project_id: 'p1', role: 'owner', cursor: 1,
          changes: [{
            collection: 'tasks', local_id: 't1', deleted: false, client_updated_at: null,
            updated_at: 1, revision: 1, change_seq: 1,
            data: { id: 't1', title: 'перенесено', projectId: 'p1', updatedAt: new Date().toISOString() },
          }],
          acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
        };
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncProject('p1');

    expect(read<{ id: string; projectId?: string; title?: string }[]>('tasks', [])).toEqual([
      expect.objectContaining({ id: 't1', projectId: 'p1', title: 'перенесено' }),
    ]);
  });
});

describe('syncProject — прямий виклик на непідтвердженому проєкті (blocker з ревʼю)', () => {
  it('не стирає проєкт на 404, а спершу створює його на сервері (installProjectSyncNotifier/WS-шлях, в обхід syncAllMyProjects)', async () => {
    // Сценарій блокера: `syncProject` викликано НАПРЯМУ (дебаунс-нотифаєр на
    // щойно створений проєкт, чи WS onclose 4404) до того, як
    // syncAllMyProjects/ensureProjectOnServer устигли зробити POST
    // /projects/. Кеш workspace_projects і project_sync_state — порожні
    // (ще ніколи не синкався).
    seed('projects', [{ id: 'p-new', name: 'New', color: '#000', createdAt: new Date().toISOString() }]);

    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string; body?: { id?: string } }) => {
      if (path === '/projects/' && opts?.method === 'POST') {
        return summary({ id: opts.body?.id ?? 'p-new', cursor: 0 });
      }
      if (path === '/projects/p-new/sync/' && opts?.method === 'POST') {
        return {
          contract_version: 2, protocol_version: 2, project_id: 'p-new', role: 'owner', cursor: 0,
          changes: [], acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
        };
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncProject('p-new');

    // Проєкт НЕ стерто — ensureProjectOnServer відпрацював явно перед обміном.
    expect(read<{ id: string }[]>('projects', [])).toEqual([expect.objectContaining({ id: 'p-new' })]);
    expect(createCalls()).toHaveLength(1);
    const state = await getProjectSyncState();
    expect(state['p-new']?.lastSyncedAt).not.toBeNull();
  });

  it('не стирає проєкт, якщо ensureProjectOnServer не зміг створити його (офлайн саме зараз) — просто пропускає цикл', async () => {
    seed('projects', [{ id: 'p-flaky', name: 'Flaky', color: '#000', createdAt: new Date().toISOString() }]);
    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/projects/' && opts?.method === 'POST') {
        throw new Error('network down');
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)}) — не мало дійти до /sync/`);
    });

    await syncProject('p-flaky');

    expect(read<{ id: string }[]>('projects', [])).toEqual([expect.objectContaining({ id: 'p-flaky' })]);
    const state = await getProjectSyncState();
    expect(state['p-flaky']).toBeUndefined();
  });

  it('стирає проєкт на 404, якщо він РАНІШЕ вже синкався успішно (справжня втрата доступу)', async () => {
    seed('projects', [{ id: 'p-revoked', name: 'Revoked', color: '#000', createdAt: new Date().toISOString() }]);
    seed('tasks', [{ id: 't-revoked', projectId: 'p-revoked', title: 'x' }]);
    seed('project_sync_state_v1', {
      'p-revoked': { cursor: 3, revisions: {}, role: 'owner', lastSyncedAt: Date.now() - 60_000 },
    });
    seed('workspace_projects', [summary({ id: 'p-revoked', cursor: 3 })]);

    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/projects/p-revoked/sync/' && opts?.method === 'POST') {
        throw new ApiError(404, 'project_not_found', 'gone');
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncProject('p-revoked');

    expect(read<{ id: string }[]>('projects', [])).toEqual([]);
    expect(read<{ id: string; projectId?: string }[]>('tasks', [])).toEqual([]);
    const state = await getProjectSyncState();
    expect(state['p-revoked']).toBeUndefined();
  });
});

describe('ensureProjectOnServer — 409 project_id_taken (регресія з ревʼю)', () => {
  it('позначає id конфліктним і не намагається створити знову', async () => {
    seed('projects', [{ id: 'p-clash', name: 'Clash', color: '#000', createdAt: new Date().toISOString() }]);
    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
      if (path === '/projects/' && opts?.method === 'POST') {
        throw new ApiError(409, 'project_id_taken', 'taken');
      }
      throw new Error(`unexpected apiFetch(${path})`);
    });

    const result = await ensureProjectOnServer('p-clash');
    expect(result).toBeNull();
    expect(read<string[]>('project_id_conflicts_v1', [])).toEqual(['p-clash']);
  });
});

describe('syncProject — редундантна мутація projects після ensureProjectOnServer (minor з ревʼю)', () => {
  it('не штовхає власний outbox-рядок projects/<id> у той самий /sync/, що йде одразу після POST /projects/', async () => {
    // POST /projects/ (§3.2) вже завів projects/{id} на сервері з ревізією 1
    // тими самими даними, що лежать локально. Якщо ще й outbox-рядок upsert
    // 'projects'/'p-fresh' піде в тому ж /sync/ — base_revision невідомий
    // (POST його не повертає), тож мутація йде з base_revision:null проти
    // рядка, що вже має ревізію 1 — зайвий конфлікт або no-op.
    const createdAt = new Date().toISOString();
    seed('projects', [{ id: 'p-fresh', name: 'Fresh', color: '#000', createdAt }]);
    seed('sync_outbox', [
      { mutation_id: 'm-projects-1', collection: 'projects', local_id: 'p-fresh', deleted: false, queued_at: 1, stream: 'project:p-fresh' },
    ]);

    let syncBody: { mutations?: { collection: string; local_id: string }[] } | undefined;
    mockApiFetch.mockImplementation(async (path: string, opts?: { method?: string; body?: unknown }) => {
      if (path === '/projects/' && opts?.method === 'POST') {
        return summary({ id: 'p-fresh', cursor: 0 });
      }
      if (path === '/projects/p-fresh/sync/' && opts?.method === 'POST') {
        syncBody = opts.body as typeof syncBody;
        return {
          contract_version: 2, protocol_version: 2, project_id: 'p-fresh', role: 'owner', cursor: 0,
          changes: [], acknowledged: [], conflicts: [], rejected: [], next_cursor: null,
        };
      }
      throw new Error(`unexpected apiFetch(${path}, ${JSON.stringify(opts)})`);
    });

    await syncProject('p-fresh');

    // Мутація 'projects'/'p-fresh' не пішла в тілі /sync/ — POST уже завів запис.
    expect(syncBody?.mutations ?? []).toEqual([]);
    // Рядок прибрано з outbox назавжди, а не лишено висіти на наступний цикл.
    expect(read<{ collection: string; local_id: string }[]>('sync_outbox', [])).toEqual([]);
  });
});
