/**
 * components/finance/sheetHandoff.ts — передача керування між двома модалками.
 *
 * NAT-02 (P0). Тап «+ Новий рахунок» усередині форми операції робив
 * `setShowAdd(false); openAccountForm(null);` — два RN `Modal` мінялись в
 * ОДНОМУ тіку. На iOS обидві модалки показує той самий кореневий
 * view-controller (`RCTModalHostViewComponentView.mm:134-140` —
 * `[[self reactViewController] presentViewController:…]`), а перший аркуш у
 * цей момент ЩЕ ПРЕЗЕНТОВАНИЙ: `SheetModal` тримає його змонтованим 150 мс
 * заради exit-анімації. UIKit відмовляє в презентації другого, але RN уже
 * записав собі `_isPresented = YES` — лишається порожній модальний шар, що
 * з'їдає всі дотики. Екран Фінансів переставав реагувати НАЗАВЖДИ: ані
 * «Додати», ані FAB, ані шапка, ані перемикач «Доходи»; перехід на іншу
 * вкладку не лікував, лікував лише перезапуск.
 *
 * Тому наступна модалка відкривається не в тому ж тіку, а після того, як
 * попередня СПРАВДІ зникла. Джерел закриття два, і чекати доводиться різне:
 *
 *   • `SheetModal` повідомляє про закриття сам — `onClose` приходить уже
 *     після exit-анімації, у тому ж коміті, у якому аркуш відмонтовується.
 *     Лишається пропустити один кадр, щоб коміт із `dismissViewController`
 *     встиг доїхати до UIKit: `createSheetHandoff()` + `release()`.
 *
 *   • Звичайний `Modal` з `animationType="fade"` (деталь операції, меню «…»)
 *     про своє зникнення не повідомляє ніяк: `onDismiss` у RN — лише iOS
 *     (`Libraries/Modal/Modal.js:314-322`), тобто покладатись на нього не
 *     можна. Для них чекаємо час анімації: `openAfterModalExit()`.
 *
 * Модуль навмисно не знає ні про React, ні про конкретні аркуші: усе, що він
 * робить, — відкладає ОДИН колбек. Це дає тести без рендера і той самий
 * прийом для будь-якої іншої пари аркушів.
 */

/** Що робити, коли попередня модалка зникла (зазвичай — відкрити наступну). */
export type SheetOpener = () => void;

/** Як саме відкласти виклик. Підмінюється в тестах. */
export type Scheduler = (run: () => void) => void;

/**
 * Зникання модалки з `animationType="fade"`/"slide" на iOS: UIKit-перехід
 * (~0.25 с) плюс запас на коміт. Менше — і презентація наступної модалки
 * знову впаде в «уже презентує».
 */
export const MODAL_EXIT_MS = 320;

/**
 * Один кадр. `requestAnimationFrame` тут кращий за `setTimeout(0)`: потрібна
 * саме межа кадру, після якої RN уже віддав поточний коміт нативній стороні.
 */
export const afterFrame: Scheduler = run => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => run());
  else setTimeout(run, 0);
};

/** Пауза на зникання анімованої модалки. */
export const afterModalExit: Scheduler = run => {
  setTimeout(run, MODAL_EXIT_MS);
};

/**
 * Відкрити наступну модалку після того, як попередня (анімована) зникне.
 * Пару «закрити + відкрити» пишемо саме так, а не двома викликами підряд.
 */
export function openAfterModalExit(close: () => void, open: SheetOpener): void {
  close();
  afterModalExit(open);
}

export interface SheetHandoff {
  /** Поставити наступний аркуш у чергу. Другий виклик заміщає перший. */
  queue(open: SheetOpener): void;
  /** Чи чекає хтось на відкриття (напр. чернетку форми тоді не скидаємо). */
  isPending(): boolean;
  /** Попередній аркуш зник — відкрити наступний (через відкладач). */
  release(): void;
  /** Забути чергу: аркуш закрили без передачі керування. */
  cancel(): void;
}

export function createSheetHandoff(schedule: Scheduler = afterFrame): SheetHandoff {
  let pending: SheetOpener | null = null;
  return {
    queue(open) { pending = open; },
    isPending() { return pending !== null; },
    release() {
      const open = pending;
      pending = null;
      if (open) schedule(open);
    },
    cancel() { pending = null; },
  };
}
