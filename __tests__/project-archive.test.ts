import { setProjectArchived, type ProjectLike as Project } from '../utils/projectUtils';

const base: Project = {
  id: 'p1', name: 'Flowi', color: '#7C3AED', createdAt: '2026-01-01T00:00:00.000Z',
};

describe('setProjectArchived', () => {
  it('ставить archivedAt при архівації', () => {
    const result = setProjectArchived(base, true);
    expect(typeof result.archivedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.archivedAt as string))).toBe(false);
  });

  it('ВИДАЛЯЄ ключ при поверненні з архіву, а не лишає undefined', () => {
    const archived = setProjectArchived(base, true);
    const restored = setProjectArchived(archived, false);
    // Саме наявність ключа, а не його значення: undefined зник би при
    // JSON-серіалізації й приховав би різницю.
    expect(Object.prototype.hasOwnProperty.call(restored, 'archivedAt')).toBe(false);
  });

  it('не чіпає решту полів', () => {
    const restored = setProjectArchived(setProjectArchived(base, true), false);
    expect(restored).toEqual(base);
  });

  it('не мутує вхідний обʼєкт', () => {
    const input = { ...base };
    setProjectArchived(input, true);
    expect(input).toEqual(base);
  });

  it('повторне архівування оновлює позначку часу', () => {
    const first = setProjectArchived({ ...base, archivedAt: '2020-01-01T00:00:00.000Z' }, true);
    expect(first.archivedAt).not.toBe('2020-01-01T00:00:00.000Z');
  });
});
