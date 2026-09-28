import { useSyncExternalStore } from "react";
let recording = false;
const listeners = new Set<() => void>();
export function setAdvertisingRecording(value: boolean) {
  recording = value;
  listeners.forEach((fn) => fn());
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export function useAdvertisingRecording() {
  return useSyncExternalStore(
    subscribe,
    () => recording,
    () => false,
  );
}
