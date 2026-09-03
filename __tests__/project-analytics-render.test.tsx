/**
 * __tests__/project-analytics-render.test.tsx — панель графіків мусить намалюватись.
 *
 * Числа Гантта покриті окремо (project-charts.test.ts), але саме тут ламається
 * те, чого арифметика не бачить: частки 0..1 перетворюються на пікселі, і поки
 * ширину контейнера ще не виміряно, будь-яке ділення легко дає NaN. RN на NaN
 * у left/width не падає — він мовчки не малює смугу, тож на пристрої це
 * виглядає як «графік порожній», а не як помилка.
 *
 * Друга річ, яку тут стережемо, — візуальна різниця між справжнім і вигаданим
 * початком. Вона не косметична: смуга, побудована на даті створення, бреше про
 * тривалість, і якщо штрихування колись «спростять» до однакової заливки,
 * діаграма почне брехати мовчки. Тест перевіряє саме цю пару стилів.
 */

import React from 'react';

import { ProjectAnalytics } from '@/components/projects/ProjectAnalytics';
import { ProjectGantt } from '@/components/projects/ProjectGantt';
import { buildGantt, type ChartTaskLike } from '@/utils/projectCharts';
import { mergeTaskStatusColumns } from '@/utils/taskStatuses';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

// Словник справжній, а не заглушка: підписи смуг для читалки складаються саме
// з нього, і на вигаданих рядках тест перевіряв би сам себе. Мокаємо лише
// провайдер — він тягне AsyncStorage, якого в тесті немає.
jest.mock('@/store/i18n', () => ({
  useI18n: () => ({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tr: require('@/store/translations').allTranslations.uk,
    lang: 'uk',
    setLang: () => {},
  }),
}));

const PALETTE = { text: '#111', sub: '#666', border: '#DDD' };
const NOW = new Date(2026, 7, 26, 9, 0, 0);

const day = (offset: number): string => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offset);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
};

const projects = [{ id: 'p1', name: 'Flowi', color: '#7C3AED' }];
const tasks: ChartTaskLike[] = [
  { id: 'a', title: 'Зі стартом', status: 'active', projectId: 'p1', startDate: day(-40), deadline: day(-10) },
  { id: 'b', title: 'Без старту', status: 'active', projectId: 'p1', createdAt: day(-30), deadline: day(-5) },
  { id: 'c', title: 'Завершена', status: 'done', projectId: 'p1', startDate: day(-20), createdAt: day(-25), history: [{ at: day(-2), type: 'done' }] },
  { id: 'd', title: 'Одноденна', status: 'active', projectId: 'p1', startDate: day(-3), deadline: day(-3) },
];

/** Усі стилі дерева одним списком — разом із масивами й вкладеними. */
function collectStyles(node: any, out: any[] = []): any[] {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) collectStyles(item, out);
    return out;
  }
  const style = node.props?.style;
  if (style) collectStyles2(style, out);
  for (const child of node.children ?? []) collectStyles(child, out);
  return out;
}

function collectStyles2(style: any, out: any[]): void {
  if (Array.isArray(style)) {
    for (const item of style) collectStyles2(item, out);
    return;
  }
  if (style && typeof style === 'object') out.push(style);
}

function render(wide: boolean) {
  const chart = buildGantt(tasks, projects, { now: NOW });
  let tree: any;
  act(() => {
    tree = create(<ProjectGantt chart={chart} wide={wide} palette={PALETTE} />);
  });
  return tree;
}

describe('рендер Гантта', () => {
  it.each([['телефон', false], ['планшет', true]])('малюється на %s без NaN у геометрії', (_label, wide) => {
    const tree = render(wide as boolean);
    const json = tree.toJSON();
    expect(json).toBeTruthy();

    for (const style of collectStyles(json)) {
      for (const [key, value] of Object.entries(style)) {
        // NaN у left/width RN не вважає помилкою — він просто нічого не
        // малює, і смуга зникає без жодного попередження. Ключ у повідомленні,
        // бо інакше «false !== true» не каже, ЯКА саме властивість зіпсована.
        if (typeof value === 'number') expect([key, Number.isFinite(value)]).toEqual([key, true]);
      }
    }
    act(() => { tree.unmount(); });
  });

  it('вигаданий початок відрізняється від справжнього не лише кольором', () => {
    const tree = render(false);
    const styles = collectStyles(tree.toJSON());

    const bars = styles.filter(style => style.height === 10 && style.borderRadius === 3 && 'left' in style);
    // Чотири смуги задач; легенда своїх left не має, тож сюди не потрапляє.
    expect(bars).toHaveLength(4);

    const solid = bars.filter(bar => bar.backgroundColor === '#7C3AED');
    const hatched = bars.filter(bar => bar.backgroundColor === 'transparent');
    expect(solid).toHaveLength(3);
    expect(hatched).toHaveLength(1);
    // Контур утримує форму смуги там, де штрих тонкий.
    expect(hatched[0].borderWidth).toBe(1);
    expect(hatched[0].borderColor).toBe('#7C3AED');
    expect(solid.every(bar => bar.borderWidth === 0)).toBe(true);

    act(() => { tree.unmount(); });
  });

  it('одноденна смуга не зникає з екрана', () => {
    const tree = render(false);
    const bars = collectStyles(tree.toJSON())
      .filter(style => style.height === 10 && 'width' in style && typeof style.width === 'number');
    // Мінімум 6pt: без стелі робота на день дає ширину майже нуль, і рядок
    // виглядає як порожній.
    expect(Math.min(...bars.map(bar => bar.width))).toBeGreaterThanOrEqual(6);
    act(() => { tree.unmount(); });
  });

  it('на порожньому наборі каже словами, а не показує голу шкалу', () => {
    // Задача без startDate і без createdAt: намалювати нічим, але змовчати про
    // неї не можна — інакше екран виглядає як «задач немає».
    const chart = buildGantt([{ id: 'x', title: 'Без дат', status: 'active', projectId: 'p1' }], projects, { now: NOW });
    let tree: any;
    act(() => { tree = create(<ProjectGantt chart={chart} wide={false} palette={PALETTE} />); });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const tr = require('@/store/translations').allTranslations.uk;
    expect(JSON.stringify(tree.toJSON())).toContain(`${tr.ganttNoStartDate}: 1`);
    act(() => { tree.unmount(); });
  });
});

describe('рендер панелі аналітики', () => {
  const palette = { ...PALETTE, dim: '#EEE', accent: '#7C3AED' };

  it('монтується цілком — усі пʼять графіків разом', () => {
    let tree: any;
    act(() => {
      tree = create(
        <ProjectAnalytics
          projects={projects}
          tasks={tasks}
          columns={mergeTaskStatusColumns([])}
          scopeLabel="Проєкти"
          wide={false}
          palette={palette}
        />,
      );
    });
    expect(tree.toJSON()).toBeTruthy();
    act(() => { tree.unmount(); });
  });

  it('без проєктів не малює порожню панель із нульовими графіками', () => {
    // Порожня воронка й чотири нульові ряди — це не відповідь «задач немає»,
    // а видимість графіка. Порожній список сам скаже про порожнечу словами.
    let tree: any;
    act(() => {
      tree = create(
        <ProjectAnalytics
          projects={[]}
          tasks={[]}
          columns={mergeTaskStatusColumns([])}
          scopeLabel="Проєкти"
          wide={false}
          palette={palette}
        />,
      );
    });
    expect(tree.toJSON()).toBeNull();
    act(() => { tree.unmount(); });
  });
});
