/**
 * __tests__/dial-smooth.test.ts — кому дістається плавний хід і як він
 * тримається справжнього годинника.
 */
import { SMOOTH_MIN_DIAL, shouldSmoothDial, smoothPhaseAnchor } from '@/utils/dialSmooth';

describe('кому плавність', () => {
  const base = { dialSize: 400, reduced: false };

  test('великий циферблат — так', () => {
    expect(shouldSmoothDial(base)).toBe(true);
  });

  test('двоє великих у сітці теж рухаються плавно', () => {
    // На iPad із двома таймерами кожен циферблат більший за 500pt: плавність
    // там читається, і відмовляти їй лише через те, що таймерів двоє, підстав
    // немає. Обмежує розмір, а не кількість.
    expect(shouldSmoothDial({ ...base, dialSize: 531 })).toBe(true);
  });

  test('дрібний — ні, навіть якщо він один на екрані', () => {
    expect(shouldSmoothDial({ ...base, dialSize: SMOOTH_MIN_DIAL - 1 })).toBe(false);
    expect(shouldSmoothDial({ ...base, dialSize: SMOOTH_MIN_DIAL })).toBe(true);
  });

  test('Reduce Motion переважає все', () => {
    expect(shouldSmoothDial({ ...base, reduced: true })).toBe(false);
  });

  test('нульове полотно нічого не плавнить', () => {
    // Порожній екран приходить сюди саме так: розкладка віддає нульовий розмір,
    // і окремої перевірки на «немає таймерів» більше не потрібно.
    expect(shouldSmoothDial({ ...base, dialSize: 0 })).toBe(false);
  });
});

describe('привʼязка фази', () => {
  const start = '2026-08-29T12:00:00.000Z';
  const t0 = Date.parse(start);

  test('рівно на секунді — фаза з нуля, повна секунда попереду', () => {
    expect(smoothPhaseAnchor(start, t0 + 5000)).toEqual({ from: 0, duration: 1000 });
  });

  test('посеред секунди — стартуємо з середини й добігаємо залишок', () => {
    // Без цього стрілка щосекунди сіпалась би назад у нуль.
    expect(smoothPhaseAnchor(start, t0 + 5250)).toEqual({ from: 0.25, duration: 750 });
  });

  test('похибка не накопичується: та сама фаза через годину', () => {
    const early = smoothPhaseAnchor(start, t0 + 250);
    const late = smoothPhaseAnchor(start, t0 + 3600_000 + 250);
    expect(late).toEqual(early);
  });

  test('час до старту не дає відʼємної фази', () => {
    expect(smoothPhaseAnchor(start, t0 - 5000)).toEqual({ from: 0, duration: 1000 });
  });

  test('зіпсована мітка не валить анімацію', () => {
    const a = smoothPhaseAnchor('не дата', t0);
    expect(a.from).toBe(0);
    expect(a.duration).toBe(1000);
  });
});
