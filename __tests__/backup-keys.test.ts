import { BACKUP_KEYS } from '../store/backup-keys';
import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from '../store/sync-contract';

// Keys from ALL_KEYS in app/data.tsx (must all be backed up)
const ALL_KEYS_FROM_DATA = [
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
    // 23 масиви + 3 singleton
    expect(BACKUP_KEYS.length).toBe(SYNC_ARRAY_KEYS.length + SYNC_SINGLETON_KEYS.length);
  });

  // Корінь проблеми, яку виправляє розділ 4 плану синхронізації: це були два
  // окремі рукописні списки, і вони розійшлися саме там, де найдорожче —
  // health_profile вважався вартим збереження, але не переносився на новий
  // пристрій. Тепер «зберігається» і «синхронізується» — одна множина.
  it('є рівно множиною синхронізованих ключів — розійтись більше не може', () => {
    expect([...BACKUP_KEYS].sort()).toEqual(
      [...SYNC_ARRAY_KEYS, ...SYNC_SINGLETON_KEYS].sort(),
    );
  });

  it('профіль здоров\'я і нагадування синхронізуються, а не лише бекапляться', () => {
    expect(SYNC_SINGLETON_KEYS).toContain('health_profile');
    expect(SYNC_SINGLETON_KEYS).toContain('health_reminders');
  });
});
