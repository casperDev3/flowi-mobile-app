/**
 * components/finance/layoutStrings.ts — підписи Layout System v2.4 для
 * екранів розділу «Фінанси» та інструментів (рядкові свайпи, масові дії,
 * шапки панелей деталей).
 *
 * Окремий маленький словник, а не store/translations.ts: зони впроваджують
 * кілька агентів одночасно, і спільний файл перекладів став би місцем
 * конфліктів (той самий прийом, що й components/layout-zones/strings.ts).
 * Мова — з useI18n().
 */
import { useI18n } from '@/store/i18n';

const uk = {
  /** Підпис панелі деталей операції (озвучення + рядок «ДЕТАЛІ … ✕»). */
  txDetails: 'Операція',
  subDetails: 'Підписка',
  containerDetails: 'Контейнер',
  feedbackDetails: 'Відгук',
  swipeEdit: 'Змінити',
  swipeDelete: 'Видалити',
  swipeArchive: 'В архів',
  swipeRestore: 'Відновити',
  swipeRead: 'Прочитано',
  swipeUnread: 'Непрочитане',
  bulkDelete: 'Видалити',
  bulkRead: 'Прочитано',
  bulkDeleteTitle: (n: number) => `Видалити ${n} ${plural(n, 'операцію', 'операції', 'операцій')}?`,
  bulkDeleteBody: 'Скасувати можна буде з підказки внизу екрана.',
  bulkDeleted: (n: number) => `Видалено ${n} ${plural(n, 'операцію', 'операції', 'операцій')}`,
  selectHint: 'Довгий дотик — вибрати кілька',
  selectTx: 'Вибрати операцію',
};

type FinanceLayoutStrings = typeof uk;

const en: FinanceLayoutStrings = {
  txDetails: 'Transaction',
  subDetails: 'Subscription',
  containerDetails: 'Container',
  feedbackDetails: 'Feedback',
  swipeEdit: 'Edit',
  swipeDelete: 'Delete',
  swipeArchive: 'Archive',
  swipeRestore: 'Restore',
  swipeRead: 'Read',
  swipeUnread: 'Unread',
  bulkDelete: 'Delete',
  bulkRead: 'Mark read',
  bulkDeleteTitle: (n: number) => `Delete ${n} transaction${n === 1 ? '' : 's'}?`,
  bulkDeleteBody: 'You can undo it from the hint at the bottom of the screen.',
  bulkDeleted: (n: number) => `${n} transaction${n === 1 ? '' : 's'} deleted`,
  selectHint: 'Long-press to select several',
  selectTx: 'Select transaction',
};

/** Українська множина: 1 операцію · 2–4 операції · 5+ операцій (11–14 — «операцій»). */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function financeLayoutStrings(lang: string): FinanceLayoutStrings {
  return lang === 'en' ? en : uk;
}

export function useFinanceLayoutStrings(): FinanceLayoutStrings {
  const { lang } = useI18n();
  return financeLayoutStrings(lang);
}
