/**
 * Single source of truth for all storage keys that must be included in backups.
 * Both store/auto-backup.tsx and app/data.tsx reference this list.
 */
export const BACKUP_KEYS = [
  // Core domain data (mirrors ALL_KEYS in app/data.tsx)
  'tasks',
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
  // Additional keys not in the ALL_KEYS display list
  'categories',
  'budget_limits',
  'finance_balance_adjustments',
  'finance_currencies',
  'finance_primary_currency',
  'health_profile',
  'health_reminders',
] as const;

export type BackupKey = (typeof BACKUP_KEYS)[number];
