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
 *
 * rc1 (docs/release-rc1/push.md): сервер шле пуш НАПРЯМУ через FCM HTTP v1
 * та APNs, тож реєструємо НАТИВНИЙ токен пристрою (`getDevicePushTokenAsync`):
 * `{kind:'apns'|'fcm', token, platform, app_version, bundle_id}`. Токен ОС
 * може змінитись (перевстановлення, відновлення з бекапу, ротація FCM) —
 * `addPushTokenListener` перереєструє його з `previous_token`. Сервер без
 * нативного каналу (N-1, 400 на `kind`) — запасний шлях через Expo-токен.
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
import { canonicalCloudOrigin, CLIENT_VERSION, getApiBase } from './api-config';
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

/** Перереєстровуємо незмінний токен раз на тиждень: оновлює `last_seen_at` і
 * знову вмикає пристрій, який сервер вимкнув після помилки провайдера. */
const REREGISTER_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export type PushDeviceKind = 'expo' | 'fcm' | 'apns';

/** Тіло `POST /notifications/devices/` для нативного токена (rc1). */
export interface NativeDeviceRegistrationBody {
  kind: 'fcm' | 'apns';
  token: string;
  platform: 'ios' | 'android';
  app_version: string;
  bundle_id?: string;
  device_name?: string;
  lang?: string;
  timezone?: string;
  previous_token?: string;
}

interface LocalPushToken {
  kind: PushDeviceKind;
  token: string;
  platform: 'ios' | 'android';
}

interface RegisteredPush {
  token: string;
  /** Відсутнє в записах до rc1 — це був Expo-токен. */
  kind?: PushDeviceKind;
  /** ISO-час останнього успішного POST. */
  at?: string;
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

function bundleId(): string {
  const config = Constants.expoConfig as { ios?: { bundleIdentifier?: string }; android?: { package?: string } } | null;
  const value = Platform.OS === 'ios' ? config?.ios?.bundleIdentifier : config?.android?.package;
  return String(value || '');
}

/**
 * Нативний токен ОС (APNs hex на iOS, FCM registration token на Android) —
 * саме його сервер rc1 використовує для прямої відправки. Дозволу тут не
 * просимо (шапка файлу).
 */
export async function getNativePushToken(): Promise<LocalPushToken | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return null;
    const result = await Notifications.getDevicePushTokenAsync();
    return nativeTokenFrom(result);
  } catch (e) {
    if (__DEV__) console.warn('[push] нативний токен не отримано:', e);
    return null;
  }
}

/** `DevicePushToken` → форма для сервера; `null` — невідомий тип токена. */
export function nativeTokenFrom(result: { type?: string; data?: unknown } | null | undefined): LocalPushToken | null {
  const token = typeof result?.data === 'string' ? result.data.trim() : '';
  if (!token) return null;
  if (result?.type === 'ios') return { kind: 'apns', token, platform: 'ios' };
  if (result?.type === 'android') return { kind: 'fcm', token, platform: 'android' };
  return null;
}

/** Сервер до rc1 не знає `kind: 'fcm'|'apns'` і відповідає 400 саме на це поле. */
function isNativeKindRejected(error: unknown): boolean {
  const err = error as { status?: unknown; details?: { fields?: Record<string, unknown> } & Record<string, unknown> } | null;
  if (err?.status !== 400) return false;
  const fields = (err.details?.fields ?? err.details) as Record<string, unknown> | undefined;
  return !!fields && Object.prototype.hasOwnProperty.call(fields, 'kind');
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

/** `{origin}/api` з легасі-хостом Flowi Cloud, переведеним на новий. */
function canonicalApiBase(apiBase: string): string {
  const base = String(apiBase || '').replace(/\/+$/, '');
  if (!/\/api$/i.test(base)) return base;
  return `${canonicalCloudOrigin(base.replace(/\/api$/i, ''))}/api`;
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
  const activeOrigin = canonicalApiBase(getApiBase());
  const remaining: PendingUnregisterEntry[] = [];
  for (const entry of pending) {
    // rc1: запис, поставлений у чергу на легасі-хості Flowi Cloud, належить
    // тому самому серверу — порівнюємо канонічні адреси.
    if (entry.token === skipToken || canonicalApiBase(entry.origin) !== activeOrigin) {
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
export async function registerPushToken(
  userId: string,
  workspaceId: string,
  opts: { refreshedToken?: LocalPushToken } = {},
): Promise<void> {
  try {
    const native = opts.refreshedToken ?? await getNativePushToken();

    // `await`, а не `void` (мінор із ревʼю): DELETE і POST нижче — той самий
    // токен пристрою; без очікування DELETE може дістатись сервера ПІСЛЯ
    // POST і зняти щойно зареєстрований запис (див. коментар над
    // `flushPendingUnregister`). `native?.token` виключає з дожимання САМЕ
    // той токен, який ця функція от-от (пере)зареєструє.
    await flushPendingUnregister(native?.token);

    if (!native) {
      await syncServerReminders(userId, false);
      return;
    }
    const lang = (await loadData<string>(LANG_STORAGE_KEY, 'uk')) === 'en' ? 'en' : 'uk';
    const timezone = deviceTimezone();

    const prev = await loadData<RegisteredPush | null>(REGISTERED_KEY, null);
    const fresh = !!prev?.at && Date.now() - Date.parse(prev.at) < REREGISTER_AFTER_MS;
    const unchanged = !!prev && prev.token === native.token && prev.kind === native.kind
      && prev.userId === userId && prev.workspaceId === workspaceId
      && prev.endpoint === 'devices' && prev.appVersion === CLIENT_VERSION
      && prev.lang === lang && prev.timezone === timezone && fresh;
    if (unchanged) {
      await syncServerReminders(userId, true);
      return;
    }

    // Той самий користувач і workspace, але інший нативний токен — сервер
    // прибере старий рядок (інакше два токени одного телефона = подвійний пуш).
    const previousToken = prev && prev.userId === userId && prev.workspaceId === workspaceId
      && prev.kind === native.kind && prev.token !== native.token ? prev.token : undefined;

    const body: NativeDeviceRegistrationBody = {
      kind: native.kind as 'fcm' | 'apns',
      token: native.token,
      platform: native.platform,
      app_version: CLIENT_VERSION,
      device_name: deviceName(),
      lang,
      timezone,
    };
    const bundle = bundleId();
    if (bundle) body.bundle_id = bundle;
    if (previousToken) body.previous_token = previousToken;

    let registered: { token: string; kind: PushDeviceKind; endpoint: 'devices' | 'legacy' };
    try {
      await apiFetch('/notifications/devices/', { method: 'POST', body });
      registered = { token: native.token, kind: native.kind, endpoint: 'devices' };
    } catch (e) {
      if (!isNativeKindRejected(e) && !isModuleMissing(e)) throw e;
      // Сервер N-1 без нативного каналу — Expo-токен, як до rc1.
      const fallback = await registerExpoFallback(lang, timezone);
      if (!fallback) {
        await syncServerReminders(userId, false);
        return;
      }
      registered = fallback;
    }
    await saveData(REGISTERED_KEY, {
      token: registered.token,
      kind: registered.kind,
      userId,
      workspaceId,
      endpoint: registered.endpoint,
      appVersion: CLIENT_VERSION,
      lang,
      timezone,
      at: new Date().toISOString(),
    } satisfies RegisteredPush);
    await syncServerReminders(userId, registered.endpoint === 'devices');
  } catch (e) {
    // Помилку відправки глушимо: контракт покладає ретраї на наступний вхід,
    // а користувача блокувати заради пуша не варто.
    if (__DEV__) console.warn('[push] реєстрація токена не вдалася:', e);
  }
}

/** Реєстрація Expo-токена на сервері без нативного каналу (до rc1). */
async function registerExpoFallback(
  lang: string,
  timezone: string,
): Promise<{ token: string; kind: PushDeviceKind; endpoint: 'devices' | 'legacy' } | null> {
  const local = await getLocalPushToken();
  if (!local) return null;
  const body: DeviceRegistrationBody = {
    kind: 'expo',
    token: local.token,
    platform: local.platform,
    device_name: deviceName(),
    app_version: CLIENT_VERSION,
    lang,
    timezone,
  };
  try {
    await postDevice(body);
    return { token: local.token, kind: 'expo', endpoint: 'devices' };
  } catch (e) {
    if (!isModuleMissing(e)) throw e;
    await apiFetch('/push/tokens/', { method: 'POST', body: { token: local.token, platform: local.platform } });
    return { token: local.token, kind: 'expo', endpoint: 'legacy' };
  }
}

/**
 * Токен ОС змінився, поки застосунок працює (`addPushTokenListener`) —
 * перереєструємо одразу, з `previous_token`, не чекаючи холодного старту.
 */
async function handleNativeTokenChange(result: { type?: string; data?: unknown }): Promise<void> {
  const refreshed = nativeTokenFrom(result);
  if (!refreshed) return;
  const cached = await loadData<{ id: string } | null>(AUTH_USER_CACHE_KEY, null);
  if (!cached?.id) return;
  await registerPushToken(cached.id, cachedWorkspaceConfig()?.workspaceId ?? '', { refreshedToken: refreshed });
}

/** Підписка на оновлення нативного токена. Повертає відписку. */
export function setupPushTokenRefresh(): () => void {
  try {
    const sub = Notifications.addPushTokenListener(token => {
      void handleNativeTokenChange(token as { type?: string; data?: unknown }).catch(e => {
        if (__DEV__) console.warn('[push] оновлення токена не вдалося:', e);
      });
    });
    return () => sub.remove();
  } catch (e) {
    if (__DEV__) console.warn('[push] addPushTokenListener недоступний:', e);
    return () => {};
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

/** Токен заявника для `POST /auth/register/` (контракт §2.4, rc1). */
export interface RegistrationPushToken {
  kind: 'fcm' | 'apns';
  token: string;
  platform: 'ios' | 'android';
}

/**
 * Токен для необов'язкових `push_kind`/`push_token`/`push_platform` у тілі
 * `POST /auth/register/` (контракт §2.4) — заявник у режимі «за
 * погодженням» ще не автентифікований, тож звичайний `registerPushToken`
 * (потребує auth-запит `/notifications/devices/`) тут не підходить: сервер сам
 * прив'яже токен до `RegistrationRequest` і надішле `registration_decision`
 * напряму, без окремого виклику після approve.
 *
 * rc1 (docs/release-rc1/push.md): НАТИВНИЙ токен ОС (`getDevicePushTokenAsync`
 * — APNs на iOS, FCM на Android) + `kind`, без EAS projectId. Сервер rc1 шле
 * рішення через FCM v1/APNs; Expo-токен у `push_token` без `push_kind` — це
 * легасі-форма клієнтів до rc1, і сервер трактує її як Expo.
 */
export async function getRegistrationPushToken(): Promise<RegistrationPushToken | null> {
  const native = await getNativePushToken();
  if (!native || native.kind === 'expo') return null;
  return { kind: native.kind, token: native.token, platform: native.platform };
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
 * `assigned`/`status_changed`/`mentioned` на `tasks` — картка задачі В
 * ПРОСТОРІ ПРОЄКТУ: `/project/{pid}/tasks?open=` (екран «Завдання» проєкту сам
 * відкриває картку). Особистий редактор (`(tabs)?open=`) сюди більше не
 * задіяний — людина лишається в проєкті.
 *
 * `mentioned` на `meetings` — у календар проєкту з `?open=`
 * (`app/project/[id]/calendar.tsx` сам відкриває деталь наради).
 *
 * Сама побудова маршруту — чиста функція `pushTapUrl` в `utils/pushLink.ts`
 * (юніт-тест без нативних модулів); тут лише виклик роутера.
 *
 * Викликається один раз із кореневого layout; повертає функцію відписки.
 */
export function setupPushInteractionHandlers(): () => void {
  // Оновлення нативного токена слухаємо з того самого кореневого layout —
  // окремого виклику в `app/_layout.tsx` не потрібно.
  const stopTokenRefresh = setupPushTokenRefresh();
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

  return () => {
    sub.remove();
    stopTokenRefresh();
  };
}
