import {
  ACTIVE_COLUMN_ID,
  DONE_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID,
  REVIEW_COLUMN_ID,
  mergeTaskStatusColumns,
  orderColumnsForList,
  taskColumnId,
  taskStatusColumn,
} from '../utils/taskStatuses';

describe('task statuses', () => {
  it('merges synced custom statuses with the default workflow', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'review', name: 'На перевірці', color: '#EC4899', position: 1, isDone: false },
    ]);

    // Чотири системні + одна кастомна. «На перевірці» стала системною разом
    // із переходом «стоп таймера → перевірка», тож власна колонка з такою ж
    // назвою більше не єдина — вона просто лишається поруч.
    expect(columns).toHaveLength(5);
    expect(columns.map(column => column.id)).toEqual(expect.arrayContaining([
      ACTIVE_COLUMN_ID,
      IN_PROGRESS_COLUMN_ID,
      REVIEW_COLUMN_ID,
      DONE_COLUMN_ID,
      'review',
    ]));
  });

  it('системні колонки йдуть у порядку робочого потоку', () => {
    // Порядок несе сенс: завдання рухається зліва направо, і «На перевірці»
    // мусить стояти МІЖ роботою й готовністю, а не після неї.
    const ids = mergeTaskStatusColumns([]).map(column => column.id);
    expect(ids).toEqual([
      ACTIVE_COLUMN_ID,
      IN_PROGRESS_COLUMN_ID,
      REVIEW_COLUMN_ID,
      DONE_COLUMN_ID,
    ]);
  });

  it('«На перевірці» не опиняється після «Готово» при збігу позицій', () => {
    // Так виглядають дані користувача, який переставляв колонки ДО появи
    // перевірки: його «Готово» збереглося на позиції 2 — тій самій, що дістала
    // нова системна колонка. За алфавітом done стало б попереду review.
    const ids = mergeTaskStatusColumns([
      { id: DONE_COLUMN_ID, name: 'Готово', color: '#10B981', position: 2, isDone: true },
    ]).map(column => column.id);
    expect(ids.indexOf(REVIEW_COLUMN_ID)).toBeLessThan(ids.indexOf(DONE_COLUMN_ID));
  });

  it('у списках «У процесі» стоїть попереду решти', () => {
    // На дошці вона друга, у списку — перша: там важить шлях зліва направо,
    // тут — що робиться просто зараз. Правило спільне для екрана дня й списку
    // завдань саме тому, що копія цієї умови вже одного разу розійшлася.
    const ids = orderColumnsForList(mergeTaskStatusColumns([])).map(c => c.id);
    expect(ids[0]).toBe(IN_PROGRESS_COLUMN_ID);
    expect(ids.slice(1)).toEqual([ACTIVE_COLUMN_ID, REVIEW_COLUMN_ID, DONE_COLUMN_ID]);
  });

  it('порядок списку не мутує вхідний масив', () => {
    const columns = mergeTaskStatusColumns([]);
    const before = columns.map(c => c.id);
    orderColumnsForList(columns);
    expect(columns.map(c => c.id)).toEqual(before);
  });

  it('перевірка не рахується завершенням', () => {
    // isDone керує архівом і фільтрами: помилка тут ховала б завдання, яке
    // насправді ще чекає на приймання.
    const review = mergeTaskStatusColumns([]).find(c => c.id === REVIEW_COLUMN_ID);
    expect(review?.isDone).toBe(false);
  });

  it('resolves custom columns while keeping done state consistent', () => {
    const columns = mergeTaskStatusColumns([
      { id: 'review', name: 'На перевірці', color: '#EC4899', position: 3, isDone: false },
    ]);
    const activeTask = { status: 'active' as const, kanbanColumnId: 'review' };
    const completedTask = { status: 'done' as const, kanbanColumnId: 'review' };

    expect(taskColumnId(activeTask, columns)).toBe('review');
    expect(taskColumnId(completedTask, columns)).toBe(DONE_COLUMN_ID);
    expect(taskStatusColumn(activeTask, columns).name).toBe('На перевірці');
  });
});
