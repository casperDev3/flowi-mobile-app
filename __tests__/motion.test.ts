/**
 * __tests__/motion.test.ts
 *
 * Юніт-тест для hooks/use-motion.ts та constants/motion.ts.
 * Перевіряє поведінку dur() та entering() в обох режимах (normal / reduced).
 *
 * Зауважимо: jest.mock() автоматично hoist-ується до верху,
 * тому порядок оголошення відносно import-ів не впливає на виконання.
 */

// ─── Imports ─────────────────────────────────────────────────────────────────
import React, { act } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { Motion } from '@/constants/motion';
import { getReducedMotion, useMotion } from '@/hooks/use-motion';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require('react-test-renderer') as any;

// ─── Мок reanimated ──────────────────────────────────────────────────────────
// Підміняємо useReducedMotion, щоб контролювати reduced-стан у тестах.
// Easing мокується як identity-функції (id), щоб Motion-ініціалізація пройшла.
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: jest.fn(() => false),
  Easing: {
    out:   (f: unknown) => f,
    inOut: (f: unknown) => f,
    cubic: (t: number) => t,
    quad:  (t: number) => t,
  },
}));

// ─── Хелпер для тестування хука ──────────────────────────────────────────────
type MotionResult = ReturnType<typeof useMotion>;
let captured!: MotionResult;

function Probe() {
  captured = useMotion();
  return null;
}

async function renderProbe(): Promise<MotionResult> {
  await act(async () => {
    TestRenderer.create(React.createElement(Probe));
  });
  return captured;
}

// ─── Тести ───────────────────────────────────────────────────────────────────

describe('Motion токени', () => {
  test('duration: fast < normal < slow', () => {
    expect(Motion.duration.fast).toBeLessThan(Motion.duration.normal);
    expect(Motion.duration.normal).toBeLessThan(Motion.duration.slow);
  });

  test('spring пресети мають damping і stiffness', () => {
    expect(Motion.spring.default).toHaveProperty('damping');
    expect(Motion.spring.default).toHaveProperty('stiffness');
    expect(Motion.spring.bouncy).toHaveProperty('damping');
    expect(Motion.spring.gentle).toHaveProperty('stiffness');
  });
});

describe('useMotion — normal mode (reduced=false)', () => {
  beforeEach(() => {
    (useReducedMotion as jest.Mock).mockReturnValue(false);
  });

  test('reduced = false', async () => {
    const m = await renderProbe();
    expect(m.reduced).toBe(false);
  });

  test('dur(d) повертає d', async () => {
    const m = await renderProbe();
    expect(m.dur(250)).toBe(250);
    expect(m.dur(Motion.duration.fast)).toBe(Motion.duration.fast);
    expect(m.dur(0)).toBe(0);
  });

  test('entering(anim) повертає anim', async () => {
    const fakeAnim = { duration: () => ({}) };
    const m = await renderProbe();
    expect(m.entering(fakeAnim)).toBe(fakeAnim);
  });

  test('spring(cfg) повертає cfg без змін', async () => {
    const m = await renderProbe();
    expect(m.spring(Motion.spring.default)).toBe(Motion.spring.default);
  });
});

describe('useMotion — reduced mode (reduced=true)', () => {
  beforeEach(() => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
  });

  test('reduced = true', async () => {
    const m = await renderProbe();
    expect(m.reduced).toBe(true);
  });

  test('dur(d) повертає 0', async () => {
    const m = await renderProbe();
    expect(m.dur(250)).toBe(0);
    expect(m.dur(Motion.duration.slow)).toBe(0);
    expect(m.dur(1000)).toBe(0);
  });

  test('entering(anim) повертає undefined', async () => {
    const fakeAnim = { duration: () => ({}) };
    const m = await renderProbe();
    expect(m.entering(fakeAnim)).toBeUndefined();
  });
});

describe('getReducedMotion — кеш', () => {
  test('повертає boolean (безпечний дефолт)', () => {
    expect(typeof getReducedMotion()).toBe('boolean');
  });

  test('після useMotion() кеш відповідає поточному reduced значенню', async () => {
    (useReducedMotion as jest.Mock).mockReturnValue(true);
    await renderProbe();
    expect(getReducedMotion()).toBe(true);

    (useReducedMotion as jest.Mock).mockReturnValue(false);
    await renderProbe();
    expect(getReducedMotion()).toBe(false);
  });
});
