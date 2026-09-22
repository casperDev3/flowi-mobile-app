/**
 * __tests__/auth.test.ts
 *
 * Перевіряє контракт §2 плану/§9.3: «офлайн» — лише тимчасова відсутність
 * мережі, а не наслідок виходу. logout() НЕ повинен перемикати app_mode в
 * офлайн (раніше перемикав — саме це й не давало новому логіну іншого
 * акаунта побачити діалог злиття даних, бо `resolveDataOwnership` ішла через
 * офлайн-гейт `apiFetch`).
 */

import React, { act } from 'react';

import { AuthProvider, UnsyncedOutboxError, useAuth } from '@/store/auth';
import { buildWorkspaceConfig, setWorkspaceConfig } from '@/store/workspace';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer: any = require('react-test-renderer');

// ─── Моки ────────────────────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn(async () => null),
  setItemAsync:    jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem:      jest.fn(async () => null),
  setItem:      jest.fn(async () => {}),
  removeItem:   jest.fn(async () => {}),
  multiGet:     jest.fn(async () => []),
  multiSet:     jest.fn(async () => {}),
  multiRemove:  jest.fn(async () => {}),
}));

jest.mock('@/store/app-mode', () => ({
  isOnlineMode:        jest.fn(() => false),
  setOnlineImperative: jest.fn(),
  useAppMode: () => ({ ready: true, online: false, setOnline: jest.fn() }),
}));

// Отримуємо посилання після того, як jest.mock() зареєстровано.
const { setOnlineImperative: mockSetOnlineImperative } =
  jest.requireMock('@/store/app-mode') as { setOnlineImperative: jest.Mock };
const { isOnlineMode: mockIsOnlineMode } =
  jest.requireMock('@/store/app-mode') as { isOnlineMode: jest.Mock };
const mockAsyncStorage = jest.requireMock('@react-native-async-storage/async-storage') as {
  getItem: jest.Mock;
  setItem: jest.Mock;
  multiRemove: jest.Mock;
};

jest.mock('@/store/api', () => ({
  apiFetch:           jest.fn(async () => {}),
  clearTokens:        jest.fn(async () => {}),
  onSessionExpired:   jest.fn(() => () => {}),
  REFRESH_SECURE_KEY: 'flowi_refresh',
  OfflineError:       class OfflineError extends Error {},
  ApiError:           class ApiError extends Error {},
  setTokens:          jest.fn(async () => {}),
}));

jest.mock('@/store/sync-engine', () => ({
  setIsAuthed:            jest.fn(),
  triggerFullSync:        jest.fn(async () => {}),
  syncNow:                jest.fn(async () => {}),
  generateFullOutbox:     jest.fn(async () => {}),
  resetPersonalSyncState: jest.fn(async () => {}),
  hasSyncedBefore:        jest.fn(async () => false),
  // `closeSyncSessionBeforeWipe` (major з ревʼю) чекає на них перед
  // витиранням локальних даних — тут нема реального обміну, тож завжди
  // "вже вільно".
  waitForSyncIdle:        jest.fn(async () => {}),
}));

// `store/project-sync.ts` тягне WS/websocket-код і власні залежності — тут
// цікавить лише сам факт виклику `syncAllMyProjects()` з logout/switchWorkspace.
jest.mock('@/store/project-sync', () => ({
  syncAllMyProjects: jest.fn(async () => {}),
  waitForAllProjectSyncsIdle: jest.fn(async () => {}),
}));

const { syncAllMyProjects: mockSyncAllMyProjects } =
  jest.requireMock('@/store/project-sync') as { syncAllMyProjects: jest.Mock };

jest.mock('@/store/push', () => ({
  getRegistrationPushToken: jest.fn(async () => null),
  registerPushToken:        jest.fn(async () => {}),
  unregisterPushToken:      jest.fn(async () => {}),
}));

const { apiFetch: mockApiFetch } = jest.requireMock('@/store/api') as { apiFetch: jest.Mock };
const { hasSyncedBefore: mockHasSyncedBefore } =
  jest.requireMock('@/store/sync-engine') as { hasSyncedBefore: jest.Mock };
const mockSecureStore = jest.requireMock('expo-secure-store') as { getItemAsync: jest.Mock };

// ─── Probe ────────────────────────────────────────────────────────────────────

let authApi!: ReturnType<typeof useAuth>;

function Probe() {
  authApi = useAuth();
  return null;
}

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('auth — logout НЕ перемикає в офлайн', () => {
  beforeEach(() => {
    mockSetOnlineImperative.mockClear();
  });

  it('logout не викликає setOnlineImperative', async () => {
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });

    await act(async () => {
      await authApi.logout();
    });

    expect(mockSetOnlineImperative).not.toHaveBeenCalled();
  });

  it('logout() прибирає й ключі простору проєкту (§9.3, major з ревʼю) — не лише SYNC_ARRAY/SINGLETON_KEYS', async () => {
    // Раніше WORKSPACE_SWITCH_STORAGE_KEYS не мав цих ключів: наступний
    // логін (той самий чи інший акаунт) бачив би курсор/учасників/коментарі
    // попереднього власника локальних даних цього пристрою.
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });

    await act(async () => {
      await authApi.logout();
    });

    const removedKeys = mockAsyncStorage.multiRemove.mock.calls.at(-1)?.[0] as string[];
    for (const key of [
      'comments', 'project_budgets', 'workspace_projects',
      'project_sync_state_v1', 'project_members_v1', 'recent_projects',
      'projects_migrated_v1', 'pending_project_deletes',
    ]) {
      expect(removedKeys).toContain(key);
    }
  });
});

// ─── §2.3/§9.3: непровштовхнуте не стирається мовчки ────────────────────────
//
// Раніше перевірка «чи лишився непровштовхнутий outbox» висіла на тому
// самому isOnlineMode(), що й спроба досинхронізувати — офлайн-легасі-
// користувач (app_mode='offline' з-до-релізу) узагалі не потрапляв у цю
// гілку, і §9.3-прибирання стирало все мовчки. Тепер перевірка робиться
// незалежно від мережі.
describe('вихід/зміна workspace — непровштовхнуте не стирається мовчки', () => {
  beforeEach(() => {
    mockIsOnlineMode.mockReturnValue(false); // легасі app_mode='offline'
    mockAsyncStorage.getItem.mockImplementation(async () => null);
  });

  afterEach(() => {
    mockAsyncStorage.getItem.mockReset();
    mockAsyncStorage.getItem.mockImplementation(async () => null);
  });

  async function renderAuth(): Promise<void> {
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });
  }

  it('logout(): офлайн + непорожній outbox — кидає UnsyncedOutboxError замість мовчки стерти', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'sync_outbox') {
        return JSON.stringify([{ mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: Date.now() }]);
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await expect(authApi.logout()).rejects.toBeInstanceOf(UnsyncedOutboxError);
    });
  });

  it('logout(force=true): те саме, але користувач підтвердив — не кидає', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'sync_outbox') {
        return JSON.stringify([{ mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: Date.now() }]);
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await expect(authApi.logout(true)).resolves.toBeUndefined();
    });
  });

  it('switchWorkspace(): офлайн + непорожній outbox — кидає UnsyncedOutboxError замість мовчки стерти', async () => {
    // Саме сценарій із ревʼю: /welcome -> «Змінити» -> switchWorkspace(),
    // ще ДО входу цієї сесії, з app_mode, що лишився 'offline' з-до-релізу.
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'sync_outbox') {
        return JSON.stringify([{ mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: Date.now() }]);
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await expect(authApi.switchWorkspace()).rejects.toBeInstanceOf(UnsyncedOutboxError);
    });
  });

  it('switchWorkspace(): нічийні (data_owner=null) непорожні локальні дані — теж кидає, навіть з порожнім outbox', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'tasks') return JSON.stringify([{ id: 't1', title: 'Легасі-офлайн завдання' }]);
      if (key === 'data_owner') return null;
      return null;
    });
    await renderAuth();

    await act(async () => {
      await expect(authApi.switchWorkspace()).rejects.toBeInstanceOf(UnsyncedOutboxError);
    });
  });

  it('switchWorkspace(): дані вже мають власника — непорожній масив НЕ блокує', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'tasks') return JSON.stringify([{ id: 't1', title: 'Синхронізоване завдання' }]);
      if (key === 'data_owner') return JSON.stringify({ workspaceId: 'ws-1', userId: '42' });
      return null;
    });
    await renderAuth();

    await act(async () => {
      await expect(authApi.switchWorkspace()).resolves.toBeUndefined();
    });
  });
});

// ─── §2.3 крок 1: непорожній ПРОЄКТНИЙ outbox теж отримує спробу синку ──────
//
// Раніше logout()/switchWorkspace() кликали лише syncNow() (штовхає ЛИШЕ
// isPersonalOutboxItem-рядки), тоді як hasUnprotectedLocalChanges() рахує
// ВЕСЬ outbox, включно з проєктним, — будь-яка непровштовхнута правка в
// проєкті завжди кидала UnsyncedOutboxError без жодної спроби її відправити,
// і «Продовжити» в діалозі стирало те, що могло піти на сервер (major з
// ревʼю).
describe('вихід/зміна workspace — проєктний outbox теж синкається перед перевіркою', () => {
  beforeEach(() => {
    mockIsOnlineMode.mockReturnValue(true);
    mockSyncAllMyProjects.mockClear();
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'sync_outbox') {
        return JSON.stringify([
          { mutation_id: 'm1', collection: 'tasks', local_id: 't1', deleted: false, queued_at: Date.now(), stream: 'project:p1' },
        ]);
      }
      if (key === 'data_owner') return JSON.stringify({ workspaceId: 'ws-1', userId: '42' });
      return null;
    });
  });

  afterEach(() => {
    mockIsOnlineMode.mockReturnValue(false);
    mockAsyncStorage.getItem.mockReset();
    mockAsyncStorage.getItem.mockImplementation(async () => null);
  });

  async function renderAuth(): Promise<void> {
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });
  }

  it('logout() онлайн з непорожнім outbox — кличе і syncNow (персональний), і syncAllMyProjects (проєктний)', async () => {
    // Мокований syncAllMyProjects нічого не прибирає з outbox, тож
    // hasUnprotectedLocalChanges() усе одно кине (реальний виклик прибрав би
    // синхронізований рядок) — тут цікавить лише сам факт спроби синку.
    await renderAuth();
    await act(async () => {
      await authApi.logout().catch(() => {});
    });
    expect(mockSyncAllMyProjects).toHaveBeenCalled();
  });

  it('switchWorkspace() онлайн з непорожнім outbox — теж кличе syncAllMyProjects', async () => {
    await renderAuth();
    await act(async () => {
      await authApi.switchWorkspace().catch(() => {});
    });
    expect(mockSyncAllMyProjects).toHaveBeenCalled();
  });
});

// ─── §9.3 «лише при зміні workspace додатково: pending_invite (якщо ws ≠ новому)» ───
//
// Раніше switchWorkspace() узагалі не займав `pending_invite` — застарілий
// інвайт ІНШОГО workspace лишався у сховищі назавжди (PendingInviteAutoJoin
// лише порівнює origin і мовчки виходить на мисматчі, нічого не прибираючи).
describe('switchWorkspace() — прибирання pending_invite іншого workspace (мінор із ревʼю)', () => {
  beforeEach(() => {
    mockAsyncStorage.setItem.mockClear();
  });

  afterEach(() => {
    mockAsyncStorage.getItem.mockReset();
    mockAsyncStorage.getItem.mockImplementation(async () => null);
  });

  async function renderAuth(): Promise<void> {
    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });
  }

  it('newOrigin переданий, pending_invite ІНШОГО workspace — стирається', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'data_owner') return JSON.stringify({ workspaceId: 'ws-1', userId: '42' });
      if (key === 'pending_invite') {
        return JSON.stringify({ ws: 'https://old.example.com', projectId: 'p1', token: 't1', receivedAt: Date.now() });
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await authApi.switchWorkspace(false, 'https://new.example.com');
    });

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('pending_invite', 'null');
  });

  it('newOrigin переданий, pending_invite ТОГО САМОГО workspace (інше написання) — НЕ стирається', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'data_owner') return JSON.stringify({ workspaceId: 'ws-1', userId: '42' });
      if (key === 'pending_invite') {
        return JSON.stringify({ ws: 'https://same.example.com/', projectId: 'p1', token: 't1', receivedAt: Date.now() });
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await authApi.switchWorkspace(false, 'https://same.example.com');
    });

    expect(mockAsyncStorage.setItem).not.toHaveBeenCalledWith('pending_invite', expect.anything());
  });

  it('newOrigin НЕ переданий (app/account.tsx — напрямок ще невідомий) — pending_invite не чіпається', async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'data_owner') return JSON.stringify({ workspaceId: 'ws-1', userId: '42' });
      if (key === 'pending_invite') {
        return JSON.stringify({ ws: 'https://old.example.com', projectId: 'p1', token: 't1', receivedAt: Date.now() });
      }
      return null;
    });
    await renderAuth();

    await act(async () => {
      await authApi.switchWorkspace();
    });

    expect(mockAsyncStorage.setItem).not.toHaveBeenCalledWith('pending_invite', expect.anything());
  });
});

// ─── refreshProfile — легасі-сесія, що вже синкалась, не показує діалог ─────
//
// Раніше `refreshProfile()` кликав `resolveDataOwnership()` для БУДЬ-ЯКОЇ
// сесії з `data_owner === null`, включно з легасі-сесією, що прийшла з кешу
// (не через login()/register()) і вже хоч раз обмінювалась даними з цим
// самим акаунтом звичайним синком. `reconcileDataOwnership` бачила «дані є
// локально» + «дані є на акаунті» (це ж вони самі) і показувала блокувальний
// діалог «об'єднати/використати дані акаунта» на порожньому місці — «Продовжити
// без злиття» там стирає непровштовхнутий outbox мовчки (major з ревʼю).
describe('refreshProfile — курсор синку вже рухався цим акаунтом → власник мовчки, без діалогу', () => {
  beforeEach(async () => {
    mockAsyncStorage.getItem.mockImplementation(async (key: string) => {
      if (key === 'auth_user') {
        return JSON.stringify({ id: '42', email: 'a@b.c', name: 'A', isAdmin: false });
      }
      // Локальні дані Є (акаунтні, з попереднього звичайного синку) — саме
      // на цьому старий код і плутався: `hasAnyLocalData()` бачить «є
      // локально», reconcile йде в мережу перевіряти акаунт (він же бачить
      // ті самі дані) і дає `ask_merge`.
      if (key === 'tasks') return JSON.stringify([{ id: 't1', title: 'Акаунтне завдання' }]);
      return null; // 'data_owner' відсутній — саме легасі-випадок
    });
    mockSecureStore.getItemAsync.mockImplementation(async () => 'refresh-token');
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/auth/me/') return { id: 42, email: 'a@b.c', name: 'A', is_admin: false };
      return {};
    });
    // `hasSyncedBefore()` за визначенням неможливе без УЖЕ обраного workspace
    // (major з ревʼю в іншому місці: `refreshProfile` тепер сам пропускає
    // все нижче, доки `workspace_config` нема) — цей сценарій «легасі-сесія
    // вже кудись синкалась» без нього і не міг би статись. Пишемо конфіг
    // напряму через `setWorkspaceConfig()`, а не через мокнутий
    // `AsyncStorage.getItem('workspace_config')`: попередні `describe`
    // в цьому файлі викликають РЕАЛЬНИЙ `switchWorkspace()`, який реально
    // кличе `clearWorkspaceConfig()` (store/workspace.ts) — той раз і
    // назавжди виставляє модульний `_loaded=true`/кеш=null для решти
    // файлу, і подальші `loadWorkspaceConfig()` більше НЕ читають сховище
    // (короткий шлях на `_loaded`), тож мок на `getItem` тут запізно.
    await setWorkspaceConfig(
      buildWorkspaceConfig('https://api.example.com', {
        workspace_protocol: 1,
        workspace_id: 'ws-legacy',
        name: 'Flowi',
        color: '#7C3AED',
        logo_url: null,
        registration_mode: 'open',
        has_users: true,
        sync_contract_version: 2,
        min_client_version: { mobile: '1.0.0', web: '0.1.0' },
        ws_url: 'wss://api.example.com/ws',
      }),
    );
  });

  afterEach(() => {
    mockAsyncStorage.getItem.mockReset();
    mockAsyncStorage.getItem.mockImplementation(async () => null);
    mockSecureStore.getItemAsync.mockImplementation(async () => null);
    mockApiFetch.mockImplementation(async () => ({}));
    mockHasSyncedBefore.mockImplementation(async () => false);
  });

  it('hasSyncedBefore() === true — власника виставлено без POST /sync/user/v2/ (яким іде reconcile)', async () => {
    mockHasSyncedBefore.mockImplementation(async () => true);

    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });
    // Фоновий ефект refreshProfile асинхронний — даємо йому доопрацювати.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    const dataOwnerWrites = mockAsyncStorage.setItem.mock.calls.filter(([key]: [string]) => key === 'data_owner');
    expect(dataOwnerWrites.length).toBeGreaterThan(0);
    expect(JSON.parse(dataOwnerWrites.at(-1)[1])).toEqual({ workspaceId: 'ws-legacy', userId: '42' });
    // reconcileDataOwnership пішла б у мережу за станом акаунта (§9.2) —
    // силует-гілка це пропускає цілком.
    expect(mockApiFetch).not.toHaveBeenCalledWith('/sync/user/v2/', expect.anything());
  });

  it('hasSyncedBefore() === false — звичайний reconcile (мережевий запит стану акаунта є)', async () => {
    mockHasSyncedBefore.mockImplementation(async () => false);

    await act(async () => {
      TestRenderer.create(
        React.createElement(AuthProvider, null,
          React.createElement(Probe),
        ),
      );
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(mockApiFetch).toHaveBeenCalledWith('/sync/user/v2/', expect.anything());
  });
});
