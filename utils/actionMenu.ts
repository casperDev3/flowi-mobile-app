/**
 * utils/actionMenu.ts — меню дій із довільною кількістю кнопок, однаково
 * повне на iOS і Android.
 *
 * Чому: `Alert.alert` на Android малює щонайбільше 3 кнопки (neutral /
 * negative / positive) і мовчки викидає решту — меню підзадачі з 8 пунктів
 * чи вибір колонки дошки там просто обрізались.
 *
 * Поведінка:
 *  - iOS (і веб) — рівно той самий `Alert.alert(title, message, buttons)`, що
 *    був у місці виклику: UX не змінюється.
 *  - Android, кнопок ≤ 3 — теж звичайний `Alert.alert`.
 *  - Android, кнопок > 3 — запит іде в глобальний хост
 *    (components/shared/ActionMenuHost.tsx, змонтований у app/_layout.tsx),
 *    що показує список кнопок у RN `Modal`. Якщо хоста немає (тест, екран
 *    поза деревом) — запасний `Alert.alert`, щоб дія хоч якось відкрилась.
 *
 * Хост викликає `onPress` ПІСЛЯ закриття свого `Modal` (див.
 * ACTION_MENU_PRESS_DELAY_MS): дія, що відкриває наступний аркуш, не
 * накладається на ще змонтований перший (CLAUDE.md, NEW-02).
 */
import { Alert, Platform } from 'react-native';

/** Та сама форма, що й кнопка `Alert.alert`. */
export type ActionMenuButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type ActionMenuRequest = {
  title: string;
  message?: string;
  buttons: ActionMenuButton[];
};

/** Скільки кнопок Android-овий `Alert` показує без втрат. */
export const ANDROID_ALERT_MAX_BUTTONS = 3;

/** Затримка `onPress` після закриття меню — Modal встигає зникнути (NEW-02). */
export const ACTION_MENU_PRESS_DELAY_MS = 200;

type Host = (request: ActionMenuRequest) => void;
let host: Host | null = null;

/** Реєстрація глобального хоста; повертає відписку. Лише один хост одночасно. */
export function registerActionMenuHost(fn: Host): () => void {
  host = fn;
  return () => {
    if (host === fn) host = null;
  };
}

/** Чи треба Android-меню замість системного `Alert` для такої кількості кнопок. */
export function needsListMenu(buttonCount: number, os: string = Platform.OS): boolean {
  return os === 'android' && buttonCount > ANDROID_ALERT_MAX_BUTTONS;
}

/**
 * Показати меню дій. Сигнатура — як у `Alert.alert(title, message, buttons)`.
 */
export function showActionMenu(
  title: string,
  message: string | undefined,
  buttons: ActionMenuButton[],
): void {
  if (needsListMenu(buttons.length) && host) {
    host({ title, message, buttons });
    return;
  }
  Alert.alert(title, message, buttons);
}

/** Порядок рядків у меню: кнопки «cancel» — в кінці (як на iOS), решта — як є. */
export function orderMenuButtons(buttons: ActionMenuButton[]): ActionMenuButton[] {
  return [
    ...buttons.filter(b => b.style !== 'cancel'),
    ...buttons.filter(b => b.style === 'cancel'),
  ];
}
