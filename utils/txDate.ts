/**
 * utils/txDate.ts — дата операції з вибраного дня (форма Фінансів і бюджету
 * проєкту). Дзеркало веб transaction-form.tsx / project-budget.tsx.
 *
 * Людина обирає ЛОКАЛЬНИЙ день 'YYYY-MM-DD', а зберігається ISO-момент:
 *  - нова операція — цей день о поточній годині (те саме правило dateKeyAtTime,
 *    що й у «Оплачено»: інакше всі операції дня злиплись би в один момент);
 *  - правка — цей день о годині ОРИГІНАЛУ; день не змінився — рядок дати
 *    лишається байт-у-байт тим самим, щоб правка суми не породжувала зайвий
 *    запис дати в синк.
 */
import { dateKeyAtTime, dateKeyOf, isDateKey } from '@/utils/subscriptions';

/** Локальний день ISO-моменту; биті дати — сьогодні. */
export function txDayKey(iso: string | undefined, now: Date = new Date()): string {
  // Легасі-дата без часу ('YYYY-MM-DD') — це вже локальний день. new Date()
  // читає її як північ UTC, і на захід від UTC день з'їжджав на попередній.
  if (iso && isDateKey(iso)) return iso;
  const d = iso ? new Date(iso) : now;
  return dateKeyOf(Number.isNaN(d.getTime()) ? now : d);
}

/**
 * День, з яким зберігати НОВУ операцію: обраний людиною — як є; не чіпаний
 * (стоїть типове «сьогодні» з моменту відкриття) — сьогодні на момент
 * збереження. Інакше форма, лишена відкритою за північ, писала б учорашній
 * день о 00:0x.
 */
export function txSaveDayKey(selected: string, picked: boolean, now: Date = new Date()): string {
  return picked && isDateKey(selected) ? selected : txDayKey(undefined, now);
}

/**
 * ISO-дата операції для обраного дня.
 * `original` — збережена дата при правці; без неї — нова операція.
 */
export function txDateForDayKey(dateKey: string, original?: string, now: Date = new Date()): string {
  if (original) {
    const base = new Date(original);
    if (!Number.isNaN(base.getTime())) {
      if (!isDateKey(dateKey) || txDayKey(original) === dateKey) return original;
      return dateKeyAtTime(dateKey, base);
    }
  }
  return dateKeyAtTime(dateKey, now);
}
