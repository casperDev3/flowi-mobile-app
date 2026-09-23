/**
 * utils/sprintUtils.ts — спринт як іменована група завдань усередині проєкту.
 *
 * Живе окремо від екрана з тієї ж причини, що й projectUtils.ts: імпорт
 * app/projects.tsx тягне за собою AsyncStorage і все дерево компонентів, тож
 * правило, зашите в екран, неможливо перевірити тестом.
 *
 * Що спринт РОБИТЬ: групує завдання проєкту в іменовану пачку («Тиждень 1»)
 * і, НЕОБОВ'ЯЗКОВО, має межі в часі — startDate/endDate (специфікація
 * docs/specs/projects-analytics.md §3). Дати потрібні лише для статистики
 * (велосіті, burndown, «лишилось днів») і нічого не планують: у денний
 * список завдання тягне виключно власний task.deadline, і utils/taskToday.ts
 * про спринти взагалі не знає. Спринт без дат — легальний «недатований» стан.
 *
 * Належність тримає ЗАВДАННЯ (task.sprintId), а не масив taskIds тут. Масив —
 * це один запис синку: два офлайн-пристрої, що поклали в один спринт різні
 * завдання, переписали б його цілком, і LWW лишив би тільки пізнішу правку.
 * На полі завдання ті самі дві правки — два різні записи, тож зливаються без
 * втрат.
 */

/**
 * Канонічна форма запису колекції `sprints`. Веб повторює її ДОСЛІВНО
 * (lib/types.ts, interface Sprint) — і за іменами полів, і за порядком, і за
 * опційністю. Розходження форми не падає з помилкою, воно ТИХО роздвоює
 * запис: саме так колись сталося з `body` нотаток.
 */
export interface Sprint {
  /**
   * Випадковий uuid; водночас local_id запису синку. Похідний id від назви
   * (`project:<id>:<name>`) склеїв би два «Тиждень 1» із різних проєктів в
   * один спринт — на відміну від categories, природного ключа тут немає.
   */
  id: string;
  /** ОБОВ'ЯЗКОВИЙ: спринт завжди належить проєкту. */
  projectId: string;
  /** «Тиждень 1». Природним ключем НЕ є. */
  name: string;
  createdAt: string;
  /**
   * Момент закриття. Точний аналог Project.archivedAt: стан ЯВНИЙ, а не
   * похідний із завдань, — інакше спринт із незакритою роботою неможливо було
   * б закрити, а порожній довелося б рахувати завершеним. Автозакриття немає.
   */
  closedAt?: string;
  /** Час останньої правки на клієнті. Проставляє saveSynced — основа LWW. */
  updatedAt?: string;
  /**
   * Перший день спринта, повний ISO (як Project.deadline). АДИТИВНЕ поле:
   * старі записи його не мають, і це «недатований» спринт. Ставиться лише
   * разом з endDate — див. setSprintDates().
   */
  startDate?: string;
  /** ОСТАННІЙ день спринта ВКЛЮЧНО, повний ISO. Пара до startDate. */
  endDate?: string;
}

/**
 * Мінімум полів завдання, потрібний спринтам.
 *
 * Приймаємо структурний зріз, а не весь `Task`: екрани оголошують власні
 * інтерфейси завдання (з recurrence, recordings тощо), і номінально
 * несумісний тип змушував би або кастити, або тримати локальну копію правила.
 */
export interface SprintTaskLike {
  id: string;
  status: string;
  projectId?: string;
  sprintId?: string;
}

/** Мінімум полів проєкту, потрібний для підпису бейджа. */
export interface SprintProjectLike {
  id: string;
  name: string;
}

/** Роздільник у бейджі «Проєкт · Спринт». Той самий рядок, що у вебі. */
export const SPRINT_BADGE_SEPARATOR = ' · ';

let sprintSequence = 0;

/**
 * id спринта ВИПАДКОВИЙ.
 *
 * Причина протилежна до taskTimerId (utils/activeTimers.ts): там два пристрої
 * мусили зійтися в один запис, тож id похідний. Тут природного ключа немає —
 * два спринти «Тиждень 1» у різних проєктах це справді різні спринти, і
 * похідний від назви ключ склеїв би їх у один запис назавжди.
 *
 * Формат — той самий, що в adHocTimerId: crypto.randomUUID у Hermes без
 * додаткового поліфілу немає, а сюди потрібна лише неповторність.
 */
export function newSprintId(): string {
  sprintSequence = (sprintSequence + 1) % 1_000_000;
  return `sprint-${Date.now().toString(36)}-${sprintSequence.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createSprint(projectId: string, name: string, now: Date = new Date()): Sprint {
  return {
    id: newSprintId(),
    projectId,
    name: name.trim(),
    createdAt: now.toISOString(),
  };
}

export function isSprintClosed(sprint: Pick<Sprint, 'closedAt'>): boolean {
  return !!sprint.closedAt;
}

/**
 * Закрити спринт або відкрити його назад.
 *
 * При відкритті ключ саме ВИДАЛЯЄТЬСЯ, а не ставиться в undefined — рівно як у
 * setProjectArchived: undefined зникає при JSON-серіалізації, тож потрібний
 * результат вийшов би побічним ефектом, а не наміром.
 */
export function setSprintClosed<T extends Sprint>(sprint: T, closed: boolean, now: Date = new Date()): T {
  if (closed) return { ...sprint, closedAt: now.toISOString() };
  const { closedAt: _removed, ...rest } = sprint;
  void _removed;
  return rest as T;
}

// ─── Дати спринта (§3.1 специфікації) ────────────────────────────────────────

export interface SprintDates {
  startDate: string;
  endDate: string;
}

/** Обидві межі є й парсяться. Половинчастий запис вважається недатованим. */
export function isSprintDated(sprint: Pick<Sprint, 'startDate' | 'endDate'>): boolean {
  return !!sprint.startDate && !!sprint.endDate
    && !Number.isNaN(Date.parse(sprint.startDate)) && !Number.isNaN(Date.parse(sprint.endDate));
}

/**
 * Поставити або прибрати дати. `null` — спринт стає недатованим: обидва
 * ключі саме ВИДАЛЯЮТЬСЯ, а не ставляться в undefined (та сама конвенція,
 * що в setSprintClosed). Решта полів запису, включно з тими, яких цей клієнт
 * не знає, лишається як була — правка йде поверх канонічного запису.
 */
export function setSprintDates<T extends Sprint>(sprint: T, dates: SprintDates | null): T {
  if (dates) return { ...sprint, startDate: dates.startDate, endDate: dates.endDate };
  if (!('startDate' in sprint) && !('endDate' in sprint)) return sprint;
  const { startDate: _start, endDate: _end, ...rest } = sprint;
  void _start;
  void _end;
  return rest as T;
}

/** Локальна доба ISO-дати як 'YYYY-MM-DD' — значення поля форми. Бите — ''. */
export function sprintDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDateInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Локальна північ; 2026-02-31 не мусить тихо стати 3 березня.
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export type SprintDatesError = 'partial' | 'invalid' | 'order';

export type SprintDatesResult =
  | { ok: true; dates: SprintDates | null }
  | { ok: false; error: SprintDatesError };

/**
 * Інваріанти форми (перевіряє КЛІЄНТ, не сервер):
 *   - обидва поля порожні → дат немає (`dates: null`);
 *   - заповнене одне → 'partial' (напівдатований спринт не зберігається);
 *   - не 'YYYY-MM-DD' або неіснуюча дата → 'invalid';
 *   - кінець раніше за початок → 'order' (рівність — одноденний спринт, можна).
 * Дати пишуться повним ISO локальної півночі — як Project.deadline.
 */
export function parseSprintDatesInput(startText: string, endText: string): SprintDatesResult {
  const startRaw = startText.trim();
  const endRaw = endText.trim();
  if (!startRaw && !endRaw) return { ok: true, dates: null };
  if (!startRaw || !endRaw) return { ok: false, error: 'partial' };
  const start = parseDateInput(startRaw);
  const end = parseDateInput(endRaw);
  if (!start || !end) return { ok: false, error: 'invalid' };
  if (end.getTime() < start.getTime()) return { ok: false, error: 'order' };
  return { ok: true, dates: { startDate: start.toISOString(), endDate: end.toISOString() } };
}

function localDay(iso: string): number {
  const date = new Date(iso);
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/**
 * Датовані спринти ТОГО САМОГО проєкту, що перетинаються з `dates` (межі
 * включно). Перетин НЕ заборонений — паралельні потоки робіт реальні, — форма
 * лише попереджає. `excludeId` — сам спринт, який редагують.
 */
export function overlappingSprints<T extends Sprint>(
  sprints: readonly T[],
  projectId: string,
  dates: SprintDates,
  excludeId?: string,
): T[] {
  const from = localDay(dates.startDate);
  const to = localDay(dates.endDate);
  return sprints.filter(sprint =>
    sprint.projectId === projectId
    && sprint.id !== excludeId
    && isSprintDated(sprint)
    && localDay(sprint.startDate as string) <= to
    && localDay(sprint.endDate as string) >= from);
}

/** Перейменування. Порожня назва відкидається: спринт без імені не знайти. */
export function renameSprint<T extends Sprint>(sprint: T, name: string): T {
  const next = name.trim();
  if (!next) return sprint;
  return { ...sprint, name: next };
}

/**
 * Порядок списку: спочатку відкриті (у порядку створення — «Тиждень 1»,
 * «Тиждень 2»), потім закриті, найсвіжіше закритий першим.
 *
 * Порядок не залежить від порядку запису в масив: інший пристрій дописує
 * записи в кінець, і без явного сортування рядки стрибали б після кожного
 * синку. id — запасний ключ, щоб порядок лишався стабільним і на бітих датах.
 */
export function sortSprints<T extends Sprint>(sprints: readonly T[]): T[] {
  return [...sprints].sort((left, right) => {
    const leftClosed = isSprintClosed(left);
    const rightClosed = isSprintClosed(right);
    if (leftClosed !== rightClosed) return leftClosed ? 1 : -1;
    const diff = leftClosed
      ? Date.parse(right.closedAt ?? '') - Date.parse(left.closedAt ?? '')
      : Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (Number.isFinite(diff) && diff !== 0) return diff;
    return left.id.localeCompare(right.id);
  });
}

/** Спринти одного проєкту — у порядку sortSprints. */
export function sprintsForProject<T extends Sprint>(sprints: readonly T[], projectId: string): T[] {
  return sortSprints(sprints.filter(sprint => sprint.projectId === projectId));
}

/**
 * Куди можна перенести незакриті завдання при закритті спринта: ВІДКРИТІ
 * спринти ТОГО САМОГО проєкту, крім самого себе. Закритий спринт як ціль не
 * пропонується — інакше робота переїхала б із однієї заморозки в іншу.
 */
export function sprintMoveTargets<T extends Sprint>(sprints: readonly T[], sprint: Sprint): T[] {
  return sprintsForProject(sprints, sprint.projectId)
    .filter(candidate => candidate.id !== sprint.id && !isSprintClosed(candidate));
}

/**
 * Спринт завдання за id — НЕЗАЛЕЖНО від closedAt.
 *
 * Саме тому бейдж «Проєкт · Спринт» не гасне після закриття: підпис описує,
 * де завдання лежить, а не чи спринт ще живий.
 */
export function findSprint<T extends Sprint>(sprints: readonly T[], id: string | undefined): T | null {
  if (!id) return null;
  return sprints.find(sprint => sprint.id === id) ?? null;
}

/**
 * Покласти завдання у спринт.
 *
 * projectId проставляється зі спринта: завдання без проєкту у спринт не
 * потрапляє, а мовчки лишити його без projectId означало б зробити запис, який
 * не видно на сторінці жодного проєкту.
 */
export function assignTaskToSprint<T extends SprintTaskLike>(task: T, sprint: Sprint): T {
  return { ...task, projectId: sprint.projectId, sprintId: sprint.id };
}

/**
 * Прибрати завдання зі спринта (= у беклог проєкту).
 *
 * Ключ саме ВИДАЛЯЄТЬСЯ. `undefined` зник би при JSON-серіалізації й дав би
 * потрібний результат випадково, а порожній рядок доїхав би на інший пристрій
 * як «спринт із id ''» — і завдання зникло б з обох списків одразу.
 */
export function clearTaskSprint<T extends SprintTaskLike>(task: T): T {
  const { sprintId: _removed, ...rest } = task;
  void _removed;
  return rest as T;
}

/**
 * Зміна проєкту завдання ВИНОСИТЬ його зі спринта.
 *
 * Спринт належить старому проєкту, і залишений sprintId дав би бейдж «новий
 * проєкт · чужий спринт», а на сторінці нового проєкту завдання не потрапило б
 * у жоден з його спринтів і зникло б із беклогу теж. Якщо проєкт не змінився —
 * завдання повертається як є, щоб зайва правка не будила синк.
 */
export function retargetTaskProject<T extends SprintTaskLike>(
  task: T,
  projectId: string | undefined,
): T {
  if (task.projectId === projectId) return task;
  return { ...clearTaskSprint(task), projectId };
}

export function sprintTasks<T extends SprintTaskLike>(tasks: readonly T[], sprintId: string): T[] {
  return tasks.filter(task => task.sprintId === sprintId);
}

/**
 * Беклог проєкту — його завдання, що не лежать у ЖОДНОМУ з його спринтів.
 *
 * Порожній sprintId це не помилка й не привід для міграції: усі наявні
 * завдання такі, і саме так виглядає «ще не розклали».
 *
 * Третій аргумент — спринти проєкту, а не лише перевірка `!sprintId`. Завдання
 * може посилатись на спринт, якого вже немає (спринт лишився в чужому проєкті,
 * куди завдання перекинули, або приїхав видаленим із синку). Екран проєкту
 * групує завдання на секції спринтів і беклог, тож за вужчим правилом таке
 * завдання не потрапляє нікуди й зникає з очей — а це рівно той клас помилки,
 * якого цьому застосунку коштувало найдорожче. Нерозв'язне посилання
 * рахується беклогом: завдання лишається видимим, і його є чим полагодити.
 *
 * Аргумент ОБОВ'ЯЗКОВИЙ навмисно: із дефолтом `[]` виклик без спринтів мовчки
 * вироджувався б у «всі завдання зі спринтом — теж беклог», тобто рівно в ту
 * помилку, від якої цей параметр і з'явився.
 *
 * Дзеркало веб-версії (lib/sprints.ts projectBacklog) — правило мусить давати
 * ту саму відповідь на ті самі дані.
 */
export function projectBacklogTasks<T extends SprintTaskLike>(
  tasks: readonly T[],
  projectId: string,
  sprints: readonly Sprint[],
): T[] {
  const known = new Set(sprints.map(sprint => sprint.id));
  return tasks.filter(
    task => task.projectId === projectId && (!task.sprintId || !known.has(task.sprintId)),
  );
}

/**
 * Відкриті спринти проєкту — у порядку sortSprints. Без проєкту — порожньо.
 * Дзеркало веб-версії (lib/sprints.ts openSprintsForProject).
 */
export function openSprintsForProject<T extends Sprint>(
  sprints: readonly T[],
  projectId: string | undefined | null,
): T[] {
  if (!projectId) return [];
  return sprintsForProject(sprints, projectId).filter(sprint => !isSprintClosed(sprint));
}

/** Варіант поля «Спринт» у формі задачі. */
export interface SprintOption {
  id: string;
  name: string;
  closed: boolean;
  /** Спринт іншого проєкту або невідомий id (правка з іншого пристрою). */
  foreign: boolean;
}

/**
 * Варіанти поля «Спринт»: відкриті спринти проєкту ПЛЮС поточний спринт
 * задачі, якщо він закритий, чужий чи невідомий.
 *
 * Без доповнення поле не мало б чим показати поточне значення й мовчки
 * показувало б «Беклог», а перше ж збереження перенесло б задачу. «Беклог»
 * (відсутність спринта) сюди НЕ входить — це окремий варіант UI.
 * Дзеркало веб-версії (lib/sprints.ts sprintOptionsForTask).
 */
export function sprintOptionsForTask(
  sprints: readonly Sprint[],
  projectId: string | undefined | null,
  currentSprintId: string | undefined | null,
): SprintOption[] {
  const options: SprintOption[] = openSprintsForProject(sprints, projectId).map(sprint => ({
    id: sprint.id,
    name: sprint.name,
    closed: false,
    foreign: false,
  }));
  if (currentSprintId && !options.some(option => option.id === currentSprintId)) {
    const current = sprints.find(sprint => sprint.id === currentSprintId);
    options.push({
      id: currentSprintId,
      name: current?.name ?? '',
      closed: current ? isSprintClosed(current) : false,
      foreign: !current || current.projectId !== projectId,
    });
  }
  return options;
}

/**
 * Підпис варіанта. Рядки приходять ззовні (tr): утиліта мовно-нейтральна.
 * «Назва (закритий)» / «Інший проєкт» — як на вебі.
 */
export function sprintOptionLabel(
  option: SprintOption,
  labels: { closedSuffix: string; foreign: string },
): string {
  if (option.foreign) return labels.foreign;
  return option.closed ? `${option.name} ${labels.closedSuffix}` : option.name;
}

/** Поле «Спринт» видно, лише коли проєкт обрано і є з чого вибирати. */
export function sprintFieldVisible(
  sprints: readonly Sprint[],
  projectId: string | undefined | null,
  currentSprintId?: string | null,
): boolean {
  return Boolean(projectId) && sprintOptionsForTask(sprints, projectId, currentSprintId).length > 0;
}

/**
 * Спринт задачі при збереженні форми (створення й правка).
 *
 * `base` — задача, до якої вже застосовано retargetTaskProject: якщо проєкт
 * мінявся, sprintId у ній уже знято; якщо ні — лежить справжній.
 *   - Беклог (null/порожньо) → ключ sprintId ВИДАЛЕНО (clearTaskSprint).
 *   - Вибір збігся з поточним sprintId → задача як є, навіть якщо спринт
 *     закритий, чужий чи невідомий: правка назви не переносить задачу.
 *   - Інакше — assignTaskToSprint (projectId зі спринта). Невідомий id
 *     (спринт видалили, поки форма була відкрита) → беклог.
 * Дзеркало веб-версії (lib/sprints.ts applyFormSprint).
 */
export function applyFormSprint<T extends Omit<SprintTaskLike, 'id' | 'status'>>(
  base: T,
  sprints: readonly Sprint[],
  chosenSprintId: string | null | undefined,
): T {
  if (!chosenSprintId) {
    if (!('sprintId' in base)) return base;
    const { sprintId: _removed, ...rest } = base;
    void _removed;
    return rest as T;
  }
  if (chosenSprintId === base.sprintId) return base;
  const sprint = sprints.find(item => item.id === chosenSprintId);
  if (!sprint) {
    const { sprintId: _removed, ...rest } = base;
    void _removed;
    return rest as T;
  }
  return { ...base, projectId: sprint.projectId, sprintId: sprint.id };
}

/** Група попапа проєкту. `sprint: null` — «Беклог». */
export interface ProjectTaskGroup<T> {
  sprint: Sprint | null;
  tasks: T[];
  closed: boolean;
}

/**
 * Групи попапа проєкту: по групі на кожен спринт проєкту (порядок
 * sortSprints — відкриті, потім закриті) і «Беклог» ОСТАННІМ, завжди.
 *
 * Задачі — задачі проєкту ПЛЮС ті, що лежать у його спринтах (навіть якщо
 * projectId задачі розійшовся — див. коментар до selectedTasks у
 * app/projects.tsx). Посилання на невідомий чи чужий спринт у задачі цього
 * проєкту рахується беклогом — те саме правило, що projectBacklogTasks.
 * Порядок задач усередині групи — порядок вхідного масиву.
 *
 * Дзеркало веб-версії (lib/sprints.ts projectTaskGroups): однакові дані мусять
 * давати однакові групи на обох клієнтах.
 */
export function projectTaskGroups<T extends SprintTaskLike>(
  tasks: readonly T[],
  sprints: readonly Sprint[],
  projectId: string,
): ProjectTaskGroup<T>[] {
  const own = sprintsForProject(sprints, projectId);
  const known = new Set(own.map(sprint => sprint.id));
  const bySprint = new Map<string, T[]>(own.map(sprint => [sprint.id, []]));
  const backlog: T[] = [];
  for (const task of tasks) {
    if (task.sprintId && known.has(task.sprintId)) {
      bySprint.get(task.sprintId)!.push(task);
    } else if (task.projectId === projectId) {
      backlog.push(task);
    }
  }
  return [
    ...own.map(sprint => ({
      sprint,
      tasks: bySprint.get(sprint.id) ?? [],
      closed: isSprintClosed(sprint),
    })),
    { sprint: null, tasks: backlog, closed: false },
  ];
}

/** Ключ групи «Беклог» у стані згортання — id спринта таким бути не може. */
export const BACKLOG_GROUP_KEY = '__backlog';

/**
 * Чи розгорнута група: явне перемикання людини, інакше — відкриті спринти
 * (і беклог) розгорнуті, закриті згорнуті.
 */
export function isTaskGroupExpanded(
  expanded: Readonly<Record<string, boolean>>,
  key: string,
  closed: boolean,
): boolean {
  return expanded[key] ?? !closed;
}

export interface SprintProgress {
  total: number;
  done: number;
  active: number;
}

export function sprintProgress(tasks: readonly SprintTaskLike[], sprintId: string): SprintProgress {
  const own = sprintTasks(tasks, sprintId);
  const done = own.filter(task => task.status === 'done').length;
  return { total: own.length, done, active: own.length - done };
}

/**
 * Перенесення при закритті спринта.
 *
 * Рухаються ЛИШЕ незакриті завдання: завершені лишаються в закритому спринті
 * як є — вони і є те, що спринт зробив, і витягти їх звідти означало б стерти
 * його підсумок.
 *
 * `target === null` — у беклог проєкту (ключ sprintId видаляється).
 *
 * Повертається ВЕСЬ масив завдань, а не самі правки: сховище зберігає колекцію
 * цілком, а saveSynced дифить її за id і сам робить N окремих мутацій — по
 * одній на кожне переміщене завдання.
 */
export function moveOpenSprintTasks<T extends SprintTaskLike>(
  tasks: readonly T[],
  sprintId: string,
  target: Sprint | null,
): T[] {
  return tasks.map(task => {
    if (task.sprintId !== sprintId || task.status === 'done') return task;
    return target ? assignTaskToSprint(task, target) : clearTaskSprint(task);
  });
}

/**
 * Наслідки видалення проєкту для спринтів.
 *
 * Спринт без проєкту не існує за визначенням (projectId обов'язковий), тож
 * лишити його означало б тримати запис, який не видно з жодного екрана й який
 * далі їздить у синку. Завдання втрачають і projectId, і sprintId — інакше на
 * завданні лишилось би посилання на спринт, якого вже немає.
 *
 * Обидва ключі саме видаляються, з тієї ж причини, що і в clearTaskSprint.
 */
export function removeProjectSprints<S extends Sprint, T extends SprintTaskLike>(
  sprints: readonly S[],
  tasks: readonly T[],
  projectId: string,
): { sprints: S[]; tasks: T[] } {
  return {
    sprints: sprints.filter(sprint => sprint.projectId !== projectId),
    tasks: tasks.map(task => {
      if (task.projectId !== projectId) return task;
      const { projectId: _project, sprintId: _sprint, ...rest } = task;
      void _project;
      void _sprint;
      return rest as T;
    }),
  };
}

/**
 * Підпис бейджа в загальному списку завдань: «Проєкт · Спринт».
 *
 * Бейдж будується навколо ПРОЄКТУ — його ім'ям і кольором. Без проєкту бейджа
 * немає взагалі: спринт сам по собі нічого не каже про те, де завдання
 * лежить, а колір чипа брати нізвідки.
 *
 * Закритий спринт підпис ЗБЕРІГАЄ: див. findSprint.
 */
export function sprintBadgeLabel(
  task: Pick<SprintTaskLike, 'projectId' | 'sprintId'>,
  projects: readonly SprintProjectLike[],
  sprints: readonly Sprint[],
): string | null {
  if (!task.projectId) return null;
  const project = projects.find(candidate => candidate.id === task.projectId);
  if (!project) return null;
  const sprint = findSprint(sprints, task.sprintId);
  return sprint ? `${project.name}${SPRINT_BADGE_SEPARATOR}${sprint.name}` : project.name;
}
