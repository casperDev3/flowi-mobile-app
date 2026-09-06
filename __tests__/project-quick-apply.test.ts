/**
 * __tests__/project-quick-apply.test.ts — швидке створення проєкту з пікера.
 *
 * Перевіряється не вигляд, а те, що їде в сховище: мобільний синк зберігає
 * масив проєктів цілком, тож «зайвий» чи загублений елемент тут — це не
 * косметика, а зниклий проєкт на всіх пристроях.
 */
import { applyProjectQuickAction } from '../utils/projectQuickApply';
import type { ProjectLike as Project } from '../utils/projectUtils';

const live: Project = {
  id: 'p1', name: 'Ремонт', color: '#7C3AED', createdAt: '2026-01-01T00:00:00.000Z',
};
const archived: Project = {
  id: 'p2', name: 'Сайт', color: '#0EA5E9', createdAt: '2026-01-01T00:00:00.000Z',
  archivedAt: '2026-02-01T00:00:00.000Z',
};

/** Фабрика нового запису: у тесті id і момент сталі, щоб було що звіряти. */
const make = (name: string): Project => ({
  id: 'new', name, color: '#10B981', createdAt: '2026-03-01T00:00:00.000Z',
});

describe('applyProjectQuickAction', () => {
  it('порожній рядок не створює нічого й нічого не обирає', () => {
    const result = applyProjectQuickAction([live, archived], '   ', make);
    expect(result).toEqual({ kind: 'none', projects: null, projectId: null });
  });

  it('точний збіг із живим проєктом лише обирає його, не пишучи масив', () => {
    const result = applyProjectQuickAction([live, archived], '  ремонт ', make);
    expect(result.projects).toBeNull();
    expect(result.projectId).toBe('p1');
  });

  it('нова назва додає запис у кінець і одразу його обирає', () => {
    const result = applyProjectQuickAction([live, archived], ' Звіт ', make);
    expect(result.projectId).toBe('new');
    expect(result.projects).toEqual([live, archived, { ...make('Звіт') }]);
  });

  it('збіг з архівним повертає його з архіву, а не створює двійника', () => {
    const result = applyProjectQuickAction([live, archived], 'сайт', make);
    expect(result.projectId).toBe('p2');
    expect(result.projects).toHaveLength(2);
    const restored = result.projects?.find(p => p.id === 'p2');
    // Саме відсутність ключа: undefined зник би при JSON-серіалізації й
    // приховав би різницю між «зняли архів» і «випадково спрацювало».
    expect(Object.prototype.hasOwnProperty.call(restored ?? {}, 'archivedAt')).toBe(false);
    // Решта проєкту (і його історія) лишається тією самою.
    expect(restored).toEqual({ id: 'p2', name: 'Сайт', color: '#0EA5E9', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  it('повернення з архіву не чіпає інші проєкти', () => {
    const result = applyProjectQuickAction([live, archived], 'Сайт', make);
    expect(result.projects?.[0]).toBe(live);
  });

  it('не мутує вхідний масив', () => {
    const input = [live, archived];
    applyProjectQuickAction(input, 'Сайт', make);
    applyProjectQuickAction(input, 'Нове', make);
    expect(input).toEqual([live, archived]);
    expect(archived.archivedAt).toBe('2026-02-01T00:00:00.000Z');
  });
});
