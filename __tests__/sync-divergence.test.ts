/**
 * __tests__/sync-divergence.test.ts
 *
 * Тести на пошук записів, які існують лише на пристрої. Приводом стала
 * реальна втрата: обмін звітував «синхронізовано успішно», відправивши нуль
 * записів, бо черга була порожня — а в сховищі лежали транзакції за два дні.
 */
import { EMPTY_LOCAL_ONLY, findLocalOnly } from '../utils/syncDivergence';

const known = (...keys: string[]) => new Set(keys);

describe('findLocalOnly', () => {
  it('усе відоме серверу — розбіжності немає', () => {
    const report = findLocalOnly(
      [{ collection: 'transactions', keys: ['transactions:a', 'transactions:b'] }],
      known('transactions:a', 'transactions:b'),
    );
    expect(report).toEqual(EMPTY_LOCAL_ONLY);
    expect(report.total).toBe(0);
  });

  it('ловить саме той випадок, що стався: сховище є, черга й ревізії порожні', () => {
    // Обмін у такому стані відправляє нуль записів і завершується «успішно».
    const report = findLocalOnly(
      [{ collection: 'transactions', keys: ['transactions:tx1', 'transactions:tx2'] }],
      known(),
    );
    expect(report.total).toBe(2);
    expect(report.byCollection).toEqual([{ collection: 'transactions', count: 2 }]);
  });

  it('запис у черзі розбіжністю НЕ вважається — він саме зараз їде', () => {
    const report = findLocalOnly(
      [{ collection: 'tasks', keys: ['tasks:t1', 'tasks:t2'] }],
      known('tasks:t1'),          // t1 має ревізію
    );
    expect(report.total).toBe(1);
    expect(report.byCollection).toEqual([{ collection: 'tasks', count: 1 }]);
  });

  it('розбивка за колекціями впорядкована за кількістю', () => {
    const report = findLocalOnly(
      [
        { collection: 'notes', keys: ['notes:n1'] },
        { collection: 'transactions', keys: ['transactions:a', 'transactions:b', 'transactions:c'] },
        { collection: 'tasks', keys: ['tasks:t1', 'tasks:t2'] },
      ],
      known(),
    );
    expect(report.total).toBe(6);
    expect(report.byCollection.map(row => row.collection)).toEqual([
      'transactions', 'tasks', 'notes',
    ]);
  });

  it('дубль у сховищі рахується один раз', () => {
    // Для сервера це ОДИН запис: local_id той самий. Число, яке користувач
    // ніде не побачить, лише лякало б.
    const report = findLocalOnly(
      [{ collection: 'tasks', keys: ['tasks:t1', 'tasks:t1'] }],
      known(),
    );
    expect(report.total).toBe(1);
  });

  it('порожнє сховище розбіжності не дає', () => {
    expect(findLocalOnly([], known()).total).toBe(0);
    expect(findLocalOnly([{ collection: 'tasks', keys: [] }], known()).total).toBe(0);
  });
});
