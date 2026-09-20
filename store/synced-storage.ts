/**
 * store/synced-storage.ts — запис з підтримкою синхронізації.
 *
 * saveSynced(key, items[]) — для масивів SYNC_ARRAY_KEYS:
 *   1. Завантажує поточний стан зі сховища.
 *   2. Дифить за id: нові/змінені → outbox {deleted:false}; зниклі → outbox {deleted:true}.
 *   3. saveData(key, items).
 *   4. Запускає debounce-синк.
 *
 * saveSyncedValue(key, value) — для singleton-ключів:
 *   outbox item local_id=key, data={value}.
 */

import { loadData, saveData } from './storage';
import { withStorageLock } from './storage-lock';
import { withCompletionEvent } from '@/utils/taskUtils';
import {
  recordNotify,
  recordSchedulerInstalled,
  recordStorageEval,
  type SchedulerTag,
} from './sync-diagnostics';

export {
  SYNC_ARRAY_KEYS,
  SYNC_SINGLETON_KEYS,
  type SyncArrayKey,
  type SyncSingletonKey,
} from './sync-contract';

// ─── Ключові константи ─────────────────────────────────────────────────────────
export const OUTBOX_KEY = 'sync_outbox';

// ─── Типи ─────────────────────────────────────────────────────────────────────
export interface OutboxItem {
  /** Added lazily for outbox rows created by pre-v2 app versions. */
  mutation_id?: string;
  collection: string;
  local_id: string;
  deleted: boolean;
  force?: boolean;
  queued_at: number;
  /**
   * Куди йде мутація (WORKSPACE_PROJECTS_CONTRACT §3.5): `'personal'` або
   * `'project:<id>'`. Відсутнє = 'personal' (сумісність зі старим outbox і з
   * будь-яким записом, для якого резолвер нижче не встановлено — наприклад, у
   * тестах, що не монтують `store/project-sync.ts`).
   */
  stream?: string;
}

let mutationSequence = 0;

export function createMutationId(): string {
  mutationSequence = (mutationSequence + 1) % 1_000_000;
  return `mob-${Date.now().toString(36)}-${mutationSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

export function ensureMutationIds(items: OutboxItem[]): OutboxItem[] {
  return items.map(item => item.mutation_id ? item : { ...item, mutation_id: createMutationId() });
}

// ─── Scheduler hook (встановлюється sync-engine, щоб уникнути циклічного імпорту) ─

/**
 * Відбиток ЦІЄЇ оцінки модуля.
 *
 * Модульний стан нижче переживає лише один екземпляр модуля. Якщо збірка
 * оцінить synced-storage вдруге (Fast Refresh, дубль у графі), екрани
 * сповіщатимуть один екземпляр, а планувальник стоятиме в іншому — outbox при
 * цьому спільний, бо він у AsyncStorage, тож симптом виглядає як «кнопка
 * працює, автоматика ні». Ідентифікатор робить цю підміну видимою.
 */
export const SYNCED_STORAGE_INSTANCE_ID = Math.random().toString(36).slice(2, 8);
recordStorageEval(SYNCED_STORAGE_INSTANCE_ID);

let _scheduleSync: (() => void) | null = null;
let _schedulerTag: SchedulerTag = 'none';

/**
 * `tag` не впливає ні на що, крім діагностики: реєстр однаково зберігає
 * передану функцію. Він потрібен тому, що cleanup рушія ставить сюди порожню
 * функцію, і ззовні «жива функція» від «заглушки» нічим не відрізняються —
 * обидві виглядають як встановлений планувальник.
 */
export function setSyncScheduler(fn: () => void, tag: 'live' | 'noop' = 'live'): void {
  _scheduleSync = fn;
  _schedulerTag = tag;
  recordSchedulerInstalled(tag, SYNCED_STORAGE_INSTANCE_ID);
}

function notifySyncScheduler(): void {
  recordNotify(_scheduleSync ? _schedulerTag : 'none');
  _scheduleSync?.();
}

/**
 * Будить обмін конкретних проєктних потоків (`store/project-sync.ts`) —
 * WORKSPACE_PROJECTS_CONTRACT §3.5 «коли синкати»: правка всередині проєкту
 * має штовхатись негайно (з дебаунсом), а не чекати 5-хвилинного поллінгу чи
 * WS-сигналу. `undefined`, доки `ProjectSyncProvider` не змонтовано (тести,
 * ранній старт) — тоді проєктні правки просто чекають наступного циклу, як і
 * до цього фіксу.
 */
export type ProjectSyncNotifier = (projectIds: readonly string[]) => void;

let _notifyProjectSync: ProjectSyncNotifier | null = null;

export function setProjectSyncNotifier(fn: ProjectSyncNotifier | null): void {
  _notifyProjectSync = fn;
}

function notifyProjectStreams(streams: Iterable<string>): void {
  if (!_notifyProjectSync) return;
  const ids: string[] = [];
  for (const stream of streams) {
    if (stream.startsWith('project:')) ids.push(stream.slice('project:'.length));
  }
  if (ids.length) _notifyProjectSync(ids);
}

// ─── Резолвер потоку outbox (встановлюється store/project-sync.ts) ───────────

/**
 * Визначає `OutboxItem.stream` за вмістом запису — `undefined`, доки
 * `store/project-sync.ts` не змонтовано (тести й ранній старт застосунку):
 * тоді все лишається `'personal'`, точнісінько як до появи проєктних потоків.
 */
export type OutboxStreamResolver = (
  collection: string,
  localId: string,
  record: Record<string, unknown> | undefined,
) => Promise<string | undefined>;

let _resolveStream: OutboxStreamResolver | null = null;

export function setOutboxStreamResolver(fn: OutboxStreamResolver | null): void {
  _resolveStream = fn;
}

/**
 * Публічна обгортка `resolveStreamFor` — для `generateFullOutbox()` у
 * `store/sync-engine.tsx`, який будує `OutboxItem` напряму, в обхід
 * `enqueueChanges` (там свіжий, ще не позначений outbox генерується цілком з
 * поточного вмісту сховища, а не з diff-у).
 */
export async function resolveOutboxStreamForRecord(
  collection: string,
  localId: string,
  record: Record<string, unknown> | undefined,
): Promise<string | undefined> {
  return resolveStreamFor(collection, localId, record);
}

async function resolveStreamFor(
  collection: string,
  localId: string,
  record: Record<string, unknown> | undefined,
): Promise<string | undefined> {
  if (!_resolveStream) return undefined;
  try {
    const stream = await _resolveStream(collection, localId, record);
    // 'personal' зберігаємо як undefined — той самий компактний вигляд, що й
    // до появи проєктних потоків (і сумісний зі старими рядками outbox).
    return stream && stream !== 'personal' ? stream : undefined;
  } catch (e) {
    if (__DEV__) console.warn('[synced-storage] outbox stream resolver впав:', e);
    return undefined;
  }
}

// ─── Outbox helpers (чисті функції, тестабельні) ─────────────────────────────

/**
 * Дедуп за collection+local_id+stream: залишає ОСТАННІЙ елемент кожного ключа
 * — тобто той, що йде останнім у вхідному масиві.
 *
 * `stream` — частина ключа (WORKSPACE_PROJECTS_CONTRACT §3.5): переміщення
 * запису між потоками — це ДВІ мутації одного local_id (delete у старому +
 * upsert у новому, див. enqueueChanges нижче), і вони не мають витісняти одна
 * одну лише тому, що йдеться про той самий запис.
 *
 * Раніше правило було «deleted завжди перемагає non-deleted, і назад його вже
 * не звалити» — без урахування порядку. Це ламалось саме на переміщенні між
 * потоками ТУДИ й НАЗАД до першого синку: Особисте→P дає
 * `[upsert@P, delete@personal]`, а P→Особисте, що сталось до відправки —
 * `[upsert@personal, delete@P]`. Ключ `tasks:X:personal` тоді отримує послідовність
 * `[delete, upsert]` (запис ПОВЕРНУВСЯ в Особисте — фінальний стан має бути
 * upsert), а стара логіка «deleted перемагає» все одно лишала delete: вихідний
 * outbox виглядав як `[delete@P, delete@personal]` і сервер тумбстоунив
 * запис в ОБОХ потоках, хоча локально він і далі існує. Виклики
 * `appendToOutbox` завжди дедуплять `[...existing (вже дедупльований), ...нові]`,
 * тож для кожного ключа останній елемент вхідного масиву — це справді
 * хронологічно останній відомий стан; чистий «останній перемагає» без
 * категоріальних пріоритетів цю послідовність зберігає коректно.
 *
 * Виняток — `force` (review finding, мінор): `markDirty(..., force=true)`
 * ставить його, коли конфлікт щойно вирішено на користь ЛОКАЛЬНОЇ сторони
 * (`resolveConflictSide` → 'local') — рядок має проштовхнутись БЕЗ OCC-
 * перевірки, інакше сервер підняв би той самий конфлікт знову. Якщо після
 * цього, ще до відправки, прийде звичайна правка (без force) того самого
 * ключа, «останній перемагає» стер би прапорець разом із рештою старого
 * запису — сервер знову побачив би конфлікт, щойно вирішений користувачем.
 * Тому форма (deleted/mutation_id/stream/…) береться з ОСТАННЬОГО елемента, а
 * `force` — якщо його мав БУДЬ-ЯКИЙ елемент цього ключа в проходженому
 * діапазоні (доки сам рядок не проштовхнеться і не вилетить з outbox через
 * `removeMutationsFromOutbox`).
 */
export function deduplicateOutbox(items: OutboxItem[]): OutboxItem[] {
  const map = new Map<string, OutboxItem>();
  for (const item of items) {
    const key = `${item.collection}:${item.local_id}:${item.stream ?? 'personal'}`;
    const force = item.force || map.get(key)?.force;
    map.set(key, force ? { ...item, force: true } : item);
  }
  return Array.from(map.values());
}

export async function loadOutbox(): Promise<OutboxItem[]> {
  const stored = await loadData<OutboxItem[]>(OUTBOX_KEY, []);
  const upgraded = ensureMutationIds(stored);
  if (upgraded.some((item, index) => item !== stored[index])) {
    await saveData(OUTBOX_KEY, upgraded);
  }
  return upgraded;
}

export async function saveOutbox(items: OutboxItem[]): Promise<void> {
  await saveData(OUTBOX_KEY, ensureMutationIds(items));
}

/** Додає нові записи до outbox, дедупліціруючи з наявними. */
export async function appendToOutbox(newItems: OutboxItem[]): Promise<void> {
  if (!newItems.length) return;
  await withStorageLock(OUTBOX_KEY, async () => {
    const existing = await loadOutbox();
    const combined = deduplicateOutbox([...existing, ...ensureMutationIds(newItems)]);
    await saveOutbox(combined);
  });
}

/** Remove only confirmed mutations, preserving a newer edit of the same row. */
export async function removeMutationsFromOutbox(mutationIds: Set<string>): Promise<void> {
  if (!mutationIds.size) return;
  await withStorageLock(OUTBOX_KEY, async () => {
    const current = await loadOutbox();
    await saveOutbox(
      current.filter(item => !item.mutation_id || !mutationIds.has(item.mutation_id)),
    );
  });
}

/** Видаляє записи з outbox за набором ключів collection:local_id. */
export async function removeFromOutbox(keys: Set<string>): Promise<void> {
  if (!keys.size) return;
  await withStorageLock(OUTBOX_KEY, async () => {
    const current = await loadOutbox();
    const filtered = current.filter(i => !keys.has(`${i.collection}:${i.local_id}`));
    await saveOutbox(filtered);
  });
}

/**
 * Видаляє з outbox УСІ рядки заданого потоку — вихід із проєкту, видалення
 * проєкту, втрата доступу (WORKSPACE_PROJECTS_CONTRACT §9.4): непроштовхнуті
 * мутації того потоку більше нікуди слати, інакше вони лежали б у черзі
 * назавжди й тримали б лічильник pending ненульовим.
 */
export async function removeOutboxByStream(stream: string): Promise<void> {
  await withStorageLock(OUTBOX_KEY, async () => {
    const current = await loadOutbox();
    const filtered = current.filter(item => item.stream !== stream);
    if (filtered.length !== current.length) await saveOutbox(filtered);
  });
}

/**
 * Перепризначає `stream` наявним рядкам outbox за поточним вмістом сховища.
 *
 * Потрібно рівно один раз — одразу після §3.6-міграції: запис, чий
 * `projectId` тепер належить щойно мігрованому проєкту, міг устигнути
 * потрапити в outbox ДО міграції як 'personal' (резолвер тоді ще не бачив
 * цей проєкт у `myProjectIds`). Без переприв'язки такий рядок і далі штовхався
 * б в особистий потік — просто на серверний тумбстоун `_movedTo` цього ж
 * local_id, з конфліктом, вирішеним на користь «локальної» сторони (force),
 * що тихо воскрешало б запис назад у особистому просторі.
 */
export async function revalidateOutboxStreams(): Promise<void> {
  if (!_resolveStream) return;
  await withStorageLock(OUTBOX_KEY, async () => {
    const current = await loadOutbox();
    if (!current.length) return;
    const cache = new Map<string, Record<string, unknown>[]>();
    const next: OutboxItem[] = [];
    let changed = false;
    for (const item of current) {
      if (item.deleted) { next.push(item); continue; } // тумбстоун — запису вже нема де шукати
      let rows = cache.get(item.collection);
      if (!rows) {
        const loaded = await loadData<unknown>(item.collection, []);
        rows = Array.isArray(loaded) ? (loaded as Record<string, unknown>[]) : [];
        cache.set(item.collection, rows);
      }
      const record = rows.find(row => row.id === item.local_id);
      const stream = await resolveStreamFor(item.collection, item.local_id, record);
      if (stream !== item.stream) changed = true;
      next.push({ ...item, stream });
    }
    if (changed) await saveOutbox(next);
  });
}

/**
 * Позначає елемент як dirty вручну (наприклад, force-push при вирішенні
 * конфлікту). `stream` — явний потік для викликача, що вже його знає
 * (конфлікт проєктного обміну в `store/project-sync.ts`); особистий обмін
 * (`store/sync-engine.tsx`) його не передає — там записи вже в 'personal'.
 */
export async function markDirty(
  collection: string,
  local_id: string,
  deleted = false,
  force = false,
  stream?: string,
): Promise<void> {
  const item: OutboxItem = {
    mutation_id: createMutationId(),
    collection,
    local_id,
    deleted,
    force: force || undefined,
    queued_at: Date.now(),
    stream,
  };
  await appendToOutbox([item]);
  if (stream) notifyProjectStreams([stream]);
  else notifySyncScheduler();
}

// ─── diffItems (чиста функція, тестабельна) ───────────────────────────────────

export interface DiffResult {
  changed: string[]; // local_ids нових або змінених
  deleted: string[]; // local_ids зниклих
}

/**
 * Порівняльний відбиток запису — БЕЗ `updatedAt`.
 *
 * `updatedAt` проставляється в сховищі (див. stampUpdatedAt), а екрани тримають
 * items у React-стані, завантаженому раніше. Якби `updatedAt` брав участь у
 * порівнянні, кожне збереження бачило б розбіжність «у сховищі штамп є, у стані
 * ще немає» і позначало б змінними геть усі записи колекції.
 */
function comparableJson(item: Record<string, unknown>): string {
  const { updatedAt: _ignored, ...rest } = item;
  return JSON.stringify(rest);
}

export function diffItems<T extends { id: string }>(
  prev: T[],
  next: T[],
): DiffResult {
  const prevMap = new Map(prev.map(i => [i.id, comparableJson(i)]));
  const nextMap = new Map(next.map(i => [i.id, comparableJson(i)]));

  const changed: string[] = [];
  for (const [id, json] of nextMap) {
    if (!prevMap.has(id) || prevMap.get(id) !== json) {
      changed.push(id);
    }
  }

  const deleted: string[] = [];
  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) {
      deleted.push(id);
    }
  }

  return { changed, deleted };
}

// ─── stampUpdatedAt (чиста функція, тестабельна) ─────────────────────────────

/** Будь-який синхронізований запис несе час останньої правки на клієнті. */
export interface Timestamped {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

/**
 * Проставляє `updatedAt` перед записом у сховище.
 *
 * - змінені/нові → поточний час;
 * - незмінені → зберігають наявний штамп;
 * - незмінені без штампа → бекфіл із `createdAt` (а якщо його немає — поточний
 *   час). Це ліниве доповнення для даних, створених до введення поля.
 *
 * Централізовано саме тут, щоб не правити 57 місць виклику saveSynced: усе, що
 * лягає в сховище, гарантовано має штамп, навіть якщо екран його не проставив.
 */
export function stampUpdatedAt<T extends Timestamped>(
  prev: T[],
  next: T[],
  changedIds: Set<string>,
  now: string,
  collection?: string,
): T[] {
  const prevById = new Map(prev.map(item => [item.id, item]));
  return next.map(item => {
    if (changedIds.has(item.id)) {
      const stamped = { ...item, updatedAt: now };
      // Лише задачі: у ідей теж є status, але подій виконання вони не мають.
      return collection === 'tasks'
        ? withCompletionEvent(prevById.get(item.id) as Parameters<typeof withCompletionEvent>[0], stamped as never, now)
        : stamped;
    }
    const existing = prevById.get(item.id)?.updatedAt ?? item.updatedAt;
    return { ...item, updatedAt: existing ?? item.createdAt ?? now };
  });
}

// ─── Локальні поля запису (DI-05) ────────────────────────────────────────────

/**
 * Поля, що описують стан ЦЬОГО пристрою, а не сам запис, і тому не мають
 * ані їхати на сервер, ані прилітати з нього.
 *
 * Це ідентифікатори локальних нотифікацій: `med_<id>_<i>` для ліків,
 * `habit_<id>` для звичок, разовий id для щеплень і медоглядів. Вони видані
 * ОС конкретного пристрою — на іншому пристрої такої запланованої
 * нотифікації просто немає. Коли вони їхали разом із записом, виходило дві
 * брехні одразу: ліки, заведені на планшеті, приїжджали на телефон із
 * заповненим `notifIds` (тобто «нагадування стоїть»), хоча телефон нічого не
 * планував; а ліки, вимкнені на планшеті (`notifIds: []`), стирали id на
 * телефоні, і скасувати там реальне нагадування вже не було чим.
 *
 * Планування/скасування — справа `store/notifications.ts` і екранів: шар
 * даних лише перестає видавати чуже за своє.
 */
export const LOCAL_ONLY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  health_meds: ['notifIds'],
  health_habits: ['notifId'],
  health_vaccines: ['notifId'],
  health_checkups: ['notifId'],
};

/** Копія запису без локальних полів — рівно те, що можна віддати серверу. */
export function stripLocalOnlyFields<T extends Record<string, unknown>>(
  collection: string,
  data: T,
): T {
  const fields = LOCAL_ONLY_FIELDS[collection];
  if (!fields) return data;
  let copy: Record<string, unknown> | null = null;
  for (const field of fields) {
    if (!(field in data)) continue;
    if (!copy) copy = { ...data };
    delete copy[field];
  }
  return (copy ?? data) as T;
}

/**
 * Запис із сервера + локальні поля ЦЬОГО пристрою: у наявного запису вони
 * зберігаються як були, у новому (заведеному на іншому пристрої) їх немає
 * зовсім — нагадування тут ще ніхто не планував.
 */
export function withLocalOnlyFields<T extends { id: string }>(
  collection: string,
  incoming: T,
  existing: T | undefined,
): T {
  const fields = LOCAL_ONLY_FIELDS[collection];
  if (!fields) return incoming;
  const next = { ...(incoming as unknown as Record<string, unknown>) };
  const prev = existing as unknown as Record<string, unknown> | undefined;
  for (const field of fields) {
    if (prev && field in prev) next[field] = prev[field];
    else delete next[field];
  }
  return next as unknown as T;
}

// ─── applyPullItems (чиста функція, тестабельна) ──────────────────────────────

/**
 * Застосовує список items із відповіді сервера до локального масиву.
 * Пропускає items, що є у dirtyIds (dirty-wins).
 */
export function applyPullItems<T extends { id: string }>(
  local: T[],
  serverItems: { local_id: string; data: any; deleted: boolean }[],
  dirtyIds: Set<string>, // format: "collection:local_id"
  collection: string,
): T[] {
  const map = new Map(local.map(i => [i.id, i]));

  for (const si of serverItems) {
    const fullKey = `${collection}:${si.local_id}`;
    if (dirtyIds.has(fullKey)) continue; // dirty-wins

    // WORKSPACE_PROJECTS_CONTRACT §3.5/§3.6: особистий тумбстоун «переміщено
    // в проєкт» (§3.6-міграція ставить data._movedTo на тумбстоун UserItem)
    // ІГНОРУЄТЬСЯ — той самий local_id живе далі під потоком проєкту (той
    // pull або вже приніс, або ще принесе його актуальну версію). Без цього
    // видалення з особистого /sync/ приходило б і стирало щойно
    // синхронізований запис проєкту, коли обидва потоки тягнуть той самий
    // localId в один і той самий масив сховища.
    if (si.deleted && si.data && typeof si.data === 'object' && si.data._movedTo) continue;

    if (si.deleted) {
      map.delete(si.local_id);
    } else {
      // Локальні поля (id нотифікацій цього пристрою) не заміщаються
      // серверними — див. LOCAL_ONLY_FIELDS.
      map.set(si.local_id, withLocalOnlyFields(
        collection,
        { id: si.local_id, ...(si.data ?? {}) } as T,
        map.get(si.local_id),
      ));
    }
  }

  return Array.from(map.values());
}

// ─── saveSynced / updateSynced ────────────────────────────────────────────────

/**
 * Ідентифікатори, які викликач `saveSynced` для цього ключа вже колись
 * ПОКАЗУВАВ — тобто ті, про які він знає (DI-01).
 *
 * Навіщо: `saveSynced(key, items)` не несе в собі різниці «користувач видалив
 * запис» і «викликач ніколи цього запису не бачив». Екран тримає весь масив у
 * React-стані, читає ключ раз на монтуванні й не підписаний на зміни, тож
 * запис, який приїхав синком у живу вкладку, у його стані відсутній — і
 * наступне збереження оголошувало його видаленим (тумбстоун в outbox → запис
 * зникав із сервера й з усіх пристроїв).
 *
 * Правило: `saveSynced` має право поставити тумбстоун ЛИШЕ на запис, який цей
 * ключ уже отримував у попередньому `items` (або який лежав у сховищі на
 * момент ПЕРШОГО запису в цьому запуску — там масив викликача і є повною
 * правдою: відновлення з копії, міграція, перший ефект-дзеркало після
 * читання). Усе інше — чуже й невідоме — зберігається як є.
 *
 * Набір лише росте: ключ до нього — id, а не вміст, тож пам'ять — рядки id
 * колекції. Скидається `resetSyncedKnownIds` (зміна власника даних, «очистити
 * всі дані», тести).
 */
const knownIdsByKey = new Map<string, Set<string>>();

/** Скидає пам'ять «що викликач уже показував» — для одного ключа або всіх. */
export function resetSyncedKnownIds(key?: string): void {
  if (key === undefined) knownIdsByKey.clear();
  else knownIdsByKey.delete(key);
}

/**
 * Масив для запису: `items` викликача плюс записи сховища, яких він ніколи не
 * бачив. `known === undefined` (перший запис у ключ за цей запуск) — поведінка
 * як була: масив викликача заміщає вміст ключа цілком.
 *
 * Чужі записи дописуються в КІНЕЦЬ: порядок `items` — це порядок, який
 * намалював екран, і зсувати його не можна.
 */
export function mergeUnknownRecords<T extends { id: string }>(
  existing: readonly T[],
  items: T[],
  known: ReadonlySet<string> | undefined,
): T[] {
  if (!known) return items;
  const itemIds = new Set(items.map(item => item.id));
  const unknown = existing.filter(record => !itemIds.has(record.id) && !known.has(record.id));
  return unknown.length ? [...items, ...unknown] : items;
}

export async function saveSynced<T extends { id: string }>(
  key: string,
  items: T[],
): Promise<void> {
  const known = knownIdsByKey.get(key);
  await updateSynced<T>(key, existing => mergeUnknownRecords(existing, items, known));
  // Після успішного запису все, що викликач показав, стає «відомим» — і з
  // наступного разу він має право це видаляти.
  const next = known ?? new Set<string>();
  for (const item of items) next.add(item.id);
  knownIdsByKey.set(key, next);
}

/**
 * Read-modify-write масиву ЦІЛКОМ під блокуванням ключа:
 * прочитати → `mutate(fresh)` → штамп updatedAt → запис → outbox.
 *
 * Навіщо, а не «loadData, потім saveSynced»: між тими двома викликами рушій
 * синку міг покласти в сховище щойно стягнутий запис. saveSynced перечитав би
 * його як `existing`, не знайшов би в `next` і поставив би DELETE — тобто
 * видалив би на сервері те, що щойно створили на вебі. Тут читання, мутація
 * й запис — одна операція в черзі ключа, pull між ними не вклиниться.
 *
 * `mutate` викликається рівно один раз, синхронно, під блокуванням — усередині
 * не можна знову писати той самий ключ (дедлок). Повернув той самий масив —
 * запису немає. Повертає масив, що лежить у сховищі після операції.
 * Не-масив у сховищі — помилка: перезапис стер би чужі дані.
 */
export async function updateSynced<T extends { id: string }>(
  key: string,
  mutate: (fresh: T[]) => T[],
): Promise<T[]> {
  // Зберігаємо дані та обчислюємо diff — під блокуванням ключа, щоб між
  // читанням і записом сюди не вклинився рушій синку зі своїм масивом.
  const { stored, changed, deleted, touchedStreams } = await withStorageLock(key, async () => {
    const raw = await loadData<unknown>(key, []);
    if (!Array.isArray(raw)) throw new Error(`${key}: unexpected storage shape`);
    const existing = raw as T[];
    const items = mutate(existing);
    if (items === existing) return { stored: existing, changed: [], deleted: [], touchedStreams: new Set<string>() };
    const diff = diffItems(existing, items);

    // Штампуємо updatedAt і зберігаємо. Робиться навіть коли змін немає — так
    // ліниво доповнюються записи, створені до введення поля.
    const stamped = stampUpdatedAt(
      existing as unknown as Timestamped[],
      items as unknown as Timestamped[],
      new Set(diff.changed),
      new Date().toISOString(),
      key,
    ) as unknown as T[];
    await saveData(key, stamped);
    // В outbox — ще під блокуванням колекції: рушій синку перечитує outbox під
    // тим самим блокуванням перед застосуванням серверних змін, і правка має
    // бути для нього «брудною» з тієї ж миті, як лягла в сховище.
    //
    // Для changed беремо дані з НОВОГО (stamped) стану, для deleted — зі
    // СТАРОГО (existing): запису вже нема в stamped, а стрім видалення
    // визначає саме те, де запис ЛЕЖАВ (його projectId до видалення).
    const touchedStreams = await enqueueChanges(
      key, diff.changed, diff.deleted,
      recordsById(stamped as unknown as { id: string }[]),
      recordsById(existing as unknown as { id: string }[]),
    );
    return { stored: stamped, ...diff, touchedStreams };
  });

  if (changed.length || deleted.length) {
    notifySyncScheduler();
    notifyProjectStreams(touchedStreams);
  }
  return stored;
}

function recordsById(items: readonly { id: string }[]): Map<string, Record<string, unknown>> {
  return new Map(items.map(item => [item.id, item as unknown as Record<string, unknown>]));
}

/**
 * Ставить змінені/видалені записи в outbox. Планувальник НЕ будить — це
 * робить викликач після того, як відпустить блокування.
 *
 * `changedRecords` — НОВИЙ вміст запису (для резолвера потоку, §3.5 outbox
 * routing); `beforeRecords` — вміст ДО цього запису: потрібен і для
 * видалення (щоб знати, чий це був `projectId`), і для змінених — щоб
 * помітити переміщення між потоками (нижче).
 */
/** Проєктні потоки, зачеплені цим `enqueueChanges` — для негайного пробудження `store/project-sync.ts` після зняття блокування. */
async function enqueueChanges(
  key: string,
  changed: string[],
  deleted: string[],
  changedRecords: Map<string, Record<string, unknown>>,
  beforeRecords: Map<string, Record<string, unknown>>,
): Promise<Set<string>> {
  const touchedStreams = new Set<string>();
  // Якщо нема змін — не чіпаємо outbox
  if (!changed.length && !deleted.length) return touchedStreams;

  const now = Date.now();
  const outboxItems: OutboxItem[] = [];

  for (const id of changed) {
    const newStream = await resolveStreamFor(key, id, changedRecords.get(id));
    outboxItems.push({
      mutation_id: createMutationId(), collection: key, local_id: id,
      deleted: false, queued_at: now, stream: newStream,
    });
    if (newStream) touchedStreams.add(newStream);

    // §3.5 «Зміна projectId запису (переміщення між потоками) = дві мутації»:
    // якщо запис ІСНУВАВ і належав ІНШОМУ потоку — явний delete у старому,
    // інакше стара копія лишається «живою» на сервері під колишнім projectId
    // назавжди (upsert у новому потоці її звідти не прибирає — це два різні
    // курсори/ProjectItem). Новий запис (`created` у diffLocalChanges/diffItems
    // не проходить сюди як "before") — before відсутній, delete не ставимо.
    const before = beforeRecords.get(id);
    if (before) {
      const oldStream = await resolveStreamFor(key, id, before);
      if (oldStream !== newStream) {
        outboxItems.push({
          mutation_id: createMutationId(), collection: key, local_id: id,
          deleted: true, queued_at: now, stream: oldStream,
        });
        if (oldStream) touchedStreams.add(oldStream);
      }
    }
  }

  for (const id of deleted) {
    const stream = await resolveStreamFor(key, id, beforeRecords.get(id));
    outboxItems.push({
      mutation_id: createMutationId(), collection: key, local_id: id,
      deleted: true, queued_at: now, stream,
    });
    if (stream) touchedStreams.add(stream);
  }

  await appendToOutbox(outboxItems);
  return touchedStreams;
}

// ─── Локальні зміни по-запису (замість «зберегти весь масив») ────────────────

/** Один запис, змінений локально: лише поля, які змінились. */
export interface LocalUpsert<T> {
  id: string;
  /** Нові значення змінених полів; для нового запису — увесь запис. */
  patch: Partial<T>;
  /** Поля, які локально прибрали (були — стали відсутні/undefined). */
  removed: string[];
  /** Запис цілком — потрібен, коли в сховищі його вже/ще немає. */
  full: T;
  /** true — запису не було в базовому стані (створено локально). */
  created: boolean;
  /** Новий запис стоїть у стані перед усіма наявними — іде на початок. */
  leading: boolean;
}

export interface LocalChangeSet<T> {
  upserts: LocalUpsert<T>[];
  deletes: string[];
}

const fieldJson = (value: unknown): string | undefined =>
  value === undefined ? undefined : JSON.stringify(value);

/**
 * Що змінив САМ екран між двома своїми станами.
 *
 * Порівнюються два стани в пам'яті (до і після локальної дії), а НЕ стан
 * екрана зі сховищем. Саме порівняння зі сховищем і було джерелом втрат:
 * екран із застарілим списком «бачив», що задачі, доданої на вебі, у нього
 * немає, і saveSynced відправляв її на сервер як видалену.
 *
 * Незмінені записи в стані — ті самі об'єкти (p.map(t => t.id === id ? … : t)),
 * тож для них достатньо порівняння посилань і JSON рахується лише для
 * справді зачеплених записів.
 */
export function diffLocalChanges<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
): LocalChangeSet<T> {
  const beforeById = new Map<string, T>();
  for (const item of before) beforeById.set(item.id, item);

  const upserts: LocalUpsert<T>[] = [];
  const seen = new Set<string>();
  let sawExisting = false;
  for (const item of after) {
    seen.add(item.id);
    const prev = beforeById.get(item.id);
    if (!prev) {
      upserts.push({
        id: item.id, patch: { ...item }, removed: [], full: item, created: true, leading: !sawExisting,
      });
      continue;
    }
    sawExisting = true;
    if (prev === item) continue;
    const patch: Record<string, unknown> = {};
    const removed: string[] = [];
    const prevRec = prev as unknown as Record<string, unknown>;
    const nextRec = item as unknown as Record<string, unknown>;
    const fields = new Set([...Object.keys(prevRec), ...Object.keys(nextRec)]);
    for (const field of fields) {
      if (field === 'id' || field === 'updatedAt') continue;
      const nextJson = fieldJson(nextRec[field]);
      if (fieldJson(prevRec[field]) === nextJson) continue;
      if (nextJson === undefined) removed.push(field);
      else patch[field] = nextRec[field];
    }
    if (Object.keys(patch).length || removed.length) {
      upserts.push({
        id: item.id, patch: patch as Partial<T>, removed, full: item, created: false, leading: false,
      });
    }
  }

  const deletes: string[] = [];
  for (const item of before) {
    if (!seen.has(item.id)) deletes.push(item.id);
  }
  return { upserts, deletes };
}

export function hasLocalChanges<T>(changes: LocalChangeSet<T>): boolean {
  return changes.upserts.length > 0 || changes.deletes.length > 0;
}

/**
 * Накладає локальні зміни на СВІЖИЙ вміст сховища.
 *
 * - змінений запис: у свіжу версію пишуться лише змінені поля — чужі правки
 *   інших полів того самого запису (з вебу, з іншого пристрою) лишаються
 *   (last write wins по полю, а не по запису);
 * - запис, якого в сховищі вже немає (видалили деінде), відновлюється цілком
 *   лише якщо його локально правили — правка важить більше за чуже видалення;
 * - новий запис: якщо в `after` він стояв перед першим наявним — іде на
 *   початок (так екрани додають нове), інакше — в кінець;
 * - видалення: лише того, що локально прибрали, і лише якщо воно ще є.
 *
 * Повертає новий масив і id, які РЕАЛЬНО змінились відносно сховища —
 * повторне застосування тих самих змін нічого не ставить в outbox.
 */
export function applyLocalChanges<T extends { id: string }>(
  stored: readonly T[],
  changes: LocalChangeSet<T>,
): { next: T[]; changed: string[]; deleted: string[] } {
  const upsertById = new Map(changes.upserts.map(u => [u.id, u]));
  const deleteIds = new Set(changes.deletes);
  const storedIds = new Set(stored.map(item => item.id));

  const changed: string[] = [];
  const deleted: string[] = [];
  const merged: T[] = [];
  for (const item of stored) {
    if (deleteIds.has(item.id)) {
      deleted.push(item.id);
      continue;
    }
    const upsert = upsertById.get(item.id);
    if (!upsert) {
      merged.push(item);
      continue;
    }
    const next = { ...(item as unknown as Record<string, unknown>), ...(upsert.patch as Record<string, unknown>) };
    for (const field of upsert.removed) delete next[field];
    if (comparableJson(next) === comparableJson(item as unknown as Record<string, unknown>)) {
      merged.push(item);
    } else {
      merged.push(next as unknown as T);
      changed.push(item.id);
    }
  }

  const leading: T[] = [];
  const trailing: T[] = [];
  for (const upsert of changes.upserts) {
    // Уже є в сховищі — злито вище. Інакше це або новий запис, або локально
    // правлений запис, який тим часом видалили деінде: відновлюємо цілком.
    if (storedIds.has(upsert.id)) continue;
    (upsert.leading ? leading : trailing).push(upsert.full);
    changed.push(upsert.id);
  }

  return { next: [...leading, ...merged, ...trailing], changed, deleted };
}

/**
 * Зберігає ЛИШЕ локальні зміни колекції (див. diffLocalChanges / applyLocalChanges).
 *
 * На відміну від saveSynced, ніколи не виводить видалення з того, що в масиві
 * екрана чогось бракує відносно сховища. Повертає масив, що ліг у сховище
 * (свіжий + локальні зміни), або null, якщо змін не було й запису не робилось.
 */
export async function saveSyncedChanges<T extends { id: string }>(
  key: string,
  before: readonly T[],
  after: readonly T[],
): Promise<T[] | null> {
  const changes = diffLocalChanges(before, after);
  if (!hasLocalChanges(changes)) return null;

  const result = await withStorageLock(key, async () => {
    const storedRaw = await loadData<unknown>(key, []);
    const stored = Array.isArray(storedRaw) ? (storedRaw as T[]) : [];
    const applied = applyLocalChanges(stored, changes);
    if (!applied.changed.length && !applied.deleted.length) {
      return { ...applied, next: stored, touchedStreams: new Set<string>() };
    }
    const stamped = stampUpdatedAt(
      stored as unknown as Timestamped[],
      applied.next as unknown as Timestamped[],
      new Set(applied.changed),
      new Date().toISOString(),
      key,
    ) as unknown as T[];
    await saveData(key, stamped);
    // changed → новий стан (stamped), deleted → те, що лежало в stored до
    // видалення — та сама логіка, що й у updateSynced вище.
    const touchedStreams = await enqueueChanges(
      key, applied.changed, applied.deleted,
      recordsById(stamped as unknown as { id: string }[]),
      recordsById(stored as unknown as { id: string }[]),
    );
    return { ...applied, next: stamped, touchedStreams };
  });

  if (result.changed.length || result.deleted.length) {
    notifySyncScheduler();
    notifyProjectStreams(result.touchedStreams);
  }
  return result.next;
}

// ─── saveSyncedValue (singleton) ──────────────────────────────────────────────

export async function saveSyncedValue(key: string, value: unknown): Promise<void> {
  await saveData(key, value);
  const item: OutboxItem = {
    mutation_id: createMutationId(),
    collection: key,
    local_id: key,
    deleted: false,
    queued_at: Date.now(),
  };
  await appendToOutbox([item]);
  notifySyncScheduler();
}
