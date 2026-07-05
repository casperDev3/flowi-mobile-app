import { BACKUP_KEYS } from '../store/backup-keys';

// Keys from ALL_KEYS in app/data.tsx (must all be backed up)
const ALL_KEYS_FROM_DATA = [
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
];

// Required additional keys not in ALL_KEYS display list
const REQUIRED_EXTRA_KEYS = [
  'categories',
  'budget_limits',
  'finance_balance_adjustments',
  'finance_currencies',
  'finance_primary_currency',
  'health_profile',
  'health_reminders',
];

describe('BACKUP_KEYS', () => {
  it('contains all ALL_KEYS storage keys from data.tsx', () => {
    for (const key of ALL_KEYS_FROM_DATA) {
      expect(BACKUP_KEYS).toContain(key);
    }
  });

  it('contains all required additional keys', () => {
    for (const key of REQUIRED_EXTRA_KEYS) {
      expect(BACKUP_KEYS).toContain(key);
    }
  });

  it('has no duplicate keys', () => {
    const keyArray = Array.from(BACKUP_KEYS);
    const unique = new Set(keyArray);
    expect(keyArray.length).toBe(unique.size);
  });

  it('total count matches expected number of keys', () => {
    // 18 from ALL_KEYS + 7 extra = 25
    expect(BACKUP_KEYS.length).toBe(25);
  });
});
