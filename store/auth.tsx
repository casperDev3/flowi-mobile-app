/**
 * store/auth.tsx — AuthProvider + useAuth().
 *
 * Схема:
 *  - При монті: читаємо refresh із SecureStore + кеш user із AsyncStorage.
 *    Якщо є обидва → status 'authed' (офлайн-friendly).
 *    Коли AppModeProvider готовий і ми онлайн → фонове GET /auth/me/ для актуалізації.
 *  - login / register: викликають API, зберігають токени і user-кеш; примусово
 *    вмикають онлайн-режим (§2 плану — «офлайн» тепер лише тимчасова
 *    відсутність мережі, а не спосіб уникнути входу).
 *  - logout / deleteAccount: спроба досинку непорожнього outbox, POST
 *    /auth/logout/ (ігнорується якщо помилка), повне локальне прибирання
 *    workspace-даних (контракт §9.3 — той самий список, що й зміна workspace,
 *    крім самого `workspace_config`). Режим онлайн/офлайн НЕ чіпають: вихід —
 *    не привід іти в офлайн.
 *  - Підписка на 'session-expired' → status 'guest'.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import {
  ApiError,
  apiFetch,
  clearTokens,
  onSessionExpired,
  REFRESH_SECURE_KEY,
  setTokens,
} from './api';
import { isOnlineMode, setOnlineImperative, useAppMode } from './app-mode';
import {
  getDataOwner,
  hasAnyLocalData,
  reconcileDataOwnership,
  setDataOwner,
  uploadLocalDataToAccount,
  wipeLocalSyncedData,
} from './data-ownership';
import { useI18n } from './i18n';
import { getRegistrationPushToken, registerPushToken, unregisterPushToken } from './push';
import { clearPendingRegistration, savePendingRegistration, type PendingRegistration } from './registration';
import { clearPendingInvite, getPendingInvite } from './invite-link';
import { syncAllMyProjects, waitForAllProjectSyncsIdle } from './project-sync';
import { loadOutbox, OUTBOX_KEY, type OutboxItem } from './synced-storage';
import { hasSyncedBefore, resetPersonalSyncState, setIsAuthed, syncNow, triggerFullSync, waitForSyncIdle } from './sync-engine';
import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from './sync-contract';
import { notifyStorageChanged } from './storage';
import type { Translations } from './translations';
import {
  cachedWorkspaceConfig,
  clearWorkspaceConfig,
  loadWorkspaceConfig,
  normalizeWorkspaceOrigin,
} from './workspace';

// ─── Типи ────────────────────────────────────────────────────────────────────
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  /** Контракт §2.4 `UserOut.is_admin` — керує видимістю «Адміністрування workspace». */
  isAdmin: boolean;
}

export type AuthStatus = 'loading' | 'guest' | 'authed';

/** Результат `register()` — контракт §2.4: 201 (активний акаунт) або 202 (заявка). */
export type RegisterResult =
  | { status: 'active' }
  | { status: 'pending'; requestId: string };

/**
 * `switchWorkspace()` кидає це, коли непорожній outbox не встиг синхронізуватись
 * і `force` не передано — виклик (наприклад, `app/account.tsx`) має спитати
 * користувача «продовжити й втратити зміни, чи скасувати», а не мовчки стерти
 * непровштовхнуте.
 */
export class UnsyncedOutboxError extends Error {
  constructor() {
    super('workspace switch blocked: unsynced outbox after sync attempt');
    this.name = 'UnsyncedOutboxError';
  }
}

/**
 * Чи лишилось локальне, яке зміна workspace/вихід не мають права мовчки
 * стерти: (1) непорожній outbox ПІСЛЯ спроби синку — звичайні непровштовхнуті
 * мутації; (2) нічийні (`data_owner == null`) синхронізовані дані — легасі-
 * записи, покладені напряму в обхід outbox (до появи синку, чи офлайн-режим
 * до цього релізу, коли `isOnlineMode()` тримав `doSync()` на гейті й outbox
 * міг накопичитись, але міг і не встигнути — record, покладений через
 * `saveData` в обхід `saveSynced`, у outbox не потрапляє взагалі). Контракт
 * §2: такі дані «зберігаються й вивантажуються в акаунт» ПІСЛЯ входу — вихід
 * чи зміна workspace не мають права їх стерти без попередження.
 */
async function hasUnprotectedLocalChanges(): Promise<boolean> {
  const remaining = await loadOutbox().catch(() => [] as OutboxItem[]);
  if (remaining.length > 0) return true;
  const owner = await getDataOwner().catch(() => null);
  if (owner !== null) return false;
  return hasAnyLocalData().catch(() => false);
}

interface AuthCtx {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  /**
   * `inviteToken` — контракт §2.4: реєстрація з запрошенням у проєкт
   * (`ftrackingapp://invite`, `app/invite.tsx` → «Зареєструватися»).
   * Валідний токен одразу дає `ProjectMember` у режимі `open`, або лишається
   * `invite_snapshot` заявки в режимі `approval` — обидва варіанти сервер
   * робить сам, клієнт лише передає токен один раз.
   */
  register: (email: string, password: string, name?: string, inviteToken?: string) => Promise<RegisterResult>;
  /** Контракт §2.5 — заявку погоджено, сервер видав токени. */
  applyApprovedRegistration: (user: UserOut, access: string, refresh: string) => Promise<void>;
  /**
   * `force=true` — продовжити навіть якщо непорожній outbox/нічийні локальні
   * дані не встигли синхронізуватись (кидає `UnsyncedOutboxError`, якщо
   * `force` не передано — виклик мусить спитати користувача, як і
   * `switchWorkspace`).
   */
  logout: (force?: boolean) => Promise<void>;
  /**
   * Контракт §2.3 — вихід + очищення локальних даних цього workspace.
   * `force=true` — продовжити навіть якщо непорожній outbox не досинхронізувався
   * (кидає `UnsyncedOutboxError`, якщо `force` не передано і синк не встиг).
   * `newOrigin` — origin workspace, КУДИ йде зміна, коли виклик уже його знає
   * (`app/workspace.tsx`, `app/invite.tsx`): контракт §9.3 «лише при зміні
   * workspace додатково: `pending_invite` (якщо його `ws` ≠ новому)». Виклик
   * без напрямку заздалегідь (`app/account.tsx` — користувач іде на /workspace
   * ще ЩОСЬ обирати) лишає `pending_invite` як є.
   */
  switchWorkspace: (force?: boolean, newOrigin?: string) => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

// ─── Контекст ─────────────────────────────────────────────────────────────────
const Ctx = createContext<AuthCtx>({
  user: null,
  status: 'loading',
  login: async () => {},
  register: async () => ({ status: 'active' }),
  applyApprovedRegistration: async () => {},
  logout: async () => {},
  switchWorkspace: async () => {},
  updateProfile: async () => {},
  changePassword: async () => {},
  deleteAccount: async () => {},
});

const USER_CACHE_KEY = 'auth_user';

export interface UserOut {
  id: number | string;
  email: string;
  name: string;
  is_admin?: boolean;
}

function mapUser(raw: UserOut): AuthUser {
  return { id: String(raw.id), email: raw.email, name: raw.name ?? '', isAdmin: !!raw.is_admin };
}

/**
 * Узгоджує локальні дані з акаунтом (контракт §9.2) і, якщо треба, питає
 * користувача блокувальним `Alert` («об'єднати» чи «використати дані
 * акаунта») — саме тому запускається ДО `triggerFullSync()`: інакше звичайний
 * push уже вивантажив би локальні дані, і питання «що робити з локальними
 * даними» втратило б сенс.
 */
async function resolveDataOwnership(userId: string, workspaceId: string, tr: Translations): Promise<void> {
  const outcome = await reconcileDataOwnership(userId, workspaceId);
  // 'retry_later' — мережа не дала звірити стан акаунта (store/data-ownership.ts):
  // `data_owner` свідомо лишили null, тож нічого питати чи вивантажувати
  // зараз не можна — наступний вхід звірить знову.
  if (outcome === 'clean' || outcome === 'retry_later') return;

  await new Promise<void>((resolve, reject) => {
    Alert.alert(
      tr.mergeDataTitle,
      tr.mergeDataMsg,
      [
        {
          text: tr.mergeDataUseAccount,
          style: 'destructive',
          onPress: () => {
            // `.catch(reject)` (minor з ревʼю): без нього помилка з
            // `wipeLocalSyncedData()`/`setDataOwner()` (наприклад, збій
            // AsyncStorage) лишала б цей проміс НЕ вирішеним НАЗАВЖДИ —
            // `login`/`register`/approve-реєстрація висіли б зі спінером,
            // а сесія лишалась би напівготовою (токени вже збережено,
            // `status` ще не 'authed').
            void wipeLocalSyncedData()
              .then(() => setDataOwner({ workspaceId, userId }))
              .then(resolve)
              .catch(reject);
          },
        },
        {
          text: tr.mergeDataMerge,
          onPress: () => {
            // §9.2: об'єднання за id — вивантажуємо ВЕСЬ локальний простір
            // (не лише те, що вже в outbox), новіші локальні записи йдуть
            // force:true, старіші за акаунтні пропускаються — їх перетре pull.
            void uploadLocalDataToAccount()
              .then(() => setDataOwner({ workspaceId, userId }))
              .then(resolve)
              .catch(reject);
          },
        },
      ],
      // Без "Скасувати": локальні дані інакше почали б вивантажуватись у фоні
      // (наступний debounce sync-engine) ДО того, як користувач обрав, що з
      // ними робити.
      { cancelable: false },
    );
  });
}

/**
 * Повний список локальних ключів workspace (контракт §9.3), крім того, що
 * лишається на пристрої свідомо (тема/мова/налаштування UI), і крім ключів із
 * власними геттерами/типами за замовчуванням (курсор/ревізії — нижче;
 * `pending_registration` — через `clearPendingRegistration`, бо той ще й
 * прибирає SecureStore-токен заявки, якого тут нема).
 */
const WORKSPACE_SWITCH_STORAGE_KEYS = [
  ...SYNC_ARRAY_KEYS,
  ...SYNC_SINGLETON_KEYS,
  OUTBOX_KEY,
  'last_server_sync_completed_at',
  'last_server_sync_error_v2',
  'sync_rejected_v2',
  'sync_known_collections_v2',
  'sync_pending_conflicts',
  USER_CACHE_KEY,
  'data_owner',
  'push_token_registered',
  'gcal_refresh_token',
  'gcal_last_sync',
  'agent_config',
  'banks_last_source',
  'timer_dials',
  'pref_task_reminders',
  // Простір проєкту (WORKSPACE_PROJECTS §9.3, major з ревʼю) — ці ключі не
  // входять у SYNC_ARRAY_KEYS/SYNC_SINGLETON_KEYS (їх пише не звичайний
  // особистий синк, а `store/project-sync.ts`/`store/project-team.ts`), тож
  // без явного перерахунку тут переживали б і logout, і зміну workspace, і
  // навіть вхід іншим акаунтом на тому самому пристрої. Найгірший наслідок —
  // `project_sync_state_v1` тримає курсор попереднього акаунта: наступний
  // логін бачить `summary.cursor == local cursor` і НІКОЛИ більше не тягне
  // потік проєкту (`projectsNeedingSync`), а `project_members_v1` тягне
  // чужі імена/email у пікер виконавця/автодоповнення коментарів.
  'comments',
  'project_budgets',
  'workspace_projects',
  'project_sync_state_v1',
  'project_members_v1',
  'recent_projects',
  'projects_migrated_v1',
  // Черга DELETE /projects/{id}/ (§3.2) — id проєктів попереднього акаунта;
  // проштовхувати їх від імені нового акаунта (чи взагалі мовчки прибрати
  // на 403 not_a_member — flushPendingProjectDeletes) сенсу нема.
  'pending_project_deletes',
] as const;

/**
 * Закриває поточну сесію синку ПЕРЕД витиранням локальних даних — major з
 * ревʼю: `setIsAuthed(false)` раніше ставили ПІСЛЯ `clearLocalDataForWorkspaceSwitch()`,
 * тож обмін (особистий `doSync` чи проєктний `syncProject`), що встиг
 * стартувати ДО виходу (WS `sync_changed`/`projects_changed`, 5-хвилинний
 * поллінг, повернення з фону — усі незалежні від awaited push-виклику
 * логауту вище), міг завершитись уже ПІСЛЯ `multiRemove` і дописати курсор,
 * ревізії й пул-записи покинутого акаунта в щойно витерте сховище. На
 * наступному вході (уже в новому акаунті/workspace) `data_owner` там `null`,
 * а локальні дані є — `reconcileDataOwnership` мовчки вивантажує їх у новий
 * акаунт або показує діалог злиття з чужими даними.
 *
 * `setIsAuthed(false)` тут зачиняє гейт (`currentGate`) для НОВИХ обмінів
 * негайно (синхронно) — а `waitForSyncIdle`/`waitForAllProjectSyncsIdle`
 * дочікуються обміну, що вже йшов ДО цього виклику й про прапорець не знає.
 * Обмежений тайм-аут — щоб зависла мережа не вішала сам вихід назавжди;
 * гейт уже зачинено, тож найгірший результат після тайм-ауту — той самий
 * рідкісний рейс, що й був, а не додаткова затримка UI.
 */
async function closeSyncSessionBeforeWipe(): Promise<void> {
  setIsAuthed(false);
  const drained = Promise.all([waitForSyncIdle(), waitForAllProjectSyncsIdle()]);
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 8000));
  await Promise.race([drained, timeout]);
}

/**
 * Стирає локальні дані активного workspace — крок 4 контракту §2.3/§9.3.
 * Використовується і виходом (той самий workspace), і зміною workspace.
 *
 * `AsyncStorage.removeItem`, а НЕ `saveData(key, null)`: останній пише рядок
 * `"null"`, а `storage.loadData` вважає «нема даних» лише порожній рядок —
 * тобто `JSON.parse("null")` повертав би справжній `null` замість fallback
 * УСІМ читачам, включно з масивними ключами (`SYNC_ARRAY_KEYS`, `OUTBOX_KEY`),
 * чиї споживачі роблять `.map`/`.filter` на результаті й падають з
 * TypeError (loadOutbox → ensureMutationIds(null), архів/підзавдання/проєкти
 * на `loadData<Task[]>('tasks', [])`). Справжній `removeItem` дає читачам
 * чистий `null` від AsyncStorage — кожен falls back на своє коректне значення.
 */
async function clearLocalDataForWorkspaceSwitch(): Promise<void> {
  await AsyncStorage.multiRemove([...WORKSPACE_SWITCH_STORAGE_KEYS]);
  // Слухачі (useStorageRefresh) чекають сигналу на кожен ключ, а
  // multiRemove такого сигналу сам не шле.
  for (const key of WORKSPACE_SWITCH_STORAGE_KEYS) notifyStorageChanged(key);
  // Курсор/ревізії — не null, а «ще нічого не тягнули» (0 / {}), інакше
  // getServerCursor()/getRevisionMap() читають чужий тип назад.
  await resetPersonalSyncState();
  // Прибирає і AsyncStorage-запис, і SecureStore-токен заявки (§9.3).
  await clearPendingRegistration();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    if (__DEV__) console.warn('[auth] скасування нотифікацій не вдалося:', e);
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const { ready: modeReady } = useAppMode();
  const { tr } = useI18n();
  const bgRefreshDone = useRef(false);

  // Refs to avoid stale closures and alert spam on multiple 401s
  const trRef = useRef(tr);
  useEffect(() => { trRef.current = tr; }, [tr]);
  const alertShownRef = useRef(false);

  // ── Початкова ініціалізація ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const unsub = onSessionExpired(() => {
      if (!mounted) return;
      setIsAuthed(false);
      setUser(null);
      setStatus('guest');

      // Show Alert once per session-expiry event (guard against multiple 401 responses)
      if (!alertShownRef.current) {
        alertShownRef.current = true;
        const t = trRef.current;
        Alert.alert(
          t.sessionExpired,
          t.sessionExpiredMsg,
          [
            {
              text: t.authLogin,
              onPress: () => router.push('/login'),
            },
            {
              text: t.later,
              style: 'cancel',
            },
          ],
        );
      }
    });

    async function init() {
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (!refresh) {
          if (mounted) setStatus('guest');
          return;
        }

        // Маємо refresh-токен — показуємо кеш одразу
        const cachedJson = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cachedJson && mounted) {
          try {
            setUser(JSON.parse(cachedJson) as AuthUser);
            setStatus('authed');
            // §2 плану: «офлайн» — лише тимчасова відсутність мережі, а не
            // персистентний вибір. Раніше лишень login()/register() форсували
            // онлайн, тож `app_mode='offline'`, збережений ДО цього релізу
            // (чи руками в Налаштуваннях, коли перемикач ще існував), тягнувся
            // за вже автентифікованим користувачем повз кожен холодний старт.
            setOnlineImperative(true);
          } catch {
            setStatus('guest');
          }
        } else if (mounted) {
          // Є refresh, але немає кешу — будемо чекати на фоновий me/
          setStatus('guest');
        }
      } catch (e) {
        if (__DEV__) console.warn('[auth] init error:', e);
        if (mounted) setStatus('guest');
      }
    }

    init();

    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // ── Фонова актуалізація профілю (коли AppMode готовий) ───────────────────────
  useEffect(() => {
    if (!modeReady || bgRefreshDone.current) return;

    // Запускаємо тільки якщо вже є refresh (статус authed або status='guest' але є кеш)
    let mounted = true;
    bgRefreshDone.current = true;

    async function refreshProfile() {
      try {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (!refresh) return;

        // minor з ревʼю: апгрейд-користувач, що вже автентифікований (є
        // refresh-токен із попередньої версії), але ще на `/workspace`, бо
        // `workspace_config` після апгрейду ще нема — без цієї перевірки
        // `apiFetch('/auth/me/')` нижче йшов би на ДЕФОЛТНИЙ хмарний origin
        // (`getApiBase()` без конфігу падає на нього), а не на той workspace,
        // який людина ще навіть не обрала, і код нижче міг би записати
        // `data_owner`/`push_token_registered` з `workspaceId: ''`
        // (`cachedWorkspaceConfig()?.workspaceId ?? ''`). Явний `await
        // loadWorkspaceConfig()` (а не голий `cachedWorkspaceConfig()`) —
        // цей ефект (deps `[modeReady]`) не залежить від того, встиг чи ні
        // `AuthGate` (app/_layout.tsx) уже прочитати конфіг у СВОЄМУ ефекті;
        // функція ідемпотентна (читає сховище лише один раз на процес), тож
        // виклик тут не дублює жодної роботи. Цей `bgRefreshDone`-ефект
        // виконується рівно один раз за життя застосунку — якщо конфігу й
        // справді нема (реальний апгрейд-кейс), він так і лишиться
        // невиконаним цю сесію, а `applyAndNavigate` (app/workspace.tsx) і
        // `completeSession` роблять свою актуалізацію профілю окремо, вже
        // маючи конфіг.
        if (!(await loadWorkspaceConfig())) return;

        // §2 плану: «офлайн» — лише тимчасова відсутність мережі, а не
        // персистентний вибір. Раніше гейт `isOnlineMode()` ВИЩЕ не пускав
        // сюди навіть уже автентифікованого користувача зі старим
        // `app_mode='offline'` (з-до-релізу чи з видаленого перемикача) —
        // ні актуалізація профілю, ні реєстрація push-токена нижче так
        // ніколи й не відбувались би без ручного relogin.
        setOnlineImperative(true);

        const me = await apiFetch<UserOut>('/auth/me/');
        if (!mounted) return;

        const updated = mapUser(me);
        setUser(updated);
        setStatus('authed');
        await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(updated));

        // Легасі-сесія з-до-цього-релізу (чи з переходу до появи
        // `resolveDataOwnership` у completeSession): `data_owner` міг ніколи
        // не виставитись, бо ця сесія прийшла з кешу (`init()` вище), а не
        // через login()/register(). Без цього наступний логін ІНШИМ акаунтом
        // на тому самому пристрої вважав би дані попереднього користувача
        // нічийними (§9.2) — reconcile тут закриває розрив. Синк тим часом
        // не тіка вперед: doSync() (store/sync-engine.tsx) сам не почне
        // перший обмін, поки власника нема (той самий гейт, що й у
        // 'retry_later'), тож нічого не встигає піти на сервер до вибору
        // користувача в діалозі злиття (за потреби).
        //
        // Якщо ж курсор персонального синку вже НЕ нульовий — цей пристрій
        // уже хоч раз обмінювався даними САМЕ з цим акаунтом (звичайний
        // синк, не `resolveDataOwnership`). Локальні дані тоді свідомо
        // акаунтні, а не «нічийні офлайн-дані» — `reconcileDataOwnership`
        // цього не знає (бачить лише «дані є локально» + «дані є на
        // сервері», бо це ж вони самі) і показав би блокувальний діалог
        // «об'єднати/використати дані акаунта» щоразу на порожньому місці;
        // «використати дані акаунта» там же стирає непровштовхнутий outbox
        // мовчки (major з ревʼю). Просто виставляємо власника без діалогу.
        if (mounted && !(await getDataOwner())) {
          if (await hasSyncedBefore()) {
            await setDataOwner({ workspaceId: cachedWorkspaceConfig()?.workspaceId ?? '', userId: updated.id });
          } else {
            await resolveDataOwnership(updated.id, cachedWorkspaceConfig()?.workspaceId ?? '', trRef.current);
          }
        }

        // Контракт §2.8: реєстрація токена і на холодному старті вже
        // залогіненого користувача, не лише при вході/реєстрації —
        // ідемпотентно (registerPushToken сам звіряє з попереднім записом).
        void registerPushToken(updated.id, cachedWorkspaceConfig()?.workspaceId ?? '');
      } catch (e) {
        // Мережева помилка або OfflineError — тихо ігноруємо.
        // session-expired обробляється emitter у api.ts.
        if (__DEV__) console.warn('[auth] background me/ failed:', e);
      }
    }

    refreshProfile();

    return () => { mounted = false; };
  }, [modeReady]);

  // ── спільний хвіст login/register/схваленої заявки ─────────────────────────
  /**
   * Порядок тут навмисний і крихкий (контракт §9.2): `resolveDataOwnership`
   * МУСИТЬ завершитись (разом із блокувальним діалогом «злити/використати
   * акаунт») ДО того, як `status`/`setIsAuthed(true)` роблять сесію видимою
   * для `SyncProvider`. Раніше статус виставлявся одразу, і React-ефект
   * `SyncProvider` (реагує на `status === 'authed'`) устигав викликати
   * `doSync('coldStart')` — а сокет `ws/user/` ще один синк за ~800мс —
   * ПОКИ користувач ще не встиг обрати «злити» чи «використати дані
   * акаунта». Легасі-outbox уже поїхав би на сервер, і вибір «використати
   * дані акаунта» більше не мав би сенсу: локальне вже просочилось.
   * Тому токени й `setOnlineImperative(true)` виставляємо ОДРАЗУ (вони
   * потрібні самому `resolveDataOwnership` для мережевих викликів), а
   * `user`/`status`/`setIsAuthed(true)` — лише ПІСЛЯ, одним махом.
   */
  const completeSession = useCallback(async (rawUser: UserOut, access: string, refresh: string) => {
    const u = mapUser(rawUser);
    const workspaceId = cachedWorkspaceConfig()?.workspaceId ?? '';
    await setTokens(access, refresh);

    // §2 плану: «офлайн» тепер лише тимчасова відсутність мережі, а не спосіб
    // уникнути входу — вхід/реєстрація завжди примусово вмикають онлайн,
    // інакше `resolveDataOwnership` нижче йде через офлайн-гейт `apiFetch` і
    // мовчки вирішує «дані чисті», навіть коли в акаунті вже щось є.
    setOnlineImperative(true);

    // Контракт §9.2: локальні дані офлайн-користувача вивантажуються в
    // акаунт; якщо в акаунті вже щось є — питаємо, об'єднати чи замінити.
    // ДО setStatus('authed')/setIsAuthed(true) — див. коментар вище.
    await resolveDataOwnership(u.id, workspaceId, trRef.current);

    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
    setStatus('authed');
    setIsAuthed(true);
    alertShownRef.current = false; // Reset so Alert can show again if session expires

    void triggerFullSync();
    void registerPushToken(u.id, workspaceId);
  }, []);

  // ── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ user: UserOut; access: string; refresh: string }>(
      '/auth/login/',
      { method: 'POST', body: { email, password }, auth: false, allowOffline: true },
    );
    await completeSession(data.user, data.access, data.refresh);
  }, [completeSession]);

  // ── applyApprovedRegistration ────────────────────────────────────────────
  // Заявку "за погодженням" (§2.4) погодив адмін — токени приходять із
  // `POST /auth/register/status/` (контракт §2.5), не з /auth/login/.
  // Використовується екраном очікування `app/register-pending.tsx`.
  const applyApprovedRegistration = useCallback(async (rawUser: UserOut, access: string, refresh: string) => {
    await completeSession(rawUser, access, refresh);
  }, [completeSession]);

  // ── register ───────────────────────────────────────────────────────────────
  const register = useCallback(async (email: string, password: string, name?: string, inviteToken?: string): Promise<RegisterResult> => {
    const body: Record<string, string> = { email, password };
    if (name?.trim()) body.name = name.trim();
    if (inviteToken?.trim()) body.invite_token = inviteToken.trim();
    const workspaceId = cachedWorkspaceConfig()?.workspaceId ?? '';

    // Контракт §2.4: `push_token`/`push_platform` опційні — заявник у режимі
    // «за погодженням» ще не автентифікований (немає `/push/tokens/`), тож
    // без цього поля тут він дізнавався б про рішення адміна ЛИШЕ поллінгом
    // (кожні 65с), ніколи пушем `registration_decision`.
    const push = await getRegistrationPushToken();
    if (push) {
      body.push_token = push.token;
      body.push_platform = push.platform;
    }

    const data = await apiFetch<
      | { status?: 'active'; user: UserOut; access: string; refresh: string }
      | { status: 'pending'; request_id: string; request_token: string; detail: string }
    >('/auth/register/', { method: 'POST', body, auth: false, allowOffline: true });

    // Токен уже передано серверу разом із запитом (обидві гілки нижче) —
    // локальна черга «інвайт до входу» (§9.1) виконала свою роль.
    if (inviteToken?.trim()) await clearPendingInvite();

    // Контракт §2.4: 202 у режимі "за погодженням" — заявка, не акаунт.
    if (data.status === 'pending') {
      const pending: PendingRegistration = {
        requestId: data.request_id,
        email: email.trim().toLowerCase(),
        workspaceId,
        createdAt: Date.now(),
      };
      await savePendingRegistration(pending, data.request_token);
      return { status: 'pending', requestId: data.request_id };
    }

    await completeSession(data.user, data.access, data.refresh);
    return { status: 'active' };
  }, [completeSession]);

  // ── logout ─────────────────────────────────────────────────────────────────
  /**
   * Контракт §9.3 застосовується і до звичайного виходу, не лише до зміни
   * workspace: (1) непорожній outbox — спроба досинхронізувати, (2) зняти
   * push-токен, (3) `POST /auth/logout/`, (4) стерти локальні дані/курсори
   * ЦЬОГО акаунта (§9.3) — `workspace_config` НЕ чіпаємо, залишаємось на
   * тому самому workspace. Режим онлайн/офлайн теж не чіпаємо: «офлайн» —
   * лише тимчасова відсутність мережі, а не наслідок виходу.
   *
   * Без `force`, якщо після спроби синку лишились непровштовхнуті зміни (чи
   * взагалі не було мережі для спроби) — кидаємо `UnsyncedOutboxError`,
   * замість мовчки стирати їх у §9.3-прибиранні нижче: той самий контракт,
   * що й у `switchWorkspace`, виклик (`app/(tabs)/settings.tsx`) ловить її й
   * питає користувача явно.
   */
  const logout = useCallback(async (force = false) => {
    try {
      const outbox = await loadOutbox();
      if (outbox.length > 0 && isOnlineMode()) {
        await syncNow().catch(e => { if (__DEV__) console.warn('[auth] pre-logout sync failed:', e); });
        // Контракт §2.3 крок 1: «непорожній ОСОБИСТИЙ АБО ПРОЄКТНИЙ outbox» —
        // syncNow() штовхає лише isPersonalOutboxItem-рядки, тож без цього
        // виклику будь-яка непровштовхнута правка в проєкті ніколи не
        // отримувала жодної спроби синку, і hasUnprotectedLocalChanges()
        // нижче (вона рахує ВЕСЬ outbox, включно з проєктним) кидала б
        // UnsyncedOutboxError, а «Продовжити» в діалозі стирало б зміни,
        // які могли б піти на сервер.
        await syncAllMyProjects().catch(e => { if (__DEV__) console.warn('[auth] pre-logout project sync failed:', e); });
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] outbox check failed:', e);
    }

    if (!force && await hasUnprotectedLocalChanges()) throw new UnsyncedOutboxError();

    // Знімаємо push-токен, поки ще авторизовані (контракт §2.8).
    await unregisterPushToken();

    // Намагаємось повідомити сервер (ігноруємо будь-яку помилку)
    try {
      if (isOnlineMode()) {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (refresh) {
          await apiFetch('/auth/logout/', { method: 'POST', body: { refresh } });
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] logout API call failed:', e);
    }

    await clearTokens();
    // Гейт синку зачиняємо і чекаємо на вже запущений обмін ДО витирання
    // (major з ревʼю) — див. коментар на `closeSyncSessionBeforeWipe`.
    await closeSyncSessionBeforeWipe();
    await clearLocalDataForWorkspaceSwitch();

    setUser(null);
    setStatus('guest');
  }, []);

  // ── switchWorkspace ────────────────────────────────────────────────────────
  /**
   * Зміна workspace = вихід (контракт §2.3): (1) непорожній outbox — спроба
   * досинхронізувати, (2) зняти push-токен, (3) `POST /auth/logout/`,
   * (4) стерти локальні дані/токени/курсори ЦЬОГО workspace (§9.3),
   * (5) прибрати `workspace_config` — далі `AuthGate` веде на `/workspace`.
   * Дані одного сервера НІКОЛИ не потрапляють на інший.
   *
   * Якщо синк не встиг (мережа впала посеред спроби, або мережі й зовсім не
   * було — `switchWorkspace` викликається і з `/welcome`, ще ДО входу, де
   * `app_mode` міг лишитись `'offline'` з-до-релізу: `setOnlineImperative(true)`
   * форсують лише логін/реєстрація/автентифікований холодний старт) і
   * лишились непушені зміни АБО нічийні (легасі-офлайн) локальні дані, БЕЗ
   * `force` кидаємо `UnsyncedOutboxError` — виклик з `app/account.tsx` /
   * `app/workspace.tsx` ловить її і питає користувача «продовжити й втратити
   * зміни, чи скасувати», замість мовчки стирати непровштовхнуте.
   *
   * Перевірка «чи лишилось непровштовхнуте» раніше висіла на тому самому
   * `isOnlineMode()`, що й спроба синку — офлайн-легасі-користувач узагалі не
   * потрапляв у цю гілку, і `clearLocalDataForWorkspaceSwitch()` нижче стирала
   * все мовчки. Тепер спроба синку лишається online-only, а сама перевірка —
   * ні.
   */
  const switchWorkspace = useCallback(async (force = false, newOrigin?: string) => {
    let outbox: OutboxItem[] = [];
    try {
      outbox = await loadOutbox();
    } catch (e) {
      if (__DEV__) console.warn('[auth] outbox check failed:', e);
    }
    if (outbox.length > 0 && isOnlineMode()) {
      try {
        await syncNow();
      } catch (e) {
        if (__DEV__) console.warn('[auth] pre-switch sync failed:', e);
      }
      // Той самий major, що й у logout(): syncNow() штовхає лише особистий
      // outbox (isPersonalOutboxItem), тож проєктні правки потребують
      // окремої спроби — інакше hasUnprotectedLocalChanges() (рахує весь
      // outbox) завжди кидає UnsyncedOutboxError на непорожньому проєкті.
      try {
        await syncAllMyProjects();
      } catch (e) {
        if (__DEV__) console.warn('[auth] pre-switch project sync failed:', e);
      }
    }
    if (!force && await hasUnprotectedLocalChanges()) throw new UnsyncedOutboxError();

    await unregisterPushToken();

    try {
      if (isOnlineMode()) {
        const refresh = await SecureStore.getItemAsync(REFRESH_SECURE_KEY);
        if (refresh) await apiFetch('/auth/logout/', { method: 'POST', body: { refresh } });
      }
    } catch (e) {
      if (__DEV__) console.warn('[auth] switchWorkspace logout call failed:', e);
    }

    // Гейт синку зачиняємо і чекаємо на вже запущений обмін ДО витирання
    // (major з ревʼю) — див. коментар на `closeSyncSessionBeforeWipe`.
    await closeSyncSessionBeforeWipe();
    await clearLocalDataForWorkspaceSwitch();
    // Контракт §9.3 «лише при зміні workspace додатково: pending_invite
    // (якщо його ws ≠ новому)» — мінор із ревʼю: `WORKSPACE_SWITCH_STORAGE_KEYS`
    // навмисно НЕ чіпає `pending_invite` (той самий ключ переживає звичайний
    // logout, де це правильно — інвайт до входу мусить дочекатись наступного
    // входу В ТОЙ САМИЙ workspace), тож без цієї перевірки застарілий інвайт
    // ІНШОГО workspace лишався б у сховищі назавжди: `PendingInviteAutoJoin`
    // (app/_layout.tsx) лише порівнює origin і мовчки виходить на мисматчі,
    // нічого не прибираючи.
    if (newOrigin) {
      const pending = await getPendingInvite();
      const normalizedNew = normalizeWorkspaceOrigin(newOrigin);
      // Нормалізуємо ОБИДВІ сторони — `pending.ws` (як і `newOrigin` від
      // викликів типу `app/invite.tsx`) може прийти сирим із deep link'а
      // (регістр/кінцевий слеш), а `current.origin`/`success.origin` завжди
      // нормалізовані `buildWorkspaceConfig`. Без цього той самий інвайт,
      // просто в іншому написанні, вважався б «іншим workspace» і стирався
      // б посеред власного ж приєднання (app/invite.tsx confirmSwitch).
      const normalizedPending = pending ? normalizeWorkspaceOrigin(pending.ws) : null;
      if (pending && normalizedNew.ok && normalizedPending?.ok && normalizedPending.origin !== normalizedNew.origin) {
        await clearPendingInvite();
      }
    }
    await clearTokens();
    // `setIsAuthed(false)` уже виставлено вище, в `closeSyncSessionBeforeWipe()`,
    // ДО витирання — тут лишається тільки React-стан.
    setUser(null);
    setStatus('guest');
    await clearWorkspaceConfig();
  }, []);

  // ── updateProfile ──────────────────────────────────────────────────────────
  const updateProfile = useCallback(async (name: string) => {
    const updated = await apiFetch<UserOut>('/auth/me/', { method: 'PATCH', body: { name: name.trim() } });
    const u = mapUser(updated);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  // ── changePassword ─────────────────────────────────────────────────────────
  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    const data = await apiFetch<{ access: string; refresh: string }>(
      '/auth/password/change/',
      { method: 'POST', body: { old_password: oldPassword, new_password: newPassword } },
    );
    // Зберігаємо нові токени, що повертає сервер після зміни пароля
    await setTokens(data.access, data.refresh);
  }, []);

  // ── deleteAccount ──────────────────────────────────────────────────────────
  const deleteAccount = useCallback(async (password: string) => {
    await apiFetch('/auth/me/', { method: 'DELETE', body: { password } });
    // Акаунта вже нема — без спроби синку і без DELETE /push/tokens/ (сервер
    // однаково відмовить). Локальне прибирання — те саме §9.3, що й вихід;
    // онлайн/офлайн не чіпаємо (та сама причина, що й у logout()).
    await clearTokens();
    // Той самий рейс, що й у logout()/switchWorkspace() (major з ревʼю) —
    // акаунта вже нема на сервері, але обмін, що вже йшов, про це не знає.
    await closeSyncSessionBeforeWipe();
    await clearLocalDataForWorkspaceSwitch();
    setUser(null);
    setStatus('guest');
  }, []);

  return (
    <Ctx.Provider value={{ user, status, login, register, applyApprovedRegistration, logout, switchWorkspace, updateProfile, changePassword, deleteAccount }}>
      {children}
    </Ctx.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

// ─── Хелпер для класифікації помилок API ─────────────────────────────────────
export function getApiErrorCode(e: unknown): string | null {
  if (e instanceof ApiError) return e.code;
  return null;
}
