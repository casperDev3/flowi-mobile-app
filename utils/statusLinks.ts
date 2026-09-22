/**
 * utils/statusLinks.ts — відповідність статусів ПРОЄКТУ і ОСОБИСТОГО простору.
 *
 * Задача проєкту — один запис: вона ж показується в особистих «Завданнях»,
 * якщо призначена мені. Її `kanbanColumnId` — колонка ПРОЄКТУ (`st-<uuid4>`),
 * а в особистому просторі вона стоїть під «тією самою за змістом» особистою
 * колонкою. Правило користувача: «якщо є одна і та ж назва — туди; якщо
 * розбіжність — запитати, куди перенести». Тому порядок відповідності:
 *
 *   1. однакова назва (без регістру, зайвих пробілів, з уніфікованим апострофом);
 *   2. явний зв'язок, який людина обрала у відповідь на питання
 *      (`projectLinks` на ОСОБИСТІЙ колонці: {projectId: [id колонок проєкту]}).
 *
 * Нічого з цього — функції повертають null, і інтерактивний шлях питає
 * людину (Alert), а неінтерактивний (чекбокс, таймер, показ) падає на
 * `sourceStatusId` (копія, з якої засіяно, §3.3), далі на тип статусу.
 *
 * ДЗЕРКАЛО flowi-web-app/lib/status-links.ts — порядок і семантика мусять
 * збігатися, інакше веб і телефон питатимуть у різних випадках і
 * показуватимуть задачу під різними статусами.
 *
 * Зв'язок живе на особистій колонці, бо це особисте налаштування: колонки
 * проєкту спільні для всіх учасників і пишуться в потік проєкту. Нове поле
 * адитивне — сервер тіла записів не перевіряє, тож синхронізується як є.
 *
 * Модуль навмисно без runtime-імпортів із taskStatuses.ts (той імпортує
 * звідси) — лише типи.
 */
import type { StatusType, TaskStatusColumn } from './taskStatuses';

/** Поля, яких потребує зіставлення. */
export type LinkableStatus = Pick<TaskStatusColumn, 'id' | 'name' | 'isDone' | 'type' | 'projectId' | 'sourceStatusId' | 'projectLinks'>;

export function normStatusName(name: string | undefined | null): string {
  return (name ?? '')
    .normalize('NFC')
    .replace(/[’ʼ`]/g, "'")
    .trim()
    .toLocaleLowerCase('uk-UA')
    .replace(/\s+/g, ' ');
}

function statusTypeOf(column: Pick<LinkableStatus, 'id' | 'isDone' | 'type'>): StatusType {
  if (column.type) return column.type;
  if (column.isDone) return 'done';
  return column.id === 'status-in-progress' ? 'in_progress' : 'todo';
}

/** id колонок проєкту, явно пов'язаних з цією особистою колонкою. */
export function linkedProjectColumnIds(personal: Pick<LinkableStatus, 'projectLinks'>, projectId: string): string[] {
  const raw = personal.projectLinks?.[projectId];
  return Array.isArray(raw) ? raw.filter(id => typeof id === 'string' && id) : [];
}

/**
 * Особиста колонка для колонки ПРОЄКТУ: назва → явний зв'язок. null —
 * розбіжність (питати або падати на displayFallbackPersonal).
 */
export function personalForProjectColumn<T extends LinkableStatus>(
  projectColumn: LinkableStatus,
  personalColumns: readonly T[],
): T | null {
  const name = normStatusName(projectColumn.name);
  const byName = name ? personalColumns.find(column => normStatusName(column.name) === name) : undefined;
  if (byName) return byName;
  const projectId = projectColumn.projectId;
  if (projectId) {
    const byLink = personalColumns.find(column => linkedProjectColumnIds(column, projectId).includes(projectColumn.id));
    if (byLink) return byLink;
  }
  return null;
}

/**
 * Колонка ПРОЄКТУ для особистої колонки: назва → явний зв'язок (найновіший
 * першим). `projectColumns` — колонки саме цього проєкту. null — питати.
 */
export function projectForPersonalColumn<T extends LinkableStatus>(
  personalColumn: LinkableStatus,
  projectColumns: readonly T[],
  projectId: string,
): T | null {
  const name = normStatusName(personalColumn.name);
  const byName = name ? projectColumns.find(column => normStatusName(column.name) === name) : undefined;
  if (byName) return byName;
  for (const id of linkedProjectColumnIds(personalColumn, projectId)) {
    const linked = projectColumns.find(column => column.id === id);
    if (linked) return linked;
  }
  return null;
}

/**
 * Запасна особиста колонка, коли сильної відповідності немає і питати не
 * можна (показ у списку, неінтерактивні зміни): копія (sourceStatusId) →
 * системна колонка того ж типу → будь-яка того ж типу → перша.
 */
export function displayFallbackPersonal<T extends LinkableStatus>(
  projectColumn: LinkableStatus,
  personalColumns: readonly T[],
): T | undefined {
  if (projectColumn.sourceStatusId) {
    const bySource = personalColumns.find(column => column.id === projectColumn.sourceStatusId);
    if (bySource) return bySource;
  }
  const type = statusTypeOf(projectColumn);
  const preferredId = type === 'done' ? 'status-done' : type === 'in_progress' ? 'status-in-progress' : 'status-active';
  return personalColumns.find(column => column.id === preferredId)
    ?? personalColumns.find(column => statusTypeOf(column) === type)
    ?? personalColumns[0];
}

/**
 * Зберігає відповідь людини: «колонка проєкту `projectColumnId` у проєкті
 * `projectId` ≡ особиста `personal`». Повертає НОВИЙ масив `task_statuses`
 * (усі потоки, як лежить у сховищі) або той самий, якщо зв'язок уже є.
 *
 * `personal` — зведена особиста колонка (може бути системною, якої ще нема
 * у сховищі — тоді її запис додається разом зі зв'язком). Пов'язана колонка
 * стає першою в списку — саме її обиратиме напрям «особисте → проєкт».
 */
export function withStatusLink<T extends LinkableStatus>(
  stored: readonly T[],
  personal: T,
  projectId: string,
  projectColumnId: string,
): T[] {
  const index = stored.findIndex(column => column.id === personal.id && !column.projectId);
  const current = index >= 0 ? stored[index] : personal;
  const existing = linkedProjectColumnIds(current, projectId);
  // Колонка проєкту відповідає рівно ОДНІЙ особистій (як withStatusLink вебу):
  // зв'язок знімається з інших особистих колонок.
  const elsewhere = stored.some(column => !column.projectId && column.id !== personal.id
    && linkedProjectColumnIds(column, projectId).includes(projectColumnId));
  if (existing[0] === projectColumnId && !elsewhere) return stored as T[];
  const nextLinks = { ...(current.projectLinks ?? {}), [projectId]: [projectColumnId, ...existing.filter(id => id !== projectColumnId)] };
  const next = { ...current, projectLinks: nextLinks } as T;
  const cleaned = stored.map((column, i) => {
    if (i === index) return next;
    if (column.projectId || column.id === personal.id) return column;
    const ids = linkedProjectColumnIds(column, projectId);
    if (!ids.includes(projectColumnId)) return column;
    const rest = ids.filter(id => id !== projectColumnId);
    const links = { ...(column.projectLinks ?? {}) };
    if (rest.length) links[projectId] = rest;
    else delete links[projectId];
    return { ...column, projectLinks: links } as T;
  });
  return index >= 0 ? cleaned : [...cleaned, next];
}
