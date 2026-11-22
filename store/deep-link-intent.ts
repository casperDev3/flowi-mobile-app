/**
 * store/deep-link-intent.ts — «куди людина йшла» крізь вхід (rc1, S3-03,
 * docs/release-rc1/deeplinks.md).
 *
 * `app/+native-intent.tsx` кладе сюди розібране посилання (`ResolvedLink`
 * kind 'app') і веде на `/open-link`. Той екран — ЄДИНИЙ споживач: він чекає,
 * поки стане відомо, чи людина увійшла, перевіряє членство в проєкті й лише
 * тоді відкриває ціль. Гість іде на вхід; запис лишається в памʼяті й у
 * сховищі (`pending_deep_link`), і після входу/реєстрації `login.tsx` чи
 * `DeepLinkIntentResume` (app/_layout.tsx) повертають на `/open-link`.
 *
 * Захисти:
 *  - TTL 30 хв: давнє посилання не перехоплює наступний звичайний вхід;
 *  - маршрут повторно проходить `isSafeInternalRoute` при читанні зі сховища;
 *  - запис НЕ є дозволом: `/open-link` перевіряє доступ уже в поточному
 *    акаунті, тож посилання, збережене до виходу/зміни workspace, нічого
 *    чужого не відкриє.
 *
 * Без React і expo-router — модуль імпортує +native-intent до монтування.
 */
import { isSafeInternalRoute, type ResolvedLink } from '@/utils/deepLinks';

import { loadData, saveData } from './storage';

export const PENDING_DEEP_LINK_KEY = 'pending_deep_link';
export const DEEP_LINK_INTENT_TTL_MS = 30 * 60 * 1000;

export interface DeepLinkIntent {
  route: string;
  projectId?: string;
  receivedAt: number;
}

let memory: DeepLinkIntent | null = null;
/** Пам'ять уже звірена зі сховищем (холодний старт без посилання). */
let hydrated = false;

function isFresh(intent: DeepLinkIntent | null, now = Date.now()): intent is DeepLinkIntent {
  return !!intent
    && isSafeInternalRoute(intent.route)
    && typeof intent.receivedAt === 'number'
    && now - intent.receivedAt >= 0
    && now - intent.receivedAt < DEEP_LINK_INTENT_TTL_MS
    && (intent.projectId === undefined || typeof intent.projectId === 'string');
}

/** Запам'ятати посилання (синхронно в памʼяті, асинхронно — у сховищі). */
export function setDeepLinkIntent(link: Pick<ResolvedLink, 'route' | 'projectId'>, now = Date.now()): DeepLinkIntent | null {
  if (!isSafeInternalRoute(link.route)) return null;
  const intent: DeepLinkIntent = link.projectId !== undefined
    ? { route: link.route, projectId: link.projectId, receivedAt: now }
    : { route: link.route, receivedAt: now };
  memory = intent;
  hydrated = true;
  void saveData(PENDING_DEEP_LINK_KEY, intent).catch(e => {
    if (__DEV__) console.warn('[deep-link] не вдалося зберегти намір:', e);
  });
  return intent;
}

/** Синхронний погляд (для рішення «куди після входу» без await). */
export function peekDeepLinkIntentSync(now = Date.now()): DeepLinkIntent | null {
  return isFresh(memory, now) ? memory : null;
}

/** Поточний намір (зі сховища, якщо памʼять ще порожня після холодного старту). */
export async function getDeepLinkIntent(now = Date.now()): Promise<DeepLinkIntent | null> {
  if (!hydrated) {
    hydrated = true;
    try {
      const stored = await loadData<DeepLinkIntent | null>(PENDING_DEEP_LINK_KEY, null);
      if (!memory) memory = stored;
    } catch (e) {
      if (__DEV__) console.warn('[deep-link] не вдалося прочитати намір:', e);
    }
  }
  if (isFresh(memory, now)) return memory;
  if (memory) await clearDeepLinkIntent();
  return null;
}

/** Забрати намір (одноразово). */
export async function takeDeepLinkIntent(now = Date.now()): Promise<DeepLinkIntent | null> {
  const intent = await getDeepLinkIntent(now);
  if (intent) await clearDeepLinkIntent();
  return intent;
}

export async function clearDeepLinkIntent(): Promise<void> {
  memory = null;
  hydrated = true;
  try {
    await saveData(PENDING_DEEP_LINK_KEY, null);
  } catch (e) {
    if (__DEV__) console.warn('[deep-link] не вдалося стерти намір:', e);
  }
}

/** Лише для тестів: скинути стан модуля. */
export function __resetDeepLinkIntentForTests(): void {
  memory = null;
  hydrated = false;
}
