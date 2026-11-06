/**
 * Кеші швидкодії (perf/speed-pass): мемо злиття колонок статусів і кеш
 * Intl-форматерів мусять давати рівно той самий результат, що й без них.
 */
import { formatCurrency } from '@/utils/financeUtils';
import {
  mergeTaskStatusColumns,
  personalDisplayColumn,
  scopedTaskStatusColumn,
  type TaskStatusColumn,
} from '@/utils/taskStatuses';

const col = (id: string, name: string, position: number, extra: Partial<TaskStatusColumn> = {}): TaskStatusColumn =>
  ({ id, name, color: '#000', position, isDone: false, ...extra }) as TaskStatusColumn;

describe('scopedTaskStatusColumn / personalDisplayColumn cache', () => {
  const columns: TaskStatusColumn[] = [
    col('st-p1-todo', 'To do', 0, { projectId: 'p1', type: 'todo' }),
    col('st-p1-done', 'Done', 1, { projectId: 'p1', isDone: true, type: 'done' }),
  ];

  it('matches the uncached merge', () => {
    const task = { status: 'active', kanbanColumnId: 'st-p1-done', projectId: 'p1' } as const;
    const scoped = mergeTaskStatusColumns([...columns], 'p1');
    expect(scopedTaskStatusColumn(task as never, columns)).toEqual(scoped[1]);
    // Повторний виклик — той самий результат.
    expect(scopedTaskStatusColumn(task as never, columns)).toEqual(scoped[1]);
    const personal = { status: 'active', kanbanColumnId: undefined, projectId: undefined };
    expect(personalDisplayColumn(personal as never, columns).id)
      .toBe(mergeTaskStatusColumns([...columns]).find(c => !c.isDone)?.id);
  });

  it('a new columns array is not served from the old cache entry', () => {
    const task = { status: 'active', kanbanColumnId: 'st-p1-x', projectId: 'p1' } as const;
    expect(scopedTaskStatusColumn(task as never, columns).id).not.toBe('st-p1-x');
    const next = [...columns, col('st-p1-x', 'Review', 2, { projectId: 'p1', type: 'todo' })];
    expect(scopedTaskStatusColumn(task as never, next).id).toBe('st-p1-x');
  });
});

describe('formatCurrency with cached Intl formatters', () => {
  const fiat = { code: 'UAH', symbol: '₴', kind: 'fiat', decimals: 2 } as const;
  const crypto = { code: 'BTC', symbol: '₿', kind: 'crypto', decimals: 8 } as const;

  it('is identical to toLocaleString output', () => {
    for (const n of [0, 1, 12.5, -38149.5, 38150, 1234567.891]) {
      for (const locale of ['uk-UA', 'en-US']) {
        const digits = Number.isInteger(Math.round(n * 100) / 100) && Math.round(n * 100) % 100 === 0 ? 0 : 2;
        expect(formatCurrency(n, fiat as never, locale)).toBe(
          n.toLocaleString(locale, { style: 'currency', currency: 'UAH', minimumFractionDigits: digits, maximumFractionDigits: digits }),
        );
      }
    }
    expect(formatCurrency(0.00012345, crypto as never, 'en-US'))
      .toBe(`₿ ${(0.00012345).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 })}`);
  });

  it('falls back to the symbol for codes Intl rejects', () => {
    const odd = { code: 'NOT A CODE', symbol: '¤', kind: 'fiat', decimals: 2 } as const;
    expect(formatCurrency(5, odd as never, 'en-US')).toBe('¤5');
  });
});
