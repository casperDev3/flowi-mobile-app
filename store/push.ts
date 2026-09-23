/**
 * store/push.ts — реєстрація пристрою для push на сервері (контракт §2.8,
 * docs/specs/notifications-module.md §6.4, §10.1).
 *
 * Пристрій реєструється в `DeviceRegistration` (`POST /notifications/devices/`)
 * разом із версією збірки, мовою й часовим поясом — сервер за версією
 * вирішує, чи слати сюди серверні нагадування (§10.3), а за поясом рахує тихі
 * години. Старий сервер без модуля сповіщень (404) — легасі `POST /push/tokens/`.
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

import {
  type DeviceRegistrationBody,
  deleteDevice,
  fetchNotificationsCapability,
  isModuleMissing,
  markNotificationsRead,
  postDevice,
  resetNotificationCenter,
  saveServerRemindersRecord,
  serverReminderEvents,
} from '@/api/notifications';
import { notificationRoute, type PushLinkData } from '@/utils/pushLink';

import { apiFetch } from './api';
import { CLIENT_VERSION, getApiBase } from './api-config';
import { loadData, saveData } from './storage';
import { cachedWorkspaceConfig } from './workspace';

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

/** Той самий ключ, у який пише `I18nProvider` (`store/i18n.tsx`). */
const LANG_STORAGE_KEY = 'lang_option_v1';

interface RegisteredPush {
  token: string;
  userId: string;
  workspaceId: string;
  /**
   * Куди зареєстровано: `devices` — `DeviceRegistration` (§6.4), `legacy` —
   * старий `/push/tokens/`. Запис без поля — з легасі-збірки: такий пристрій
   * сервер переніс у `DeviceRegistration` без версії, і серверних нагадувань
   * на нього не шле, доки клієнт не перереєструється з `app_version`.
   */
  endpoint?: 'devices' | 'legacy';
  appVersion?: string;
  lang?: string;
  timezone?: string;
}

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function deviceName(): string {
  try {
    return String(Device.deviceName || Device.modelName || '').slice(0, 100);
  } catch {
    return '';
  }
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
      await removeDeviceOnServer(entry.token);
    } catch (e) {
      if (__DEV__) console.warn('[push] відкладене зняття токена не вдалося:', e);
      remaining.push(entry);
    }
  }
  if (remaining.length !== pending.length) await saveData(PENDING_UNREGISTER_KEY, remaining);
}

/**
 * `DELETE /notifications/devices/`; на сервері без модуля — легасі
 * `/push/tokens/`. Новий ендпоінт знімає і легасі-рядок `PushToken`.
 */
async function removeDeviceOnServer(token: string): Promise<void> {
  try {
    await deleteDevice(token);
  } catch (e) {
    if (!isModuleMissing(e)) throw e;
    await apiFetch('/push/tokens/', { method: 'DELETE', body: { token } });
  }
}

/**
 * Які нагадування вже шле сервер — рішення для `store/notifications.ts`
 * (§10.3). Пишеться лише для пристрою, зареєстрованого в `DeviceRegistration`
 * з версією збірки: інакше сервер фізично не надішле сюди нагадування, і
 * локальне лишається єдиним. Мережева помилка рішення НЕ змінює — вчорашнє
 * рішення надійніше за «не знаю».
 */
async function syncServerReminders(userId: string, deviceRegistered: boolean): Promise<void> {
  if (!deviceRegistered) {
    await saveServerRemindersRecord(null);
    return;
  }
  try {
    const capability = await fetchNotificationsCapability();
    const events = serverReminderEvents({ capability, appVersion: CLIENT_VERSION, deviceRegistered });
    await saveServerRemindersRecord(events.length ? {
      origin: getApiBase(),
      userId,
      events,
      appVersion: CLIENT_VERSION,
      at: new Date().toISOString(),
    } : null);
  } catch (e) {
    if (__DEV__) console.warn('[push] можливості сповіщень не прочитались:', e);
  }
}

/**
 * Реєструє пристрій на сервері після входу/старту (контракт §2.8, модуль
 * сповіщень §6.4) — ідемпотентно: якщо токен/користувач/workspace, версія
 * збірки, мова й пояс не змінились із минулого разу, повторний POST не
 * робиться. Можливості сервера (`server_reminders`) перечитуються щоразу —
 * сервер міг почати слати нове нагадування.
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

    if (!local) {
      await syncServerReminders(userId, false);
      return;
    }
    const { token, platform } = local;
    const lang = (await loadData<string>(LANG_STORAGE_KEY, 'uk')) === 'en' ? 'en' : 'uk';
    const timezone = deviceTimezone();

    const prev = await loadData<RegisteredPush | null>(REGISTERED_KEY, null);
    const unchanged = !!prev && prev.token === token && prev.userId === userId && prev.workspaceId === workspaceId
      && prev.endpoint === 'devices' && prev.appVersion === CLIENT_VERSION
      && prev.lang === lang && prev.timezone === timezone;
    if (unchanged) {
      await syncServerReminders(userId, true);
      return;
    }
    // Той самий токен, але зареєстрований на ЛЕГАСІ-ендпоінті сервера без
    // модуля, — не повторюємо даремний POST на кожному старті.
    if (prev && prev.endpoint === 'legacy' && prev.token === token && prev.userId === userId
      && prev.workspaceId === workspaceId && prev.appVersion === CLIENT_VERSION) {
      return;
    }

    const body: DeviceRegistrationBody = {
      kind: 'expo',
      token,
      platform,
      device_name: deviceName(),
      app_version: CLIENT_VERSION,
      lang,
      timezone,
    };
    let endpoint: 'devices' | 'legacy' = 'devices';
    try {
      await postDevice(body);
    } catch (e) {
      if (!isModuleMissing(e)) throw e;
      endpoint = 'legacy';
      await apiFetch('/push/tokens/', { method: 'POST', body: { token, platform } });
    }
    await saveData(REGISTERED_KEY, {
      token, userId, workspaceId, endpoint, appVersion: CLIENT_VERSION, lang, timezone,
    } satisfies RegisteredPush);
    await syncServerReminders(userId, endpoint === 'devices');
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

/**
 * Знімає пристрій із сервера перед виходом/зміною workspace (контракт §2.3,
 * §2.8) і прибирає все, що належало цьому акаунту в центрі сповіщень: кеш
 * інбоксу, налаштувань і рішення «нагадування шле сервер» — після виходу
 * локальні нагадування знову плануються як раніше.
 */
export async function unregisterPushToken(): Promise<void> {
  const prev = await loadData<RegisteredPush | null>(REGISTERED_KEY, null);
  await saveData(REGISTERED_KEY, null);
  try {
    await resetNotificationCenter();
  } catch (e) {
    if (__DEV__) console.warn('[push] кеш центру сповіщень не очистився:', e);
  }
  if (!prev) return;
  try {
    await removeDeviceOnServer(prev.token);
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

/**
 * `data` push-сповіщення. Легасі-поля (`type`, `project_id`, `collection`,
 * `local_id`, `url`) сервер модуля сповіщень лишає як були
 * (`channels/expo.py::build_message`), нові — `event_type`, `notification_id`.
 */
export interface PushPayloadData extends PushLinkData {
  workspace_id?: string;
  request_id?: string | null;
}

/** `false`, якщо push належить ІНШОМУ workspace, ніж активний зараз (контракт §7). */
export function isForCurrentWorkspace(data: PushPayloadData): boolean {
  const current = cachedWorkspaceConfig()?.workspaceId;
  return !data.workspace_id || !current || data.workspace_id === current;
}

/** Спільна навігація для обох джерел тапу — рантайм і холодний старт. */
function handlePushTap(data: PushPayloadData): void {
  if (!isForCurrentWorkspace(data)) return;
  // Відкрив пуш — отже, побачив: запис інбоксу стає прочитаним і на інших
  // пристроях (сервер розішле `notifications_changed`).
  if (data.notification_id) void markNotificationsRead([data.notification_id]).catch(() => {});
  if (data.type === 'registration_request') {
    router.push('/admin-workspace');
    return;
  }
  if (data.type === 'registration_decision') {
    router.push('/register-pending');
    return;
  }
  const url = notificationRoute(data);
  if (url) {
    router.push(url as never);
    return;
  }
  // Подія без власного екрана (системна, чи ціль невідома цій збірці) —
  // хоча б центр сповіщень, де видно її текст.
  if (data.event_type) router.push('/notifications' as never);
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
