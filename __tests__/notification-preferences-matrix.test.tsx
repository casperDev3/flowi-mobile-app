/**
 * __tests__/notification-preferences-matrix.test.tsx — матриця «категорія ×
 * канал» (notifications-module.md §4.4, §6.3): події вимкнених модулів
 * сховано, дотик дає рівно той частковий PATCH, який чекає сервер.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

import React from 'react';

import type { PreferencesDoc } from '@/api/notifications';
import { PreferencesMatrix, visibleCategories } from '@/components/notifications/PreferencesMatrix';
import { allTranslations } from '@/store/translations';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLORS = { border: '#ddd', text: '#000', sub: '#666', accent: '#7C3AED', dim: '#eee', card: '#fff' };

function doc(): PreferencesDoc {
  return {
    revision: 1,
    enabled: true,
    push_enabled: true,
    email_enabled: false,
    quiet_hours: { enabled: true, start: '22:00', end: '08:00' },
    digest: { enabled: false, hour: 9 },
    timezone: 'Europe/Kyiv',
    lang: 'uk',
    meeting_lead_minutes: 15,
    channels: ['in_app', 'push', 'email'],
    categories: [
      {
        key: 'tasks_projects',
        label: '',
        channels: { in_app: true, push: true, email: false },
        events: [
          { key: 'task.assigned', label: '', channels: { in_app: true, push: true, email: false }, overridden: false },
          { key: 'task.reminder', label: '', channels: { in_app: true, push: true, email: false }, overridden: false },
        ],
      },
      {
        key: 'meetings_finance',
        label: '',
        channels: { in_app: true, push: true, email: false },
        events: [
          { key: 'meeting.reminder', label: '', channels: { in_app: true, push: true, email: false }, overridden: false },
        ],
      },
      { key: 'training_health', label: '', channels: { in_app: true, push: true, email: false }, events: [] },
    ],
  };
}

describe('visibleCategories', () => {
  it('ховає події вимкнених модулів і категорії без жодної видимої події', () => {
    const cats = visibleCategories(doc(), ['meetings', 'projects']);
    expect(cats.map(c => c.key)).toEqual(['tasks_projects']);
    expect(cats[0].events.map(e => e.key)).toEqual(['task.reminder']);
  });
});

describe('PreferencesMatrix', () => {
  it('дотик по каналу категорії — PATCH категорії; розгорнута подія — PATCH події', () => {
    const onChange = jest.fn();
    let tree: any;
    act(() => {
      tree = create(
        <PreferencesMatrix
          doc={doc()}
          channels={['in_app', 'push']}
          disabledModules={[]}
          tr={allTranslations.uk}
          colors={COLORS}
          onChange={onChange}
        />,
      );
    });
    // Той самий дотик видно і на компоненті, і на хост-вузлі — лишаємо по одному на підпис.
    const checkboxes = () => {
      const seen = new Set<string>();
      return tree.root.findAll((n: any) => n.props.accessibilityRole === 'checkbox' && typeof n.props.onPress === 'function')
        .filter((n: any) => (seen.has(n.props.accessibilityLabel) ? false : (seen.add(n.props.accessibilityLabel), true)));
    };
    // 2 видимі категорії × 2 канали (порожня «Тренування» не малюється).
    expect(checkboxes()).toHaveLength(4);

    const pushOfTasks = checkboxes().find((n: any) => n.props.accessibilityLabel === 'Задачі та проєкти — Push');
    act(() => { pushOfTasks.props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith({ categories: { tasks_projects: { push: false } } });

    const expand = tree.root.findAll((n: any) => n.props.accessibilityRole === 'button'
      && typeof n.props.onPress === 'function'
      && String(n.props.accessibilityLabel).startsWith('Задачі та проєкти:'))[0];
    act(() => { expand.props.onPress(); });
    const eventPush = checkboxes().find((n: any) => n.props.accessibilityLabel === 'Призначення завдання — Push');
    act(() => { eventPush.props.onPress(); });
    expect(onChange).toHaveBeenLastCalledWith({ events: { 'task.assigned': { push: false } } });
  });
});
