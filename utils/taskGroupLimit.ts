/**
 * utils/taskGroupLimit.ts — порядок колонки дошки: щойно створені першими.
 *
 * Дзеркало web `lib/task-group-limit.ts` з ТИМИ САМИМИ назвами функцій
 * (`limitGroup`, `isRecentlyCreated`, `limitBoardColumn`). Паритет закріплює
 * спільна фікстура `__tests__/fixtures/board-column-order-parity.json`
 * (побайтова копія web `lib/__fixtures__/board-column-order-parity.json`).
 *
 * Рішення власника (пункт 7+8): щойно створена задача — ПЕРША в колонці
 * дошки. Звичайний порядок колонки — пріоритет → дедлайн → назва, тож нова
 * задача без дедлайну падала в хвіст, і на довгій колонці її доводилось
 * шукати прокруткою. «Щойно створена» = `createdAt` за останні
 * `RECENTLY_CREATED_WINDOW_MS` — саме час створення, а не «створена в цьому
 * сеансі»: так само піднімається задача, заведена з іншого пристрою, і
 * правило переживає перезапуск.
 *
 * Ліміту карток на мобільній дошці немає, тому тут `limit` за замовчуванням —
 * Infinity (на вебі — 15); поведінка з однаковим `limit` однакова.
 */

export interface LimitedGroup<T> {
  /** Те, що рендериться в групі. */
  visible: T[];
  /** Повний розмір групи. */
  total: number;
  /** Чи є прихований хвіст. */
  truncated: boolean;
}

export function limitGroup<T>(items: readonly T[], limit: number = Infinity): LimitedGroup<T> {
  const safeLimit = Math.max(0, Math.floor(limit));
  const truncated = items.length > safeLimit;
  return {
    visible: truncated ? items.slice(0, safeLimit) : [...items],
    total: items.length,
    truncated,
  };
}

export const RECENTLY_CREATED_WINDOW_MS = 10 * 60 * 1000;

export function isRecentlyCreated(
  task: { createdAt?: string | null },
  now: number,
  windowMs: number = RECENTLY_CREATED_WINDOW_MS,
): boolean {
  if (!task.createdAt) return false;
  const created = Date.parse(task.createdAt);
  if (!Number.isFinite(created)) return false;
  // Невеликий «час з майбутнього» (розбіжність годинників пристроїв) теж
  // рахується щойно створеним, але не безмежно — інакше зіпсована дата
  // тримала б задачу нагорі назавжди.
  const age = now - created;
  return age < windowMs && age > -windowMs;
}

/**
 * Колонка дошки: щойно створені — першими (найновіша вгорі), решта — у
 * вхідному порядку й обрізається лімітом. Щойно створені у `visible` завжди
 * всі, навіть якщо їх більше за ліміт.
 */
export function limitBoardColumn<T extends { createdAt?: string | null }>(
  items: readonly T[],
  now: number,
  limit: number = Infinity,
  windowMs: number = RECENTLY_CREATED_WINDOW_MS,
): LimitedGroup<T> {
  const recent: T[] = [];
  const rest: T[] = [];
  for (const item of items) (isRecentlyCreated(item, now, windowMs) ? recent : rest).push(item);
  recent.sort((a, b) => Date.parse(b.createdAt as string) - Date.parse(a.createdAt as string));
  const restGroup = limitGroup(rest, Math.max(0, Math.floor(limit) - recent.length));
  const visible = [...recent, ...restGroup.visible];
  return { visible, total: items.length, truncated: visible.length < items.length };
}
