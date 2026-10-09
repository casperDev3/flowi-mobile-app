/**
 * components/shared/actionMetrics.ts — міри кнопок дій (ActionBar).
 *
 * Без залежностей від теми/сховища: імпортується й з легких компонентів
 * (шапка картки), яким не можна тягнути AsyncStorage у тести.
 */
import { Atlas } from '@/constants/atlas';

/** Міри дій — однакові на iOS, Android і планшеті. */
export const ACTION = {
  /** Мінімальна ціль дотику (HIG/Material): і кнопки, і іконки. */
  height: Atlas.controlHeight,
  /** Проміжок між діями в рядку й між рядками при переносі. */
  gap: Atlas.space.s100,
  radius: Atlas.radius.large,
  paddingX: 14,
  /** Іконка в кнопці з підписом. */
  icon: 15,
  /** Іконка в IconAction. */
  iconOnly: 17,
  fontSize: 14,
  /** Чип-фільтр нижчий за кнопку, але з hitSlop до 44. */
  chipHeight: 36,
} as const;
