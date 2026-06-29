// Безпечний генератор UUID v4 для RN/Hermes.
// Hermes не має crypto.randomUUID; підключаємо полефіл getRandomValues,
// і будуємо v4 вручну з безпечним fallback на Math.random (для не-секретних id).
import 'react-native-get-random-values';

export function uuid(): string {
  const c: any = (globalThis as any).crypto;

  // 1) Найкращий шлях — нативний randomUUID, якщо доступний
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID(); } catch {}
  }

  // 2) Будуємо v4 з 16 випадкових байтів
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    // 3) Fallback (не криптографічний, прийнятний для local_id/device_id)
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // версія 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // варіант 10

  const h: string[] = [];
  for (let i = 0; i < 16; i++) h.push(bytes[i].toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}
