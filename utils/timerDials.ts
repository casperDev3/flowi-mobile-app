/**
 * utils/timerDials.ts — перелік циферблатів активного таймера.
 *
 * Маніфест лежить окремо від компонентів із тієї ж причини, що й constants/nav:
 * його читають троє — сітка повноекранного режиму, перемикач і сховище. Усі
 * мусять погоджуватися, які взагалі бувають циферблати, інакше збережений
 * вибір колись перестане існувати, а екран мовчки покаже порожнечу.
 *
 * Чого тут навмисно немає — самих компонентів. Імпорт малювання сюди зробив би
 * цей файл залежним від react-native-svg, а його читає й сховище.
 */
import type { Translations } from '@/store/translations';

export type DialId =
  | 'digits'
  | 'rings'
  | 'chrono'
  | 'flip'
  | 'dots'
  | 'arc'
  | 'hourglass'
  | 'orbit'
  | 'segment'
  | 'tape';

export interface DialMeta {
  id: DialId;
  labelKey: keyof Translations;
}

/**
 * Порядок у перемикачі — від найчитабельнішого до найбільш декоративного, а не
 * за датою появи: перший варіант у списку люди пробують найчастіше, і ним має
 * бути той, що ніколи не підводить.
 */
export const DIALS: readonly DialMeta[] = [
  { id: 'digits',    labelKey: 'dialDigits' },
  { id: 'segment',   labelKey: 'dialSegment' },
  { id: 'flip',      labelKey: 'dialFlip' },
  { id: 'rings',     labelKey: 'dialRings' },
  { id: 'arc',       labelKey: 'dialArc' },
  { id: 'chrono',    labelKey: 'dialChrono' },
  { id: 'orbit',     labelKey: 'dialOrbit' },
  { id: 'hourglass', labelKey: 'dialHourglass' },
  { id: 'dots',      labelKey: 'dialDots' },
  { id: 'tape',      labelKey: 'dialTape' },
];

/**
 * Цифри — і за замовчуванням, і запасний варіант.
 *
 * Не з обережності: таймер існує, щоб показувати час, і циферблат, який не
 * читається з першого погляду, гірший за нудний. Решта — вибір поверх цього,
 * а не заміна йому.
 */
export const DEFAULT_DIAL: DialId = 'digits';

const KNOWN = new Set<string>(DIALS.map(d => d.id));

/**
 * Збережене значення → чинний DialId.
 *
 * Зі сховища може прийти будь-що: циферблат, прибраний у новій версії,
 * зіпсований бекап, ручна правка через екран даних. Показати порожнє місце
 * замість годинника гірше, ніж показати цифри.
 */
export function parseDialId(raw: unknown): DialId {
  return typeof raw === 'string' && KNOWN.has(raw) ? (raw as DialId) : DEFAULT_DIAL;
}

/**
 * Мапа «таймер → циферблат». Ключ — id таймера з реєстру active_timers.
 *
 * Зберігається окремо від самих таймерів, а не полем ActiveTimer: реєстр
 * переписується на кожному старті/стопі, і вибір вигляду не має їхати разом
 * із ним. Колись мапа жила лише локально ('timer_dials'); тепер джерело —
 * синхронізований singleton 'timer_dial_prefs' (див. нижче), а локальна мапа —
 * запасне джерело лише для читання.
 */
export type DialMap = Record<string, DialId>;

/** Циферблат конкретного таймера. Не обраний — цифри. */
export function dialForTimer(map: DialMap | undefined, timerId: string): DialId {
  return parseDialId(map?.[timerId]);
}

/**
 * Прибирає вибір для таймерів, яких уже немає.
 *
 * Без цього мапа росла б вічно: кожен колись запущений вільний таймер має
 * випадковий id і лишав би по собі рядок назавжди. Повертає ТОЙ САМИЙ обʼєкт,
 * якщо чистити нема чого, — щоб не будити зайвий запис у сховище.
 */
export function pruneDialMap(map: DialMap, liveIds: readonly string[]): DialMap {
  const live = new Set(liveIds);
  const keys = Object.keys(map);
  if (keys.every(k => live.has(k))) return map;
  const next: DialMap = {};
  for (const k of keys) if (live.has(k)) next[k] = map[k];
  return next;
}

// ─── Синхронізований вибір (колекція timer_dial_prefs) ───────────────────────
//
// Вибір циферблата тепер їде між пристроями: той самий таймер на телефоні, у
// вебі й на планшеті показує той самий циферблат, а «типовий» задається один
// раз на всіх. Контракт — CONTRACT.md §F.2; веб (lib/dials.ts) має ті самі
// функції з тією самою семантикою.
//
// Назва ключа НАВМИСНО відрізняється від локального 'timer_dials': ключ із тією
// самою назвою рушій синку перебрав би на себе, і стара форма («голий» об'єкт
// id → циферблат) була б затерта новою. Локальна мапа лишається як запасне
// джерело лише для читання — її ніхто не видаляє.

/** Ключ синхронізованого singleton. */
export const TIMER_DIAL_PREFS_KEY = 'timer_dial_prefs';

export interface TimerDialPrefs {
  version: 1;
  /** Глобальний типовий циферблат. Спершу — цифри. */
  defaultDial: DialId;
  /**
   * id таймера ('task:…', 'meeting:…', 'adhoc:…') → циферблат. Значення
   * зберігається явно, навіть коли збігається з типовим: інакше зміна типового
   * мовчки перемальовувала б таймери, для яких вибір уже зробили.
   */
  timers: DialMap;
  /** ISO, ставить той, хто пише. */
  updatedAt?: string;
  /** Невідомі поля від новіших клієнтів переживають запис (spread). */
  [extra: string]: unknown;
}

/** Порожні налаштування: типовий — цифри, персональних виборів немає. */
export function emptyDialPrefs(): TimerDialPrefs {
  return { version: 1, defaultDial: DEFAULT_DIAL, timers: {} };
}

/** Мапа з будь-чого: беремо лише пари «рядок → чинний циферблат». */
export function sanitizeDialMap(raw: unknown): DialMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: DialMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && parseDialId(value) === value) out[key] = value as DialId;
  }
  return out;
}

/**
 * Сире значення зі сховища → чинні налаштування ДЛЯ ПОКАЗУ.
 *
 * Не об'єкт / null / масив → порожні. Невідомий циферблат у мапі відкидається,
 * невідомий типовий → цифри. Невідомі поля верхнього рівня лишаються.
 *
 * ⚠ Лише для читання. Для запису — preserveDialPrefs: невідомий циферблат
 * тут «невідомий» лише ЦІЙ збірці; новіший клієнт міг додати одинадцятий, і
 * запис від санітизованого значення стер би чужий вибір на всіх пристроях.
 */
export function sanitizeDialPrefs(raw: unknown): TimerDialPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDialPrefs();
  const src = raw as Record<string, unknown>;
  const out: TimerDialPrefs = {
    ...src,
    version: 1,
    defaultDial: parseDialId(src.defaultDial),
    timers: sanitizeDialMap(src.timers),
  };
  if (typeof src.updatedAt !== 'string') delete out.updatedAt;
  return out;
}

/**
 * Налаштування в тому вигляді, в якому вони ЛЕЖАТЬ у сховищі: значення — будь-
 * які непорожні рядки, зокрема циферблати, яких ця збірка ще не знає.
 * TimerDialPrefs сумісний із цим типом, тож усюди, де приймається
 * StoredDialPrefs, годиться й санітизоване значення.
 */
export interface StoredDialPrefs {
  version: 1;
  defaultDial: string;
  timers: Record<string, string>;
  updatedAt?: string;
  [extra: string]: unknown;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Сире значення зі сховища → основа для ЗАПИСУ.
 *
 * На відміну від sanitizeDialPrefs нічого «незнайомого» не переписує:
 * типовий-рядок лишається як є, записи мапи з будь-яким непорожнім рядком
 * лишаються як є. Відкидається лише те, що не могло бути вибором узагалі
 * (не рядок / порожній рядок) — його не прочитає жоден клієнт.
 */
export function preserveDialPrefs(raw: unknown): StoredDialPrefs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDialPrefs();
  const src = raw as Record<string, unknown>;
  const timers: Record<string, string> = {};
  if (src.timers && typeof src.timers === 'object' && !Array.isArray(src.timers)) {
    for (const [key, value] of Object.entries(src.timers as Record<string, unknown>)) {
      if (isNonEmptyString(value)) timers[key] = value;
    }
  }
  const out: StoredDialPrefs = {
    ...src,
    version: 1,
    defaultDial: isNonEmptyString(src.defaultDial) ? src.defaultDial : DEFAULT_DIAL,
    timers,
  };
  if (typeof src.updatedAt !== 'string') delete out.updatedAt;
  return out;
}

/**
 * Який циферблат показати таймеру.
 *
 * Порядок (мобільний): синхронізований персональний вибір → старий локальний
 * вибір із 'timer_dials' → синхронізований типовий → цифри. Локальна мапа
 * стоїть ПЕРЕД типовим, бо це вибір, який людина вже зробила для цього таймера
 * до появи синку; типовий — лише значення «коли не обирали». Значення, яких ця
 * збірка не знає (новіший клієнт), пропускаються на наступний щабель.
 */
export function resolveDial(
  prefs: StoredDialPrefs | null | undefined,
  timerId: string,
  localMap?: Record<string, string> | null,
): DialId {
  const synced = prefs?.timers?.[timerId];
  if (typeof synced === 'string' && parseDialId(synced) === synced) return synced;
  const local = localMap?.[timerId];
  if (typeof local === 'string' && parseDialId(local) === local) return local;
  return parseDialId(prefs?.defaultDial);
}

/**
 * Прибирає персональний вибір ЛИШЕ для вільних таймерів, яких уже немає.
 *
 * `task:` і `meeting:` не чистяться ніколи: їхній id похідний від завдання чи
 * наради, і наступна сесія того самого завдання мусить отримати той самий
 * циферблат. Вільний таймер має випадковий id і більше не повториться — без
 * чистки мапа росла б вічно. Повертає ТОЙ САМИЙ об'єкт, якщо чистити нема чого.
 */
export function pruneAdhocDials<T extends Record<string, string>>(timers: T, liveIds: readonly string[]): T {
  const live = new Set(liveIds);
  const keys = Object.keys(timers);
  if (keys.every(k => !k.startsWith('adhoc:') || live.has(k))) return timers;
  const next: Record<string, string> = {};
  for (const k of keys) {
    if (!k.startsWith('adhoc:') || live.has(k)) next[k] = timers[k];
  }
  return next as T;
}

/**
 * Дописує в синхронізовані налаштування вибір зі старого локального
 * 'timer_dials' — лише для таймерів, у яких синхронізованого вибору ще НЕМАЄ.
 *
 * Без цього вибір, зроблений до синку, бачив би лише цей телефон: веб та інші
 * пристрої показували б типовий. Викликається тільки всередині запису, який
 * ініціював користувач. Нічого не переписує і не видаляє; сам локальний ключ
 * не чіпає (функція чиста). Переносяться `task:`/`meeting:` і лише ЖИВІ
 * `adhoc:` (мертвий вільний таймер однаково прибрала б чистка); якщо реєстр
 * ще не прочитаний (liveIds = null), вільні не переносяться зовсім.
 * Повертає ТОЙ САМИЙ об'єкт, якщо дописувати нема чого.
 */
export function mergeLocalDials(
  prefs: StoredDialPrefs,
  localMap: unknown,
  liveIds: readonly string[] | null,
): StoredDialPrefs {
  const local = sanitizeDialMap(localMap);
  const live = new Set(liveIds ?? []);
  let added: Record<string, string> | null = null;
  for (const [key, dial] of Object.entries(local)) {
    if (prefs.timers[key] !== undefined) continue;
    const eligible =
      key.startsWith('task:') ||
      key.startsWith('meeting:') ||
      (key.startsWith('adhoc:') && liveIds !== null && live.has(key));
    if (!eligible) continue;
    (added ??= {})[key] = dial;
  }
  if (!added) return prefs;
  return { ...prefs, timers: { ...prefs.timers, ...added } };
}

/**
 * Новий персональний вибір.
 *
 * Основа — preserveDialPrefs: міняється лише ключ цього таймера (і чистяться
 * мертві `adhoc:`); чужі значення, яких ця збірка не знає, лишаються як були.
 *
 * @param liveIds id таймерів, що йдуть зараз, або null, якщо реєстр ще не
 *   прочитаний: тоді НЕ чистимо нічого — «немає живих» до читання було б
 *   брехнею, і чистка стерла б вибір таймерів, які насправді йдуть.
 */
export function withTimerDial(
  prefs: StoredDialPrefs,
  timerId: string,
  dial: DialId,
  liveIds: readonly string[] | null,
  now: Date = new Date(),
): StoredDialPrefs {
  const base = preserveDialPrefs(prefs);
  const kept = liveIds ? pruneAdhocDials(base.timers, liveIds) : base.timers;
  return {
    ...base,
    timers: { ...kept, [timerId]: parseDialId(dial) },
    updatedAt: now.toISOString(),
  };
}

/** Новий глобальний типовий циферблат. Персональні вибори не чіпає зовсім. */
export function withDefaultDial(
  prefs: StoredDialPrefs,
  dial: DialId,
  now: Date = new Date(),
): StoredDialPrefs {
  return {
    ...preserveDialPrefs(prefs),
    defaultDial: parseDialId(dial),
    updatedAt: now.toISOString(),
  };
}
