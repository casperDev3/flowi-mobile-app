/**
 * store/push.ts — реєстрація Expo push-токена на сервері (контракт §2.8).
 *
 * Дозволу на нотифікації тут НЕ просимо: перший запит permission-діалогу
 * одразу після входу, коли користувач ще нічого не налаштував, — це саме
 * той «холодний» запит, що привчає людей тапати «Не дозволяти». Дозвіл
 * запитує `requestNotificationPermissions()` (store/notifications.ts) там,
 * де користувач сам вмикає нагадування; тут ми лише РЕЄСТРУЄМО токен, якщо
 * дозвіл уже є.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { apiFetch } from './api';
import { getApiBase } from './api-config';
import { loadData, saveData } from './storage';
import { cachedWorkspaceConfig } from './workspace';
import { pushTapUrl } from '@/utils/pushLink';

const REGISTERED_KEY = 'push_token_registered';
/** Токени, чиє `DELETE /push/tokens/` не вдалося (офлайн вихід) — дожимаємо при наступній реєстрації. */
const PENDING_UNREGISTER_KEY = 'push_pending_unregister';

/**
 * `origin` — `getApiBase()` активного workspace В МОМЕНТ, коли DELETE не
 * вдався (мінор із ревʼю): токен, знятий офлайн у workspace A, належить
 * СЕРВЕРУ workspace A, а не тому, що активний зараз. Без цього поля
 * дожимання після переходу у workspace B стукало б DELETE на сервер B із
 * токеном сервера A — сервер B про такий токен не знає (запит просто ні на
 * що не впливає), а прив'язка токена на сервері A так і лишається, і
 * пристрій продовжує отримувати пуші вже вийшлого користувача A.
 */
interface PendingUnregisterEntry {
  token: string;
  origin: string;
}
/**
 * Дублює ключ кешу користувача з `store/auth.tsx` (`USER_CACHE_KEY`), а не
 * імпортує його звідти: `auth.tsx` вже імпортує з цього файлу
 * (`getRegistrationPushToken`/`registerPushToken`/`unregisterPushToken`), і
 * зворотний імпорт замкнув би цикл.
 */
const AUTH_USER_CACHE_KEY = 'auth_user';

interface RegisteredPush {
  token: string;
  userId: string;
  workspaceId: string;
}

/**
 * EAS project id для `getExpoPushTokenAsync` — на SDK 54 обов'язковий, інакше
 * виклик кидає «No projectId found». Читаємо звідки заповнений: `app.json`
 * (`expo.extra.eas.projectId`, чого в цьому репо поки НЕМА — self-host/CI
 * мусить проставити перед збіркою) або нативний конфіг зібраного EAS-білда.
 */
function resolveEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId || Constants.easConfig?.projectId;
}

/**
 * Локальний Expo push-токен пристрою, БЕЗ звернення до сервера — для
 * `POST /auth/register/` (контракт §2.4), де акаунта ще нема і
 * `/push/tokens/` (auth-ендпоінт) викликати нічим. Дозволу тут так само не
 * просимо (шапка файлу): якщо його ще нема — просто немає токена, заявник
 * дізнається про рішення поллінгом (`register-pending.tsx`), а не пушем.
 */
async function getLocalPushToken(): Promise<{ token: string; platform: 'ios' | 'android' } | null> {
  try {
    if (!Device.isDevice) return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;

    const projectId = resolveEasProjectId();
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
  } catch (e) {
    if (__DEV__) console.warn('[push] локальний токен не отримано:', e);
    return null;
  }
}

/**
 * Читає чергу відкладених DELETE — і приймає легасі-форму `string[]` (до
 * появи `origin` у записі): такий запис трактуємо як «походить з активного
 * зараз origin», бо на момент його появи іншого способу дізнатись, з якого
 * workspace він прийшов, не було.
 */
async function loadPendingUnregister(): Promise<PendingUnregisterEntry[]> {
  const raw = await loadData<(string | PendingUnregisterEntry)[]>(PENDING_UNREGISTER_KEY, []);
  return raw.map(entry => typeof entry === 'string' ? { token: entry, origin: getApiBase() } : entry);
}

/**
 * Дожимає `DELETE /push/tokens/`, що впав при попередньому виході (офлайн) —
 * викликається з `registerPushToken`, бо той запускається на холодному
 * старті й вході, тобто в момент, коли мережа гарантовано вже перевіряється.
 * Без цього сервер тримав би пуш-токен пристрою прив'язаним до вже вийшлого
 * користувача аж до першого входу БУДЬ-КОГО на цьому пристрої (POST нижче
 * перепризначає токен новому — upsert), а якщо новий вхід так і не
 * стається, стара прив'язка лишається назавжди.
 *
 * `skipToken` — токен, який `registerPushToken` от-от POST-не заново (мінор
 * із ревʼю): без виключення DELETE тут та POST нижче йдуть одним викликом
 * без гарантії порядку доставки на сервері — якщо DELETE прибуде ПІСЛЯ POST,
 * щойно зареєстрований новим користувачем токен знімається, `push_token_registered`
 * уже збережено, і пуші новому користувачу більше НІКОЛИ не приходять без
 * ручного relogin. Записи з ІНШИМ, ніж активний зараз, `origin` (workspace,
 * з якого DELETE не вдався) свідомо пропускаємо — дожмуться, коли користувач
 * повернеться саме в той workspace.
 */
async function flushPendingUnregister(skipToken?: string): Promise<void> {
  const pending = await loadPendingUnregister();
  if (!pending.length) return;
  const activeOrigin = getApiBase();
  const remaining: PendingUnregisterEntry[] = [];
  for (const entry of pending) {
    if (entry.token === skipToken || entry.origin !== activeOrigin) {
      remaining.push(entry);
      continue;
    }
    try {
      await apiFetch('/push/tokens/', { method: 'DELETE', body: { token: entry.token } });
    } catch (e) {
      if (__DEV__) console.warn('[push] відкладене зняття токена не вдалося:', e);
      remaining.push(entry);
    }
  }
  if (remaining.length !== pending.length) await saveData(PENDING_UNREGISTER_KEY, remaining);
}

/**
 * Реєструє токен пристрою на сервері після входу/старту (контракт §2.8) —
 * ідемпотентно: якщо токен/користувач/workspace не змінились із минулого
 * разу, повторний мережевий виклик не робиться.
 */
export async function registerPushToken(userId: string, workspaceId: string): Promise<void> {
  try {
    const projectId = resolveEasProjectId();
    if (!projectId && __DEV__) {
      // Без projectId запит гарантовано впаде — голосно попереджаємо в dev,
      // замість мовчки ковтати помилку SDK на кожному вході.
      console.warn('[push] app.json не має extra.eas.projectId — Expo push токен неможливо отримати (SDK 54).');
    }

    const local = await getLocalPushToken();

    // `await`, а не `void` (мінор із ревʼю): DELETE і POST нижче — той самий
    // токен пристрою; без очікування DELETE може дістатись сервера ПІСЛЯ
    // POST і зняти щойно зареєстрований запис (див. коментар над
    // `flushPendingUnregister`). `local?.token` виключає з дожимання САМЕ
    // той токен, який ця функція от-от (пере)зареєструє.
    await flushPendingUnregister(local?.token);

    if (!local) return;
    const { token, platform } = local;

    const prev = await loadData<RegisteredPush | null>(REGISTERED_KEY, null);
    if (prev && prev.token === token && prev.userId === userId && prev.workspaceId === workspaceId) {
      return;
    }

    await apiFetch('/push/tokens/', { method: 'POST', body: { token, platform } });
    await saveData(REGISTERED_KEY, { token, userId, workspaceId } satisfies RegisteredPush);
  } catch (e) {
    // Помилку відправки глушимо: контракт покладає ретраї на наступний вхід,
    // а користувача блокувати заради пуша не варто.
    if (__DEV__) console.warn('[push] реєстрація токена не вдалася:', e);
  }
}

/**
 * Реєструє токен ОДРАЗУ, як тільки з'явився дозвіл на нотифікації, не
 * чекаючи наступного холодного старту (контракт §2.8) — раніше токен
 * реєструвався лише при вході/старті, тож користувач, що дозволив
 * нотифікації пізніше (вмикаючи нагадування в Налаштуваннях), не отримував
 * жодних пушів до наступного перезапуску застосунку.
 *
 * Читає кеш користувача напряму з AsyncStorage (не через `useAuth()`) —
 * викликається з `store/notifications.ts`, у якого нема доступу до React-
 * контексту авторизації, і імпорт `store/auth.tsx` звідси замкнув би цикл
 * (`auth.tsx` вже імпортує з `store/push.ts`). Якщо кешу нема (гість) —
 * просто нічого не робимо.
 */
export async function ensurePushTokenRegistered(): Promise<void> {
  try {
    const cached = await loadData<{ id: string } | null>(AUTH_USER_CACHE_KEY, null);
    if (!cached?.id) return;
    await registerPushToken(cached.id, cachedWorkspaceConfig()?.workspaceId ?? '');
  } catch (e) {
    if (__DEV__) console.warn('[push] ensurePushTokenRegistered не вдалося:', e);
  }
}

/**
 * Токен для необов'язкових `push_token`/`push_platform` у тілі
 * `POST /auth/register/` (контракт §2.4) — заявник у режимі «за
 * погодженням» ще не автентифікований, тож звичайний `registerPushToken`
 * (потребує auth-запит `/push/tokens/`) тут не підходить: сервер сам
 * прив'яже токен до `RegistrationRequest` і надішле `registration_decision`
 * напряму, без окремого виклику після approve.
 */
export async function getRegistrationPushToken(): Promise<{ token: string; platform: 'ios' | 'android' } | null> {
  return getLocalPushToken();
}

/** Знімає токен із сервера перед виходом/зміною workspace (контракт §2.3, §2.8). */
export async function unregisterPushToken(): Promise<void> {
  const prev = await loadData<RegisteredPush | null>(REGISTERED_KEY, null);
  await saveData(REGISTERED_KEY, null);
  if (!prev) return;
  try {
    await apiFetch('/push/tokens/', { method: 'DELETE', body: { token: prev.token } });
  } catch (e) {
    // Офлайн вихід (чи мережева помилка посеред нього) — DELETE не дійшов,
    // сервер і далі лінкує токен на щойно вийшлого користувача. Ставимо в
    // чергу на `flushPendingUnregister` (дожимається при наступному
    // `registerPushToken`), а не мовчки забуваємо — інакше стара прив'язка
    // лишалась би, доки хтось інший не увійде на цьому пристрої.
    if (__DEV__) console.warn('[push] зняття токена не вдалося:', e);
    const pending = await loadPendingUnregister();
    if (!pending.some(entry => entry.token === prev.token)) {
      // `getApiBase()` тут — origin workspace, з якого виходимо ЗАРАЗ (він
      // ще активний, `clearWorkspaceConfig()`/`switchWorkspace()` в
      // `store/auth.tsx` перемикають конфіг лише ПІСЛЯ `unregisterPushToken`).
      await saveData(PENDING_UNREGISTER_KEY, [...pending, { token: prev.token, origin: getApiBase() }]);
    }
  }
}

export interface PushPayloadData {
  type?: 'assigned' | 'mentioned' | 'status_changed' | 'project_invite' | 'registration_request' | 'registration_decision';
  workspace_id?: string;
  /** Контракт §7 — присутнє для всіх типів, крім registration_*. */
  project_id?: string | null;
  /** `tasks` для assigned/status_changed; сервер шле `'comments'` для mentioned (§7). */
  collection?: 'tasks' | 'meetings' | 'comments' | null;
  local_id?: string | null;
  /** `ftrackingapp://…` — джерело істини для типу цілі `mentioned` (`utils/pushLink.ts`). */
  url?: string | null;
}

/** `false`, якщо push належить ІНШОМУ workspace, ніж активний зараз (контракт §7). */
export function isForCurrentWorkspace(data: PushPayloadData): boolean {
  const current = cachedWorkspaceConfig()?.workspaceId;
  return !data.workspace_id || !current || data.workspace_id === current;
}

/** Спільна навігація для обох джерел тапу — рантайм і холодний старт. */
function handlePushTap(data: PushPayloadData): void {
  if (!isForCurrentWorkspace(data)) return;
  if (data.type === 'registration_request') {
    router.push('/admin-workspace');
    return;
  }
  if (data.type === 'registration_decision') {
    router.push('/register-pending');
    return;
  }
  const url = pushTapUrl(data);
  if (url) router.push(url as never);
}

/**
 * Обробка тапу по push (контракт §7) — веде в простір ПРОЄКТУ, а не лишає в
 * Особистому: «вхід у проєкт = повна зміна контексту» (план §3) стосується й
 * приходу з пушу так само, як звичайного відкриття проєкту зі списку.
 *
 * `assigned`/`status_changed`/`mentioned` на `tasks` — той самий шлях, що й
 * `openTask` з деталі проєкту (`app/project/[id]/tasks.tsx`): пуш до повного
 * редактора задачі (`(tabs)`) з `?open=`, а той сам визначає
 * `returnToProject` з `task.projectId` і закриється назад у простір проєкту
 * (`app/(tabs)/index.tsx`, ефект біля `returnToProject`) — тут це не
 * дублюється навмисно, з тієї ж причини, що й там: редактор задачі один на
 * застосунок.
 *
 * `mentioned` на `meetings` — пуш просто в екран нарад проєкту з `?open=`:
 * `app/project/[id]/meetings.tsx` сам відкриває аркуш редагування наради з
 * цим id (як і `?open=` на задачах, але без окремого редактора — форма
 * наради живе в самому екрані).
 *
 * Сама побудова маршруту — чиста функція `pushTapUrl` в `utils/pushLink.ts`
 * (юніт-тест без нативних модулів); тут лише виклик роутера.
 *
 * Викликається один раз із кореневого layout; повертає функцію відписки.
 */
export function setupPushInteractionHandlers(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    handlePushTap((response.notification.request.content.data ?? {}) as PushPayloadData);
  });

  // Холодний старт із тапу по пушу: addNotificationResponseReceivedListener
  // ловить лише тапи, що сталися ПОКИ застосунок уже слухав — тап, яким
  // застосунок узагалі запустили (з вимкненого стану), інакше губиться
  // мовчки, і адмін, що тапнув «нова заявка» на закритому застосунку,
  // просто бачив би звичайний запуск без переходу.
  void Notifications.getLastNotificationResponseAsync().then(response => {
    if (response) handlePushTap((response.notification.request.content.data ?? {}) as PushPayloadData);
  }).catch(e => {
    if (__DEV__) console.warn('[push] getLastNotificationResponseAsync не вдався:', e);
  });

  return () => sub.remove();
}
