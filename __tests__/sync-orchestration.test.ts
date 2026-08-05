/**
 * __tests__/sync-orchestration.test.ts — тести оркестрації sync-engine.
 *
 * На відміну від sync-engine.test.ts (чисті хелпери), тут покривається сам
 * цикл обміну: doSync, exchangeV2, applyPullResponse, buildMutation — тобто
 * всі шляхи, якими дані можуть загубитись.
 *
 * Частина тестів навмисно фіксує ПОТОЧНУ (дефектну) поведінку — вони позначені
 * посиланням на фазу з docs/plans/SYNC_ARCHITECTURE_PLAN.md, яка їх змінить.
 * Тести, позначені test.failing, описують ЦІЛЬОВУ поведінку і мають почати
 * проходити після відповідної фази.
 */

// ─── In-memory сховище ───────────────────────────────────────────────────────
const mockStore = new Map<string, string>();
const mockLoadCalls: string[] = [];

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => {
    mockLoadCalls.push(key);
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  }),
  saveData: jest.fn(async (key: string, data: unknown) => {
    mockStore.set(key, JSON.stringify(data));
  }),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode: () => true,
}));

const mockApiFetch = jest.fn();

// Береться РАЗ, поза фабрикою мока. Інакше jest.isolateModules (див. loadEngine)
// на кожне завантаження рушія створює свіжий реєстр, jest.requireActual віддає
// новий клас ApiError, і `error instanceof ApiError` усередині sync-engine стає
// false — тести проходили б із хибних причин.
const mockActualApi = jest.requireActual('@/store/api');

jest.mock('@/store/api', () => ({
  ApiError: mockActualApi.ApiError,
  OfflineError: mockActualApi.OfflineError,
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const { ApiError } = mockActualApi as {
  ApiError: new (status: number, code: string, message: string, details?: unknown) => Error;
};

// ─── Хелпери ─────────────────────────────────────────────────────────────────

type Engine = typeof import('@/store/sync-engine');

/** Свіжий екземпляр рушія: у нього модульний стан (_syncing, _isAuthed, таймери). */
function loadEngine(): Engine {
  let engine!: Engine;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules працює лише з require
    engine = require('@/store/sync-engine');
  });
  engine.setIsAuthed(true);
  return engine;
}

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

interface OutboxRow {
  mutation_id?: string;
  collection: string;
  local_id: string;
  deleted: boolean;
  force?: boolean;
  queued_at: number;
}

function outbox(): OutboxRow[] {
  return read<OutboxRow[]>('sync_outbox', []);
}

/** Відповідь протоколу v2 з розумними дефолтами. */
function v2(over: Partial<Record<string, unknown>> = {}) {
  return {
    protocol_version: 2,
    cursor: 1,
    changes: [],
    acknowledged: [],
    conflicts: [],
    next_cursor: null,
    ...over,
  };
}

function serverItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    collection: 'tasks',
    local_id: 't1',
    data: { id: 't1', title: 'з сервера' },
    deleted: false,
    client_updated_at: null,
    updated_at: 1,
    revision: 1,
    change_seq: 1,
    ...over,
  };
}

beforeEach(() => {
  // Фейкові таймери: doSync планує retry через setTimeout(30_000), який інакше
  // тримає jest живим після завершення тестів.
  jest.useFakeTimers();
  mockStore.clear();
  mockLoadCalls.length = 0;
  mockApiFetch.mockReset();
  // Курсор != 0, щоб doSync не запускав generateFullOutbox там, де це не мета тесту.
  seed('server_change_cursor_v2', 5);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

/** Остання записана помилка синку — null, якщо обмін завершився чисто. */
function lastError(): unknown {
  return read<unknown>('last_server_sync_error_v2', null);
}

// ─── Push / acknowledge ──────────────────────────────────────────────────────

describe('doSync — відправка та підтвердження', () => {
  test('надсилає мутацію з outbox і прибирає підтверджену', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({ acknowledged: [{ status: 'applied', mutation_id: 'm1', collection: 'tasks', local_id: 't1', revision: 3, change_seq: 7 }] }),
    );

    await loadEngine().syncNow();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe('/sync/user/v2/');
    expect(init.body.mutations).toHaveLength(1);
    expect(init.body.mutations[0]).toMatchObject({
      mutation_id: 'm1',
      collection: 'tasks',
      local_id: 't1',
      operation: 'upsert',
      data: { id: 't1', title: 'локальне' },
    });
    expect(outbox()).toHaveLength(0);
    expect(lastError()).toBeNull();
  });

  test('записує revision із підтвердження, щоб наступний base_revision був не null', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({ acknowledged: [{ status: 'applied', mutation_id: 'm1', collection: 'tasks', local_id: 't1', revision: 3, change_seq: 7 }] }),
    );

    await loadEngine().syncNow();

    expect(read('server_record_revisions_v2', {})).toEqual({ 'tasks:t1': 3 });
  });

  test('запис, якого вже немає локально, не надсилається і зникає з outbox', async () => {
    seed('tasks', []);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 'зниклий', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations).toHaveLength(0);
    expect(outbox()).toHaveLength(0);
  });

  test('видалення надсилається як operation:delete з порожнім data', async () => {
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: true, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations[0]).toMatchObject({
      operation: 'delete',
      data: {},
    });
  });
});

// ─── Pull / apply ────────────────────────────────────────────────────────────

describe('doSync — застосування серверних змін', () => {
  test('додає новий запис із сервера в локальну колекцію', async () => {
    seed('tasks', []);
    mockApiFetch.mockResolvedValue(v2({ changes: [serverItem()] }));

    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'з сервера' }]);
  });

  test('видаляє локальний запис, коли сервер позначив deleted', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }, { id: 't2', title: 'лишається' }]);
    mockApiFetch.mockResolvedValue(v2({ changes: [serverItem({ deleted: true })] }));

    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([{ id: 't2', title: 'лишається' }]);
  });

  test('НЕ перезаписує запис, який лежить в outbox (dirty-wins)', async () => {
    seed('tasks', [{ id: 't1', title: 'локальна правка' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    // Сервер віддає свою версію, але підтвердження не надсилає — рядок лишається dirty.
    mockApiFetch.mockResolvedValue(v2({ changes: [serverItem()] }));

    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'локальна правка' }]);
  });
});

// ─── Singleton ───────────────────────────────────────────────────────────────

describe('doSync — singleton-ключі', () => {
  test('справжній скаляр замінюється цілком — для нього це коректно', async () => {
    seed('finance_primary_currency', 'UAH');
    mockApiFetch.mockResolvedValue(
      v2({
        changes: [
          serverItem({
            collection: 'finance_primary_currency',
            local_id: 'finance_primary_currency',
            data: { value: 'USD' },
          }),
        ],
      }),
    );

    await loadEngine().syncNow();

    expect(read('finance_primary_currency', null)).toBe('USD');
  });

  test('singleton надсилається як {value}', async () => {
    seed('finance_primary_currency', 'UAH');
    seed('sync_outbox', [
      {
        mutation_id: 'm1',
        collection: 'finance_primary_currency',
        local_id: 'finance_primary_currency',
        deleted: false,
        queued_at: 1,
      },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations[0].data).toEqual({ value: 'UAH' });
  });
});

// ─── Нормалізовані фінансові колекції (фаза 7 плану) ────────────────────────

describe('нормалізовані фінансові ключі зливаються по-запису', () => {
  test('валюта з сервера доливається до локальної, а не витирає її', async () => {
    // Саме те, заради чого робилась фаза 7. Доти ці ключі їхали блобом: два
    // пристрої, кожен додав офлайн по валюті — вигравав один блоб повністю.
    seed('finance_currencies', [{ id: 'UAH', code: 'UAH' }]);
    mockApiFetch.mockResolvedValue(
      v2({
        changes: [
          serverItem({
            collection: 'finance_currencies',
            local_id: 'USD',
            data: { id: 'USD', code: 'USD' },
          }),
        ],
      }),
    );

    await loadEngine().syncNow();

    expect(read<{ code: string }[]>('finance_currencies', []).map(c => c.code).sort())
      .toEqual(['UAH', 'USD']);
  });

  test('ліміт бюджету надсилається окремою мутацією зі своїм local_id', async () => {
    seed('budget_limits', [
      { id: 'Їжа', category: 'Їжа', limit: 5000 },
      { id: 'Транспорт', category: 'Транспорт', limit: 1200 },
    ]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'budget_limits', local_id: 'Їжа', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    const sent = mockApiFetch.mock.calls[0][1].body.mutations;
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      collection: 'budget_limits',
      local_id: 'Їжа',
      data: { category: 'Їжа', limit: 5000 },
    });
  });
});

// ─── Пагінація ───────────────────────────────────────────────────────────────

describe('exchangeV2 — пагінація', () => {
  test('проходить сторінки, доки next_cursor не null, і мутації шле лише на першій', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch
      .mockResolvedValueOnce(v2({ cursor: 10, next_cursor: 10 }))
      .mockResolvedValueOnce(v2({ cursor: 20, next_cursor: 20 }))
      .mockResolvedValueOnce(v2({ cursor: 30, next_cursor: null }));

    await loadEngine().syncNow();

    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(mockApiFetch.mock.calls[0][1].body.mutations).toHaveLength(1);
    expect(mockApiFetch.mock.calls[1][1].body.mutations).toHaveLength(0);
    expect(mockApiFetch.mock.calls[2][1].body.mutations).toHaveLength(0);
    expect(read('server_change_cursor_v2', 0)).toBe(30);
  });

  test('курсор, що не просувається, не дає нескінченного циклу', async () => {
    mockApiFetch.mockResolvedValue(v2({ cursor: 5, next_cursor: 5 }));

    await loadEngine().syncNow();

    // Помилка проковтується в doSync і осідає в LAST_SYNC_ERROR_KEY.
    expect(mockApiFetch.mock.calls.length).toBeLessThan(5);
    expect(read<{ error?: unknown } | null>('last_server_sync_error_v2', null)).not.toBeNull();
  });

  test('несумісний protocol_version зупиняє застосування даних', async () => {
    seed('tasks', []);
    mockApiFetch.mockResolvedValue(v2({ protocol_version: 3, changes: [serverItem()] }));

    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([]);
  });
});

// ─── Конфлікти ───────────────────────────────────────────────────────────────

describe('doSync — конфлікти', () => {
  test('конфлікт із сервера потрапляє в sync_pending_conflicts', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({
        conflicts: [
          {
            status: 'conflict',
            mutation_id: 'm1',
            collection: 'tasks',
            local_id: 't1',
            server: serverItem({ revision: 9 }),
            client: { data: { id: 't1', title: 'локальне' }, deleted: false, base_revision: null },
          },
        ],
      }),
    );

    await loadEngine().syncNow();

    const conflicts = read<{ id: string; dataKey: string }[]>('sync_pending_conflicts', []);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ id: 'tasks:t1', dataKey: 'tasks' });
    // Мутація завершена (конфліктом), тож із outbox вона знята.
    expect(outbox()).toHaveLength(0);
  });

  test('локальна версія лишається видимою, доки конфлікт не вирішено', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({
        conflicts: [
          {
            status: 'conflict',
            mutation_id: 'm1',
            collection: 'tasks',
            local_id: 't1',
            server: serverItem({ data: { id: 't1', title: 'серверне' } }),
            client: { data: { id: 't1', title: 'локальне' }, deleted: false, base_revision: null },
          },
        ],
      }),
    );

    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'локальне' }]);
  });
});

// ─── Отруєний батч (дефект; фаза 8 плану) ───────────────────────────────────

describe('doSync — відхилення всього батчу', () => {
  test('один невалідний запис валить усі мутації батчу', async () => {
    seed('tasks', [
      { id: 'добрий', title: 'валідне' },
      { id: 'поганий', title: 'невалідне' },
    ]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 'добрий', deleted: false, queued_at: 1 },
      { mutation_id: 'm2', collection: 'tasks', local_id: 'поганий', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockRejectedValue(new ApiError(400, 'invalid', 'bad record', { invalid: ['поганий'] }));

    await loadEngine().syncNow();

    // Обидві мутації лишились: валідна стала заручником невалідної.
    expect(outbox()).toHaveLength(2);
    expect(read<{ error?: unknown } | null>('last_server_sync_error_v2', null)).not.toBeNull();
  });

  test('після 400 записи в outbox лишаються сліпими до серверних змін', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockRejectedValueOnce(new ApiError(400, 'invalid', 'bad record'));
    await loadEngine().syncNow();

    // Наступний синк: сервер має новішу версію, але рядок досі в outbox.
    mockApiFetch.mockResolvedValue(v2({ changes: [serverItem({ data: { id: 't1', title: 'серверне' } })] }));
    await loadEngine().syncNow();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'локальне' }]);
  });
});

// ─── Авто-LWW (фаза 9 плану) ────────────────────────────────────────────────

describe('resolveConflictSide', () => {
  const A = '2026-01-01T00:00:00.000Z';
  const B = '2026-06-01T00:00:00.000Z';

  test('пізніший штамп перемагає', () => {
    const { resolveConflictSide } = loadEngine();
    expect(resolveConflictSide(B, A)).toBe('local');
    expect(resolveConflictSide(A, B)).toBe('server');
  });

  test('нічия віддається серверу — це детерміновано для обох клієнтів', () => {
    const { resolveConflictSide } = loadEngine();
    expect(resolveConflictSide(A, A)).toBe('server');
  });

  test('delete проти edit — до користувача', () => {
    const { resolveConflictSide } = loadEngine();
    expect(resolveConflictSide(B, A, { localDeleted: true })).toBe('manual');
    expect(resolveConflictSide(B, A, { serverMissing: true })).toBe('manual');
  });

  test('коли штампа немає лише з одного боку — перемагає той, у кого він є', () => {
    const { resolveConflictSide } = loadEngine();
    expect(resolveConflictSide(A, undefined)).toBe('local');
    expect(resolveConflictSide(undefined, A)).toBe('server');
  });

  test('жодного штампа — порівнювати нічим, до користувача', () => {
    const { resolveConflictSide } = loadEngine();
    expect(resolveConflictSide(undefined, undefined)).toBe('manual');
    expect(resolveConflictSide('сміття', 'теж сміття')).toBe('manual');
  });
});

describe('doSync — авторозв\'язання конфліктів', () => {
  function conflictResponse(over: {
    localUpdatedAt?: string;
    serverUpdatedAt?: string | null;
    clientDeleted?: boolean;
    serverNull?: boolean;
  }) {
    return v2({
      conflicts: [{
        status: 'conflict',
        mutation_id: 'm1',
        collection: 'tasks',
        local_id: 't1',
        server: over.serverNull ? null : serverItem({
          data: { id: 't1', title: 'серверне' },
          client_updated_at: over.serverUpdatedAt ?? null,
          revision: 9,
        }),
        client: {
          data: { id: 't1', title: 'локальне', updatedAt: over.localUpdatedAt },
          deleted: over.clientDeleted ?? false,
          base_revision: null,
        },
      }],
    });
  }

  function seedConflictScenario() {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
  }

  test('локальна правка новіша — перештовхується з force, користувача не турбуємо', async () => {
    seedConflictScenario();
    mockApiFetch.mockResolvedValue(conflictResponse({
      localUpdatedAt: '2026-06-01T00:00:00.000Z',
      serverUpdatedAt: '2026-01-01T00:00:00.000Z',
    }));

    await loadEngine().syncNow();

    expect(read('sync_pending_conflicts', [])).toEqual([]);
    const queued = outbox();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ collection: 'tasks', local_id: 't1', force: true });
  });

  test('серверна версія новіша — застосовується локально', async () => {
    seedConflictScenario();
    mockApiFetch.mockResolvedValue(conflictResponse({
      localUpdatedAt: '2026-01-01T00:00:00.000Z',
      serverUpdatedAt: '2026-06-01T00:00:00.000Z',
    }));

    await loadEngine().syncNow();

    // Ключове: exchangeV2 тримає конфліктні рядки «брудними», тож серверні
    // дані НЕ застосовуються самі — доводиться класти їх явно.
    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'серверне' }]);
    expect(read('sync_pending_conflicts', [])).toEqual([]);
    expect(outbox()).toHaveLength(0);
  });

  test('delete проти edit лишається користувачу', async () => {
    seedConflictScenario();
    mockApiFetch.mockResolvedValue(conflictResponse({
      localUpdatedAt: '2026-06-01T00:00:00.000Z',
      serverUpdatedAt: '2026-01-01T00:00:00.000Z',
      clientDeleted: true,
    }));

    await loadEngine().syncNow();

    const pending = read<{ id: string }[]>('sync_pending_conflicts', []);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('tasks:t1');
  });

  test('запис зник на сервері — теж до користувача', async () => {
    seedConflictScenario();
    mockApiFetch.mockResolvedValue(conflictResponse({
      localUpdatedAt: '2026-06-01T00:00:00.000Z',
      serverNull: true,
    }));

    await loadEngine().syncNow();

    expect(read<unknown[]>('sync_pending_conflicts', [])).toHaveLength(1);
  });
});

// ─── Карантин відхилених (фаза 8 плану) ─────────────────────────────────────

describe('rejected[] — карантин замість заручництва', () => {
  function rejection(over: Partial<Record<string, unknown>> = {}) {
    return {
      status: 'rejected',
      mutation_id: 'm-bad',
      collection: 'tasks',
      local_id: 'поганий',
      reason: 'invalid_collection',
      detail: 'unknown collection',
      ...over,
    };
  }

  test('відхилений запис іде в карантин і зникає з outbox', async () => {
    seed('tasks', [{ id: 'поганий', title: 'не прийме' }]);
    seed('sync_outbox', [
      { mutation_id: 'm-bad', collection: 'tasks', local_id: 'поганий', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2({ rejected: [rejection()] }));

    await loadEngine().syncNow();

    expect(outbox()).toHaveLength(0);
    const quarantined = read<{ local_id: string; reason: string }[]>('sync_rejected_v2', []);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]).toMatchObject({ local_id: 'поганий', reason: 'invalid_collection' });
  });

  test('решта батчу застосовується попри відхилення', async () => {
    seed('tasks', [{ id: 'добрий' }, { id: 'поганий' }]);
    seed('sync_outbox', [
      { mutation_id: 'm-good', collection: 'tasks', local_id: 'добрий', deleted: false, queued_at: 1 },
      { mutation_id: 'm-bad', collection: 'tasks', local_id: 'поганий', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2({
      acknowledged: [{ status: 'applied', mutation_id: 'm-good', collection: 'tasks', local_id: 'добрий', revision: 1, change_seq: 1 }],
      rejected: [rejection()],
    }));

    await loadEngine().syncNow();

    expect(outbox()).toHaveLength(0);
    expect(lastError()).toBeNull();
  });

  test('карантин знімає сліпоту: серверні зміни для запису знову доходять', async () => {
    seed('tasks', [{ id: 'поганий', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm-bad', collection: 'tasks', local_id: 'поганий', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2({ rejected: [rejection()] }));
    await loadEngine().syncNow();

    mockApiFetch.mockResolvedValue(v2({
      changes: [serverItem({ local_id: 'поганий', data: { id: 'поганий', title: 'серверне' } })],
    }));
    await loadEngine().syncNow();

    // Доти запис висів би в outbox вічно, а dirty-wins глушив би серверні зміни.
    expect(read('tasks', [])).toEqual([{ id: 'поганий', title: 'серверне' }]);
  });

  test('повторне відхилення не плодить дублікатів у карантині', async () => {
    seed('sync_rejected_v2', [{ ...rejection(), quarantined_at: 111 }]);
    seed('sync_outbox', [
      { mutation_id: 'm-bad-2', collection: 'tasks', local_id: 'поганий', deleted: false, queued_at: 1 },
    ]);
    seed('tasks', [{ id: 'поганий' }]);
    mockApiFetch.mockResolvedValue(
      v2({ rejected: [rejection({ mutation_id: 'm-bad-2', reason: 'invalid_local_id' })] }),
    );

    await loadEngine().syncNow();

    const quarantined = read<{ reason: string; quarantined_at: number }[]>('sync_rejected_v2', []);
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0].reason).toBe('invalid_local_id');
    // Вік карантину рахується з ПЕРШОГО відхилення, а не оновлюється щоразу.
    expect(quarantined[0].quarantined_at).toBe(111);
  });

  test('відповідь старішого сервера без rejected не ламає обмін', async () => {
    seed('tasks', [{ id: 't1' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(read('sync_rejected_v2', [])).toEqual([]);
    expect(lastError()).toBeNull();
  });

  test('releaseFromQuarantine прибирає саме потрібний запис', async () => {
    seed('sync_rejected_v2', [
      rejection({ local_id: 'a' }),
      rejection({ local_id: 'b' }),
    ]);

    await loadEngine().releaseFromQuarantine('tasks', 'a');

    expect(read<{ local_id: string }[]>('sync_rejected_v2', []).map(r => r.local_id)).toEqual(['b']);
  });
});

// ─── pullAllFromServer (дефект; фаза 4 плану) ───────────────────────────────

describe('pullAllFromServer — сервер стає істиною', () => {
  test('перезаписує локальні зміни, що лежали в outbox', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({ changes: [serverItem({ data: { id: 't1', title: 'серверне' } })] }),
    );

    await loadEngine().pullAllFromServer();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'серверне' }]);
    expect(outbox()).toHaveLength(0);
  });

  test('прибирає локальні записи, яких сервер не надіслав', async () => {
    seed('tasks', [
      { id: 't1', title: 'є на сервері' },
      { id: 'лише-локальний', title: 'сервер про нього не знає' },
    ]);
    mockApiFetch.mockResolvedValue(v2({ changes: [serverItem()] }));

    await loadEngine().pullAllFromServer();

    expect(read('tasks', [])).toEqual([{ id: 't1', title: 'з сервера' }]);
  });

  test('скидає курсор і мапу ревізій перед витягуванням', async () => {
    seed('server_change_cursor_v2', 42);
    seed('server_record_revisions_v2', { 'tasks:застарілий': 7 });
    mockApiFetch.mockResolvedValue(v2({ cursor: 3 }));

    await loadEngine().pullAllFromServer();

    expect(mockApiFetch.mock.calls[0][1].body.cursor).toBe(0);
    expect(read('server_record_revisions_v2', {})).toEqual({});
    expect(read('server_change_cursor_v2', 0)).toBe(3);
  });

  test('не чіпає singleton, якого сервер не надіслав', async () => {
    seed('finance_primary_currency', 'UAH');
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().pullAllFromServer();

    expect(read('finance_primary_currency', null)).toBe('UAH');
  });
});

describe('pushAllToServer — локальний стан стає істиною', () => {
  test('надсилає всі мутації з force, щоб сервер не відхилив за OCC', async () => {
    seed('server_change_cursor_v2', 9);
    seed('tasks', [{ id: 't1' }, { id: 't2' }]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().pushAllToServer();

    const sent = mockApiFetch.mock.calls[0][1].body.mutations as { force?: boolean }[];
    expect(sent).toHaveLength(2);
    expect(sent.every(m => m.force === true)).toBe(true);
  });
});

// ─── client_updated_at (фаза 6 плану) ───────────────────────────────────────

describe('client_updated_at у мутаціях', () => {
  test('надсилається зі штампа запису', async () => {
    seed('tasks', [{ id: 't1', title: 'локальне', updatedAt: '2026-08-05T10:00:00.000Z' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations[0].client_updated_at)
      .toBe('2026-08-05T10:00:00.000Z');
  });

  test('для видалення штампа немає — null, а не сміття', async () => {
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: true, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations[0].client_updated_at).toBeNull();
  });

  test('запис без штампа не ламає мутацію', async () => {
    seed('tasks', [{ id: 't1', title: 'старий запис без updatedAt' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(mockApiFetch.mock.calls[0][1].body.mutations[0].client_updated_at).toBeNull();
  });
});

// ─── Діагностика (фаза 3 плану) ─────────────────────────────────────────────

describe('діагностика синку', () => {
  test('formatSyncError робить читабельний рядок із ApiError-опису', () => {
    const { formatSyncError } = loadEngine();
    expect(formatSyncError(null)).toBeNull();
    expect(
      formatSyncError({ at: 1, error: { status: 400, code: 'invalid', message: 'bad record' } }),
    ).toBe('HTTP 400 · invalid · bad record');
    // code 'unknown' — шум, не показуємо
    expect(
      formatSyncError({ at: 1, error: { status: 500, code: 'unknown', message: 'boom' } }),
    ).toBe('HTTP 500 · boom');
  });

  test('oldestQueuedAt бере найстаріший запис і терпить зіпсовані', () => {
    const { oldestQueuedAt } = loadEngine();
    expect(oldestQueuedAt([])).toBeNull();
    expect(
      oldestQueuedAt([
        { collection: 'tasks', local_id: 'a', deleted: false, queued_at: 500 },
        { collection: 'tasks', local_id: 'b', deleted: false, queued_at: 100 },
        { collection: 'tasks', local_id: 'c', deleted: false, queued_at: 900 },
      ]),
    ).toBe(100);
    expect(
      oldestQueuedAt([
        { collection: 'tasks', local_id: 'a', deleted: false } as never,
        { collection: 'tasks', local_id: 'b', deleted: false, queued_at: 300 },
      ]),
    ).toBe(300);
  });

  test('успішний синк очищає збережену помилку', async () => {
    seed('last_server_sync_error_v2', { at: 1, error: { status: 500 } });
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    expect(lastError()).toBeNull();
  });

  test('невдалий синк зберігає причину, придатну для показу', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError(400, 'invalid_collection', 'unknown collection', { invalid: ['x'] }),
    );

    await loadEngine().syncNow();

    const stored = read<{ at: number; error: any } | null>('last_server_sync_error_v2', null);
    expect(stored).not.toBeNull();
    expect(stored!.error).toMatchObject({
      status: 400,
      code: 'invalid_collection',
      message: 'unknown collection',
      invalid: ['x'],
    });
  });
});

// ─── Флеш на згортання (фаза 5 плану) ───────────────────────────────────────

describe('flushPendingSync', () => {
  test('стартує обмін негайно, не чекаючи дебаунсу', async () => {
    seed('tasks', [{ id: 't1', title: 'щойно додане' }]);
    seed('sync_outbox', [
      { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: 1 },
    ]);
    mockApiFetch.mockResolvedValue(
      v2({ acknowledged: [{ status: 'applied', mutation_id: 'm1', collection: 'tasks', local_id: 't1', revision: 1, change_seq: 1 }] }),
    );

    await loadEngine().flushPendingSync();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(outbox()).toHaveLength(0);
  });
});

// ─── Перший синк ─────────────────────────────────────────────────────────────

describe('doSync — перший синк (cursor = 0)', () => {
  test('генерує outbox з усіх локальних записів', async () => {
    seed('server_change_cursor_v2', 0);
    seed('tasks', [{ id: 't1' }, { id: 't2' }]);
    seed('notes', [{ id: 'n1' }]);
    mockApiFetch.mockResolvedValue(v2());

    await loadEngine().syncNow();

    const sent = mockApiFetch.mock.calls[0][1].body.mutations as { collection: string; local_id: string }[];
    expect(sent).toHaveLength(3);
    expect(sent.map(m => `${m.collection}:${m.local_id}`).sort()).toEqual([
      'notes:n1',
      'tasks:t1',
      'tasks:t2',
    ]);
  });

  test('читає кожну колекцію не більше двох разів за синк', async () => {
    // Регресія на фазу 2 плану: buildMutation бере записи з кешу, а не робить
    // loadData(collection) на кожен рядок outbox (це давало O(n²)).
    // Два читання — це generateFullOutbox + buildCollectionCache.
    seed('server_change_cursor_v2', 0);
    seed('tasks', Array.from({ length: 40 }, (_, i) => ({ id: `t${i}` })));
    mockApiFetch.mockResolvedValue(v2());

    mockLoadCalls.length = 0;
    await loadEngine().syncNow();

    expect(mockLoadCalls.filter(k => k === 'tasks').length).toBeLessThanOrEqual(2);
  });
});
