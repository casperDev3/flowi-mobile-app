/** Client-side compatibility declaration for the server sync contract. */
export const SYNC_CONTRACT_VERSION = 1;

export const SYNC_ARRAY_KEYS = [
  'tasks',
  'task_statuses',
  'transactions',
  'time_entries',
  'notes',
  'projects',
  'meetings',
  'health_entries_v2',
  'workouts',
  'exercises',
  'workout_programs',
  'savings_jars',
  'containers',
  'bugs',
  'ideas',
  'health_meds',
  'health_checkups',
  'health_vaccines',
  'health_habits',
  // Нормалізовані з singleton-блобів. Їхні id ПОХІДНІ від природного ключа
  // (код валюти / назва категорії), а не випадкові: інакше два пристрої,
  // додавши офлайн одну й ту саму валюту, згенерували б різні id і після
  // синку отримали б дублікат замість злиття.
  'budget_limits',
  'finance_currencies',
  'finance_balance_adjustments',
  'categories',
] as const;

export type SyncArrayKey = (typeof SYNC_ARRAY_KEYS)[number];

export const SYNC_SINGLETON_KEYS = [
  // Єдиний справжній скаляр — для нього повна заміна коректна за визначенням.
  'finance_primary_currency',
] as const;

export type SyncSingletonKey = (typeof SYNC_SINGLETON_KEYS)[number];

export function assertCompatibleSyncContract(serverVersion: unknown): void {
  // Older servers did not return a version. Accept that during the rolling
  // deployment; once present, an incompatible version must fail before data is
  // applied locally.
  if (serverVersion == null) return;
  if (serverVersion !== SYNC_CONTRACT_VERSION) {
    throw new Error(
      `Unsupported sync contract ${String(serverVersion)}; client supports ${SYNC_CONTRACT_VERSION}`,
    );
  }
}
