/**
 * hooks/use-clock-tick.ts
 *
 * Один тікер на весь застосунок.
 *
 * Час — зовнішнє змінне джерело, тому він і оформлений як зовнішній стор:
 * у проєкті увімкнений React Compiler (app.json → experiments.reactCompiler),
 * а той має право закешувати рендер, який не залежить від жодного стану.
 * Читання Date.now() просто в тілі компонента саме таким рендером і є —
 * годинник тоді оновлюється лише при зміні пропсів. Через useSyncExternalStore
 * мітка часу приходить ЗНАЧЕННЯМ, і залежність стає видимою.
 *
 * Тікер спільний, а не по одному на годинник, із двох причин. Дешевше — це
 * друга; перша в тому, що чотири клітинки в сітці повноекранного режиму мусять
 * перемикати секунду РАЗОМ. Окремі інтервали розходяться на сотні мілісекунд,
 * і сітка починає мерехтіти врозбій.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

let now = Date.now();
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;

function emit(): void {
  now = Date.now();
  for (const listener of listeners) listener();
}

/**
 * Підписка живих годинників. Інтервал заводиться з появою першого й
 * зупиняється разом з останнім: будити застосунок раз на секунду, коли на
 * екрані немає жодного відліку, нема сенсу.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!intervalId) {
    // Знімок міг протухнути, доки підписників не було.
    now = Date.now();
    intervalId = setInterval(emit, 1000);
    // У фоні інтервали не працюють, тож після повернення показане число
    // відстає рівно на час відсутності. Один примусовий перерахунок його
    // наздоганяє; чекати до наступного тіку означало б показати брехню.
    appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') emit();
    });
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    appStateSub?.remove();
    appStateSub = null;
  };
}

/** Годинник стоїть — підписуватись нема на що, і будити його теж. */
function subscribeToNothing(): () => void {
  return () => {};
}

const getNow = () => now;

/**
 * Мітка часу, що оновлюється раз на секунду, поки `running`.
 *
 * Повернене значення ОБОВʼЯЗКОВО треба використати в обчисленні того, що
 * рендериться. Прочитати його й проігнорувати — те саме, що не підписуватись
 * узагалі: рендер знову стає незалежним від часу й застигає.
 */
export function useClockTick(running: boolean): number {
  return useSyncExternalStore(running ? subscribe : subscribeToNothing, getNow, getNow);
}
