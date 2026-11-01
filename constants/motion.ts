/**
 * constants/motion.ts
 *
 * Централізовані motion-токени для всього додатку.
 * Використовуй через useMotion() (hook) або Motion.* (константи).
 */
import { Easing, FadeInDown } from 'react-native-reanimated';

/**
 * Тривалості підібрані під ЩОДЕННЕ користування, а не під перше враження.
 * Анімація, яка гарно виглядає в демонстрації, стає податком, коли ту саму
 * дію повторюють десятки разів на день: користувач уже знає, що станеться,
 * і чекає на завершення руху, який нічого йому не повідомляє.
 *
 * Пружини задані через час заспокоєння ts ≈ 4/(ζ·√k), де ζ = c/(2·√k).
 * Мета — залишити характер (пружний «поп» проти плавного в’їзду), але
 * стиснути хвіст коливання, бо саме він читається як повільність.
 */
export const Motion = {
  duration: {
    fast:   150,
    normal: 180,
    slow:   260,
  },
  spring: {
    /** ζ≈0.56, ts≈0.40 s — легкий перебіг, швидко сідає. */
    default: { damping: 20, stiffness: 320 },
    /**
     * @deprecated Unslop: пружний перебіг на простому UI читається як іграшковий.
     * Не використовуйте в нових місцях — `default` або `gentle`. Лишився лише
     * для сумісності API.
     */
    bouncy:  { damping: 16, stiffness: 300 },
    /** ζ≈1.0, ts≈0.30 s — критичне демпфування, без перебігу. */
    gentle:  { damping: 27, stiffness: 180 },
  },
  easing: {
    out:   Easing.out(Easing.cubic),
    inOut: Easing.inOut(Easing.quad),
  },
  /** Відстань «підйому» при появі (токен unslop: 6–12 px). */
  riseDistance: 8,
  /** Крок затримки між елементами списку; стагер — максимум на 6 перших. */
  stagger: 40,
} as const;

/**
 * Єдина вхідна анімація екрана: коротке проявлення з підйомом на 8 px.
 *
 * Стандартний FadeInDown стартує з 25 px — для щоденного інтерфейсу це
 * «підстрибування». Тут — ті самі fade + rise, але на токен riseDistance
 * і з кривою Motion.easing.out. Обгортайте в motion.entering(), щоб
 * «Зменшити рух» вимикав її повністю:
 *
 *   entering={motion.entering(riseIn(Math.min(i, 6) * Motion.stagger))}
 */
export function riseIn(delay = 0, duration: number = Motion.duration.slow) {
  return FadeInDown.duration(duration)
    .delay(delay)
    .easing(Motion.easing.out)
    .withInitialValues({ opacity: 0, transform: [{ translateY: Motion.riseDistance }] });
}
