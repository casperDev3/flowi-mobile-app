/**
 * __tests__/data-ownership.test.ts
 *
 * `reconcileDataOwnership` (контракт §9.2) — рішення «чиї це дані», яке
 * `store/auth.tsx` приймає одразу після входу/реєстрації, ДО першого синку.
 * Мокаємо сховище й мережу in-memory, щоб перевірити всі три гілки: нічиї
 * порожні дані, нічиї непорожні дані проти порожнього акаунта (тихе
 * вивантаження) і нічиї непорожні дані проти акаунта з даними (питання
 * користувачу — тут лише прапорець `ask_merge`, сам Alert живе в auth.tsx).
 */

const mockStore = new Map<string, unknown>();

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => (mockStore.has(key) ? mockStore.get(key) : fallback)),
  saveData: jest.fn(async (key: string, value: unknown) => { mockStore.set(key, value); }),
  // Справжня семантика AsyncStorage.removeItem — ключ зникає ЦІЛКОМ, а не
  // стає `null` (major з ревʼю: `saveData(key, null)` лишав би singleton
  // «локальними даними» для `hasAnyLocalData`/`generateFullOutbox`, які
  // перевіряють саме `!== undefined`).
  removeData: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

let mockRemoteChanges: unknown[] = [];
/** `true` — мережа кидає помилку замість відповіді (обидві спроби). */
let mockNetworkDown = false;
/**
 * Сторінки `/sync/user/v2/` за `cursor` — коли задано, `apiFetch` ігнорує
 * `mockRemoteChanges` і пагінується через `next_cursor` (тест пагінації,
 * мінор із ревʼю). Ключ — вхідний `cursor` запиту.
 */
let mockRemotePages: Record<number, { changes: unknown[]; next_cursor: number | null }> | null = null;
jest.mock('@/store/api', () => ({
  apiFetch: jest.fn(async (_path: string, opts: { body: { cursor: number } }) => {
    if (mockNetworkDown) throw new Error('network down');
    if (mockRemotePages) return mockRemotePages[opts.body.cursor] ?? { changes: [], next_cursor: null };
    return { changes: mockRemoteChanges, next_cursor: null };
  }),
}));

import {
  getDataOwner,
  hasAnyLocalData,
  reconcileDataOwnership,
  setDataOwner,
  uploadLocalDataToAccount,
  wipeLocalSyncedData,
} from '@/store/data-ownership';
import { generateFullOutbox } from '@/store/sync-engine';
import { setOutboxStreamResolver } from '@/store/synced-storage';

beforeEach(() => {
  mockStore.clear();
  mockRemoteChanges = [];
  mockRemotePages = null;
  mockNetworkDown = false;
  setOutboxStreamResolver(null);
});

describe('hasAnyLocalData', () => {
  it('false, коли всі масиви порожні/відсутні', async () => {
    expect(await hasAnyLocalData()).toBe(false);
  });

  it('true, якщо хоч одна синхронізована колекція непорожня', async () => {
    mockStore.set('tasks', [{ id: 't1', title: 'Купити хліб' }]);
    expect(await hasAnyLocalData()).toBe(true);
  });

  it('true, якщо задано лише singleton (профіль здоров\'я), без жодного масиву', async () => {
    // Раніше перевірялись лише SYNC_ARRAY_KEYS: користувач, що встиг
    // налаштувати тільки профіль здоров'я, проходив як «локальних даних
    // нема», хоча singleton так само йде на сервер (§9.2).
    mockStore.set('health_profile', { sex: 'm', age: 30 });
    expect(await hasAnyLocalData()).toBe(true);
  });
});

describe('reconcileDataOwnership', () => {
  it('немає локальних даних — одразу власник, без питань', async () => {
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('clean');
    expect(await getDataOwner()).toEqual({ workspaceId: 'ws-1', userId: '42' });
  });

  it('уже узгоджено раніше (owner збігається) — clean без повторної перевірки сервера', async () => {
    await setDataOwner({ workspaceId: 'ws-1', userId: '42' });
    mockStore.set('tasks', [{ id: 't1' }]);
    mockRemoteChanges = [{ id: 'server-1' }]; // якби пішли на сервер, віддали б ask_merge
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('clean');
  });

  it('нічиї локальні дані, акаунт порожній — тихо стають власними (звичайний push)', async () => {
    mockStore.set('tasks', [{ id: 't1' }]);
    mockRemoteChanges = [];
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('clean');
    expect(await getDataOwner()).toEqual({ workspaceId: 'ws-1', userId: '42' });
  });

  it('нічиї локальні дані, акаунт порожній — ставить у чергу геть усе локальне (не лише outbox-рядки)', async () => {
    // Легасі-запис: у сховищі є, але в outbox його ще ніхто не клав — саме
    // цей пропуск і був знахідкою (§9.2): без generateFullOutbox він ніколи
    // не поїхав би на сервер.
    mockStore.set('tasks', [{ id: 't1', title: 'Легасі-завдання' }]);
    mockRemoteChanges = [];
    await reconcileDataOwnership('42', 'ws-1');
    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string }[];
    expect(outbox).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection: 'tasks', local_id: 't1' }),
    ]));
  });

  it('нічиї локальні дані, в акаунті вже є дані — просить рішення користувача', async () => {
    mockStore.set('tasks', [{ id: 't1' }]);
    mockRemoteChanges = [{ id: 'server-1' }];
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('ask_merge');
    // Власника ще не проставлено — рішення приймає виклик з auth.tsx (Alert).
    expect(await getDataOwner()).toBeNull();
  });

  it('мережа не відповіла (обидві спроби) — retry_later, власника НЕ виставляє', async () => {
    // Раніше мережева помилка тут трактувалась як «акаунт порожній» і мовчки
    // вивантажувала локальні дані в акаунт, що міг бути насправді непорожнім
    // (діалог «злити з акаунтом» після цього більше ніколи не з'явився б).
    mockStore.set('tasks', [{ id: 't1' }]);
    mockNetworkDown = true;
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('retry_later');
    expect(await getDataOwner()).toBeNull();
    expect(mockStore.get('sync_outbox') ?? []).toEqual([]);
  }, 10_000);

  it('дані належали іншому акаунту/workspace — стираються перед новим узгодженням', async () => {
    await setDataOwner({ workspaceId: 'ws-old', userId: '1' });
    mockStore.set('tasks', [{ id: 'old-task' }]);
    mockRemoteChanges = [];
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('clean');
    expect(mockStore.get('tasks')).toEqual([]);
    expect(await getDataOwner()).toEqual({ workspaceId: 'ws-1', userId: '42' });
  });

  it('власник-мисматч зі singleton-ом — після стирання реконсиляція не бачить нема-чого-мерджити знову (major з ревʼю)', async () => {
    // Раніше `wipeLocalSyncedData` лишала singleton `null` замість
    // відсутнього ключа: `hasAnyLocalData` бачила `null !== undefined` і
    // reconcile після власника-мисматчу знову йшов у гілку «є локальні дані»
    // — навіть коли стирати вже нічого.
    await setDataOwner({ workspaceId: 'ws-old', userId: '1' });
    mockStore.set('health_profile', { sex: 'm', age: 30 });
    mockRemoteChanges = [{ id: 'server-1' }]; // акаунт непорожній — якби local лишились, дав би ask_merge
    const outcome = await reconcileDataOwnership('42', 'ws-1');
    expect(outcome).toBe('clean');
    expect(await hasAnyLocalData()).toBe(false);
  });
});

describe('wipeLocalSyncedData', () => {
  it('очищує масиви й outbox, стирає singleton-и ЦІЛКОМ (не null), не займаючи ключі пристрою', async () => {
    mockStore.set('tasks', [{ id: 't1' }]);
    mockStore.set('health_profile', { sex: 'm' });
    mockStore.set('sync_outbox', [{ mutation_id: 'x' }]);
    mockStore.set('theme_option_v1', 'dark');

    await wipeLocalSyncedData();

    expect(mockStore.get('tasks')).toEqual([]);
    // Ключ ВІДСУТНІЙ, а не `null` (major з ревʼю) — інакше `hasAnyLocalData`/
    // `generateFullOutbox` (обидва читають `loadData(key, undefined)`)
    // вважали б щойно стертий singleton «локальними даними».
    expect(mockStore.has('health_profile')).toBe(false);
    expect(await hasAnyLocalData()).toBe(false);
    expect(mockStore.get('sync_outbox')).toEqual([]);
    expect(mockStore.get('theme_option_v1')).toBe('dark');
  });

  it('скидає курсор і мапу ревізій персонального синку (§9.2/§9.3)', async () => {
    mockStore.set('server_change_cursor_v2', 5000);
    mockStore.set('server_record_revisions_v2', { 'tasks:t1': 7 });

    await wipeLocalSyncedData();

    expect(mockStore.get('server_change_cursor_v2')).toBe(0);
    expect(mockStore.get('server_record_revisions_v2')).toEqual({});
  });

  it('очищує ключі простору проєкту (§9.3, major з ревʼю) — вони не в SYNC_ARRAY/SINGLETON_KEYS', async () => {
    // Без цього логін іншим акаунтом на тому самому пристрої бачив би курсор
    // синку проєкту попереднього власника й ніколи більше не тягнув потік
    // (projectsNeedingSync порівнює cursor із незмінним локальним значенням),
    // а пікер виконавця/автодоповнення коментарів — чужі імена й email.
    mockStore.set('comments', [{ id: 'cm-1' }]);
    mockStore.set('project_budgets', [{ id: 'p-1', amount: 100 }]);
    mockStore.set('workspace_projects', [{ id: 'p-1', role: 'owner' }]);
    mockStore.set('project_sync_state_v1', { 'p-1': { cursor: 42 } });
    mockStore.set('project_members_v1', { 'p-1': [{ user: { id: 1, name: 'X', email: 'x@y.z' } }] });
    mockStore.set('recent_projects', ['p-1']);
    mockStore.set('projects_migrated_v1', { workspaceId: 'w1', userId: 'u1', at: 123 });
    mockStore.set('pending_project_deletes', ['p-2']);

    await wipeLocalSyncedData();

    expect(mockStore.get('comments')).toEqual([]);
    expect(mockStore.get('project_budgets')).toEqual([]);
    expect(mockStore.get('workspace_projects')).toEqual([]);
    expect(mockStore.get('project_sync_state_v1')).toEqual({});
    expect(mockStore.get('project_members_v1')).toEqual({});
    expect(mockStore.get('recent_projects')).toEqual([]);
    expect(mockStore.get('projects_migrated_v1')).toBeNull();
    expect(mockStore.get('pending_project_deletes')).toEqual([]);
  });
});

describe('uploadLocalDataToAccount (контракт §9.2 — «Злити з акаунтом»)', () => {
  it('запис лише локально — іде в outbox без force', async () => {
    mockStore.set('tasks', [{ id: 'local-only', title: 'Нове', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    mockRemoteChanges = [];

    await uploadLocalDataToAccount();

    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string; force?: boolean }[];
    const row = outbox.find(i => i.local_id === 'local-only');
    expect(row).toBeTruthy();
    expect(row!.force).toBeFalsy();
  });

  it('той самий id, локальний новіший — force:true (перемагає на сервері)', async () => {
    mockStore.set('tasks', [{ id: 't1', title: 'Локальна версія', updatedAt: '2026-02-01T00:00:00.000Z' }]);
    mockRemoteChanges = [
      { collection: 'tasks', local_id: 't1', data: { title: 'Серверна версія' }, deleted: false, updated_at: Date.parse('2026-01-01T00:00:00.000Z') },
    ];

    await uploadLocalDataToAccount();

    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string; force?: boolean }[];
    const row = outbox.find(i => i.local_id === 't1');
    expect(row).toBeTruthy();
    expect(row!.force).toBe(true);
  });

  it('той самий id, серверний новіший — локальне НЕ форситься (pull перетре сам)', async () => {
    mockStore.set('tasks', [{ id: 't1', title: 'Стара локальна', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    mockRemoteChanges = [
      { collection: 'tasks', local_id: 't1', data: { title: 'Новіша серверна' }, deleted: false, updated_at: Date.parse('2026-02-01T00:00:00.000Z') },
    ];

    await uploadLocalDataToAccount();

    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string }[] | undefined;
    expect((outbox ?? []).some(i => i.local_id === 't1')).toBe(false);
  });

  it('той самий id, серверний новіший — переписує ЛОКАЛЬНЕ сховище серверною версією', async () => {
    // Раніше «skip» був лише фільтром outbox: локальний рядок лишався
    // застарілим у сховищі, і будь-який ПОВТОРНИЙ generateFullOutbox() (саме
    // те, що доSync() з курсором 0 робить після completeSession() ->
    // triggerFullSync()) заводив його в outbox ще раз, зводячи skip нанівець.
    mockStore.set('tasks', [{ id: 't1', title: 'Стара локальна', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    const serverData = { id: 't1', title: 'Новіша серверна', updatedAt: '2026-02-01T00:00:00.000Z' };
    mockRemoteChanges = [
      { collection: 'tasks', local_id: 't1', data: serverData, deleted: false, updated_at: Date.parse('2026-02-01T00:00:00.000Z') },
    ];

    await uploadLocalDataToAccount();

    expect(mockStore.get('tasks')).toEqual([serverData]);
  });

  it('повторний generateFullOutbox (як після completeSession -> triggerFullSync) більше не воскрешає skip-запис', async () => {
    mockStore.set('tasks', [{ id: 't1', title: 'Стара локальна', updatedAt: '2026-01-01T00:00:00.000Z' }]);
    const serverData = { id: 't1', title: 'Новіша серверна', updatedAt: '2026-02-01T00:00:00.000Z' };
    mockRemoteChanges = [
      { collection: 'tasks', local_id: 't1', data: serverData, deleted: false, updated_at: Date.parse('2026-02-01T00:00:00.000Z') },
    ];

    await uploadLocalDataToAccount();
    // completeSession() після цього безумовно кличе triggerFullSync(), а
    // doSync() з курсором 0 генерує full outbox ЩЕ РАЗ.
    await generateFullOutbox();

    // Рядок може знов опинитися в outbox (generateFullOutbox не пам'ятає
    // рішення skip) — але дані в ньому вже ІДЕНТИЧНІ серверним, тож навіть
    // такий push більше не перетирає щойно отриману серверну правку.
    expect(mockStore.get('tasks')).toEqual([serverData]);
  });

  it('форсований запис із projectId іде в ТОЙ САМИЙ потік, що й generateFullOutbox (мінор із ревʼю)', async () => {
    // Без резолвера stream forced-запис завжди йшов би на особистий
    // ендпоінт, навіть коли той самий id уже маршрутизується в проєктний
    // потік — exchangeV2 нічого не знає про проєкти.
    setOutboxStreamResolver(async (collection, localId) =>
      (collection === 'tasks' && localId === 't1') ? 'project:p-1' : 'personal');
    mockStore.set('tasks', [{ id: 't1', title: 'Локальна версія', projectId: 'p-1', updatedAt: '2026-02-01T00:00:00.000Z' }]);
    mockRemoteChanges = [
      { collection: 'tasks', local_id: 't1', data: { title: 'Серверна версія' }, deleted: false, updated_at: Date.parse('2026-01-01T00:00:00.000Z') },
    ];

    await uploadLocalDataToAccount();

    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string; force?: boolean; stream?: string }[];
    const row = outbox.find(i => i.local_id === 't1');
    expect(row?.force).toBe(true);
    expect(row?.stream).toBe('project:p-1');
  });

  it('singleton (без updatedAt), що є і локально, і в акаунті — переписується серверним, БЕЗ non-forced мутації в outbox (мінор із ревʼю)', async () => {
    // До фікса: generateFullOutbox() ставив non-forced мутацію з
    // base_revision:null для існуючого на сервері singleton — OCC-конфлікт
    // одразу після натиснутого «Об'єднати».
    mockStore.set('health_profile', { sex: 'm', age: 30 });
    mockRemoteChanges = [
      { collection: 'health_profile', local_id: 'health_profile', data: { sex: 'f', age: 25 }, deleted: false, updated_at: Date.now() },
    ];

    await uploadLocalDataToAccount();

    expect(mockStore.get('health_profile')).toEqual({ sex: 'f', age: 25 });
    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string }[];
    expect(outbox.some(i => i.collection === 'health_profile')).toBe(false);
  });

  it('пагінує /sync/user/v2/ через next_cursor — запис із ДРУГОЇ сторінки теж дає force, а не OCC-конфлікт (мінор із ревʼю)', async () => {
    // Одна сторінка бачила б лише 'other-collection' і вважала б 'tasks:t1'
    // «локальним, якого на сервері нема» — non-forced мутація впала б в OCC,
    // бо запис 't1' насправді ВЖЕ є на сервері, просто на 2-й сторінці.
    mockRemotePages = {
      0: { changes: [{ collection: 'notes', local_id: 'n1', data: {}, deleted: false, updated_at: 1 }], next_cursor: 100 },
      100: { changes: [{ collection: 'tasks', local_id: 't1', data: { title: 'Серверна' }, deleted: false, updated_at: Date.parse('2026-01-01T00:00:00.000Z') }], next_cursor: null },
    };
    mockStore.set('tasks', [{ id: 't1', title: 'Локальна новіша', updatedAt: '2026-02-01T00:00:00.000Z' }]);

    await uploadLocalDataToAccount();

    const outbox = mockStore.get('sync_outbox') as { collection: string; local_id: string; force?: boolean }[];
    const row = outbox.find(i => i.local_id === 't1');
    expect(row?.force).toBe(true);
  });
});
