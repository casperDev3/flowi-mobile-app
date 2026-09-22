/**
 * __tests__/workspace.test.ts
 *
 * Чисті функції нормалізації адреси й перевірки сумісності — контракт
 * `WORKSPACE_PROJECTS_CONTRACT.md` §2.2. Мережевий виклик (`checkWorkspace`)
 * тут не перевіряється: він лише склеює ці функції з `fetch`.
 */

// Ці тести перевіряють переважно чисті функції (нормалізація, семвер,
// сумісність), але `store/workspace.ts` тягне `store/storage.ts` заради
// персистентності workspace_config — мокаємо його in-memory мапою (замість
// нативного AsyncStorage), щоб `refreshWorkspaceCompatibility()` теж можна
// було перевірити зі справжнім збереженим конфігом.
const mockStore = new Map<string, unknown>();
jest.mock('@/store/storage', () => ({
  loadData: jest.fn(async (key: string, fallback: unknown) => (mockStore.has(key) ? mockStore.get(key) : fallback)),
  saveData: jest.fn(async (key: string, value: unknown) => { mockStore.set(key, value); }),
}));

import {
  buildWorkspaceConfig,
  checkWorkspace,
  checkWorkspaceCompatibility,
  clearWorkspaceConfig,
  compareSemver,
  normalizeWorkspaceOrigin,
  refreshWorkspaceCompatibility,
  getWorkspaceIncompatibility,
  setWorkspaceConfig,
  type WorkspaceInfo,
} from '@/store/workspace';
import {
  isFirstCompatCheckPending,
  setFirstCompatCheckPending,
  setWorkspaceIncompatibility,
} from '@/store/api-config';

function makeInfo(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    workspace_protocol: 1,
    workspace_id: 'ws-1',
    name: 'Flowi Cloud',
    color: '#7C3AED',
    logo_url: null,
    registration_mode: 'open',
    has_users: true,
    sync_contract_version: 2,
    min_client_version: { mobile: '1.0.0', web: '0.1.0' },
    ws_url: 'wss://api.flowi.casperdev.site/ws',
    ...overrides,
  };
}

describe('normalizeWorkspaceOrigin', () => {
  it('додає https:// без схеми і зізнається, що схему домислив', () => {
    expect(normalizeWorkspaceOrigin('api.flowi.casperdev.site')).toEqual({
      ok: true,
      origin: 'https://api.flowi.casperdev.site',
      schemeAssumed: true,
    });
  });

  it('схему, написану руками, не позначає домисленою', () => {
    expect(normalizeWorkspaceOrigin('https://api.flowi.casperdev.site')).toEqual({
      ok: true,
      origin: 'https://api.flowi.casperdev.site',
    });
  });

  // З пристрою: адресі без схеми домислювався https БУДЬ-ЧОМУ, тож локальний
  // сервер (`127.0.0.1:8000`, `192.168.x`) ставав недосяжним — `https://` там
  // просто не відповідає, — а екран казав лише «Не вдалося з'єднатися з
  // workspace», не натякаючи ні на схему, ні на причину.
  it.each([
    ['127.0.0.1:8000', 'http://127.0.0.1:8000'],
    ['localhost:8000', 'http://localhost:8000'],
    ['192.168.0.106:8000', 'http://192.168.0.106:8000'],
    ['10.0.0.7:8000', 'http://10.0.0.7:8000'],
    ['mac-mini.local', 'http://mac-mini.local'],
  ])('локальній адресі без схеми домислює http: %s', (input, origin) => {
    expect(normalizeWorkspaceOrigin(input)).toEqual({ ok: true, origin, schemeAssumed: true });
  });

  it('домислений http не суперечить власній перевірці безпеки', () => {
    // Те саме LOCAL_HOST_RE, що дозволяє http нижче, вирішує й схему вище —
    // тож побудоване тут не може впасти в insecure_url двома рядками далі.
    const r = normalizeWorkspaceOrigin('192.168.1.50:8000');
    expect(r.ok).toBe(true);
  });

  it('явний https на локальному хості лишається https', () => {
    // Префіл екрана ховає `https://`; якби ховання було сліпим, збережений
    // https-self-host на .local перетворився б на http при першій же
    // повторній перевірці. Тут — половина інваріанта, друга в app/workspace.tsx.
    expect(normalizeWorkspaceOrigin('https://mac-mini.local')).toEqual({
      ok: true,
      origin: 'https://mac-mini.local',
    });
  });

  it('публічному хосту без схеми далі домислюється https', () => {
    expect(normalizeWorkspaceOrigin('example.com')).toEqual({
      ok: true,
      origin: 'https://example.com',
      schemeAssumed: true,
    });
  });

  it('прибирає кінцевий слеш і /api', () => {
    expect(normalizeWorkspaceOrigin('https://api.flowi.casperdev.site/api/')).toEqual({
      ok: true,
      origin: 'https://api.flowi.casperdev.site',
    });
  });

  it('порожній рядок — invalid_url', () => {
    expect(normalizeWorkspaceOrigin('   ')).toEqual({ ok: false, code: 'invalid_url' });
  });

  it('http:// на публічному хості — insecure_url', () => {
    expect(normalizeWorkspaceOrigin('http://example.com')).toEqual({ ok: false, code: 'insecure_url' });
  });

  it('http:// дозволено для localhost/локальної мережі', () => {
    expect(normalizeWorkspaceOrigin('http://localhost:8000')).toEqual({
      ok: true,
      origin: 'http://localhost:8000',
    });
    expect(normalizeWorkspaceOrigin('http://192.168.0.106:8000')).toEqual({
      ok: true,
      origin: 'http://192.168.0.106:8000',
    });
  });

  it('невалідний URL — invalid_url', () => {
    expect(normalizeWorkspaceOrigin('not a valid url')).toEqual({ ok: false, code: 'invalid_url' });
  });
});

describe('compareSemver', () => {
  it('менша версія дає відʼємне число', () => {
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
  });
  it('рівні версії дають 0', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });
  it('більша версія дає додатне число', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('checkWorkspaceCompatibility', () => {
  it('однакові протоколи і сумісна версія клієнта — ok', () => {
    expect(checkWorkspaceCompatibility(makeInfo())).toEqual({ ok: true });
  });

  it('серверний workspace_protocol більший — оновити застосунок', () => {
    expect(checkWorkspaceCompatibility(makeInfo({ workspace_protocol: 2 }))).toEqual({
      ok: false,
      code: 'update_app',
    });
  });

  it('серверний workspace_protocol менший — оновити сервер', () => {
    expect(checkWorkspaceCompatibility(makeInfo({ workspace_protocol: 0 }))).toEqual({
      ok: false,
      code: 'update_server',
    });
  });

  it('sync_contract_version більший на сервері — оновити застосунок', () => {
    expect(checkWorkspaceCompatibility(makeInfo({ sync_contract_version: 3 }))).toEqual({
      ok: false,
      code: 'update_app',
    });
  });

  it('sync_contract_version менший на сервері — оновити сервер', () => {
    expect(checkWorkspaceCompatibility(makeInfo({ sync_contract_version: 1 }))).toEqual({
      ok: false,
      code: 'update_server',
    });
  });

  it('клієнт старіший за min_client_version.mobile — update_app_to', () => {
    const result = checkWorkspaceCompatibility(
      makeInfo({ min_client_version: { mobile: '99.0.0', web: '0.1.0' } }),
    );
    expect(result).toEqual({ ok: false, code: 'update_app_to', minVersion: '99.0.0' });
  });
});

describe('refreshWorkspaceCompatibility — контракт §2.3 «дані одного сервера ніколи не потрапляють на інший»', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockStore.clear();
    setWorkspaceIncompatibility(null); // _incompatibility — модульний стан, спільний між тестами
    setFirstCompatCheckPending(true); // теж модульний стан — імітуємо стан «до першого виклику»
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('той самий workspace_id — мовчки оновлює кеш назви/кольору, як і раніше', async () => {
    await setWorkspaceConfig(buildWorkspaceConfig('https://api.example.com', makeInfo({ name: 'Стара назва' })));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => makeInfo({ name: 'Нова назва' }),
    });

    await refreshWorkspaceCompatibility();

    expect(getWorkspaceIncompatibility()).toBeNull();
    expect(mockStore.get('workspace_config')).toMatchObject({ name: 'Нова назва' });
  });

  it('той самий origin, але ІНШИЙ workspace_id — блокує, а НЕ переписує конфіг мовчки', async () => {
    // Сервер на тому самому origin перевстановили/замінили: старі токени й
    // локальні дані належать акаунту на вже неіснуючому workspace_id. Раніше
    // це мовчки переписувало workspace_config новим workspace_id, лишаючи
    // старі токени й дані тихо прив'язаними до чужого сервера.
    const staleConfig = buildWorkspaceConfig('https://api.example.com', makeInfo({ workspace_id: 'ws-old' }));
    await setWorkspaceConfig(staleConfig);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => makeInfo({ workspace_id: 'ws-new' }),
    });

    await refreshWorkspaceCompatibility();

    expect(getWorkspaceIncompatibility()).toEqual({ code: 'workspace_changed' });
    // Конфіг НЕ переписаний нововиявленим workspace_id — лишається старим,
    // доки користувач явно не пройде через /workspace (switchWorkspace()).
    expect(mockStore.get('workspace_config')).toMatchObject({ workspaceId: 'ws-old' });
  });

  it('мережева помилка — не блокує (тимчасове, а не несумісність)', async () => {
    await setWorkspaceConfig(buildWorkspaceConfig('https://api.example.com', makeInfo()));
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    await refreshWorkspaceCompatibility();

    expect(getWorkspaceIncompatibility()).toBeNull();
  });

  // Регрес на major з ревʼю: на свіжому інсталі/апгрейді з 1.0.x
  // `workspace_config` ще нема, і `AuthGate` (app/_layout.tsx) раніше викликав
  // цю функцію лише `if (config)` — прапорець лишався `true` увесь перший
  // сеанс, і `SyncGate` тримав `isAuthed=false` навіть ПІСЛЯ входу (ні
  // ws/user/, ні синк проєктів). Функція мусить сама скидати прапорець, коли
  // перевіряти нема чого, незалежно від того, як її викликає AuthGate.
  it('нема workspace_config — все одно скидає isFirstCompatCheckPending', async () => {
    await clearWorkspaceConfig();
    expect(isFirstCompatCheckPending()).toBe(true);

    await refreshWorkspaceCompatibility();

    expect(isFirstCompatCheckPending()).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled(); // нема конфіга — нема й запиту
  });

  it('є workspace_config, мережева помилка — все одно скидає isFirstCompatCheckPending (finally)', async () => {
    await setWorkspaceConfig(buildWorkspaceConfig('https://api.example.com', makeInfo()));
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    expect(isFirstCompatCheckPending()).toBe(true);

    await refreshWorkspaceCompatibility();

    expect(isFirstCompatCheckPending()).toBe(false);
  });

  it('успішна перевірка — скидає isFirstCompatCheckPending', async () => {
    await setWorkspaceConfig(buildWorkspaceConfig('https://api.example.com', makeInfo()));
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => makeInfo() });
    expect(isFirstCompatCheckPending()).toBe(true);

    await refreshWorkspaceCompatibility();

    expect(isFirstCompatCheckPending()).toBe(false);
  });
});


// ── ERR-04 + підказка про схему ──────────────────────────────────────────────

describe('checkWorkspace — чому саме не вийшло', () => {
  const originalFetch = global.fetch;
  beforeEach(() => { global.fetch = jest.fn() as unknown as typeof fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  // ERR-04: 502/503 під час деплою, 500 від Django і 429 від throttle читались
  // як «Це не Flowi workspace або сервер застарів — оновіть сервер». Людина з
  // ПРАВИЛЬНОЮ адресою бралася її правити або смикати адміна.
  it.each([500, 502, 503, 429])('не-2xx %s — server_unavailable, а не not_workspace', async (status) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status, json: async () => ({}) });
    await expect(checkWorkspace('https://api.example.com')).resolves.toEqual({
      ok: false,
      code: 'server_unavailable',
    });
  });

  it('404 лишається not_workspace — тут справді нема Flowi', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    await expect(checkWorkspace('https://api.example.com')).resolves.toEqual({
      ok: false,
      code: 'not_workspace',
    });
  });

  it('відповідь без workspace_protocol — not_workspace', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200, json: async () => ({ hello: 'world' }) });
    await expect(checkWorkspace('https://api.example.com')).resolves.toEqual({
      ok: false,
      code: 'not_workspace',
    });
  });

  it('мережевий збій на домисленій схемі несе прапорець для підказки', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkWorkspace('api.example.com')).resolves.toEqual({
      ok: false,
      code: 'network',
      schemeAssumed: true,
    });
  });

  it('мережевий збій на явній схемі підказки не несе', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
    await expect(checkWorkspace('https://api.example.com')).resolves.toEqual({
      ok: false,
      code: 'network',
    });
  });

  it('локальну адресу без схеми стукає по http, а не по https', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true, status: 200,
      json: async () => makeInfo({ workspace_id: 'ws-local' }),
    });
    const r = await checkWorkspace('127.0.0.1:8000');
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/workspace/');
    expect(r.ok).toBe(true);
  });
});
