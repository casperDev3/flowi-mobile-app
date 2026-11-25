import {
  DEFAULT_TASK_STATUS_COLUMNS,
  localizedStatusName,
  mergeTaskStatusColumns,
  setSystemStatusLanguage,
} from '@/utils/taskStatuses';

afterEach(() => setSystemStatusLanguage('uk'));

describe('system status names follow the UI language', () => {
  it('keeps Ukrainian defaults by default', () => {
    expect(mergeTaskStatusColumns([]).map(c => c.name)).toEqual(DEFAULT_TASK_STATUS_COLUMNS.map(c => c.name));
  });

  it('shows default personal statuses in English', () => {
    setSystemStatusLanguage('en');
    expect(mergeTaskStatusColumns([]).map(c => c.name)).toEqual(['To do', 'In progress', 'In review', 'Done']);
  });

  it('translates untouched project copies via sourceStatusId', () => {
    setSystemStatusLanguage('en');
    const merged = mergeTaskStatusColumns([
      { id: 'st-1', name: 'У процесі', color: '#F59E0B', position: 1, isDone: false, projectId: 'p1', sourceStatusId: 'status-in-progress' },
    ], 'p1');
    expect(merged[0].name).toBe('In progress');
  });

  it('never renames a status the person renamed', () => {
    setSystemStatusLanguage('en');
    expect(localizedStatusName({ id: 'status-in-progress', name: 'Doing' })).toBe('Doing');
    const merged = mergeTaskStatusColumns([{ id: 'status-done', name: 'Зроблено!', color: '#10B981', position: 3, isDone: true }]);
    expect(merged.find(c => c.id === 'status-done')?.name).toBe('Зроблено!');
  });

  it('translates English names back to Ukrainian', () => {
    setSystemStatusLanguage('uk');
    expect(localizedStatusName({ id: 'status-active', name: 'To do' })).toBe('До роботи');
  });
});

import { formatDurationShort } from '@/utils/uiLang';

describe('formatDurationShort', () => {
  it('formats in both languages', () => {
    expect(formatDurationShort(30, 'en')).toBe('30 min');
    expect(formatDurationShort(90, 'en')).toBe('1h 30m');
    expect(formatDurationShort(120, 'en')).toBe('2 h');
    expect(formatDurationShort(30, 'uk')).toBe('30 хв');
    expect(formatDurationShort(462, 'uk')).toBe('7г 42хв');
  });
});
