/**
 * __tests__/task-calendar-meetings.test.tsx — DI-04.
 *
 * Мапа зустрічей будується за ЛОКАЛЬНИМ ключем доби (`meeting.date` у
 * `utils/meetings.ts` — getFullYear/getMonth/getDate), а календар завдань
 * читав її за `toISOString().slice(0, 10)`. На схід від UTC локальна північ
 * в ISO — це ПОПЕРЕДНЯ доба, тож крапка «є зустріч» ставала на день раніше.
 *
 * TZ фіксуємо до імпортів: без цього тест на машині в UTC не відрізнив би
 * правильний ключ від зламаного.
 */
process.env.TZ = 'Europe/Kyiv';

const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v); }),
  removeItem: jest.fn(async (k: string) => { mockStore.delete(k); }),
}));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';

import { TaskCalendarView, type CalendarTask } from '@/components/tasks/TaskCalendarView';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const tr = allTranslations.uk;
const C = { text: '#111', sub: '#666', border: '#DDD', dim: '#EEE', accent: '#7C3AED', sheet: '#fff' };
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

/** Локальна північ — момент, на якому й ламався ISO-ключ. */
const DAY = new Date(2026, 8, 20); // 20 вересня 2026, локально

function renderMonth(meetingsByDate: Record<string, { id: string; title: string }[]>) {
  const nav: any = { span: 'month', viewDate: DAY, weekDay: DAY, setSpan: () => {}, setViewDate: () => {} };
  let tree: any;
  act(() => {
    tree = create(
      <TaskCalendarView<CalendarTask>
        nav={nav}
        tasksByDate={{}}
        tasks={[]}
        meetingsByDate={meetingsByDate}
        projects={[]}
        today={DAY}
        weekdays={WEEKDAYS}
        months={MONTHS}
        getProgress={() => 0}
        isOverdue={() => false}
        onSelectTask={() => {}}
        onToggleTask={() => {}}
        onOpenDay={() => {}}
        colors={C}
        isDark={false}
        tr={tr}
        locale="uk-UA"
      />,
    );
  });
  return tree;
}

/**
 * Пари «число місяця → лічильник зустрічей на цій клітинці».
 * Бейдж зустрічей — індиговий `#6366F1` із текстом 7 pt.
 */
function meetingBadgeByDay(tree: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cell of tree.root.findAllByType(TouchableOpacity)) {
    const badge = cell.findAll((n: any) => n.type === Text
      && n.props.style?.fontSize === 7
      && n.parent?.props?.style?.backgroundColor === '#6366F1');
    if (badge.length === 0) continue;
    const dayText = cell.findAll((n: any) => n.type === Text && n.props.style?.fontSize === 13);
    if (dayText.length === 0) continue;
    out[String(dayText[0].props.children)] = String(badge[0].props.children);
  }
  return out;
}

describe('TaskCalendarView — ключ доби для зустрічей (DI-04)', () => {
  it('лічильник стоїть на тому числі, яким зустріч збережена', () => {
    // До правки клітинка 20-го читала `new Date(2026,8,20).toISOString()`
    // = '2026-09-19' і показувала 1 (зустріч 19-го), а клітинка 19-го —
    // ключ '2026-09-18', тобто нічого. Тобто обидва лічильники їхали на день.
    const tree = renderMonth({
      '2026-09-19': [{ id: 'm1', title: 'Вчора' }],
      '2026-09-20': [{ id: 'm2', title: 'Стендап' }, { id: 'm3', title: 'Ретро' }],
    });
    expect(meetingBadgeByDay(tree)).toEqual({ '19': '1', '20': '2' });
  });

  it('день без зустрічей лічильника не отримує', () => {
    const tree = renderMonth({ '2026-09-20': [{ id: 'm2', title: 'Стендап' }] });
    expect(meetingBadgeByDay(tree)).toEqual({ '20': '1' });
  });
});
