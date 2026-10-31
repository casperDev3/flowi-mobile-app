/**
 * hooks/use-reduce-transparency.ts — «Зменшити прозорість» (iOS: Параметри →
 * Доступність → Дисплей і розмір тексту; веб: prefers-reduced-transparency).
 *
 * Коли увімкнено, скло DS v2.1 (components/ds/Glass.tsx) стає суцільною
 * поверхнею surface.card — без блюру й напівпрозорості.
 *
 * Одна підписка на весь застосунок (useSyncExternalStore), а не по слухачу
 * на кожен виклик useDS(): хук викликають сотні компонентів.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

let current = false;
let started = false;
const subscribers = new Set<() => void>();

function set(next: boolean) {
  if (next === current) return;
  current = next;
  subscribers.forEach(fn => fn());
}

function start() {
  if (started) return;
  started = true;
  try {
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-transparency: reduce)')
        : null;
      if (mq) {
        set(mq.matches);
        mq.addEventListener?.('change', e => set(e.matches));
      }
      return;
    }
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then(v => set(!!v))
      .catch(() => {});
    AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', v => set(!!v));
  } catch {
    // Немає API (Android, тести) — лишаємо скло.
  }
}

function subscribe(fn: () => void) {
  start();
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

const getSnapshot = () => current;
const getServerSnapshot = () => false;

/** true — користувач просить менше прозорості: скло → суцільна поверхня. */
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
