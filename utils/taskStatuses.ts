import { DONE_VISIBLE_DAYS, completedWithinDays } from './taskUtils';
import type { Filter, SortBy, Status, SubTask, Task } from './taskUtils';
import { uuidV4 } from './uuid';

/**
 * Тип статусу (WORKSPACE_PROJECTS_CONTRACT §3.3): щоб «Сьогодні»/«Завдання»
 * могли агрегувати завдання з різних проєктів, у кожного з яких — власний
 * набір колонок з власними id (`st-<uuid4>`), не спираючись на конкретний id
 * колонки.
 */
export type StatusType = 'todo' | 'in_progress' | 'done';

export interface TaskStatusColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  isDone: boolean;
  system?: boolean;
  updatedAt?: string;
  /**
   * Проєкт, якому належить колонка. Відсутнє — особистий (глобальний) статус.
   * Усі потоки (особистий + кожен проєкт) лежать в одному ключі `task_statuses`
   * (контракт §3.3), тож без цього поля неможливо відрізнити «моя колонка» від
   * «колонка чужого проєкту, яка щойно приїхала синком».
   */
  projectId?: string;
  /**
   * Похідний від isDone для особистих статусів (isDone→done,
   * status-in-progress→in_progress, інше→todo); для проєктних — власне поле,
   * що приїжджає з сервера. Адитивне — відсутність доповнюється
   * `deriveStatusType()` нижче.
   */
  type?: StatusType;
  /**
   * id ОСОБИСТОЇ колонки, з якої скопійовано (contract §3.3: «клієнт пушить
   * копії глобальних статусів з новими id і sourceStatusId»). Дозволяє
   * знайти «той самий за змістом» статус у проєкті за особистим вибором
   * користувача — `projectEquivalentColumn()` нижче. Лише на копіях,
   * створених `seedProjectStatusColumns()`; кастомні проєктні статуси, додані
   * пізніше в налаштуваннях, його не мають.
   */
  sourceStatusId?: string;
}

export const ACTIVE_COLUMN_ID = 'status-active';
export const IN_PROGRESS_COLUMN_ID = 'status-in-progress';
/**
 * Куди завдання потрапляє після зупинки таймера: робота скінчилась, але
 * результат ще не приймали. Колонка системна, бо в цей стан завдання переводить
 * автоматика, а не людина, — і вона мусить існувати в кожного, хто натисне
 * «Стоп», а не лише в того, хто здогадався створити її руками.
 */
export const REVIEW_COLUMN_ID = 'status-review';
export const DONE_COLUMN_ID = 'status-done';

export const DEFAULT_TASK_STATUS_COLUMNS: readonly TaskStatusColumn[] = [
  { id: ACTIVE_COLUMN_ID, name: 'До роботи', color: '#6366F1', position: 0, isDone: false, system: true },
  { id: IN_PROGRESS_COLUMN_ID, name: 'У процесі', color: '#F59E0B', position: 1, isDone: false, system: true },
  { id: REVIEW_COLUMN_ID, name: 'На перевірці', color: '#0EA5E9', position: 2, isDone: false, system: true },
  { id: DONE_COLUMN_ID, name: 'Готово', color: '#10B981', position: 3, isDone: true, system: true },
];

/**
 * Тип статусу, похідний з isDone/id (контракт §3.3: «особисті статуси теж
 * отримують type, похідний: isDone→done, status-in-progress→in_progress,
 * інше→todo»). Використовується, коли явного `type` немає — легасі-запис
 * або особиста колонка, створена до появи поля.
 */
export function deriveStatusType(column: Pick<TaskStatusColumn, 'id' | 'isDone'>): StatusType {
  if (column.isDone) return 'done';
  if (column.id === IN_PROGRESS_COLUMN_ID) return 'in_progress';
  return 'todo';
}

/** Явний `type`, якщо є, інакше похідний з isDone/id. */
export function resolvedStatusType(column: Pick<TaskStatusColumn, 'id' | 'isDone' | 'type'>): StatusType {
  return column.type ?? deriveStatusType(column);
}

/**
 * Зводить збережені колонки з дефолтними в один список для показу.
 *
 * `scopeProjectId` — чий це набір: `undefined` — особистий/глобальний
 * (дефолтні системні колонки + збережені записи БЕЗ `projectId`); конкретний
 * id — лише колонки ЦЬОГО проєкту, без домішки особистих дефолтів (проєкт
 * копіює власні системні статуси при створенні — контракт §3.3 — і власних
 * системних колонок з id `status-*` не має).
 *
 * Без цього розділення щойно засинхронений статус чужого проєкту (та сама
 * колекція `task_statuses`, той самий ключ сховища) засмічував би особистий
 * список колонок «Завдань», а `taskColumnId()` міг би помилково підхопити
 * колонку з тим самим (насправді унікальним, `st-<uuid4>`) id — розділення на
 * рівні виклику прибирає цей ризик так само надійно, як унікальність id.
 */
export function mergeTaskStatusColumns(saved: TaskStatusColumn[], scopeProjectId?: string): TaskStatusColumn[] {
  if (scopeProjectId !== undefined) {
    return saved
      .filter(column => column?.id && column.name?.trim() && column.projectId === scopeProjectId)
      .map(column => ({
        ...column,
        name: column.name.trim(),
        color: column.color || '#7C3AED',
        isDone: Boolean(column.isDone),
        type: resolvedStatusType(column),
      }))
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  }

  const relevant = saved.filter(column => !column?.projectId);
  const merged = new Map(DEFAULT_TASK_STATUS_COLUMNS.map(column => [column.id, { ...column }]));
  for (const column of relevant) {
    if (!column?.id || !column.name?.trim()) continue;
    const base = merged.get(column.id);
    const next: TaskStatusColumn = {
      ...(base ?? column),
      ...column,
      name: column.name.trim(),
      color: column.color || base?.color || '#7C3AED',
      position: Number.isFinite(column.position) ? column.position : (base?.position ?? merged.size),
      isDone: Boolean(column.isDone),
      system: Boolean(base),
    };
    next.type = column.type ?? base?.type ?? deriveStatusType(next);
    merged.set(column.id, next);
  }
  // Дефолтні колонки, яких у saved не було, теж отримують явний type — інакше
  // системні «До роботи»/«У процесі»/… лишались би без поля, хоча решта вже
  // має його.
  for (const [id, column] of merged) {
    if (column.type === undefined) merged.set(id, { ...column, type: deriveStatusType(column) });
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.position - right.position ||
      // При однаковій позиції вирішує ПОРЯДОК РОБОЧОГО ПОТОКУ, а не алфавіт.
      // Це не дрібниця: у користувача, який колись переставив колонки, збережене
      // «Готово» лишилось на позиції 2 — тій самій, що дістала нова системна
      // «На перевірці». За алфавітом 'status-done' < 'status-review', і завдання
      // приймали б уже після того, як воно оголошене завершеним.
      defaultOrder(left.id) - defaultOrder(right.id) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * `st-<uuid4>` — контракт §3.3 дослівно: «id статусу проєкту — випадковий
 * `st-<uuid4>` (НЕ `status-active`)». Раніше тут був власний
 * час+лічильник+рандом формат — не uuid4, хоч і унікальний (мінор з ревʼю).
 */
export function newProjectStatusId(): string {
  return `st-${uuidV4()}`;
}

/**
 * Копії глобальних статусів для НОВОГО проєкту (contract §3.3: «При
 * створенні клієнт пушить копії глобальних статусів з новими id»).
 *
 * `source` — уже ЗВЕДЕНИЙ особистий список (mergeTaskStatusColumns(saved) —
 * типові + кастомні особисті), а не сирий `saved`: копіювати треба те, що
 * людина реально бачить на своїй дошці, включно з типовими «До роботи» тощо.
 */
export function seedProjectStatusColumns(
  source: readonly TaskStatusColumn[],
  projectId: string,
): TaskStatusColumn[] {
  return source.map(column => ({
    id: newProjectStatusId(),
    name: column.name,
    color: column.color,
    position: column.position,
    isDone: column.isDone,
    type: resolvedStatusType(column),
    projectId,
    sourceStatusId: column.id,
  }));
}

// ─── Резолюція статусу завдання по проєкту (§3.3, §3.7 «Особисте агрегує») ───

/**
 * Колонка проєкту (чи особиста, якщо `projectId` відсутній) для БАЖАНОГО
 * типу — використовується там, де немає конкретного «звідки» статусу, лише
 * «куди»: чекбокс готово/активне, швидкий тумблер у списку проєкту.
 *
 * Легасі-проєкт без власних колонок (до цієї фази) повертає `undefined` —
 * викликач сам вирішує запасний варіант (particular, особисті системні id),
 * а не отримує тут чужу підміну мовчки.
 */
export function scopedColumnFor(
  allColumns: readonly TaskStatusColumn[],
  projectId: string | undefined,
  wantType: StatusType,
): TaskStatusColumn | undefined {
  const scoped = mergeTaskStatusColumns([...allColumns], projectId);
  if (!scoped.length) return undefined;
  return scoped.find(column => resolvedStatusType(column) === wantType)
    ?? (wantType === 'done' ? scoped.find(column => column.isDone) : scoped.find(column => !column.isDone))
    ?? scoped[0];
}

/**
 * Еквівалент ОБРАНОГО (як правило — особистого, зі спільного пікера) статусу
 * в межах проєкту завдання — contract §3.3 `sourceStatusId`, з відкатом на
 * тип, коли джерела нема (кастомний проєктний статус) чи не знайдено.
 *
 * Без `projectId` повертає `chosen` як є (особисте завдання — нема куди
 * мапити). Проєкт БЕЗ власних колонок (легасі) теж повертає `chosen` як є:
 * краще лишити «чужий» id, ніж мовчки підмінити específic на щось із іншого
 * простору.
 */
export function projectEquivalentColumn(
  chosen: TaskStatusColumn | undefined,
  allColumns: readonly TaskStatusColumn[],
  projectId: string | undefined,
): TaskStatusColumn | undefined {
  if (!projectId) return chosen;
  const scoped = mergeTaskStatusColumns([...allColumns], projectId);
  if (!scoped.length) return chosen;
  if (chosen) {
    const bySource = scoped.find(column => column.sourceStatusId === chosen.id);
    if (bySource) return bySource;
    const byType = scoped.find(column => resolvedStatusType(column) === resolvedStatusType(chosen));
    if (byType) return byType;
  }
  return scoped.find(column => !column.isDone) ?? scoped[0];
}

/**
 * Колонка дошки/списку ДЛЯ ПОКАЗУ завдання: власна, якщо його
 * `kanbanColumnId` існує серед `boardColumns`, інакше — підбір за `isDone`
 * замість завжди першої колонки (contract §3.3 board bug з ревʼю: легасі-
 * задача з чужим/видаленим id інакше завжди опинялась в першій колонці,
 * навіть якщо вона вже завершена).
 */
/**
 * Колонка ДЛЯ ПОКАЗУ завдання, коректна незалежно від того, з якого проєкту
 * воно (§3.7 «Особисте агрегує»): шукає серед колонок ВЛАСНОГО проєкту
 * завдання (чи особистих, якщо projectId нема), а не серед плаского
 * особистого списку, де проєктні `st-<uuid4>` колонки відфільтровано.
 *
 * `allColumns` — ВЕСЬ вміст `task_statuses` (усі потоки разом, як він лежить
 * у сховищі), а НЕ вже звужений до когось одного список — інакше звузити
 * нема до чого.
 */
export function scopedTaskStatusColumn(
  task: Pick<Task, 'status' | 'kanbanColumnId' | 'projectId'>,
  allColumns: readonly TaskStatusColumn[],
): TaskStatusColumn {
  const scoped = mergeTaskStatusColumns([...allColumns], task.projectId);
  if (scoped.length) return boardColumnForTask(task, scoped) ?? scoped[0];
  // Легасі-проєкт без власних колонок (до цієї фази) — падаємо на особисті
  // дефолти, як і решта застосунку без цього поля.
  return taskStatusColumn(task, mergeTaskStatusColumns([...allColumns]));
}

/**
 * Особиста колонка, під якою завдання показується в ОСОБИСТИХ списках
 * («Завдання», групування за статусом).
 *
 * Кожен проєкт має власні колонки з власними id, і групування за id давало
 * на особистому екрані по окремій «До роботи»/«Готово» на кожен проєкт.
 * Тут колонка проєкту зводиться до «тієї самої за змістом» особистої:
 * спершу копія, з якої її засіяно (sourceStatusId), далі — однакова назва,
 * далі — той самий тип (todo/in_progress/done).
 */
export function personalDisplayColumn(
  task: Pick<Task, 'status' | 'kanbanColumnId' | 'projectId'>,
  allColumns: readonly TaskStatusColumn[],
): TaskStatusColumn {
  const personal = mergeTaskStatusColumns([...allColumns]);
  if (!task.projectId) return taskStatusColumn(task, personal);
  const own = scopedTaskStatusColumn(task, allColumns);
  if (!own.projectId) return own;
  const bySource = own.sourceStatusId ? personal.find(column => column.id === own.sourceStatusId) : undefined;
  if (bySource) return bySource;
  const name = own.name.trim().toLowerCase();
  const byName = personal.find(column => column.name.trim().toLowerCase() === name);
  if (byName) return byName;
  const type = resolvedStatusType(own);
  const preferredId = type === 'done' ? DONE_COLUMN_ID : type === 'in_progress' ? IN_PROGRESS_COLUMN_ID : ACTIVE_COLUMN_ID;
  return personal.find(column => column.id === preferredId)
    ?? personal.find(column => resolvedStatusType(column) === type)
    ?? personal[0]
    ?? own;
}

/**
 * Колонка, в яку стає завдання, ПОВЕРНУТЕ З АРХІВУ.
 *
 * Відновлення робило лише `status: 'active'` і лишало `kanbanColumnId`
 * колонкою «Готово». Далі `boardColumnForTask` знаходить цю колонку напряму —
 * і активне завдання показувалось із зеленим бейджем «Готово» під
 * заголовком секції «ДО РОБОТИ», а шапка рахувала одночасно «1 активних»,
 * «0 виконано» і «100 % ефективність».
 *
 * Колонка НЕ-готова (завдання позначили виконаним чекбоксом, не рухаючи по
 * дошці) зберігається як є — тоді людина повертається рівно туди, звідки
 * пішла. Інакше — перша колонка типу `todo` у ВЛАСНОМУ скоупі завдання
 * (§3.7: у проєктної задачі це колонки її проєкту, а не особисті).
 *
 * Попередню колонку відновити нізвідки: вона ніде не зберігається (див.
 * NAT-10 — «У процесі» губиться при відновленні й досі).
 */
export function restoredColumnIdForTask(
  task: Pick<Task, 'status' | 'kanbanColumnId' | 'projectId'>,
  allColumns: readonly TaskStatusColumn[],
): string | undefined {
  const scoped = mergeTaskStatusColumns([...allColumns], task.projectId);
  const current = task.kanbanColumnId
    ? scoped.find(column => column.id === task.kanbanColumnId)
    : undefined;
  if (current && resolvedStatusType(current) !== 'done') return current.id;
  const todo = scoped.find(column => resolvedStatusType(column) === 'todo')
    ?? scoped.find(column => resolvedStatusType(column) !== 'done');
  // Немає жодної не-готової колонки (набір зіпсовано) — краще лишити
  // завдання без колонки, ніж повернути його в «Готово».
  return todo?.id;
}

export function boardColumnForTask(
  task: Pick<Task, 'status' | 'kanbanColumnId'>,
  boardColumns: readonly TaskStatusColumn[],
): TaskStatusColumn | undefined {
  if (!boardColumns.length) return undefined;
  const direct = task.kanbanColumnId ? boardColumns.find(column => column.id === task.kanbanColumnId) : undefined;
  if (direct) return direct;
  return boardColumns.find(column => column.isDone === (task.status === 'done')) ?? boardColumns[0];
}

/**
 * Застосовує зміну `isDone` КОЛОНКИ до задач, що вже стоять у ній
 * (`kanbanColumnId === columnId`) — `app/project/[id]/settings.tsx` `cycleType`
 * (мінор з ревʼю): перемикання типу колонки в Налаштуваннях міняло лише саму
 * колонку, а задачі, що вже призначені їй, лишались зі старим `status` —
 * «Готово» на дошці показувала активні задачі (і навпаки), доки хтось не
 * перенесе кожну вручну. Дзеркалить ту саму пару полів, що й
 * `moveToColumn`/швидка відмітка `app/project/[id]/tasks.tsx`.
 *
 * `becameDoneIds` — id задач, що САМЕ ЦИМ переходом стали `done` (викликач
 * зупиняє їм таймер, як і при звичайному перенесенні в готову колонку);
 * задачі, вже позначені `done` раніше, у список не потрапляють.
 */
export function applyColumnDoneChangeToTasks(
  tasks: readonly Task[],
  columnId: string,
  isDone: boolean,
): { tasks: Task[]; becameDoneIds: string[] } {
  const nextStatus: Status = isDone ? 'done' : 'active';
  const becameDoneIds: string[] = [];
  const next = tasks.map(task => {
    if (task.kanbanColumnId !== columnId) return task;
    if (isDone && task.status !== 'done') becameDoneIds.push(task.id);
    return task.status === nextStatus ? task : { ...task, status: nextStatus };
  });
  return { tasks: next, becameDoneIds };
}

/** Місце колонки в типовому потоці. Кастомні йдуть після системних. */
function defaultOrder(id: string): number {
  const index = DEFAULT_TASK_STATUS_COLUMNS.findIndex(column => column.id === id);
  return index < 0 ? DEFAULT_TASK_STATUS_COLUMNS.length : index;
}

export function taskColumnId(task: Pick<Task, 'status' | 'kanbanColumnId'>, columns: TaskStatusColumn[]): string {
  if (task.kanbanColumnId) {
    const selected = columns.find(column => column.id === task.kanbanColumnId);
    if (selected && selected.isDone === (task.status === 'done')) return selected.id;
  }
  return task.status === 'done' ? DONE_COLUMN_ID : ACTIVE_COLUMN_ID;
}

export function taskStatusColumn(task: Pick<Task, 'status' | 'kanbanColumnId'>, columns: TaskStatusColumn[]): TaskStatusColumn {
  const id = taskColumnId(task, columns);
  return columns.find(column => column.id === id) ?? columns[0] ?? DEFAULT_TASK_STATUS_COLUMNS[0];
}

/**
 * Тип статусу завдання (todo/in_progress/done), коректний для завдань з
 * будь-якого проєкту — «Особисте агрегує» (контракт §3.7): «Сьогодні» і
 * «Завдання» показують моє з усіх проєктів, і кожен проєкт має ВЛАСНИЙ набір
 * колонок з власними id, тому пошук колонки завдання мусить бути в межах
 * `task.projectId`, а не в глобальному особистому списку (`allColumns` тут —
 * УСІ колонки з усіх потоків: особисті + кожного проєкту, як вони лежать в
 * одному ключі `task_statuses`).
 *
 * Немає власної колонки (легасі-запис до появи kanbanColumnId, або колонку
 * ще не досинхронили) — падаємо на верхньорівневий `status`: він дублюється
 * в кожному записі саме для такого випадку.
 */
export function taskStatusType(
  task: Pick<Task, 'status' | 'kanbanColumnId' | 'projectId'>,
  allColumns: readonly TaskStatusColumn[],
): StatusType {
  const scoped = mergeTaskStatusColumns([...allColumns], task.projectId);
  const column = task.kanbanColumnId ? scoped.find(c => c.id === task.kanbanColumnId) : undefined;
  if (column) return resolvedStatusType(column);
  return task.status === 'done' ? 'done' : 'todo';
}

/** Чи вважати завдання завершеним для агрегованих лічильників/групувань. */
export function isTaskDoneByType(
  task: Pick<Task, 'status' | 'kanbanColumnId' | 'projectId'>,
  allColumns: readonly TaskStatusColumn[],
): boolean {
  return taskStatusType(task, allColumns) === 'done';
}

/**
 * Порядок колонок для СПИСКІВ (екран дня, список завдань), а не для дошки.
 *
 * На дошці «У процесі» стоїть другою — після «До роботи», бо там важить шлях
 * зліва направо. У списку важить інше: спершу те, що робиться просто зараз.
 *
 * Правило живе тут, а не в кожному екрані окремо, з конкретної причини: копія
 * умови відбору завдань на «Сьогодні» вже одного разу мовчки розійшлася з
 * оригіналом, і група приходила заповненою, а рендерилась порожньою.
 */
export function orderColumnsForList(columns: TaskStatusColumn[]): TaskStatusColumn[] {
  return [...columns].sort((left, right) => {
    if (left.id === right.id) return 0;
    // Тип, а не буквальний id: проєктна копія «У процесі» (contract §3.3)
    // несе `type: 'in_progress'`, але власний `st-<uuid4>` id, не
    // IN_PROGRESS_COLUMN_ID — інакше вона завжди програвала б порівняння й
    // губилась серед особистих «До роботи»/«Готово» за позицією.
    const leftInProgress = resolvedStatusType(left) === 'in_progress';
    const rightInProgress = resolvedStatusType(right) === 'in_progress';
    if (leftInProgress && !rightInProgress) return -1;
    if (rightInProgress && !leftInProgress) return 1;
    // Завершене — завжди наприкінці, незалежно від позиції на дошці. У списку
    // «Готово» це підсумок дня, а не етап потоку: кастомна колонка, яку
    // користувач поставив після неї, інакше опинялась би нижче зробленого.
    if (left.isDone !== right.isDone) return left.isDone ? 1 : -1;
    return left.position - right.position;
  });
}
/**
 * Куди веде завдання відмітка підзавдання.
 *
 * `null` означає «не чіпати статус завдання взагалі» — і це головна відповідь
 * тут. Раніше кожне перемикання переписувало status і kanbanColumnId, тож одна
 * закрита підзадача з шести викидала завдання з «У процесі» назад у «До
 * роботи»: людина відмічала прогрес, а натомість втрачала стан роботи.
 *
 * Рухає завдання ЛИШЕ закриття останньої підзадачі, і рухає в «На перевірці»,
 * а не в «Готово»: підзадачі скінчились, але результат ще не приймали. Саме
 * тому status лишається 'active' — колонка перевірки має isDone=false, і
 * поставити тут 'done' означало б завершити завдання за спиною користувача.
 *
 * Правило живе в утиліті, бо його копії стоять на двох екранах (список завдань
 * і окремий екран підзавдань) і одного разу вже мовчки розійшлися.
 *
 * @param subtasksAfterToggle підзавдання ПІСЛЯ перемикання, а не до нього.
 */
export function subtaskToggleTransition(
  task: Pick<Task, 'status' | 'kanbanColumnId'>,
  subtasksAfterToggle: readonly Pick<SubTask, 'done'>[],
): { status: Status; kanbanColumnId: string } | null {
  // Завершене завдання галочка в підзавданні не воскрешає: вихід із «Готово» —
  // окреме свідоме рішення, а не побічний ефект відмітки в списку.
  if (task.status === 'done') return null;
  // Зняття відмітки нікуди не веде: незакрита підзадача лишає завдання там,
  // де воно було, включно з колонкою, яку користувач виставив руками.
  if (subtasksAfterToggle.length === 0) return null;
  if (!subtasksAfterToggle.every(sub => sub.done)) return null;
  return { status: 'active', kanbanColumnId: REVIEW_COLUMN_ID };
}

/**
 * Чи лишається завдання в списку при вибраному фільтрі та групуванні.
 *
 * Виняток один і він навмисний: групування за статусом — це погляд на дошку,
 * а не на список активного. Дошка без колонки «Готово» неповна — не видно, що
 * вже зроблено, і немає де зняти помилкову відмітку. Базовий фільтр 'active'
 * ховав завершені завжди, тож група «Готово» не з'являлась ніколи.
 *
 * Для сортувань за датою поділ інший (по днях), і там 'active' лишається
 * дослівним: домішувати туди завершені означало б засмічувати кожен день.
 *
 * @param scope 'today' звужує вікно завершених до САМОГО сьогодні. Вікно
 *   DONE_VISIBLE_DAYS охоплює ще й учора — доречно в погляді «весь список»,
 *   але в денному режимі вчорашня закрита справа висить серед сьогоднішніх і
 *   вдає незавершену роботу. Це те саме правило, що на екрані «Сьогодні»
 *   (utils/taskToday.ts), просто застосоване на крок раніше — на видимості.
 */
export function taskVisibleInList(
  task: Task,
  filter: Filter,
  sort: SortBy,
  now: Date = new Date(),
  scope: 'today' | 'all' = 'all',
): boolean {
  if (task.status !== 'done') {
    // Будь-який незавершений статус — активний. Веб колись писав
    // 'todo'/'in_progress'; дослівне `task.status === filter` ховало такі
    // задачі на мобільному, і «Усі» тут було вдвічі менше, ніж на вебі.
    return filter === 'all' || filter === 'active';
  }

  // Завершене видно, лише поки воно свіже. Список завдань — про роботу, а не
  // про історію: сотня закритих справ ховає те, заради чого екран відкривають.
  // Старіше живе в Архіві, і саме туди по нього й ідуть. Вирішує САМЕ вікно
  // свіжості, при будь-якому групуванні — так само, як includeRecentlyDone у
  // вебі; раніше свіже завершене потрапляло в «Активні» лише при групуванні
  // за статусом, і лічильник «Усі» двох клієнтів розходився.

  // Фільтр «Виконані» — це свідома вимога показати зроблене; звужувати його до
  // одного дня означало б зламати єдиний спосіб переглянути закрите за тиждень.
  if (scope === 'today' && filter !== 'done') {
    return completedWithinDays(task, 1, now);
  }
  return completedWithinDays(task, DONE_VISIBLE_DAYS, now);
}
