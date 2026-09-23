/**
 * __tests__/timer-registry.test.tsx — реєстр active_timers під чужими записами.
 *
 * Реєстр — синхронізована колекція, тож у ключ пишуть не лише мутації стору:
 * pull синхронізації, відновлення бекапу й очищення даних кладуть туди дані
 * прямо, повз React-стан провайдера. Якщо мутація збирає повний масив зі свого
 * (застарілого) списку, saveSynced віддифить його проти сховища й відправить
 * чужий таймер у deleted — локально і на сервер.
 *
 * Тут навмисно НЕ мокаються ані storage, ані synced-storage: перевіряється саме
 * зв'язка «diff проти сховища ↔ стан провайдера». Мок лише на AsyncStorage.
 */

import React, { useMemo } from 'react';
import { Alert } from 'react-native';

import { saveData } from '@/store/storage';
import { TimerProvider, useTimerContext, type TimerContextValue } from '@/store/timer-context';
import type { OutboxItem } from '@/store/synced-storage';
import type { ActiveTimer } from '@/utils/activeTimers';

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => { mockStore.set(key, value); }),
  removeItem: jest.fn(async (key: string) => { mockStore.delete(key); }),
}));

// Уникаємо TS7016 (відсутні @types/react-test-renderer — відома базова помилка)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { create, act } = require('react-test-renderer') as any;

function seed(key: string, value: unknown): void {
  mockStore.set(key, JSON.stringify(value));
}

function read<T>(key: string, fallback: T): T {
  const raw = mockStore.get(key);
  return raw === undefined ? fallback : (JSON.parse(raw) as T);
}

let api!: TimerContextValue;
let renderedTimer: ActiveTimer | undefined;

function Probe() {
  api = useTimerContext();
  const { getTimerForTask } = api;
  // React Compiler can memoize this lookup from its visible dependencies.
  renderedTimer = useMemo(() => getTimerForTask('t1'), [getTimerForTask]);
  return null;
}

async function mount(): Promise<void> {
  await act(async () => {
    create(
      <TimerProvider>
        <Probe />
      </TimerProvider>,
    );
  });
}

const remote: ActiveTimer = {
  id: 'task:remote',
  taskId: 'remote',
  label: 'Чуже завдання',
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  shift: 'day',
};

beforeEach(() => {
  mockStore.clear();
});

describe('чужі записи в active_timers', () => {
  test('старт власного таймера не стирає таймер, що прилетів синком', async () => {
    await mount();
    expect(api.activeTimers).toHaveLength(0);

    // Так це робить sync-engine: saveData у ключ, повз стан провайдера.
    await act(async () => { await saveData('active_timers', [remote]); });
    expect(api.activeTimers.map(t => t.id)).toEqual(['task:remote']);

    await act(async () => { await api.startAdHocTimer('Своє'); });

    const stored = read<ActiveTimer[]>('active_timers', []);
    expect(stored.map(t => t.id)).toContain('task:remote');
    expect(stored).toHaveLength(2);
    // Найгірше — delete в outbox: він убив би таймер і на іншому пристрої.
    expect(read<OutboxItem[]>('sync_outbox', []).filter(i => i.deleted)).toHaveLength(0);
  });

  test('стоп таймера, вже зупиненого деінде, не дублює сесію', async () => {
    seed('tasks', [{ id: 't1', title: 'Завдання', status: 'active', subtasks: [], timeEntries: [] }]);
    seed('active_timers', [{ ...remote, id: 'task:t1', taskId: 't1' }]);
    await mount();
    expect(api.activeTimers).toHaveLength(1);

    // Інший пристрій зупинив таймер — pull прибрав запис зі сховища.
    await act(async () => { await saveData('active_timers', []); });
    await act(async () => { await api.stopTimerForTask('t1'); });

    const tasks = read<{ timeEntries?: unknown[] }[]>('tasks', []);
    expect(tasks[0].timeEntries ?? []).toHaveLength(0);
    expect(read<unknown[]>('time_entries', [])).toHaveLength(0);
  });

  test('стоп знаходить таймер, якого немає у стані провайдера', async () => {
    seed('tasks', [{ id: 't1', title: 'Завдання', status: 'active', subtasks: [], timeEntries: [] }]);
    await mount();

    // Таймер запустили з іншого пристрою і pull поклав його у сховище.
    await act(async () => {
      await saveData('active_timers', [{ ...remote, id: 'task:t1', taskId: 't1' }]);
    });
    await act(async () => { await api.stopTimerForTask('t1'); });

    expect(read<ActiveTimer[]>('active_timers', [])).toHaveLength(0);
    const tasks = read<{ timeEntries?: unknown[] }[]>('tasks', []);
    expect(tasks[0].timeEntries ?? []).toHaveLength(1);
  });
});

/**
 * Правило колонок з обох боків: автоматика рухає ТІЛЬКИ те, що пересунула сама.
 *
 * На старті це видно одразу (кастомну колонку не чіпаємо), а на стопі —
 * ні: таймер пам'ятає, звідки взяв завдання, і спокуса безумовно повернути
 * його туди виглядає безпечною. Вона не безпечна, бо між стартом і стопом
 * користувач міг перетягнути завдання сам.
 */
describe('колонка завдання під таймером', () => {
  const activeTask = { id: 't1', title: 'Завдання', status: 'active', subtasks: [], timeEntries: [] };

  test('вільний таймер не чіпає ЖОДНОГО завдання — ні колонки, ні сесії', async () => {
    // Саме через це «зупинив трекер часу, а завдання не поїхало на перевірку»:
    // вкладка Час уміла запускати лише таймер БЕЗ taskId, тож чіпати не було
    // чого. Тест закріплює межу: вільний таймер справді нічого не змінює, і
    // прикріплювати завдання мусить екран, а не вгадувати стор.
    seed('tasks', [{ ...activeTask, kanbanColumnId: 'status-active' }]);
    await mount();

    await act(async () => { await api.startAdHocTimer('Читання'); });
    const running = read<{ id: string; taskId?: string; startedAt: string }[]>('active_timers', []);
    expect(running).toHaveLength(1);
    expect(running[0].taskId).toBeUndefined();
    // Частину доби (shift) новий таймер більше не пише — її прибрано з продукту.
    expect(running[0]).not.toHaveProperty('shift');

    // Відсуваємо старт на хвилину назад: сесія нульової тривалості навмисно
    // нікуди не пишеться, і на ній цей тест нічого б не перевірив.
    await act(async () => {
      await saveData('active_timers', [
        { ...running[0], startedAt: new Date(Date.now() - 60_000).toISOString() },
      ]);
    });

    await act(async () => { await api.stopTimer(running[0].id); });

    const stored = read<{ kanbanColumnId?: string; timeEntries?: unknown[] }[]>('tasks', []);
    expect(stored[0].kanbanColumnId).toBe('status-active');
    expect(stored[0].timeEntries ?? []).toHaveLength(0);
    // Час при цьому не губиться — він іде в історію трекера.
    expect(read<unknown[]>('time_entries', [])).toHaveLength(1);
  });

  test('старт веде в «У процесі», стоп — далі, у «На перевірці»', async () => {
    // Колонка не відкочується назад: робота скінчилась, і завдання рухається
    // вперед по дошці, а не повертається туди, звідки його взяли.
    seed('tasks', [{ ...activeTask, kanbanColumnId: 'status-active' }]);
    await mount();

    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Завдання', kanbanColumnId: 'status-active', status: 'active' }); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-in-progress');

    await act(async () => { await api.stopTimerForTask('t1'); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-review');
  });

  test('завдання, вручну покладене в «У процесі», теж їде на перевірку', async () => {
    // Тут правило «рухаємо лише своє» не діє навмисно: значення має стан
    // завдання, а не те, хто його туди поклав.
    seed('tasks', [{ ...activeTask, kanbanColumnId: 'status-in-progress' }]);
    await mount();

    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Завдання', kanbanColumnId: 'status-in-progress', status: 'active' }); });
    await act(async () => { await api.stopTimerForTask('t1'); });

    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-review');
  });

  test('завершене завдання стоп не витягує з «Готово» назад на перевірку', async () => {
    // «Готово» саме зупиняє таймер, і цей запис прилітає ПІСЛЯ того, як екран
    // уже переставив завдання. Безумовний перенос скасував би щойно завершене.
    seed('tasks', [{ ...activeTask, status: 'done', kanbanColumnId: 'status-in-progress' }]);
    await mount();

    await act(async () => {
      await saveData('active_timers', [{ ...remote, id: 'task:t1', taskId: 't1' }]);
    });
    await act(async () => { await api.stopTimerForTask('t1'); });

    const stored = read<{ kanbanColumnId?: string; timeEntries?: unknown[] }[]>('tasks', []);
    expect(stored[0].kanbanColumnId).toBe('status-in-progress');
    // Сесія при цьому записується — правило стосується лише колонки.
    expect(stored[0].timeEntries ?? []).toHaveLength(1);
  });

  test('перенесення у власну колонку під час роботи стопу не заважає', async () => {
    // Правило безумовне: пара «старт → у процесі, стоп → на перевірці» мусить
    // спрацьовувати однаково, звідки б таймер не зупинили і де б завдання не
    // опинилось тим часом.
    seed('tasks', [{ ...activeTask, kanbanColumnId: 'status-active' }]);
    await mount();

    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Завдання', kanbanColumnId: 'status-active', status: 'active' }); });

    await act(async () => {
      const tasks = read<{ id: string }[]>('tasks', []);
      await saveData('tasks', tasks.map(t => t.id === 't1' ? { ...t, kanbanColumnId: 'custom-col' } : t));
    });

    await act(async () => { await api.stopTimerForTask('t1'); });

    const stored = read<{ kanbanColumnId?: string; timeEntries?: unknown[] }[]>('tasks', []);
    expect(stored[0].kanbanColumnId).toBe('status-review');
    expect(stored[0].timeEntries ?? []).toHaveLength(1);
  });

  test('завдання з кастомної колонки старт теж забирає «у процес»', async () => {
    seed('tasks', [{ ...activeTask, kanbanColumnId: 'custom-col' }]);
    await mount();

    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Завдання', kanbanColumnId: 'custom-col', status: 'active' }); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-in-progress');

    await act(async () => { await api.stopTimerForTask('t1'); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-review');
  });

  test('завдання без колонки взагалі проходить той самий шлях', async () => {
    // Найчастіший випадок у реальних даних: kanbanColumnId зʼявився пізніше за
    // самі завдання, і в старих записів його просто немає.
    seed('tasks', [{ ...activeTask }]);
    await mount();

    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Завдання', status: 'active' }); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-in-progress');

    await act(async () => { await api.stopTimerForTask('t1'); });
    expect(read<{ kanbanColumnId?: string }[]>('tasks', [])[0].kanbanColumnId).toBe('status-review');
  });
});

/**
 * «З будь-якого місця» тримається не на дисципліні екранів, а на тому, що всі
 * вони ходять в одну функцію. Екрани зупиняють таймер двома способами:
 * за id таймера (вкладка Час, повноекранний режим) і за id завдання (деталь
 * завдання, підзавдання, автоматична зупинка при «Готово»). Обидва мусять
 * давати ІДЕНТИЧНИЙ результат — інакше «спрацювало тут, не спрацювало там».
 */
describe('зупинка з будь-якого місця', () => {
  const started = new Date(Date.now() - 90_000).toISOString();

  async function runStop(kind: 'byTimerId' | 'byTaskId') {
    mockStore.clear();
    seed('tasks', [{
      id: 't1', title: 'Завдання', status: 'active',
      kanbanColumnId: 'status-in-progress', subtasks: [], timeEntries: [],
    }]);
    seed('active_timers', [{
      id: 'task:t1', taskId: 't1', label: 'Завдання', startedAt: started, shift: 'day',
    }]);
    await mount();
    await act(async () => {
      if (kind === 'byTimerId') await api.stopTimer('task:t1');
      else await api.stopTimerForTask('t1');
    });
    const tasks = read<{ kanbanColumnId?: string; timeEntries?: { duration: number }[] }[]>('tasks', []);
    return {
      column: tasks[0].kanbanColumnId,
      sessions: (tasks[0].timeEntries ?? []).length,
      mirrored: read<unknown[]>('time_entries', []).length,
      registry: read<unknown[]>('active_timers', []).length,
    };
  }

  it('за id таймера і за id завдання результат однаковий', async () => {
    const viaTimer = await runStop('byTimerId');
    const viaTask = await runStop('byTaskId');
    expect(viaTimer).toEqual(viaTask);
  });

  it('обидва шляхи доводять завдання до «На перевірці»', async () => {
    for (const kind of ['byTimerId', 'byTaskId'] as const) {
      const result = await runStop(kind);
      expect(result.column).toBe('status-review');
      expect(result.sessions).toBe(1);
      expect(result.mirrored).toBe(1);
      expect(result.registry).toBe(0);
    }
  });
});


describe('TIMER-01: reactive task timer and project workflow', () => {
  test('memoized detail observes start and stop without reopening the task', async () => {
    seed('tasks', [{ id: 't1', title: 'Task', status: 'active' }]);
    await mount();
    expect(renderedTimer).toBeUndefined();
    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Task', status: 'active' }); });
    expect(renderedTimer?.taskId).toBe('t1');
    await act(async () => { await api.stopTimerForTask('t1'); });
    expect(renderedTimer).toBeUndefined();
  });

  beforeEach(() => { jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });

  test.each([true, false])('project start/stop use its own columns (review exists: %s)', async (hasReview) => {
    seed('tasks', [{ id: 't1', title: 'Task', status: 'active', projectId: 'p1' }]);
    seed('task_statuses', [
      { id: 'p-todo', name: 'Todo', position: 0, isDone: false, projectId: 'p1', type: 'todo' },
      { id: 'p-progress', name: 'Doing', position: 1, isDone: false, projectId: 'p1', type: 'in_progress' },
      ...(hasReview ? [{ id: 'p-review', name: 'Review', position: 2, isDone: false, projectId: 'p1', sourceStatusId: 'status-review', type: 'todo' }] : []),
      { id: 'other-review', name: 'Review', position: 2, isDone: false, projectId: 'p2', sourceStatusId: 'status-review' },
    ]);
    await mount();
    await act(async () => { await api.startTaskTimer({ id: 't1', title: 'Task', status: 'active', projectId: 'p1' }); });
    expect(read<any[]>('tasks', [])[0].kanbanColumnId).toBe('p-progress');
    await act(async () => { await api.stopTimerForTask('t1'); });
    const review = read<any[]>('task_statuses', []).find(c => c.projectId === 'p1' && c.sourceStatusId === 'status-review');
    const task = read<any[]>('tasks', [])[0];
    if (hasReview) expect(task.kanbanColumnId).toBe(review.id);
    else {
      expect(task.kanbanColumnId).toBe('p-progress');
      expect(review).toBeUndefined();
      expect(Alert.alert).toHaveBeenCalled();
    }
    expect(task.timeEntries).toHaveLength(1);
    expect(api.activeTimers).toHaveLength(0);
    await act(async () => { await api.startTaskTimer(task); await api.stopTimerForTask('t1'); });
    expect(read<any[]>('task_statuses', []).filter(c => c.projectId === 'p1' && c.sourceStatusId === 'status-review')).toHaveLength(hasReview ? 1 : 0);
  });
});
