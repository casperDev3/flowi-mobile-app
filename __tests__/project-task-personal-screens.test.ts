/**
 * __tests__/project-task-personal-screens.test.ts — задача ПРОЄКТУ, відкрита
 * з особистого екрана, показується карткою проєкту ТАМ ЖЕ (ProjectTaskSheet),
 * а не в особистому редакторі; deep link `ftrackingapp://task/{id}` задачі
 * проєкту веде в простір проєкту; картка таймера в сайдбарі проєкту — у час
 * проєкту; рядки командних компонентів — з tr.*.
 */
import fs from 'fs';
import path from 'path';

import { notificationRoute, projectTaskUrl } from '@/utils/pushLink';
import { PERSONAL_TIME_ROUTE, timerTrackerRoute } from '@/utils/activeTimersBar';
import { allTranslations } from '@/store/translations';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
jest.mock('@/store/i18n', () => ({}));
jest.mock('@/components/projects/ProjectTaskCard', () => ({}));
jest.mock('@/components/shared/DetailPane', () => ({}));
jest.mock('@/components/tasks/card/primitives', () => ({ TASK_CARD_SHEET_RATIO: 0.8 }));
jest.mock('@/hooks/use-project', () => ({}));
jest.mock('@/hooks/use-project-role', () => ({}));
jest.mock('@/components/projects/ProjectScreenShell', () => ({}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { projectTaskTarget } = require('@/components/projects/ProjectTaskSheet') as typeof import('@/components/projects/ProjectTaskSheet');

const root = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('projectTaskTarget', () => {
  it('задача з projectId — у картку проєкту', () => {
    expect(projectTaskTarget({ projectId: 'p-1' })).toBe('p-1');
  });
  it('особиста задача — ні', () => {
    expect(projectTaskTarget({})).toBeNull();
    expect(projectTaskTarget({ projectId: null })).toBeNull();
    expect(projectTaskTarget({ projectId: '' })).toBeNull();
    expect(projectTaskTarget(null)).toBeNull();
  });
});

describe('особисті екрани відкривають задачу проєкту на місці', () => {
  const screens = ['app/calendar.tsx', 'app/task-group.tsx', 'app/(tabs)/today.tsx', 'app/(tabs)/index.tsx'];
  it.each(screens)('%s монтує ProjectTaskSheet через useInPlaceProjectTask', file => {
    const text = read(file);
    expect(text).toMatch(/useInPlaceProjectTask\(isDark\)/);
    expect(text).toMatch(/\{projectTaskSheet\}/);
    expect(text).toMatch(/openProjectTask\(/);
  });

  it.each(['app/calendar.tsx', 'app/task-group.tsx', 'app/(tabs)/today.tsx'])(
    '%s: кожен перехід в особистий редактор (?open=) іде після перевірки openProjectTask',
    file => {
      const lines = read(file).split('\n');
      lines.forEach((line, i) => {
        if (!/push\(\{\s*pathname:\s*'\/(\(tabs\))?',\s*params:\s*\{\s*open:/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 2), i + 1).join('\n');
        expect(context).toMatch(/openProjectTask\(/);
      });
    },
  );

  it('вкладка «Завдання»: ?open= задачі проєкту веде в простір проєкту, а не в selected', () => {
    const text = read('app/(tabs)/index.tsx');
    expect(text).toMatch(/if \(t\?\.projectId\) router\.push\(projectTaskUrl\(t\.projectId, t\.id\)/);
    expect(text).toMatch(/if \(!openProjectTask\(task\)\) setSelected\(task\)/);
  });
});

describe('deep link задачі', () => {
  it('projectTaskUrl — картка в просторі проєкту', () => {
    expect(projectTaskUrl('p 1', 't/1')).toBe('/project/p%201/tasks?open=t%2F1');
  });
  it('ftrackingapp://task/{id} з project_id — у проєкт', () => {
    expect(notificationRoute({ url: 'ftrackingapp://task/t-9', project_id: 'p-1' })).toBe('/project/p-1/tasks?open=t-9');
  });
  it('ftrackingapp://task/{id} без project_id — як було (екран сам переадресує задачу проєкту)', () => {
    expect(notificationRoute({ url: 'ftrackingapp://task/t-9' })).toBe('/(tabs)?open=t-9');
  });
});

describe('timerTrackerRoute', () => {
  it('таймер задачі цього проєкту — час проєкту', () => {
    expect(timerTrackerRoute('p-1', ['p-1'])).toBe('/project/p-1/time');
    expect(timerTrackerRoute('p-1', ['p-1', 'p-1'])).toBe('/project/p-1/time');
  });
  it('чужий, особистий чи змішаний — особистий трекер', () => {
    expect(timerTrackerRoute('p-1', ['p-2'])).toBe(PERSONAL_TIME_ROUTE);
    expect(timerTrackerRoute('p-1', [undefined])).toBe(PERSONAL_TIME_ROUTE);
    expect(timerTrackerRoute('p-1', ['p-1', undefined])).toBe(PERSONAL_TIME_ROUTE);
    expect(timerTrackerRoute('p-1', [])).toBe(PERSONAL_TIME_ROUTE);
  });
  it('поза проєктом — особистий трекер', () => {
    expect(timerTrackerRoute(undefined, ['p-1'])).toBe(PERSONAL_TIME_ROUTE);
  });
  it('сайдбар проєкту передає projectId у картку таймерів', () => {
    expect(read('components/shared/ProjectSidebar.tsx')).toMatch(/<ActiveTimersSidebarCard projectId=\{projectId\}/);
    expect(read('components/time/ActiveTimersSidebarCard.tsx')).not.toMatch(/'\/\(tabs\)\/time'/);
  });
});

describe('командні компоненти без захардкодженої української', () => {
  const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it.each([
    'components/projects/ProjectAppearanceForm.tsx',
    'components/projects/TeamResultFiles.tsx',
    'components/projects/TeamOfflineStatus.tsx',
  ])('%s', file => {
    expect(stripComments(read(file))).not.toMatch(/[А-Яа-яІіЇїЄєҐґ]/);
  });
  it('ключі є в обох мовах', () => {
    for (const lang of ['uk', 'en'] as const) {
      const t = allTranslations[lang];
      expect(t.projectAppearance.title).toBeTruthy();
      expect(t.teamResultFiles.open).toContain('{n}');
      expect(t.teamOffline.conflict).toContain('{title}');
      expect(t.teamOffline.rejected).toContain('{detail}');
    }
  });
  it('CapacityRow — рамка з токена теми', () => {
    const text = read('components/projects/TeamWorkspace.tsx');
    expect(text).not.toMatch(/#9E93B2/);
    expect(text).toMatch(/borderColor: colors\.border/);
  });
});
