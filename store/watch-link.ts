/**
 * store/watch-link.ts — телефонна сторона протоколу з Apple Watch
 * (docs/specs/watch-lockscreen-v1.md §6).
 *
 * Годинник не має ні входу, ні синку. Телефон:
 *   • штовхає йому знімок дня через applicationContext (дебаунс 2 с, лише
 *     коли годинник спарено і Flowi на ньому встановлено);
 *   • приймає дії (`actions`) і застосовує їх як користувач у застосунку,
 *     відповідаючи `ack` ЛИШЕ після запису в сховище — без відповіді за 3 с
 *     годинник шле ту саму дію на сервер;
 *   • видає годиннику ОКРЕМУ сесію (kind=watch) — POST /auth/watch-session/
 *     — і передає токени через transferUserInfo. Самі токени телефон не
 *     зберігає: у `watch_link_v1` лише id годинника і сесії;
 *   • на вихід / зміну workspace завершує сесію годинника і каже йому
 *     «signout» (best-effort, вихід ніколи не чекає на годинник).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import * as IosBridge from '@/modules/flowi-ios-bridge';
import type { WatchState } from '@/modules/flowi-ios-bridge';
import type { DeviceAction } from '@/utils/deviceActions';
import { uuidV4 } from '@/utils/uuid';
import {
  buildWatchSnapshot,
  deviceTimeZone,
  type WatchTodaySnapshot,
} from '@/utils/watchSnapshot';
import { widgetRoleMap } from '@/utils/widgetSnapshot';

import { getApiBase } from './api-config';
import { isOnlineMode } from './app-mode';
import { useAuth } from './auth';
import { applyDeviceActions } from './device-actions';
import { useI18n } from './i18n';
import { provisionWatchSession, revokeSession } from './sessions-api';
import { loadData, removeData, saveData, subscribeToStorage } from './storage';

export const WATCH_LINK_KEY = 'watch_link_v1';
export const WATCH_DEVICE_NAME = 'Apple Watch';
const CONTEXT_DEBOUNCE_MS = 2000;
/** Не провіжнити той самий годинник частіше — `hello` може прийти пачкою. */
const PROVISION_COOLDOWN_MS = 30_000;
/** Вихід не чекає на сервер довше за це. */
const TEARDOWN_TIMEOUT_MS = 4000;

/** Ключі, від яких залежить знімок годинника (§11.2). */
export const WATCH_SNAPSHOT_KEYS = [
  'tasks',
  'task_statuses',
  'active_timers',
  'time_entries',
  'transactions',
  'accounts',
  'categories',
  'finance_currencies',
  'health_habits',
  'meetings',
  'project_sync_state_v1',
  'workspace_projects',
  'lang_option_v1',
] as const;

export type WatchLinkState = 'connected' | 'revoked' | 'none';

export interface WatchLink {
  watchId: string;
  sessionId: string | null;
  provisionedAt: string | null;
  state: WatchLinkState;
}

export interface WatchSession {
  authed: boolean;
  userId: string | null;
  userName: string;
  lang: 'uk' | 'en';
}

// ─── Стан зв'язку ────────────────────────────────────────────────────────────

type LinkListener = (link: WatchLink | null) => void;
const linkListeners = new Set<LinkListener>();

export function parseWatchLink(raw: unknown): WatchLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.watchId !== 'string' || !r.watchId) return null;
  const state: WatchLinkState = r.state === 'connected' || r.state === 'revoked' ? r.state : 'none';
  return {
    watchId: r.watchId,
    sessionId: typeof r.sessionId === 'string' && r.sessionId ? r.sessionId : null,
    provisionedAt: typeof r.provisionedAt === 'string' ? r.provisionedAt : null,
    state,
  };
}

export async function readWatchLink(): Promise<WatchLink | null> {
  return parseWatchLink(await loadData<unknown>(WATCH_LINK_KEY, null));
}

async function writeWatchLink(link: WatchLink | null): Promise<void> {
  if (link) await saveData(WATCH_LINK_KEY, link);
  else await removeData(WATCH_LINK_KEY);
  for (const listener of [...linkListeners]) listener(link);
}

export function subscribeWatchLink(listener: LinkListener): () => void {
  linkListeners.add(listener);
  return () => { linkListeners.delete(listener); };
}

// ─── Знімок ──────────────────────────────────────────────────────────────────

/** Зібрати сховище й порахувати знімок дня для годинника (§4). */
export async function computeWatchSnapshot(session: WatchSession, now: Date = new Date()): Promise<WatchTodaySnapshot> {
  const [
    tasks, taskStatuses, activeTimers, timeEntries, transactions, accounts, categories,
    currencies, habits, meetings, syncState, summaries, projects, lang,
  ] = await Promise.all([
    loadData<unknown>('tasks', []),
    loadData<unknown>('task_statuses', []),
    loadData<unknown>('active_timers', []),
    loadData<unknown>('time_entries', []),
    loadData<unknown>('transactions', []),
    loadData<unknown>('accounts', []),
    loadData<unknown>('categories', []),
    loadData<unknown>('finance_currencies', []),
    loadData<unknown>('health_habits', []),
    loadData<unknown>('meetings', []),
    loadData<unknown>('project_sync_state_v1', {}),
    loadData<unknown>('workspace_projects', []),
    loadData<unknown>('projects', []),
    loadData<unknown>('lang_option_v1', session.lang),
  ]);
  return buildWatchSnapshot({
    now,
    tz: deviceTimeZone(),
    lang,
    user: { id: session.userId ?? '', name: session.userName },
    myUserId: session.userId ?? undefined,
    projectRoles: widgetRoleMap(syncState, summaries),
    projects: [
      ...(Array.isArray(summaries) ? summaries : []),
      ...(Array.isArray(projects) ? projects : []),
    ],
    tasks, taskStatuses, activeTimers, timeEntries, transactions, accounts, categories,
    currencies, habits, meetings,
  });
}

// ─── Контекст годинника ──────────────────────────────────────────────────────

function isIos(): boolean {
  return Platform.OS === 'ios';
}

function watchReady(state: WatchState): boolean {
  return state.supported && state.paired && state.installed;
}

let lastContextSignature: string | null = null;

/** Для тестів: скинути пам'ять про останній контекст. */
export function __resetWatchLinkForTests(): void {
  lastContextSignature = null;
  lastProvision = null;
  provisioning = null;
}

/**
 * Записати applicationContext (§6.3). Без годинника — нічого; той самий вміст
 * (без `generatedAt`) — нічого: WatchConnectivity і так тримає останній.
 */
export async function pushWatchContext(session: WatchSession, now: Date = new Date()): Promise<boolean> {
  if (!isIos() || !watchReady(IosBridge.getWatchState())) return false;
  const base = { v: '1', lang: session.lang, apiBase: getApiBase() };
  let ctx: Record<string, string>;
  let signature: string;
  // Годинник відкликано (тут чи у вебі) — даних йому більше не даємо, доки
  // людина не натисне «Підключити знову» (provisionWatch з force).
  const revoked = (await readWatchLink())?.state === 'revoked';
  if (revoked) {
    ctx = { ...base, authed: '0', userId: '', reason: 'revoked' };
    signature = JSON.stringify([base, 'revoked']);
  } else if (session.authed && session.userId) {
    const snapshot = await computeWatchSnapshot(session, now);
    const { generatedAt: _ignored, ...stable } = snapshot;
    ctx = { ...base, authed: '1', userId: session.userId, snapshot: JSON.stringify(snapshot) };
    signature = JSON.stringify([base, session.userId, stable]);
  } else {
    ctx = { ...base, authed: '0', userId: '' };
    signature = JSON.stringify([base, 'signed-out']);
  }
  if (signature === lastContextSignature) return false;
  IosBridge.updateWatchContext(ctx);
  lastContextSignature = signature;
  return true;
}

// ─── Видача сесії годиннику (§6.4) ───────────────────────────────────────────

let provisioning: Promise<WatchLink | null> | null = null;
let lastProvision: { watchId: string; at: number } | null = null;

/**
 * POST /auth/watch-session/ → токени годиннику (transferUserInfo, а коли він
 * досяжний — ще й sendMessage). `force` — ручне «Підключити» з екрана
 * «Пристрої»: не зважає на паузу між спробами.
 */
export async function provisionWatch(
  session: WatchSession,
  options: { watchId?: string; force?: boolean } = {},
): Promise<WatchLink | null> {
  if (!isIos() || !session.authed || !session.userId) return null;
  if (provisioning) return provisioning;
  provisioning = (async () => {
    const stored = await readWatchLink();
    // Годинник ще не представився (`hello` не було) — id видає телефон;
    // годинник прийме токени й наступним `hello` назве власний id.
    const watchId = options.watchId ?? stored?.watchId ?? uuidV4();
    const now = Date.now();
    if (!options.force && lastProvision?.watchId === watchId && now - lastProvision.at < PROVISION_COOLDOWN_MS) {
      return stored;
    }
    lastProvision = { watchId, at: now };
    const out = await provisionWatchSession(watchId, WATCH_DEVICE_NAME);
    const body = JSON.stringify({
      access: out.access,
      refresh: out.refresh,
      sessionId: out.session.id,
      apiBase: getApiBase(),
      userId: session.userId,
      lang: session.lang,
      issuedAt: new Date(now).toISOString(),
    });
    IosBridge.transferToWatch({ t: 'auth', body });
    if (IosBridge.getWatchState().reachable) IosBridge.sendToWatch({ t: 'auth', body });
    const link: WatchLink = {
      watchId,
      sessionId: out.session.id,
      provisionedAt: new Date(now).toISOString(),
      state: 'connected',
    };
    await writeWatchLink(link);
    lastContextSignature = null;
    void pushWatchContext(session).catch(() => undefined);
    return link;
  })().finally(() => { provisioning = null; });
  return provisioning;
}

export interface WatchHello {
  watchId: string;
  appVersion?: string;
  hasToken: boolean;
  sessionId: string | null;
  reason: 'none' | 'revoked' | 'expired' | 'user_mismatch';
}

export function parseHello(body: unknown): WatchHello | null {
  let raw = body;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.watchId !== 'string' || !r.watchId) return null;
  const reason = r.reason === 'revoked' || r.reason === 'expired' || r.reason === 'user_mismatch' ? r.reason : 'none';
  return {
    watchId: r.watchId,
    appVersion: typeof r.appVersion === 'string' ? r.appVersion : undefined,
    hasToken: r.hasToken === true || r.hasToken === 'true',
    sessionId: typeof r.sessionId === 'string' && r.sessionId ? r.sessionId : null,
    reason,
  };
}

/** `hello` від годинника (§6.4): оновити зв'язок і, якщо треба, видати токени. */
export async function handleWatchHello(hello: WatchHello, session: WatchSession): Promise<void> {
  const stored = await readWatchLink();
  // Відкликаний годинник ще не отримав `signout` і хвалиться старим токеном —
  // не повертати йому «Підключено» (екран «Пристрої»): лише ручне «Підключити знову».
  if (hello.hasToken && stored?.state === 'revoked' && stored.watchId === hello.watchId) return;
  if (hello.hasToken) {
    if (hello.sessionId && (stored?.sessionId !== hello.sessionId || stored.state !== 'connected'
      || stored.watchId !== hello.watchId)) {
      await writeWatchLink({
        watchId: hello.watchId,
        sessionId: hello.sessionId,
        provisionedAt: stored?.sessionId === hello.sessionId ? stored.provisionedAt : null,
        state: 'connected',
      });
    }
    return;
  }
  if (hello.reason === 'revoked') {
    // Сесію завершили свідомо (тут або у вебі) — повертає її лише «Підключити знову».
    await writeWatchLink({
      watchId: hello.watchId,
      sessionId: null,
      provisionedAt: stored?.provisionedAt ?? null,
      state: 'revoked',
    });
    return;
  }
  // Цей годинник уже відкликали (тут або у вебі): навіть якщо він після
  // `signout` представився з reason none/expired — без авто-видачі, лише
  // ручне «Підключити знову» (provisionWatch з force).
  if (stored?.state === 'revoked' && stored.watchId === hello.watchId) return;
  if (!session.authed || !isOnlineMode()) {
    if (!stored || stored.watchId !== hello.watchId) {
      await writeWatchLink({ watchId: hello.watchId, sessionId: null, provisionedAt: null, state: 'none' });
    }
    return;
  }
  await provisionWatch(session, { watchId: hello.watchId });
}

/** Сесію годинника завершено з екрана «Пристрої» — сказати йому й запам'ятати. */
export async function markWatchRevoked(sessionId: string): Promise<void> {
  const stored = await readWatchLink();
  if (!stored || stored.sessionId !== sessionId) return;
  await writeWatchLink({ ...stored, sessionId: null, state: 'revoked' });
  if (isIos()) IosBridge.transferToWatch({ t: 'signout', body: JSON.stringify({ reason: 'revoked' }) });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Вихід / зміна workspace (§6.4): DELETE сесії годинника (поки токени
 * телефона ще живі) → `signout` → контекст `authed: "0"` → стерти
 * `watch_link_v1`. Нічого не кидає й не тримає вихід довше за кілька секунд.
 */
export async function teardownWatchLink(reason: 'logout' | 'workspace_switch'): Promise<void> {
  try {
    const link = await readWatchLink();
    const lang = (await loadData<unknown>('lang_option_v1', 'uk')) === 'en' ? 'en' : 'uk';
    if (link?.sessionId && isOnlineMode()) {
      await withTimeout(revokeSession(link.sessionId).catch(e => {
        if (__DEV__) console.warn('[watch] сесію годинника не завершено:', e);
      }), TEARDOWN_TIMEOUT_MS);
    }
    if (isIos()) {
      IosBridge.transferToWatch({ t: 'signout', body: JSON.stringify({ reason }) });
      IosBridge.updateWatchContext({ v: '1', authed: '0', userId: '', lang, apiBase: getApiBase() });
    }
    lastContextSignature = null;
    if (link) await writeWatchLink(null);
  } catch (e) {
    if (__DEV__) console.warn('[watch] teardown не вдався:', e);
  }
}

// ─── Повідомлення годинника (§6.1) ───────────────────────────────────────────

function parseBody(body: string | undefined): Record<string, unknown> | null {
  if (!body) return {};
  try {
    const raw = JSON.parse(body);
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const REVOKED_REPLY: Record<string, string> = { t: 'signedOut', body: JSON.stringify({ reason: 'revoked' }) };

/**
 * Годинник, від якого прийшло повідомлення, відкликано. Без `watchId` (стара
 * збірка годинника) — так само відкликано: на телефоні один годинник.
 */
async function isRevokedWatch(watchId: unknown): Promise<boolean> {
  const link = await readWatchLink();
  if (link?.state !== 'revoked') return false;
  return typeof watchId !== 'string' || !watchId || watchId === link.watchId;
}

/**
 * Відповідь на повідомлення годинника, або null — не відповідати (тоді
 * годинник за 3 с піде на сервер). Окремо від хука — щоб тестувати.
 */
export async function answerWatchMessage(
  message: Record<string, string>,
  session: WatchSession,
): Promise<Record<string, string> | null> {
  const body = parseBody(message.body);
  switch (message.t) {
    case 'actions': {
      // Без входу дію нікуди писати — нехай годинник іде на сервер сам.
      if (!session.authed || !session.userId || !body) return null;
      // Відкликаний годинник: ні дій, ні знімка — лише «вийшли».
      if (await isRevokedWatch(body.watchId)) return REVOKED_REPLY;
      // Черга без власника або іншого акаунта (телефон перемкнули, а `signout`
      // ще не дійшов) — не писати її в ці дані; годинник піде на сервер сам,
      // а сервер знає, чий у нього токен.
      if (typeof body.userId !== 'string' || !body.userId || body.userId !== session.userId) return null;
      const actions = Array.isArray(body.actions) ? (body.actions as DeviceAction[]).slice(0, 20) : [];
      const results = await applyDeviceActions(actions);
      let snapshot: WatchTodaySnapshot | null = null;
      try {
        snapshot = await computeWatchSnapshot(session);
      } catch (e) {
        if (__DEV__) console.warn('[watch] знімок після дій не пораховано:', e);
      }
      return { t: 'ack', body: JSON.stringify({ results, snapshot }) };
    }
    case 'snapshotRequest': {
      if (!session.authed || !session.userId) return { t: 'signedOut' };
      if (await isRevokedWatch(body?.watchId)) return REVOKED_REPLY;
      const snapshot = await computeWatchSnapshot(session);
      return { t: 'snapshot', body: JSON.stringify(snapshot) };
    }
    case 'hello':
      return { t: 'ok' };
    default:
      return null;
  }
}

// ─── Хук ─────────────────────────────────────────────────────────────────────

/** Монтується один раз (components/shared/DeviceSurfaces.tsx). Поза iOS — no-op. */
export function useWatchLink(): void {
  const { status, user } = useAuth();
  const { lang } = useI18n();
  const authed = status === 'authed';
  const userId = user?.id === undefined || user?.id === null ? null : String(user.id);
  const sessionRef = useRef<WatchSession>({ authed, userId, userName: user?.name ?? '', lang });
  sessionRef.current = { authed, userId, userName: user?.name ?? '', lang };

  // Повідомлення й userInfo — з першого рендера: нативна сторона тримає
  // відповідь лише 2.5 с, і `hello` після холодного старту не має чекати входу.
  useEffect(() => {
    if (!isIos()) return;
    const onHello = (body: unknown) => {
      const hello = parseHello(body);
      if (!hello) return;
      void handleWatchHello(hello, sessionRef.current).catch(e => {
        if (__DEV__) console.warn('[watch] hello не оброблено:', e);
      });
    };
    const messages = IosBridge.addWatchMessageListener(({ requestId, message }) => {
      void answerWatchMessage(message, sessionRef.current)
        .then(reply => { if (reply && requestId) IosBridge.replyToWatch(requestId, reply); })
        .catch(e => { if (__DEV__) console.warn('[watch] повідомлення не оброблено:', e); });
      if (message.t === 'hello') onHello(message.body);
    });
    const userInfo = IosBridge.addWatchUserInfoListener(({ info }) => {
      if (info.t === 'hello') onHello(info.body);
    });
    return () => {
      messages.remove();
      userInfo.remove();
    };
  }, []);

  // Контекст: на старті, при зміні входу/мови, при змінах ключів-джерел
  // (дебаунс 2 с), при поверненні застосунку і коли годинник став доступним.
  useEffect(() => {
    if (!isIos() || status === 'loading') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const flush = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (cancelled) return;
      void pushWatchContext(sessionRef.current).catch(e => {
        if (__DEV__) console.warn('[watch] контекст не записано:', e);
      });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, CONTEXT_DEBOUNCE_MS);
    };
    flush();
    // + зв'язок: відкликання з «Пристроїв» має одразу забрати дані з годинника.
    const keys: readonly string[] = [...WATCH_SNAPSHOT_KEYS, WATCH_LINK_KEY];
    const unsubscribe = subscribeToStorage(key => { if (keys.includes(key)) schedule(); });
    const appState = AppState.addEventListener('change', state => { if (state === 'active') schedule(); });
    const watchState = IosBridge.addWatchStateListener(state => {
      if (watchReady(state)) { lastContextSignature = null; schedule(); }
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      appState.remove();
      watchState.remove();
    };
  }, [status, authed, userId, lang]);
}

/** Стан для екрана «Пристрої»: годинник, зв'язок, «Підключити». */
export function useWatchLinkState(): {
  watch: WatchState;
  link: WatchLink | null;
  busy: boolean;
  error: boolean;
  connect: () => Promise<void>;
} {
  const { status, user } = useAuth();
  const { lang } = useI18n();
  const [watch, setWatch] = useState<WatchState>(() => IosBridge.getWatchState());
  const [link, setLink] = useState<WatchLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    void readWatchLink().then(l => { if (mounted) setLink(l); }).catch(() => undefined);
    const unsubscribe = subscribeWatchLink(l => { if (mounted) setLink(l); });
    const sub = IosBridge.addWatchStateListener(s => { if (mounted) setWatch(s); });
    return () => { mounted = false; unsubscribe(); sub.remove(); };
  }, []);

  const connect = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const out = await provisionWatch({
        authed: status === 'authed',
        userId: user?.id === undefined || user?.id === null ? null : String(user.id),
        userName: user?.name ?? '',
        lang,
      }, { force: true });
      if (!out) setError(true);
    } catch (e) {
      if (__DEV__) console.warn('[watch] підключення не вдалося:', e);
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [status, user?.id, user?.name, lang]);

  return { watch, link, busy, error, connect };
}
