/**
 * utils/budgetUtils.ts — що бюджет НЕ порахував.
 *
 * Ліміт задається в основній валюті, а витрати тепер бувають у будь-якій:
 * після появи рахунків картка в доларах — звичайна річ. Додати 120 $ до
 * гривневого ліміту чесно неможливо, бо курсів у застосунку ще немає.
 *
 * Тому екран не вигадує число, а показує те, чого не врахував. Це різниця між
 * «ліміт зелений» і «ліміт зелений, але поруч є 120 $, яких я не бачу» —
 * перше бреше, друге ні.
 *
 * Коли зʼявляться курси, ці суми просто перестануть бути «неврахованими» й
 * увіллються в основний підрахунок; сама функція тоді зникне.
 */
import { accountById } from './accounts';
import { isSameMonth } from './dateUtils';
import type { Transaction } from './financeUtils';
import type { Account } from './accounts';

/** Категорія → код валюти → сума витрат, що не потрапили в ліміт. */
export type UncountedSpend = Record<string, Record<string, number>>;

/**
 * У якій валюті бюджет має рахувати операцію.
 *
 * Свідомо НЕ `resolveTxCurrency`: та підставляє 'UAH', коли валюти взяти
 * нізвідки, — розумний дефолт для гаманця, але не для бюджету. Бюджет звіряє
 * валюту операції з основною, тож будь-який дефолт тут — це вирок:
 *   • для користувача з основною не гривнею UAH-дефолт викидає з бюджету геть
 *     усі записи без рахунку, і екран показує самі нулі;
 *   • для гривневого — навпаки, оголошує гривнями суми з рахунку, який ще не
 *     доїхав синком, і додає долари до ліміту за номіналом.
 *
 * Тому «невідомо» тут означає «та сама валюта, що й ліміт»: рівно так екран
 * поводився до появи рахунків, коли поле currency було порожнім у всіх старих
 * записів. Щойно рахунок зʼявиться, істину скаже він.
 */
export function budgetTxCurrency(
  tx: Transaction,
  accounts: Account[],
  baseCurrency: string,
): string {
  const account = accountById(accounts, tx.accountId);
  if (account?.currency) return account.currency;
  // Успадковане поле: лишилося в записах, створених до появи рахунків.
  if (tx.currency) return tx.currency;
  return baseCurrency;
}

export function uncountedSpendByCategory(
  transactions: Transaction[],
  accounts: Account[],
  month: Date,
  baseCurrency: string,
): UncountedSpend {
  // Object.create(null), а не {}: ключ тут — назва категорії, яку набрав
  // користувач. Для '__proto__' звичайний літерал не створює власного поля, а
  // ПІДМІНЮЄ прототип, і сума потім лягає просто в Object.prototype — зайве
  // поле дістається кожному обʼєкту в застосунку. Для 'constructor' гілка
  // «поле вже є» спрацьовує на успадкованому значенні, і категорія разом із
  // сумою зникає зі звіту.
  const out: UncountedSpend = Object.create(null);
  for (const tx of transactions) {
    // Строге порівняння з 'expense', а не «все, що не дохід»: переказ між
    // своїми рахунками витратою не є в жодній валюті, і згадка про нього тут
    // лише збивала б з пантелику.
    if (tx.type !== 'expense') continue;
    const at = new Date(tx.date);
    // Бита дата не має тихо потрапляти в підсумок «неврахованого»: там вона
    // виглядала б як реальні гроші, яких насправді немає в цьому місяці.
    if (Number.isNaN(at.getTime()) || !isSameMonth(at, month)) continue;
    const code = budgetTxCurrency(tx, accounts, baseCurrency);
    if (code === baseCurrency) continue;
    const category = tx.category || '';
    if (!out[category]) out[category] = Object.create(null);
    out[category][code] = (out[category][code] ?? 0) + tx.amount;
  }
  return out;
}

/**
 * Підпис на кшталт «120 $ · 45 €». Порядок — за спаданням суми: найбільша
 * неврахована валюта найважливіша, і саме її треба побачити першою.
 *
 * `locale` — параметр, а не константа: підпис стоїть посеред фрази з i18n, і
 * зашита 'uk-UA' розділяла б тисячі по-українськи в англійському інтерфейсі.
 */
export function formatUncounted(
  perCurrency: Record<string, number> | undefined,
  symbolFor: (code: string) => string,
  locale: string,
): string {
  if (!perCurrency) return '';
  return Object.entries(perCurrency)
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1])
    .map(([code, amount]) => `${Math.round(amount).toLocaleString(locale)} ${symbolFor(code)}`)
    .join(' · ');
}
