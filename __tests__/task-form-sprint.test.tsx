/**
 * __tests__/task-form-sprint.test.tsx — логіка поля «Спринт» у формі задачі
 * (CONTRACT §D.3).
 *
 * Раніше тест рендерив `TaskEditForm`, яку замінила картка задачі
 * (components/tasks/card/*). Форма видалена як мертвий код, а цінні
 * твердження перенесено сюди — на чисті функції, з яких будують поле і
 * картка, і швидке створення: `draftCurrentSprintId` + `sprintOptionsForTask`
 * + `sprintFieldVisible`.
 */
import { draftCurrentSprintId, type TaskDraftOriginal } from '@/hooks/use-task-editor';
import { sprintFieldVisible, sprintOptionLabel, sprintOptionsForTask, type Sprint } from '@/utils/sprintUtils';

const NOW = '2026-09-01T10:00:00.000Z';
const SPRINTS: Sprint[] = [
  { id: 's1', projectId: 'p1', name: 'Тиждень 1', createdAt: NOW },
  { id: 's0', projectId: 'p1', name: 'Старий', createdAt: NOW, closedAt: NOW },
];
const LABELS = { closedSuffix: '(закритий)', foreign: 'Інший проєкт' };

/** Підписи варіантів так, як їх показує поле (без «Беклогу» — це окремий чип). */
function options(
  sprints: readonly Sprint[],
  draft: { projectId: string | null; sprintId: string | null },
  original: TaskDraftOriginal | null,
): string[] | null {
  const current = draftCurrentSprintId(draft, original);
  if (!sprintFieldVisible(sprints, draft.projectId, current)) return null;
  return sprintOptionsForTask(sprints, draft.projectId, current).map(o => sprintOptionLabel(o, LABELS));
}

test('без проєкту поля «Спринт» немає', () => {
  expect(options(SPRINTS, { projectId: null, sprintId: null }, null)).toBeNull();
});

test('проєкт зі спринтами: лише відкриті спринти', () => {
  expect(options(SPRINTS, { projectId: 'p1', sprintId: null }, null)).toEqual(['Тиждень 1']);
});

test('поточний закритий спринт показується з позначкою', () => {
  expect(options(SPRINTS, { projectId: 'p1', sprintId: 's0' }, null)).toEqual(['Тиждень 1', 'Старий (закритий)']);
});

test('зміна проєкту скидає спринт — у проєкті без спринтів поля немає', () => {
  expect(options(SPRINTS, { projectId: 'p2', sprintId: null }, { projectId: 'p1', sprintId: 's0' })).toBeNull();
});

test('правка: «Беклог» не ховає закритий спринт задачі — до нього можна повернутись (як веб)', () => {
  const original = { projectId: 'p1', sprintId: 's0' };
  expect(draftCurrentSprintId({ projectId: 'p1', sprintId: null }, original)).toBe('s0');
  expect(options(SPRINTS, { projectId: 'p1', sprintId: null }, original)).toEqual(['Тиждень 1', 'Старий (закритий)']);
});

test('правка: проєкт лише із закритими спринтами — поле не зникає після «Беклогу»', () => {
  const onlyClosed = SPRINTS.filter(sp => sp.closedAt);
  expect(options(onlyClosed, { projectId: 'p1', sprintId: null }, { projectId: 'p1', sprintId: 's0' }))
    .toEqual(['Старий (закритий)']);
});

test('правка: зміна проєкту прибирає вихідний спринт із варіантів', () => {
  const sprints: Sprint[] = [...SPRINTS, { id: 's2', projectId: 'p2', name: 'Інший', createdAt: NOW }];
  expect(draftCurrentSprintId({ projectId: 'p2', sprintId: null }, { projectId: 'p1', sprintId: 's0' })).toBeNull();
  expect(options(sprints, { projectId: 'p2', sprintId: null }, { projectId: 'p1', sprintId: 's0' })).toEqual(['Інший']);
});
