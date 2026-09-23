/**
 * store/data-ownership.ts — чиї дані лежать у локальному сховищі (контракт §9.2).
 *
 * До workspace одна інсталяція = один акаунт назавжди, і питання «чиї це
 * дані» не існувало. Тепер workspace можна змінювати, а офлайн-користувачі
 * (до цього релізу — режим «Розпочати офлайн») мігрують у акаунт при вході
 * (§2 плану): локальні дані НЕ стираються при вході — вони вивантажуються в
 * акаунт; якщо в акаунті вже щось є, користувач сам обирає «об'єднати» чи
 * «використати дані акаунта».
 *
 * Викликається з `store/auth.tsx` одразу після успішного входу/реєстрації,
 * ДО першого повного синку.
 */

import { apiFetch } from './api';
import { loadData, removeData, saveData } from './storage';
import { generateFullOutbox, resetPersonalSyncState } from './sync-engine';
import { SYNC_ARRAY_KEYS, SYNC_SERVER_OWNED_KEYS, SYNC_SINGLETON_KEYS } from './sync-contract';
import { appendToOutbox, createMutationId, loadOutbox, OUTBOX_KEY, resolveOutboxStreamForRecord, type OutboxItem } from './synced-storage';

export interface DataOwner {
  workspaceId: string;
  userId: string;
}

const OWNER_KEY = 'data_owner';

export async function getDataOwner(): Promise<DataOwner | null> {
  return loadData<DataOwner | null>(OWNER_KEY, null);
}

export async function setDataOwner(owner: DataOwner | null): Promise<void> {
  await saveData(OWNER_KEY, owner);
}

/**
 * Чи є хоч один запис у будь-якій синхронізованій колекції-масиві, АБО задано
 * бодай один синхронізований singleton (профіль здоров'я, перемикачі
 * нагадувань…) — раніше перевірялись лише масиви, і легасі-користувач, що
 * встиг налаштувати тільки профіль здоров'я (без жодного завдання/транзакції),
 * проходив як «локальних даних нема», хоча singleton пішов би на сервер так
 * само, як і масиви (§9.2).
 */
export async function hasAnyLocalData(): Promise<boolean> {
  for (const key of SYNC_ARRAY_KEYS) {
    const rows = await loadData<unknown[] | null>(key, null);
    if (Array.isArray(rows) && rows.length > 0) return true;
  }
  for (const key of SYNC_SINGLETON_KEYS) {
    const value = await loadData<unknown | undefined>(key, undefined);
    if (value !== undefined) return true;
  }
  return false;
}

/**
 * Стирає локальні синхронізовані дані і чергу outbox — «використати дані
 * акаунта» (діалог злиття нижче) і власник-мисматч у `reconcileDataOwnership`.
 * Налаштування пристрою (тема, мова…) не чіпає — та сама межа, що й у виході
 * (контракт §9.3).
 *
 * Скидає й курсор/мапу ревізій персонального синку: інакше наступний pull
 * пішов би з курсора ПОПЕРЕДНЬОГО акаунта на цьому пристрої, а конфлікти
 * рахувались би від його ревізій — записи нового акаунта могли б губитися чи
 * хибно конфліктувати.
 */
export async function wipeLocalSyncedData(): Promise<void> {
  for (const key of SYNC_ARRAY_KEYS) await saveData(key, []);
  // `storage.removeData`, а НЕ `saveData(key, null)` (major з ревʼю): останнє
  // лишало б `hasAnyLocalData`/`generateFullOutbox` вважати щойно стертий
  // singleton «локальними даними» (обидва читають `loadData(key, undefined)`
  // і перевіряють `!== undefined` — `null` цю перевірку проходить). Наслідок:
  // після «використати дані акаунта» повний синк з курсора 0 (`triggerFullSync`
  // одразу після) заново ставить у чергу `{value:null}` для health_profile/
  // currency/… з `base_revision: null`, сервер відповідає OCC-конфліктом
  // (обидві мітки часу — NaN, `resolveConflictSide` віддає 'manual'), і
  // користувач отримує конфлікт, де один із варіантів затирає акаунтний
  // профіль/валюту null.
  for (const key of SYNC_SINGLETON_KEYS) await removeData(key);
  await saveData(OUTBOX_KEY, []);
  await resetPersonalSyncState();
  // Простір проєкту (§9.3, той самий major, що й у `store/auth.tsx`
  // WORKSPACE_SWITCH_STORAGE_KEYS): ці ключі живуть поза
  // SYNC_ARRAY_KEYS/SYNC_SINGLETON_KEYS (їх пише `project-sync.ts`/
  // `project-team.ts`, не звичайний особистий синк), тож «використати дані
  // акаунта» без цього лишало б курсор/учасників/коментарі попереднього
  // власника цих локальних даних видимими новому акаунту.
  await saveData('comments', []);
  await saveData('project_budgets', []);
  await saveData('workspace_projects', []);
  await saveData('project_sync_state_v1', {});
  await saveData('project_members_v1', {});
  await saveData('recent_projects', []);
  await saveData('projects_migrated_v1', null);
  await saveData('pending_project_deletes', []);
  // Серверні колекції (лише читання) — повний pull з курсора 0 принесе їх
  // знову для нового власника; їхній кеш теж його.
  for (const key of SYNC_SERVER_OWNED_KEYS) await saveData(key, []);
  await removeData('feedback_status_cache_v1');
  // Контейнери v2: черга вивантаження фото прив'язана до записів попереднього
  // власника, лічильники відкриттів — теж його (containers.md §5).
  // `containers_backup_v1` (резервна копія до міграції) свідомо не чіпаємо.
  await removeData('media_upload_queue');
  await removeData('containers_open_counts');
}

interface RemoteSyncChange {
  collection: string;
  local_id: string;
  data: unknown;
  deleted: boolean;
  /** ms epoch — контракт §0.5. */
  updated_at: number;
}

/**
 * Особистий простір акаунта з курсора 0 — і чи там уже є записи. Одна мережева
 * операція обслуговує і `checkRemotePersonalData` (реконсиляція), і побудову
 * мапи для порівняння `updatedAt` при вивантаженні (§9.2 «Merge»).
 *
 * Пагінується через `next_cursor`, а не бере лише першу сторінку (мінор із
 * ревʼю): `/sync/user/v2/` — той самий пагінований ендпоінт, що й звичайний
 * обмін (`store/sync-engine.tsx`, `catchUpAddedCollections`), і акаунт із
 * записів БІЛЬШЕ, ніж влазить в одну сторінку, інакше давав би НЕПОВНИЙ
 * знімок — `uploadLocalDataToAccount()` вважала б записи з наступних сторінок
 * «локальними, яких на сервері нема», і штовхала б їх звичайною (не
 * форсованою) мутацією з `base_revision: null` — сервер, де такий id уже
 * ЄСТЬ (просто на пізнішій сторінці), відповів би OCC-конфліктом замість
 * тихого злиття.
 *
 * Одна повторна спроба на СТОРІНКУ після короткої паузи — щоб один
 * нестабільний пакет не коштував користувачу шансу побачити діалог злиття
 * (див. коментар нижче). Помилка, що пережила повтор, повертає `null` для
 * ВСЬОГО знімку (а не вже зібрані сторінки) — обидва виклики (`reconcile*` і
 * `uploadLocalDataToAccount`) трактують `null` консервативно (нижче), тож
 * видавати їм ЗАВІДОМО неповний список під виглядом повного небезпечніше, ніж
 * зізнатись, що знімок узагалі не вдався.
 */
async function fetchRemotePersonalSnapshot(): Promise<RemoteSyncChange[] | null> {
  const changes: RemoteSyncChange[] = [];
  let cursor = 0;
  // Той самий ліміт сторінок, що й у sync-engine.tsx catchUpAddedCollections —
  // страховка від зациклення на серверному багу (next_cursor, що не рухається).
  for (let page = 0; page < 200; page++) {
    let res: { changes: RemoteSyncChange[]; next_cursor: number | null } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await apiFetch<{ changes: RemoteSyncChange[]; next_cursor: number | null }>('/sync/user/v2/', {
          method: 'POST',
          body: { cursor, mutations: [] },
        });
        break;
      } catch {
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    if (!res) return null;
    if (Array.isArray(res.changes)) changes.push(...res.changes);
    if (res.next_cursor == null || res.next_cursor <= cursor) return changes;
    cursor = res.next_cursor;
  }
  return changes;
}

export type RemoteDataCheck = 'has_data' | 'empty' | 'unknown';

/**
 * Стан особистого простору акаунта на сервері (курсор 0 — пуста мутація).
 *
 * `'unknown'` — мережа не відповіла обома спробами. Це НЕ те саме, що
 * `'empty'`: раніше обидва випадки зливались в `false`, і
 * `reconcileDataOwnership` мовчки вивантажувала локальні дані в акаунт, який
 * міг насправді бути непорожнім, — діалог «злити з акаунтом» після цього вже
 * ніколи не з'явився б, бо `data_owner` виставлявся одразу.
 */
export async function checkRemotePersonalData(): Promise<RemoteDataCheck> {
  const changes = await fetchRemotePersonalSnapshot();
  if (changes === null) return 'unknown';
  return changes.length > 0 ? 'has_data' : 'empty';
}

/**
 * Вивантажує ВЕСЬ локальний особистий простір в акаунт (контракт §9.2, «Злити
 * з акаунтом» і «нічийні дані, акаунт порожній»).
 *
 * На відміну від звичайного outbox (який знає лише про правки ПІСЛЯ введення
 * outbox), тут у чергу ставиться геть усе, що лежить у сховищі: легасі-записи
 * з-до-outbox епохи чи записи, покладені напряму через `saveData` в обхід
 * `saveSynced`, інакше ніколи не поїхали б на сервер.
 *
 * Коли акаунт уже має записи з тим самим id (`clean` цього не буває — там
 * акаунт порожній), вирішує `updatedAt`: локальний новіший або запис,
 * якого на сервері взагалі нема, — форсований push; локальний старіший —
 * пропускаємо його тут, і звичайний pull (що йде одразу після, у
 * `triggerFullSync`) підтягне серверну версію.
 */
export async function uploadLocalDataToAccount(): Promise<void> {
  const remote = await fetchRemotePersonalSnapshot();
  const remoteByKey = new Map<string, RemoteSyncChange>();
  for (const change of remote ?? []) {
    if (change.deleted) continue;
    remoteByKey.set(`${change.collection}:${change.local_id}`, change);
  }

  await generateFullOutbox();
  if (!remoteByKey.size) return; // нічийний акаунт — конфліктів немає, форсувати нема сенсу

  const now = Date.now();
  const forced: OutboxItem[] = [];
  const skip = new Set<string>(); // ключі, де сервер новіший — застосовуємо серверну версію нижче

  for (const key of SYNC_ARRAY_KEYS) {
    const stored = await loadData<unknown>(key, []);
    if (!Array.isArray(stored)) continue;
    const rows = stored as { id?: unknown; updatedAt?: unknown }[];
    let mutated = false;

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const localId = typeof row.id === 'string' ? row.id : row.id != null ? String(row.id) : null;
      if (!localId) continue;
      const fullKey = `${key}:${localId}`;
      const match = remoteByKey.get(fullKey);
      if (!match) continue; // лише локально — звичайна мутація з generateFullOutbox і так поїде

      const localTime = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
      if (Number.isFinite(localTime) && localTime > match.updated_at) {
        // §9.2: «локальний новіший → мутація з force:true» — інакше сервер
        // відхилить її за OCC (він же не бачив base_revision цього запису).
        // `stream` резолвиться так само, як у generateFullOutbox() (мінор із
        // ревʼю): без цього форсований запис із projectId завжди йшов би на
        // ОСОБИСТИЙ ендпоінт (контракт §3.5), навіть коли той самий id уже
        // належить проєктному потоку — `exchangeV2` не знає про проєкти
        // взагалі, і запис проєкту тихо роздвоївся б між двома потоками.
        const stream = await resolveOutboxStreamForRecord(key, localId, row as unknown as Record<string, unknown>);
        forced.push({ mutation_id: createMutationId(), collection: key, local_id: localId, deleted: false, force: true, queued_at: now, stream });
      } else {
        // Сервер новіший — записуємо його версію в сховище ОДРАЗУ, а не
        // лишаємо «пул підтягне пізніше» (як було): completeSession() після
        // цієї функції все одно викликає triggerFullSync(), і той скидає
        // курсор/ревізії в 0/{} — наступний doSync() з курсором 0 знову
        // сканує ВЕСЬ локальний масив (generateFullOutbox не пам'ятає, що
        // цей запис уже вирішено «на користь сервера») і завів би його в
        // outbox ВДРУГЕ, зводячи нанівець фільтрацію нижче. Переписавши
        // локальний рядок серверним тут-таки, розбіжності просто не лишається
        // — повторна генерація поставить у чергу вже ідентичний до сервера
        // запис, і навіть якщо це станеться, серверні правки не втрачаються.
        skip.add(fullKey);
        rows[index] = match.data as { id?: unknown; updatedAt?: unknown };
        mutated = true;
      }
    }

    if (mutated) await saveData(key, rows);
  }

  // Singleton (health_profile, finance_primary_currency…) не має власного
  // updatedAt — buildMutation шле для нього `client_updated_at: null`
  // (шапка sync-engine.tsx), тож «хто новіший» тут визначити нічим (мінор із
  // ревʼю). Non-forced мутація з `base_revision: null`, яку вже поставив
  // generateFullOutbox() вище, зіткнеться на сервері з ІСНУЮЧИМ записом і
  // впаде в OCC-конфлікт; `resolveConflictSide` на двох `undefined`-мітках
  // часу відповість 'manual' — користувач після щойно натиснутого
  // «Об'єднати» одразу побачив би непояснений запис у черзі ручного
  // вирішення. Замість цього віддаємо перевагу тому, що вже є в акаунті (той
  // самий стан, який і привів до діалогу злиття) — переписуємо локальний
  // рядок серверним і виключаємо згенеровану мутацію з outbox, як і для
  // «сервер новіший» вище.
  for (const key of SYNC_SINGLETON_KEYS) {
    const match = remoteByKey.get(`${key}:${key}`);
    if (!match) continue;
    await saveData(key, match.data);
    skip.add(`${key}:${key}`);
  }

  if (forced.length) await appendToOutbox(forced);
  if (skip.size) {
    // Прибираємо з тільки-но згенерованого outbox записи, де сервер новіший —
    // інакше вони позначені «брудними» (dirty-wins) і подальше застосування
    // pull-відповідей пропускало б їх, вважаючи локальну версію навмисно
    // залишеною попереду серверної.
    const outbox = await loadOutbox();
    const filtered = outbox.filter(item => !skip.has(`${item.collection}:${item.local_id}`) || item.force);
    if (filtered.length !== outbox.length) await saveData(OUTBOX_KEY, filtered);
  }
}

export type ReconcileOutcome = 'clean' | 'ask_merge' | 'retry_later';

/**
 * Звіряє власника локальних даних із поточним акаунтом/workspace.
 *
 * - Дані належали іншому акаунту/workspace на цьому ж пристрої (рідкісний
 *   випадок: вхід іншим акаунтом без явної зміни workspace) → стираються,
 *   щоб не змішати чужі записи з новим акаунтом.
 * - Дані нічиї (легасі-офлайн чи щойно встановлений застосунок) і локально
 *   щось є → якщо в акаунті вже є дані, треба спитати користувача
 *   («ask_merge» — `store/auth.tsx` показує діалог); якщо акаунт порожній —
 *   позначаємо власника й лишаємо звичайний push/pull довантажити дані.
 * - Стан акаунта не вдалося дізнатись (мережа) → `'retry_later'`: власника
 *   НЕ виставляємо і нічого не вивантажуємо (`data_owner` лишається `null`,
 *   тож наступний успішний вхід спробує звірити знову) — інакше непорожній
 *   акаунт мовчки отримав би чужі локальні записи без жодного питання.
 */
export async function reconcileDataOwnership(
  userId: string,
  workspaceId: string,
): Promise<ReconcileOutcome> {
  const owner = await getDataOwner();
  if (owner && (owner.workspaceId !== workspaceId || owner.userId !== userId)) {
    await wipeLocalSyncedData();
    await setDataOwner(null);
    // Далі — як для нічиїх/порожніх даних.
  } else if (owner) {
    return 'clean'; // уже узгоджено раніше на цьому пристрої з цим акаунтом
  }

  const hasLocal = await hasAnyLocalData();
  if (!hasLocal) {
    await setDataOwner({ workspaceId, userId });
    return 'clean';
  }

  const remoteCheck = await checkRemotePersonalData();
  if (remoteCheck === 'unknown') return 'retry_later';
  if (remoteCheck === 'empty') {
    // Локальні дані офлайн-користувача підуть в акаунт — нічого питати не
    // треба (контракт §2, «локальні дані зберігаються й після входу
    // вивантажуються в акаунт»). Акаунт порожній, тож конфліктів немає:
    // достатньо поставити в чергу геть усе локальне (не лише те, що вже в
    // outbox, — §9.2), а не покладатися на звичайний диф.
    await generateFullOutbox();
    await setDataOwner({ workspaceId, userId });
    return 'clean';
  }
  return 'ask_merge';
}
