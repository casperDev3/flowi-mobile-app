/**
 * utils/budgetScope.ts — «чиї це гроші»: Всі / Особисті / Проєктні.
 *
 * Операція з `projectId` лишається в ТОМУ САМОМУ потоці транзакцій, що й
 * особиста: окремої колекції «витрат проєкту» немає й не буде — це той самий
 * гаманець, інший ракурс (WORKSPACE_PROJECTS_CONTRACT §3 «Належність»).
 * Саме тому фільтр — це погляд, а не модель даних: він нічого не переносить,
 * не ховає з синхронізації і не змінює жодного запису.
 *
 * Чому це окремий файл, а не поле екрана бюджету: той самий перемикач потрібен
 * і «Фінансам», і бюджету, і будь-якому звіту, а правило «що вважати
 * особистим» мусить бути ОДНЕ. Копія умови `!tx.projectId` у двох екранах
 * розійшлася б на першому ж уточненні (архівний проєкт? чужий проєкт?).
 *
 * Модуль навмисно чистий — без AsyncStorage: інакше його не можна було б
 * імпортувати з тестів утиліт (та сама причина, що в utils/recordIds.ts).
 * Читає й пише значення екран, ключем `MONEY_SCOPE_KEY`.
 */

/** Чиї гроші показуємо. */
export type MoneyScope = 'all' | 'personal' | 'project';

/** Порядок у перемикачі — він же порядок у UI. */
export const MONEY_SCOPES: readonly MoneyScope[] = ['all', 'personal', 'project'];

/**
 * Значення за замовчуванням — «Всі».
 *
 * Не «Особисті»: фільтр, що за замовчуванням ХОВАЄ частину грошей, виглядає
 * як зникла витрата, а не як обраний ракурс.
 */
export const DEFAULT_MONEY_SCOPE: MoneyScope = 'all';

/**
 * Ключ AsyncStorage. Локальний і НЕ синхронізований: це стан погляду на цьому
 * пристрої, а не дані. Синхронізувати його означало б перемикати ракурс на
 * телефоні тому, що хтось відкрив звіт на планшеті.
 */
export const MONEY_SCOPE_KEY = 'finance_money_scope';

export function normalizeMoneyScope(value: unknown): MoneyScope {
  return (MONEY_SCOPES as readonly string[]).includes(value as string)
    ? (value as MoneyScope)
    : DEFAULT_MONEY_SCOPE;
}

/** Мінімум, потрібний, щоб визначити належність операції. */
export interface ScopedRecord {
  projectId?: string | null;
}

export function matchesMoneyScope(record: ScopedRecord, scope: MoneyScope): boolean {
  if (scope === 'all') return true;
  // Порожній рядок — теж «немає проєкту»: саме так виглядає запис, у якого
  // проєкт колись зняли формою, а не видаленням поля.
  const hasProject = typeof record.projectId === 'string' && record.projectId.length > 0;
  return scope === 'project' ? hasProject : !hasProject;
}

/**
 * Той самий масив (а не копія) для 'all': фільтр не має ламати мемоізацію
 * там, де він нічого не робить, — інакше кожен рендер віддавав би новий
 * масив і перераховував усі підсумки екрана.
 */
export function filterByMoneyScope<T extends ScopedRecord>(
  records: readonly T[],
  scope: MoneyScope,
): readonly T[] {
  if (scope === 'all') return records;
  return records.filter(record => matchesMoneyScope(record, scope));
}
