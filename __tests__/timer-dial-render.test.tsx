/**
 * __tests__/timer-dial-render.test.tsx — кожен циферблат мусить намалюватись.
 *
 * Маніфест перевіряє список, але не те, що всередині: помилка в геометрії SVG
 * (NaN у координаті, невідомий проп) валить рендер уже на пристрої, і побачити
 * її можна лише запустивши застосунок. Тут кожен варіант монтується на трьох
 * позначках часу — включно з нулем і девʼятою годиною, де ламаються ті, хто не
 * передбачив третього розряду.
 */

import React from 'react';

import { TimerDial } from '@/components/time/dials/TimerDial';
import { DIALS } from '@/utils/timerDials';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const COLORS = { text: '#111', sub: '#666', border: '#DDD', accent: '#6366F1' };

const AT = {
  'старт': 0,
  'сорок три секунди': 43,
  'девʼята година': 9 * 3600 + 41 * 60,
};

describe('рендер циферблатів', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-29T12:00:00.000Z').getTime());
  });
  afterEach(() => jest.useRealTimers());

  for (const meta of DIALS) {
    for (const [label, seconds] of Object.entries(AT)) {
      test(`${meta.id} — ${label}`, () => {
        const startedAt = new Date(Date.now() - seconds * 1000).toISOString();
        let tree: any;
        act(() => {
          tree = create(
            <TimerDial dial={meta.id} startedAt={startedAt} size={160} colors={COLORS} />,
          );
        });
        expect(tree.toJSON()).toBeTruthy();

        // Годинник мусить пережити тік, а не лише перший кадр.
        act(() => { jest.advanceTimersByTime(2000); });
        expect(tree.toJSON()).toBeTruthy();

        act(() => { tree.unmount(); });
      });
    }
  }

  test('усі циферблати ділять один інтервал', () => {
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    const trees: any[] = [];
    act(() => {
      for (const meta of DIALS) {
        trees.push(create(
          <TimerDial dial={meta.id} startedAt={startedAt} size={160} colors={COLORS} />,
        ));
      }
    });
    // Десять циферблатів — один тікер: інакше сітка мерехтіла б урозбій.
    expect(jest.getTimerCount()).toBe(1);
    act(() => { for (const t of trees) t.unmount(); });
    expect(jest.getTimerCount()).toBe(0);
  });
});
