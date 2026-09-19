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
  it('додає https:// без схеми', () => {
    expect(normalizeWorkspaceOrigin('api.flowi.casperdev.site')).toEqual({
      ok: true,
      origin: 'https://api.flowi.casperdev.site',
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
