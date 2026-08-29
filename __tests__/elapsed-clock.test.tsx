/**
 * __tests__/elapsed-clock.test.tsx — годинник мусить цокати сам.
 *
 * Історія бага, який це ловить: годинник читав Date.now() під час рендера і
 * тримав стан, значення якого ніде не використовував. З увімкненим React
 * Compiler (app.json → experiments.reactCompiler) такий рендер вважається
 * незалежним від стану, тож перемальовування повертало закешований елемент, і
 * число застигало до наступної зміни пропсів.
 *
 * ВАЖЛИВО про межі цього тесту: jest збирає код БЕЗ React Compiler, тож саме
 * кешування він відтворити не може. Тут перевіряється те, що перевірити
 * можна — механіка тікера: мітка часу приходить у `seconds` аргументом,
 * інтервал один на всі годинники, і він зникає разом з останнім із них.
 * Гарантія «рендер чистий» тримається на сигнатурі `seconds(now)`.
 */

import React from 'react';

import { ElapsedClock } from '@/components/tasks/ElapsedClock';

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

const START = new Date('2026-08-29T10:00:00.000Z').toISOString();

function elapsed(now: number): number {
  return Math.max(0, Math.floor((now - new Date(START).getTime()) / 1000));
}

function textOf(tree: any): string {
  return tree.root.findByType('Text' as any).props.children;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(START).getTime());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ElapsedClock', () => {
  test('число росте саме по собі, без перемальовування ззовні', () => {
    let tree: any;
    act(() => {
      tree = create(<ElapsedClock running seconds={elapsed} format={String} />);
    });
    expect(textOf(tree)).toBe('0');

    // Ніхто не чіпає пропси й не оновлює батька — рухається лише годинник.
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(textOf(tree)).toBe('3');

    act(() => { tree.unmount(); });
  });

  test('мітка часу приходить аргументом, а не читається з Date.now()', () => {
    const seconds = jest.fn(elapsed);
    let tree: any;
    act(() => {
      tree = create(<ElapsedClock running seconds={seconds} format={String} />);
    });

    act(() => { jest.advanceTimersByTime(1000); });

    // Кожен виклик отримав конкретний момент; саме ця залежність і робить
    // рендер таким, що його не можна закешувати.
    expect(seconds).toHaveBeenCalled();
    for (const [arg] of seconds.mock.calls) {
      expect(typeof arg).toBe('number');
      expect(arg).toBeGreaterThan(0);
    }

    act(() => { tree.unmount(); });
  });

  test('зупинений годинник не заводить інтервалу', () => {
    let tree: any;
    act(() => {
      tree = create(<ElapsedClock running={false} seconds={() => 42} format={String} />);
    });
    expect(textOf(tree)).toBe('42');
    expect(jest.getTimerCount()).toBe(0);

    act(() => { tree.unmount(); });
  });

  test('усі годинники ділять один інтервал, і він зникає з останнім', () => {
    let a: any;
    let b: any;
    act(() => {
      a = create(<ElapsedClock running seconds={elapsed} format={String} />);
      b = create(<ElapsedClock running seconds={elapsed} format={String} />);
    });
    // Чотири клітинки в сітці fullscreen мусять перемикати секунду разом, а не
    // з розбігом — тому тікер один, а не по одному на годинник.
    expect(jest.getTimerCount()).toBe(1);

    act(() => { a.unmount(); });
    expect(jest.getTimerCount()).toBe(1);

    act(() => { b.unmount(); });
    expect(jest.getTimerCount()).toBe(0);
  });
});
