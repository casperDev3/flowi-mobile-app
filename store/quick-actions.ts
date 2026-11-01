/**
 * store/quick-actions.ts — швидкі дії іконки застосунку (довге натискання на
 * іконку на головному екрані iOS / ярлики Android).
 *
 * Поки одна дія: «Нова нотатка» → міні-аркуш швидкого запису поверх
 * поточного екрана (store/note-capture.ts), а не перехід на екран нотаток.
 *
 * Нативна частина — пакет `expo-quick-actions` (6.x для Expo SDK 54). Він
 * підтягується умовно: доки пакет не встановлено (`npm install`) і не
 * зібрано новий нативний білд (EAS), require кидає й усе тут — тихий no-op.
 * Metro дозволяє такий необовʼязковий require в try/catch
 * (allowOptionalDependencies у @expo/metro-config).
 *
 * Назва дії ставиться з JS (`setItems`) мовою застосунку й оновлюється, коли
 * мову змінюють; без входу в акаунт дій немає (аркушу нема куди зберігати).
 */
import { Platform } from 'react-native';

import { requestNoteCapture } from '@/store/note-capture';

export const NOTE_QUICK_ACTION_ID = 'flowi.note.capture';

interface QuickAction {
  id: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  params?: Record<string, string | number | boolean | null | undefined> | null;
}

interface QuickActionsModule {
  initial?: QuickAction;
  setItems: (items?: QuickAction[]) => Promise<void>;
  addListener: (listener: (action: QuickAction) => void) => { remove: () => void };
}

let cached: QuickActionsModule | null | undefined;

function quickActionsModule(): QuickActionsModule | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- необовʼязковий нативний пакет
    const mod = require('expo-quick-actions') as Partial<QuickActionsModule> | undefined;
    if (mod && typeof mod.setItems === 'function' && typeof mod.addListener === 'function') {
      cached = mod as QuickActionsModule;
    }
  } catch {
    // Пакет не встановлено або нативного модуля нема в цьому білді.
  }
  return cached;
}

/** Обробити натиснуту дію. true — дію впізнано. */
export function handleQuickAction(action: Pick<QuickAction, 'id'> | null | undefined): boolean {
  if (!action || action.id !== NOTE_QUICK_ACTION_ID) return false;
  requestNoteCapture();
  return true;
}

/** Виставити дії іконки. `null` — прибрати всі (вихід з акаунта). */
export async function setNoteQuickAction(title: string | null): Promise<void> {
  const mod = quickActionsModule();
  if (!mod) return;
  try {
    await mod.setItems(title ? [{
      id: NOTE_QUICK_ACTION_ID,
      title,
      // iOS: SF Symbol; Android шукає drawable з такою назвою й без нього лишає дію без іконки.
      icon: Platform.OS === 'ios' ? 'symbol:square.and.pencil' : null,
    }] : []);
  } catch (error) {
    if (__DEV__) console.warn('[quick-actions] setItems не вдалося:', error);
  }
}

let initialConsumed = false;

/**
 * Слухати натискання дій. Дію, якою застосунок ЗАПУСТИЛИ (холодний старт),
 * обробляє один раз за процес.
 */
export function subscribeQuickActions(): () => void {
  const mod = quickActionsModule();
  if (!mod) return () => {};
  if (!initialConsumed) {
    initialConsumed = true;
    try { handleQuickAction(mod.initial); } catch { /* немає initial */ }
  }
  const subscription = mod.addListener(action => { handleQuickAction(action); });
  return () => subscription.remove();
}

/** Лише для тестів. */
export function __resetQuickActionsForTests(): void {
  cached = undefined;
  initialConsumed = false;
}
