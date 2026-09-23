import fs from 'fs';
import path from 'path';

import { BACKUP_KEYS } from '../store/backup-keys';
import { SYNC_ARRAY_KEYS, SYNC_SINGLETON_KEYS } from '../store/sync-contract';

// Keys from ALL_KEYS in app/data.tsx (must all be backed up)
const ALL_KEYS_FROM_DATA = [
  'tasks',
  'task_statuses',
  'transactions',
  'accounts',
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

/**
 * Другий список, який уміє розійтися з контрактом, — ручний експорт/імпорт JSON
 * у `app/data.tsx`. Він НЕ похідний від `BACKUP_KEYS`: це два рукописні мапи
 * «ключ сховища ↔ ключ JSON». Автобекап ключ підхопить, а файл, який
 * користувач зберігає собі, — ні, і дізнається він про це вже після імпорту.
 *
 * Ціна саме для рахунків найвища: транзакція посилається на рахунок по
 * `accountId`. Імпорт без колекції `accounts` лишає операції з посиланням у
 * нікуди — гроші є, а місця, де вони лежать, немає.
 *
 * Мапи не експортуються з `app/data.tsx` (екран тягне expo-модулі), тому
 * читаємо джерело — так само, як `nav-routes-exist` читає дерево маршрутів.
 */
const DATA_SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'data.tsx'), 'utf8');

function mapBody(name: string): string {
  const match = DATA_SRC.match(new RegExp(`const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!match) throw new Error(`${name} не знайдено в app/data.tsx`);
  return match[1];
}

// Ключі, яких у файловому експорті свідомо немає СЬОГОДНІ. Це не схвалення:
// для budget_limits / finance_currencies / finance_balance_adjustments це
// успадкована прогалина (експорт-імпорт втрачає ліміти бюджету й власні
// валюти). Список існує, щоб додавання НОВОГО синхронізованого ключа було
// свідомим рішенням, а не забуттям.
const NOT_IN_JSON_EXPORT: readonly string[] = [
  'budget_limits',
  'finance_currencies',
  'finance_balance_adjustments',
  // Експортується окремим рядком (`payload['categories']`), бо це об'єкт, а не масив.
  'categories',
  // Таймери, що йдуть просто зараз — стан, а не дані; переносити його у файл нема сенсу.
  'active_timers',
  // Метадані фото контейнерів без самих байтів — у файлі вони вказували б на
  // файли, яких на іншому пристрої немає (containers.md §5.2).
  'media_assets',
  // Персональні сесії тренувань розгортає СЕРВЕР із програми групи
  // (training-module.md §4); імпорт у інший акаунт створив би сесії без групи.
  'training_sessions',
];

describe('ручний експорт/імпорт JSON (app/data.tsx)', () => {
  const exportBody = mapBody('EXPORT_KEY_MAP');
  const importBody = mapBody('IMPORT_KEY_MAP');

  it('покриває кожен синхронізований масив, крім явно виключених', () => {
    const missing = SYNC_ARRAY_KEYS
      .filter(key => !NOT_IN_JSON_EXPORT.includes(key))
      .filter(key => !new RegExp(`(^|[\\s,{])${key}:`).test(exportBody));

    expect(missing).toEqual([]);
  });

  it('імпорт приймає назад усе, що вміє віддати експорт', () => {
    const missing = SYNC_ARRAY_KEYS
      .filter(key => !NOT_IN_JSON_EXPORT.includes(key))
      .filter(key => !importBody.includes(`'${key}'`));

    expect(missing).toEqual([]);
  });

  it('рахунки потрапляють і у файл, і назад — інакше імпорт лишає транзакції без рахунку', () => {
    expect(exportBody).toMatch(/(^|[\s,{])accounts:/);
    expect(importBody).toContain("'accounts'");
  });

  it('список виключень не містить ключів, яких немає в контракті', () => {
    const stale = NOT_IN_JSON_EXPORT.filter(
      key => !(SYNC_ARRAY_KEYS as readonly string[]).includes(key),
    );
    expect(stale).toEqual([]);
  });
});
