/**
 * utils/deepLinks.ts — єдина політика deep link застосунку (rc1, S3-03,
 * docs/release-rc1/deeplinks.md).
 *
 * Що сюди приходить (усе — одним рядком URL, як його віддає ОС):
 *  - universal / app link `https://app.flowi.com.ua/app/...`, `/invite...`
 *    (а також старий хост `api.flowi.casperdev.site`, який Caddy 301-ить);
 *  - власна схема `flowi://…` і її аліас `ftrackingapp://…` (N-1 посилання,
 *    віджети, сервер `core/notifications/registry.py`).
 *
 * Що звідси виходить — `ResolvedLink | null`:
 *  - `kind: 'app'` — маршрут expo-router + `projectId`, якщо ціль у просторі
 *    проєкту (тоді `app/open-link.tsx` перевіряє членство ДО переходу);
 *  - `kind: 'invite'` — екрани запрошень (`/invite`, `/menu-invite`,
 *    `/training-invite`) — вони самі розбираються з workspace і входом;
 *  - `null` — не наше або не потребує переписування (віджети `ftrackingapp:///…`,
 *    швидкий запис нотатки, повернення з Google OAuth, QR коробки): шлях
 *    іде в expo-router як є.
 *
 * Таблиця `WEB_TO_MOBILE_ROUTES` — кожна сторінка веб-кабінету `/app/**` →
 * екран застосунку. Вона ж лежить у спільній фікстурі
 * (`__tests__/fixtures/deeplinks-web.json` = flowi-web-app/lib/__fixtures__/deeplinks.json):
 * веб-тест валиться на новій сторінці кабінету без рядка, мобільний — коли
 * таблиця тут розійшлась із фікстурою чи ціль не існує в `app/`.
 * Невідомий шлях → найближчий батько з таблиці (без запиту), в крайньому
 * разі — «Сьогодні».
 *
 * Модуль без React/expo-router/сховища (лише `canonicalCloudOrigin` з
 * api-config): його імпортує `app/+native-intent.tsx`, що виконується до
 * монтування дерева.
 */
import { canonicalCloudOrigin } from '@/store/api-config';

import { deepLinkRoute } from './pushLink';

/** Схеми застосунку: перша — канонічна (app.json `scheme[0]`). */
export const APP_SCHEMES: readonly string[] = ['flowi', 'ftrackingapp'];

/** Хости веб-кабінету, посилання з яких застосунок відкриває сам. */
export const WEB_LINK_HOSTS: readonly string[] = [
  'app.flowi.com.ua',
  // Старі адреси (identity-signing-domains.md): Caddy 301-ить їх на новий хост,
  // але скопійоване/вставлене посилання може прийти й напряму.
  'api.flowi.casperdev.site',
  'flowi.casperdev.site',
];

export const DEEP_LINK_FALLBACK_ROUTE = '/(tabs)/today';

export type DeepLinkKind = 'app' | 'invite';
/** `table` — точний рядок; `parent` — невідомий шлях, узято найближчого батька; `fallback` — «Сьогодні». */
export type DeepLinkMatch = 'table' | 'parent' | 'fallback';

export interface ResolvedLink {
  kind: DeepLinkKind;
  /** Маршрут expo-router (path + query), завжди проходить `isSafeInternalRoute`. */
  route: string;
  /** Розкодований id проєкту, якщо ціль — у просторі проєкту. */
  projectId?: string;
  match: DeepLinkMatch;
}

/** Веб `/app/**` → мобільний маршрут. `[param]` — один сегмент; статичний сегмент сильніший за `[param]`. */
export const WEB_TO_MOBILE_ROUTES: readonly (readonly [web: string, mobile: string])[] = [
  ['/app', '/(tabs)/today'],
  ['/app/admin', '/admin-workspace'],
  ['/app/admin/inbox', '/admin-workspace'],
  ['/app/admin-workspace/analytics', '/admin-workspace'],
  ['/app/agent', '/(tabs)/today'],
  ['/app/banks', '/banks'],
  ['/app/budget', '/budget'],
  ['/app/calendar', '/calendar'],
  ['/app/clients', '/clients'],
  ['/app/clients/[id]', '/client/[id]'],
  ['/app/containers', '/containers'],
  ['/app/containers/print', '/containers'],
  ['/app/finance', '/(tabs)/explore'],
  ['/app/finance/subscriptions', '/subscriptions'],
  ['/app/health', '/(tabs)/health'],
  ['/app/health/activity', '/health-activity'],
  ['/app/health/body', '/health-body'],
  ['/app/health/nutrition', '/health-nutrition'],
  ['/app/health/profile', '/health-profile'],
  ['/app/health/sleep', '/health-sleep'],
  ['/app/health/summary', '/health-summary'],
  ['/app/health/vitals', '/health-vitals'],
  ['/app/ideas', '/feedback'],
  // «Вхідні ідеї та баги» — скринька команди (feedback-inbox.md §10.4), як `admin/inbox` реєстру.
  ['/app/inbox', '/admin-workspace'],
  ['/app/integrations', '/integrations'],
  ['/app/integrations/settings', '/integrations/settings'],
  ['/app/invites', '/invites'],
  ['/app/meetings', '/calendar'],
  ['/app/menu', '/menu'],
  ['/app/menu/join', '/menu-invite'],
  ['/app/notes', '/notes'],
  ['/app/notifications', '/notifications'],
  ['/app/notifications/verify-email', '/settings-notifications'],
  ['/app/p/[id]', '/project/[id]/overview'],
  ['/app/p/[id]/activity', '/project/[id]/activity'],
  ['/app/p/[id]/archive', '/project/[id]/archive'],
  ['/app/p/[id]/backlog', '/project/[id]/backlog'],
  ['/app/p/[id]/board', '/project/[id]/tasks'],
  ['/app/p/[id]/budget', '/project/[id]/budget'],
  ['/app/p/[id]/calendar', '/project/[id]/calendar'],
  ['/app/p/[id]/discussions', '/project/[id]/discussions'],
  ['/app/p/[id]/feedback', '/project/[id]/overview'],
  ['/app/p/[id]/integrations', '/project/[id]/integrations'],
  ['/app/p/[id]/integrations/settings', '/project/[id]/integrations/settings'],
  ['/app/p/[id]/list', '/project/[id]/tasks'],
  ['/app/p/[id]/meetings', '/project/[id]/meetings'],
  ['/app/p/[id]/members', '/project/[id]/members'],
  ['/app/p/[id]/my-work', '/project/[id]/my-work'],
  ['/app/p/[id]/notes', '/project/[id]/notes'],
  ['/app/p/[id]/overview', '/project/[id]/overview'],
  ['/app/p/[id]/settings', '/project/[id]/settings'],
  ['/app/p/[id]/sprints', '/project/[id]/sprints'],
  ['/app/p/[id]/tasks', '/project/[id]/tasks'],
  ['/app/p/[id]/time', '/project/[id]/time'],
  ['/app/p/[id]/timeline', '/project/[id]/tasks'],
  ['/app/p/[id]/workload', '/project/[id]/workload'],
  ['/app/prevention', '/health-prevention'],
  ['/app/projects', '/projects'],
  ['/app/settings', '/(tabs)/settings'],
  ['/app/settings/notifications', '/settings-notifications'],
  ['/app/tasks', '/(tabs)'],
  ['/app/time', '/(tabs)/time'],
  ['/app/training', '/training'],
  ['/app/training/[groupId]', '/training/[groupId]'],
  ['/app/training/[groupId]/activity', '/training/[groupId]'],
  ['/app/training/[groupId]/exercises', '/training/[groupId]/exercises'],
  ['/app/training/[groupId]/leaderboard', '/training/[groupId]/leaderboard'],
  ['/app/training/[groupId]/members', '/training/[groupId]/members'],
  ['/app/training/[groupId]/members/[userId]', '/training/[groupId]/member/[userId]'],
  ['/app/training/[groupId]/programs', '/training/[groupId]/programs'],
  ['/app/training/[groupId]/programs/[programId]', '/training/[groupId]/program/[programId]'],
  ['/app/training/[groupId]/quests', '/training/[groupId]/quests'],
  ['/app/training/[groupId]/settings', '/training/[groupId]'],
  ['/app/training/join', '/training-invite'],
  ['/app/training/session/[sessionId]', '/training/session/[sessionId]'],
  ['/app/workouts', '/workouts'],
];

/**
 * Імена параметрів вебу → мобільного там, де вони різні. Веб-посилання
 * сервера (`registry.py` `web_link`) несуть `?task=` / `?meeting=`, а мобільні
 * екрани відкривають картку за `?open=`. Ключ — мобільний шаблон із таблиці.
 */
export const QUERY_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  '/(tabs)': { task: 'open' },
  '/project/[id]/tasks': { task: 'open' },
  '/calendar': { meeting: 'open' },
  '/project/[id]/calendar': { meeting: 'open' },
};

/** Розділи простору проєкту на мобільному (`app/project/[id]/*.tsx`) — для `flowi://project/<id>/<розділ>`. */
const MOBILE_PROJECT_TABS = new Set([
  'activity', 'archive', 'backlog', 'budget', 'calendar', 'discussions', 'integrations', 'meetings',
  'members', 'more', 'my-work', 'notes', 'overview', 'settings', 'sprints', 'tasks', 'time', 'workload',
]);

function renameQuery(search: string, aliases: Readonly<Record<string, string>> | undefined): string {
  if (!aliases || !search || search === '?') return search;
  const parts = search.slice(1).split('&').map(part => {
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    const to = aliases[key];
    return to ? `${to}${eq < 0 ? '' : part.slice(eq)}` : part;
  });
  return `?${parts.join('&')}`;
}

/** Маршрути запрошень: екран сам перевіряє workspace/вхід, членство тут не потрібне. */
const INVITE_ROUTES = new Set(['/invite', '/menu-invite', '/training-invite']);

const PARSE_BASE = 'https://flowi.invalid';

/**
 * Безпечний внутрішній шлях — ТІ САМІ правила, що `safeNextPath` вебу
 * (flowi-web-app/lib/deep-links.ts; спільна фікстура `next`): один початковий
 * `/`, без `//` і `\`, без закодованого `%2F`/`%5C` одразу за ним, без
 * керівних символів і пробілів по краях, той самий origin після розбору.
 */
export function isSafeInternalRoute(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
  if (raw !== raw.trim()) return false;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return false;
  if (!raw.startsWith('/')) return false;
  if (raw.startsWith('//') || raw.includes('\\')) return false;
  if (/^\/(%2f|%5c)/i.test(raw)) return false;
  try {
    return new URL(raw, PARSE_BASE).origin === PARSE_BASE;
  } catch {
    return false;
  }
}

/** Те саме, що `safeNextPath` на вебі: нормалізований шлях або null. */
export function safeInternalRoute(raw: unknown): string | null {
  if (!isSafeInternalRoute(raw)) return null;
  const u = new URL(raw, PARSE_BASE);
  return `${u.pathname}${u.search}${u.hash}`;
}

interface CompiledRoute {
  web: readonly string[];
  mobile: string;
}

const COMPILED: readonly CompiledRoute[] = WEB_TO_MOBILE_ROUTES.map(([web, mobile]) => ({
  web: web.split('/').filter(Boolean),
  mobile,
}));

/**
 * Точний збіг; з кількох — найконкретніший (менше `[param]`): статичний
 * `/app/training/join` мусить перемогти `/app/training/[groupId]`.
 */
function matchRoute(segments: readonly string[]): { mobile: string; params: Record<string, string> } | null {
  let best: { mobile: string; params: Record<string, string>; dynamic: number } | null = null;
  for (const route of COMPILED) {
    if (route.web.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segments.length; i += 1) {
      const pattern = route.web[i];
      if (pattern.startsWith('[') && pattern.endsWith(']')) {
        params[pattern.slice(1, -1)] = segments[i];
      } else if (pattern !== segments[i]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const dynamic = Object.keys(params).length;
    if (!best || dynamic < best.dynamic) best = { mobile: route.mobile, params, dynamic };
  }
  return best ? { mobile: best.mobile, params: best.params } : null;
}

function fillPattern(pattern: string, params: Record<string, string>): string {
  return pattern.replace(/\[([^\]]+)\]/g, (_, name: string) => params[name] ?? '');
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function projectIdOf(route: string): string | undefined {
  const m = /^\/project\/([^/?#]+)/.exec(route);
  if (!m) return undefined;
  return safeDecode(m[1]) ?? undefined;
}

/**
 * `ws` запрошення зі старою адресою Flowi Cloud → нова (той самий workspace;
 * N-1 клієнти мінтять `ws` зі свого хоста). Робиться ТУТ, один раз для всіх
 * екранів запрошень: `app/invite.tsx`, `/menu-invite`, `/training/invite`
 * беруть `ws` прямо з параметрів маршруту, і без цього новий білд бачив би
 * «інший workspace» і пропонував вихід зі стиранням даних. Інші параметри
 * не перекодовуються.
 */
function canonicalizeInviteWs(route: string): string {
  const q = route.indexOf('?');
  if (q < 0) return route;
  const parts = route.slice(q + 1).split('&').map(part => {
    if (!part.startsWith('ws=')) return part;
    const value = safeDecode(part.slice(3).replace(/\+/g, ' '));
    if (value === null) return part;
    const canonical = canonicalCloudOrigin(value);
    return canonical === value ? part : `ws=${encodeURIComponent(canonical)}`;
  });
  return `${route.slice(0, q)}?${parts.join('&')}`;
}

function finish(kind: DeepLinkKind, rawRoute: string, match: DeepLinkMatch): ResolvedLink | null {
  const isInvite = INVITE_ROUTES.has(rawRoute.split('?', 1)[0]);
  const route = isInvite ? canonicalizeInviteWs(rawRoute) : rawRoute;
  if (!isSafeInternalRoute(route)) return null;
  const effectiveKind: DeepLinkKind = isInvite ? 'invite' : kind;
  const projectId = effectiveKind === 'app' ? projectIdOf(route) : undefined;
  return projectId !== undefined ? { kind: effectiveKind, route, projectId, match } : { kind: effectiveKind, route, match };
}

/**
 * Веб-шлях кабінету (`/app/...`, вже percent-encoded, як у `URL.pathname`) →
 * мобільний маршрут. Точний рядок зберігає запит (`?open=`, `?space=` …),
 * батько/фолбек — ні (запит батькові нічого не каже).
 */
export function resolveWebAppPath(pathname: string, search = ''): ResolvedLink | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'app') return null;
  if (segments.some(s => safeDecode(s) === null || s === '..' || s === '.')) return null;
  const exact = matchRoute(segments);
  if (exact) return finish('app', fillPattern(exact.mobile, exact.params) + renameQuery(search, QUERY_ALIASES[exact.mobile]), 'table');
  for (let n = segments.length - 1; n >= 1; n -= 1) {
    const parent = matchRoute(segments.slice(0, n));
    if (parent) return finish('app', fillPattern(parent.mobile, parent.params), 'parent');
  }
  return finish('app', DEEP_LINK_FALLBACK_ROUTE, 'fallback');
}

const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;

/** Розбір будь-якого вхідного URL за політикою вище. Ніколи не кидає. */
export function resolveIncomingLink(input: string | null | undefined): ResolvedLink | null {
  try {
    if (typeof input !== 'string') return null;
    const raw = input.trim();
    const scheme = SCHEME_RE.exec(raw)?.[1]?.toLowerCase();
    if (!scheme) return null;

    if (scheme === 'https' || scheme === 'http') {
      const url = new URL(raw);
      if (!WEB_LINK_HOSTS.includes(url.hostname.toLowerCase())) return null;
      const path = url.pathname.replace(/\/+$/, '') || '/';
      if (path === '/invite') return finish('invite', `/invite${url.search}`, 'table');
      if (path === '/invite/menu') return finish('invite', `/menu-invite${url.search}`, 'table');
      if (path === '/invite/training') return finish('invite', `/training-invite${url.search}`, 'table');
      if (path === '/app' || path.startsWith('/app/')) return resolveWebAppPath(path, url.search);
      return null;
    }

    if (!APP_SCHEMES.includes(scheme)) return null;
    const afterScheme = raw.slice(scheme.length + 1);
    const tripleSlash = afterScheme.startsWith('///');
    const rest = afterScheme.replace(/^\/+/, '').replace(/^--\//, '');
    const qIndex = rest.indexOf('?');
    const pathPart = (qIndex >= 0 ? rest.slice(0, qIndex) : rest).split('#')[0].replace(/\/+$/, '');
    const query = qIndex >= 0 ? `?${rest.slice(qIndex + 1).split('#')[0]}` : '';

    if (pathPart === 'invite' || pathPart === 'menu-invite' || pathPart === 'training-invite') {
      return finish('invite', `/${pathPart}${query}`, 'table');
    }
    // `ftrackingapp:///time`, `:///explore?create=1` … — віджети й швидкі дії
    // ведуть просто на файл-маршрут; expo-router розбере їх сам.
    if (tripleSlash) return null;
    // `flowi://project/<id>/<розділ>` (Maestro, ручні посилання) — розділ, якого
    // реєстр сервера не знає (notes, time…), йде прямо в цей розділ, а не
    // фолбеком реєстру на Огляд.
    const projectTab = /^project\/([^/?#]+)\/([a-z-]+)$/.exec(pathPart);
    if (projectTab && MOBILE_PROJECT_TABS.has(projectTab[2])) {
      return finish('app', `/project/${projectTab[1]}/${projectTab[2]}${query}`, 'table');
    }
    const registry = deepLinkRoute(`ftrackingapp://${rest}`);
    return registry ? finish('app', registry, 'table') : null;
  } catch {
    return null;
  }
}

// ─── Доступ до цілі (app/open-link.tsx) ─────────────────────────────────────

export type DeepLinkAccess =
  /** Відкрити одразу. */
  | { action: 'open' }
  /** Людина зараз в ІНШОМУ просторі проєкту — спершу аркуш «Відкрити в просторі B?». */
  | { action: 'confirm-switch' }
  /** Не учасник — екран «Немає доступу» без жодних даних цілі. */
  | { action: 'no-access' };

/**
 * Чисте рішення «відкривати чи ні». `memberProjectIds` — проєкти, де людина
 * учасник ЗАРАЗ (свіжий `GET /projects/` ∪ локальні, ще не вивантажені);
 * `activeProjectId` — простір, у якому людина просто зараз (null — особисте).
 * Особиста ціль (без `projectId`) — завжди 'open': в особистому просторі
 * чужого не буває, а вхід у нього з проєкту — звичайна навігація.
 */
/**
 * Проти чого перевіряти членство. Свіжий `GET /projects/` вдався → ЛИШЕ він:
 * локальний масив `projects` ще тримає проєкт, з якого людину щойно
 * видалили (його чистить лише синк проєкту на 403), і з ним відкликаний
 * доступ «відкривався» б. Не вдалося (офлайн/сервер) → кеш ∪ локальні, бо
 * без мережі кращого джерела нема (і даних з сервера тоді теж не буде).
 */
export function memberProjectIdsFor(
  freshServerIds: readonly string[] | null,
  cachedOrLocalIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return freshServerIds ? new Set(freshServerIds) : cachedOrLocalIds;
}

export function decideDeepLinkAccess(
  intent: { projectId?: string },
  memberProjectIds: ReadonlySet<string>,
  activeProjectId: string | null,
): DeepLinkAccess {
  if (intent.projectId === undefined) return { action: 'open' };
  if (!memberProjectIds.has(intent.projectId)) return { action: 'no-access' };
  if (activeProjectId && activeProjectId !== intent.projectId) return { action: 'confirm-switch' };
  return { action: 'open' };
}
