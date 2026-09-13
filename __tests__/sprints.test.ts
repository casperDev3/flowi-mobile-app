/**
 * __tests__/sprints.test.ts — правила спринта.
 *
 * Логіка мусить збігатися з веб-версією: та сама відповідь на ті самі дані.
 * Тому тут перевіряються саме РІШЕННЯ (що рухається при закритті, що лишається
 * в бейджі, який ключ видаляється), а не форма викликів.
 */

import {
  SPRINT_BADGE_SEPARATOR,
  applyFormSprint,
  openSprintsForProject,
  sprintFieldVisible,
  sprintOptionLabel,
  sprintOptionsForTask,
  assignTaskToSprint,
  clearTaskSprint,
  createSprint,
  findSprint,
  isSprintClosed,
  moveOpenSprintTasks,
  newSprintId,
  BACKLOG_GROUP_KEY,
  isTaskGroupExpanded,
  projectBacklogTasks,
  projectTaskGroups,
  removeProjectSprints,
  renameSprint,
  retargetTaskProject,
  setSprintClosed,
  sortSprints,
  sprintBadgeLabel,
  sprintMoveTargets,
  sprintProgress,
  sprintTasks,
  sprintsForProject,
  type Sprint,
  type SprintTaskLike,
} from '../utils/sprintUtils';

const week1: Sprint = {
  id: 's1', projectId: 'p1', name: 'Тиждень 1', createdAt: '2026-01-01T00:00:00.000Z',
};
const week2: Sprint = {
  id: 's2', projectId: 'p1', name: 'Тиждень 2', createdAt: '2026-01-08T00:00:00.000Z',
};
const otherProject: Sprint = {
  id: 's3', projectId: 'p2', name: 'Тиждень 1', createdAt: '2026-01-02T00:00:00.000Z',
};

function task(over: Partial<SprintTaskLike> & { id: string }): SprintTaskLike {
  return { status: 'active', projectId: 'p1', ...over };
}

describe('id спринта', () => {
  it('випадковий — два спринти з однаковою назвою не склеюються', () => {
    const a = createSprint('p1', 'Тиждень 1');
    const b = createSprint('p2', 'Тиждень 1');
    expect(a.id).not.toBe(b.id);
  });

  it('неповторний навіть у межах однієї мілісекунди', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newSprintId()));
    expect(ids.size).toBe(500);
  });

  it('createSprint обрізає пробіли й не ставить closedAt', () => {
    const sprint = createSprint('p1', '  Тиждень 1  ', new Date('2026-03-01T10:00:00.000Z'));
    expect(sprint.name).toBe('Тиждень 1');
    expect(sprint.projectId).toBe('p1');
    expect(sprint.createdAt).toBe('2026-03-01T10:00:00.000Z');
    expect(Object.prototype.hasOwnProperty.call(sprint, 'closedAt')).toBe(false);
  });
});

describe('setSprintClosed', () => {
  it('ставить closedAt при закритті', () => {
    const closed = setSprintClosed(week1, true, new Date('2026-02-01T00:00:00.000Z'));
    expect(closed.closedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(isSprintClosed(closed)).toBe(true);
  });

  it('ВИДАЛЯЄ ключ при відкритті назад, а не лишає undefined', () => {
    const restored = setSprintClosed(setSprintClosed(week1, true), false);
    // Саме наявність ключа: undefined зник би при JSON-серіалізації й
    // приховав би різницю.
    expect(Object.prototype.hasOwnProperty.call(restored, 'closedAt')).toBe(false);
    expect(restored).toEqual(week1);
  });

  it('не мутує вхідний запис', () => {
    const input = { ...week1 };
    setSprintClosed(input, true);
    expect(input).toEqual(week1);
  });
});

describe('renameSprint', () => {
  it('перейменовує з обрізанням пробілів', () => {
    expect(renameSprint(week1, '  Реліз  ').name).toBe('Реліз');
  });

  it('порожню назву ігнорує — спринт без імені не знайти', () => {
    expect(renameSprint(week1, '   ')).toBe(week1);
  });
});

describe('порядок і вибірки', () => {
  it('відкриті — у порядку створення, закриті — у кінці, найсвіжіший першим', () => {
    const closedEarly = { ...week1, closedAt: '2026-02-01T00:00:00.000Z' };
    const closedLate = { ...otherProject, projectId: 'p1', closedAt: '2026-03-01T00:00:00.000Z' };
    const order = sortSprints([closedEarly, week2, closedLate]).map(s => s.id);
    expect(order).toEqual(['s2', 's3', 's1']);
  });

  it('sprintsForProject бере лише свій проєкт', () => {
    expect(sprintsForProject([week1, week2, otherProject], 'p1').map(s => s.id)).toEqual(['s1', 's2']);
  });

  it('ціль перенесення — лише ВІДКРИТІ спринти того самого проєкту, крім себе', () => {
    const closed = { ...week2, closedAt: '2026-02-01T00:00:00.000Z' };
    const open = { id: 's4', projectId: 'p1', name: 'Тиждень 3', createdAt: '2026-01-20T00:00:00.000Z' };
    const targets = sprintMoveTargets([week1, closed, open, otherProject], week1);
    expect(targets.map(s => s.id)).toEqual(['s4']);
  });
});

describe('звʼязок завдання зі спринтом', () => {
  it('assignTaskToSprint проставляє projectId зі спринта', () => {
    const orphan: SprintTaskLike = { id: 't1', status: 'active' };
    const assigned = assignTaskToSprint(orphan, week1);
    expect(assigned.projectId).toBe('p1');
    expect(assigned.sprintId).toBe('s1');
  });

  it('clearTaskSprint ВИДАЛЯЄ ключ, а не пише undefined чи порожній рядок', () => {
    const cleared = clearTaskSprint(task({ id: 't1', sprintId: 's1' }));
    expect(Object.prototype.hasOwnProperty.call(cleared, 'sprintId')).toBe(false);
    expect(cleared.projectId).toBe('p1');
  });

  it('беклог проєкту — його завдання без спринта', () => {
    const list = [task({ id: 't1', sprintId: 's1' }), task({ id: 't2' }), task({ id: 't3', projectId: 'p2' })];
    expect(projectBacklogTasks(list, 'p1', [week1, week2]).map(t => t.id)).toEqual(['t2']);
  });

  it('sprintTasks і sprintProgress рахують одне й те саме', () => {
    const list = [
      task({ id: 't1', sprintId: 's1' }),
      task({ id: 't2', sprintId: 's1', status: 'done' }),
      task({ id: 't3', sprintId: 's2' }),
    ];
    expect(sprintTasks(list, 's1').map(t => t.id)).toEqual(['t1', 't2']);
    expect(sprintProgress(list, 's1')).toEqual({ total: 2, done: 1, active: 1 });
  });

  /**
   * Розійшлася пара (projectId, sprintId). Стан приїжджає синком зі старішого
   * клієнта, який міняв проєкт задачі, не знімаючи sprintId. Задача мусить
   * лишатись у спринті: зняти з неї sprintId можна тільки з її рядка у спринті
   * на екрані проєкту, тож інакше зламаний стан нема чим виправити.
   *
   * Те саме правило у вебі (lib/sprints.ts): спринт бере задачі за sprintId,
   * беклог — задачі проєкту без спринта.
   */
  it('задача з ЧУЖИМ projectId, але цим sprintId, лежить у спринті, а не в беклозі', () => {
    const list = [
      task({ id: 'foreign', projectId: 'p2', sprintId: 's1' }),
      task({ id: 'own', sprintId: 's1' }),
      task({ id: 'backlog' }),
    ];
    expect(sprintTasks(list, 's1').map(t => t.id)).toEqual(['foreign', 'own']);
    // У беклог p1 вона не провалюється — там вона у спринті. Але у СВОЄМУ
    // проєкті p2 вона мусить бути видима, і саме в беклозі: спринт s1 до p2 не
    // належить, тобто в жодному спринті p2 її немає. Інакше на екрані p2 вона
    // не потрапляє нікуди й зникає — а це та сама аварія, від якої правило й
    // рахує нерозв'язне посилання беклогом.
    expect(projectBacklogTasks(list, 'p1', [week1, week2]).map(t => t.id)).toEqual(['backlog']);
    expect(projectBacklogTasks(list, 'p2', [otherProject]).map(t => t.id)).toEqual(['foreign']);
    expect(sprintProgress(list, 's1')).toEqual({ total: 2, done: 0, active: 2 });
  });
});

describe('закриття спринта переносить лише незакриті завдання', () => {
  const list = [
    task({ id: 'open', sprintId: 's1' }),
    task({ id: 'done', sprintId: 's1', status: 'done' }),
    task({ id: 'foreign', sprintId: 's2' }),
    task({ id: 'backlog' }),
  ];

  it('в інший спринт', () => {
    const moved = moveOpenSprintTasks(list, 's1', week2);
    expect(moved.find(t => t.id === 'open')?.sprintId).toBe('s2');
    // Завершене лишається в закритому спринті як є — це його підсумок.
    expect(moved.find(t => t.id === 'done')?.sprintId).toBe('s1');
    expect(moved.find(t => t.id === 'foreign')?.sprintId).toBe('s2');
    expect(moved.find(t => t.id === 'backlog')?.sprintId).toBeUndefined();
  });

  it('у беклог — ключ зникає', () => {
    const moved = moveOpenSprintTasks(list, 's1', null);
    const open = moved.find(t => t.id === 'open')!;
    expect(Object.prototype.hasOwnProperty.call(open, 'sprintId')).toBe(false);
    expect(moved.find(t => t.id === 'done')?.sprintId).toBe('s1');
  });

  it('повертає весь масив — saveSynced зробить із нього N окремих мутацій', () => {
    expect(moveOpenSprintTasks(list, 's1', null)).toHaveLength(list.length);
  });
});

describe('видалення проєкту', () => {
  it('забирає його спринти й відвʼязує завдання від обох ключів', () => {
    const tasks = [task({ id: 't1', sprintId: 's1' }), task({ id: 't2', projectId: 'p2', sprintId: 's3' })];
    const result = removeProjectSprints([week1, week2, otherProject], tasks, 'p1');
    expect(result.sprints.map(s => s.id)).toEqual(['s3']);
    const freed = result.tasks.find(t => t.id === 't1')!;
    expect(Object.prototype.hasOwnProperty.call(freed, 'projectId')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(freed, 'sprintId')).toBe(false);
    // Чужий проєкт не зачеплено.
    expect(result.tasks.find(t => t.id === 't2')?.sprintId).toBe('s3');
  });
});

describe('зміна проєкту завдання', () => {
  it('виносить завдання зі спринта — спринт належав старому проєкту', () => {
    const moved = retargetTaskProject(task({ id: 't1', sprintId: 's1' }), 'p2');
    expect(moved.projectId).toBe('p2');
    expect(Object.prototype.hasOwnProperty.call(moved, 'sprintId')).toBe(false);
  });

  it('зняття проєкту теж прибирає спринт', () => {
    const freed = retargetTaskProject(task({ id: 't1', sprintId: 's1' }), undefined);
    expect(Object.prototype.hasOwnProperty.call(freed, 'sprintId')).toBe(false);
  });

  it('той самий проєкт — завдання не чіпається, зайвої правки в синк не йде', () => {
    const original = task({ id: 't1', sprintId: 's1' });
    expect(retargetTaskProject(original, 'p1')).toBe(original);
  });
});

describe('бейдж «Проєкт · Спринт»', () => {
  const projects = [{ id: 'p1', name: 'Flowi' }, { id: 'p2', name: 'Сайт' }];

  it('показує обидві частини', () => {
    const label = sprintBadgeLabel(task({ id: 't1', sprintId: 's1' }), projects, [week1]);
    expect(label).toBe(`Flowi${SPRINT_BADGE_SEPARATOR}Тиждень 1`);
  });

  it('ЗАКРИТИЙ спринт підпис зберігає', () => {
    const closed = setSprintClosed(week1, true);
    const label = sprintBadgeLabel(task({ id: 't1', sprintId: 's1' }), projects, [closed]);
    expect(label).toBe(`Flowi${SPRINT_BADGE_SEPARATOR}Тиждень 1`);
  });

  it('без спринта — сам проєкт', () => {
    expect(sprintBadgeLabel(task({ id: 't1' }), projects, [week1])).toBe('Flowi');
  });

  it('спринт, якого вже немає, не ламає підпис', () => {
    expect(sprintBadgeLabel(task({ id: 't1', sprintId: 'gone' }), projects, [week1])).toBe('Flowi');
  });

  it('без проєкту бейджа немає', () => {
    expect(sprintBadgeLabel({ sprintId: 's1' }, projects, [week1])).toBeNull();
    expect(sprintBadgeLabel({ projectId: 'zzz' }, projects, [week1])).toBeNull();
  });
});

describe('findSprint', () => {
  it('шукає за id незалежно від closedAt', () => {
    expect(findSprint([setSprintClosed(week1, true)], 's1')?.name).toBe('Тиждень 1');
  });

  it('порожній id — null', () => {
    expect(findSprint([week1], undefined)).toBeNull();
  });
});

describe('висяче посилання на спринт', () => {
  it('завдання з неіснуючим sprintId лишається видимим у беклозі, а не зникає', () => {
    const list = [
      { id: 'a', projectId: 'p1', sprintId: 's1', status: 'todo' },
      { id: 'b', projectId: 'p1', status: 'todo' },
      { id: 'c', projectId: 'p1', sprintId: 'ghost', status: 'todo' },
    ] as never[];
    const known = [
      { id: 's1', projectId: 'p1', name: 'Тиждень 1', createdAt: '2026-09-01T00:00:00.000Z' },
    ] as never[];
    expect(projectBacklogTasks(list, 'p1', known).map((t: { id: string }) => t.id)).toEqual(['b', 'c']);
    expect(sprintTasks(list, 's1').map((t: { id: string }) => t.id)).toEqual(['a']);
  });
});

describe('projectTaskGroups — групи попапа проєкту', () => {
  const closedWeek: Sprint = { ...week1, id: 's0', name: 'Минулий', closedAt: '2026-01-05T00:00:00.000Z' };
  const tasks: SprintTaskLike[] = [
    { id: 'a', projectId: 'p1', sprintId: 's1', status: 'active' },
    { id: 'b', projectId: 'p1', status: 'active' },
    { id: 'c', projectId: 'p1', sprintId: 'ghost', status: 'active' },
    { id: 'd', projectId: 'p2', sprintId: 's2', status: 'done' },   // розійшовся projectId — лишається у спринті
    { id: 'e', projectId: 'p2', status: 'active' },                 // чужий проєкт — ніде
    { id: 'f', projectId: 'p1', sprintId: 's3', status: 'active' }, // спринт іншого проєкту — беклог
    { id: 'g', projectId: 'p1', sprintId: 's0', status: 'done' },
  ];

  it('спринти у порядку sortSprints (закриті в кінці), беклог — останнім', () => {
    const groups = projectTaskGroups(tasks, [closedWeek, week2, otherProject, week1], 'p1');
    expect(groups.map(g => g.sprint?.id ?? null)).toEqual(['s1', 's2', 's0', null]);
    expect(groups.map(g => g.closed)).toEqual([false, false, true, false]);
    expect(groups.map(g => g.tasks.map(t => t.id))).toEqual([['a'], ['d'], ['g'], ['b', 'c', 'f']]);
  });

  it('без спринтів — лише беклог (навіть порожній)', () => {
    expect(projectTaskGroups([], [], 'p1')).toEqual([{ sprint: null, tasks: [], closed: false }]);
  });

  it('кожна задача потрапляє не більше ніж в одну групу', () => {
    const groups = projectTaskGroups(tasks, [week1, week2, closedWeek], 'p1');
    const ids = groups.flatMap(g => g.tasks.map(t => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('isTaskGroupExpanded', () => {
  it('за замовчуванням відкриті розгорнуті, закриті згорнуті', () => {
    expect(isTaskGroupExpanded({}, 's1', false)).toBe(true);
    expect(isTaskGroupExpanded({}, 's0', true)).toBe(false);
    expect(isTaskGroupExpanded({}, BACKLOG_GROUP_KEY, false)).toBe(true);
  });

  it('явне перемикання перемагає замовчування', () => {
    expect(isTaskGroupExpanded({ s0: true }, 's0', true)).toBe(true);
    expect(isTaskGroupExpanded({ s1: false }, 's1', false)).toBe(false);
  });
});

describe('поле «Спринт» у формі задачі', () => {
  const closed: Sprint = { ...week1, id: 'sc', name: 'Старий', closedAt: '2026-01-05T00:00:00.000Z' };
  const foreign: Sprint = { ...week1, id: 'x', projectId: 'p2', name: 'Чужий' };
  const all = [week2, closed, foreign, week1];
  const labels = { closedSuffix: '(закритий)', foreign: 'Інший проєкт' };

  it('openSprintsForProject — лише відкриті свого проєкту, у порядку показу', () => {
    expect(openSprintsForProject(all, 'p1').map(s => s.id)).toEqual(['s1', 's2']);
    expect(openSprintsForProject(all, undefined)).toEqual([]);
    expect(openSprintsForProject(all, null)).toEqual([]);
  });

  it('sprintOptionsForTask — відкриті + поточний закритий/чужий/невідомий, без дублів', () => {
    expect(sprintOptionsForTask(all, 'p1', undefined).map(o => o.id)).toEqual(['s1', 's2']);
    expect(sprintOptionsForTask(all, 'p1', 's1').map(o => o.id)).toEqual(['s1', 's2']);
    const withClosed = sprintOptionsForTask(all, 'p1', 'sc');
    expect(withClosed[2]).toEqual({ id: 'sc', name: 'Старий', closed: true, foreign: false });
    expect(sprintOptionLabel(withClosed[2], labels)).toBe('Старий (закритий)');
    const withForeign = sprintOptionsForTask(all, 'p1', 'x');
    expect(withForeign[2].foreign).toBe(true);
    expect(sprintOptionLabel(withForeign[2], labels)).toBe('Інший проєкт');
    expect(sprintOptionsForTask(all, 'p1', 'ghost')[2]).toEqual({ id: 'ghost', name: '', closed: false, foreign: true });
    expect(sprintOptionLabel(sprintOptionsForTask(all, 'p1', null)[0], labels)).toBe('Тиждень 1');
  });

  it('sprintFieldVisible — потрібні проєкт і хоча б один варіант', () => {
    const list = [week1, { ...closed, projectId: 'p3' }];
    expect(sprintFieldVisible(list, 'p1')).toBe(true);
    expect(sprintFieldVisible(list, 'p2')).toBe(false);
    expect(sprintFieldVisible(list, 'p3')).toBe(false);
    expect(sprintFieldVisible(list, 'p3', 'sc')).toBe(true);
    expect(sprintFieldVisible(list, undefined, 's1')).toBe(false);
  });

  it('applyFormSprint — беклог видаляє ключ, збіг із поточним лишає задачу як є', () => {
    const inSprint = { id: 't', status: 'active', projectId: 'p1', sprintId: 's1' };
    const detached = applyFormSprint(inSprint, all, null);
    expect('sprintId' in detached).toBe(false);
    expect('sprintId' in applyFormSprint(inSprint, all, '')).toBe(false);
    const inClosed = { id: 't', status: 'active', projectId: 'p1', sprintId: 'sc' };
    expect(applyFormSprint(inClosed, all, 'sc')).toBe(inClosed);
    const inGhost = { id: 't', status: 'active', projectId: 'p1', sprintId: 'ghost' };
    expect(applyFormSprint(inGhost, all, 'ghost')).toBe(inGhost);
    const plain = { id: 't', status: 'active', projectId: 'p1' };
    expect(applyFormSprint(plain, all, null)).toBe(plain);
  });

  it('applyFormSprint — новий вибір кладе у спринт (projectId зі спринта), невідомий → беклог', () => {
    expect(applyFormSprint({ projectId: 'p1' }, all, 's2')).toEqual({ projectId: 'p1', sprintId: 's2' });
    expect(applyFormSprint({ projectId: 'p1' }, all, 'x')).toEqual({ projectId: 'p2', sprintId: 'x' });
    const vanished = applyFormSprint({ projectId: 'p1', sprintId: 's1' }, all, 'gone');
    expect('sprintId' in vanished).toBe(false);
  });
});
