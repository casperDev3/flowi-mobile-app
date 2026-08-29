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
 * Зберігається локально й окремо від самих таймерів. Класти цей вибір у поле
 * ActiveTimer було б дорожче й гірше: колекція синхронізована, тобто нове поле
 * довелося б провести через сервер і веб, а вибір вигляду для планшета на столі
 * приїхав би на телефон, де половина циферблатів у 44pt не читається.
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
